import { useEffect, useRef, useState } from "react";
import { Avatar } from "./Office";
import { people as coworkers } from "./data";
import { activity, durationLabel, hours, useActivity } from "./activityClient";

function Time({ value }) {
  return (
    <span className="standing-time" title={durationLabel(value)}>
      <strong>
        {hours(value)}
        <small> h</small>
      </strong>
      <span>{durationLabel(value)}</span>
    </span>
  );
}
function MemberName({ member, ownId }) {
  return (
    <>
      {member.name}
      {member.id === ownId && <small className="standing-you">YOU</small>}
    </>
  );
}

export default function Leaderboard({
  onClose,
  onPair,
  initialTab = "people",
}) {
  const { board, profile, status, temporary } = useActivity();
  const [tab, setTab] = useState(initialTab),
    [period, setPeriod] = useState("week"),
    [metric, setMetric] = useState("online"),
    [expanded, setExpanded] = useState(null),
    [name, setName] = useState(profile.name),
    [nameError, setNameError] = useState(""),
    [editing, setEditing] = useState(false);
  const dialog = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    dialog.current.querySelector("button")?.focus();
    void activity.refresh();
    function key(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
      if (event.key !== "Tab") return;
      const nodes = [
        ...dialog.current.querySelectorAll("button,input,select,[tabindex]"),
      ].filter(
        (node) =>
          !node.disabled && node.tabIndex >= 0 && node.getClientRects().length,
      );
      const first = nodes[0],
        last = nodes.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("keydown", key);
      previous?.focus();
    };
  }, [onClose]);
  const data = board?.[period];
  const own = data?.people.find((p) => p.id === profile.id);
  const rows = [
    ...(tab === "people" ? data?.people || [] : data?.pairs || []),
  ].sort(
    (a, b) =>
      (tab === "people" ? b[metric] - a[metric] : b.duration - a.duration) ||
      a.id.localeCompare(b.id),
  );
  let lastValue = null,
    lastRank = 0;
  const ranked = rows.map((row, index) => {
    const value = tab === "people" ? row[metric] : row.duration;
    if (value !== lastValue) lastRank = index + 1;
    lastValue = value;
    return { ...row, rank: value ? lastRank : null };
  });
  const changeTab = (next) => {
    setTab(next);
    setExpanded(null);
  };
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section
        className="studio-leaderboard"
        role="dialog"
        aria-modal="true"
        aria-labelledby="standings-title"
        ref={dialog}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="standings-heading">
          <div>
            <span className="pair-eyebrow">THE STUDIO LEADERBOARD</span>
            <h1 id="standings-title">Time well spent.</h1>
            <p>Showing up. Making things. Better together.</p>
          </div>
          <button
            className="standings-close"
            aria-label="Close leaderboard"
            onClick={onClose}
          >
            ✕ <kbd>esc</kbd>
          </button>
        </header>
        <div className="standings-summary" aria-label="Your time this period">
          <div>
            <span>YOUR ONLINE HOURS</span>
            <strong>
              {hours(own?.online)}
              <small> h</small>
            </strong>
            <small>{durationLabel(own?.online)} in the studio</small>
          </div>
          <div>
            <span>YOUR PAIRING HOURS</span>
            <strong>
              {hours(own?.pairing)}
              <small> h</small>
            </strong>
            <small>{durationLabel(own?.pairing)} making things together</small>
          </div>
          <div>
            <span>YOUR DIFFERENT PAIRS</span>
            <strong>
              {own?.pairCount || 0}
              <small> ↔</small>
            </strong>
            <small>A new partner, a new team</small>
          </div>
        </div>
        {status !== "connected" && (
          <div className="standings-alert" role="status">
            <span>
              {status === "connecting"
                ? "Connecting to the studio board…"
                : status === "offline"
                  ? "You’re offline. Time tracking resumes when you reconnect."
                  : "The board couldn’t connect. Time is recorded only while connected; retrying every few seconds."}
            </span>
            {status === "error" && (
              <button onClick={() => activity.refresh()}>Try again ↻</button>
            )}
          </div>
        )}
        <div className="standings-body">
          <div className="standings-main">
            <div className="standings-toolbar">
              <div
                className="standings-tabs"
                role="tablist"
                aria-label="Leaderboard view"
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
                      ? "people"
                      : event.key === "End"
                        ? "pairs"
                        : tab === "people"
                          ? "pairs"
                          : "people";
                  changeTab(next);
                  document.getElementById(`standings-${next}-tab`)?.focus();
                }}
              >
                {["people", "pairs"].map((value) => (
                  <button
                    key={value}
                    role="tab"
                    id={`standings-${value}-tab`}
                    aria-selected={tab === value}
                    tabIndex={tab === value ? 0 : -1}
                    aria-controls="standings-panel"
                    onClick={() => changeTab(value)}
                  >
                    {value === "people" ? "People" : "Pairs"}
                    <small>{data?.[value].length || 0}</small>
                  </button>
                ))}
              </div>
              <select
                aria-label="Leaderboard period"
                value={period}
                onChange={(e) => {
                  setPeriod(e.target.value);
                  setExpanded(null);
                }}
              >
                <option value="week">This week</option>
                <option value="all">All time</option>
              </select>
            </div>
            <div className="standings-caption">
              <span>
                {tab === "people"
                  ? "A little presence adds up."
                  : "Every combination has its own story."}
              </span>
              {tab === "people" ? (
                <label>
                  Rank by{" "}
                  <select
                    aria-label="Rank people by"
                    value={metric}
                    onChange={(e) => setMetric(e.target.value)}
                  >
                    <option value="online">Online hours</option>
                    <option value="pairing">Pairing hours</option>
                  </select>
                </label>
              ) : (
                <span>RANKED BY PAIRING HOURS</span>
              )}
            </div>
            <div
              className="standings-scroll"
              id="standings-panel"
              role="tabpanel"
              aria-labelledby={`standings-${tab}-tab`}
              tabIndex={0}
            >
              {!board ? (
                <div className="standings-empty">
                  <span aria-hidden="true">◷</span>
                  <h2>
                    {status === "error"
                      ? "The board is taking a moment."
                      : "Gathering the studio…"}
                  </h2>
                  <p>Your standings will appear when the board connects.</p>
                </div>
              ) : ranked.length === 0 ? (
                <div className="standings-empty">
                  <span aria-hidden="true">{tab === "pairs" ? "↔" : "✦"}</span>
                  <h2>
                    {tab === "pairs"
                      ? "Good things start with two."
                      : "A fresh little beginning."}
                  </h2>
                  <p>
                    {tab === "pairs"
                      ? "Start a pairing session. Your team’s time will find a home here."
                      : "Spend a few seconds in the studio to start your first entry."}
                  </p>
                  <button className="primary-button" onClick={() => onPair()}>
                    Find a pairing partner ↗
                  </button>
                </div>
              ) : (
                <table className="standings-table">
                  <caption className="sr-only">
                    {period === "week" ? "This week’s" : "All-time"}{" "}
                    {tab === "people" ? "people" : "pair"} standings in hours
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">#</th>
                      <th scope="col">
                        {tab === "people" ? "STUDIO PEOPLE" : "PAIRING TEAMS"}
                      </th>
                      <th scope="col">
                        {tab === "people" ? "ONLINE" : "TOGETHER"}
                      </th>
                      <th scope="col">
                        {tab === "people" ? "PAIRING" : "SESSIONS"}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {ranked.map((row) => {
                      const ownRow =
                        tab === "people"
                          ? row.id === profile.id
                          : row.members.some((m) => m.id === profile.id);
                      const partner =
                        tab === "pairs" && ownRow
                          ? coworkers.find((p) =>
                              row.members.some((m) => m.id === p.id),
                            )
                          : null;
                      return tab === "people" ? (
                        <tr key={row.id} className={ownRow ? "is-you" : ""}>
                          <td className={`standing-rank rank-${row.rank}`}>
                            {row.rank || "—"}
                          </td>
                          <td>
                            <div className="standing-person">
                              <Avatar sprite={row.sprite} />
                              <div>
                                <strong>
                                  <MemberName member={row} ownId={profile.id} />
                                </strong>
                                <span>
                                  {row.live && status === "connected" ? (
                                    <>
                                      <i className="green-dot" /> In the studio
                                    </>
                                  ) : status === "connected" ? (
                                    "See you around"
                                  ) : (
                                    "Presence unavailable"
                                  )}
                                </span>
                              </div>
                            </div>
                          </td>
                          <td
                            className={
                              metric === "online" ? "ranked-metric" : ""
                            }
                          >
                            <Time value={row.online} />
                          </td>
                          <td
                            className={
                              metric === "pairing" ? "ranked-metric" : ""
                            }
                          >
                            <Time value={row.pairing} />
                          </td>
                        </tr>
                      ) : (
                        <PairRows
                          key={row.id}
                          row={row}
                          ownId={profile.id}
                          expanded={expanded === row.id}
                          onExpand={() =>
                            setExpanded(expanded === row.id ? null : row.id)
                          }
                          partner={partner}
                          onPair={onPair}
                          connected={status === "connected"}
                        />
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
            <div className="standings-period-note">
              {period === "week"
                ? `Week of ${board ? new Intl.DateTimeFormat("en", { month: "short", day: "numeric", timeZone: "UTC" }).format(board.weekStartsAt) : "…"} · resets Monday, 00:00 UTC`
                : "All recorded studio time · no weekly reset"}
              <span>
                {status === "connected"
                  ? "● Updates every 5s"
                  : "○ Waiting to reconnect"}
              </span>
            </div>
          </div>
          <aside className="standings-aside">
            <div className="standing-profile">
              <Avatar />
              <span className="pair-eyebrow">YOUR STUDIO NAME</span>
              {editing ? (
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (!name.trim()) return;
                    try {
                      await activity.rename(name);
                      setEditing(false);
                      setNameError("");
                    } catch (error) {
                      setNameError(error.message);
                    }
                  }}
                >
                  <label className="sr-only" htmlFor="standing-name">
                    Your leaderboard name
                  </label>
                  <input
                    id="standing-name"
                    autoFocus
                    maxLength={24}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                  <div>
                    <button type="submit" disabled={!name.trim()}>
                      Save name
                    </button>
                    <button type="button" onClick={() => setEditing(false)}>
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <>
                  <strong>{profile.name}</strong>
                  <button
                    onClick={() => {
                      setName(profile.name);
                      setEditing(true);
                    }}
                  >
                    Edit name ↗
                  </button>
                </>
              )}
              {nameError && <p role="alert">{nameError}</p>}
              <small>
                {temporary
                  ? "Temporary profile · browser storage is unavailable."
                  : "Your identity stays with your account. Names can change; your time stays yours."}
              </small>
            </div>
            <div className="standings-rules">
              <span className="pair-eyebrow">LITTLE DETAILS THAT COUNT</span>
              <p>
                <span>◷</span> Online time counts while this tab is visible and
                connected.
              </p>
              <p>
                <span>↔</span> Pair time counts during an active, unpaused
                session. It’s part of your online time.
              </p>
              <p>
                <span>⊞</span> Overlapping tabs count once. Every unique pair
                gets its own total.
              </p>
            </div>
            <button className="standings-pair-cta" onClick={() => onPair()}>
              <span aria-hidden="true">↔</span>
              <strong>Make time for company.</strong>
              <span>Find a pairing partner ↗</span>
            </button>
          </aside>
        </div>
        <footer className="standings-footer">
          <span>✦ Shared on this studio server · saved between visits.</span>
          <small>
            Profiles belong to signed-in accounts. Coworkers are NPCs; their
            online presence isn’t ranked.
          </small>
        </footer>
      </section>
    </div>
  );
}

function PairRows({
  row,
  ownId,
  expanded,
  onExpand,
  partner,
  onPair,
  connected,
}) {
  const detailId = `pair-history-${row.sessions[0]?.id}`;
  return (
    <>
      <tr className={row.members.some((m) => m.id === ownId) ? "is-you" : ""}>
        <td className={`standing-rank rank-${row.rank}`}>{row.rank || "—"}</td>
        <td>
          <button
            className="standing-team"
            onClick={onExpand}
            aria-expanded={expanded}
            aria-controls={detailId}
          >
            <span className="standing-team-avatars">
              {row.members.map((m) => (
                <Avatar key={m.id} sprite={m.sprite} />
              ))}
            </span>
            <span>
              <strong>
                {row.members.map((m, i) => (
                  <span key={m.id}>
                    {i > 0 && <span className="standing-plus"> + </span>}
                    <MemberName member={m} ownId={ownId} />
                  </span>
                ))}
              </strong>
              <small>
                {row.live && connected ? (
                  <>
                    <i className="green-dot" /> Pairing now
                  </>
                ) : (
                  "Local practice"
                )}{" "}
                · {expanded ? "Hide" : "See"} sessions {expanded ? "↑" : "↓"}
              </small>
            </span>
          </button>
        </td>
        <td className="ranked-metric">
          <Time value={row.duration} />
        </td>
        <td className="standing-session-count">{row.sessionCount}</td>
      </tr>
      {expanded && (
        <tr className="standing-detail" id={detailId}>
          <td colSpan={4}>
            <div>
              <header>
                <strong>Recent time together</strong>
                {partner && (
                  <button onClick={() => onPair(partner)}>
                    Pair with {partner.name} again ↗
                  </button>
                )}
              </header>
              <ul>
                {row.sessions.map((session) => (
                  <li key={session.id}>
                    <div>
                      <strong>
                        {session.goal || "A little shared progress"}
                      </strong>
                      <small>
                        {new Date(session.startedAt).toLocaleString([], {
                          month: "short",
                          day: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                        {session.live && connected ? " · In progress" : ""}
                      </small>
                    </div>
                    <span>{durationLabel(session.duration)}</span>
                  </li>
                ))}
              </ul>
              {row.sessionCount > 5 && (
                <small>
                  Showing the 5 most recent of {row.sessionCount} sessions.
                </small>
              )}
              <p>
                Time shown is within the selected period. Sessions with
                simulated coworkers are local practice.
              </p>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
