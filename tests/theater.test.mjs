import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

let browser, server;
const url = "http://127.0.0.1:5175";
before(async () => {
  server = spawn(
    process.execPath,
    [
      "node_modules/vite/bin/vite.js",
      "--host",
      "127.0.0.1",
      "--port",
      "5175",
      "--strictPort",
    ],
    {
      stdio: "pipe",
      env: {
        ...process.env,
        OFFICE_ACTIVITY_FILE: `test-results/theater-activity-${process.pid}.json`,
      },
    },
  );
  let output = "";
  server.stdout.on("data", (chunk) => {
    output += chunk;
  });
  server.stderr.on("data", (chunk) => {
    output += chunk;
  });
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    if (server.exitCode !== null)
      throw new Error(`Theater test server stopped: ${output}`);
    try {
      if ((await fetch(url)).ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  assert.ok(ready, output);
  browser = await chromium.launch({
    channel: process.env.PLAYWRIGHT_CHANNEL || "chrome",
    headless: true,
  });
  await mkdir("test-results", { recursive: true });
});
after(async () => {
  await browser?.close();
  server?.kill();
});

async function waitForTheater(page) {
  await page
    .getByRole("heading", { name: "Watch party", exact: false })
    .waitFor();
}
async function seek(page, position) {
  await page
    .getByRole("slider", { name: "Screening progress" })
    .fill(String(position));
}
async function addVideo(page, title, source) {
  await page.getByRole("button", { name: "Add video", exact: false }).click();
  await page.getByLabel("A name for the screening").fill(title);
  await page.getByLabel("Direct video link").fill(source);
  await page
    .getByRole("button", { name: "Add to queue", exact: false })
    .click();
}

test("the hallway connects both rooms, seats are interactive, and the studio survives the visit", async () => {
  const page = await browser.newPage({
    viewport: { width: 1536, height: 1024 },
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    await page.goto(url);
    await page
      .getByRole("button", { name: "Walk down the hallway to the theater" })
      .click();
    await waitForTheater(page);
    assert.equal(await page.locator(".studio-view").isVisible(), false);
    assert.equal(
      await page.locator(".room-title").innerText(),
      "The screening room",
    );
    await page
      .getByRole("button", { name: "Approach seat A2", exact: true })
      .click();
    await page.waitForFunction(() =>
      document
        .querySelector(".theater-player .interaction-prompt")
        ?.textContent.includes("Take seat A2"),
    );
    assert.equal(
      await page.getByTestId("theater-player").getAttribute("data-state"),
      "standing",
    );
    await page.keyboard.press("e");
    await page.waitForFunction(
      () =>
        document.querySelector('[data-testid="theater-player"]').dataset
          .state === "sitting",
    );
    await page
      .getByRole("button", { name: "Play together", exact: false })
      .click();
    await page
      .getByRole("button", { name: "Expand screen", exact: true })
      .click();
    assert.equal(
      await page
        .locator(".theater-map")
        .evaluate((element) => element.classList.contains("screen-focused")),
      true,
    );
    await page.screenshot({
      path: "test-results/theater-screen.png",
      animations: "disabled",
    });
    await page.keyboard.press("Escape");
    await page.screenshot({
      path: "test-results/theater-desktop.png",
      animations: "disabled",
    });
    await page.keyboard.press("e");
    await page.waitForFunction(
      () =>
        document.querySelector('[data-testid="theater-player"]').dataset
          .state === "standing",
    );
    await page
      .getByRole("button", { name: "Approach seat B2", exact: true })
      .click();
    await page.waitForFunction(
      () =>
        document
          .querySelector(".theater-player .interaction-prompt")
          ?.textContent.includes("Take seat B2"),
      {},
      { timeout: 20000 },
    );
    await page.keyboard.press("e");
    await page.waitForFunction(
      () =>
        document.querySelector('[data-testid="theater-player"]').dataset
          .state === "sitting",
    );
    await page.keyboard.press("e");
    await page
      .getByRole("button", {
        name: "Walk through the hallway back to the studio",
      })
      .click();
    await page.waitForFunction(
      () => !document.querySelector(".studio-view").hidden,
      {},
      { timeout: 20000 },
    );
    assert.ok(
      (await page.getByTestId("player").getAttribute("style")).includes("50%"),
    );
    assert.equal(await page.locator(".npc").count(), 4);
    await page.getByRole("button", { name: "Pair up", exact: true }).click();
    await page
      .getByRole("button", { name: "Pair with Milo", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Start pairing", exact: false })
      .click();
    assert.equal(
      await page
        .getByRole("button", { name: "Swap roles", exact: false })
        .isVisible(),
      true,
    );
    assert.deepEqual(errors, []);
  } finally {
    await page.close();
  }
});

test("watch-party playback, queue, chat, reactions, and late joining synchronize across tabs", async () => {
  const context = await browser.newContext();
  const first = await context.newPage(),
    second = await context.newPage();
  const errors = [];
  for (const page of [first, second])
    page.on("pageerror", (error) => errors.push(error.message));
  try {
    await first.goto(`${url}/?room=theater`);
    await waitForTheater(first);
    await first
      .getByRole("button", { name: "Play together", exact: false })
      .click();
    await seek(first, 75);
    await first
      .getByRole("textbox", { name: "Message the theater" })
      .fill("Welcome to movie night.");
    await first.getByRole("button", { name: "Send theater message" }).click();
    await second.goto(`${url}/?room=theater`);
    await waitForTheater(second);
    await second
      .getByRole("log")
      .getByText("Welcome to movie night.", { exact: true })
      .waitFor();
    await second
      .getByRole("button", { name: "Pause for everyone", exact: false })
      .waitFor();
    await first
      .getByText("2 guests here · local room", { exact: false })
      .waitFor();
    await second
      .getByRole("button", { name: "Pause for everyone", exact: false })
      .click();
    await first
      .getByRole("button", { name: "Play together", exact: false })
      .waitFor();
    const one = Number(
      await first
        .getByRole("slider", { name: "Screening progress" })
        .inputValue(),
    );
    const two = Number(
      await second
        .getByRole("slider", { name: "Screening progress" })
        .inputValue(),
    );
    assert.ok(
      Math.abs(one - two) < 1,
      "both guests should see the same playhead",
    );
    assert.ok(two >= 75);
    await first
      .getByRole("textbox", { name: "Message the theater" })
      .fill("Saved you the comfy sofa.");
    await first.getByRole("button", { name: "Send theater message" }).click();
    await second
      .getByRole("log")
      .getByText("Saved you the comfy sofa.", { exact: true })
      .waitFor();
    await second.getByRole("button", { name: "React 🍿", exact: true }).click();
    await first
      .getByRole("status")
      .filter({ hasText: "A studio friend sent 🍿" })
      .waitFor();
    await second
      .locator(".watch-party-queue li")
      .filter({ hasText: "Rain at the window" })
      .getByRole("button", { name: "Screen this", exact: false })
      .click();
    await first
      .locator(".screening-heading h2")
      .getByText("Rain at the window", { exact: true })
      .waitFor();
    await second
      .getByRole("button", {
        name: "Remove A little orbit from queue",
        exact: true,
      })
      .click();
    await first
      .getByText("A little breathing room.", { exact: false })
      .waitFor();
    await first
      .getByRole("button", { name: "Browse the ambient shelf", exact: false })
      .click();
    await second
      .locator(".watch-party-queue li")
      .filter({ hasText: "A quiet night" })
      .waitFor();
    await second
      .getByRole("button", { name: "Back to studio", exact: false })
      .last()
      .click();
    await first
      .getByText("1 guest here · local room", { exact: false })
      .waitFor();
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
});

test("direct video playback works, unsupported pages fail clearly, and media errors recover", async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await page.goto(`${url}/?room=theater`);
    await waitForTheater(page);
    await addVideo(
      page,
      "A page, not a video",
      "https://www.youtube.com/watch?v=sample",
    );
    await page
      .getByRole("status")
      .filter({ hasText: "Use a direct HTTP or HTTPS video link" })
      .waitFor();
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    const clip = await page.evaluate(async () => {
      const canvas = document.createElement("canvas");
      canvas.width = 160;
      canvas.height = 90;
      const ctx = canvas.getContext("2d"),
        stream = canvas.captureStream(12),
        chunks = [];
      const recorder = new MediaRecorder(stream, {
        mimeType: "video/webm;codecs=vp8",
      });
      recorder.ondataavailable = (event) => chunks.push(event.data);
      const stopped = new Promise((resolve) => {
        recorder.onstop = resolve;
      });
      recorder.start();
      const paint = setInterval(() => {
        ctx.fillStyle = `hsl(${Date.now() % 360}, 30%, 30%)`;
        ctx.fillRect(0, 0, 160, 90);
      }, 75);
      await new Promise((resolve) => setTimeout(resolve, 1800));
      recorder.stop();
      await stopped;
      clearInterval(paint);
      stream.getTracks().forEach((track) => track.stop());
      const bytes = new Uint8Array(
        await new Blob(chunks, { type: "video/webm" }).arrayBuffer(),
      );
      return btoa(String.fromCharCode(...bytes));
    });
    await context.route("**/fixtures/party.webm", (route) =>
      route.fulfill({
        status: 200,
        contentType: "video/webm",
        body: Buffer.from(clip, "base64"),
      }),
    );
    await addVideo(page, "Our little film", `${url}/fixtures/party.webm`);
    await page
      .locator(".watch-party-queue li")
      .filter({ hasText: "Our little film" })
      .getByRole("button", { name: "Screen this", exact: false })
      .click();
    await page.waitForFunction(
      () => document.querySelector("video")?.readyState >= 2,
    );
    await page
      .getByRole("button", { name: "Play together", exact: false })
      .click();
    await page.waitForFunction(() => {
      const video = document.querySelector("video");
      return video && !video.paused && video.currentTime > 0;
    });
    await page
      .getByRole("button", { name: "Pause for everyone", exact: false })
      .click();
    await page.waitForFunction(() => document.querySelector("video").paused);
    await context.route("**/fixtures/missing.mp4", (route) =>
      route.fulfill({ status: 404, body: "Missing" }),
    );
    await addVideo(page, "Missing clip", `${url}/fixtures/missing.mp4`);
    await page
      .locator(".watch-party-queue li")
      .filter({ hasText: "Missing clip" })
      .getByRole("button", { name: "Screen this", exact: false })
      .click();
    await page
      .getByRole("alert")
      .filter({ hasText: "That video couldn’t load" })
      .waitFor();
    await page
      .locator(".watch-party-queue li")
      .first()
      .getByRole("button", { name: "Screen this", exact: false })
      .click();
    assert.equal(await page.getByRole("alert").count(), 0);
    assert.equal(
      await page
        .getByRole("button", { name: "Play together", exact: false })
        .isEnabled(),
      true,
    );
  } finally {
    await context.close();
  }
});

test("mobile theater is usable without overflow and gracefully supports a solo browser", async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    await page.addInitScript(() => {
      delete window.BroadcastChannel;
    });
    await page.goto(`${url}/?room=theater`);
    await waitForTheater(page);
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await page.getByText("Solo mode", { exact: false }).waitFor();
    await page
      .getByRole("button", { name: "Play together", exact: false })
      .click();
    await page
      .getByRole("button", { name: "Expand screen", exact: true })
      .click();
    await page.screenshot({
      path: "test-results/theater-mobile-screen.png",
      animations: "disabled",
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Back to room", exact: false })
      .click();
    await page
      .getByRole("button", { name: "Approach seat A3", exact: true })
      .click();
    await page.waitForFunction(() =>
      document
        .querySelector(".theater-player .interaction-prompt")
        ?.textContent.includes("Take seat A3"),
    );
    await page.locator(".theater-player .interaction-prompt").click();
    await page.waitForFunction(
      () =>
        document.querySelector('[data-testid="theater-player"]').dataset
          .state === "sitting",
    );
    await page.screenshot({
      path: "test-results/theater-mobile.png",
      animations: "disabled",
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Back to studio", exact: false })
      .last()
      .click();
    await page
      .getByRole("button", { name: "Walk down the hallway to the theater" })
      .waitFor();
    assert.deepEqual(errors, []);
  } finally {
    await page.close();
  }
});
