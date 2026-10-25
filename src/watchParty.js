import { demoFilm, playbackPosition, initialTheaterState } from "../server/theaterPlayback.mjs";
export { demoFilm, playbackPosition };
import { useEffect, useRef, useState } from "react";
import { useWorld } from "./Multiplayer";

export const ambientFilms = [
  {
    id: "night",
    kind: "ambient",
    title: "A quiet night",
    subtitle: "Fireflies & a little moonlight",
    duration: 600,
  },
  {
    id: "rain",
    kind: "ambient",
    title: "Rain at the window",
    subtitle: "A soft place to slow down",
    duration: 600,
  },
  {
    id: "orbit",
    kind: "ambient",
    title: "A little orbit",
    subtitle: "Nothing to do. Nowhere to rush.",
    duration: 600,
  },
];
export const reactions = ["🍿", "💛", "👏", "✨"];
export const clockTime = (seconds = 0) => {
  const value = Math.max(0, Math.floor(seconds));
  return `${Math.floor(value / 60)
    .toString()
    .padStart(2, "0")}:${(value % 60).toString().padStart(2, "0")}`;
};
export function useWatchParty(visible) {
  const world = useWorld();
  const fallback = useRef(null);
  if (!fallback.current) fallback.current = initialTheaterState();
  const state = world.theater || fallback.current;
  const [now, setNow] = useState(Date.now);
  const current = useRef(state);
  const pending = useRef(Promise.resolve());
  current.current = state;
  useEffect(() => {
    if (!visible) return;
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, [visible]);
  function perform(body) {
    void world.action(body).catch((error) => world.setError(error.message));
  }
  function publish(change) {
    pending.current = pending.current
      .then(async () => {
        const previous = current.current;
        const result = await world.action({
          type: "theater",
          revision: previous.revision,
          value: {
            ...previous,
            position: playbackPosition(previous),
            ...change,
          },
        });
        if (
          result.theater &&
          result.theater.revision >= current.current.revision
        )
          current.current = result.theater;
        return result.theater;
      })
      .catch((error) => world.setError(error.message));
    return pending.current;
  }
  const position = playbackPosition(state, now);
  return {
    state,
    position,
    publish,
    messages: world.messages
      .filter((m) => m.room === "theater" && !m.recipient)
      .map((m) => ({ ...m, value: m.text })),
    bursts: world.bursts.filter((item) => item.expires > now),
    connected: world.connected,
    count: world.players.filter((p) => p.room === "theater").length,
    isYou: (sender) => sender === world.user.id,
    sendChat: (value) => {
      if (value.trim())
        perform({ type: "chat", text: value.trim().slice(0, 300) });
    },
    react: (value) => {
      if (reactions.includes(value)) perform({ type: "reaction", value });
    },
    playItem: (item) =>
      publish({
        source: item,
        queue: current.current.queue.filter((entry) => entry.id !== item.id),
        position: 0,
        playing: false,
      }),
    addItem: (item) => publish({ queue: [...current.current.queue, item] }),
    removeItem: (itemId) =>
      publish({
        queue: current.current.queue.filter((entry) => entry.id !== itemId),
      }),
  };
}
