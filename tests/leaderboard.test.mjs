import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

let server, browser;
const url = "http://127.0.0.1:5177";
before(async () => {
  server = spawn(
    process.execPath,
    [
      "node_modules/vite/bin/vite.js",
      "--host",
      "127.0.0.1",
      "--port",
      "5177",
      "--strictPort",
    ],
    {
      stdio: "pipe",
      env: {
        ...process.env,
        OFFICE_ACTIVITY_FILE: `test-results/leaderboard-activity-${process.pid}.json`,
      },
    },
  );
  let output = "";
  server.stdout.on("data", (data) => (output += data));
  server.stderr.on("data", (data) => (output += data));
  for (let i = 0; i < 60; i++) {
    if (server.exitCode !== null) throw new Error(output);
    try {
      if ((await fetch(url)).ok) break;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
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
const board = () => fetch(`${url}/api/activity/board`).then((r) => r.json());
async function eventually(check) {
  for (let i = 0; i < 50; i++) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  assert.fail("The studio board did not reach the expected state");
}
async function startPair(page, name) {
  await page.getByRole("button", { name: "Pair up", exact: true }).click();
  await page
    .getByRole("button", { name: `Pair with ${name}`, exact: true })
    .click();
  await page
    .getByRole("button", { name: "Start pairing", exact: false })
    .click();
}

test("real sessions record two distinct teams, exclude pauses, and survive a reload/name change", async () => {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  try {
    await page.goto(url);
    const profile = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("office-hours:activity-profile:v1")),
    );
    const ownPairs = async () =>
      (await board()).all.pairs.filter((p) =>
        p.members.some((m) => m.id === profile.id),
      );
    await startPair(page, "Milo");
    await eventually(async () => (await ownPairs())[0]?.duration > 1000);
    await page.getByRole("button", { name: "Pause", exact: false }).click();
    await eventually(async () => !(await ownPairs())[0]?.live);
    const paused = (await ownPairs())[0].duration;
    await new Promise((resolve) => setTimeout(resolve, 2100));
    assert.equal((await ownPairs())[0].duration, paused);
    await page.getByRole("button", { name: "Resume", exact: false }).click();
    await page
      .getByRole("button", { name: "Swap roles", exact: false })
      .click();
    await new Promise((resolve) => setTimeout(resolve, 1100));
    await page.getByRole("button", { name: "Finish", exact: true }).click();
    await page
      .getByRole("button", {
        name: "View your pair on the leaderboard",
        exact: false,
      })
      .click();
    await page.getByRole("tab", { name: "Pairs", exact: false }).waitFor();
    assert.equal(
      await page
        .getByRole("tab", { name: "Pairs", exact: false })
        .getAttribute("aria-selected"),
      "true",
    );
    await page
      .getByRole("button", { name: "Studio guest", exact: false })
      .click();
    await page.getByText("Recent time together", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Close leaderboard" }).click();
    await startPair(page, "Ada");
    await eventually(async () =>
      (await ownPairs()).some((p) => p.members.some((m) => m.id === "ada")),
    );
    await new Promise((resolve) => setTimeout(resolve, 1100));
    await page.getByRole("button", { name: "Finish", exact: true }).click();
    await page
      .getByRole("button", {
        name: "View your pair on the leaderboard",
        exact: false,
      })
      .click();
    await eventually(async () =>
      (await ownPairs()).every((p) => p.duration > 0),
    );
    const teams = await ownPairs();
    assert.equal(teams.length, 2);
    assert.ok(teams.every((p) => p.sessionCount === 1));
    await page.getByRole("button", { name: "Edit name", exact: false }).click();
    await page.getByLabel("Your leaderboard name").fill("Avery");
    await page.getByRole("button", { name: "Save name" }).click();
    await eventually(async () =>
      (await ownPairs()).every((p) =>
        p.members.some((m) => m.name === "Avery"),
      ),
    );
    await page.getByLabel("Leaderboard period").selectOption("all");
    await page.screenshot({
      path: "test-results/leaderboard-pairs.png",
      animations: "disabled",
    });
    await page.getByRole("tab", { name: "People", exact: false }).click();
    await page.getByLabel("Rank people by").selectOption("pairing");
    await page.screenshot({
      path: "test-results/leaderboard-people.png",
      animations: "disabled",
    });
    await page.reload();
    await page.getByRole("button", { name: "Open studio leaderboard" }).click();
    await page.getByRole("tab", { name: "Pairs", exact: false }).click();
    await page
      .getByRole("button", { name: "Avery", exact: false })
      .first()
      .waitFor();
    const after = await ownPairs();
    assert.deepEqual(
      after.map((p) => p.id).sort(),
      teams.map((p) => p.id).sort(),
    );
    assert.ok(after.every((p) => p.sessionCount === 1));
    assert.deepEqual(errors, []);
  } finally {
    await page.close();
  }
});

test("mobile board fits the studio, traps focus, and names sync to another tab", async () => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();
  try {
    await page.goto(`${url}/?room=leetcode`);
    await page.getByRole("button", { name: "Open studio leaderboard" }).click();
    await page
      .getByText("Your identity stays with this browser.", { exact: false })
      .waitFor();
    await page.keyboard.press("Shift+Tab");
    assert.equal(
      await page
        .getByRole("button", { name: "Make time for company.", exact: false })
        .evaluate((n) => n === document.activeElement),
      true,
    );
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await page.getByRole("tab", { name: "Pairs", exact: false }).click();
    await page.screenshot({
      path: "test-results/leaderboard-mobile.png",
      animations: "disabled",
    });
    await page.getByRole("button", { name: "Edit name", exact: false }).click();
    await page.getByLabel("Your leaderboard name").fill("Studio pal");
    await page.getByRole("button", { name: "Save name" }).click();
    const other = await context.newPage();
    await other.goto(url);
    await other
      .getByRole("button", { name: "Open studio leaderboard" })
      .click();
    await other
      .locator(".standing-profile > strong")
      .filter({ hasText: "Studio pal" })
      .waitFor();
    await page.keyboard.press("Escape");
    assert.equal(await page.getByRole("dialog").count(), 0);
    assert.equal(
      await page
        .getByRole("button", { name: "Open studio leaderboard" })
        .evaluate((n) => n === document.activeElement),
      true,
    );
    assert.equal(new URL(page.url()).searchParams.get("room"), "leetcode");
    await page.setViewportSize({ width: 360, height: 800 });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
  } finally {
    await context.close();
  }
});

test("connection failure is recoverable and blocked storage uses an explicit temporary identity", async () => {
  const page = await browser.newPage();
  try {
    await page.addInitScript(() => {
      Storage.prototype.getItem = () => {
        throw new Error("blocked");
      };
      Storage.prototype.setItem = () => {
        throw new Error("blocked");
      };
    });
    await page.route("**/api/activity/heartbeat", (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: "{}",
      }),
    );
    await page.goto(url);
    await page.getByRole("button", { name: "Open studio leaderboard" }).click();
    await page.getByText("Temporary profile", { exact: false }).waitFor();
    await page
      .getByRole("button", { name: "Try again", exact: false })
      .waitFor();
    await page.unroute("**/api/activity/heartbeat");
    await page.getByRole("button", { name: "Try again", exact: false }).click();
    await page.getByText("● Updates every 5s", { exact: true }).waitFor();
  } finally {
    await page.close();
  }
});
