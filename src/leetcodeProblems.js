// Room-authored practice cases. These are not LeetCode's hidden judge tests.
export const studyProblems = [
  {
    slug: "two-sum",
    focus: "A warm-up with hash maps",
    compare: "unordered",
    cases: [
      { args: [[2, 7, 11, 15], 9], expected: [0, 1] },
      { args: [[3, 2, 4], 6], expected: [1, 2] },
      { args: [[3, 3], 6], expected: [0, 1] },
      { args: [[-4, -1, 0, 3, 8], 7], expected: [1, 4] },
      { args: [[0, 4, 3, 0], 0], expected: [0, 3] },
    ],
  },
  {
    slug: "valid-parentheses",
    focus: "Find your rhythm with stacks",
    cases: [
      { args: ["()[]{}"], expected: true },
      { args: ["([)]"], expected: false },
      { args: ["([])"], expected: true },
      { args: ["("], expected: false },
      { args: ["{[]}"], expected: true },
    ],
  },
  {
    slug: "best-time-to-buy-and-sell-stock",
    focus: "One pass, one small insight",
    cases: [
      { args: [[7, 1, 5, 3, 6, 4]], expected: 5 },
      { args: [[7, 6, 4, 3, 1]], expected: 0 },
      { args: [[1]], expected: 0 },
      { args: [[1, 2]], expected: 1 },
      { args: [[2, 1, 2, 1, 0, 1, 2]], expected: 2 },
    ],
  },
  {
    slug: "contains-duplicate",
    focus: "A little set theory",
    cases: [
      { args: [[1, 2, 3, 1]], expected: true },
      { args: [[1, 2, 3, 4]], expected: false },
      { args: [[1]], expected: false },
      { args: [[0, 0]], expected: true },
      { args: [[1, 1, 1, 3, 3, 4, 3, 2, 4, 2]], expected: true },
    ],
  },
  {
    slug: "valid-anagram",
    focus: "Make the counts line up",
    cases: [
      { args: ["anagram", "nagaram"], expected: true },
      { args: ["rat", "car"], expected: false },
      { args: ["a", "b"], expected: false },
      { args: ["a", "a"], expected: true },
      { args: ["ab", "a"], expected: false },
    ],
  },
  {
    slug: "binary-search",
    focus: "Keep narrowing the possibilities",
    cases: [
      { args: [[-1, 0, 3, 5, 9, 12], 9], expected: 4 },
      { args: [[-1, 0, 3, 5, 9, 12], 2], expected: -1 },
      { args: [[5], 5], expected: 0 },
      { args: [[5], 2], expected: -1 },
      { args: [[1, 3, 5, 7], 7], expected: 3 },
    ],
  },
  {
    slug: "product-of-array-except-self",
    focus: "Two directions, one neat solution",
    cases: [
      { args: [[1, 2, 3, 4]], expected: [24, 12, 8, 6] },
      { args: [[-1, 1, 0, -3, 3]], expected: [0, 0, 9, 0, 0] },
      { args: [[0, 0]], expected: [0, 0] },
      { args: [[2, 3]], expected: [3, 2] },
      { args: [[2, 0, 4]], expected: [0, 8, 0] },
    ],
  },
  {
    slug: "longest-substring-without-repeating-characters",
    focus: "Slide into something a little trickier",
    cases: [
      { args: ["abcabcbb"], expected: 3 },
      { args: ["bbbbb"], expected: 1 },
      { args: ["pwwkew"], expected: 3 },
      { args: [""], expected: 0 },
      { args: ["abba"], expected: 2 },
    ],
  },
];
export const problemURL = (slug) =>
  `https://leetcode.com/problems/${encodeURIComponent(slug)}/`;
export function rankProfiles(profiles) {
  const sorted = profiles
    .map((profile) => ({
      ...profile,
      points: profile.easy + profile.medium * 3 + profile.hard * 5,
    }))
    .sort(
      (a, b) =>
        b.points - a.points ||
        b.total - a.total ||
        a.username.localeCompare(b.username),
    );
  return sorted.map((profile, index) => ({
    ...profile,
    place:
      index &&
      profile.points === sorted[index - 1].points &&
      profile.total === sorted[index - 1].total
        ? sorted.findIndex(
            (entry) =>
              entry.points === profile.points && entry.total === profile.total,
          ) + 1
        : index + 1,
  }));
}
