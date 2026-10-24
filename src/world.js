import { desks } from "./data";

export const SEAT_TIMING = {
  turn: 0.14,
  lower: 0.42,
  rise: 0.36,
  grab: 0.18,
  pull: 0.68,
  push: 0.58,
  scoot: 0.72,
};
export const CHAIR_PULL = 1.6;
// The authored seated cell contacts the cushion at its canvas bottom.
// Chair top is 7.1 units above its floor anchor; cushion center is 28% down.
export const SEAT_FORWARD = 7.1 - 7.8 * 0.28;

const obstacles = [
  ...desks.map((d) => ({ x: d.x - 8, y: d.deskY - 6, w: 16, h: 11 })),
  // Chairs are solid scenery. Actors dock just below them before sitting.
  ...desks.map((d) => ({
    x: d.x - 1.5,
    y: d.y - 6,
    w: 3,
    h: 4,
    chairId: d.id,
  })),
  { x: 73, y: 43, w: 9, h: 12 },
  { x: 73, y: 65, w: 9, h: 13 },
  { x: 80, y: 53, w: 7, h: 17 },
  { x: 88, y: 43, w: 8, h: 35 },
];
export const distance = (a, b) => Math.hypot((a.x - b.x) * 1.5, a.y - b.y);
export const canWalk = (x, y, ignoreChairId = null) =>
  x > 7 &&
  x < 94 &&
  y > 24 &&
  y < 93 &&
  !obstacles.some(
    (o) =>
      o.chairId !== ignoreChairId &&
      x > o.x - 1 + 0.001 &&
      x < o.x + o.w + 1 - 0.001 &&
      y > o.y - 1 + 0.001 &&
      y < o.y + o.h + 1 - 0.001,
  );
export function pathTo(start, end) {
  const snap = (v) => Math.round(v / 2) * 2;
  const from = [snap(start.x), snap(start.y)],
    to = [snap(end.x), snap(end.y)];
  if (!canWalk(...to)) return [];
  const queue = [from],
    seen = new Map([[from.join(","), null]]);
  let found;
  for (let i = 0; i < queue.length; i++) {
    const p = queue[i];
    if (p[0] === to[0] && p[1] === to[1]) {
      found = p;
      break;
    }
    for (const [dx, dy] of [
      [2, 0],
      [-2, 0],
      [0, 2],
      [0, -2],
    ]) {
      const next = [p[0] + dx, p[1] + dy],
        key = next.join(",");
      if (canWalk(...next) && !seen.has(key)) {
        seen.set(key, p);
        queue.push(next);
      }
    }
  }
  if (!found) return [];
  const path = [];
  while (found) {
    path.unshift({ x: found[0], y: found[1] });
    found = seen.get(found.join(","));
  }
  return path.slice(1);
}
export function move(actor, dx, dy, dt, speed = 24, blocked = () => false) {
  const len = Math.hypot(dx * 1.5, dy),
    old = { x: actor.x, y: actor.y };
  if (len) {
    const docking = ["positioning", "clearing-seat"].includes(actor.state)
      ? actor.seatId || actor.seat?.id
      : null;
    const travel = Math.min(speed * dt, len),
      sx = (dx / len) * travel,
      sy = (dy / len) * travel;
    if (
      canWalk(actor.x + sx, actor.y, docking) &&
      !blocked({ x: actor.x + sx, y: actor.y })
    )
      actor.x += sx;
    if (
      canWalk(actor.x, actor.y + sy, docking) &&
      !blocked({ x: actor.x, y: actor.y + sy })
    )
      actor.y += sy;
  }
  const traveled = distance(actor, old);
  actor.moving = traveled > 0.001;
  if (actor.moving) {
    const actualX = (actor.x - old.x) * 1.5;
    const actualY = actor.y - old.y;
    actor.direction =
      Math.abs(actualX) > Math.abs(actualY)
        ? actualX < 0
          ? "left"
          : "right"
        : actualY < 0
          ? "up"
          : "down";
  }
  actor.stride = actor.moving ? (actor.stride || 0) + traveled : 0;
  actor.frame = actor.moving
    ? Math.floor(actor.stride / (actor.sprite ? 1.5 : 3)) % 4
    : 0;
  return traveled;
}
export function followPath(actor, path, dt, speed, blocked) {
  while (path.length && distance(actor, path[0]) < 0.45) {
    const reached = path.shift();
    actor.x = reached.x;
    actor.y = reached.y;
  }
  if (!path.length) {
    move(actor, 0, 0, dt);
    return true;
  }
  const next = path[0];
  move(actor, next.x - actor.x, next.y - actor.y, dt, speed, blocked);
  return false;
}
export const chairs = desks.map((d) => ({
  id: d.id,
  name:
    d.id === "you"
      ? "Your chair"
      : d.id === "empty"
        ? "Open chair"
        : `${d.name}’s chair`,
  x: d.x,
  y: d.y,
  desk: d,
  entry: { x: d.x, y: d.y + 3 },
  grip: { x: d.x, y: d.y + 0.65 },
  seatPoint: { x: d.x, y: d.y + CHAIR_PULL - SEAT_FORWARD },
}));
export function beginChairPull(actor, chair) {
  actor.x = chair.grip.x;
  actor.y = chair.grip.y;
  actor.direction = "up";
  actor.state = "grabbing-chair";
  actor.elapsed = 0;
  actor.chairOffset = 0;
  actor.moving = false;
  actor.frame = 0;
}
function chairStage(actor, state) {
  actor.state = state;
  actor.elapsed = 0;
  actor.moving = false;
  actor.frame = 0;
}
export function updateChairAction(actor, chair, dt, blocked) {
  const smooth = (t) => {
    const v = Math.min(1, Math.max(0, t));
    return v * v * (3 - 2 * v);
  };
  if (actor.state === "grabbing-chair") {
    if (actor.elapsed >= SEAT_TIMING.grab) chairStage(actor, "pulling-chair");
  } else if (
    actor.state === "pulling-chair" ||
    actor.state === "pushing-chair"
  ) {
    const pulling = actor.state === "pulling-chair";
    const progress = smooth(
      actor.elapsed / (pulling ? SEAT_TIMING.pull : SEAT_TIMING.push),
    );
    const before = actor.y;
    actor.chairOffset = CHAIR_PULL * (pulling ? progress : 1 - progress);
    actor.y = chair.grip.y + actor.chairOffset;
    actor.x = chair.x;
    actor.stride = (actor.stride || 0) + Math.abs(actor.y - before);
    actor.frame = Math.floor(actor.stride / 0.4) % 4;
    actor.moving = Math.abs(actor.y - before) > 0.001;
    actor.direction = "up";
    if (progress === 1) {
      if (pulling) {
        const side = chair.x + (chair.x < 30 ? 4 : -4);
        actor.chairPath = [
          { x: side, y: actor.y },
          { x: side, y: chair.seatPoint.y },
          { ...chair.seatPoint },
        ];
      }
      chairStage(actor, pulling ? "positioning" : "chair-cleared");
    }
  } else if (actor.state === "positioning") {
    // Walk around the armrest to the front of the cushion, never through it.
    if (followPath(actor, actor.chairPath, dt, 12, blocked)) {
      actor.x = chair.seatPoint.x;
      actor.y = chair.seatPoint.y;
      actor.direction = "up";
      chairStage(actor, "lining-up");
    }
  } else if (actor.state === "lining-up") {
    actor.direction = "up";
    if (actor.elapsed >= SEAT_TIMING.turn) chairStage(actor, "sitting-down");
  } else if (actor.state === "sitting-down") {
    if (actor.elapsed >= SEAT_TIMING.lower) chairStage(actor, "rolling-in");
  } else if (actor.state === "rolling-in" || actor.state === "rolling-out") {
    const inward = actor.state === "rolling-in";
    const progress = smooth(actor.elapsed / SEAT_TIMING.scoot);
    actor.chairOffset = CHAIR_PULL * (inward ? 1 - progress : progress);
    actor.x = chair.x;
    actor.y = chair.y + actor.chairOffset - SEAT_FORWARD;
    actor.direction = "up";
    actor.moving = false;
    actor.frame = 0;
    if (progress === 1) chairStage(actor, inward ? "sitting" : "standing-up");
  } else if (actor.state === "standing-up") {
    if (actor.elapsed >= SEAT_TIMING.rise) {
      const side = chair.x + (chair.x < 30 ? 4 : -4);
      actor.chairExitPath = [
        { x: side, y: chair.seatPoint.y },
        { x: side, y: chair.grip.y + CHAIR_PULL },
        { x: chair.x, y: chair.grip.y + CHAIR_PULL },
      ];
      chairStage(actor, "clearing-seat");
    }
  } else if (actor.state === "clearing-seat") {
    if (followPath(actor, actor.chairExitPath, dt, 12, blocked)) {
      actor.direction = "up";
      chairStage(actor, "pushing-chair");
    }
  } else return false;
  return true;
}
export function makeNpc(person, index) {
  return {
    ...person,
    y: person.y - SEAT_FORWARD,
    chairOffset: 0,
    state: "sitting",
    elapsed: 0,
    wait: 4 + index * 5,
    direction: "up",
    frame: 0,
    stride: 0,
    moving: false,
    path: [],
    seat: chairs[index],
  };
}
export function updateNpc(npc, dt, player, others) {
  npc.elapsed += dt;
  const enter = (state) => {
    npc.state = state;
    npc.elapsed = 0;
    npc.moving = false;
    npc.frame = 0;
  };
  const blocked = (next) =>
    distance(next, player) < 2.6 ||
    others.some((o) => o !== npc && distance(next, o) < 2.5);
  const exit = npc.seat.entry;
  const previousState = npc.state;
  if (updateChairAction(npc, npc.seat, dt, blocked)) {
    if (previousState === "rolling-in" && npc.state === "sitting")
      npc.wait = 12 + peopleIndex(npc) * 3;
    return;
  }
  if (npc.state === "chair-cleared") {
    enter("leaving");
    return;
  }
  if (npc.state === "sitting") {
    if (npc.elapsed > npc.wait) enter("rolling-out");
  } else if (npc.state === "leaving") {
    if (distance(npc, exit) < 0.45) {
      npc.path = pathTo(npc, {
        x: npc.seat.x < 30 ? 34 + peopleIndex(npc) : 61 + peopleIndex(npc),
        y: npc.seat.y + 13,
      });
      enter("walking-out");
    } else move(npc, exit.x - npc.x, exit.y - npc.y, dt, 10, blocked);
  } else if (npc.state === "walking-out") {
    if (followPath(npc, npc.path, dt, 12, blocked)) enter("break");
  } else if (npc.state === "break") {
    npc.direction = "down";
    if (npc.elapsed > 2.8) {
      npc.path = pathTo(npc, exit);
      enter("walking-back");
    }
  } else if (npc.state === "walking-back") {
    if (followPath(npc, npc.path, dt, 12, blocked)) enter("waiting");
  } else if (npc.state === "waiting") {
    npc.direction = "up";
    if (player.seatId !== npc.seat.id && distance(player, npc.seat) > 3.2)
      enter("approaching");
  } else if (npc.state === "approaching") {
    if (distance(npc, npc.seat.grip) < 0.2) beginChairPull(npc, npc.seat);
    else
      move(
        npc,
        npc.seat.grip.x - npc.x,
        npc.seat.grip.y - npc.y,
        dt,
        9,
        blocked,
      );
  }
}
function peopleIndex(npc) {
  return Math.max(0, npc.sprite - 1);
}
export function seatFrame(actor) {
  if (["sitting", "rolling-in", "rolling-out"].includes(actor.state)) return 5;
  if (actor.state === "grabbing-chair") return 1;
  if (actor.state === "lining-up") return 0;
  if (actor.state === "sitting-down") {
    return Math.min(5, Math.floor(actor.elapsed / (SEAT_TIMING.lower / 6)));
  }
  if (actor.state === "standing-up") {
    return 5 - Math.min(5, Math.floor(actor.elapsed / (SEAT_TIMING.rise / 6)));
  }
  return null;
}
