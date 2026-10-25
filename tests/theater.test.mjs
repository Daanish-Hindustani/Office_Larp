import {
  signedInPage,
  signedInContext,
} from "./auth-helpers.mjs";
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
        OFFICE_DB: `test-results/accounts-${process.pid}-${new URL(url).port}.sqlite`,
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
  await page.locator('.theater-view:not([hidden]) .theater-map').waitFor();
  assert.equal(await page.locator('.watch-party-panel, .theater-player-controls').count(), 0);
}
async function seek(page, position) {
  await page
    .getByRole("slider", { name: "Screening progress" })
    .fill(String(position));
}
async function sit(page, seat) {
  await page.getByRole("button", { name: `Approach seat ${seat}`, exact: true }).click();
  await page.waitForFunction((seat) => document.querySelector('.theater-player .interaction-prompt')?.textContent.includes(`Take seat ${seat}`), seat);
  await page.locator('.theater-player .interaction-prompt').click();
  await page.getByRole("dialog", { name: "Theater screening" }).waitFor();
}
async function closeScreen(page) {
  await page.getByRole("button", { name: "Back to room", exact: false }).click();
}

test("the hallway connects both rooms, seats are interactive, and the studio survives the visit", async () => {
  const page = await signedInPage(browser, url, {
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
    const entryPosition = await page
      .getByTestId("theater-player")
      .evaluate((node) => node.style.top);
    await page.keyboard.press("e");
    await page.waitForFunction(() =>
      ["settling-in", "sitting-down"].includes(
        document.querySelector('[data-testid="theater-player"]').dataset.state,
      ),
    );
    await page.waitForFunction(
      () =>
        document.querySelector('[data-testid="theater-player"]').dataset
          .state === "sitting-down",
    );
    assert.notEqual(
      await page
        .getByTestId("theater-player")
        .evaluate((node) => node.style.top),
      entryPosition,
    );
    assert.equal(
      await page.getByRole("dialog", { name: "Theater screening" }).count(),
      0,
      "The screening opens after the sitting animation finishes",
    );
    await page.screenshot({ path: "/tmp/office-theater-sitting.png" });
    await page.waitForFunction(
      () =>
        document.querySelector('[data-testid="theater-player"]').dataset
          .state === "sitting",
    );
    const demo = page.getByRole("dialog", {
      name: "Theater screening",
      exact: true,
    });
    await demo.waitFor();
    await page.waitForFunction(() => {
      const video = document.querySelector(".theater-screen-dialog video");
      return video?.readyState >= 2 && video.currentTime > 0;
    });
    assert.match(
      await demo.locator("video").getAttribute("src"),
      /adialante-demo\.mp4/,
    );
    assert.equal(
      await demo.locator("video").evaluate((video) => video.muted),
      true,
    );
    await page.screenshot({ path: "/tmp/office-theater-demo.png" });
    await demo
      .getByRole("button", { name: "Pause for everyone", exact: false })
      .click();
    await demo
      .getByRole("button", { name: "Play together", exact: false })
      .waitFor();
    await demo
      .getByRole("button", { name: "Back to room", exact: false })
      .click();
    await page.getByRole("button", { name: "Watch demo", exact: true }).click();
    await demo.waitFor();
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
    await page
      .getByRole("dialog", { name: "Theater screening" })
      .getByRole("button", { name: "Back to room", exact: false })
      .click();
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

test("demo playback and late joining synchronize across users", async () => {
  const firstContext = await signedInContext(browser, url);
  const secondContext = await signedInContext(browser, url);
  const first = await firstContext.newPage(), second = await secondContext.newPage();
  try {
    await first.goto(`${url}/?room=theater`);
    await waitForTheater(first);
    await sit(first, "A2");
    await seek(first, 30);
    await second.goto(`${url}/?room=theater`);
    await waitForTheater(second);
    await sit(second, "B2");
    await second.waitForFunction(() => document.querySelector('.theater-screen-dialog video')?.currentTime >= 30);
    await second.getByRole("button", { name: "Pause for everyone", exact: false }).click();
    await first.getByRole("button", { name: "Play together", exact: false }).waitFor();
    await seek(first, 75);
    for (const page of [first, second]) {
      await page.waitForFunction(() => Math.abs(document.querySelector('.theater-screen-dialog video')?.currentTime - 75) < 1);
    }
    await second.getByRole("button", { name: "Sound off", exact: true }).click();
    assert.equal(await second.locator('.theater-screen-dialog video').evaluate(video => video.muted), false);
    assert.equal(await first.locator('.theater-screen-dialog video').evaluate(video => video.muted), true);
    await closeScreen(first);
    await first.getByRole("button", { name: "Back to studio", exact: false }).click();
    await second.getByRole("dialog", { name: "Theater screening" }).waitFor();
  } finally {
    await firstContext.close();
    await secondContext.close();
  }
});

test("demo loading errors recover when reopening the screening", async () => {
  const context = await signedInContext(browser, url);
  const page = await context.newPage();
  try {
    await context.route("**/media/adialante-demo.mp4", route => route.abort());
    await page.goto(`${url}/?room=theater`);
    await waitForTheater(page);
    await sit(page, "A2");
    await page.getByRole("alert").filter({ hasText: "That video couldn’t load" }).waitFor();
    await closeScreen(page);
    await context.unroute("**/media/adialante-demo.mp4");
    await page.getByRole("button", { name: "Watch demo", exact: true }).click();
    await page.waitForFunction(() => {
      const video = document.querySelector('.theater-screen-dialog video');
      return video?.readyState >= 2 && !video.paused;
    });
    assert.equal(await page.getByRole("alert").count(), 0);
  } finally {
    await context.close();
  }
});

test("mobile theater fits and works without BroadcastChannel", async () => {
  const page = await signedInPage(browser, url, {
    viewport: { width: 390, height: 844 },
  });
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
    await page.getByRole("dialog", { name: "Theater screening" }).waitFor();
    await page.waitForFunction(
      () =>
        document.querySelector(".theater-screen-dialog video")?.readyState >= 2,
    );
    await page.screenshot({
      path: "/tmp/office-theater-demo-mobile.png",
      fullPage: false,
    });
    await page
      .getByRole("dialog", { name: "Theater screening" })
      .getByRole("button", { name: "Back to room", exact: false })
      .click();
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
