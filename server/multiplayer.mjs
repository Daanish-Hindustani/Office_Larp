import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { randomBytes, randomUUID, createHash } from "node:crypto";
const deskIds = {
  studio: new Set(["milo", "leo", "jun", "ada", "you", "empty"]),
  leetcode: new Set(["01", "02", "03", "04"]),
};
const rooms = new Set(["studio", "theater", "leetcode"]);
const fail = (status, message) => {
  throw Object.assign(new Error(message), { status });
};
const hashToken = (token) => createHash("sha256").update(token).digest("hex");
const publicUser = (row) => ({
  id: row.id,
  name: row.name,
  username: row.username,
});
const SESSION_MS = 7 * 86400000;

export function multiplayerMiddleware({
  file = process.env.OFFICE_DB || resolve(".data/office.sqlite"),
  origin = process.env.OFFICE_ORIGIN,
  secure = process.env.OFFICE_SECURE_COOKIES
    ? process.env.OFFICE_SECURE_COOKIES === "1"
    : process.env.NODE_ENV === "production",
} = {}) {
  if (file !== ":memory:") mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE, name TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL REFERENCES users(id), name TEXT NOT NULL, room TEXT NOT NULL, recipient TEXT REFERENCES users(id), text TEXT NOT NULL, sent_at INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS messages_room ON messages(room, id);
    CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires);`);
  // Preserve existing accounts and history while removing the old password fields.
  const columns = db.prepare("PRAGMA table_info(users)").all();
  for (const column of ["salt", "password"]) {
    if (columns.some((item) => item.name === column))
      db.exec(`ALTER TABLE users DROP COLUMN ${column}`);
  }
  const clients = new Map();
  const limits = new Map();
  let theater = null;
  let presenceDirty = false;
  const authenticate = (req) => {
    const token = /(?:^|;\s*)office_session=([a-f0-9]{64})(?:;|$)/.exec(
      req.headers.cookie || "",
    )?.[1];
    if (!token) return null;
    const row = db
      .prepare(
        "SELECT users.*, sessions.token AS session_token FROM sessions JOIN users ON users.id=sessions.user_id WHERE token=? AND expires>?",
      )
      .get(hashToken(token), Date.now());
    return row ? { ...publicUser(row), sessionToken: row.session_token } : null;
  };
  const limited = (key, max, windowMs) => {
    const now = Date.now();
    let bucket = limits.get(key);
    if (!bucket || bucket.until <= now) {
      bucket = { count: 0, until: now + windowMs };
      limits.set(key, bucket);
    }
    if (++bucket.count > max)
      fail(429, "Too many requests. Please wait and try again.");
  };
  const send = (client, type, data) => {
    if (client.res.destroyed) return;
    if (client.res.writableLength > 256 * 1024) return client.res.destroy();
    client.res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
  };
  const presence = () =>
    [...clients.values()].map((c) => ({
      ...c.player,
      reservedSeat: c.reservation?.seatId || null,
      seatRoom: c.reservation?.room || null,
      clientId: c.id,
      id: c.user.id,
      name: c.user.name,
    }));
  const broadcastPresence = () => {
    const list = presence();
    for (const c of clients.values()) send(c, "presence", list);
  };
  const messageHistory = (user) =>
    db
      .prepare(
        `SELECT id, user_id AS sender, name, room, recipient, text, sent_at AS sentAt FROM messages WHERE recipient IS NULL OR recipient=? OR user_id=? ORDER BY id DESC LIMIT 100`,
      )
      .all(user.id, user.id)
      .reverse();
  const cookie = (res, token, maxAge) =>
    res.setHeader(
      "Set-Cookie",
      `office_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? "; Secure" : ""}`,
    );
  const presenceTimer = setInterval(() => {
    if (presenceDirty) {
      presenceDirty = false;
      broadcastPresence();
    }
  }, 100);
  presenceTimer.unref();
  const cleanup = setInterval(() => {
    const now = Date.now();
    db.prepare("DELETE FROM sessions WHERE expires<=?").run(now);
    for (const [key, value] of limits)
      if (value.until <= now) limits.delete(key);
    let changed = false;
    for (const [id, client] of clients) {
      if (
        now - client.seenAt > 30000 ||
        !db
          .prepare("SELECT 1 FROM sessions WHERE token=?")
          .get(client.user.sessionToken)
      ) {
        clients.delete(id);
        client.res.end();
        changed = true;
      } else send(client, "ping", now);
    }
    if (changed) broadcastPresence();
  }, 10000);
  cleanup.unref();

  const middleware = (req, res, next) => {
    const url = new URL(req.url, "http://localhost");
    if (!url.pathname.startsWith("/api/")) return next();
    const json = (status, value) => {
      res.writeHead(status, {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      });
      res.end(JSON.stringify(value));
    };
    const run = async () => {
      res.setHeader("X-Content-Type-Options", "nosniff");
      if (req.method !== "GET" && req.method !== "HEAD") {
        const allowed = origin || `http://${req.headers.host}`;
        // The explicit public origin is required behind a TLS reverse proxy.
        if (req.headers.origin && req.headers.origin !== allowed)
          fail(403, "This request must come from this office.");
        if (req.headers["sec-fetch-site"] === "cross-site")
          fail(403, "Cross-site requests are blocked.");
        if (!req.headers["content-type"]?.startsWith("application/json"))
          fail(415, "Use application/json.");
      }
      const readBody = async () => {
        const chunks = [];
        let size = 0;
        for await (const chunk of req) {
          size += chunk.length;
          if (size > 16384) fail(413, "Request too large.");
          chunks.push(chunk);
        }
        try {
          const result = JSON.parse(Buffer.concat(chunks).toString("utf8"));
          if (!result || typeof result !== "object" || Array.isArray(result))
            fail(400, "Invalid request.");
          return result;
        } catch {
          fail(400, "Invalid JSON.");
        }
      };
      const path = url.pathname;
      const user = authenticate(req);
      if (path === "/api/auth/me" && req.method === "GET")
        return json(200, { user: user && publicUser(user) });
      if (
        ["/api/auth/register", "/api/auth/login"].includes(path) &&
        req.method === "POST"
      ) {
        // NGINX supplies a single, overwritten client address; never trust arbitrary forwarded chains.
        const ip =
          process.env.TRUST_PROXY === "1"
            ? req.headers["x-real-ip"] || req.socket.remoteAddress
            : req.socket.remoteAddress;
        limited(`auth:${ip}`, 20, 60000);
        const body = await readBody();
        const username =
          typeof body.username === "string"
            ? body.username.trim().toLowerCase()
            : "";
        if (!/^[a-z0-9_]{3,24}$/.test(username))
          fail(
            400,
            "Use a 3–24 character username with letters, numbers or underscores.",
          );
        let account = db
          .prepare("SELECT * FROM users WHERE username=?")
          .get(username);
        const created = !account;
        if (!account) {
          const name =
            typeof body.name === "string" ? body.name.trim() : username;
          if (!name || name.length > 24)
            fail(400, "Display names must be 1–24 characters.");
          account = { id: randomUUID(), username, name };
          db.prepare(
            "INSERT INTO users (id, username, name) VALUES (?, ?, ?)",
          ).run(account.id, username, name);
        }
        const token = randomBytes(32).toString("hex");
        db.prepare("INSERT INTO sessions VALUES (?, ?, ?)").run(
          hashToken(token),
          account.id,
          Date.now() + SESSION_MS,
        );
        cookie(res, token, SESSION_MS / 1000);
        return json(created ? 201 : 200, { user: publicUser(account) });
      }
      if (!user) fail(401, "Please sign in.");
      req.officeUser = publicUser(user);
      if (path === "/api/auth/profile" && req.method === "POST") {
        limited(`profile:${user.id}`, 10, 60000);
        const body = await readBody();
        const name =
          typeof body.name === "string"
            ? body.name.trim().replace(/\s+/g, " ")
            : "";
        if (!name || name.length > 24)
          fail(400, "Display names must be 1–24 characters.");
        db.prepare("UPDATE users SET name=? WHERE id=?").run(name, user.id);
        for (const c of clients.values())
          if (c.user.id === user.id) c.user.name = name;
        broadcastPresence();
        return json(200, { user: { ...publicUser(user), name } });
      }
      if (path === "/api/auth/logout" && req.method === "POST") {
        db.prepare("DELETE FROM sessions WHERE token=?").run(user.sessionToken);
        for (const [id, c] of clients)
          if (c.user.sessionToken === user.sessionToken) {
            clients.delete(id);
            c.res.end();
          }
        broadcastPresence();
        cookie(res, "", 0);
        return json(200, { ok: true });
      }
      if (path === "/api/world/events" && req.method === "GET") {
        const id = url.searchParams.get("client");
        if (!/^[a-f0-9-]{36}$/.test(id || "")) fail(400, "Invalid client ID.");
        if (clients.has(id)) {
          const old = clients.get(id);
          if (old.user.id !== user.id) fail(409, "Client ID in use.");
          old.res.end();
        }
        if (
          [...clients.values()].filter((c) => c.user.id === user.id).length >=
            5 ||
          clients.size >= 200
        )
          fail(429, "The office is full. Try again shortly.");
        const room = rooms.has(url.searchParams.get("room"))
          ? url.searchParams.get("room")
          : "studio";
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache, no-transform",
          "X-Accel-Buffering": "no",
          Connection: "keep-alive",
        });
        const client = {
          id,
          user,
          res,
          seenAt: Date.now(),
          player: {
            room,
            x: 57,
            y: 86,
            direction: "down",
            moving: false,
            seated: false,
          },
        };
        clients.set(id, client);
        send(client, "snapshot", { messages: messageHistory(user), theater });
        broadcastPresence();
        res.on("close", () => {
          if (clients.get(id) === client) {
            clients.delete(id);
            broadcastPresence();
          }
        });
        return;
      }
      if (path === "/api/world/action" && req.method === "POST") {
        limited(`action:${user.id}`, 100, 1000);
        const body = await readBody();
        const client = clients.get(body.clientId);
        if (
          !client ||
          client.user.id !== user.id ||
          client.user.sessionToken !== user.sessionToken
        )
          fail(409, "Reconnect to the office first.");
        client.seenAt = Date.now();
        if (body.type === "claim-seat") {
          if (!rooms.has(body.room) || !deskIds[body.room]?.has(body.seatId))
            fail(400, "Unknown desk.");
          if (client.player.room !== body.room)
            fail(409, "Enter the room before using a desk.");
          const occupant = [...clients.values()].find(
            (other) =>
              other !== client &&
              other.reservation?.room === body.room &&
              other.reservation.seatId === body.seatId,
          );
          if (occupant)
            fail(
              409,
              `${occupant.user.name} is already using this desk. Choose another desk.`,
            );
          client.reservation = { room: body.room, seatId: body.seatId };
          broadcastPresence();
        } else if (body.type === "release-seat") {
          if (!rooms.has(body.room) || !deskIds[body.room]?.has(body.seatId))
            fail(400, "Unknown desk.");
          if (
            client.reservation?.room === body.room &&
            client.reservation.seatId === body.seatId
          ) {
            client.reservation = null;
            client.player.seated = false;
            broadcastPresence();
          }
        } else if (body.type === "move") {
          if (
            !rooms.has(body.room) ||
            !Number.isFinite(body.x) ||
            !Number.isFinite(body.y) ||
            body.x < 0 ||
            body.x > 100 ||
            body.y < 0 ||
            body.y > 100 ||
            !["up", "down", "left", "right"].includes(body.direction)
          )
            fail(400, "Invalid position.");
          if (
            body.seated &&
            deskIds[body.room] &&
            (client.reservation?.room !== body.room ||
              client.reservation?.seatId !== body.seatId)
          )
            fail(409, "Reserve the desk before sitting down.");
          if (client.reservation && client.reservation.room !== body.room)
            client.reservation = null;
          client.player = {
            room: body.room,
            x: body.x,
            y: body.y,
            direction: body.direction,
            moving: Boolean(body.moving),
            seated: Boolean(body.seated),
          };
          presenceDirty = true;
        } else if (body.type === "chat") {
          limited(`chat:${user.id}`, 30, 60000);
          const text = typeof body.text === "string" ? body.text.trim() : "";
          if (!text || text.length > 1000)
            fail(400, "Messages must be 1–1000 characters.");
          const recipient = body.recipient || null;
          if (
            recipient &&
            (typeof recipient !== "string" ||
              !db.prepare("SELECT 1 FROM users WHERE id=?").get(recipient))
          )
            fail(400, "Unknown recipient.");
          const room = client.player.room;
          const sentAt = Date.now();
          const result = db
            .prepare(
              "INSERT INTO messages (user_id, name, room, recipient, text, sent_at) VALUES (?, ?, ?, ?, ?, ?)",
            )
            .run(user.id, user.name, room, recipient, text, sentAt);
          const message = {
            id: Number(result.lastInsertRowid),
            sender: user.id,
            name: user.name,
            room,
            recipient,
            text,
            sentAt,
          };
          for (const c of clients.values())
            if (!recipient || c.user.id === recipient || c.user.id === user.id)
              send(c, "chat", message);
          // Keep a bounded recent history. Back up SQLite for longer-term archives.
          db.prepare(
            "DELETE FROM messages WHERE id <= (SELECT MAX(id)-10000 FROM messages)",
          ).run();
        } else if (body.type === "theater") {
          if (client.player.room !== "theater")
            fail(403, "Enter the theater first.");
          limited(`theater:${user.id}`, 60, 60000);
          const value = body.value;
          if (theater && body.revision !== theater.revision)
            fail(409, "The screening changed. Try your action again.");
          const validItem = (item) =>
            item &&
            typeof item.id === "string" &&
            item.id.length <= 100 &&
            typeof item.title === "string" &&
            item.title.length <= 150 &&
            (item.kind === "ambient"
              ? ["night", "rain", "orbit"].includes(item.id)
              : item.kind === "url" &&
                typeof item.url === "string" &&
                item.url.length <= 2048 &&
                (/^https?:\/\//.test(item.url) ||
                  item.url === "/media/adialante-demo.mp4")) &&
            (item.duration == null ||
              (Number.isFinite(item.duration) &&
                item.duration > 0 &&
                item.duration <= 86400));
          if (
            !value ||
            !validItem(value.source) ||
            !Array.isArray(value.queue) ||
            value.queue.length > 12 ||
            !value.queue.every(validItem) ||
            !Number.isFinite(value.position) ||
            value.position < 0 ||
            value.position > 86400 ||
            typeof value.playing !== "boolean"
          )
            fail(400, "Invalid screening update.");
          const cleanItem = (item) => ({
            id: item.id,
            title: item.title,
            kind: item.kind,
            ...(item.kind === "url" ? { url: item.url } : {}),
            ...(Number.isFinite(item.duration)
              ? { duration: item.duration }
              : {}),
          });
          theater = {
            source: cleanItem(value.source),
            queue: value.queue.map(cleanItem),
            position: value.position,
            playing: value.playing,
            updatedAt: Date.now(),
            revision: (theater?.revision || 0) + 1,
            author: user.id,
          };
          for (const c of clients.values()) send(c, "theater", theater);
        } else if (body.type === "reaction") {
          limited(`reaction:${user.id}`, 30, 60000);
          if (
            client.player.room !== "theater" ||
            !["🍿", "💛", "👏", "✨"].includes(body.value)
          )
            fail(400, "Invalid reaction.");
          for (const c of clients.values())
            if (c.player.room === "theater")
              send(c, "reaction", {
                id: randomUUID(),
                sender: user.id,
                value: body.value,
              });
        } else fail(400, "Unknown action.");
        return json(200, {
          ok: true,
          ...(body.type === "theater" ? { theater } : {}),
        });
      }
      if (path.startsWith("/api/auth/") || path.startsWith("/api/world/"))
        fail(404, "Unknown endpoint.");
      return next();
    };
    run().catch((error) => {
      if (!res.headersSent) {
        if (!error.status) console.error("Office API error:", error);
        json(error.status || 500, {
          error: error.status
            ? error.message
            : "The office could not complete that request.",
        });
      } else res.end();
    });
  };
  middleware.close = () => {
    clearInterval(presenceTimer);
    clearInterval(cleanup);
    for (const c of clients.values()) c.res.end();
    clients.clear();
    db.close();
  };
  return middleware;
}
