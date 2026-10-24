import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import {
  getProfile,
  getProblem,
  getCatalog,
  leetcodeMiddleware,
} from "../server/leetcode.mjs";
import { rankProfiles, studyProblems } from "../src/leetcodeProblems.js";

const nativeFetch = globalThis.fetch;
let server,
  base,
  calls = [],
  blocked = false;
before(async () => {
  globalThis.fetch = async (url, options) => {
    assert.equal(url, "https://leetcode.com/graphql/");
    assert.equal(options.headers.Cookie, undefined);
    const body = JSON.parse(options.body);
    calls.push(body);
    if (blocked) return new Response("blocked", { status: 403 });
    if (body.query.includes("studioProfile")) {
      const user = body.variables.username;
      if (user === "missing-person")
        return Response.json({
          data: { matchedUser: null, recentAcSubmissionList: [] },
          errors: [{ message: "User does not exist" }],
        });
      return Response.json({
        data: {
          matchedUser: {
            username: user,
            profile: { ranking: 123 },
            submitStatsGlobal: {
              acSubmissionNum: [
                { difficulty: "All", count: 13 },
                { difficulty: "Easy", count: 10 },
                { difficulty: "Medium", count: 2 },
                { difficulty: "Hard", count: 1 },
              ],
            },
          },
          recentAcSubmissionList:
            user === "private-history"
              ? null
              : [
                  {
                    id: "1234",
                    title: "Two Sum",
                    titleSlug: "two-sum",
                    timestamp: "1792857600",
                  },
                ],
        },
        errors:
          user === "private-history"
            ? [{ message: "Recent activity unavailable" }]
            : undefined,
      });
    }
    const summary = (slug) => ({
      questionFrontendId: "1",
      title: slug,
      titleSlug: slug,
      difficulty: "Easy",
      isPaidOnly: false,
      topicTags: [{ name: "Array", slug: "array" }],
    });
    if (body.query.includes("studioProblemShelf"))
      return Response.json({
        data: Object.fromEntries(
          studyProblems.map((problem, index) => [
            `p${index}`,
            { ...summary(problem.slug), isPaidOnly: index === 7 },
          ]),
        ),
      });
    return Response.json({
      data: {
        question: {
          ...summary(body.variables.titleSlug),
          content: "<p>Fixture statement</p>",
          metaData: JSON.stringify({ name: "twoSum" }),
          exampleTestcases: "[2,7]\n9",
          codeSnippets: [
            {
              langSlug: "javascript",
              code: "var twoSum = function(nums,target) {};",
            },
          ],
        },
      },
    });
  };
  const middleware = leetcodeMiddleware();
  server = createServer((req, res) =>
    middleware(req, res, () => res.writeHead(404).end()),
  );
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  globalThis.fetch = nativeFetch;
  await new Promise((resolve) => server.close(resolve));
});

test("leaderboard uses weighted unique solves with stable shared places for ties", () => {
  const ranked = rankProfiles([
    { username: "Easy", easy: 30, medium: 0, hard: 0, total: 30 },
    { username: "Hard", easy: 1, medium: 1, hard: 6, total: 8 },
    { username: "TieB", easy: 0, medium: 1, hard: 0, total: 1 },
    { username: "TieA", easy: 0, medium: 1, hard: 0, total: 1 },
  ]);
  assert.deepEqual(
    ranked.map((p) => [p.username, p.points, p.place]),
    [
      ["Hard", 34, 1],
      ["Easy", 30, 2],
      ["TieA", 3, 3],
      ["TieB", 3, 3],
    ],
  );
});
test("public profile adapter normalizes real fields, timestamps, cache, and missing users", async () => {
  const start = calls.length,
    profile = await getProfile("Study-Friend");
  assert.equal(profile.easy, 10);
  assert.equal(profile.medium, 2);
  assert.equal(profile.hard, 1);
  assert.equal(profile.total, 13);
  assert.equal(profile.recent[0].timestamp, 1792857600000);
  assert.equal(profile.source, "LeetCode");
  assert.equal(calls.at(-1).variables.username, "study-friend");
  await getProfile("Study-Friend");
  assert.equal(calls.length, start + 1);
  await assert.rejects(
    () => getProfile("missing-person"),
    (error) => error.status === 404,
  );
  const privateProfile = await getProfile("private-history");
  assert.equal(privateProfile.total, 13);
  assert.equal(privateProfile.recentAvailable, false);
  assert.deepEqual(privateProfile.recent, []);
});
test("problem adapter reads live statements and starter code, excludes paid questions, and restricts slugs", async () => {
  const catalog = await getCatalog();
  assert.equal(catalog.problems.length, 7);
  const problem = await getProblem("two-sum");
  assert.equal(problem.functionName, "twoSum");
  assert.ok(problem.content.includes("Fixture statement"));
  assert.ok(problem.starterCode.includes("twoSum"));
  const count = calls.length;
  await assert.rejects(
    () => getProblem("../../private"),
    (error) => error.status === 404,
  );
  assert.equal(calls.length, count);
});
test("read-only API validates input and reports upstream failures without leaking pages", async () => {
  const count = calls.length;
  const invalid = await nativeFetch(
    `${base}/api/leetcode/profiles/invalid%20name`,
  );
  assert.equal(invalid.status, 400);
  assert.equal(calls.length, count);
  const post = await nativeFetch(`${base}/api/leetcode/catalog`, {
    method: "POST",
  });
  assert.equal(post.status, 405);
  assert.equal(post.headers.get("allow"), "GET");
  blocked = true;
  const failed = await nativeFetch(
    `${base}/api/leetcode/profiles/blocked-friend`,
  );
  assert.equal(failed.status, 502);
  assert.match((await failed.json()).error, /couldn’t be reached/);
  blocked = false;
});
