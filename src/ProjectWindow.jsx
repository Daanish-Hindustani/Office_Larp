import { useState, useEffect, useRef } from "react";
import { projectHTML } from "./data";
import ChatWindow from "./ChatWindow";
import PairPanel, { PairBar, PairRecap } from "./PairPanel";
import { proposeChange, usePairSession } from "./pairing";

function Demo({ kind }) {
  const [count, setCount] = useState(0),
    [playing, setPlaying] = useState(false),
    [tasks, setTasks] = useState([
      { text: "Make something small", done: true },
      { text: "Make it feel good", done: false },
      { text: "Share it with a friend", done: false },
    ]),
    [draft, setDraft] = useState("");
  if (kind === "garden")
    return (
      <div className="demo garden">
        <span className="demo-kicker">A QUIETER CORNER OF THE INTERNET</span>
        <h1>Little Garden</h1>
        <p>A little care goes a long way.</p>
        <div className="plant-scene">
          <span className="sun">✦</span>
          <div className={"growing-plant stage-" + Math.min(count, 3)}>
            <div className="stem" />
            <i />
            <i />
            <i />
            <div className="flower">✿</div>
          </div>
          <div className="pot" />
        </div>
        <button onClick={() => setCount((c) => c + 1)}>
          {count === 0
            ? "Plant a little seed"
            : count < 3
              ? "A little water, a little love"
              : "Keep growing"}{" "}
          <span>↗</span>
        </button>
        <small>
          {count
            ? `${count} little act${count === 1 ? "" : "s"} of care`
            : "Your little patch of possibility."}
        </small>
      </div>
    );
  if (kind === "radio")
    return (
      <div className="demo radio">
        <span className="demo-kicker">SOUNDS FOR MAKING THINGS</span>
        <h1>Lo-fi Radio</h1>
        <div className={"record " + (playing ? "spinning" : "")}>
          <div>33⅓</div>
        </div>
        <h3>Somewhere, it’s raining</h3>
        <p>midnight tapes · volume 04</p>
        <button onClick={() => setPlaying((p) => !p)}>
          {playing ? "Ⅱ Pause the vibe" : "▶ Start the vibe"}
        </button>
        <small>
          {playing
            ? "Visual playback demo · no audio track"
            : "A soundtrack for your next little idea."}
        </small>
      </div>
    );
  if (kind === "tasks")
    return (
      <div className="demo tasks">
        <span className="demo-kicker">PROGRESS, AT YOUR PACE</span>
        <h1>Small Wins</h1>
        <p>Big things start with little things.</p>
        <div className="task-list">
          {tasks.map((t, i) => (
            <button
              key={i}
              className={t.done ? "done" : ""}
              onClick={() =>
                setTasks((ts) =>
                  ts.map((item, j) =>
                    j === i ? { ...item, done: !item.done } : item,
                  ),
                )
              }
            >
              <span>{t.done ? "✓" : "□"}</span>
              {t.text}
            </button>
          ))}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (draft.trim()) {
              setTasks((t) => [...t, { text: draft.trim(), done: false }]);
              setDraft("");
            }
          }}
        >
          <input
            aria-label="New task"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="One little thing…"
            maxLength={80}
          />
          <button aria-label="Add task">+</button>
        </form>
        <small>
          {tasks.filter((t) => t.done).length} little wins. You’re doing great.
        </small>
      </div>
    );
  return (
    <div className="demo postcards">
      <span className="demo-kicker">PLACES WE’D RATHER BE</span>
      <h1>Postcards</h1>
      <div className={"postcard scene-" + (count % 3)}>
        <div className="postcard-sun" />
        <div className="mountain" />
        <span>
          {
            [
              "Somewhere in the Alps",
              "A slow morning in Kyoto",
              "The coast is calling",
            ][count % 3]
          }
        </span>
      </div>
      <p>A moment worth keeping.</p>
      <button onClick={() => setCount((n) => n + 1)}>Somewhere new ↗</button>
    </div>
  );
}
export default function ProjectWindow({
  person,
  onClose,
  showChat = false,
  initialPairing = false,
}) {
  const [code, setCode] = useState(() => {
      try {
        return (
          sessionStorage.getItem(`office-hours:html:${person.id}`) ??
          projectHTML(person)
        );
      } catch {
        return projectHTML(person);
      }
    }),
    [output, setOutput] = useState(null),
    [runVersion, setRunVersion] = useState(0),
    [tab, setTab] = useState("index.html"),
    [response, setResponse] = useState(
      person.hello ||
        "Your desk, your ideas. Edit the HTML and run it to bring something to life.",
    );
  const pair = usePairSession(person);
  const pairing = pair.session?.phase === "active";
  const ended = pair.session?.phase === "ended";
  const [sideTab, setSideTab] = useState(initialPairing ? "pair" : "chat"),
    [mobilePanel, setMobilePanel] = useState(
      initialPairing ? "partner" : "code",
    ),
    [suggestion, setSuggestion] = useState(null),
    [notice, setNotice] = useState(""),
    [draftSaved, setDraftSaved] = useState(false);
  const closeRef = useRef(null);
  const lineNumbers = useRef(null);
  const requestClose = useRef(null);
  requestClose.current = () => {
    if (pairing) {
      pair.end();
      setSuggestion(null);
    } else onClose();
  };
  useEffect(() => {
    try {
      sessionStorage.setItem(`office-hours:html:${person.id}`, code);
      setDraftSaved(true);
    } catch {
      setDraftSaved(false);
    }
  }, [code, person.id]);
  useEffect(() => {
    if (ended) closeRef.current?.focus();
  }, [ended]);
  function suggest(type) {
    const next = proposeChange(code, person, type);
    setSuggestion(next.unavailable ? null : next);
    setNotice(next.unavailable || "");
  }
  function applySuggestion() {
    if (!suggestion || !pairing || pair.session.paused) return;
    if (suggestion.source !== code) {
      setSuggestion(null);
      setNotice(
        "The code changed since this suggestion. Ask for a fresh idea so your edits stay safe.",
      );
      return;
    }
    setCode(suggestion.code);
    setTab("index.html");
    setMobilePanel("code");
    pair.log(
      `${person.name}’s change accepted: ${suggestion.title.toLowerCase()}.`,
      { changes: pair.session.changes + 1 },
    );
    setNotice("Change applied. Run the code to see it together.");
    setSuggestion(null);
  }
  useEffect(() => {
    const prev = document.activeElement;
    closeRef.current?.focus();
    const key = (e) => {
      if (e.key === "Escape") requestClose.current();
      if (e.key === "Tab") {
        const nodes = [
          ...document.querySelectorAll(
            ".project-window button,.project-window textarea,.project-window input,.project-window iframe",
          ),
        ].filter(
          (n) => !n.disabled && n.tabIndex >= 0 && n.getClientRects().length,
        );
        const first = nodes[0],
          last = nodes[nodes.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("keydown", key);
      prev?.focus();
    };
  }, [onClose]);
  return (
    <div className="modal-backdrop">
      <section
        className={`project-window${showChat ? " coworker-workspace" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="project-title"
      >
        <header className="project-header">
          <span className="window-dots">
            <i />
            <i />
            <i />
          </span>
          <div>
            <span className="muted">{person.name}’s workspace / </span>
            <strong id="project-title">{person.project}</strong>
          </div>
          <button
            ref={closeRef}
            onClick={() => requestClose.current()}
            aria-label={pairing ? "Finish pairing session" : "Close project"}
          >
            ✕ <kbd>esc</kbd>
          </button>
        </header>
        {ended && (
          <PairRecap
            person={person}
            pair={pair}
            code={code}
            onClose={onClose}
            onReturn={() => {
              pair.update((s) => ({ ...s, phase: "idle" }));
              setNotice("");
              setSideTab("pair");
              setMobilePanel("partner");
            }}
          />
        )}
        <div className="workspace-content" hidden={ended}>
          <div className="project-intro">
            <span
              className="tiny-avatar"
              style={{
                backgroundImage: `url('/assets/game-characters/char_${person.sprite}.png')`,
              }}
            />
            <div className="coworker-response" role="status" aria-live="polite">
              {showChat && <span>{person.name} says</span>}
              <p>{response}</p>
            </div>
            <span className="live-label">
              <i /> MOCK WORKSPACE
            </span>
            {showChat && !pairing && (
              <button
                className="pair-workspace-invite"
                onClick={() => {
                  setSideTab("pair");
                  setMobilePanel("partner");
                }}
              >
                ↔ Pair with {person.name}
              </button>
            )}
          </div>
          {pairing && (
            <PairBar
              person={person}
              pair={pair}
              onEnd={() => requestClose.current()}
            />
          )}
          {showChat && (
            <div className="mobile-workspace-tabs" aria-label="Workspace view">
              <button
                aria-pressed={mobilePanel === "code"}
                onClick={() => setMobilePanel("code")}
              >
                ⌘ Shared code
              </button>
              <button
                aria-pressed={mobilePanel === "partner"}
                onClick={() => setMobilePanel("partner")}
              >
                ↔ Partner & chat
              </button>
            </div>
          )}
          <div className="workspace-body" data-mobile-panel={mobilePanel}>
            <div className="editor-layout">
              <section className="code-pane">
                <div className="pane-toolbar">
                  <button
                    className={tab === "index.html" ? "selected" : ""}
                    onClick={() => setTab("index.html")}
                  >
                    <span className="code-file">◇</span> index.html
                  </button>
                  <button
                    className={tab === "README.md" ? "selected" : ""}
                    onClick={() => setTab("README.md")}
                  >
                    README.md
                  </button>
                  <button
                    className="run"
                    onClick={() => {
                      setTab("index.html");
                      setOutput(code);
                      setRunVersion((version) => version + 1);
                      if (pairing) {
                        pair.update((s) => ({
                          ...s,
                          runs: s.runs + 1,
                          checks: [s.checks[0], true, s.checks[2]],
                          activity: [
                            "Shared HTML opened in the preview.",
                            ...s.activity,
                          ].slice(0, 8),
                        }));
                      }
                    }}
                    disabled={pairing && pair.session.paused}
                  >
                    ▶ Run
                  </button>
                </div>
                {pairing && (
                  <div className="pair-editor-presence" role="status">
                    <i className="green-dot" />
                    {pair.session.paused
                      ? "Session paused · take a breather"
                      : pair.session.driver === "you"
                        ? `${person.name} is navigating · you have the keyboard`
                        : `${person.name} is driving · review a suggested change in Pair session`}
                  </div>
                )}
                {tab === "index.html" ? (
                  <div className="code-area">
                    <div
                      className="line-numbers"
                      aria-hidden="true"
                      ref={lineNumbers}
                    >
                      {code.split("\n").map((_, i) => (
                        <div key={i}>{i + 1}</div>
                      ))}
                    </div>
                    <textarea
                      spellCheck="false"
                      aria-label="Project HTML code"
                      value={code}
                      readOnly={
                        pairing &&
                        (pair.session.driver === "partner" ||
                          pair.session.paused)
                      }
                      onChange={(e) => setCode(e.target.value)}
                      onScroll={(e) => {
                        if (lineNumbers.current)
                          lineNumbers.current.scrollTop =
                            e.currentTarget.scrollTop;
                      }}
                    />
                  </div>
                ) : (
                  <div className="readme">
                    <h2>{person.project}</h2>
                    <p>A tiny hackathon experiment by {person.name}.</p>
                    <p>
                      The initial preview is an interactive mock. Edit
                      index.html and hit Run to render your own HTML in the
                      sandbox.
                    </p>
                    <p>
                      Your HTML draft is kept in this browser tab when storage
                      is available. Pair with a coworker to set a goal, review
                      ideas, and take turns driving.
                    </p>
                  </div>
                )}
                <footer className="editor-status">
                  <span>
                    {draftSaved
                      ? "✓ Draft kept in this tab"
                      : "⌘ HTML · draft not saved"}
                  </span>
                  <span>UTF-8 · {code.split("\n").length} lines</span>
                </footer>
              </section>
              <section className="preview-pane">
                <div className="pane-toolbar">
                  <span>
                    <i className="green-dot" />{" "}
                    {output !== null && output !== code
                      ? "Changes to run"
                      : "Live preview"}
                  </span>
                  <button
                    onClick={() => setOutput(null)}
                    title="Reset demo preview"
                  >
                    ↻ Reset
                  </button>
                </div>
                <div className="browser-address">
                  ▣ <span>localhost / {person.id}</span>
                  <span>↗</span>
                </div>
                {output === null ? (
                  <Demo kind={person.kind} />
                ) : (
                  <iframe
                    key={runVersion}
                    title="Your project preview"
                    sandbox="allow-scripts"
                    srcDoc={output}
                  />
                )}
              </section>
            </div>
            {showChat && (
              <aside
                className="workspace-companion"
                aria-label="Coworker tools"
              >
                <div
                  className="companion-tabs"
                  role="tablist"
                  aria-label="Coworker tools"
                  onKeyDown={(event) => {
                    if (
                      !["ArrowLeft", "ArrowRight", "Home", "End"].includes(
                        event.key,
                      )
                    )
                      return;
                    event.preventDefault();
                    const next =
                      event.key === "Home"
                        ? "chat"
                        : event.key === "End"
                          ? "pair"
                          : sideTab === "chat"
                            ? "pair"
                            : "chat";
                    setSideTab(next);
                    document.getElementById(`${next}-tab`)?.focus();
                  }}
                >
                  <button
                    id="chat-tab"
                    role="tab"
                    tabIndex={sideTab === "chat" ? 0 : -1}
                    aria-selected={sideTab === "chat"}
                    aria-controls="chat-panel"
                    onClick={() => setSideTab("chat")}
                  >
                    ☏ Conversation
                  </button>
                  <button
                    id="pair-tab"
                    role="tab"
                    tabIndex={sideTab === "pair" ? 0 : -1}
                    aria-selected={sideTab === "pair"}
                    aria-controls="pair-panel"
                    onClick={() => setSideTab("pair")}
                  >
                    ↔ Pair session{pairing && <i className="green-dot" />}
                  </button>
                </div>
                <div
                  id="chat-panel"
                  role="tabpanel"
                  aria-labelledby="chat-tab"
                  hidden={sideTab !== "chat"}
                  className="companion-panel companion-chat"
                >
                  <ChatWindow
                    person={person}
                    onReply={setResponse}
                    autoFocus={!initialPairing}
                  />
                </div>
                <div
                  id="pair-panel"
                  role="tabpanel"
                  aria-labelledby="pair-tab"
                  hidden={sideTab !== "pair"}
                  className="companion-panel"
                >
                  <PairPanel
                    person={person}
                    pair={pair}
                    suggestion={suggestion}
                    notice={notice}
                    onSuggest={suggest}
                    onApply={applySuggestion}
                    onDismiss={() => {
                      setSuggestion(null);
                      setNotice("");
                    }}
                  />
                </div>
              </aside>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
