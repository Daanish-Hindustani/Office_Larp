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
  ambientFilms,
  reactions,
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
  const playerElement = useRef(null),
    sprite = useRef(null),
    map = useRef(null),
    route = useRef([]),
    keys = useRef(new Set()),
    selected = useRef(null),
    nearest = useRef(null);
  const callbacks = useRef({});
  callbacks.current = { paused, onExit, visible };
  const [nearby, setNearby] = useState(null);
  const [selectedSeat, setSelectedSeat] = useState(null);
  const [notice, setNotice] = useState("");
  const [mediaError, setMediaError] = useState("");
  const [needsGesture, setNeedsGesture] = useState(false);
  const [focusScreen, setFocusScreen] = useState(false);
  callbacks.current.focusScreen = focusScreen;
  const [muted, setMuted] = useState(true);
  const [duration, setDuration] = useState(null);
  const [draft, setDraft] = useState("");
  const [videoURL, setVideoURL] = useState(""),
    [videoTitle, setVideoTitle] = useState("");
  const [showVideoForm, setShowVideoForm] = useState(false);
  const video = useRef(null),
    chatLog = useRef(null);
  const lastMediaCommand = useRef("");
  const currentParty = useRef(party);
  currentParty.current = party;
  const active = visible && !paused;
  const totalDuration =
    party.state.source.kind === "ambient"
      ? party.state.source.duration
      : duration;
  const roomLink = new URL(window.location.href);
  roomLink.searchParams.set("room", "theater");

  function stand() {
    const actor = player.current;
    if (actor.state !== "sitting") return;
    const seat = theaterSeats.find((item) => item.id === actor.seatId);
    actor.x = seat.x;
    actor.y = seat.entryY;
    actor.state = "standing";
    actor.seatId = null;
    setSelectedSeat(null);
  }
  function exit() {
    if (currentParty.current.count === 1)
      currentParty.current.publish({ playing: false });
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
    actor.x = choice.x;
    actor.y = choice.y;
    actor.state = "sitting";
    actor.seatId = choice.id;
    actor.direction = "up";
    actor.moving = false;
    route.current = [];
    keys.current.clear();
    setSelectedSeat(choice.id);
    map.current?.focus({ preventScroll: true });
  }
  function walkTo(point, seatId = null) {
    if (!active || focusScreen) return;
    stand();
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
          actor.state === "sitting" ? "sit" : "walk",
        );
      }
      const choices =
        actor.state === "sitting"
          ? [{ kind: "stand", id: actor.seatId, label: "Stand up" }]
          : [
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
              .sort((a, b) => a.dist - b.dist);
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
  }, [active, party.state, party.position, mediaError]);
  useEffect(() => {
    chatLog.current?.scrollTo({
      top: chatLog.current.scrollHeight,
      behavior: "smooth",
    });
  }, [party.messages]);

  async function togglePlayback() {
    if (
      party.state.source.kind === "url" &&
      (needsGesture || !party.state.playing)
    ) {
      try {
        await video.current.play();
        setNeedsGesture(false);
      } catch {
        setNotice(
          "This video couldn’t start. Check the link or choose an ambient screening.",
        );
        return;
      }
      if (needsGesture && party.state.playing) return;
    }
    if (totalDuration && party.position >= totalDuration)
      party.publish({ position: 0, playing: true });
    else party.publish({ playing: !party.state.playing });
  }
  function addVideo(event) {
    event.preventDefault();
    try {
      const url = new URL(videoURL);
      if (
        !["http:", "https:"].includes(url.protocol) ||
        /(^|\.)(youtube\.com|youtu\.be|vimeo\.com)$/.test(url.hostname)
      )
        throw new Error();
      if (party.state.queue.length >= 12) {
        setNotice(
          "The queue is full. Remove a screening before adding another.",
        );
        return;
      }
      party.addItem({
        id: crypto.randomUUID(),
        kind: "url",
        url: url.href,
        title: videoTitle.trim() || "A shared screening",
        subtitle: "Video link",
      });
      setVideoURL("");
      setVideoTitle("");
      setShowVideoForm(false);
      setNotice("Added to the queue. Choose Screen this to put it on.");
    } catch {
      setNotice(
        "Use a direct HTTP or HTTPS video link, such as an MP4 or WebM file. YouTube and Vimeo pages can’t play here.",
      );
    }
  }
  return (
    <div className="theater-view" hidden={!visible}>
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
              <div
                className="theater-projection"
                onClick={(event) => event.stopPropagation()}
              >
                {focusScreen && (
                  <button
                    className="theater-close-screen"
                    onClick={() => setFocusScreen(false)}
                  >
                    ✕ Back to room
                  </button>
                )}
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
                      party.publish({
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
                    {party.position > 0
                      ? "INTERMISSION"
                      : "MAKE YOURSELF AT HOME"}
                  </span>
                )}
              </div>
              <button
                className="theater-exit"
                disabled={focusScreen}
                aria-label="Walk through the hallway back to the studio"
                onClick={(event) => {
                  event.stopPropagation();
                  walkTo({ x: 88, y: 16 });
                }}
              >
                <span>↑ STUDIO</span>
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
          <div className="theater-player-controls">
            {mediaError && (
              <p className="screening-error" role="alert">
                {mediaError} Choose another screening from the queue to keep
                watching.
              </p>
            )}
            <div className="screening-heading">
              <span className="green-dot" />
              <div>
                <span>ON THE BIG SCREEN</span>
                <h2>{party.state.source.title}</h2>
              </div>
              <span className="theater-source-tag">
                {party.state.source.kind === "ambient"
                  ? "AMBIENT LOOP"
                  : "VIDEO"}
              </span>
            </div>
            <div className="screening-transport">
              <button
                className="theater-play"
                disabled={!active || Boolean(mediaError)}
                onClick={togglePlayback}
              >
                {needsGesture
                  ? "▶ Join playback"
                  : party.state.playing
                    ? "Ⅱ Pause for everyone"
                    : "▶ Play together"}
              </button>
              <button
                aria-label="Restart screening"
                title="Restart screening"
                onClick={() => party.publish({ position: 0 })}
                disabled={!active}
              >
                ↺
              </button>
              <button
                aria-pressed={focusScreen}
                onClick={() => {
                  route.current = [];
                  keys.current.clear();
                  setFocusScreen((value) => !value);
                }}
              >
                {focusScreen ? "Room view" : "Expand screen"}
              </button>
              <span className="screening-time" data-testid="screening-time">
                {clockTime(party.position)} /{" "}
                {totalDuration ? clockTime(totalDuration) : "--:--"}
              </span>
              <button
                className="theater-audio"
                disabled={party.state.source.kind === "ambient"}
                aria-pressed={!muted}
                onClick={() => setMuted((value) => !value)}
              >
                {party.state.source.kind === "ambient"
                  ? "Silent screening"
                  : muted
                    ? "Sound off"
                    : "Sound on"}
              </button>
            </div>
            <input
              type="range"
              className="screening-progress"
              aria-label="Screening progress"
              min="0"
              max={totalDuration || 1}
              step="1"
              value={Math.min(party.position, totalDuration || 1)}
              disabled={!active || !totalDuration}
              onChange={(event) =>
                party.publish({ position: Number(event.target.value) })
              }
            />
            <div className="theater-bottom">
              <span>
                {selectedSeat
                  ? `Settled into ${selectedSeat}. Stay a little while.`
                  : "Wander over to a sofa. There’s no rush."}
              </span>
              {nearby && !focusScreen && (
                <button onClick={interact}>
                  <kbd>E</kbd> {nearby.label}
                </button>
              )}
            </div>
          </div>
        </div>
        <aside
          className="watch-party-panel"
          aria-labelledby="watch-party-title"
        >
          <header className="watch-party-heading">
            <span className="pair-eyebrow">GOOD COMPANY. NO AGENDA.</span>
            <h1 id="watch-party-title">
              Watch party<span>✦</span>
            </h1>
            <p>
              <i className="green-dot" /> {party.count}{" "}
              {party.count === 1 ? "guest" : "guests"} here · local room
            </p>
            <span className="watch-party-local">
              {party.connected
                ? "Playback & chat shared across browser tabs."
                : "Solo mode · this browser can’t connect other tabs."}
            </span>
          </header>
          <div className="watch-party-content">
            <section className="watch-party-queue">
              <div className="theater-section-heading">
                <h2>
                  Up next <small>{party.state.queue.length}</small>
                </h2>
                <button
                  aria-expanded={showVideoForm}
                  onClick={() => setShowVideoForm((value) => !value)}
                >
                  {showVideoForm ? "Cancel" : "+ Add video"}
                </button>
              </div>
              {showVideoForm && (
                <form className="theater-video-form" onSubmit={addVideo}>
                  <label htmlFor="screening-title">
                    A name for the screening
                  </label>
                  <input
                    id="screening-title"
                    value={videoTitle}
                    maxLength={80}
                    onChange={(event) => setVideoTitle(event.target.value)}
                    placeholder="A little movie night"
                  />
                  <label htmlFor="screening-url">Direct video link</label>
                  <input
                    id="screening-url"
                    type="url"
                    required
                    value={videoURL}
                    onChange={(event) => setVideoURL(event.target.value)}
                    placeholder="https://…/film.mp4"
                  />
                  <small>MP4 or WebM · choose a video you can share.</small>
                  <button className="pair-primary">Add to queue ↗</button>
                </form>
              )}
              <ol>
                {party.state.queue.map((item) => (
                  <li key={item.id}>
                    <div className={`queue-thumbnail queue-${item.id}`}>
                      {item.kind === "ambient" ? (
                        <AmbientFilm film={item} playing={false} />
                      ) : (
                        <span>▶</span>
                      )}
                    </div>
                    <div className="queue-description">
                      <strong>{item.title}</strong>
                      <span>
                        {item.kind === "ambient"
                          ? "10 min · ambient loop"
                          : "Shared video link"}
                      </span>
                      <button
                        onClick={() => {
                          party.playItem(item);
                          setNotice("Ready when you are. Press Play together.");
                        }}
                      >
                        Screen this ↗
                      </button>
                    </div>
                    <button
                      className="queue-remove"
                      aria-label={`Remove ${item.title} from queue`}
                      onClick={() => party.removeItem(item.id)}
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ol>
              {!party.state.queue.length && (
                <p className="theater-empty-queue">
                  A little breathing room. Add a video, or bring back an ambient
                  loop.
                </p>
              )}
              <button
                className="theater-ambient-reset"
                onClick={() => {
                  const missing = ambientFilms.filter(
                    (film) =>
                      film.id !== party.state.source.id &&
                      !party.state.queue.some((item) => item.id === film.id),
                  );
                  if (!missing.length) {
                    setNotice("All the ambient loops are already in the room.");
                    return;
                  }
                  party.publish({
                    queue: [...party.state.queue, ...missing].slice(0, 12),
                  });
                }}
              >
                + Browse the ambient shelf
              </button>
            </section>
            <section className="watch-party-reactions">
              <h2>A little reaction</h2>
              <div>
                {reactions.map((reaction) => (
                  <button
                    key={reaction}
                    aria-label={`React ${reaction}`}
                    onClick={() => party.react(reaction)}
                  >
                    {reaction}
                  </button>
                ))}
              </div>
              <span className="theater-reaction-status" role="status">
                {party.bursts.at(-1)
                  ? `${party.isYou(party.bursts.at(-1).sender) ? "You" : "A studio friend"} sent ${party.bursts.at(-1).value}`
                  : "Quiet company is welcome, too."}
              </span>
            </section>
            <section className="watch-party-chat">
              <h2>From the sofas</h2>
              <div
                ref={chatLog}
                className="theater-chat-log"
                role="log"
                aria-live="polite"
              >
                {!party.messages.length && (
                  <p className="theater-chat-empty">
                    Say hello, trade a thought, or just enjoy the company.
                  </p>
                )}
                {party.messages.map((message) => (
                  <p key={message.id}>
                    <strong>
                      {party.isYou(message.sender) ? "You" : "A studio friend"}
                    </strong>
                    <span>{message.value}</span>
                  </p>
                ))}
              </div>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  party.sendChat(draft);
                  setDraft("");
                }}
              >
                <input
                  aria-label="Message the theater"
                  value={draft}
                  maxLength={300}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder="A thought from your sofa…"
                />
                <button
                  disabled={!draft.trim()}
                  aria-label="Send theater message"
                >
                  ↗
                </button>
              </form>
            </section>
            <section className="theater-share">
              <span>Save a spot for a friend.</span>
              <p>
                Open the local room link in another tab on this device to watch
                together.
              </p>
              <button
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(roomLink.href);
                    setNotice(
                      "Local room link copied. Open it in another tab on this device.",
                    );
                  } catch {
                    setNotice(
                      "Copy wasn’t available. Use the local room link below.",
                    );
                  }
                }}
              >
                Copy local room link ↗
              </button>
              <a href={roomLink.href} target="_blank" rel="noreferrer">
                Open another seat ↗
              </a>
            </section>
            {(notice || mediaError) && (
              <p className="theater-notice" role="status">
                {mediaError || notice}
              </p>
            )}
          </div>
          <footer className="theater-panel-footer">
            <span>Two familiar faces are here as demo guests.</span>
            <button onClick={exit}>← Back to studio</button>
          </footer>
        </aside>
      </div>
    </div>
  );
});
export default TheaterRoom;
