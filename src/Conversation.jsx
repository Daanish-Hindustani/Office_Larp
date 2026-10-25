import { useEffect, useRef, useState } from "react";
import CharacterSprite from "./PlayerSprite";
import { coworkerReply } from "./ChatWindow";
import { useWorld } from "./Multiplayer";
import "./conversation.css";

export default function Conversation({ person, onClose }) {
  const world = useWorld();
  const dialog = useRef(null),
    input = useRef(null),
    timer = useRef(null);
  const [localMessages, setLocalMessages] = useState([
    {
      id: 0,
      who: "npc",
      text: `Hey! I’m ${person.name}. Good to meet you. What’s on your mind?`,
    },
  ]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [page, setPage] = useState(0);
  const messages = person.remote
    ? world.messages
        .filter(
          (message) =>
            (message.sender === world.user.id &&
              message.recipient === person.id) ||
            (message.sender === person.id &&
              message.recipient === world.user.id),
        )
        .map((message) => ({
          id: message.id,
          who: message.sender === world.user.id ? "you" : "npc",
          text: message.text,
        }))
    : localMessages;
  const count = messages.length;
  const index = Math.min(page, Math.max(0, count - 1));
  const message = messages[index];
  useEffect(() => {
    dialog.current?.showModal();
    input.current?.focus();
    return () => clearTimeout(timer.current);
  }, []);
  useEffect(
    () => setPage(Math.max(0, count - 1)),
    [count, messages.at(-1)?.id],
  );
  useEffect(() => {
    const log = dialog.current?.querySelector('[role="log"]');
    if (log) log.scrollTop = 0;
  }, [index, message?.text]);
  async function send(event) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    setError("");
    if (person.remote) {
      try {
        await world.action({ type: "chat", recipient: person.id, text });
        setDraft("");
      } catch (failure) {
        setError(failure.message);
      } finally {
        setSending(false);
        input.current?.focus();
      }
    } else {
      setLocalMessages((previous) =>
        [
          ...previous,
          { id: (previous.at(-1)?.id ?? 0) + 1, who: "you", text },
        ].slice(-80),
      );
      setDraft("");
      timer.current = setTimeout(() => {
        setLocalMessages((previous) =>
          [
            ...previous,
            {
              id: (previous.at(-1)?.id ?? 0) + 1,
              who: "npc",
              text: coworkerReply(person, text),
            },
          ].slice(-80),
        );
        setSending(false);
        input.current?.focus();
      }, 650);
    }
  }
  return (
    <dialog
      ref={dialog}
      className="conversation-dialog"
      aria-label={`Conversation with ${person.name}`}
      onClose={onClose}
    >
      <div
        className="conversation-portrait"
        role="img"
        aria-label={`${person.name}'s character`}
      >
        <CharacterSprite character={person.sprite ?? 1} />
      </div>
      <section className="game-dialogue-frame">
        <header className="game-dialogue-heading">
          <span className="game-dialogue-speaker">
            {message?.who === "you" ? "You" : person.name}
          </span>
          <button
            className="game-dialogue-close"
            aria-label="Close conversation"
            title="Close conversation (Escape)"
            onClick={() => dialog.current?.close()}
          >
            ×
          </button>
        </header>
        <div className="game-dialogue-log" role="log" aria-live="polite">
          <p>{message?.text || `Say hello to ${person.name}.`}</p>
        </div>
        {error && (
          <p className="game-dialogue-error" role="alert">
            {error}
          </p>
        )}
        <form className="game-dialogue-form" onSubmit={send}>
          <input
            ref={input}
            aria-label={`Message ${person.name}`}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            maxLength={person.remote ? 1000 : 500}
            placeholder={`Reply to ${person.name}…`}
          />
          <button
            type="submit"
            disabled={
              !draft.trim() || sending || (person.remote && !world.connected)
            }
          >
            Send ↗
          </button>
        </form>
        <nav
          className="game-dialogue-history"
          aria-label="Conversation history"
        >
          <button
            aria-label="Previous dialogue"
            disabled={!count || index === 0}
            onClick={() => setPage(index - 1)}
          >
            ←
          </button>
          <span>{count ? `${index + 1} / ${count}` : " "}</span>
          <span className="game-dialogue-status" role="status">
            {sending
              ? person.remote
                ? "Sending…"
                : `${person.name} is thinking…`
              : ""}
          </span>
          <button
            aria-label="Next dialogue"
            disabled={!count || index >= count - 1}
            onClick={() => setPage(index + 1)}
          >
            <svg viewBox="0 0 12 8" width="14" height="10" aria-hidden="true">
              <path d="M0 0h12v2h-2v2H8v2H6v2H4V6H2V4H0Z" fill="currentColor" />
            </svg>
          </button>
        </nav>
      </section>
    </dialog>
  );
}
