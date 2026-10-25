import {
  RemotePlayers,
  usePublishActor,
  useSeatReservation,
} from "./Multiplayer";
import { useCallback, useEffect, useRef, useState } from "react";
import CharacterSprite from "./PlayerSprite";
import MovementControls from "./MovementControls";
import LeetCodeBoard from "./LeetCodeBoard";
import LeetCodeWorkspace from "./LeetCodeWorkspace";
import { useLeetCodeRoom } from "./leetcodeClient";
import { canWalkLab, labExit, labStations } from "./labWorld";
import { distance, move, followPath, pathTo } from "./world";

export default function LeetCodeRoom({ visible, paused, onExit }) {
  const room = useLeetCodeRoom(visible);
  const actor = useRef({
    x: 50,
    y: 27,
    direction: "down",
    state: "standing",
    frame: 0,
  });
  usePublishActor("leetcode", actor, visible);
  const playerElement = useRef(null),
    art = useRef(null),
    map = useRef(null),
    route = useRef([]),
    keys = useRef(new Set()),
    selected = useRef(null),
    nearest = useRef(null),
    callbacks = useRef({});
  const [nearby, setNearby] = useState(null),
    [seated, setSeated] = useState(null),
    [workspace, setWorkspace] = useState(null),
    [boardOpen, setBoardOpen] = useState(false);
  const seat = useSeatReservation("leetcode", visible, () => {
    setWorkspace(null);
    stand();
  });
  const boardDialog = useRef(null);
  useEffect(() => {
    const dialog = boardDialog.current;
    if (boardOpen && visible) dialog?.showModal();
    else dialog?.close();
  }, [boardOpen, visible]);
  const closeWorkspace = useCallback(() => {
    setWorkspace(null);
    requestAnimationFrame(() => map.current?.focus({ preventScroll: true }));
  }, []);
  callbacks.current = {
    paused: paused || Boolean(workspace) || boardOpen,
    onExit,
    visible,
    openComputer,
    seat,
  };
  function stand() {
    const player = actor.current;
    if (player.state !== "sitting") return;
    const station = labStations.find((item) => item.id === player.stationId);
    player.x = station.entry.x;
    player.y = station.entry.y;
    player.state = "standing";
    player.stationId = null;
    void seat.release();
    setSeated(null);
  }
  function openComputer(station) {
    setWorkspace({ station, slug: station.slug });
    keys.current.clear();
    route.current = [];
  }
  async function interact() {
    if (
      callbacks.current.paused ||
      !callbacks.current.visible ||
      !nearest.current
    )
      return;
    const choice = nearest.current;
    if (choice.kind === "exit") {
      callbacks.current.onExit();
      return;
    }
    if (choice.kind === "computer") {
      callbacks.current.openComputer(
        labStations.find((item) => item.id === choice.id),
      );
      return;
    }
    if (actor.current.state !== "standing") return;
    if (!(await callbacks.current.seat.claim(choice.id))) return;
    if (
      callbacks.current.paused ||
      !callbacks.current.visible ||
      actor.current.state !== "standing" ||
      distance(actor.current, choice.entry) > 7
    ) {
      void callbacks.current.seat.release();
      return;
    }
    const player = actor.current;
    player.state = "sitting";
    player.x = choice.x;
    player.y = choice.y;
    player.direction = "up";
    player.moving = false;
    player.stationId = choice.id;
    setSeated(choice.id);
    route.current = [];
    keys.current.clear();
    map.current?.focus({ preventScroll: true });
    openComputer(labStations.find((station) => station.id === choice.id));
  }
  function walkTo(point, stationId = null) {
    if (callbacks.current.paused) return;
    stand();
    selected.current = stationId;
    route.current = pathTo(actor.current, point, canWalkLab);
    map.current?.focus({ preventScroll: true });
  }
  function approachStation(station) {
    if (
      actor.current.stationId === station.id &&
      actor.current.state === "sitting"
    ) {
      openComputer(station);
      return;
    }
    walkTo(station.entry, station.id);
  }
  useEffect(() => {
    if (!visible) return;
    actor.current = {
      x: 50,
      y: 27,
      direction: "down",
      state: "standing",
      frame: 0,
    };
    setSeated(null);
    selected.current = null;
    nearest.current = null;
    setNearby(null);
    route.current = [];
    keys.current.clear();
    map.current?.focus({ preventScroll: true });
  }, [visible]);
  useEffect(() => {
    if (paused || workspace || boardOpen) {
      route.current = [];
      keys.current.clear();
    }
  }, [paused, workspace, boardOpen]);
  useEffect(() => {
    if (!visible) return;
    function down(event) {
      if (
        callbacks.current.paused ||
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
          "arrowdown",
          "arrowleft",
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
    const up = (event) => keys.current.delete(event.key.toLowerCase()),
      blur = () => keys.current.clear();
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    let request,
      last = 0;
    function tick(time) {
      const dt = Math.min((time - last) / 1000 || 0, 0.04);
      last = time;
      const player = actor.current;
      if (!callbacks.current.paused && player.state === "standing") {
        const k = keys.current,
          dx =
            Number(k.has("d") || k.has("arrowright")) -
            Number(k.has("a") || k.has("arrowleft")),
          dy =
            Number(k.has("s") || k.has("arrowdown")) -
            Number(k.has("w") || k.has("arrowup"));
        if (dx || dy) move(player, dx, dy, dt, 24, undefined, canWalkLab);
        else if (route.current.length)
          followPath(player, route.current, dt, 24, undefined, canWalkLab);
        else move(player, 0, 0, dt, 24, undefined, canWalkLab);
        if (player.x > 44 && player.x < 56 && player.y < 19) {
          player.y = 27;
          callbacks.current.onExit();
        }
      } else player.moving = false;
      if (playerElement.current) {
        playerElement.current.style.left = `${player.x}%`;
        playerElement.current.style.top = `${player.y}%`;
        playerElement.current.style.zIndex = String(Math.round(player.y * 10));
        playerElement.current.dataset.state = player.state;
        art.current?.setPose(
          player.direction,
          player.state === "sitting" ? 5 : player.frame,
          player.state === "sitting" ? "sit" : "walk",
        );
      }
      const choices =
        player.state === "sitting"
          ? [{ kind: "computer", id: player.stationId, label: "Open computer" }]
          : [
              ...labStations
                .filter(
                  (station) => !callbacks.current.seat.occupant(station.id),
                )
                .map((station) => ({
                  ...station,
                  kind: "seat",
                  label: `Sit at desk ${station.id}`,
                  dist: distance(player, station.entry),
                })),
              {
                ...labExit,
                kind: "exit",
                id: "studio",
                label: "Back to studio",
                dist: distance(player, labExit),
              },
            ]
              .filter(
                (choice) => choice.dist < (choice.kind === "exit" ? 8 : 7),
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
  return (
    <div className="leetcode-room" hidden={!visible}>
      <div className="lab-layout">
        <div className="lab-world">
          <div className="map-frame lab-frame">
            <div
              className="lab-map"
              ref={map}
              tabIndex={0}
              aria-label="Algorithm room. Approach a computer, press E to sit, then open its workspace."
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
                src="/assets/algorithm-room.png"
                alt="Warm pixel-art algorithm room with four computers, teal chairs, plants and a leaderboard chalkboard"
                draggable="false"
              />
              <button
                className="lab-chalkboard"
                aria-label="Open LeetCode leaderboard"
                onClick={(event) => {
                  event.stopPropagation();
                  setBoardOpen(true);
                }}
              >
                <span>THE PRACTICE CLUB</span>
                {room.profiles.length ? (
                  room.profiles.slice(0, 3).map((profile) => (
                    <div key={profile.username}>
                      <b>{profile.place}.</b>
                      <span>{profile.username}</span>
                      <strong>{profile.points}</strong>
                    </div>
                  ))
                ) : (
                  <p>
                    One little problem.
                    <br />A little shared progress.
                  </p>
                )}
              </button>
              <button
                className="lab-exit"
                aria-label="Walk back to the studio from the algorithm room"
                onClick={(event) => {
                  event.stopPropagation();
                  walkTo({ x: 50, y: 16 });
                }}
              >
                ↑ STUDIO
              </button>
              <RemotePlayers room="leetcode" />
              {labStations.map((station) => (
                <button
                  key={station.id}
                  className={`lab-station${seated === station.id ? " is-seated" : ""}`}
                  style={{ left: `${station.x}%`, top: `${station.y - 8}%` }}
                  disabled={Boolean(seat.occupant(station.id))}
                  title={
                    seat.occupant(station.id)
                      ? `Occupied by ${seat.occupant(station.id).name}`
                      : undefined
                  }
                  aria-label={`Approach coding desk ${station.id}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    approachStation(station);
                  }}
                >
                  <span>
                    DESK {station.id}
                    <small>
                      {seat.occupant(station.id)
                        ? `Occupied · ${seat.occupant(station.id).name}`
                        : station.label}
                    </small>
                  </span>
                </button>
              ))}
              <div
                className="character player animated-character lab-player"
                ref={playerElement}
                data-testid="lab-player"
              >
                <CharacterSprite ref={art} />
                <span className="nameplate">You</span>
                {nearby && !callbacks.current.paused && (
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
              <span className="lab-room-stamp">THE ALGORITHM ROOM · 03</span>
            </div>
          </div>
          <MovementControls disabled={paused || Boolean(workspace)} />
          <div className="lab-room-bottom">
            <div>
              <span className="green-dot" />
              {seated
                ? `Desk ${seated}. One small step at a time.`
                : "Pull up a chair. Let’s work through something."}
            </div>
            <div className="lab-room-actions">
              {seated && (
                <>
                  <button
                    onClick={() =>
                      openComputer(
                        labStations.find((station) => station.id === seated),
                      )
                    }
                  >
                    Open computer ↗
                  </button>
                  <button onClick={stand}>Stand up</button>
                </>
              )}
              {!seated && nearby && (
                <button onClick={interact}>
                  <kbd>E</kbd> {nearby.label}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
      <dialog
        ref={boardDialog}
        className="lab-board-dialog"
        aria-labelledby="leetcode-board-title"
        onClose={() => setBoardOpen(false)}
        onClick={(event) => {
          if (event.target === event.currentTarget) event.currentTarget.close();
        }}
      >
        {boardOpen && (
          <>
            <button
              className="chrome-button lab-board-close"
              autoFocus
              onClick={() => boardDialog.current?.close()}
            >
              Close leaderboard
            </button>
            <LeetCodeBoard room={room} />
          </>
        )}
      </dialog>
      {workspace && (
        <LeetCodeWorkspace
          station={workspace.station}
          initialSlug={workspace.slug}
          room={room}
          onClose={closeWorkspace}
        />
      )}
    </div>
  );
}
