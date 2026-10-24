import { useEffect, useRef, useState } from "react";

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
export function playbackPosition(state, now = Date.now()) {
  const position =
    state.position +
    (state.playing ? Math.max(0, now - state.updatedAt) / 1000 : 0);
  return Number.isFinite(state.source.duration)
    ? Math.min(state.source.duration, position)
    : position;
}
const newer = (a, b) =>
  a.revision > b.revision || (a.revision === b.revision && a.author > b.author);

export function useWatchParty(visible) {
  const id = useRef(crypto.randomUUID());
  const channel = useRef(null);
  const [state, setState] = useState(() => ({
    source: ambientFilms[0],
    queue: ambientFilms.slice(1),
    playing: false,
    position: 0,
    updatedAt: Date.now(),
    revision: 0,
    author: "",
  }));
  const current = useRef(state);
  const [peers, setPeers] = useState({});
  const [messages, setMessages] = useState([]);
  const history = useRef([]);
  const [bursts, setBursts] = useState([]);
  const [connected, setConnected] = useState(false);
  const [now, setNow] = useState(Date.now);
  const peersRef = useRef({});
  const seen = useRef(new Set());

  function apply(next) {
    current.current = next;
    setState(next);
  }
  function publish(change) {
    const previous = current.current;
    const next = {
      ...previous,
      position: playbackPosition(previous),
      updatedAt: Date.now(),
      ...change,
      revision: previous.revision + 1,
      author: id.current,
    };
    apply(next);
    channel.current?.postMessage({
      type: "state",
      sender: id.current,
      state: next,
    });
  }
  function receiveEvent(event) {
    if (seen.current.has(event.id)) return;
    seen.current.add(event.id);
    if (seen.current.size > 300)
      seen.current.delete(seen.current.values().next().value);
    if (event.type === "chat") {
      history.current = [...history.current, event]
        .sort((a, b) => (a.sentAt || 0) - (b.sentAt || 0))
        .slice(-40);
      setMessages(history.current);
    }
    if (event.type === "reaction")
      setBursts((list) =>
        [...list, { ...event, expires: Date.now() + 3500 }].slice(-8),
      );
  }
  function send(type, value) {
    const event = {
      type,
      value,
      id: crypto.randomUUID(),
      sender: id.current,
      sentAt: Date.now(),
    };
    receiveEvent(event);
    channel.current?.postMessage(event);
  }
  useEffect(() => {
    if (!visible) return;
    setNow(Date.now());
    const tick = setInterval(() => {
      const time = Date.now();
      setNow(time);
      setBursts((list) => list.filter((item) => item.expires > time));
    }, 500);
    return () => clearInterval(tick);
  }, [visible]);
  useEffect(() => {
    if (!visible || !("BroadcastChannel" in window)) return;
    const room = new BroadcastChannel("office-hours:theater:v1");
    channel.current = room;
    setConnected(true);
    peersRef.current = {};
    setPeers({});
    const joinedRevision = current.current.revision;
    const joinedAuthor = current.current.author;
    let adoptedSnapshot = false;
    function announce(type) {
      room.postMessage({ type, sender: id.current });
    }
    room.onmessage = ({ data }) => {
      if (
        !data ||
        typeof data.sender !== "string" ||
        data.sender === id.current
      )
        return;
      if (data.type === "leave") {
        delete peersRef.current[data.sender];
        setPeers({ ...peersRef.current });
        return;
      }
      peersRef.current[data.sender] = Date.now();
      setPeers({ ...peersRef.current });
      if (data.type === "hello") {
        room.postMessage({
          type: "snapshot",
          sender: id.current,
          target: data.sender,
          state: current.current,
          messages: history.current,
        });
      }
      const snapshot = data.type === "snapshot" && data.target === id.current;
      if ((data.type === "state" || snapshot) && data.state) {
        // A returning guest joins the room that is already here, even if its
        // previous visit had a higher revision counter than this new room.
        const untouchedJoin =
          snapshot &&
          !adoptedSnapshot &&
          current.current.revision === joinedRevision &&
          current.current.author === joinedAuthor;
        if (newer(data.state, current.current) || untouchedJoin)
          apply(data.state);
        if (snapshot) adoptedSnapshot = true;
      }
      if (snapshot && Array.isArray(data.messages)) {
        for (const message of data.messages.slice(-40)) {
          if (
            message?.type === "chat" &&
            typeof message.value === "string" &&
            message.value.length <= 300 &&
            typeof message.id === "string"
          )
            receiveEvent(message);
        }
      }
      if (
        (data.type === "chat" ||
          (data.type === "reaction" && reactions.includes(data.value))) &&
        typeof data.value === "string" &&
        data.value.length <= 300
      )
        receiveEvent(data);
    };
    announce("hello");
    const heartbeat = setInterval(() => {
      announce("heartbeat");
      const time = Date.now();
      peersRef.current = Object.fromEntries(
        Object.entries(peersRef.current).filter(
          ([, seenAt]) => time - seenAt < 16000,
        ),
      );
      setPeers({ ...peersRef.current });
    }, 5000);
    const leave = () => announce("leave");
    window.addEventListener("pagehide", leave);
    return () => {
      leave();
      clearInterval(heartbeat);
      window.removeEventListener("pagehide", leave);
      room.close();
      channel.current = null;
      setConnected(false);
    };
  }, [visible]);

  const position = playbackPosition(state, now);
  useEffect(() => {
    if (
      visible &&
      state.playing &&
      Number.isFinite(state.source.duration) &&
      position >= state.source.duration
    )
      publish({ playing: false, position: state.source.duration });
  }, [position, visible, state.playing, state.source.duration]);
  return {
    state,
    position,
    publish,
    messages,
    bursts,
    connected,
    count: Object.keys(peers).length + 1,
    isYou: (sender) => sender === id.current,
    sendChat: (value) => {
      if (value.trim()) send("chat", value.trim().slice(0, 300));
    },
    react: (value) => {
      if (reactions.includes(value)) send("reaction", value);
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
