export const HEARTBEAT_GRACE = 15000;
export const studioPartners = [
  { id: "milo", name: "Milo", sprite: 1, simulated: true },
  { id: "leo", name: "Leo", sprite: 2, simulated: true },
  { id: "jun", name: "Jun", sprite: 3, simulated: true },
  { id: "ada", name: "Ada", sprite: 4, simulated: true },
];

// Member IDs, rather than names or seat order, define a team.
export function pairKey(members) {
  return JSON.stringify([...new Set(members)].sort());
}

export function unionIntervals(intervals, since = 0, until = Infinity) {
  const sorted = intervals
    .filter(([start, end]) => end > since && start < until && end > start)
    .map(([start, end]) => [Math.max(start, since), Math.min(end, until)])
    .sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const interval of sorted) {
    const previous = merged.at(-1);
    if (previous && interval[0] <= previous[1])
      previous[1] = Math.max(previous[1], interval[1]);
    else merged.push(interval);
  }
  return merged;
}
export const intervalDuration = (intervals, since = 0, until = Infinity) =>
  unionIntervals(intervals, since, until).reduce(
    (sum, [a, b]) => sum + b - a,
    0,
  );

export function weekStart(time) {
  const date = new Date(time);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return date.getTime();
}

export class ActivityLedger {
  constructor(data) {
    this.data =
      data?.version === 1
        ? data
        : {
            version: 1,
            profiles: {},
            online: {},
            sessions: {},
          };
    // Presence never survives a server restart; offline gaps cannot earn time.
    this.clients = new Map();
  }

  heartbeat(input, now = Date.now()) {
    if (!input || typeof input !== "object")
      throw Object.assign(new Error("That activity update is invalid."), {
        status: 400,
      });
    const { person, clientId, sequence, active, pair } = input;
    const validId = (id) =>
      typeof id === "string" &&
      /^[a-zA-Z0-9][a-zA-Z0-9_-]{7,79}$/.test(id) &&
      !["constructor", "prototype"].includes(id);
    if (
      !person ||
      !validId(person.id) ||
      !validId(clientId) ||
      !Number.isSafeInteger(sequence) ||
      sequence < 0 ||
      typeof active !== "boolean" ||
      (input.continuous !== undefined &&
        typeof input.continuous !== "boolean") ||
      (pair !== null && (typeof pair !== "object" || Array.isArray(pair))) ||
      typeof person.name !== "string" ||
      !person.name.trim() ||
      person.name.length > 24 ||
      (pair &&
        (!validId(pair.id) ||
          typeof pair.paused !== "boolean" ||
          !studioPartners.some((p) => p.id === pair.partnerId) ||
          typeof pair.goal !== "string" ||
          pair.goal.length > 160))
    ) {
      throw Object.assign(new Error("That activity update is invalid."), {
        status: 400,
      });
    }
    const key = `${person.id}:${clientId}`;
    const previous = this.clients.get(key);
    if (previous && sequence <= previous.sequence) return;
    if (
      pair &&
      this.data.sessions[pair.id] &&
      (this.data.sessions[pair.id].personId !== person.id ||
        this.data.sessions[pair.id].partnerId !== pair.partnerId ||
        this.data.sessions[pair.id].clientId !== clientId)
    ) {
      throw Object.assign(new Error("That session belongs to another pair."), {
        status: 409,
      });
    }
    this.data.profiles[person.id] = {
      id: person.id,
      name: person.name.trim().replace(/\s+/g, " "),
      sprite: 0,
    };
    // Credit only an observed interval between healthy heartbeats. Long gaps
    // (sleep, a lost connection, a closed tab) are deliberately left uncounted.
    if (
      previous?.active &&
      input.continuous !== false &&
      now > previous.time &&
      now - previous.time <= HEARTBEAT_GRACE
    ) {
      this.data.online[person.id] = unionIntervals([
        ...(this.data.online[person.id] || []),
        [previous.time, now],
      ]);
      if (previous.pair && !previous.pair.paused) {
        const session = this.data.sessions[previous.pair.id];
        session.intervals = unionIntervals([
          ...session.intervals,
          [previous.time, now],
        ]);
        session.lastSeen = now;
      }
    }
    if (previous?.pair && previous.pair.id !== pair?.id) {
      this.data.sessions[previous.pair.id].endedAt = now;
    }
    if (pair) {
      this.data.sessions[pair.id] ||= {
        id: pair.id,
        personId: person.id,
        partnerId: pair.partnerId,
        clientId,
        members: [person.id, pair.partnerId],
        goal: pair.goal.trim(),
        startedAt: now,
        lastSeen: now,
        endedAt: null,
        intervals: [],
      };
      this.data.sessions[pair.id].lastSeen = now;
    }
    this.clients.set(key, { ...input, time: now });
    // Bounded transient presence, while the saved ledger keeps earned time.
    for (const [id, client] of this.clients) {
      if (now - client.time > 86400000) this.clients.delete(id);
    }
  }

  standings(since, now) {
    const clients = [...this.clients.values()].filter(
      (c) => c.active && now - c.time <= HEARTBEAT_GRACE,
    );
    const sessions = Object.values(this.data.sessions);
    const member = (id) =>
      this.data.profiles[id] || studioPartners.find((p) => p.id === id);
    const pairs = new Map();
    for (const session of sessions) {
      const duration = intervalDuration(session.intervals, since, now);
      const live = clients.some(
        (c) => c.pair?.id === session.id && !c.pair.paused,
      );
      if (!duration && !live) continue;
      const id = pairKey(session.members);
      if (!pairs.has(id))
        pairs.set(id, {
          id,
          members: [...session.members].sort().map(member),
          intervals: [],
          sessions: [],
          live: false,
        });
      const team = pairs.get(id);
      team.intervals.push(...session.intervals);
      team.live ||= live;
      team.sessions.push({
        id: session.id,
        goal: session.goal,
        startedAt: session.startedAt,
        duration,
        live,
      });
    }
    const people = Object.values(this.data.profiles)
      .map((person) => {
        const ownSessions = sessions.filter((s) =>
          s.members.includes(person.id),
        );
        return {
          ...person,
          online: intervalDuration(
            this.data.online[person.id] || [],
            since,
            now,
          ),
          pairing: intervalDuration(
            ownSessions.flatMap((s) => s.intervals),
            since,
            now,
          ),
          pairCount: new Set(
            ownSessions
              .filter((s) => intervalDuration(s.intervals, since, now) > 0)
              .map((s) => pairKey(s.members)),
          ).size,
          live: clients.some((c) => c.person.id === person.id),
        };
      })
      .filter((p) => p.online || p.pairing || p.live);
    return {
      people,
      pairs: [...pairs.values()].map(({ intervals, ...team }) => ({
        ...team,
        duration: intervalDuration(intervals, since, now),
        sessionCount: team.sessions.length,
        sessions: team.sessions
          .sort((a, b) => b.startedAt - a.startedAt)
          .slice(0, 5),
      })),
    };
  }

  snapshot(now = Date.now()) {
    const weekStartsAt = weekStart(now);
    return {
      all: this.standings(0, now),
      week: this.standings(weekStartsAt, now),
      weekStartsAt,
      updatedAt: now,
    };
  }
}
