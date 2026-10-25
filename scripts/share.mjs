import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const port = Number(process.env.SHARE_PORT || 4174);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error("SHARE_PORT must be a valid port number.");
  process.exit(1);
}
// Fail before opening a public tunnel if another app owns this port.
await new Promise((resolve, reject) => {
  const probe = createServer();
  probe.once("error", reject);
  probe.listen(port, "127.0.0.1", () => probe.close(resolve));
}).catch((error) => {
  console.error(`Cannot share on port ${port}: ${error.message}`);
  process.exit(1);
});

const children = new Set();
let stopping = false;
let ready = false;
let timer;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  clearTimeout(timer);
  for (const child of children) child.kill("SIGTERM");
  const force = setTimeout(() => {
    for (const child of children) child.kill("SIGKILL");
    process.exit(code);
  }, 3000);
  Promise.all([...children].map((child) => new Promise((resolve) => {
    if (child.exitCode !== null || child.signalCode !== null) resolve();
    else child.once("exit", resolve);
  }))).then(() => {
    clearTimeout(force);
    process.exit(code);
  });
}
function start(command, args, options = {}) {
  const child = spawn(command, args, { cwd: root, ...options });
  children.add(child);
  child.once("error", (error) => {
    console.error(command === "ngrok"
      ? `Cannot start ngrok: ${error.message}. Install it and run ngrok config add-authtoken with your own token.`
      : error.message);
    stop(1);
  });
  child.once("exit", (code) => {
    children.delete(child);
    if (!stopping) {
      console.error(`${command} stopped (exit ${code ?? "signal"}).`);
      stop(1);
    }
  });
  return child;
}
process.once("SIGINT", () => stop());
process.once("SIGTERM", () => stop());

timer = setTimeout(() => {
  console.error("Sharing did not start within 45 seconds. Check your ngrok login and network connection.");
  stop(1);
}, 45000);
console.log("Opening an HTTPS tunnel…");
const tunnel = start("ngrok", ["http", `http://127.0.0.1:${port}`, "--log=stdout", "--log-format=json", "--inspect=false"], { stdio: ["ignore", "pipe", "pipe"] });
async function openApp(url) {
  if (ready || stopping) return;
  const address = new URL(url);
  if (address.protocol !== "https:") return;
  ready = true;
  start(process.execPath, ["server/index.mjs"], {
    env: {
      ...process.env,
      NODE_ENV: "production",
      OFFICE_DB: process.env.OFFICE_SHARE_DB || ".data/shared-office.sqlite",
      OFFICE_ACTIVITY_FILE: process.env.OFFICE_SHARE_ACTIVITY_FILE || ".data/shared-office-activity.json",
      HOST: "127.0.0.1",
      PORT: String(port),
      OFFICE_ORIGIN: address.origin,
      OFFICE_SECURE_COOKIES: "1",
      TRUST_PROXY: "0",
    },
    stdio: "inherit",
  });
  for (let attempt = 0; attempt < 100 && !stopping; attempt++) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(1000) });
      if (response.ok) {
        clearTimeout(timer);
        console.log(`\nShare this link: ${address.origin}\nEveryone, including you, should use this HTTPS link.\nKeep this terminal and your Mac running. Press Ctrl+C to stop sharing.\n`);
        return;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (!stopping) {
    console.error("The app did not become ready.");
    stop(1);
  }
}
for (const stream of [tunnel.stdout, tunnel.stderr]) {
  createInterface({ input: stream }).on("line", (line) => {
    let entry;
    try { entry = JSON.parse(line); } catch { return; }
    if (entry.url?.startsWith("https://")) void openApp(entry.url);
    if (["error", "eror", "crit"].includes(entry.lvl)) {
      console.error(`ngrok: ${entry.msg || "Tunnel error"}${entry.err ? ` — ${entry.err}` : ""}`);
    }
  });
}
