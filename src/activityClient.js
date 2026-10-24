import { useSyncExternalStore } from "react";

const PROFILE_KEY = "office-hours:activity-profile:v1";
const clientId = crypto.randomUUID();
let temporary = false;
function readProfile() {
  try {
    const saved = JSON.parse(localStorage.getItem(PROFILE_KEY));
    if (
      typeof saved?.id === "string" &&
      /^[0-9a-f-]{36}$/i.test(saved.id) &&
      typeof saved?.name === "string" &&
      saved.name.trim() &&
      saved.name.length <= 24
    )
      return { id: saved.id, name: saved.name };
  } catch {
    /* A temporary profile still works when storage is blocked. */
  }
  const profile = { id: crypto.randomUUID(), name: "Studio guest" };
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  } catch {
    temporary = true;
  }
  return profile;
}
let state = {
  profile: readProfile(),
  board: null,
  status: "connecting",
  temporary,
  pair: null,
};
const listeners = new Set();
const notify = (patch) => {
  state = { ...state, ...patch };
  listeners.forEach((listener) => listener());
};
let sequence = 0,
  lastResponse = -1,
  connected = false,
  continuous = true;
const eligible = () =>
  document.visibilityState === "visible" && navigator.onLine;

async function send({
  inactive = false,
  finish = false,
  reconnect = false,
} = {}) {
  if (!navigator.onLine) {
    continuous = false;
    notify({ status: "offline" });
    return;
  }
  const serial = ++sequence;
  const payload = {
    person: state.profile,
    clientId,
    sequence: serial,
    active: !inactive && eligible(),
    pair: finish ? null : state.pair,
    continuous: continuous && !reconnect,
  };
  try {
    const response = await fetch("/api/activity/heartbeat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true,
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error("Board unavailable");
    const board = await response.json();
    if (serial > lastResponse) {
      lastResponse = serial;
      continuous = navigator.onLine;
      notify({ board, status: "connected" });
    }
  } catch {
    continuous = false;
    if (serial > lastResponse)
      notify({ status: navigator.onLine ? "error" : "offline" });
  }
}

export const activity = {
  subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  getSnapshot: () => state,
  connect() {
    connected = true;
    const sync = () => {
      if (connected) void send();
    };
    const reconnect = () => {
      if (connected) void send({ reconnect: true });
    };
    const leave = () => void send({ inactive: true, finish: true });
    const storage = (event) => {
      if (event.key !== PROFILE_KEY || !event.newValue) return;
      try {
        const profile = JSON.parse(event.newValue);
        if (profile.id === state.profile.id && profile.name) {
          notify({ profile });
          sync();
        }
      } catch {
        /* Ignore unrelated or malformed browser data. */
      }
    };
    document.addEventListener("visibilitychange", sync);
    window.addEventListener("online", reconnect);
    window.addEventListener("offline", sync);
    window.addEventListener("pagehide", leave);
    window.addEventListener("pageshow", sync);
    window.addEventListener("storage", storage);
    const timer = setInterval(() => {
      if (eligible()) sync();
    }, 5000);
    sync();
    return () => {
      connected = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", sync);
      window.removeEventListener("online", reconnect);
      window.removeEventListener("offline", sync);
      window.removeEventListener("pagehide", leave);
      window.removeEventListener("pageshow", sync);
      window.removeEventListener("storage", storage);
      leave();
    };
  },
  refresh: () => send(),
  rename(name) {
    const trimmed = name.trim().replace(/\s+/g, " ").slice(0, 24);
    if (!trimmed) return;
    const profile = { ...state.profile, name: trimmed };
    let temporary = false;
    try {
      localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
    } catch {
      temporary = true;
    }
    notify({ profile, temporary });
    void send();
  },
  beginPair(person, goal) {
    const pair = {
      id: crypto.randomUUID(),
      partnerId: person.id,
      goal: goal.trim(),
      paused: false,
    };
    notify({ pair });
    void send();
    return pair.id;
  },
  pausePair(id, paused) {
    if (state.pair?.id !== id) return;
    notify({ pair: { ...state.pair, paused } });
    void send();
  },
  endPair(id) {
    if (state.pair?.id !== id) return;
    notify({ pair: null });
    void send();
  },
};

export function useActivity() {
  return useSyncExternalStore(activity.subscribe, activity.getSnapshot);
}

export function hours(milliseconds = 0) {
  const value = milliseconds / 3600000;
  return value > 0 && value < 0.01 ? "<0.01" : value.toFixed(2);
}
export function durationLabel(milliseconds = 0) {
  const seconds = Math.floor(milliseconds / 1000);
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}
