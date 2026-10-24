import { useEffect, useRef } from "react";
import { people } from "./data";
import { Avatar } from "./Office";
import { pairingBriefs } from "./pairing";

export default function PairLobby({ onChoose, onClose }) {
  const dialog = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    dialog.current.querySelector("button")?.focus();
    function key(event) {
      if (event.key === "Escape") onClose();
      if (event.key !== "Tab") return;
      const buttons = [...dialog.current.querySelectorAll("button")];
      const first = buttons[0],
        last = buttons.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      }
      if (!event.shiftKey && document.activeElement === last) {
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
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section
        className="pair-lobby"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pair-lobby-title"
        ref={dialog}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="pair-lobby-heading">
          <span className="pair-eyebrow">A LITTLE SHARED MOMENTUM</span>
          <button aria-label="Close pairing lobby" onClick={onClose}>
            ✕
          </button>
          <h1 id="pair-lobby-title">Better with company.</h1>
          <p>
            One project. Two perspectives. Pull up a chair and make something
            small together.
          </p>
        </header>
        <div className="pair-lobby-list">
          {people.map((person) => (
            <button
              className="pair-person"
              key={person.id}
              onClick={() => onChoose(person)}
              aria-label={`Pair with ${person.name}`}
            >
              <Avatar sprite={person.sprite} />
              <span className="pair-person-info">
                <strong>
                  {person.name}
                  <small>
                    <i className="green-dot" /> Ready to pair
                  </small>
                </strong>
                <span>{person.project}</span>
                <small>{pairingBriefs[person.kind].focus}</small>
              </span>
              <span className="pair-person-arrow" aria-hidden="true">
                ↗
              </span>
            </button>
          ))}
        </div>
        <footer className="pair-lobby-footer">
          <span>↔</span>
          <p>
            Take turns driving. Talk through the details.
            <small>Local practice with simulated coworkers.</small>
          </p>
          <span className="pair-tag">5 MIN TURNS</span>
        </footer>
      </section>
    </div>
  );
}
