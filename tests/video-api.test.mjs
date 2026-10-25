import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { serveVideo } from "../server/video.mjs";

test("production video streaming supports byte ranges, suffixes, HEAD and invalid seek requests", async () => {
  const directory = await mkdtemp(join(tmpdir(), "office-video-"));
  const file = join(directory, "demo.mp4");
  const content = Buffer.from(
    Array.from({ length: 1024 }, (_, index) => index % 256),
  );
  await writeFile(file, content);
  const server = createServer((req, res) => {
    void serveVideo(req, res, file).catch(() => res.writeHead(500).end());
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${server.address().port}/demo.mp4`;
  try {
    const full = await fetch(url);
    assert.equal(full.status, 200);
    assert.equal(full.headers.get("content-type"), "video/mp4");
    assert.equal(full.headers.get("accept-ranges"), "bytes");
    assert.deepEqual(Buffer.from(await full.arrayBuffer()), content);
    for (const [range, start, end] of [
      ["bytes=0-9", 0, 9],
      ["bytes=1000-", 1000, 1023],
      ["bytes=-5", 1019, 1023],
      ["bytes=1000-99999", 1000, 1023],
    ]) {
      const response = await fetch(url, { headers: { Range: range } });
      assert.equal(response.status, 206);
      assert.equal(
        response.headers.get("content-range"),
        `bytes ${start}-${end}/1024`,
      );
      assert.deepEqual(
        Buffer.from(await response.arrayBuffer()),
        content.subarray(start, end + 1),
      );
    }
    const head = await fetch(url, { method: "HEAD" });
    assert.equal(head.headers.get("content-length"), "1024");
    assert.equal((await head.arrayBuffer()).byteLength, 0);
    for (const range of [
      "bytes=1024-",
      "bytes=20-10",
      "bytes=-0",
      "bytes=0-1,4-5",
      "invalid",
    ]) {
      const response = await fetch(url, { headers: { Range: range } });
      assert.equal(response.status, 416);
      assert.equal(response.headers.get("content-range"), "bytes */1024");
    }
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await rm(directory, { recursive: true, force: true });
  }
});
