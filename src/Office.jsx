import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { people, desks } from "./data";
import CharacterSprite from "./PlayerSprite";
import {
  RemotePlayers,
  usePublishActor,
  useSeatReservation,
} from "./Multiplayer";
import ChairSprite from "./ChairSprite";
import {
  canWalk,
  chairs,
  distance,
  followPath,
  makeNpc,
  move,
  pathTo,
  seatFrame,
  updateNpc,
  beginChairPull,
  updateChairAction,
  theaterDoor,
  leetcodeDoor,
} from "./world";

export function Avatar({ sprite = 0, className = "" }) {
  return (
    <span
      aria-hidden="true"
      className={"avatar " + className}
      style={{
        backgroundImage: `url('/assets/game-characters/char_${sprite}.png')`,
      }}
    />
  );
}
const Office = forwardRef(function Office(
  {
    onVisit,
    onChat,
    onEnterTheater,
    onEnterLeetCode,
    paused,
    onNearby,
    onSeatLost,
    emote,
    visible = true,
  },
  ref,
) {
  const playerElement = useRef(null),
    playerArt = useRef(null),
    npcElements = useRef({}),
    npcArt = useRef({}),
    chairSprites = useRef({});
  const actor = useRef({
    x: 57,
    y: 86,
    direction: "down",
    state: "standing",
    frame: 0,
    stride: 0,
    elapsed: 0,
    seatId: null,
    chairOffset: 0,
  });
  usePublishActor("studio", actor, visible);
  const npcs = useRef(null);
  if (!npcs.current) npcs.current = people.map(makeNpc);
  const keys = useRef(new Set()),
    route = useRef([]),
    nearest = useRef(null),
    pending = useRef(null),
    selected = useRef(null),
    resumeWalk = useRef(null),
    callbacks = useRef({});
  callbacks.current = {
    onVisit,
    onChat,
    onEnterTheater,
    onEnterLeetCode,
    paused,
    onNearby,
  };
  const seat = useSeatReservation("studio", visible, () => {
    const a = actor.current;
    const chair = chairs.find((chair) => chair.id === a.seatId);
    if (chair) {
      a.x = chair.entry.x;
      a.y = chair.entry.y;
    }
    a.state = "standing";
    a.seatId = null;
    a.chairOffset = 0;
    stop();
    onSeatLost?.();
  });
  callbacks.current.seat = seat;
  const [nearby, setNearby] = useState(null),
    [target, setTarget] = useState(null),
    [message, setMessage] = useState(null),
    [bubble, setBubble] = useState(0);
  function stop() {
    keys.current.clear();
    route.current = [];
    pending.current = null;
    setTarget(null);
    actor.current.moving = false;
    actor.current.frame = 0;
    actor.current.stride = 0;
  }
  function available(chair) {
    return (
      !callbacks.current.seat?.occupant(chair.id) &&
      !npcs.current.some(
        (n) =>
          n.seat.id === chair.id &&
          [
            "sitting",
            "sitting-down",
            "standing-up",
            "rolling-in",
            "rolling-out",
            "approaching",
            "lining-up",
            "grabbing-chair",
            "pulling-chair",
            "positioning",
            "clearing-seat",
            "pushing-chair",
            "chair-cleared",
            "leaving",
          ].includes(n.state),
      )
    );
  }
  function stand() {
    const a = actor.current;
    if (a.state === "sitting") {
      a.state = "rolling-out";
      a.elapsed = 0;
      stop();
    }
  }
  async function interact(choice = nearest.current) {
    if (!choice || callbacks.current.paused) return;
    const a = actor.current;
    if (choice.kind === "door") {
      const door = choice.id === "leetcode" ? leetcodeDoor : theaterDoor;
      if (distance(a, door) > 12) return;
      enterRoom(choice.id);
      return;
    }
    if (choice.kind === "stand") {
      resumeWalk.current = null;
      stand();
      return;
    }
    if (choice.kind === "person") {
      const npc = npcs.current.find((n) => n.id === choice.id);
      if (!npc || distance(a, npc) > 9) return;
      stop();
      const dx = (npc.x - a.x) * 1.5,
        dy = npc.y - a.y;
      a.direction =
        Math.abs(dx) > Math.abs(dy)
          ? dx < 0
            ? "left"
            : "right"
          : dy < 0
            ? "up"
            : "down";
      if (seatFrame(npc) === null) {
        npc.direction = {
          left: "right",
          right: "left",
          up: "down",
          down: "up",
        }[a.direction];
        npc.frame = 0;
        npc.moving = false;
      }
      callbacks.current.onChat(people.find((p) => p.id === choice.id));
      return;
    }
    if (choice.kind === "chair") {
      const chair = chairs.find((c) => c.id === choice.id);
      if (
        a.state !== "standing" ||
        !chair ||
        !available(chair) ||
        distance(a, chair) > 9
      )
        return;
      stop();
      if (!(await callbacks.current.seat.claim(chair.id))) return;
      if (
        callbacks.current.paused ||
        a.state !== "standing" ||
        !available(chair) ||
        distance(a, chair) > 9
      ) {
        void callbacks.current.seat.release();
        return;
      }
      playerElement.current
        ?.closest(".office-map")
        ?.focus({ preventScroll: true });
      stop();
      a.seatId = chair.id;
      a.chairOffset = 0;
      a.state = "aligning";
      route.current = pathTo(a, chair.entry);
      a.elapsed = 0;
      return;
    }
    if (choice.kind === "computer") {
      if (callbacks.current.seat.occupant(choice.desk.id)) {
        setMessage("That desk is occupied. Try another one.");
        return;
      }
      stop();
      callbacks.current.onVisit(choice.desk);
    }
  }
  function enterRoom(room) {
    stop();
    actor.current.x = room === "leetcode" ? leetcodeDoor.x : theaterDoor.x;
    actor.current.y = 90;
    actor.current.direction = "up";
    selected.current = null;
    if (room === "leetcode") callbacks.current.onEnterLeetCode?.();
    else callbacks.current.onEnterTheater?.();
  }
  useImperativeHandle(ref, () => ({
    interact: () => interact(),
    returnFromTheater: () => {
      stop();
      actor.current.x = 50;
      actor.current.y = 90;
      actor.current.direction = "up";
      selected.current = null;
      requestAnimationFrame(() =>
        playerElement.current
          ?.closest(".office-map")
          ?.focus({ preventScroll: true }),
      );
    },
    returnFromLeetCode: () => {
      stop();
      actor.current.x = 66;
      actor.current.y = 90;
      actor.current.direction = "up";
      selected.current = null;
      requestAnimationFrame(() =>
        playerElement.current
          ?.closest(".office-map")
          ?.focus({ preventScroll: true }),
      );
    },
    visitSeatedProject: () => {
      const chair = chairs.find((c) => c.id === actor.current.seatId);
      if (chair) callbacks.current.onVisit(chair.desk);
    },
  }));
  useEffect(() => {
    if (!emote) return;
    setMessage("Hey, office! 👋");
    const id = setTimeout(() => setMessage(null), 2800);
    return () => clearTimeout(id);
  }, [emote]);
  useEffect(() => {
    const id = setInterval(
      () => setBubble((v) => (v + 1) % people.length),
      6500,
    );
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    if (paused) stop();
  }, [paused]);
  useEffect(() => {
    const down = (e) => {
      if (callbacks.current.paused || /INPUT|TEXTAREA/.test(e.target.tagName))
        return;
      const k = e.key.toLowerCase();
      if (
        [
          "arrowup",
          "arrowdown",
          "arrowleft",
          "arrowright",
          "w",
          "a",
          "s",
          "d",
          "e",
          " ",
        ].includes(k)
      )
        e.preventDefault();
      if (k === "e") {
        if (!e.repeat) interact();
        return;
      }
      if (
        [
          "arrowup",
          "arrowdown",
          "arrowleft",
          "arrowright",
          "w",
          "a",
          "s",
          "d",
        ].includes(k)
      ) {
        resumeWalk.current = null;
        if (actor.current.state === "sitting") stand();
        keys.current.add(k);
      }
    };
    const up = (e) => keys.current.delete(e.key.toLowerCase()),
      blur = () => keys.current.clear();
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    let request,
      last = 0;
    function renderActor(a, element, art) {
      if (!element) return;
      element.style.left = a.x + "%";
      element.style.top = a.y + "%";
      element.style.zIndex = String(Math.round(a.y * 10));
      element.dataset.direction = a.direction;
      element.dataset.state = a.state;
      element.classList.toggle("walking", Boolean(a.moving));
      element.style.setProperty("--walk-frame", a.frame || 0);
      const sitting = seatFrame(a);
      element.dataset.seatFrame = sitting === null ? "" : String(sitting);
      art?.setPose(
        a.direction,
        sitting ?? a.frame,
        sitting === null ? "walk" : "sit",
      );
    }
    function tick(time) {
      const dt = Math.min((time - last) / 1000 || 0, 0.04);
      last = time;
      const a = actor.current;
      const wasSitting = a.state === "sitting";
      if (!callbacks.current.paused) {
        a.elapsed += dt;
        const blocked = (next) =>
          npcs.current.some((n) => distance(next, n) < 2.5);
        if (a.state === "aligning") {
          const chair = chairs.find((c) => c.id === a.seatId);
          if (!available(chair)) {
            a.state = "standing";
            a.seatId = null;
            void callbacks.current.seat.release();
          } else if (route.current.length) {
            followPath(a, route.current, dt, 14, blocked);
          } else if (distance(a, chair.grip) < 0.2) {
            beginChairPull(a, chair);
          } else
            move(a, chair.grip.x - a.x, chair.grip.y - a.y, dt, 14, blocked);
        } else if (
          a.seatId &&
          updateChairAction(
            a,
            chairs.find((c) => c.id === a.seatId),
            dt,
            blocked,
          )
        ) {
          // The player and NPCs use the same reach, pull, sit, and push stages.
        } else if (a.state === "chair-cleared") {
          a.state = "stepping-out";
          a.elapsed = 0;
        } else if (a.state === "stepping-out") {
          const chair = chairs.find((c) => c.id === a.seatId);
          if (distance(a, chair.entry) < 0.2) {
            a.state = "standing";
            a.seatId = null;
            void callbacks.current.seat.release();
            if (resumeWalk.current) {
              const { destination, intention } = resumeWalk.current;
              route.current = pathTo(a, destination);
              pending.current = intention;
              selected.current = intention;
              setTarget(destination);
              resumeWalk.current = null;
            }
          } else
            move(a, chair.entry.x - a.x, chair.entry.y - a.y, dt, 12, blocked);
        } else if (a.state !== "sitting") {
          const k = keys.current,
            dx =
              Number(k.has("d") || k.has("arrowright")) -
              Number(k.has("a") || k.has("arrowleft")),
            dy =
              Number(k.has("s") || k.has("arrowdown")) -
              Number(k.has("w") || k.has("arrowup"));
          if (dx || dy) {
            route.current = [];
            pending.current = null;
            selected.current = null;
            setTarget((v) => (v === null ? v : null));
            move(a, dx, dy, dt, 24, blocked);
          } else if (route.current.length) {
            if (followPath(a, route.current, dt, 24, blocked)) setTarget(null);
          } else move(a, 0, 0, dt);
          if (pending.current) {
            const p = pending.current;
            const destination =
              p.kind === "person"
                ? npcs.current.find((n) => n.id === p.id)
                : p.kind === "chair"
                  ? chairs.find((c) => c.id === p.id)
                  : {
                      ...desks.find((d) => d.id === p.id),
                      y: desks.find((d) => d.id === p.id).deskY + 2,
                    };
            if (
              destination &&
              distance(a, destination) < (p.kind === "computer" ? 12.5 : 6.5)
            ) {
              pending.current = null;
              route.current = [];
              setTarget(null);
              selected.current = p;
              move(a, 0, 0, dt);
            } else if (
              destination &&
              !route.current.length &&
              time > (p.repathAt || 0)
            ) {
              p.repathAt = time + 750;
              const next = { x: destination.x, y: destination.y + 3 };
              route.current = pathTo(
                a,
                canWalk(next.x, next.y) ? next : destination,
              );
            }
          }
        }
        if (a.state === "standing" && a.x > 44 && a.x < 56 && a.y > 97)
          enterRoom("theater");
        else if (a.state === "standing" && a.x > 62 && a.x < 70 && a.y > 97)
          enterRoom("leetcode");
        for (const npc of npcs.current)
          updateNpc(
            npc,
            dt,
            a,
            npcs.current,
            Boolean(callbacks.current.seat.occupant(npc.id)),
          );
      }
      for (const chair of chairs) {
        const owner =
          a.seatId === chair.id
            ? a
            : npcs.current.find((n) => n.seat.id === chair.id);
        chairSprites.current[chair.id]?.setOffset(owner?.chairOffset || 0);
      }
      renderActor(a, playerElement.current, playerArt.current);
      for (const npc of npcs.current)
        renderActor(npc, npcElements.current[npc.id], npcArt.current[npc.id]);
      let choice = null;
      if (a.state === "sitting")
        choice = {
          kind: "stand",
          id: a.seatId,
          label: "Stand up",
          name: "your chair",
        };
      else if (a.state === "standing") {
        const candidates = [
          {
            ...leetcodeDoor,
            kind: "door",
            id: "leetcode",
            name: "the algorithm room",
            label: "Enter algorithm room",
            radius: 10,
          },
          {
            ...theaterDoor,
            kind: "door",
            id: "theater",
            name: "the theater",
            label: "Enter theater",
            radius: 11,
          },
          ...npcs.current.map((n) => ({
            kind: "person",
            id: n.id,
            name: n.name,
            label: `Talk to ${n.name}`,
            x: n.x,
            y: n.y,
            radius: 8.5,
          })),
          ...chairs.filter(available).map((c) => ({
            kind: "chair",
            id: c.id,
            name: c.name,
            label: "Sit down",
            x: c.x,
            y: c.y,
            radius: 8,
          })),
          ...desks.map((d) => ({
            kind: "computer",
            id: d.id,
            name: `${d.name}’s computer`,
            label: "Open computer",
            desk: d,
            x: d.x,
            y: d.deskY + 2,
            radius: 12.5,
          })),
        ]
          .map((c) => ({ ...c, dist: distance(a, c) }))
          .filter((c) => c.dist < c.radius)
          .sort((l, r) => l.dist - r.dist);
        const chosen = selected.current;
        choice =
          candidates.find(
            (c) => c.kind === chosen?.kind && c.id === chosen?.id,
          ) ||
          candidates[0] ||
          null;
      }
      const key = (c) => (c ? `${c.kind}:${c.id}` : "");
      if (key(choice) !== key(nearest.current)) {
        nearest.current = choice;
        setNearby(choice);
        callbacks.current.onNearby(choice);
      } else nearest.current = choice;
      if (!wasSitting && a.state === "sitting") {
        const chair = chairs.find((chair) => chair.id === a.seatId);
        if (chair) callbacks.current.onVisit(chair.desk);
      }
      request = requestAnimationFrame(tick);
    }
    request = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(request);
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, []);
  function walkTo(destination, intention = null) {
    if (paused) return;
    if (actor.current.state === "sitting") {
      resumeWalk.current = { destination, intention };
      stand();
      return;
    }
    if (actor.current.state !== "standing") return;
    route.current = pathTo(actor.current, destination);
    selected.current = intention;
    pending.current = intention;
    if (route.current.length) setTarget(destination);
  }
  function approach(choice) {
    if (choice.kind === "chair") {
      const chair = chairs.find((c) => c.id === choice.id);
      if (!available(chair)) choice = { kind: "person", id: chair.id };
    }
    const a = actor.current,
      target =
        choice.kind === "person"
          ? npcs.current.find((n) => n.id === choice.id)
          : chairs.find((c) => c.id === choice.id);
    selected.current = choice;
    if (distance(a, target) < 7) return;
    walkTo({ x: target.x, y: target.y + 3 }, choice);
  }
  return (
    <div
      className="office-map"
      tabIndex={0}
      onClick={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        walkTo({
          x: ((e.clientX - r.left) / r.width) * 100,
          y: ((e.clientY - r.top) / r.height) * 100,
        });
      }}
      aria-label="Virtual pixel office. Walk near a chair or coworker and press E to interact."
    >
      <img
        className="room-art"
        src="/assets/office-floor-lab.png"
        alt="Cozy pixel office with computers, chairs, plants and a sofa lounge"
        draggable="false"
      />
      <RemotePlayers room="studio" />
      {chairs.map((chair) => (
        <ChairSprite
          key={chair.id}
          chair={chair}
          ref={(el) => {
            chairSprites.current[chair.id] = el;
          }}
        />
      ))}
      <button
        className="theater-door"
        aria-label="Walk down the hallway to the theater"
        onClick={(event) => {
          event.stopPropagation();
          walkTo({ x: 50, y: 100 });
        }}
      />
      <button
        className="theater-door leetcode-door"
        aria-label="Walk to the algorithm room to the right of the theater"
        onClick={(event) => {
          event.stopPropagation();
          walkTo({ x: 66, y: 100 });
        }}
      />
      {desks.map((d) => (
        <button
          key={d.id}
          className={
            "desk-hotspot" +
            (nearby?.kind === "computer" && nearby.id === d.id
              ? " interaction-target"
              : "")
          }
          style={{ left: d.x + "%", top: d.deskY + "%", "--accent": d.color }}
          onClick={(e) => {
            e.stopPropagation();
            const choice = { kind: "computer", id: d.id };
            walkTo({ x: d.x, y: d.y + 3 }, choice);
          }}
          disabled={Boolean(seat.occupant(d.id))}
          title={
            seat.occupant(d.id)
              ? `Occupied by ${seat.occupant(d.id).name}`
              : undefined
          }
          aria-label={`Visit ${d.name}’s computer — ${d.project}`}
        >
          <span className="desk-tooltip">
            {seat.occupant(d.id)
              ? `Occupied by ${seat.occupant(d.id).name}`
              : `${d.name}’s desk`}{" "}
            <span>↗</span>
          </span>
          <span className="monitor-glint" />
        </button>
      ))}
      {chairs.map((c) => (
        <button
          key={c.id}
          className={
            "chair-hotspot" +
            (nearby?.kind === "chair" && nearby.id === c.id
              ? " interaction-target"
              : "")
          }
          style={{ left: c.x + "%", top: c.y + "%" }}
          onClick={(e) => {
            e.stopPropagation();
            approach({ kind: "chair", id: c.id });
          }}
          disabled={Boolean(seat.occupant(c.id))}
          title={
            seat.occupant(c.id)
              ? `Occupied by ${seat.occupant(c.id).name}`
              : undefined
          }
          aria-label={`Sit in ${c.name}`}
        >
          <span className="desk-tooltip">
            {seat.occupant(c.id)
              ? `Occupied by ${seat.occupant(c.id).name}`
              : "Sit here"}
          </span>
        </button>
      ))}
      {people.map((p, i) => (
        <div
          key={p.id}
          ref={(el) => {
            npcElements.current[p.id] = el;
          }}
          data-testid={`npc-${p.id}`}
          data-state="sitting"
          className={
            "character npc animated-character" +
            (nearby?.kind === "person" && nearby.id === p.id
              ? " interaction-target"
              : "")
          }
          style={{ left: p.x + "%", top: p.y + "%" }}
        >
          <span className="player-shadow" aria-hidden="true" />
          <CharacterSprite
            ref={(el) => {
              npcArt.current[p.id] = el;
            }}
            character={p.sprite}
          />
          <button
            className="npc-talk-target"
            onClick={(e) => {
              e.stopPropagation();
              approach({ kind: "person", id: p.id });
            }}
            aria-label={`Talk to ${p.name}`}
          />
          <span className="nameplate">
            {p.name} · NPC
            <i />
          </span>
          {bubble === i && <div className="speech-bubble">{p.quote}</div>}
        </div>
      ))}
      <div
        ref={playerElement}
        data-testid="player"
        className="character player animated-character"
        data-direction="down"
        data-state="standing"
        style={{ left: "57%", top: "86%" }}
      >
        <div className="you-marker">▼</div>
        <span className="player-shadow" aria-hidden="true" />
        <CharacterSprite ref={playerArt} />
        <span className="nameplate">You</span>
        {message && <div className="speech-bubble">{message}</div>}
        {nearby && !paused && (
          <button
            className="interaction-prompt"
            onClick={(e) => {
              e.stopPropagation();
              interact();
            }}
          >
            <svg
              className="interaction-symbol"
              width="15"
              height="15"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              aria-hidden="true"
            >
              {nearby.kind === "person" ? (
                <path d="M2 2.5h12v8H7l-4 3v-3H2z" />
              ) : nearby.kind === "chair" ? (
                <path d="M4 2v7h8V6M3 9h10v3H3zm1 3v3m8-3v3M4 2h5v5H4" />
              ) : nearby.kind === "stand" ? (
                <path d="M8 14V2m-5 5 5-5 5 5" />
              ) : (
                <path d="M2 2h12v9H2zm6 9v3m-4 0h8" />
              )}
            </svg>
            <kbd>E</kbd>
            <span>{nearby.label}</span>
          </button>
        )}
      </div>
      {target && (
        <span
          className="walk-target"
          style={{ left: target.x + "%", top: target.y + "%" }}
        >
          ◇
        </span>
      )}
      <div className="map-corner">
        <span className="green-dot" /> THE STUDIO <span>01</span>
      </div>
    </div>
  );
});
export default Office;
