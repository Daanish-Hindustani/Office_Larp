import { useState, useCallback, useEffect, useRef } from "react";
import Office from "./Office";
import ProjectWindow from "./ProjectWindow";
import PairLobby from "./PairLobby";
import TheaterRoom from "./TheaterRoom";
import MovementControls from "./MovementControls";
import LeetCodeRoom from "./LeetCodeRoom";
import { people } from "./data";
import "@fontsource/press-start-2p";
import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/500.css";
import "@fontsource/dm-sans/600.css";
import "@fontsource/dm-sans/700.css";
import "@fontsource/space-mono/400.css";

function SoundButton() {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    const audio = new AudioContext(),
      gain = audio.createGain();
    gain.gain.value = 0.018;
    gain.connect(audio.destination);
    const notes = [130.81, 164.81, 196, 261.63].map((f) => {
      const o = audio.createOscillator();
      o.type = "sine";
      o.frequency.value = f;
      o.connect(gain);
      o.start();
      return o;
    });
    return () => {
      notes.forEach((o) => o.stop());
      audio.close();
    };
  }, [enabled]);
  return (
    <button
      className="chrome-button"
      onClick={() => setEnabled((s) => !s)}
      aria-pressed={enabled}
    >
      <span>{enabled ? "♫" : "♩"}</span> Sound {enabled ? "on" : "off"}
    </button>
  );
}
function Help({ onClose }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section
        className="help-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="help-title"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          autoFocus
          className="close-help"
          aria-label="Close instructions"
          onClick={onClose}
        >
          ✕
        </button>
        <span className="help-spark">✦</span>
        <h2 id="help-title">How to play</h2>
        <p>
          This is your little corner of the internet. Wander around, meet the
          builders, and peek at their projects.
        </p>
        <div>
          <kbd>W</kbd>
          <kbd>A</kbd>
          <kbd>S</kbd>
          <kbd>D</kbd>
          <span>or arrow keys to move</span>
        </div>
        <div>
          <kbd>E</kbd>
          <span>to sit, stand, talk, or enter a nearby room</span>
        </div>
        <div>
          <span className="help-mouse">↖</span>
          <span>
            Click to approach a chair, person, or desk. Press E when prompted.
          </span>
        </div>
        <div>
          <kbd>esc</kbd>
          <span>to head back to the office</span>
        </div>
        <button className="primary-button" onClick={onClose}>
          Let’s look around ↗
        </button>
        <small>Hackathon mode · mock people, real curiosity.</small>
      </section>
    </div>
  );
}
export default function App() {
  const [active, setActive] = useState(null),
    [help, setHelp] = useState(false),
    [pairLobby, setPairLobby] = useState(false),
    [pairOnOpen, setPairOnOpen] = useState(false),
    [room, setRoom] = useState(() => {
      const requested = new URLSearchParams(window.location.search).get("room");
      return ["theater", "leetcode"].includes(requested) ? requested : "studio";
    }),
    [nearby, setNearby] = useState(null);
  const office = useRef(null);
  function enterTheater() {
    setRoom("theater");
    setNearby(null);
    const url = new URL(window.location.href);
    url.searchParams.set("room", "theater");
    window.history.replaceState(null, "", url);
  }
  function returnToStudio() {
    if (room === "leetcode") office.current?.returnFromLeetCode();
    else office.current?.returnFromTheater();
    setRoom("studio");
    setNearby(null);
    const url = new URL(window.location.href);
    url.searchParams.delete("room");
    window.history.replaceState(null, "", url);
  }
  function enterLeetCode() {
    setRoom("leetcode");
    setNearby(null);
    const url = new URL(window.location.href);
    url.searchParams.set("room", "leetcode");
    window.history.replaceState(null, "", url);
  }
  const closeProject = useCallback(() => {
    setActive(null);
  }, []);
  const closePairLobby = useCallback(() => setPairLobby(false), []);
  function openWorkspace(person) {
    setPairOnOpen(false);
    setActive(person);
  }
  useEffect(() => {
    const key = (e) => {
      if (e.key === "Escape") setHelp(false);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  return (
    <div className="app-shell">
      <header className="app-header">
        <a className="brand" href="/" aria-label="Office Hours home">
          <span className="brand-mark">
            <i />
            <i />
            <i />
            <i />
          </span>
          OFFICE HOURS<span className="brand-period">.</span>
        </a>
        <span className="header-divider" />
        <span className="office-subtitle">A little space for big ideas.</span>
        <div className="header-actions">
          <span className="online">
            <i />5 online
          </span>
          <button
            className="chrome-button pair-launch"
            aria-label="Pair up"
            onClick={() => setPairLobby(true)}
          >
            <span aria-hidden="true">↔</span>{" "}
            <span className="pair-launch-label">Pair up</span>
          </button>
          <SoundButton />
          <button className="chrome-button" onClick={() => setHelp(true)}>
            <span>▤</span> How to play
          </button>
        </div>
      </header>
      <main
        className={`main-layout${room === "theater" ? " in-theater" : room === "leetcode" ? " in-leetcode" : ""}`}
      >
        <section className="world-section">
          <div className="world-heading">
            <div>
              <span className="room-title">
                {room === "theater"
                  ? "The screening room"
                  : room === "leetcode"
                    ? "The algorithm room"
                    : "The studio"}
              </span>
              <span className="room-description">
                {room === "theater"
                  ? "A shared screen. A softer pace."
                  : room === "leetcode"
                    ? "Good company. One little problem."
                    : "Good company. Great little projects."}
              </span>
            </div>
            <span className="room-number">
              ROOM{" "}
              {room === "theater" ? "002" : room === "leetcode" ? "003" : "001"}{" "}
              <i />
            </span>
          </div>
          <div className="studio-view" hidden={room !== "studio"}>
            <div className="map-frame">
              <Office
                ref={office}
                paused={Boolean(
                  active || help || pairLobby || room !== "studio",
                )}
                onEnterTheater={enterTheater}
                onEnterLeetCode={enterLeetCode}
                onVisit={openWorkspace}
                onChat={openWorkspace}
                onNearby={setNearby}
              />
            </div>
            <div className="world-bottom">
              <span>
                <i className="green-dot" />{" "}
                {nearby
                  ? nearby.kind === "stand"
                    ? "Settled in. Make something good."
                    : `Nearby: ${nearby.name}`
                  : "You’re free to roam. Follow your curiosity."}
              </span>
              {nearby ? (
                <div className="nearby-actions">
                  {nearby.kind === "stand" && (
                    <button
                      onClick={() => office.current?.visitSeatedProject()}
                    >
                      Open computer ↗
                    </button>
                  )}
                  <button onClick={() => office.current?.interact()}>
                    <kbd>E</kbd> {nearby.label}
                  </button>
                </div>
              ) : (
                <span className="coordinate">COZY LEVEL: 100%</span>
              )}
            </div>
          </div>
          <TheaterRoom
            visible={room === "theater"}
            paused={Boolean(active || help || pairLobby)}
            onExit={returnToStudio}
          />
          <LeetCodeRoom
            visible={room === "leetcode"}
            paused={Boolean(active || help || pairLobby)}
            onExit={returnToStudio}
          />
        </section>
      </main>
      <footer className="controls-bar">
        <div className="keyboard-controls">
          <span className="key-group">
            <kbd>W</kbd>
            <kbd>A</kbd>
            <kbd>S</kbd>
            <kbd>D</kbd>
          </span>
          <span className="muted">/</span>
          <span className="key-group">
            <kbd>↑</kbd>
            <kbd>←</kbd>
            <kbd>↓</kbd>
            <kbd>→</kbd>
          </span>
          <span>Move</span>
        </div>
        <div>
          <kbd>E</kbd>
          <span>Interact</span>
        </div>
        <div className="click-hint">
          <span className="mouse-icon">↖</span>
          <span>Click to approach · E to interact</span>
        </div>
        <span className="footer-note">
          Built for a little serendipity. <span>✦</span>
        </span>
      </footer>
      {room === "studio" && <MovementControls />}
      {active && (
        <ProjectWindow
          key={active.id}
          person={active}
          showChat={people.some((person) => person.id === active.id)}
          initialPairing={pairOnOpen}
          onClose={closeProject}
        />
      )}
      {help && <Help onClose={() => setHelp(false)} />}
      {pairLobby && (
        <PairLobby
          onClose={closePairLobby}
          onChoose={(person) => {
            setPairLobby(false);
            setPairOnOpen(true);
            setActive(person);
          }}
        />
      )}
    </div>
  );
}
