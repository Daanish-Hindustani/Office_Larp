import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { multiplayerMiddleware } from "../server/multiplayer.mjs";

const eventually = async (fn) => {
  for (let i = 0; i < 100; i++) {
    if (fn()) return;
    await new Promise((r) => setTimeout(r, 20));
  }
  assert.fail("Expected server event did not arrive");
};
test("authenticated multiplayer persists accounts, isolates private messages, validates updates and revokes sessions", async () => {
  const dir = await mkdtemp(join(tmpdir(), "office-api-"));
  let api = multiplayerMiddleware({ file: join(dir, "office.sqlite") });
  const server = createServer((req, res) =>
    api(req, res, () => res.writeHead(404).end()),
  );
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = async (path, body, cookie = "", headers = {}) => {
    const response = await fetch(base + path, {
      signal: AbortSignal.timeout(10000),
      method: body === undefined ? "GET" : "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookie,
        ...headers,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });

    return {
      status: response.status,
      cookie: response.headers.get("set-cookie")?.split(";")[0],
      data: await response.json(),
    };
  };
  const streams = [];
  const connect = async (account) => {
    const clientId = randomUUID();
    const controller = new AbortController();
    const events = [];
    const response = await fetch(
      `${base}/api/world/events?client=${clientId}`,
      { headers: { Cookie: account.cookie }, signal: controller.signal },
    );
    assert.equal(response.status, 200);
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    void (async () => {
      let buffer = "";
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let split;
          while ((split = buffer.indexOf("\n\n")) !== -1) {
            const block = buffer.slice(0, split);
            buffer = buffer.slice(split + 2);
            const [type, data] = block.split("\n");
            if (type && data)
              events.push({
                type: type.slice(7),
                data: JSON.parse(data.slice(6)),
              });
          }
        }
      } catch {}
    })();
    const stream = {
      clientId,
      events,
      controller,
      action: (body) =>
        request("/api/world/action", { ...body, clientId }, account.cookie),
    };
    streams.push(stream);
    return stream;
  };
  try {
    assert.equal((await request("/api/world/action", {})).status, 401);
    assert.equal((await request("/api/auth/me")).data.user, null);
    assert.equal(
      (
        await request("/api/auth/register", {
          username: "x",
          name: "Bad",
        })
      ).status,
      400,
    );
    const alice = await request("/api/auth/register", {
      username: "alice",
      name: "Alice",
    });
    const bob = await request("/api/auth/register", {
      username: "bob",
      name: "Bob",
    });
    const eve = await request("/api/auth/register", {
      username: "eve",
      name: "Eve",
    });
    assert.equal(alice.status, 201);
    assert.ok(alice.cookie);
    assert.equal(
      (
        await request("/api/auth/register", {
          username: "alice",
          name: "Alice",
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await request("/api/auth/login", {
          username: "alice",
        })
      ).status,
      200,
    );
    assert.equal(
      (await request("/api/auth/me", undefined, alice.cookie)).data.user.id,
      alice.data.user.id,
    );
    const a = await connect(alice),
      b = await connect(bob),
      e = await connect(eve);
    await eventually(() =>
      a.events.some((x) => x.type === "presence" && x.data.length === 3),
    );
    assert.equal(
      (
        await b.action({
          type: "move",
          room: "studio",
          x: 50,
          y: 60,
          direction: "left",
          moving: true,
        })
      ).status,
      200,
    );
    await eventually(() =>
      a.events.some(
        (x) =>
          x.type === "presence" &&
          x.data.some((p) => p.name === "Bob" && p.x === 50 && p.moving),
      ),
    );
    assert.equal(
      (
        await a.action({
          type: "move",
          room: "studio",
          x: -1,
          y: 1,
          direction: "down",
        })
      ).status,
      400,
    );
    const seatRace = await Promise.all([
      a.action({ type: "claim-seat", room: "studio", seatId: "you" }),
      b.action({ type: "claim-seat", room: "studio", seatId: "you" }),
    ]);
    assert.deepEqual(
      seatRace.map((result) => result.status).sort(),
      [200, 409],
    );
    const winner = seatRace[0].status === 200 ? a : b;
    const loser = winner === a ? b : a;
    assert.equal(
      (
        await loser.action({
          type: "move",
          room: "studio",
          x: 21.5,
          y: 83,
          direction: "up",
          seated: true,
          seatId: "you",
        })
      ).status,
      409,
    );
    assert.equal(
      (
        await loser.action({
          type: "release-seat",
          room: "studio",
          seatId: "you",
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await loser.action({
          type: "claim-seat",
          room: "studio",
          seatId: "you",
        })
      ).status,
      409,
    );
    assert.equal(
      (
        await winner.action({
          type: "release-seat",
          room: "studio",
          seatId: "you",
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await loser.action({
          type: "claim-seat",
          room: "studio",
          seatId: "you",
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await winner.action({
          type: "claim-seat",
          room: "studio",
          seatId: "empty",
        })
      ).status,
      200,
    );
    for (const stream of [a, b])
      assert.equal(
        (
          await stream.action({
            type: "move",
            room: "leetcode",
            x: 50,
            y: 27,
            direction: "down",
          })
        ).status,
        200,
      );
    assert.equal(
      (await a.action({ type: "claim-seat", room: "leetcode", seatId: "01" }))
        .status,
      200,
    );
    assert.equal(
      (await b.action({ type: "claim-seat", room: "leetcode", seatId: "01" }))
        .status,
      409,
    );
    assert.equal(
      (await b.action({ type: "claim-seat", room: "leetcode", seatId: "02" }))
        .status,
      200,
    );
    assert.equal(
      (
        await a.action({
          type: "claim-seat",
          room: "__proto__",
          seatId: "hasOwnProperty",
        })
      ).status,
      400,
    );
    const extraTab = await connect(alice);
    assert.equal(
      (
        await extraTab.action({
          type: "claim-seat",
          room: "studio",
          seatId: "you",
        })
      ).status,
      200,
      "Changing rooms releases old reservations",
    );
    assert.equal(
      (await e.action({ type: "claim-seat", room: "studio", seatId: "you" }))
        .status,
      409,
    );
    const sameAccountTab = await connect(alice);
    assert.equal(
      (
        await sameAccountTab.action({
          type: "claim-seat",
          room: "studio",
          seatId: "you",
        })
      ).status,
      409,
      "Other tabs of the same username cannot share a desk",
    );
    sameAccountTab.controller.abort();
    extraTab.controller.abort();
    await eventually(() =>
      a.events
        .filter((event) => event.type === "presence")
        .at(-1)
        ?.data.every((player) => player.clientId !== extraTab.clientId),
    );
    assert.equal(
      (await e.action({ type: "claim-seat", room: "studio", seatId: "you" }))
        .status,
      200,
      "Disconnecting releases reservations",
    );
    assert.equal(
      (
        await request(
          "/api/world/action",
          { type: "chat", clientId: a.clientId, text: "forged" },
          bob.cookie,
        )
      ).status,
      409,
    );
    assert.equal(
      (
        await a.action({
          type: "chat",
          text: "Hello office",
          sender: eve.data.user.id,
        })
      ).status,
      200,
    );
    await eventually(() =>
      b.events.some((x) => x.type === "chat" && x.data.text === "Hello office"),
    );
    assert.equal(
      b.events.find((x) => x.type === "chat").data.sender,
      alice.data.user.id,
    );
    assert.equal(
      (
        await a.action({
          type: "chat",
          text: "Only Bob",
          recipient: bob.data.user.id,
        })
      ).status,
      200,
    );
    await eventually(() =>
      b.events.some((x) => x.type === "chat" && x.data.text === "Only Bob"),
    );
    assert.ok(
      !e.events.some((x) => x.type === "chat" && x.data.text === "Only Bob"),
    );
    const lateEve = await connect(eve);
    await eventually(() => lateEve.events.some((x) => x.type === "snapshot"));
    assert.ok(
      !lateEve.events
        .find((x) => x.type === "snapshot")
        .data.messages.some((m) => m.text === "Only Bob"),
    );
    assert.equal(
      (
        await request(
          "/api/world/action",
          { clientId: a.clientId, type: "chat", text: "Cross site" },
          alice.cookie,
          { Origin: "https://evil.example" },
        )
      ).status,
      403,
    );
    assert.equal(
      (await a.action({ type: "chat", text: "x".repeat(1001) })).status,
      400,
    );
    assert.equal(
      (await a.action({ type: "exec", code: "process.exit()" })).status,
      400,
    );
    assert.equal(
      (
        await a.action({
          type: "move",
          room: "theater",
          x: 87,
          y: 31,
          direction: "down",
        })
      ).status,
      200,
    );
    const value = {
      source: { id: "night", title: "Night", kind: "ambient", duration: 600 },
      queue: [],
      playing: true,
      position: 42,
    };
    assert.equal(
      (await a.action({ type: "theater", revision: 0, value })).status,
      200,
    );
    await eventually(() =>
      b.events.some((x) => x.type === "theater" && x.data.position === 42),
    );
    assert.equal(
      (await a.action({ type: "theater", revision: 0, value })).status,
      409,
    );
    assert.equal(
      (await b.action({ type: "theater", revision: 1, value })).status,
      403,
    );
    assert.equal(
      (await request("/api/auth/profile", { name: "Avery" }, alice.cookie)).data
        .user.name,
      "Avery",
    );
    assert.equal(
      (await request("/api/auth/logout", {}, alice.cookie)).status,
      200,
    );
    assert.equal(
      (
        await request(
          "/api/world/action",
          { type: "chat", text: "After logout", clientId: a.clientId },
          alice.cookie,
        )
      ).status,
      401,
    );
    assert.equal(
      (await request("/api/auth/logout", {}, bob.cookie)).status,
      200,
    );
    assert.equal(
      (
        await e.action({
          type: "move",
          room: "leetcode",
          x: 50,
          y: 27,
          direction: "down",
        })
      ).status,
      200,
    );
    assert.equal(
      (await e.action({ type: "claim-seat", room: "leetcode", seatId: "02" }))
        .status,
      200,
      "Signing out releases reserved desks",
    );
    for (const stream of streams) stream.controller.abort();
    api.close();
    api = multiplayerMiddleware({ file: join(dir, "office.sqlite") });
    const login = await request("/api/auth/login", {
      username: "alice",
    });
    assert.equal(login.status, 200);
    assert.equal(login.data.user.name, "Avery");
    assert.equal(login.data.user.id, alice.data.user.id);
    const restored = await connect(login);
    await eventually(() => restored.events.some((x) => x.type === "snapshot"));
    assert.ok(
      restored.events
        .find((x) => x.type === "snapshot")
        .data.messages.some((m) => m.text === "Only Bob"),
    );
  } finally {
    for (const stream of streams) stream.controller.abort();
    api.close();
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
    await rm(dir, { recursive: true, force: true });
  }
});

test("username-only entry migrates existing accounts without changing their identity", async () => {
  const { DatabaseSync } = await import("node:sqlite");
  const directory = await mkdtemp(join(tmpdir(), "office-username-migration-"));
  const file = join(directory, "office.sqlite");
  const legacy = new DatabaseSync(file);
  legacy.exec(
    "CREATE TABLE users (id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE, name TEXT NOT NULL, salt TEXT NOT NULL, password TEXT NOT NULL)",
  );
  const id = randomUUID();
  legacy
    .prepare("INSERT INTO users VALUES (?, ?, ?, ?, ?)")
    .run(
      id,
      "returning_user",
      "Returning user",
      "old-salt",
      "old-password-hash",
    );
  legacy.close();
  const middleware = multiplayerMiddleware({ file });
  const server = createServer((req, res) =>
    middleware(req, res, () => res.writeHead(404).end()),
  );
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const response = await fetch(`${base}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: " Returning_User " }),
    });
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).user, {
      id,
      username: "returning_user",
      name: "Returning user",
    });
    const inspection = new DatabaseSync(file);
    assert.deepEqual(
      inspection
        .prepare("PRAGMA table_info(users)")
        .all()
        .map((column) => column.name),
      ["id", "username", "name"],
    );
    inspection.close();
  } finally {
    middleware.close();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await rm(directory, { recursive: true, force: true });
  }
});
