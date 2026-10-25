import { stat } from "node:fs/promises";
import { createReadStream } from "node:fs";

export async function serveVideo(req, res, path) {
  const file = await stat(path);
  if (!file.isFile())
    throw Object.assign(new Error("Not a file"), { code: "ENOENT" });
  let start = 0,
    end = file.size - 1;
  const range = req.headers.range;
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    let valid = Boolean(match && (match[1] || match[2]));
    if (valid && match[1]) {
      start = Number(match[1]);
      end = match[2] ? Number(match[2]) : end;
      valid =
        Number.isSafeInteger(start) &&
        Number.isSafeInteger(end) &&
        start >= 0 &&
        start < file.size &&
        end >= start;
      end = Math.min(end, file.size - 1);
    } else if (valid) {
      const suffix = Number(match[2]);
      valid = Number.isSafeInteger(suffix) && suffix > 0 && file.size > 0;
      start = Math.max(0, file.size - suffix);
    }
    if (!valid) {
      res.writeHead(416, { "Content-Range": `bytes */${file.size}` }).end();
      return;
    }
  }
  const headers = {
    "Content-Type": path.endsWith(".webm") ? "video/webm" : "video/mp4",
    "Accept-Ranges": "bytes",
    "Content-Length": range ? end - start + 1 : file.size,
  };
  if (range) headers["Content-Range"] = `bytes ${start}-${end}/${file.size}`;
  res.writeHead(range ? 206 : 200, headers);
  if (req.method === "HEAD" || !file.size) {
    res.end();
    return;
  }
  const stream = createReadStream(path, { start, end });
  stream.on("error", (error) => res.destroy(error));
  res.on("close", () => stream.destroy());
  stream.pipe(res);
}
