import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ActivityLedger,
  pairKey,
  weekStart,
} from "../server/activityModel.mjs";

const epoch = Date.UTC(2026, 9, 21, 10);
function client(ledger, id = "person-a", tab = "browser-a") {
  let sequence = 0;
  return (offset, extra = {}) =>
    ledger.heartbeat(
      {
        person: { id, name: id },
        clientId: tab,
        sequence: ++sequence,
        active: true,
        pair: null,
        ...extra,
      },
      epoch + offset,
    );
}
const pair = (id, partnerId = "milo", paused = false) => ({
  id,
  partnerId,
  paused,
  goal: "Ship a little idea",
});

test("foreground online time merges overlapping tabs and stops on hiding, sleep, and reconnect", () => {
  const ledger = new ActivityLedger();
  const a = client(ledger),
    b = client(ledger, "person-a", "browser-b");
  a(0);
  b(2000);
  a(5000);
  b(7000);
  a(10000, { active: false });
  b(12000, { active: false });
  assert.equal(ledger.snapshot(epoch + 12000).all.people[0].online, 12000);
  a(60000);
  a(65000); // The offline/hidden gap earns nothing.
  a(180000);
  a(185000); // A sleeping device earns nothing during the long gap.
  const row = ledger.snapshot(epoch + 185000).all.people[0];
  assert.equal(row.online, 22000);
  assert.equal(row.pairing, 0);
});

test("pause, resume, swapping roles, and finishing preserve only active pair time", () => {
  const ledger = new ActivityLedger(),
    beat = client(ledger);
  beat(0, { pair: pair("session-a") });
  beat(5000, { pair: pair("session-a", "milo", true) });
  beat(10000, { pair: pair("session-a", "milo", true) });
  beat(15000, { pair: pair("session-a") });
  beat(20000, { pair: pair("session-a") }); // Same session while roles change.
  beat(25000);
  beat(30000);
  const board = ledger.snapshot(epoch + 30000).all;
  assert.equal(board.people[0].online, 30000);
  assert.equal(board.people[0].pairing, 15000);
  assert.equal(board.pairs[0].duration, 15000);
  assert.equal(board.pairs[0].sessionCount, 1);
  assert.equal(board.pairs[0].live, false);
});

test("a short lost connection is not credited when the browser reconnects", () => {
  const ledger = new ActivityLedger(),
    beat = client(ledger);
  beat(0);
  beat(5000);
  beat(10000, { continuous: false });
  beat(15000);
  assert.equal(ledger.snapshot(epoch + 15000).all.people[0].online, 10000);
});

test("A+B and B+A form one team; A+C is separate; overlapping sessions count once", () => {
  assert.equal(pairKey(["person-a", "milo"]), pairKey(["milo", "person-a"]));
  assert.notEqual(pairKey(["person-a", "milo"]), pairKey(["person-a", "ada"]));
  const ledger = new ActivityLedger(),
    a = client(ledger),
    b = client(ledger, "person-a", "browser-b");
  a(0, { pair: pair("session-a") });
  b(0, { pair: pair("session-b") });
  a(5000, { pair: pair("session-a") });
  b(5000, { pair: pair("session-b") });
  a(10000);
  b(10000);
  a(15000, { pair: pair("session-c", "ada") });
  a(20000);
  const board = ledger.snapshot(epoch + 20000).all;
  assert.equal(board.pairs.length, 2);
  const milo = board.pairs.find((team) =>
    team.members.some((m) => m.id === "milo"),
  );
  assert.equal(milo.duration, 10000);
  assert.equal(milo.sessionCount, 2);
  assert.equal(board.people[0].pairCount, 2);
  assert.equal(board.people[0].pairing, 15000);
  assert.equal(
    board.people.length,
    1,
    "simulated NPC online time is never ranked",
  );
});

test("weekly standings clip sessions at Monday UTC while all-time totals stay intact", () => {
  const monday = Date.UTC(2026, 9, 26);
  assert.equal(weekStart(monday + 3600000), monday);
  const ledger = new ActivityLedger();
  const first = {
    person: { id: "person-a", name: "Ada Lovelace" },
    clientId: "browser-a",
    active: true,
    pair: pair("session-a"),
  };
  ledger.heartbeat({ ...first, sequence: 1 }, monday - 5000);
  ledger.heartbeat({ ...first, sequence: 2 }, monday + 5000);
  const board = ledger.snapshot(monday + 5000);
  assert.equal(board.week.people[0].online, 5000);
  assert.equal(board.week.pairs[0].duration, 5000);
  assert.equal(board.all.pairs[0].duration, 10000);
});

test("renaming retains identity, duplicate heartbeats are idempotent, restart cannot earn downtime", () => {
  const ledger = new ActivityLedger(),
    beat = client(ledger);
  beat(0);
  beat(5000);
  const input = {
    person: { id: "person-a", name: "New name" },
    clientId: "browser-a",
    sequence: 3,
    active: false,
    pair: null,
  };
  ledger.heartbeat(input, epoch + 10000);
  ledger.heartbeat(input, epoch + 12000);
  assert.equal(ledger.snapshot(epoch + 12000).all.people[0].online, 10000);
  const restored = new ActivityLedger(JSON.parse(JSON.stringify(ledger.data)));
  restored.heartbeat({ ...input, sequence: 4, active: true }, epoch + 20000);
  assert.equal(restored.snapshot(epoch + 20000).all.people[0].online, 10000);
  assert.equal(restored.snapshot(epoch + 20000).all.people[0].name, "New name");
});

test("invalid partners and attempts to reuse someone else’s session are rejected", () => {
  const ledger = new ActivityLedger(),
    a = client(ledger),
    b = client(ledger, "person-b", "browser-b");
  a(0, { pair: pair("session-a") });
  assert.throws(
    () => b(5000, { pair: pair("session-a") }),
    /belongs to another pair/,
  );
  assert.throws(
    () => a(5000, { pair: pair("session-b", "unknown") }),
    /invalid/,
  );
});
