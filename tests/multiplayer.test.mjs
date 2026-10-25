import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";

let browser, server, directory;
const url = "http://127.0.0.1:5182";
before(async () => {
  directory = await mkdtemp(join(tmpdir(), "office-multiplayer-"));
  server = spawn(
    process.execPath,
    [
      "node_modules/vite/bin/vite.js",
      "--host",
      "127.0.0.1",
      "--port",
      "5182",
      "--strictPort",
    ],
    {
      env: {
        ...process.env,
        OFFICE_DB: join(directory, "accounts.sqlite"),
        OFFICE_ACTIVITY_FILE: join(directory, "activity.json"),
      },
      stdio: "pipe",
    },
  );
  let output = "";
  server.stdout.on("data", (c) => (output += c));
  server.stderr.on("data", (c) => (output += c));
  for (let i = 0; i < 80; i++) {
    if (server.exitCode !== null) throw new Error(output);
    try {
      if ((await fetch(url)).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 150));
  }
  browser = await chromium.launch({
    channel: process.env.PLAYWRIGHT_CHANNEL || "chrome",
    headless: true,
  });
});
after(async () => {
  await browser?.close();
  server?.kill();
  await rm(directory, { recursive: true, force: true });
});

async function register(page, username) {
  await page.goto(url);
  await page.getByLabel("Username", { exact: true }).fill(username);
  assert.equal(await page.locator('input[type="password"]').count(), 0);
  await page
    .getByRole("button", { name: "Enter office ↗", exact: true })
    .click();
  await page
    .locator('[data-testid="connection-status"][data-connected="true"]')
    .waitFor({ state: "attached" });
}
test("separate users see movement without a studio chat panel, reconnect, and share theater playback", async () => {
  const aliceContext = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const bobContext = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const alice = await aliceContext.newPage(),
    bob = await bobContext.newPage();
  const errors = [];
  const consoleErrors = [];
  for (const page of [alice, bob]) {
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (message) => {
      if (["error", "warning"].includes(message.type()))
        consoleErrors.push(message.text());
    });
  }
  try {
    await alice.goto(url);
    assert.match(await alice.title(), /Office Hours/);
    await alice.getByRole("heading", { name: "Welcome back" }).waitFor();
    await alice.screenshot({ path: "/tmp/office-sign-in.png" });
    await register(alice, "alice");
    await register(bob, "bob");
    await alice
      .getByTestId("remote-player")
      .filter({ hasText: "bob" })
      .waitFor();
    await bob
      .getByTestId("remote-player")
      .filter({ hasText: "alice" })
      .waitFor();
    const previous = await alice
      .getByTestId("remote-player")
      .evaluate((n) => n.style.left);
    await bob.locator(".office-map").focus();
    await bob.keyboard.down("a");
    await bob.waitForTimeout(550);
    await bob.keyboard.up("a");
    await alice.waitForFunction(
      (previous) =>
        document.querySelector('[data-testid="remote-player"]').style.left !==
        previous,
      previous,
    );
    assert.equal(
      await alice
        .getByRole("complementary", { name: "Multiplayer chat" })
        .count(),
      0,
    );
    assert.equal(
      await alice.getByText("Studio people", { exact: true }).count(),
      0,
    );
    await alice
      .getByRole("button", { name: "Talk to bob", exact: true })
      .click();
    await alice
      .getByRole("dialog", { name: "Conversation with bob" })
      .waitFor();
    await alice
      .getByLabel("Message bob")
      .fill("Hello from the character screen");
    await alice.getByRole("button", { name: "Send ↗", exact: true }).click();
    await alice
      .getByRole("log")
      .getByText("Hello from the character screen", { exact: true })
      .waitFor();
    await bob
      .getByRole("button", { name: "Talk to alice", exact: true })
      .click();
    await bob
      .getByRole("log")
      .getByText("Hello from the character screen", { exact: true })
      .waitFor();
    await bob.getByLabel("Message alice").fill("Hey Alice!");
    await bob.getByRole("button", { name: "Send ↗", exact: true }).click();
    await alice
      .getByRole("log")
      .getByText("Hey Alice!", { exact: true })
      .waitFor();
    await alice
      .getByRole("button", { name: "Close conversation", exact: true })
      .click();
    await bob
      .getByRole("button", { name: "Close conversation", exact: true })
      .click();
    assert.equal(await alice.locator("vite-error-overlay").count(), 0);
    assert.deepEqual(consoleErrors, []);
    await alice.screenshot({
      path: "/tmp/office-multiplayer.png",
      fullPage: true,
    });
    await bob.reload();
    await bob
      .locator('[data-testid="connection-status"][data-connected="true"]')
      .waitFor({ state: "attached" });
    await bob
      .getByTestId("remote-player")
      .filter({ hasText: "alice" })
      .waitFor();
    await bobContext.setOffline(true);
    await bob.waitForTimeout(300);
    await bobContext.setOffline(false);
    await bob
      .locator('[data-testid="connection-status"][data-connected="true"]')
      .waitFor({ state: "attached" });
    await alice.goto(url + "/?room=theater");
    await bob.goto(url + "/?room=theater");
    for (const [page, seat] of [[alice, "A2"], [bob, "B2"]]) {
      await page.getByRole("button", { name: `Approach seat ${seat}`, exact: true }).click();
      await page.waitForFunction(seat => document.querySelector('.theater-player .interaction-prompt')?.textContent.includes(`Take seat ${seat}`), seat);
      await page.locator('.theater-player .interaction-prompt').click();
      await page.getByRole("dialog", { name: "Theater screening" }).waitFor();
    }
    await bob
      .getByRole("button", { name: "Pause for everyone", exact: false })
      .waitFor();
    await bob
      .getByRole("button", { name: "Pause for everyone", exact: false })
      .click();
    await alice
      .getByRole("button", { name: "Play together", exact: false })
      .waitFor();
    await bob.getByRole("button", { name: "Back to room", exact: false }).click();
    await bob.getByRole("button", { name: "Sign out" }).click();
    await bob.getByRole("heading", { name: "Welcome back" }).waitFor();
    await bob.getByLabel("Username", { exact: true }).fill("bob");
    await bob
      .getByRole("button", { name: "Enter office ↗", exact: true })
      .click();
    await bob
      .locator('[data-testid="connection-status"][data-connected="true"]')
      .waitFor({ state: "attached" });
    assert.deepEqual(errors, []);
  } finally {
    await aliceContext.close();
    await bobContext.close();
  }
});
test("sign-in and shared office fit a mobile screen", async () => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();
  try {
    await page.goto(url);
    await page.getByRole("heading", { name: "Welcome back" }).waitFor();
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await page.screenshot({ path: "/tmp/office-sign-in-mobile.png" });
    await register(page, "mobile_ui");
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await page.screenshot({
      path: "/tmp/office-multiplayer-mobile.png",
      fullPage: true,
    });
  } finally {
    await context.close();
  }
});

test("studio desks have one occupant and release on standing and disconnection", async () => {
  const aliceContext = await browser.newContext();
  const bobContext = await browser.newContext();
  const alice = await aliceContext.newPage(),
    bob = await bobContext.newPage();
  async function sitAt(page, name) {
    await page
      .getByRole("button", { name: `Sit in ${name}`, exact: true })
      .click();
    await page.waitForFunction(
      (name) =>
        document
          .querySelector(`[aria-label="Sit in ${name}"]`)
          ?.classList.contains("interaction-target"),
      name,
    );
    await page.keyboard.press("e");
    await page.getByLabel("Project HTML code").waitFor();
  }
  try {
    await register(alice, "desk_alice");
    await register(bob, "desk_bob");
    await sitAt(alice, "Your chair");
    await bob.waitForFunction(
      () => document.querySelector('[aria-label="Sit in Your chair"]').disabled,
    );
    await sitAt(bob, "Open chair");
    await alice
      .getByRole("button", { name: "Close project", exact: true })
      .click();
    await alice.keyboard.press("e");
    await bob.waitForFunction(
      () =>
        !document.querySelector('[aria-label="Sit in Your chair"]').disabled,
    );
    await alice.waitForFunction(
      () =>
        document.querySelector('[data-testid="player"]').dataset.state ===
        "standing",
    );
    await alice.keyboard.down("d");
    await alice.waitForTimeout(700);
    await alice.keyboard.up("d");
    await bob
      .getByRole("button", { name: "Close project", exact: true })
      .click();
    await bob.keyboard.press("e");
    await bob.waitForFunction(
      () =>
        document.querySelector('[data-testid="player"]').dataset.state ===
        "standing",
    );
    await sitAt(bob, "Your chair");
    await alice.waitForFunction(
      () => document.querySelector('[aria-label="Sit in Your chair"]').disabled,
    );
    await bobContext.close();
    await alice.waitForFunction(
      () =>
        !document.querySelector('[aria-label="Sit in Your chair"]').disabled,
    );
  } finally {
    await aliceContext.close();
    await bobContext.close();
  }
});
