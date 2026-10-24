import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { ActivityLedger } from "./activityModel.mjs";

export function activityMiddleware({
  file = process.env.OFFICE_ACTIVITY_FILE || resolve(".data/activity.json"),
  now = Date.now,
} = {}) {
  let ledger;
  let queue = Promise.resolve();
  const load = async () => {
    if (ledger) return ledger;
    try {
      ledger = new ActivityLedger(JSON.parse(await readFile(file, "utf8")));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      ledger = new ActivityLedger();
    }
    return ledger;
  };
  return (req, res, next) => {
    const path = new URL(req.url, "http://localhost").pathname;
    if (!path.startsWith("/api/activity/")) return next();
    const respond = (status, body) => {
      res.writeHead(status, {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      });
      res.end(JSON.stringify(body));
    };
    const run = async () => {
      if (path === "/api/activity/board" && req.method === "GET") {
        respond(200, (await load()).snapshot(now()));
        return;
      }
      if (path !== "/api/activity/heartbeat" || req.method !== "POST") {
        respond(405, { error: "That activity action is unavailable." });
        return;
      }
      if (
        (req.headers.origin &&
          new URL(req.headers.origin).host !== req.headers.host) ||
        !req.headers["content-type"]?.startsWith("application/json")
      ) {
        respond(403, { error: "Activity updates must come from this studio." });
        return;
      }
      let body = "";
      for await (const chunk of req) {
        body += chunk;
        if (body.length > 4096) {
          respond(413, { error: "That activity update is too large." });
          return;
        }
      }
      let input;
      try {
        input = JSON.parse(body);
      } catch {
        respond(400, { error: "That activity update is invalid." });
        return;
      }
      const store = await load();
      store.heartbeat(input, now());
      await mkdir(dirname(file), { recursive: true });
      await writeFile(`${file}.tmp`, JSON.stringify(store.data));
      await rename(`${file}.tmp`, file);
      respond(200, store.snapshot(now()));
    };
    // Serialize reads and writes so overlapping clients cannot lose updates.
    queue = queue.then(run).catch((error) => {
      if (!res.headersSent)
        respond(error.status || 503, {
          error: error.status
            ? error.message
            : "The studio board couldn’t save right now. Reconnecting shortly.",
        });
    });
  };
}
