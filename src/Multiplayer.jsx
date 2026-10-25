import { createContext, useContext, useEffect, useRef, useState } from "react";
import CharacterSprite from "./PlayerSprite";
import "./multiplayer.css";

const WorldContext = createContext(null);
export const useWorld = () => useContext(WorldContext);
export async function api(path, body) {
  const response = await fetch(
    path,
    body === undefined
      ? { signal: AbortSignal.timeout(10000) }
      : {
          signal: AbortSignal.timeout(10000),
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
  );
  const result = await response.json();
  if (!response.ok)
    throw Object.assign(new Error(result.error || "Request failed."), {
      status: response.status,
    });
  return result;
}

export default function Multiplayer({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [players, setPlayers] = useState([]);
  const [messages, setMessages] = useState([]);
  const [theater, setTheater] = useState(null);
  const [bursts, setBursts] = useState([]);
  const [connected, setConnected] = useState(false);
  const [conversation, setConversation] = useState(null);
  const clientId = useRef(crypto.randomUUID());
  const position = useRef({
    room: new URLSearchParams(location.search).get("room") || "studio",
    x: 57,
    y: 86,
    direction: "down",
    moving: false,
    seated: false,
  });
  const transport = useRef(false);
  const published = useRef({ signature: "", time: 0 });
  useEffect(() => {
    let alive = true;
    api("/api/auth/me")
      .then((value) => {
        if (alive) setUser(value.user);
      })
      .catch((e) => {
        if (alive) setError(e.message);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);
  useEffect(() => {
    const update = (event) => setUser(event.detail);
    window.addEventListener("office:account", update);
    return () => window.removeEventListener("office:account", update);
  }, []);
  useEffect(() => {
    if (!user) return;
    const events = new EventSource(
      `/api/world/events?client=${clientId.current}&room=${encodeURIComponent(position.current.room)}`,
    );
    const listen = (name, fn) =>
      events.addEventListener(name, (event) => fn(JSON.parse(event.data)));
    listen("snapshot", (value) => {
      setMessages(value.messages);
      setTheater(value.theater);
      setError("");
    });
    listen("presence", setPlayers);
    listen("chat", (message) =>
      setMessages((list) =>
        [...list.filter((item) => item.id !== message.id), message].slice(-100),
      ),
    );
    listen("theater", (value) =>
      setTheater((previous) =>
        !previous || value.revision >= previous.revision ? value : previous,
      ),
    );
    listen("reaction", (value) =>
      setBursts((list) =>
        [
          ...list.filter((item) => item.expires > Date.now()),
          { ...value, expires: Date.now() + 3500 },
        ].slice(-8),
      ),
    );
    events.onopen = () => {
      published.current.signature = "";
      transport.current = true;
      setConnected(true);
    };
    events.onerror = () => {
      transport.current = false;
      setConnected(false);
      setPlayers([]);
      void api("/api/auth/me")
        .then((value) => {
          if (!value.user) {
            events.close();
            setUser(null);
          }
        })
        .catch(() => {});
    };
    return () => {
      events.close();
      transport.current = false;
      setConnected(false);
      setPlayers([]);
    };
  }, [user]);
  async function action(body) {
    if (!transport.current)
      throw new Error("Reconnecting to the office. Try again shortly.");
    try {
      const result = await api("/api/world/action", {
        ...body,
        clientId: clientId.current,
      });
      if (result.theater)
        setTheater((previous) =>
          !previous || result.theater.revision >= previous.revision
            ? result.theater
            : previous,
        );
      return result;
    } catch (e) {
      if (e.status === 401) setUser(null);
      throw e;
    }
  }
  // One network publisher reads the active room's actor without rerendering its animation loop.
  useEffect(() => {
    if (!user) return;
    let inFlight = false;
    const timer = setInterval(async () => {
      if (!transport.current || inFlight) return;
      const signature = JSON.stringify(position.current);
      if (
        signature === published.current.signature &&
        Date.now() - published.current.time < 10000
      )
        return;
      inFlight = true;
      try {
        await action({ type: "move", ...position.current });
        published.current = { signature, time: Date.now() };
      } catch (e) {
        if (e.status !== 409 || signature === JSON.stringify(position.current))
          setError(e.message);
      } finally {
        inFlight = false;
      }
    }, 150);
    return () => clearInterval(timer);
  }, [user]);
  async function logout() {
    try {
      await api("/api/auth/logout", {});
      setUser(null);
      setMessages([]);
      setTheater(null);
      setConversation(null);
    } catch (e) {
      setError(e.message);
    }
  }
  if (loading)
    return (
      <div className="auth-shell">
        <p>Opening the office…</p>
      </div>
    );
  if (!user) return <SignIn onUser={setUser} initialError={error} />;
  return (
    <WorldContext.Provider
      value={{
        user,
        players,
        messages,
        theater,
        bursts,
        connected,
        conversation,
        setConversation,
        position,
        clientId: clientId.current,
        action,
        logout,
        error,
        setError,
      }}
    >
      {children}
    </WorldContext.Provider>
  );
}

function SignIn({ onUser, initialError }) {
  const [error, setError] = useState(initialError);
  const [busy, setBusy] = useState(false);
  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const values = Object.fromEntries(new FormData(event.currentTarget));
    try {
      const result = await api("/api/auth/login", values);
      onUser(result.user);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="auth-shell">
      <section className="auth-card">
        <span className="auth-kicker">OFFICE HOURS · SHARED STUDIO</span>
        <h1>
          A little space.
          <br />
          Good company.
        </h1>
        <p>
          Code at your desk, meet other builders, and take a break together.
        </p>
        <h2>Welcome back</h2>
        <form onSubmit={submit}>
          <label>
            Username
            <input
              name="username"
              autoComplete="username"
              pattern="[a-zA-Z0-9_]{3,24}"
              minLength={3}
              maxLength={24}
              required
            />
          </label>
          <small>
            Choose a username to enter. New usernames are created automatically.
          </small>
          {error && (
            <p role="alert" className="world-error">
              {error}
            </p>
          )}
          <button className="primary-button" disabled={busy}>
            {busy ? "Opening the door…" : "Enter office ↗"}
          </button>
        </form>
        <small>
          Your code runs in your browser. Use the same username to return on
          another device.
        </small>
      </section>
    </main>
  );
}

export function usePublishActor(room, actor, enabled = true) {
  const world = useWorld();
  const position = world?.position;
  useEffect(() => {
    if (!position || !enabled) return;
    const update = () => {
      const a = actor.current;
      position.current = {
        room,
        x: a.x,
        y: a.y,
        direction: a.direction || "down",
        moving: Boolean(a.moving),
        seated: a.state === "sitting",
        seatId: a.stationId || a.seatId || null,
      };
    };
    update();
    const timer = setInterval(update, 80);
    return () => clearInterval(timer);
  }, [room, actor, enabled, position]);
}
function RemotePlayer({ player, onTalk }) {
  const sprite = useRef(null);
  useEffect(() => {
    let frame = 0;
    const draw = () =>
      sprite.current?.setPose(
        player.direction,
        player.seated ? 5 : player.moving ? frame++ % 4 : 0,
        player.seated ? "sit" : "walk",
      );
    draw();
    const timer = setInterval(draw, 180);
    return () => clearInterval(timer);
  }, [player.direction, player.seated, player.moving]);
  return (
    <div
      className="character animated-character remote-player"
      data-testid="remote-player"
      style={{
        left: `${player.x}%`,
        top: `${player.y}%`,
        zIndex: Math.round(player.y * 10),
      }}
    >
      <CharacterSprite character={1} ref={sprite} />
      <button
        className="remote-talk-target"
        aria-label={`Talk to ${player.name}`}
        onClick={(event) => {
          event.stopPropagation();
          onTalk({ ...player, remote: true, sprite: 1 });
        }}
      />
      <span className="nameplate remote-name">{player.name} · player</span>
    </div>
  );
}
export function RemotePlayers({ room }) {
  const world = useWorld();
  if (!world) return null;
  return world.players
    .filter((p) => p.room === room && p.clientId !== world.clientId)
    .map((p) => (
      <RemotePlayer
        key={p.clientId}
        player={p}
        onTalk={world.setConversation}
      />
    ));
}

export function useSeatReservation(room, enabled, onLost) {
  const world = useWorld();
  const latest = useRef(null);
  latest.current = { world, onLost };
  const held = useRef(null);
  const pending = useRef(false);
  const generation = useRef(0);
  async function release(quiet = false) {
    const seatId = held.current;
    held.current = null;
    const position = latest.current.world.position;
    if (
      seatId &&
      position.current.room === room &&
      position.current.seatId === seatId
    )
      position.current = { ...position.current, seated: false, seatId: null };
    if (seatId && latest.current.world.connected) {
      try {
        await latest.current.world.action({
          type: "release-seat",
          room,
          seatId,
        });
      } catch (error) {
        if (!quiet) latest.current.world.setError(error.message);
      }
    }
  }
  useEffect(() => {
    if (!enabled || !world.connected) {
      generation.current++;
      const hadSeat = held.current !== null;
      void release();
      if (hadSeat) latest.current.onLost?.();
    }
  }, [enabled, world.connected]);
  useEffect(
    () => () => {
      generation.current++;
      void release(true);
    },
    [],
  );
  async function claim(seatId) {
    if (pending.current) return false;
    pending.current = true;
    const version = generation.current;
    try {
      await latest.current.world.action({ type: "claim-seat", room, seatId });
      held.current = seatId;
      if (version !== generation.current) {
        await release();
        return false;
      }
      latest.current.world.setError("");
      return true;
    } catch (error) {
      latest.current.world.setError(error.message);
      return false;
    } finally {
      pending.current = false;
    }
  }
  function occupant(seatId) {
    return latest.current.world.players.find(
      (player) =>
        player.clientId !== latest.current.world.clientId &&
        player.seatRoom === room &&
        player.reservedSeat === seatId,
    );
  }
  return { claim, release, occupant };
}
