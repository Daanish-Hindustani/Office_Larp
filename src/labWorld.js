export const labStations = [
  {
    id: "01",
    x: 32,
    y: 45.5,
    entry: { x: 32, y: 54 },
    slug: "two-sum",
    label: "A small warm-up",
  },
  {
    id: "02",
    x: 68,
    y: 45.5,
    entry: { x: 68, y: 54 },
    slug: "binary-search",
    label: "Find your focus",
  },
  {
    id: "03",
    x: 32,
    y: 75.5,
    entry: { x: 32, y: 85 },
    slug: "valid-parentheses",
    label: "Work through the details",
  },
  {
    id: "04",
    x: 68,
    y: 75.5,
    entry: { x: 68, y: 85 },
    slug: "product-of-array-except-self",
    label: "A little stretch",
  },
];
export const labExit = { x: 50, y: 23 };
export function canWalkLab(x, y) {
  if (x > 44 && x < 56 && y > 12 && y < 27) return true;
  if (x < 8 || x > 93 || y < 23 || y > 93) return false;
  return !(
    ((x > 21 && x < 42) || (x > 58 && x < 79)) &&
    ((y > 28 && y < 51) || (y > 58 && y < 82))
  );
}
