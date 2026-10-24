export const theaterExit = { x: 87, y: 23 };
export const theaterSeats = [
  { id: "A1", x: 28, y: 51, entryY: 40, guest: "Milo", sprite: 1 },
  { id: "A2", x: 50, y: 51, entryY: 40 },
  { id: "A3", x: 72, y: 51, entryY: 40 },
  { id: "B1", x: 28, y: 73, entryY: 62 },
  { id: "B2", x: 50, y: 73, entryY: 62 },
  { id: "B3", x: 72, y: 73, entryY: 62, guest: "Ada", sprite: 4 },
];

export function canWalkTheater(x, y) {
  if (x > 83 && x < 93 && y > 14 && y < 32) return true;
  if (x < 8 || x > 93 || y < 28 || y > 92) return false;
  return !(x > 18 && x < 83 && ((y > 42 && y < 58) || (y > 64 && y < 81)));
}
