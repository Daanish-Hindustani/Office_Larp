import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { leetcodeMiddleware } from "./leetcode.mjs";

const root = fileURLToPath(new URL("../dist/", import.meta.url));
const api = leetcodeMiddleware();
const types = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};
const server = createServer((req, res) =>
  api(req, res, async () => {
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405).end();
      return;
    }
    let path;
    try {
      path = resolve(
        root,
        `.${decodeURIComponent(new URL(req.url, "http://localhost").pathname)}`,
      );
    } catch {
      res.writeHead(400).end();
      return;
    }
    if (path !== resolve(root) && !path.startsWith(resolve(root) + sep)) {
      res.writeHead(403).end();
      return;
    }
    if (path === resolve(root)) path = resolve(root, "index.html");
    try {
      const body = await readFile(path);
      res.setHeader(
        "Content-Type",
        types[extname(path)] || "application/octet-stream",
      );
      res.end(req.method === "HEAD" ? undefined : body);
    } catch {
      res.writeHead(404).end("Not found");
    }
  }),
);
server.listen(
  Number(process.env.PORT) || 4173,
  process.env.HOST || "127.0.0.1",
  () =>
    console.log(
      `Office Hours running at http://${process.env.HOST || "127.0.0.1"}:${Number(process.env.PORT) || 4173}`,
    ),
);
