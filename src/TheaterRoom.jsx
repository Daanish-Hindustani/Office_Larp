import { createPortal } from "react-dom";
import { RemotePlayers, usePublishActor } from "./Multiplayer";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import CharacterSprite from "./PlayerSprite";
import MovementControls from "./MovementControls";
import { distance, followPath, move, pathTo } from "./world";
import { canWalkTheater, theaterExit, theaterSeats } from "./theaterWorld";
import {
  useWatchParty,
  playbackPosition,
  demoFilm,
  clockTime,
} from "./watchParty";

function AmbientFilm({ film, playing, position = 0 }) {
  return (
    <div
      className={`ambient-film ambient-${film.id}${playing ? " is-playing" : ""}`}
      aria-label={`${film.title}, ambient animation`}
    >
      <div className="film-stars" />
      <div className="film-moon" />
      <div className="film-hill film-hill-back" />
      <div className="film-hill film-hill-front" />
      <div className="film-window" />
      <div
        className="film-rain"
        style={{ transform: `translateY(${(position % 3) * 10}%)` }}
      />
      <div
        className="film-orbit"
        style={{ transform: `rotate(${position * 12 - 20}deg)` }}
      />
      <div
        className="film-fireflies"
        style={{
          transform: `translate(${Math.sin(position / 8) * 13}px, ${Math.cos(position / 8) * 9}px)`,
          opacity: 0.65 + Math.sin(position / 4) * 0.2,
        }}
      />
      <span className="film-caption">{film.title}</span>
    </div>
  );
}

function SeatedGuest({ seat }) {
  const sprite = useRef(null);
  useEffect(() => {
    sprite.current?.setPose("up", 5, "sit");
  }, []);
  return (
    <div
      className="character theater-guest animated-character"
      style={{
        left: `${seat.x}%`,
        top: `${seat.y}%`,
        zIndex: Math.round(seat.y * 10),
      }}
    >
      <CharacterSprite ref={sprite} character={seat.sprite} />
      <span className="nameplate">
        {seat.guest}
        <small>demo</small>
      </span>
    </div>
  );
}

function ScreeningScreen({ title, onClose, children }) {
  const dialog = useRef(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  return createPortal(
    <dialog
      ref={dialog}
      className="theater-screen-dialog"
      aria-label="Theater screening"
      onClose={onClose}
    >
      <header>
        <h2>{title}</h2>
        <button autoFocus onClick={() => dialog.current?.close()}>
          ✕ Back to room
        </button>
      </header>
      {children}
    </dialog>,
    document.body,
  );
}

const TheaterRoom = forwardRef(function TheaterRoom(
  { visible, paused, onExit },
  ref,
) {
  const party = useWatchParty(visible);
  const player = useRef({
    x: 87,
    y: 31,
    state: "standing",
    direction: "down",
    frame: 0,
    elapsed: 0,
  });
  usePublishActor("theater", player, visible);
  const playerElement = useRef(null),
    sprite = useRef(null),
    map = useRef(null),
    route = useRef([]),
    keys = useRef(new Set()),
    selected = useRef(null),
    nearest = useRef(null),
    resumeWalk = useRef(null);
  const callbacks = useRef({});
  callbacks.current = { paused, onExit, visible };
  const [nearby, setNearby] = useState(null);
  const [selectedSeat, setSelectedSeat] = useState(null);
  const [mediaError, setMediaError] = useState("");
  const [needsGesture, setNeedsGesture] = useState(false);
  const [focusScreen, setFocusScreen] = useState(false);
  callbacks.current.focusScreen = focusScreen;
  const [muted, setMuted] = useState(true);
  const [duration, setDuration] = useState(null);
  const [seekPosition, setSeekPosition] = useState(null);
  const seekSequence = useRef(0);
  const video = useRef(null);
  const lastMediaCommand = useRef("");
  const currentParty = useRef(party);
  currentParty.current = party;
  const active = visible && !paused;
  const totalDuration =
    party.state.source.kind === "ambient"
      ? party.state.source.duration
      : duration;

  function stand() {
    const actor = player.current;
    if (actor.state !== "sitting") return;
    actor.state = "standing-up";
    actor.elapsed = 0;
    actor.moving = false;
  }
  async function watchDemo() {
    setMediaError("");
    setNeedsGesture(false);
    const actor = player.current;
    const seatId = actor.seatId;
    const current = currentParty.current.state;
    const change =
      current.source.url === demoFilm.url
        ? {
            playing: true,
            ...(playbackPosition(current) >= demoFilm.duration
              ? { position: 0 }
              : {}),
          }
        : { source: demoFilm, position: 0, playing: true };
    const state = await currentParty.current.publish(change);
    if (
      state?.source.url === demoFilm.url &&
      callbacks.current.visible &&
      actor.state === "sitting" &&
      actor.seatId === seatId
    )
      setFocusScreen(true);
  }
  callbacks.current.watchDemo = watchDemo;
  function exit() {
    callbacks.current.onExit();
  }
  function interact() {
    if (
      !callbacks.current.visible ||
      callbacks.current.paused ||
      callbacks.current.focusScreen ||
      !nearest.current
    )
      return;
    const choice = nearest.current;
    if (choice.kind === "stand") {
      stand();
      return;
    }
    if (choice.kind === "exit") {
      exit();
      return;
    }
    const actor = player.current;
    if (actor.state !== "standing") return;
    actor.seatStart = { x: actor.x, y: actor.y };
    actor.elapsed = 0;
    actor.state = "settling-in";
    actor.seatId = choice.id;
    actor.direction = "up";
    actor.moving = false;
    route.current = [];
    keys.current.clear();
    map.current?.focus({ preventScroll: true });
  }
  function walkTo(point, seatId = null) {
    if (!active || focusScreen) return;
    if (player.current.state === "sitting") {
      resumeWalk.current = { point, seatId };
      stand();
      return;
    }
    if (player.current.state !== "standing") return;
    selected.current = seatId;
    route.current = pathTo(player.current, point, canWalkTheater);
    map.current?.focus({ preventScroll: true });
  }
  useImperativeHandle(ref, () => ({ interact }));
  useEffect(() => {
    if (paused) {
      route.current = [];
      keys.current.clear();
    }
  }, [paused]);
  useEffect(() => {
    if (!visible) return;
    player.current.x = 87;
    player.current.y = 31;
    player.current.state = "standing";
    player.current.seatId = null;
    player.current.direction = "down";
    setSelectedSeat(null);
    resumeWalk.current = null;
    setFocusScreen(false);
    route.current = [];
    selected.current = null;
    map.current?.focus({ preventScroll: true });
  }, [visible]);
  useEffect(() => {
    if (!visible) return;
    function down(event) {
      if (event.key === "Escape" && !callbacks.current.paused) {
        setFocusScreen(false);
        return;
      }
      if (
        callbacks.current.paused ||
        callbacks.current.focusScreen ||
        /INPUT|TEXTAREA|SELECT/.test(event.target.tagName) ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey
      )
        return;
      const key = event.key.toLowerCase();
      if (key === "e") {
        event.preventDefault();
        if (!event.repeat) interact();
        return;
      }
      if (
        ![
          "w",
          "a",
          "s",
          "d",
          "arrowup",
          "arrowleft",
          "arrowdown",
          "arrowright",
        ].includes(key)
      )
        return;
      event.preventDefault();
      stand();
      route.current = [];
      selected.current = null;
      keys.current.add(key);
    }
    const up = (event) => keys.current.delete(event.key.toLowerCase());
    const blur = () => keys.current.clear();
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    let request,
      last = 0;
    function tick(time) {
      const dt = Math.min((time - last) / 1000 || 0, 0.04);
      last = time;
      const actor = player.current;
      if (!callbacks.current.paused && !callbacks.current.focusScreen) {
        actor.elapsed += dt;
        const seat = theaterSeats.find((item) => item.id === actor.seatId);
        const progress = (duration) => Math.min(1, actor.elapsed / duration);
        const ease = (value) => value * value * (3 - 2 * value);
        if (actor.state === "settling-in") {
          const p = ease(progress(0.35));
          actor.x = actor.seatStart.x + (seat.x - actor.seatStart.x) * p;
          actor.y = actor.seatStart.y + (seat.y - 2 - actor.seatStart.y) * p;
          actor.frame = Math.floor(actor.elapsed * 9) % 4;
          actor.moving = true;
          if (p === 1) {
            actor.state = "sitting-down";
            actor.elapsed = 0;
          }
        } else if (actor.state === "sitting-down") {
          actor.y = seat.y - 2 + 2 * ease(progress(0.42));
          actor.frame = Math.min(5, Math.floor(progress(0.42) * 6));
          if (progress(0.42) === 1) {
            actor.state = "sitting";
            actor.y = seat.y;
            actor.elapsed = 0;
            setSelectedSeat(seat.id);
            void callbacks.current.watchDemo();
          }
        } else if (actor.state === "standing-up") {
          actor.y = seat.y - 2 * ease(progress(0.36));
          actor.frame = Math.max(0, 5 - Math.floor(progress(0.36) * 6));
          if (progress(0.36) === 1) {
            actor.state = "leaving-seat";
            actor.elapsed = 0;
          }
        } else if (actor.state === "leaving-seat") {
          const p = ease(progress(0.3));
          actor.y = seat.y - 2 + (seat.entryY - (seat.y - 2)) * p;
          actor.frame = Math.floor(actor.elapsed * 9) % 4;
          if (p === 1) {
            actor.state = "standing";
            actor.seatId = null;
            setSelectedSeat(null);
            if (resumeWalk.current) {
              const next = resumeWalk.current;
              resumeWalk.current = null;
              selected.current = next.seatId;
              route.current = pathTo(actor, next.point, canWalkTheater);
            }
          }
        }
      }
      if (
        !callbacks.current.paused &&
        !callbacks.current.focusScreen &&
        actor.state === "standing"
      ) {
        const k = keys.current;
        const dx =
          Number(k.has("d") || k.has("arrowright")) -
          Number(k.has("a") || k.has("arrowleft"));
        const dy =
          Number(k.has("s") || k.has("arrowdown")) -
          Number(k.has("w") || k.has("arrowup"));
        if (dx || dy) move(actor, dx, dy, dt, 24, undefined, canWalkTheater);
        else if (route.current.length)
          followPath(actor, route.current, dt, 24, undefined, canWalkTheater);
        else move(actor, 0, 0, dt, 24, undefined, canWalkTheater);
        if (actor.x > 83 && actor.y < 20) {
          actor.y = 31;
          exit();
        }
      } else {
        actor.moving = false;
        if (callbacks.current.paused || callbacks.current.focusScreen)
          keys.current.clear();
      }
      const element = playerElement.current;
      if (element) {
        element.style.left = `${actor.x}%`;
        element.style.top = `${actor.y}%`;
        element.style.zIndex = String(Math.round(actor.y * 10));
        element.dataset.state = actor.state;
        sprite.current?.setPose(
          actor.direction,
          actor.state === "sitting" ? 5 : actor.frame,
          ["sitting", "sitting-down", "standing-up"].includes(actor.state)
            ? "sit"
            : "walk",
        );
      }
      const choices =
        actor.state === "sitting"
          ? [{ kind: "stand", id: actor.seatId, label: "Stand up" }]
          : actor.state === "standing"
            ? [
                ...theaterSeats
                  .filter((seat) => !seat.guest)
                  .map((seat) => ({
                    ...seat,
                    kind: "seat",
                    label: `Take seat ${seat.id}`,
                    dist: distance(actor, { x: seat.x, y: seat.entryY }),
                  })),
                {
                  ...theaterExit,
                  kind: "exit",
                  id: "studio",
                  label: "Back to studio",
                  dist: distance(actor, theaterExit),
                },
              ]
                .filter(
                  (choice) => choice.dist < (choice.kind === "exit" ? 10 : 7),
                )
                .sort((a, b) => a.dist - b.dist)
            : [];
      const choice =
        choices.find((item) => item.id === selected.current) ||
        choices[0] ||
        null;
      if (
        choice?.id !== nearest.current?.id ||
        choice?.kind !== nearest.current?.kind
      )
        setNearby(choice);
      nearest.current = choice;
      request = requestAnimationFrame(tick);
    }
    request = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(request);
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
      keys.current.clear();
    };
  }, [visible]);

  useEffect(() => {
    setMediaError("");
    setNeedsGesture(false);
    setDuration(null);
  }, [party.state.source.id]);
  useEffect(() => {
    const element = video.current;
    if (!element) return;
    if (!active || mediaError) {
      element.pause();
      return;
    }
    const target = playbackPosition(party.state);
    const command = `${party.state.source.id}:${party.state.revision}:${party.state.author}`;
    if (
      Number.isFinite(element.duration) &&
      (lastMediaCommand.current !== command ||
        Math.abs(element.currentTime - target) > 1.2)
    )
      element.currentTime = Math.min(element.duration, target);
    lastMediaCommand.current = command;
    if (!party.state.playing) {
      element.pause();
      return;
    }
    if (element.paused)
      element
        .play()
        .then(() => setNeedsGesture(false))
        .catch(() => setNeedsGesture(true));
  }, [active, party.state, party.position, mediaError, focusScreen]);
  async function togglePlayback() {
    if (
      party.state.source.kind === "url" &&
      (needsGesture || !party.state.playing)
    ) {
      try {
        await video.current.play();
        setNeedsGesture(false);
      } catch {
        setMediaError("This video couldn’t start. Return to the room and try Watch demo again.");
        return;
      }
      if (needsGesture && party.state.playing) return;
    }
    if (totalDuration && party.position >= totalDuration)
      party.publish({ position: 0, playing: true });
    else party.publish({ playing: !party.state.playing });
  }
  function renderProjection() {
    return (
      <div
        className="theater-projection"
        onClick={(event) => event.stopPropagation()}
      >
        {party.state.source.kind === "ambient" ? (
          <AmbientFilm
            film={party.state.source}
            playing={active && party.state.playing}
            position={party.position}
          />
        ) : (
          <video
            ref={video}
            key={party.state.source.id}
            src={party.state.source.url}
            muted={muted}
            playsInline
            autoPlay={active && party.state.playing}
            loop={party.state.source.url === demoFilm.url}
            poster={
              party.state.source.url === demoFilm.url
                ? "/media/adialante-poster.jpg"
                : undefined
            }
            preload="metadata"
            aria-label={party.state.source.title}
            onLoadedMetadata={(event) => {
              setDuration(
                Number.isFinite(event.currentTarget.duration)
                  ? event.currentTarget.duration
                  : null,
              );
              event.currentTarget.currentTime = Math.min(
                event.currentTarget.duration || 0,
                playbackPosition(party.state),
              );
            }}
            onEnded={(event) =>
              party.state.source.url !== demoFilm.url && party.publish({
                playing: false,
                position: event.currentTarget.currentTime,
              })
            }
            onError={() =>
              setMediaError(
                "That video couldn’t load. Check that the link points to a playable video file.",
              )
            }
          />
        )}
        {!party.state.playing && (
          <span className="projection-paused">
            {party.position > 0 ? "INTERMISSION" : "MAKE YOURSELF AT HOME"}
          </span>
        )}
      </div>
    );
  }
  return (
    <div className="theater-view" hidden={!visible}>
      {focusScreen && visible && (
        <ScreeningScreen
          title={party.state.source.title}
          onClose={() => setFocusScreen(false)}
        >
          {renderProjection()}
          {mediaError && <p role="alert">{mediaError}</p>}
          <div className="theater-screen-controls">
            <button onClick={togglePlayback} disabled={Boolean(mediaError)}>
              {needsGesture
                ? "▶ Join playback"
                : party.state.playing
                  ? "Ⅱ Pause for everyone"
                  : "▶ Play together"}
            </button>
            <button
              onClick={() => party.publish({ position: 0 })}
              aria-label="Restart screening"
            >
              ↺ Restart
            </button>
            <span>
              {clockTime(party.position)} /{" "}
              {totalDuration ? clockTime(totalDuration) : "--:--"}
            </span>
            <button
              disabled={party.state.source.kind === "ambient"}
              aria-pressed={!muted}
              onClick={() => setMuted((value) => !value)}
            >
              {muted ? "Sound off" : "Sound on"}
            </button>
          </div>
          <input
            type="range"
            className="screening-progress"
            aria-label="Screening progress"
            min="0"
            max={totalDuration || 1}
            step="1"
            value={Math.min(seekPosition ?? party.position, totalDuration || 1)}
            disabled={!totalDuration}
            onChange={(event) => {
              const position = Number(event.target.value);
              const sequence = ++seekSequence.current;
              setSeekPosition(position);
              void party.publish({ position }).finally(() => {
                if (seekSequence.current === sequence) setSeekPosition(null);
              });
            }}
          />
        </ScreeningScreen>
      )}

      <div className="theater-layout">
        <div className="theater-world">
          <div
            className={`map-frame theater-frame${party.state.playing ? " screening-on" : ""}`}
          >
            <div
              className={`theater-map${focusScreen ? " screen-focused" : ""}`}
              ref={map}
              tabIndex={0}
              aria-label="Communal theater. Walk through the aisles, approach a sofa and press E to sit."
              onClick={(event) => {
                const rect = event.currentTarget.getBoundingClientRect();
                walkTo({
                  x: ((event.clientX - rect.left) / rect.width) * 100,
                  y: ((event.clientY - rect.top) / rect.height) * 100,
                });
              }}
            >
              <img
                className="room-art"
                src="/assets/theater.png"
                alt="Cozy pixel theater with plum curtains, a projection screen, six sofas and a snack corner"
                draggable="false"
              />
              {!focusScreen && renderProjection()}
              <button
                className="theater-exit"
                disabled={focusScreen}
                aria-label="Walk through the hallway back to the studio"
                onClick={(event) => {
                  event.stopPropagation();
                  walkTo({ x: 88, y: 16 });
                }}
              >
              </button>
              {theaterSeats.map((seat) => (
                <button
                  key={seat.id}
                  className={`theater-seat${selectedSeat === seat.id ? " is-yours" : ""}`}
                  style={{ left: `${seat.x}%`, top: `${seat.y}%` }}
                  disabled={focusScreen || Boolean(seat.guest)}
                  aria-label={
                    seat.guest
                      ? `${seat.guest}’s sofa, demo coworker`
                      : `Approach seat ${seat.id}`
                  }
                  onClick={(event) => {
                    event.stopPropagation();
                    walkTo({ x: seat.x, y: seat.entryY }, seat.id);
                  }}
                >
                  <span>
                    {seat.guest
                      ? `${seat.guest} · demo`
                      : selectedSeat === seat.id
                        ? "YOUR SPOT"
                        : `SEAT ${seat.id}`}
                  </span>
                </button>
              ))}
              <RemotePlayers room="theater" />
              {theaterSeats
                .filter((seat) => seat.guest)
                .map((seat) => (
                  <SeatedGuest key={seat.id} seat={seat} />
                ))}
              <div
                className="character player animated-character theater-player"
                ref={playerElement}
                data-testid="theater-player"
              >
                <CharacterSprite ref={sprite} />
                <span className="nameplate">You</span>
                {nearby && active && !focusScreen && (
                  <button
                    className="interaction-prompt"
                    onClick={(event) => {
                      event.stopPropagation();
                      interact();
                    }}
                  >
                    <kbd>E</kbd>
                    {nearby.label}
                  </button>
                )}
              </div>
              <div className="theater-reaction-bursts" aria-hidden="true">
                {party.bursts.map((burst, index) => (
                  <span key={burst.id} style={{ left: `${22 + index * 8}%` }}>
                    {burst.value}
                  </span>
                ))}
              </div>
              <span className="theater-room-stamp">
                THE SCREENING ROOM · 02
              </span>
            </div>
          </div>
          <MovementControls disabled={focusScreen || !active} />
          <div className="theater-bottom">
            <button onClick={exit}>← Back to studio</button>
            {selectedSeat && <button onClick={watchDemo}>Watch demo</button>}
            {nearby && !focusScreen && (
              <button onClick={interact}>
                <kbd>E</kbd> {nearby.label}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});
export default TheaterRoom;
