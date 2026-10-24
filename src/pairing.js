import { useEffect, useState } from "react";

export const pairingBriefs = {
  garden: {
    focus: "Small interactions",
    goal: "Give our little garden a warmer welcome",
    headline: "A little room to grow",
    accent: "#c7d5a2",
  },
  radio: {
    focus: "Creative interfaces",
    goal: "Set the mood for a quiet coding session",
    headline: "Good company. Better focus.",
    accent: "#d3b9a1",
  },
  tasks: {
    focus: "Thoughtful details",
    goal: "Make the first small win feel inviting",
    headline: "One little thing at a time",
    accent: "#b4cfb4",
  },
  postcards: {
    focus: "Visual storytelling",
    goal: "Make a postcard worth sharing",
    headline: "A moment worth making",
    accent: "#b5cdda",
  },
};

export function formatTime(seconds) {
  return `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
}

// A reviewed patch is tied to its exact source, so it never overwrites later edits.
export function proposeChange(code, person, type) {
  const brief = pairingBriefs[person.kind];
  const rules = {
    welcome: {
      title: "Make the welcome feel personal",
      reason: "A specific headline gives us something small to ship together.",
      pattern: /(<h1\b[^>]*>)[\s\S]*?(<\/h1>)/i,
      replacement: `$1${brief.headline}$2`,
    },
    color: {
      title: "Try a softer button color",
      reason: "This accent picks up the colors in our corner of the studio.",
      pattern: /(button\s*\{[^}]*?background\s*:\s*)([^;]+)(;)/i,
      replacement: `$1${brief.accent}$3`,
    },
    access: {
      title: "Give the page a language",
      reason:
        "Declaring a language helps screen readers pronounce the page correctly.",
      pattern: /<html(?![^>]*\blang\s*=)([^>]*)>/i,
      replacement: '<html lang="en"$1>',
    },
  };
  const rule = rules[type];
  const match = code.match(rule.pattern);
  if (!match)
    return {
      unavailable:
        "That change doesn’t fit this version of the code. Try another idea, or make a change together in the editor.",
    };
  const next = code.replace(rule.pattern, rule.replacement);
  if (next === code)
    return {
      unavailable:
        "That detail is already in place. Nice work! Try another idea.",
    };
  const after = next.slice(
    match.index,
    next.length - (code.length - match.index - match[0].length),
  );
  return {
    title: rule.title,
    reason: rule.reason,
    before: match[0],
    after,
    source: code,
    code: next,
  };
}

export function usePairSession(person) {
  const [session, setSession] = useState(null);
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (session?.phase !== "active" || session.paused) return;
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, [session?.phase, session?.paused]);

  function start(goal) {
    const time = Date.now();
    setNow(time);
    setSession({
      phase: "active",
      goal: goal.trim(),
      driver: "you",
      paused: false,
      startedAt: time,
      elapsed: 0,
      roundElapsed: 0,
      swaps: 0,
      runs: 0,
      changes: 0,
      checks: [true, false, false],
      notes: "",
      activity: [`You and ${person.name} set a goal. You’re driving first.`],
    });
  }
  function update(fn) {
    setSession((previous) => (previous ? fn(previous) : previous));
  }
  function log(message, extra = {}) {
    update((s) => ({
      ...s,
      ...extra,
      activity: [message, ...s.activity].slice(0, 8),
    }));
  }
  function swap() {
    const time = Date.now();
    setNow(time);
    update((s) => ({
      ...s,
      driver: s.driver === "you" ? "partner" : "you",
      elapsed: s.elapsed + (s.paused ? 0 : time - s.startedAt),
      roundElapsed: 0,
      startedAt: time,
      swaps: s.swaps + 1,
      activity: [
        `${s.driver === "you" ? person.name : "You"} took the keyboard.`,
        ...s.activity,
      ].slice(0, 8),
    }));
  }
  function togglePause() {
    const time = Date.now();
    setNow(time);
    update((s) => ({
      ...s,
      paused: !s.paused,
      startedAt: time,
      elapsed: s.elapsed + (s.paused ? 0 : time - s.startedAt),
      roundElapsed: s.roundElapsed + (s.paused ? 0 : time - s.startedAt),
    }));
  }
  function end() {
    const time = Date.now();
    update((s) => ({
      ...s,
      phase: "ended",
      elapsed: s.elapsed + (s.paused ? 0 : time - s.startedAt),
      paused: true,
    }));
  }
  const delta =
    session?.phase === "active" && !session.paused
      ? Math.max(0, now - session.startedAt)
      : 0;
  return {
    session,
    start,
    swap,
    togglePause,
    end,
    update,
    log,
    elapsed: Math.floor(((session?.elapsed || 0) + delta) / 1000),
    remaining: Math.max(
      0,
      300 - Math.floor(((session?.roundElapsed || 0) + delta) / 1000),
    ),
  };
}
