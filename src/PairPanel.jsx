import { useState } from "react";
import { Avatar } from "./Office";
import { formatTime, pairingBriefs } from "./pairing";
import { useActivity } from "./activityClient";

export function PairBar({ person, pair, onEnd }) {
  const { session, remaining, elapsed, swap, togglePause } = pair;
  return (
    <div className={`pair-session-bar${session.paused ? " is-paused" : ""}`}>
      <div className="pair-presence">
        <span className="pair-avatars">
          <Avatar />
          <Avatar sprite={person.sprite} />
        </span>
        <div>
          <strong>You + {person.name}</strong>
          <span>
            {session.paused
              ? "Taking a breather"
              : `${session.driver === "you" ? "You’re" : `${person.name} is`} driving`}{" "}
            · {formatTime(elapsed)} together
          </span>
        </div>
      </div>
      <span
        className={`pair-turn-clock${remaining === 0 ? " turn-ready" : ""}`}
        aria-label={`${formatTime(remaining)} until next turn`}
      >
        {remaining === 0 ? "Time to swap" : `${formatTime(remaining)} / turn`}
      </span>
      <div className="pair-bar-actions">
        <button onClick={togglePause}>
          {session.paused ? "▶ Resume" : "Ⅱ Pause"}
        </button>
        <button className="pair-swap" onClick={swap}>
          ↔ Swap roles
        </button>
        <button onClick={onEnd}>Finish</button>
      </div>
    </div>
  );
}

export default function PairPanel({
  person,
  pair,
  suggestion,
  notice,
  onSuggest,
  onApply,
  onDismiss,
}) {
  const { session, start, update, remaining } = pair;
  const [goal, setGoal] = useState(pairingBriefs[person.kind].goal);
  const { status } = useActivity();
  if (!session || session.phase !== "active")
    return (
      <div className="pair-panel pair-setup">
        <span className="pair-eyebrow">LET’S MAKE A LITTLE PROGRESS</span>
        <span className="pair-setup-symbol" aria-hidden="true">
          ↔
        </span>
        <h2>
          Two heads.
          <br />
          One little idea.
        </h2>
        <p>
          Pair with {person.name} on {person.project}. Pick a small goal, then
          take turns at the keyboard.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (goal.trim()) start(goal);
          }}
        >
          <label htmlFor="pair-goal">What shall we work on?</label>
          <textarea
            id="pair-goal"
            value={goal}
            maxLength={160}
            rows={3}
            onChange={(e) => setGoal(e.target.value)}
          />
          <button className="pair-primary" disabled={!goal.trim()}>
            Start pairing ↗
          </button>
        </form>
        <div className="pair-how">
          <span>
            <b>01</b> You drive, {person.name} navigates.
          </span>
          <span>
            <b>02</b> Swap every five minutes.
          </span>
          <span>
            <b>03</b> Review, run, and wrap up.
          </span>
        </div>
        <small className="pair-local-note">
          Local practice · {person.name} is a simulated partner. Your HTML draft
          is kept in this browser tab when storage is available.
        </small>
      </div>
    );
  const partnerDriving = session.driver === "partner";
  return (
    <div className="pair-panel">
      <section className="pair-goal-card">
        <span className="pair-eyebrow">OUR LITTLE MISSION</span>
        <h2>{session.goal}</h2>
        <span className="pair-tag">LOCAL PRACTICE</span>
      </section>
      <div className="pair-role-list">
        <div>
          <Avatar />
          <span>
            <strong>You</strong>
            <small>
              {partnerDriving
                ? "Navigator · review & guide"
                : "Driver · at the keyboard"}
            </small>
          </span>
          <span aria-hidden="true">{partnerDriving ? "◇" : "⌘"}</span>
        </div>
        <div>
          <Avatar sprite={person.sprite} />
          <span>
            <strong>{person.name}</strong>
            <small>
              {partnerDriving
                ? "Driver · proposes changes"
                : "Navigator · a second perspective"}
            </small>
          </span>
          <span aria-hidden="true">{partnerDriving ? "⌘" : "◇"}</span>
        </div>
      </div>
      {remaining === 0 && (
        <p className="pair-turn-note" role="status">
          A fresh perspective? Swap roles when you’re ready.
        </p>
      )}
      <section className="pair-next-step">
        <h3>
          {partnerDriving
            ? `${person.name}’s next change`
            : "Ask your navigator"}
        </h3>
        <p>
          {session.paused
            ? "Take your time. Resume when you’re ready to build."
            : partnerDriving
              ? `Choose a direction for ${person.name}. You’ll review the change before it reaches the editor.`
              : `Need a second perspective? ${person.name} has a few small ideas for this HTML.`}
        </p>
        <div className="pair-idea-buttons">
          <button
            disabled={session.paused}
            onClick={() => onSuggest("welcome")}
          >
            A warmer welcome
          </button>
          <button disabled={session.paused} onClick={() => onSuggest("color")}>
            A softer accent
          </button>
          <button disabled={session.paused} onClick={() => onSuggest("access")}>
            An accessible detail
          </button>
        </div>
        {notice && (
          <p className="pair-notice" role="status">
            {notice}
          </p>
        )}
        {suggestion && (
          <div className="pair-suggestion">
            <span className="pair-eyebrow">
              {person.name.toUpperCase()} SUGGESTS
            </span>
            <h4>{suggestion.title}</h4>
            <p>{suggestion.reason}</p>
            <div className="pair-diff">
              <del>
                <span aria-hidden="true">− </span>
                {suggestion.before}
              </del>
              <ins>
                <span aria-hidden="true">+ </span>
                {suggestion.after}
              </ins>
            </div>
            <div className="pair-suggestion-actions">
              <button
                className="pair-primary"
                disabled={session.paused}
                onClick={onApply}
              >
                Apply change ↗
              </button>
              <button onClick={onDismiss}>Dismiss</button>
            </div>
          </div>
        )}
      </section>
      <section className="pair-checklist">
        <h3>A small definition of done</h3>
        {[
          "Agree on the change",
          "Run the shared code",
          "Review the result",
        ].map((label, index) => (
          <label key={label}>
            <input
              type="checkbox"
              checked={session.checks[index]}
              onChange={() =>
                update((s) => ({
                  ...s,
                  checks: s.checks.map((value, i) =>
                    i === index ? !value : value,
                  ),
                }))
              }
            />
            <span>{label}</span>
          </label>
        ))}
      </section>
      <section className="pair-notes">
        <label htmlFor="pair-notes">Leave a thought for later</label>
        <textarea
          id="pair-notes"
          rows={3}
          maxLength={1000}
          placeholder="What worked? What’s next?"
          value={session.notes}
          onChange={(e) => update((s) => ({ ...s, notes: e.target.value }))}
        />
      </section>
      <p className="pair-tracking-note" role="status">
        {status === "connected"
          ? "◷ Active, visible pairing time counts toward your team’s leaderboard hours. Pauses are excluded."
          : "◷ Leaderboard tracking is waiting for a connection."}
      </p>
      <section className="pair-activity">
        <h3>Little steps, together</h3>
        <ol>
          {session.activity.map((item, index) => (
            <li key={`${index}-${item}`}>{item}</li>
          ))}
        </ol>
      </section>
    </div>
  );
}

export function PairRecap({
  person,
  pair,
  code,
  onReturn,
  onClose,
  onLeaderboard,
}) {
  const { session, elapsed } = pair;
  function download() {
    const text = `# Pairing with ${person.name}\n\nGoal: ${session.goal}\nTime together: ${formatTime(elapsed)}\nRole swaps: ${session.swaps}\nPreview runs: ${session.runs}\nChanges accepted: ${session.changes}\n\n${session.checks.map((done, i) => `- [${done ? "x" : " "}] ${["Agree on the change", "Run the shared code", "Review the result"][i]}`).join("\n")}\n\n## Notes\n${session.notes || "No notes yet."}\n\n## HTML\n\n\`\`\`html\n${code}\n\`\`\`\n`;
    const url = URL.createObjectURL(
      new Blob([text], { type: "text/markdown;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `office-hours-${person.id}-pairing.md`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <div
      className="pair-recap"
      role="region"
      aria-labelledby="pair-recap-title"
    >
      <span className="pair-eyebrow">A LITTLE BETTER, TOGETHER</span>
      <span className="pair-recap-spark" aria-hidden="true">
        ✦
      </span>
      <h2 id="pair-recap-title">
        Good company.
        <br />
        Good progress.
      </h2>
      <p>
        You + {person.name} · {session.goal}
      </p>
      <div className="pair-recap-stats">
        <div>
          <strong>{formatTime(elapsed)}</strong>
          <span>together</span>
        </div>
        <div>
          <strong>{session.swaps}</strong>
          <span>role swaps</span>
        </div>
        <div>
          <strong>{session.runs}</strong>
          <span>preview runs</span>
        </div>
        <div>
          <strong>{session.checks.filter(Boolean).length}/3</strong>
          <span>steps done</span>
        </div>
      </div>
      {session.notes && <blockquote>{session.notes}</blockquote>}
      {onLeaderboard && (
        <button className="pair-recap-leaderboard" onClick={onLeaderboard}>
          ▥ View your pair on the leaderboard ↗
        </button>
      )}
      <div className="pair-recap-actions">
        <button className="pair-primary" onClick={download}>
          ↓ Save recap & code
        </button>
        <button onClick={onReturn}>Back to workspace</button>
        <button onClick={onClose}>Back to office ↗</button>
      </div>
      <small>
        Your HTML draft is kept in this tab when browser storage is available.
        Save a recap to keep your session notes.
      </small>
    </div>
  );
}
