import { useEffect, useRef, useState } from "react";
import { Avatar } from "./Office";

export function coworkerReply(person, text) {
  const message = text.toLowerCase();
  if (/project|building|working|making/.test(message))
    return `${person.hello} Ask me about the project or take a look at my computer.`;
  if (/advice|tip|help|hackathon/.test(message))
    return "Get one tiny thing working first. Then make it feel good. You can always add the fancy stuff later!";
  if (/hello|hey|hi\b/.test(message))
    return `Hey, welcome to the studio! I’m ${person.name}. Pull up a chair. What are you making?`;
  if (/coffee|break|walk/.test(message))
    return "A short walk and a coffee usually fix at least half my bugs. The coffee corner is up on the right.";
  return `I like that! I’m keeping ${person.project} small for now—something fun that I can actually finish. Tell me more about your idea.`;
}
export default function ChatWindow({ person, onReply, autoFocus = true }) {
  const [messages, setMessages] = useState([
    {
      who: "npc",
      text: `Hey! I’m ${person.name}. Good to meet you. What’s on your mind?`,
    },
  ]);
  const [draft, setDraft] = useState(""),
    [typing, setTyping] = useState(false);
  const input = useRef(null),
    log = useRef(null),
    timer = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    if (autoFocus) input.current?.focus();
    return () => {
      clearTimeout(timer.current);
      previous?.focus();
    };
  }, []);
  useEffect(() => {
    log.current?.scrollTo({
      top: log.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, typing]);
  function send(text) {
    const value = text.trim();
    if (!value || typing) return;
    setMessages((m) => [...m, { who: "you", text: value }]);
    setDraft("");
    setTyping(true);
    timer.current = setTimeout(() => {
      const response = coworkerReply(person, value);
      setMessages((m) => [...m, { who: "npc", text: response }]);
      onReply?.(response);
      setTyping(false);
      if (input.current?.getClientRects().length) input.current.focus();
    }, 650);
  }
  return (
    <aside className="chat-window" aria-labelledby="chat-title">
      <header className="chat-header">
        <Avatar sprite={person.sprite} />
        <div>
          <h2 id="chat-title">Chat with {person.name}</h2>
          <span>
            <i className="green-dot" /> Around the studio
          </span>
        </div>
      </header>
      <div className="chat-context">
        <span>☏</span> A little conversation with {person.name}
        <small>LOCAL DEMO</small>
      </div>
      <div ref={log} className="chat-log" role="log" aria-live="off">
        {messages.map((m, i) => (
          <div key={i} className={`chat-message from-${m.who}`}>
            <span className="chat-speaker">
              {m.who === "you" ? "You" : person.name}
            </span>
            <p>{m.text}</p>
          </div>
        ))}
        {typing && (
          <div className="chat-typing">
            {person.name} is thinking <span>•••</span>
          </div>
        )}
      </div>
      <div className="chat-suggestions">
        {[
          "What are you building?",
          "Any hackathon advice?",
          "Coffee break?",
        ].map((text) => (
          <button key={text} disabled={typing} onClick={() => send(text)}>
            {text}
          </button>
        ))}
      </div>
      <form
        className="chat-form"
        onSubmit={(e) => {
          e.preventDefault();
          send(draft);
        }}
      >
        <input
          ref={input}
          aria-label={`Message ${person.name}`}
          value={draft}
          maxLength={500}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={`Say something to ${person.name}…`}
        />
        <button disabled={typing || !draft.trim()} type="submit">
          Send ↗
        </button>
      </form>
      <footer className="chat-footer">
        Mock coworker · messages stay in this conversation{" "}
        <span>
          <kbd>esc</kbd> to leave
        </span>
      </footer>
    </aside>
  );
}
