import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";
import { studyProblems } from "../src/leetcodeProblems.js";

let browser, server;
const url = "http://127.0.0.1:5176";
before(async () => {
  server = spawn(
    process.execPath,
    [
      "node_modules/vite/bin/vite.js",
      "--host",
      "127.0.0.1",
      "--port",
      "5176",
      "--strictPort",
    ],
    { stdio: "pipe" },
  );
  let output = "";
  server.stdout.on("data", (data) => (output += data));
  server.stderr.on("data", (data) => (output += data));
  let ready = false;
  for (let i = 0; i < 60; i++) {
    if (server.exitCode !== null) throw new Error(output);
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
const titles = [
  "Two Sum",
  "Valid Parentheses",
  "Best Time to Buy and Sell Stock",
  "Contains Duplicate",
  "Valid Anagram",
  "Binary Search",
  "Product of Array Except Self",
  "Longest Substring Without Repeating Characters",
];
const names = [
  "twoSum",
  "isValid",
  "maxProfit",
  "containsDuplicate",
  "isAnagram",
  "search",
  "productExceptSelf",
  "lengthOfLongestSubstring",
];
const ids = ["1", "20", "121", "217", "242", "704", "238", "3"];
const params = [
  "nums, target",
  "s",
  "prices",
  "nums",
  "s, t",
  "nums, target",
  "nums",
  "s",
];
const solution = `var twoSum = function(nums, target) {
  const seen = new Map();
  for (let i = 0; i < nums.length; i++) {
    if (seen.has(target - nums[i])) return [seen.get(target - nums[i]), i];
    seen.set(nums[i], i);
  }
};`;
async function setup(viewport = { width: 1536, height: 1024 }) {
  const context = await browser.newContext({ viewport });
  const controls = {
    catalogFails: false,
    problemFails: false,
    profilesFail: false,
    newAccepted: false,
  };
  await context.route("**/api/leetcode/**", async (route) => {
    const endpoint = new URL(route.request().url()),
      path = endpoint.pathname;
    const fulfill = (body, status = 200) =>
      route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(body),
      });
    if (path.endsWith("/catalog"))
      return controls.catalogFails
        ? fulfill({ error: "LeetCode is unavailable. Try again shortly." }, 502)
        : fulfill({
            source: "LeetCode",
            fetchedAt: new Date().toISOString(),
            problems: studyProblems.map((item, index) => ({
              id: ids[index],
              slug: item.slug,
              title: titles[index],
              difficulty: index < 6 ? "Easy" : "Medium",
              tags: [index < 4 ? "Array" : "String"],
              focus: item.focus,
            })),
          });
    if (path.includes("/problems/")) {
      if (controls.problemFails)
        return fulfill({ error: "LeetCode couldn’t be reached." }, 502);
      const slug = path.split("/").at(-1),
        index = studyProblems.findIndex((item) => item.slug === slug);
      return fulfill({
        source: "LeetCode",
        fetchedAt: new Date().toISOString(),
        id: ids[index],
        slug,
        title: titles[index],
        difficulty: index < 6 ? "Easy" : "Medium",
        tags: ["Array", "Hash Table"],
        functionName: names[index],
        starterCode: `var ${names[index]} = function(${params[index]}) {\n  \n};`,
        content: `<p>Fixture problem statement for <strong>${titles[index]}</strong>.</p><pre>Work through the examples in your editor.</pre><script>window.problemInjected = true</script><img src="x" onerror="window.problemInjected = true"><a href="javascript:window.problemInjected=true">Unsafe fixture link</a>`,
      });
    }
    if (path.includes("/profiles/")) {
      if (controls.profilesFail)
        return fulfill(
          { error: "Profile sync is unavailable right now." },
          502,
        );
      const username = decodeURIComponent(path.split("/").at(-1));
      if (username.toLowerCase() === "missing")
        return fulfill(
          { error: "We couldn’t find that public LeetCode profile." },
          404,
        );
      const bob = username.toLowerCase() === "bob";
      return fulfill({
        source: "LeetCode",
        username: bob ? "Bob" : "Alice",
        easy: bob ? 1 : controls.newAccepted ? 11 : 10,
        medium: bob ? 1 : 2,
        hard: bob ? 5 : 1,
        total: bob ? 7 : controls.newAccepted ? 14 : 13,
        ranking: 123,
        fetchedAt: new Date().toISOString(),
        recent: bob
          ? []
          : [
              {
                id: "12345",
                title: "Two Sum",
                slug: "two-sum",
                timestamp: controls.newAccepted
                  ? Date.now()
                  : Date.now() - 86400000,
              },
            ],
      });
    }
    return fulfill({ error: "Unknown fixture endpoint" }, 404);
  });
  const page = await context.newPage(),
    errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  return { context, page, controls, errors };
}
async function enter(page) {
  await page.goto(`${url}/?room=leetcode`);
  await page
    .locator(".room-title")
    .filter({ hasText: "The algorithm room" })
    .waitFor();
  await page.locator(".lab-problem-card").first().waitFor();
}
async function sit(page, id = "01") {
  await page
    .getByRole("button", { name: `Approach coding desk ${id}`, exact: true })
    .click();
  await page.waitForFunction(
    (id) =>
      document
        .querySelector(".lab-player .interaction-prompt")
        ?.textContent.includes(`Sit at desk ${id}`),
    id,
    { timeout: 20000 },
  );
  await page.keyboard.press("e");
  await page.waitForFunction(
    () =>
      document.querySelector('[data-testid="lab-player"]').dataset.state ===
      "sitting",
  );
}
async function openComputer(page) {
  await page
    .getByRole("button", { name: "Open computer", exact: false })
    .last()
    .click();
  await page
    .getByLabel("LeetCode JavaScript code")
    .waitFor({ state: "attached" });
}
async function addProfile(page, name) {
  await page.getByLabel("Track a LeetCode username").fill(name);
  await page.getByRole("button", { name: "Add", exact: false }).click();
  await page
    .locator(".leetcode-rank-info a")
    .filter({ hasText: name })
    .waitFor();
}

test("new room is right of the theater, uses seated computers, and preserves selected real problems", async () => {
  const { context, page, errors } = await setup();
  try {
    await page.goto(url);
    const theater = await page
        .getByRole("button", { name: "Walk down the hallway to the theater" })
        .boundingBox(),
      lab = await page
        .getByRole("button", {
          name: "Walk to the algorithm room to the right of the theater",
        })
        .boundingBox();
    assert.ok(lab.x > theater.x);
    assert.equal(
      await page.getByText("THE WORKSPACE", { exact: true }).count(),
      0,
    );
    assert.equal(
      await page.getByText("TAKE A BREATHER", { exact: true }).count(),
      0,
    );
    await page
      .getByRole("button", {
        name: "Walk to the algorithm room to the right of the theater",
      })
      .click();
    await page.locator(".lab-problem-card").first().waitFor();
    await page
      .locator(".lab-problem-card")
      .filter({ hasText: "Binary Search" })
      .click();
    await page.waitForFunction(() =>
      document
        .querySelector(".lab-player .interaction-prompt")
        ?.textContent.includes("Sit at desk 01"),
    );
    await page.keyboard.press("e");
    await page.waitForFunction(() =>
      document
        .querySelector(".lab-player .interaction-prompt")
        ?.textContent.includes("Open computer"),
    );
    await page.keyboard.press("e");
    await page.getByLabel("LeetCode JavaScript code").waitFor();
    assert.match(
      await page.locator(".leetcode-workspace-intro h1").innerText(),
      /Binary Search/,
    );
    assert.equal(await page.evaluate(() => window.problemInjected), undefined);
    assert.equal(
      await page
        .locator('.leetcode-problem-html [href^="javascript:"]')
        .count(),
      0,
    );
    await page
      .getByRole("button", { name: "Close LeetCode workspace" })
      .click();
    await page.getByRole("button", { name: "Stand up", exact: true }).click();
    await sit(page, "04");
    await openComputer(page);
    assert.match(
      await page.locator(".leetcode-workspace-intro h1").innerText(),
      /Product of Array/,
    );
    await page
      .getByRole("button", { name: "Close LeetCode workspace" })
      .click();
    await page.getByRole("button", { name: "Stand up", exact: true }).click();
    await page
      .getByRole("button", {
        name: "Walk back to the studio from the algorithm room",
      })
      .click();
    await page.waitForFunction(
      () => !document.querySelector(".studio-view").hidden,
      {},
      { timeout: 20000 },
    );
    assert.ok(
      (await page.getByTestId("player").getAttribute("style")).includes("66%"),
    );
    assert.equal(await page.locator(".npc").count(), 4);
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
});
test("practice runs show failures, successes, stale output, reset undo, and recover persisted drafts without changing rankings", async () => {
  const { context, page, errors } = await setup();
  try {
    await enter(page);
    await addProfile(page, "Alice");
    const before = await page
      .locator(".leetcode-rank-score strong")
      .innerText();
    await sit(page);
    await openComputer(page);
    const editor = page.getByLabel("LeetCode JavaScript code");
    await editor.fill("var twoSum = () => [];");
    await page
      .getByRole("button", { name: "Run practice tests", exact: false })
      .click();
    await page
      .getByRole("status")
      .filter({ hasText: "0/5 practice cases passed" })
      .waitFor();
    await editor.fill(solution);
    await page
      .getByRole("button", { name: "Run practice tests", exact: false })
      .click();
    await page
      .getByRole("status")
      .filter({ hasText: "5/5 practice cases passed" })
      .waitFor();
    await page.screenshot({
      path: "test-results/leetcode-workspace.png",
      animations: "disabled",
    });
    await editor.fill(solution + "\n// one small step");
    await page
      .getByRole("status")
      .filter({ hasText: "Code changed" })
      .waitFor();
    await page.getByRole("button", { name: "Reset", exact: false }).click();
    await page
      .getByRole("button", { name: "Undo reset", exact: false })
      .click();
    assert.equal(await editor.inputValue(), solution + "\n// one small step");
    await editor.focus();
    await page.keyboard.press("Tab");
    assert.notEqual(
      await editor.evaluate((node) => node === document.activeElement),
      true,
      "Tab should leave the editor",
    );
    await page.keyboard.press("Escape");
    assert.equal(
      await page.locator(".leetcode-rank-score strong").innerText(),
      before,
    );
    await openComputer(page);
    assert.equal(await editor.inputValue(), solution + "\n// one small step");
    await page
      .getByRole("button", { name: "Close LeetCode workspace" })
      .click();
    await page.reload();
    await sit(page);
    await openComputer(page);
    assert.equal(await editor.inputValue(), solution + "\n// one small step");
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
});
test("live-profile rankings use weights, verify only new Accepted activity, and keep cached standings on failure", async () => {
  const { context, page, controls, errors } = await setup();
  try {
    await enter(page);
    await addProfile(page, "Alice");
    await addProfile(page, "Bob");
    assert.match(
      await page.locator(".leetcode-rank-info a").first().innerText(),
      /Bob/,
    );
    assert.equal(
      await page.locator(".leetcode-rank-score strong").first().innerText(),
      "29",
    );
    await page.screenshot({
      path: "test-results/leetcode-room.png",
      animations: "disabled",
    });
    await page.getByLabel("Profile for Accepted checks").selectOption("Alice");
    await sit(page);
    await openComputer(page);
    await page
      .getByRole("button", { name: "Check Accepted", exact: false })
      .click();
    await page
      .getByRole("status")
      .filter({ hasText: "No new public Accepted" })
      .waitFor();
    assert.equal(
      await page
        .getByRole("link", { name: "View Alice’s Accepted submission" })
        .count(),
      0,
    );
    controls.newAccepted = true;
    await page
      .getByRole("button", { name: "Check Accepted", exact: false })
      .click();
    await page
      .getByRole("link", {
        name: "View Alice’s Accepted submission",
        exact: false,
      })
      .waitFor();
    await page
      .getByRole("button", { name: "Close LeetCode workspace" })
      .click();
    assert.equal(
      await page
        .locator(".leetcode-ranks li")
        .filter({ hasText: "Alice" })
        .locator(".leetcode-rank-score strong")
        .innerText(),
      "22",
    );
    controls.profilesFail = true;
    await page.getByRole("button", { name: "Refresh", exact: false }).click();
    await page
      .getByRole("status")
      .filter({ hasText: "Some profiles couldn’t refresh" })
      .waitFor();
    assert.equal(await page.locator(".leetcode-ranks li").count(), 2);
    controls.profilesFail = false;
    await page
      .getByRole("button", { name: "Remove Bob from leaderboard" })
      .click();
    assert.equal(await page.locator(".leetcode-ranks li").count(), 1);
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
});
test("runner stops infinite loops, blocks network access, and remains usable afterward", async () => {
  const { context, page, errors } = await setup();
  try {
    let leaked = 0;
    await context.route("**/runner-leak", (route) => {
      leaked++;
      return route.fulfill({ body: "unexpected" });
    });
    await enter(page);
    await sit(page);
    await openComputer(page);
    const editor = page.getByLabel("LeetCode JavaScript code");
    await editor.fill("var twoSum = () => { while(true) {} };");
    await page
      .getByRole("button", { name: "Run practice tests", exact: false })
      .click();
    await page
      .getByRole("alert")
      .filter({ hasText: "stopped after 2 seconds" })
      .waitFor({ timeout: 6000 });
    await editor.fill(
      `var twoSum = async () => { await fetch('${url}/runner-leak'); return []; };`,
    );
    await page
      .getByRole("button", { name: "Run practice tests", exact: false })
      .click();
    await page
      .getByRole("status")
      .filter({ hasText: "0/5 practice cases passed" })
      .waitFor();
    assert.equal(leaked, 0);
    await editor.fill(solution);
    await page
      .getByRole("button", { name: "Run practice tests", exact: false })
      .click();
    await page
      .getByRole("status")
      .filter({ hasText: "5/5 practice cases passed" })
      .waitFor();
    assert.equal(
      await page
        .locator('iframe[title="Isolated practice test runner"]')
        .count(),
      0,
    );
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
});
test("outages and missing profiles are explicit, and retry loads actual problem data", async () => {
  const { context, page, controls, errors } = await setup();
  try {
    controls.catalogFails = true;
    await page.goto(`${url}/?room=leetcode`);
    await page
      .getByRole("alert")
      .filter({ hasText: "LeetCode is unavailable" })
      .waitFor();
    assert.equal(await page.locator(".lab-problem-card").count(), 0);
    controls.catalogFails = false;
    await page.getByRole("button", { name: "Try again", exact: false }).click();
    await page.locator(".lab-problem-card").first().waitFor();
    await page.getByLabel("Track a LeetCode username").fill("Missing");
    await page.getByRole("button", { name: "Add", exact: false }).click();
    await page
      .getByRole("alert")
      .filter({ hasText: "couldn’t find that public" })
      .waitFor();
    assert.equal(await page.locator(".leetcode-ranks li").count(), 0);
    controls.problemFails = true;
    await sit(page);
    await page
      .getByRole("button", { name: "Open computer", exact: false })
      .last()
      .click();
    await page
      .getByRole("alert")
      .filter({ hasText: "Couldn’t pull up this problem" })
      .waitFor();
    controls.problemFails = false;
    await page.getByRole("button", { name: "Try again", exact: false }).click();
    await page.getByLabel("LeetCode JavaScript code").waitFor();
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
});
test("mobile workspace, official-site handoff, and blocked-storage fallback work", async () => {
  const { context, page, errors } = await setup({ width: 390, height: 844 });
  try {
    await page.addInitScript(() => {
      Storage.prototype.setItem = () => {
        throw new Error("storage blocked");
      };
      Storage.prototype.getItem = () => {
        throw new Error("storage blocked");
      };
    });
    await context.route("https://leetcode.com/problems/**", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: "<title>Official submission destination fixture</title>",
      }),
    );
    await enter(page);
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await page
      .getByRole("button", { name: "Leaderboard", exact: false })
      .click();
    await addProfile(page, "Alice");
    await page.screenshot({
      path: "test-results/leetcode-mobile-board.png",
      animations: "disabled",
    });
    await page
      .getByRole("button", { name: "Room & problems", exact: false })
      .click();
    await page.screenshot({
      path: "test-results/leetcode-mobile-room.png",
      animations: "disabled",
      fullPage: true,
    });
    await sit(page);
    await openComputer(page);
    await page.getByRole("button", { name: "Your code", exact: false }).click();
    const editor = page.getByLabel("LeetCode JavaScript code");
    await editor.fill(solution);
    await page
      .getByRole("button", { name: "Run practice tests", exact: false })
      .click();
    await page
      .getByRole("status")
      .filter({ hasText: "5/5 practice cases passed" })
      .waitFor();
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await page.screenshot({
      path: "test-results/leetcode-mobile-editor.png",
      animations: "disabled",
    });
    await page
      .getByRole("button", { name: "View results", exact: false })
      .click();
    await page
      .getByRole("heading", { name: "Practice tests passed. Nice work." })
      .waitFor();
    await page.getByRole("button", { name: "Your code", exact: false }).click();
    const popup = context.waitForEvent("page");
    await page
      .getByRole("button", { name: "Copy & submit on LeetCode", exact: false })
      .click();
    const official = await popup;
    await official.waitForLoadState();
    assert.equal(official.url(), "https://leetcode.com/problems/two-sum/");
    await official.close();
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
});
