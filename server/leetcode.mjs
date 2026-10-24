import { studyProblems } from "../src/leetcodeProblems.js";

const cache = new Map(),
  pending = new Map();
const allowed = new Set(studyProblems.map((problem) => problem.slug));
export class LeetCodeError extends Error {
  constructor(message, status = 502) {
    super(message);
    this.status = status;
  }
}
async function queryLeetCode(query, variables, ttl, fresh = false) {
  const key = JSON.stringify({ query, variables });
  const stored = cache.get(key),
    age = stored ? Date.now() - stored.time : Infinity;
  if (stored && age < (fresh ? 5000 : ttl)) return stored.value;
  if (pending.has(key)) return pending.get(key);
  const request = (async () => {
    let response;
    try {
      response = await fetch("https://leetcode.com/graphql/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Referer: "https://leetcode.com/",
          "User-Agent": "OfficeHours/0.1 (local study room)",
        },
        body: JSON.stringify({ query, variables }),
        signal: AbortSignal.timeout(12000),
      });
    } catch {
      throw new LeetCodeError(
        "LeetCode is taking a little longer to respond. Try again in a moment.",
      );
    }
    if (!response.ok)
      throw new LeetCodeError(
        response.status === 429
          ? "LeetCode is receiving too many requests. Give it a minute, then try again."
          : "LeetCode couldn’t be reached. You can still open the problem on its website.",
      );
    let body;
    try {
      body = await response.json();
    } catch {
      throw new LeetCodeError(
        "LeetCode returned an unexpected response. Try again shortly.",
      );
    }
    const profileResponse =
      body.data && Object.hasOwn(body.data, "matchedUser");
    if ((!profileResponse && body.errors?.length) || !body.data)
      throw new LeetCodeError(
        "LeetCode couldn’t return that information. Try again or open its website.",
      );
    const value = { data: body.data, fetchedAt: new Date().toISOString() };
    cache.set(key, { time: Date.now(), value });
    if (cache.size > 256) cache.delete(cache.keys().next().value);
    return value;
  })();
  pending.set(key, request);
  try {
    return await request;
  } finally {
    pending.delete(key);
  }
}
const summaryFields =
  "questionFrontendId title titleSlug difficulty isPaidOnly topicTags { name slug }";
export async function getCatalog() {
  const query = `query studioProblemShelf { ${studyProblems.map((problem, i) => `p${i}: question(titleSlug: "${problem.slug}") { ${summaryFields} }`).join("\n")} }`;
  const result = await queryLeetCode(query, {}, 3600000);
  return {
    source: "LeetCode",
    fetchedAt: result.fetchedAt,
    problems: studyProblems.flatMap((problem, i) => {
      const item = result.data[`p${i}`];
      return item && !item.isPaidOnly
        ? [
            {
              id: item.questionFrontendId,
              title: item.title,
              slug: item.titleSlug,
              difficulty: item.difficulty,
              tags: item.topicTags.map((tag) => tag.name),
              focus: problem.focus,
            },
          ]
        : [];
    }),
  };
}
export async function getProblem(slug) {
  if (!allowed.has(slug))
    throw new LeetCodeError(
      "That problem isn’t on this room’s practice shelf.",
      404,
    );
  const query = `query studioProblem($titleSlug: String!) { question(titleSlug: $titleSlug) { ${summaryFields} content exampleTestcases metaData codeSnippets { lang langSlug code } } }`;
  const result = await queryLeetCode(query, { titleSlug: slug }, 86400000);
  const item = result.data.question;
  if (!item || item.isPaidOnly || !item.content)
    throw new LeetCodeError(
      "This problem isn’t available for free practice. Choose another from the shelf.",
      404,
    );
  const snippet = item.codeSnippets.find(
    (entry) => entry.langSlug === "javascript",
  );
  let metadata;
  try {
    metadata = JSON.parse(item.metaData);
  } catch {
    metadata = {};
  }
  return {
    source: "LeetCode",
    fetchedAt: result.fetchedAt,
    id: item.questionFrontendId,
    title: item.title,
    slug: item.titleSlug,
    difficulty: item.difficulty,
    tags: item.topicTags.map((tag) => tag.name),
    content: item.content,
    starterCode:
      snippet?.code ||
      "// Open this problem on LeetCode to choose a language.\n",
    functionName: /^[a-zA-Z_$][\w$]*$/.test(metadata.name)
      ? metadata.name
      : null,
    examples: item.exampleTestcases,
  };
}
export async function getProfile(username, fresh = false) {
  if (!/^[a-zA-Z0-9_-]{1,40}$/.test(username))
    throw new LeetCodeError(
      "Use a LeetCode username with letters, numbers, underscores, or hyphens.",
      400,
    );
  const query = `query studioProfile($username: String!) { matchedUser(username: $username) { username profile { ranking } submitStatsGlobal { acSubmissionNum { difficulty count } } } recentAcSubmissionList(username: $username, limit: 20) { id title titleSlug timestamp } }`;
  const result = await queryLeetCode(
    query,
    { username: username.toLowerCase() },
    60000,
    fresh,
  );
  const user = result.data.matchedUser;
  if (!user)
    throw new LeetCodeError(
      "We couldn’t find that public LeetCode profile. Check the username and try again.",
      404,
    );
  const counts = Object.fromEntries(
    (user.submitStatsGlobal?.acSubmissionNum || []).map((entry) => [
      entry.difficulty,
      entry.count,
    ]),
  );
  if (
    !["All", "Easy", "Medium", "Hard"].every(
      (difficulty) =>
        Number.isFinite(counts[difficulty]) && counts[difficulty] >= 0,
    )
  )
    throw new LeetCodeError(
      "LeetCode couldn’t return public solve counts for that profile. Try again shortly.",
    );
  return {
    source: "LeetCode",
    fetchedAt: result.fetchedAt,
    username: user.username,
    total: counts.All || 0,
    easy: counts.Easy || 0,
    medium: counts.Medium || 0,
    hard: counts.Hard || 0,
    ranking: user.profile.ranking,
    recentAvailable: Array.isArray(result.data.recentAcSubmissionList),
    recent: (result.data.recentAcSubmissionList || []).map((item) => ({
      id: item.id,
      title: item.title,
      slug: item.titleSlug,
      timestamp: Number(item.timestamp) * 1000,
    })),
  };
}
export function leetcodeMiddleware() {
  return async (req, res, next) => {
    const url = new URL(req.url, "http://localhost");
    if (!url.pathname.startsWith("/api/leetcode/")) {
      next();
      return;
    }
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    if (req.method !== "GET") {
      res.statusCode = 405;
      res.setHeader("Allow", "GET");
      res.end(JSON.stringify({ error: "This endpoint is read-only." }));
      return;
    }
    try {
      let result;
      if (url.pathname === "/api/leetcode/catalog") result = await getCatalog();
      else if (/^\/api\/leetcode\/problems\/[^/]+$/.test(url.pathname))
        result = await getProblem(
          decodeURIComponent(url.pathname.split("/").at(-1)),
        );
      else if (/^\/api\/leetcode\/profiles\/[^/]+$/.test(url.pathname))
        result = await getProfile(
          decodeURIComponent(url.pathname.split("/").at(-1)),
          url.searchParams.get("refresh") === "1",
        );
      else throw new LeetCodeError("This room endpoint doesn’t exist.", 404);
      res.statusCode = 200;
      res.end(JSON.stringify(result));
    } catch (error) {
      res.statusCode = error.status || (error instanceof URIError ? 400 : 502);
      res.end(
        JSON.stringify({
          error:
            error instanceof LeetCodeError
              ? error.message
              : "The practice room couldn’t load that information. Please try again.",
        }),
      );
    }
  };
}
