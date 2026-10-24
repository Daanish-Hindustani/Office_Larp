import { useState, useEffect, useRef } from "react";
import { projectHTML } from "./data";
import ChatWindow from "./ChatWindow";

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
export default function ProjectWindow({ person, onClose, showChat = false }) {
  const [code, setCode] = useState(() => projectHTML(person)),
    [output, setOutput] = useState(null),
    [tab, setTab] = useState("index.html"),
    [response, setResponse] = useState(
      person.hello ||
        "Your desk, your ideas. Edit the HTML and run it to bring something to life.",
    );
  const closeRef = useRef(null);
  useEffect(() => {
    const prev = document.activeElement;
    closeRef.current?.focus();
    const key = (e) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab") {
        const nodes = [
          ...document.querySelectorAll(
            ".project-window button,.project-window textarea,.project-window input,.project-window iframe",
          ),
        ].filter((n) => !n.disabled);
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
          <button ref={closeRef} onClick={onClose} aria-label="Close project">
            ✕ <kbd>esc</kbd>
          </button>
        </header>
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
        </div>
        <div className="workspace-body">
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
                  }}
                >
                  ▶ Run
                </button>
              </div>
              {tab === "index.html" ? (
                <div className="code-area">
                  <div className="line-numbers" aria-hidden="true">
                    {code.split("\n").map((_, i) => (
                      <div key={i}>{i + 1}</div>
                    ))}
                  </div>
                  <textarea
                    spellCheck="false"
                    aria-label="Project HTML code"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                  />
                </div>
              ) : (
                <div className="readme">
                  <h2>{person.project}</h2>
                  <p>A tiny hackathon experiment by {person.name}.</p>
                  <p>
                    The initial preview is an interactive mock. Edit index.html
                    and hit Run to render your own HTML in the sandbox.
                  </p>
                  <p>Everything lives in this session. No backend needed.</p>
                </div>
              )}
              <footer className="editor-status">
                <span>⌘ HTML</span>
                <span>UTF-8 · {code.split("\n").length} lines</span>
              </footer>
            </section>
            <section className="preview-pane">
              <div className="pane-toolbar">
                <span>
                  <i className="green-dot" /> Live preview
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
                  title="Your project preview"
                  sandbox="allow-scripts"
                  srcDoc={output}
                />
              )}
            </section>
          </div>
          {showChat && <ChatWindow person={person} onReply={setResponse} />}
        </div>
      </section>
    </div>
  );
}
