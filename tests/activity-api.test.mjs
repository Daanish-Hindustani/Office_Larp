import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, readFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { activityMiddleware } from "../server/activity.mjs";

test("activity API saves earned time, reloads it, and validates writes", async () => {
  await mkdir("test-results", { recursive: true });
  const dir = await mkdtemp(resolve("test-results/activity-api-")),
    file = resolve(dir, "activity.json");
  let time = Date.UTC(2026, 9, 24);
  let middleware = activityMiddleware({ file, now: () => time });
  const server = createServer((req, res) =>
    middleware(req, res, () => res.writeHead(404).end()),
  );
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const input = {
    person: { id: "visitor-a", name: "Avery" },
    clientId: "browser-a",
    sequence: 1,
    active: true,
    pair: null,
  };
  const post = (body, headers = {}) =>
    fetch(`${base}/api/activity/heartbeat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    });
  try {
    assert.equal((await post(input)).status, 200);
    time += 5000;
    assert.equal((await post({ ...input, sequence: 2 })).status, 200);
    assert.equal(
      JSON.parse(await readFile(file, "utf8")).online["visitor-a"][0][1],
      time,
    );
    middleware = activityMiddleware({ file, now: () => time });
    time += 3600000;
    const restored = await fetch(`${base}/api/activity/board`).then((r) =>
      r.json(),
    );
    assert.equal(restored.all.people[0].online, 5000);
    assert.equal(restored.all.people[0].live, false);
    assert.equal((await post(null)).status, 400);
    assert.equal(
      (await post({ ...input, person: { id: "__proto__", name: "Nope" } }))
        .status,
      400,
    );
    assert.equal(
      (await post(input, { Origin: "https://another-site.example" })).status,
      403,
    );
    assert.equal(
      (await post({ ...input, person: { ...input.person, name: " " } })).status,
      400,
    );
    assert.equal(
      (
        await post({
          ...input,
          person: { ...input.person, name: "x".repeat(5000) },
        })
      ).status,
      413,
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
