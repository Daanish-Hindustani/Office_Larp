import { useEffect, useMemo, useRef, useState } from "react";
import { leetcodeRequest, sanitizeProblemHTML } from "./leetcodeClient";
import { problemURL, studyProblems } from "./leetcodeProblems";
import { runPractice } from "./practiceRunner";

export default function LeetCodeWorkspace({
  station,
  initialSlug,
  room,
  onClose,
}) {
  const [slug, setSlug] = useState(initialSlug),
    [problem, setProblem] = useState(null),
    [loadError, setLoadError] = useState(""),
    [loading, setLoading] = useState(true);
  const [code, setCode] = useState(""),
    [saved, setSaved] = useState(true),
    [result, setResult] = useState(null),
    [running, setRunning] = useState(false),
    [runError, setRunError] = useState("");
  const [notice, setNotice] = useState(""),
    [backup, setBackup] = useState(null),
    [verifying, setVerifying] = useState(false),
    [verified, setVerified] = useState(null);
  const [mobileView, setMobileView] = useState("problem"),
    [leftTab, setLeftTab] = useState("description"),
    [reload, setReload] = useState(0);
  const closeButton = useRef(null),
    windowRef = useRef(null),
    runner = useRef(null),
    alive = useRef(true),
    sessionStarted = useRef(Date.now()),
    latestSlug = useRef(slug);
  latestSlug.current = slug;
  const practice = studyProblems.find((item) => item.slug === slug);
  const statement = useMemo(
    () => sanitizeProblemHTML(problem?.content || ""),
    [problem?.content],
  );
  useEffect(() => {
    alive.current = true;
    const previous = document.activeElement;
    closeButton.current?.focus();
    function key(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
      if (event.key !== "Tab") return;
      const nodes = [
        ...windowRef.current.querySelectorAll(
          "button,input,textarea,select,a[href]",
        ),
      ].filter(
        (node) =>
          !node.disabled && node.tabIndex >= 0 && node.getClientRects().length,
      );
      const first = nodes[0],
        last = nodes.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }
    window.addEventListener("keydown", key);
    return () => {
      alive.current = false;
      runner.current?.cancel();
      window.removeEventListener("keydown", key);
      previous?.focus();
    };
  }, [onClose]);
  useEffect(() => {
    const controller = new AbortController();
    runner.current?.cancel();
    setProblem(null);
    setLoading(true);
    setLoadError("");
    setResult(null);
    setRunError("");
    setNotice("");
    setBackup(null);
    setVerified(null);
    sessionStarted.current = Date.now();
    leetcodeRequest(`problems/${encodeURIComponent(slug)}`, controller.signal)
      .then((data) => {
        if (controller.signal.aborted) return;
        setProblem(data);
        try {
          setCode(
            localStorage.getItem(`office-hours:leetcode:draft:${slug}`) ??
              data.starterCode,
          );
        } catch {
          setCode(data.starterCode);
          setSaved(false);
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted) setLoadError(error.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [slug, reload]);
  useEffect(() => {
    if (!problem || problem.slug !== slug) return;
    try {
      localStorage.setItem(`office-hours:leetcode:draft:${slug}`, code);
      setSaved(true);
    } catch {
      setSaved(false);
    }
  }, [code, problem, slug]);
  async function run() {
    if (running || !problem?.functionName) return;
    const runSlug = slug,
      source = code;
    setRunning(true);
    setRunError("");
    setResult(null);
    setLeftTab("tests");
    setMobileView("code");
    const task = runPractice({
      code,
      functionName: problem.functionName,
      cases: practice.cases,
      compare: practice.compare,
    });
    runner.current = task;
    try {
      const output = await task.promise;
      if (!alive.current || latestSlug.current !== runSlug) return;
      setResult({ ...output, source });
    } catch (error) {
      if (alive.current && latestSlug.current === runSlug)
        setRunError(error.message);
    } finally {
      if (alive.current) setRunning(false);
      if (runner.current === task) runner.current = null;
    }
  }
  async function submit() {
    const copy = navigator.clipboard?.writeText(code);
    window.open(problemURL(slug), "_blank", "noopener,noreferrer");
    try {
      if (!copy) throw new Error();
      await copy;
      setNotice(
        "Code copied. Paste it into LeetCode’s JavaScript editor and Submit there, then check Accepted here.",
      );
    } catch {
      setNotice(
        "LeetCode is open. Copy your code manually into its JavaScript editor and Submit there.",
      );
    }
  }
  async function verify() {
    if (!room.selectedUser || verifying) return;
    const checkSlug = slug,
      started = sessionStarted.current;
    setVerifying(true);
    setNotice("");
    try {
      const profile = await room.verify(room.selectedUser);
      if (!alive.current || latestSlug.current !== checkSlug) return;
      if (profile.recentAvailable === false) {
        setNotice(
          `LeetCode isn’t exposing recent Accepted activity for ${profile.username}. Public solve counts were refreshed, but this desk session can’t be confirmed here.`,
        );
        return;
      }
      const accepted = profile.recent.find(
        (item) => item.slug === checkSlug && item.timestamp >= started - 1000,
      );
      if (accepted) {
        setVerified({ ...accepted, username: profile.username });
        setNotice(
          `Accepted on LeetCode for ${profile.username}. Your leaderboard stats have been refreshed.`,
        );
      } else
        setNotice(
          `No new public Accepted found for this problem in ${profile.username}’s latest 20 Accepted submissions. Submit on LeetCode, wait a few seconds, and check again. Older or private activity can’t confirm this session.`,
        );
    } catch (error) {
      if (alive.current) setNotice(error.message);
    } finally {
      if (alive.current) setVerifying(false);
    }
  }
  const passed = result?.results.filter((test) => test.passed).length || 0;
  const stale = result && result.source !== code;
  return (
    <div className="modal-backdrop leetcode-workspace-backdrop">
      <section
        ref={windowRef}
        className="project-window leetcode-workspace"
        role="dialog"
        aria-modal="true"
        aria-labelledby="leetcode-workspace-title"
      >
        <header className="project-header">
          <span className="window-dots">
            <i />
            <i />
            <i />
          </span>
          <div>
            <span className="muted">Practice desk {station.id} / </span>
            <strong id="leetcode-workspace-title">One little problem.</strong>
          </div>
          <button
            ref={closeButton}
            onClick={onClose}
            aria-label="Close LeetCode workspace"
          >
            ✕ <kbd>esc</kbd>
          </button>
        </header>
        <div className="leetcode-workspace-intro">
          <div>
            <span className="lab-eyebrow">
              REAL PROBLEMS. A LITTLE SHARED PROGRESS.
            </span>
            <h1>
              {problem
                ? `${problem.id}. ${problem.title}`
                : loading
                  ? "Pulling up your problem…"
                  : "A small pause"}
            </h1>
          </div>
          {problem && (
            <span
              className={`lab-difficulty difficulty-${problem.difficulty.toLowerCase()}`}
            >
              {problem.difficulty}
            </span>
          )}
          <label className="leetcode-problem-switch">
            <span>Practice shelf</span>
            <select
              aria-label="Choose a LeetCode problem"
              value={slug}
              onChange={(event) => {
                setSlug(event.target.value);
                setMobileView("problem");
              }}
              disabled={running}
            >
              {room.catalog?.problems.map((item) => (
                <option value={item.slug} key={item.slug}>
                  {item.id}. {item.title}
                </option>
              ))}
            </select>
          </label>
        </div>
        {room.catalogError && (
          <div className="lab-notice" role="alert">
            <p>{room.catalogError}</p>
            <button
              onClick={room.loadCatalog}
              aria-label="Retry problem catalog"
            >
              Try again ↗
            </button>
          </div>
        )}
        <div className="leetcode-mobile-tabs">
          <button
            aria-pressed={mobileView === "problem"}
            onClick={() => setMobileView("problem")}
          >
            ◇ Problem & tests
          </button>
          <button
            aria-pressed={mobileView === "code"}
            onClick={() => setMobileView("code")}
          >
            ⌘ Your code
          </button>
        </div>
        {loading ? (
          <div className="leetcode-loading" role="status">
            <span>◇</span>Getting the statement and starter code from LeetCode…
          </div>
        ) : loadError ? (
          <div className="leetcode-load-error" role="alert">
            <h2>Couldn’t pull up this problem.</h2>
            <p>{loadError}</p>
            <button
              className="pair-primary"
              onClick={() => setReload((value) => value + 1)}
            >
              Try again ↗
            </button>
            <a href={problemURL(slug)} target="_blank" rel="noreferrer">
              Open on LeetCode ↗
            </a>
          </div>
        ) : (
          problem && (
            <>
              <div
                className="leetcode-workspace-body"
                data-mobile-view={mobileView}
              >
                <section className="leetcode-statement-pane">
                  <div
                    className="companion-tabs"
                    role="group"
                    aria-label="Problem panels"
                  >
                    <button
                      aria-pressed={leftTab === "description"}
                      onClick={() => setLeftTab("description")}
                    >
                      Description
                    </button>
                    <button
                      aria-pressed={leftTab === "tests"}
                      onClick={() => setLeftTab("tests")}
                    >
                      Practice tests <span>{practice.cases.length}</span>
                    </button>
                    <a
                      href={problemURL(slug)}
                      target="_blank"
                      rel="noreferrer"
                      aria-label="View original problem on LeetCode"
                    >
                      ↗
                    </a>
                  </div>
                  <div
                    className="leetcode-description"
                    hidden={leftTab !== "description"}
                  >
                    <div className="leetcode-source">
                      <i className="green-dot" /> Pulled from LeetCode ·{" "}
                      <a
                        href={problemURL(slug)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        View original ↗
                      </a>
                    </div>
                    <div className="leetcode-tags">
                      {problem.tags.map((tag) => (
                        <span key={tag}>{tag}</span>
                      ))}
                    </div>
                    <div
                      className="leetcode-problem-html"
                      dangerouslySetInnerHTML={{ __html: statement }}
                    />
                  </div>
                  <div
                    className="leetcode-test-cases"
                    hidden={leftTab !== "tests"}
                  >
                    <span className="lab-eyebrow">
                      A QUICK CHECK BEFORE YOU SHIP
                    </span>
                    <h2>
                      {running
                        ? "Working through the cases…"
                        : result
                          ? stale
                            ? "Your draft has changed."
                            : passed === practice.cases.length
                              ? "Practice tests passed. Nice work."
                              : "A little more to work through."
                          : "Small tests. Useful clues."}
                    </h2>
                    <p>
                      These {practice.cases.length} room-authored cases help you
                      practice. LeetCode runs its full judge when you submit on
                      its website.
                    </p>
                    {stale && (
                      <p className="lab-notice">
                        Run this draft again to update these results.
                      </p>
                    )}
                    {runError && (
                      <p className="lab-notice" role="alert">
                        {runError}
                      </p>
                    )}
                    {practice.cases.map((test, index) => (
                      <details
                        key={index}
                        className={`leetcode-test-case${result && !stale ? (result.results[index].passed ? " case-passed" : " case-failed") : ""}`}
                        open={Boolean(result && !result.results[index].passed)}
                      >
                        <summary>
                          <span>
                            {result && !stale
                              ? result.results[index].passed
                                ? "✓"
                                : "×"
                              : "◇"}{" "}
                            Case {index + 1}
                          </span>
                          <small>
                            {result && !stale
                              ? result.results[index].passed
                                ? `${result.results[index].elapsed} ms`
                                : "Try again"
                              : "Practice case"}
                          </small>
                        </summary>
                        <dl>
                          <dt>Arguments</dt>
                          <dd>
                            <code>{JSON.stringify(test.args)}</code>
                          </dd>
                          <dt>Expected</dt>
                          <dd>
                            <code>{JSON.stringify(test.expected)}</code>
                          </dd>
                          {result && (
                            <>
                              <dt>
                                {result.results[index].error
                                  ? "Error"
                                  : "Your output"}
                              </dt>
                              <dd>
                                <code>
                                  {result.results[index].error ||
                                    result.results[index].actual}
                                </code>
                              </dd>
                            </>
                          )}
                        </dl>
                      </details>
                    ))}
                  </div>
                </section>
                <section className="leetcode-code-pane">
                  <div className="pane-toolbar">
                    <span className="code-file">◇ solution.js</span>
                    <span>JavaScript</span>
                    <button
                      onClick={() => {
                        setBackup(code);
                        setCode(problem.starterCode);
                        setNotice(
                          "Starter code restored. Use Undo reset to get your previous draft back.",
                        );
                      }}
                      disabled={running}
                    >
                      ↻ Reset
                    </button>
                  </div>
                  <label className="sr-only" htmlFor="leetcode-code">
                    LeetCode JavaScript code
                  </label>
                  <textarea
                    id="leetcode-code"
                    className="leetcode-code-editor"
                    spellCheck="false"
                    value={code}
                    onChange={(event) => setCode(event.target.value)}
                    onKeyDown={(event) => {
                      if (
                        (event.ctrlKey || event.metaKey) &&
                        event.key === "Enter"
                      ) {
                        event.preventDefault();
                        run();
                      }
                    }}
                  />
                  <div className="leetcode-code-status">
                    <span>
                      {saved
                        ? "✓ Draft saved in this browser"
                        : "Draft is in memory · storage unavailable"}
                    </span>
                    <span>{code.split("\n").length} lines</span>
                  </div>
                  <div className="leetcode-run-actions">
                    {running ? (
                      <button
                        onClick={() => runner.current?.cancel()}
                        className="leetcode-run"
                      >
                        ■ Stop run
                      </button>
                    ) : (
                      <button
                        onClick={run}
                        disabled={!problem.functionName}
                        className="leetcode-run"
                      >
                        ▶ Run practice tests
                      </button>
                    )}
                    <button className="pair-primary" onClick={submit}>
                      Copy & submit on LeetCode ↗
                    </button>
                  </div>
                  {result && (
                    <div
                      className={`leetcode-run-summary${stale ? " is-stale" : passed === practice.cases.length ? " all-passed" : " has-failures"}`}
                      role="status"
                    >
                      {stale
                        ? "Code changed · run again"
                        : `${passed}/${practice.cases.length} practice cases passed`}
                      <button
                        onClick={() => {
                          setLeftTab("tests");
                          setMobileView("problem");
                        }}
                      >
                        View results ↗
                      </button>
                    </div>
                  )}
                  <div className="leetcode-official-check">
                    <div>
                      <strong>
                        {verified
                          ? "✓ Accepted on LeetCode"
                          : "Ready for the real judge?"}
                      </strong>
                      <p>
                        Submit in LeetCode’s editor, then check your public
                        Accepted result here.
                      </p>
                    </div>
                    {room.profiles.length ? (
                      <>
                        <select
                          aria-label="Verify LeetCode profile"
                          value={
                            room.profiles.some(
                              (profile) =>
                                profile.username === room.selectedUser,
                            )
                              ? room.selectedUser
                              : ""
                          }
                          onChange={(event) =>
                            room.setSelectedUser(event.target.value)
                          }
                        >
                          <option value="">Choose a tracked profile</option>
                          {room.profiles.map((profile) => (
                            <option
                              key={profile.username}
                              value={profile.username}
                            >
                              {profile.username}
                            </option>
                          ))}
                        </select>
                        <button
                          onClick={verify}
                          disabled={!room.selectedUser || verifying}
                        >
                          {verifying ? "Checking…" : "Check Accepted ↗"}
                        </button>
                      </>
                    ) : (
                      <span className="lab-fine-print">
                        Add your username on the room leaderboard to check
                        Accepted.
                      </span>
                    )}
                    {verified && (
                      <a
                        href={`https://leetcode.com/submissions/detail/${encodeURIComponent(verified.id)}/`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        View {verified.username}’s Accepted submission ↗
                      </a>
                    )}
                  </div>
                  {(notice || backup !== null) && (
                    <div className="leetcode-workspace-notice" role="status">
                      {notice}
                      {backup !== null && (
                        <button
                          onClick={() => {
                            setCode(backup);
                            setBackup(null);
                            setNotice("Your previous draft is back.");
                          }}
                        >
                          Undo reset ↗
                        </button>
                      )}
                    </div>
                  )}
                </section>
              </div>
              <footer className="leetcode-workspace-footer">
                <span>
                  Practice here. Official judging on{" "}
                  <a href={problemURL(slug)} target="_blank" rel="noreferrer">
                    LeetCode ↗
                  </a>
                  .
                </span>
                <span>Local test passes don’t change the leaderboard.</span>
              </footer>
            </>
          )
        )}
      </section>
    </div>
  );
}
