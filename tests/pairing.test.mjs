import {
  signedInPage,
  signedInContext,
  authenticatedFetch,
} from "./auth-helpers.mjs";
import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

let browser, server;
const url = "http://127.0.0.1:5174";
before(async () => {
  server = spawn(
    process.execPath,
    [
      "node_modules/vite/bin/vite.js",
      "--host",
      "127.0.0.1",
      "--port",
      "5174",
      "--strictPort",
    ],
    {
      stdio: "pipe",
      env: {
        ...process.env,
        OFFICE_DB: `test-results/accounts-${process.pid}-${new URL(url).port}.sqlite`,
        OFFICE_ACTIVITY_FILE: `test-results/pairing-activity-${process.pid}.json`,
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
      throw new Error(`Test server stopped: ${output}`);
    try {
      if ((await fetch(url)).ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  assert.ok(ready, `Test server did not start: ${output}`);
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

async function openPair(page, name = "Milo") {
  await page.goto(url);
  await page.getByRole("button", { name: "Pair up", exact: true }).click();
  await page
    .getByRole("button", { name: `Pair with ${name}`, exact: true })
    .click();
  await page.getByLabel("What shall we work on?").waitFor();
}

test("pairing: reviewed changes, driver ownership, pause, recap, and draft recovery", async () => {
  const page = await signedInPage(browser, url, {
    viewport: { width: 1536, height: 1024 },
    acceptDownloads: true,
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    await openPair(page);
    await page.getByLabel("What shall we work on?").fill("  ");
    assert.equal(
      await page.getByRole("button", { name: "Start pairing" }).isDisabled(),
      true,
    );
    await page
      .getByLabel("What shall we work on?")
      .fill("Make a friendlier welcome");
    await page.getByRole("button", { name: "Start pairing" }).click();
    const editor = page.getByRole("textbox", { name: "Project HTML code" });
    assert.equal(await editor.getAttribute("readonly"), null);
    await page
      .getByRole("button", { name: "A warmer welcome", exact: true })
      .click();
    const original = await editor.inputValue();
    await editor.fill(original.replace("Something small.", "Our own edit."));
    await page.getByRole("button", { name: "Apply change" }).click();
    assert.ok(
      (await editor.inputValue()).includes("Our own edit."),
      "stale patch must preserve new edits",
    );
    assert.ok(
      (await page.getByRole("status").allTextContents()).some((text) =>
        text.includes("code changed"),
      ),
    );
    await page
      .getByRole("button", { name: "A warmer welcome", exact: true })
      .click();
    await page.getByRole("button", { name: "Apply change" }).click();
    assert.ok((await editor.inputValue()).includes("A little room to grow"));
    await page.getByRole("button", { name: "Run", exact: false }).click();
    await page
      .frameLocator("iframe")
      .getByRole("heading", { name: "A little room to grow" })
      .waitFor();
    await page
      .frameLocator("iframe")
      .getByRole("button", { name: "Say hello" })
      .click();
    await page.getByRole("button", { name: "Run", exact: false }).click();
    await page
      .frameLocator("iframe")
      .getByRole("button", { name: "Say hello" })
      .waitFor();
    assert.equal(
      await page.getByLabel("Run the shared code").isChecked(),
      true,
    );
    await page
      .getByRole("button", { name: "Swap roles", exact: false })
      .click();
    assert.notEqual(await editor.getAttribute("readonly"), null);
    await page
      .getByRole("button", { name: "An accessible detail", exact: true })
      .click();
    await page.getByRole("button", { name: "Apply change" }).click();
    assert.ok((await editor.inputValue()).includes('lang="en"'));
    await page.getByRole("button", { name: "Pause", exact: false }).click();
    assert.equal(
      await page
        .getByRole("button", { name: "A softer accent", exact: true })
        .isDisabled(),
      true,
    );
    assert.equal(
      await page
        .getByRole("button", { name: "Run", exact: false })
        .isDisabled(),
      true,
    );
    await page.getByRole("button", { name: "Resume", exact: false }).click();
    await page
      .getByRole("button", { name: "Swap roles", exact: false })
      .click();
    assert.equal(await editor.getAttribute("readonly"), null);
    assert.equal(await page.locator('.companion-chat').count(), 0);
    await page.getByLabel("Review the result").check();
    await page
      .getByLabel("Leave a thought for later")
      .fill("Next: add a small watering animation.");
    await page.screenshot({
      path: "test-results/pair-desktop.png",
      animations: "disabled",
    });
    const savedCode = await editor.inputValue();
    await page.keyboard.press("Escape");
    await page
      .getByRole("heading", { name: "Good company. Good progress." })
      .waitFor();
    assert.equal(
      await page
        .locator(".pair-recap-stats")
        .innerText()
        .then((text) => text.includes("3/3")),
      true,
    );
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Save recap & code" }).click();
    const file = await download;
    assert.equal(file.suggestedFilename(), "office-hours-milo-pairing.md");
    let recap = "";
    for await (const chunk of await file.createReadStream()) recap += chunk;
    assert.ok(recap.includes("Make a friendlier welcome"));
    assert.ok(recap.includes("Next: add a small watering animation."));
    assert.ok(recap.includes(savedCode));
    await page.screenshot({
      path: "test-results/pair-recap.png",
      animations: "disabled",
    });
    await page.getByRole("button", { name: "Back to workspace" }).click();
    assert.equal(await page.locator(".companion-chat").count(), 0);
    await page.getByRole("button", { name: "Close project" }).click();
    await page.reload();
    await page.getByRole("button", { name: "Pair up", exact: true }).click();
    await page
      .getByRole("button", { name: "Pair with Milo", exact: true })
      .click();
    assert.equal(
      await page.getByLabel("Project HTML code").inputValue(),
      savedCode,
    );
    assert.deepEqual(errors, []);
  } finally {
    await page.close();
  }
});

test("ordinary desk access and editing still work when browser storage is blocked", async () => {
  const page = await signedInPage(browser, url);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    await page.addInitScript(() => {
      Storage.prototype.getItem = () => {
        throw new Error("Storage unavailable");
      };
      Storage.prototype.setItem = () => {
        throw new Error("Storage unavailable");
      };
    });
    await page.goto(url);
    await page
      .getByRole("button", { name: "Visit Your desk’s computer", exact: false })
      .click();
    await page.waitForFunction(
      () =>
        document
          .querySelector(".interaction-prompt")
          ?.textContent.includes("Open computer"),
      {},
      { timeout: 20000 },
    );
    await page.keyboard.press("e");
    await page.getByRole("dialog").waitFor();
    assert.equal(
      await page.getByRole("tab", { name: "Pair session" }).count(),
      0,
    );
    await page.getByLabel("Project HTML code").fill("<h1>Still building</h1>");
    await page.getByRole("button", { name: "Run", exact: false }).click();
    await page
      .frameLocator("iframe")
      .getByRole("heading", { name: "Still building" })
      .waitFor();
    await page.getByRole("button", { name: "Close project" }).click();
    await page.getByRole("button", { name: "Pair up", exact: true }).click();
    await page
      .getByRole("button", { name: "Pair with Leo", exact: true })
      .click();
    await page.getByRole("button", { name: "Start pairing" }).click();
    await page
      .getByLabel("Project HTML code")
      .fill("<main>A fresh start</main>");
    await page
      .getByRole("button", { name: "A warmer welcome", exact: true })
      .click();
    assert.ok(
      (await page.getByRole("status").allTextContents()).some((text) =>
        text.includes("doesn’t fit"),
      ),
    );
    assert.equal(
      await page.getByLabel("Project HTML code").inputValue(),
      "<main>A fresh start</main>",
    );
    assert.deepEqual(errors, []);
  } finally {
    await page.close();
  }
});

test("five minute turns use elapsed time and exclude paused time", async () => {
  const page = await signedInPage(browser, url);
  try {
    await openPair(page, "Jun");
    await page.clock.install();
    await page.getByRole("button", { name: "Start pairing" }).click();
    await page.clock.fastForward(60000);
    assert.ok(
      (await page.locator(".pair-turn-clock").innerText()).includes("04:00"),
    );
    await page.getByRole("button", { name: "Pause", exact: false }).click();
    await page.clock.fastForward(60000);
    assert.ok(
      (await page.locator(".pair-turn-clock").innerText()).includes("04:00"),
    );
    await page.getByRole("button", { name: "Resume", exact: false }).click();
    await page.clock.fastForward(240000);
    assert.equal(
      await page.locator(".pair-turn-clock").innerText(),
      "Time to swap",
    );
    await page
      .getByRole("button", { name: "Swap roles", exact: false })
      .click();
    assert.ok(
      (await page.locator(".pair-turn-clock").innerText()).includes("05:00"),
    );
  } finally {
    await page.close();
  }
});

test("pairing stays reachable on mobile and the lobby traps keyboard focus", async () => {
  const page = await signedInPage(browser, url, {
    viewport: { width: 390, height: 844 },
  });
  try {
    await page.goto(url);
    await page.getByRole("button", { name: "Pair up", exact: true }).click();
    await page.screenshot({
      path: "test-results/pair-lobby-mobile.png",
      animations: "disabled",
    });
    await page.keyboard.press("Shift+Tab");
    assert.equal(
      await page
        .getByRole("button", { name: "Pair with Ada", exact: true })
        .evaluate((node) => node === document.activeElement),
      true,
    );
    await page
      .getByRole("button", { name: "Pair with Ada", exact: true })
      .click();
    await page.getByRole("button", { name: "Start pairing" }).click();
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await page
      .getByRole("button", { name: "A softer accent", exact: true })
      .click();
    await page.getByRole("button", { name: "Apply change" }).click();
    await page.screenshot({
      path: "test-results/pair-mobile.png",
      animations: "disabled",
    });
    await page.getByRole("button", { name: "Run", exact: false }).click();
    await page
      .frameLocator("iframe")
      .getByRole("heading", { name: "Postcards" })
      .waitFor();
    await page.getByRole("button", { name: "Pair session" }).click();
    await page
      .getByRole("button", { name: "A warmer welcome", exact: true })
      .click();
    await page.screenshot({
      path: "test-results/pair-review-mobile.png",
      animations: "disabled",
    });
    await page.getByRole("button", { name: "Finish", exact: true }).click();
    await page.getByRole("button", { name: "Back to workspace" }).click();
    assert.equal(
      await page.getByRole("button", { name: "Start pairing" }).isVisible(),
      true,
    );
    await page.getByRole("button", { name: "Close project" }).click();
    assert.equal(await page.getByRole("dialog").count(), 0);
  } finally {
    await page.close();
  }
});

test("sitting opens the studio computer once, and NPC interactions open a character conversation", async () => {
  const page = await signedInPage(browser, url, {
    viewport: { width: 1440, height: 1000 },
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    await page.goto(url);
    await page
      .getByRole("button", { name: "Sit in Your chair", exact: true })
      .click();
    await page.waitForFunction(() =>
      document
        .querySelector('[aria-label="Sit in Your chair"]')
        ?.classList.contains("interaction-target"),
    );
    await page.keyboard.press("e");
    await page.getByLabel("Project HTML code").waitFor();
    assert.equal(
      await page.getByTestId("player").getAttribute("data-state"),
      "sitting",
    );
    await page
      .getByRole("button", { name: "Close project", exact: true })
      .click();
    await page.waitForTimeout(300);
    assert.equal(
      await page.getByLabel("Project HTML code").count(),
      0,
      "Closing a computer must not reopen it while still seated",
    );
    await page.reload();
    await page
      .getByRole("button", { name: "Talk to Ada", exact: true })
      .click();
    await page.waitForFunction(() =>
      document
        .querySelector(".player .interaction-prompt")
        ?.textContent.includes("Talk to Ada"),
    );
    await page.keyboard.press("e");
    const conversation = page.getByRole("dialog", {
      name: "Conversation with Ada",
      exact: true,
    });
    await conversation.waitFor();
    assert.equal(
      await conversation.locator(".conversation-portrait canvas").count(),
      1,
    );
    assert.equal(await page.getByLabel("Project HTML code").count(), 0);
    await page.getByLabel("Message Ada").fill("Hello Ada!");
    await conversation
      .getByRole("button", { name: "Send ↗", exact: true })
      .click();
    await conversation
      .getByRole("log")
      .getByText("Hello Ada!", { exact: true })
      .waitFor();
    await conversation
      .getByRole("log")
      .getByText("Hey, welcome to the studio!", { exact: false })
      .waitFor();
    await conversation
      .getByRole("button", { name: "Previous dialogue", exact: true })
      .click();
    await conversation
      .getByRole("log")
      .getByText("Hello Ada!", { exact: true })
      .waitFor();
    await conversation
      .getByRole("button", { name: "Next dialogue", exact: true })
      .click();
    await conversation
      .getByRole("log")
      .getByText("Hey, welcome to the studio!", { exact: false })
      .waitFor();
    await page.screenshot({ path: "/tmp/office-character-conversation.png" });
    await page.setViewportSize({ width: 576, height: 384 });
    assert.equal(
      await conversation.evaluate((node) => {
        const rect = node.getBoundingClientRect();
        return (
          rect.left >= 0 &&
          rect.right <= innerWidth &&
          rect.top >= 0 &&
          rect.bottom <= innerHeight
        );
      }),
      true,
    );
    await page.screenshot({ path: "/tmp/office-dialogue-reference-size.png" });

    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await page.getByLabel("Message Ada").fill("A little mobile hello");
    await page.screenshot({
      path: "/tmp/office-character-conversation-mobile.png",
    });
    await page.keyboard.press("Escape");
    await conversation.waitFor({ state: "detached" });
    assert.deepEqual(errors, []);
  } finally {
    await page.close();
  }
});

test("computer projects run separate HTML, CSS and JS files and preserve added files", async () => {
  const page = await signedInPage(browser, url, {
    viewport: { width: 1440, height: 1000 },
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  async function openDesk() {
    await page.goto(url);
    await page
      .getByRole("button", { name: "Visit Your desk’s computer", exact: false })
      .click();
    await page.waitForFunction(() =>
      document
        .querySelector(".player .interaction-prompt")
        ?.textContent.includes("Open computer"),
    );
    await page.keyboard.press("e");
    await page.getByLabel("Project HTML code").waitFor();
  }
  async function addFile(name) {
    await page.getByRole("button", { name: "+ Add file", exact: true }).click();
    await page.getByLabel("New file name").fill(name);
    await page
      .getByRole("button", { name: "Create file", exact: true })
      .click();
  }
  try {
    await openDesk();
    const html =
      '<!doctype html><html><head><link rel="stylesheet" href="./styles.css"></head><body><h1 id="result">HTML works</h1><button id="go">Try JavaScript</button><p id="extra"></p><script src="./script.js"></script></body></html>';
    await page.getByLabel("Project HTML code").fill(html);
    await page.getByRole("button", { name: "styles.css", exact: true }).click();
    await page
      .getByLabel("Project CSS code")
      .fill("body { background: rgb(12, 34, 56); }");
    await page.getByRole("button", { name: "script.js", exact: true }).click();
    await page
      .getByLabel("Project JavaScript code")
      .fill(
        'window.runCount = (window.runCount || 0) + 1; document.querySelector("#go").onclick = () => { document.querySelector("#result").textContent = "JS works " + window.runCount; };',
      );
    await addFile("extra.js");
    await page
      .getByLabel("Project JavaScript code")
      .fill(
        'document.querySelector("#extra").textContent = "Extra JavaScript loaded";',
      );
    await addFile("extra.css");
    await page.getByLabel("Project CSS code").fill("h1 { font-size: 37px; }");
    await page.getByRole("button", { name: "Run", exact: false }).click();
    const preview = page.frameLocator('iframe[title="Your project preview"]');
    await preview
      .getByText("Extra JavaScript loaded", { exact: true })
      .waitFor();
    assert.equal(
      await preview
        .locator("body")
        .evaluate((node) => getComputedStyle(node).backgroundColor),
      "rgb(12, 34, 56)",
    );
    assert.equal(
      await preview
        .locator("h1")
        .evaluate((node) => getComputedStyle(node).fontSize),
      "37px",
    );
    await preview.getByRole("button", { name: "Try JavaScript" }).click();
    await preview
      .getByRole("heading", { name: "JS works 1", exact: true })
      .waitFor();
    await page.getByRole("button", { name: "index.html", exact: true }).click();
    assert.equal(await page.getByLabel("Project HTML code").inputValue(), html);
    await addFile("about.html");
    await page
      .getByLabel("Project HTML code")
      .fill(html.replace("HTML works", "Another HTML page"));
    assert.equal(
      await page.getByLabel("Preview HTML file").inputValue(),
      "about.html",
    );
    await page.getByRole("button", { name: "Run", exact: false }).click();
    await preview
      .getByRole("heading", { name: "Another HTML page", exact: true })
      .waitFor();
    await addFile("Styles.CSS");
    await page
      .getByRole("alert")
      .filter({ hasText: "already exists" })
      .waitFor();
    await page.getByLabel("New file name").fill("../escape.js");
    await page
      .getByRole("button", { name: "Create file", exact: true })
      .click();
    await page
      .getByRole("alert")
      .filter({ hasText: "without folders" })
      .waitFor();
    await page.getByRole("button", { name: "+ Add file", exact: true }).click();
    await page.screenshot({ path: "/tmp/office-multi-file-computer.png" });
    await page
      .getByRole("button", { name: "Close project", exact: true })
      .click();
    await openDesk();
    await page.getByRole("button", { name: "extra.js", exact: true }).click();
    assert.match(
      await page.getByLabel("Project JavaScript code").inputValue(),
      /Extra JavaScript loaded/,
    );
    await page.getByLabel("Preview HTML file").selectOption("about.html");
    await page.getByRole("button", { name: "Run", exact: false }).click();
    await preview
      .getByRole("heading", { name: "Another HTML page", exact: true })
      .waitFor();
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await page.screenshot({
      path: "/tmp/office-multi-file-computer-mobile.png",
      fullPage: true,
    });
    assert.deepEqual(errors, []);
  } finally {
    await page.close();
  }
});
