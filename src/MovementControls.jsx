export default function MovementControls({ disabled = false }) {
  return (
    <div className="mobile-dpad" aria-label="Movement controls">
      {[
        ["↑", "ArrowUp"],
        ["←", "ArrowLeft"],
        ["↓", "ArrowDown"],
        ["→", "ArrowRight"],
      ].map(([label, key]) => (
        <button
          key={key}
          disabled={disabled}
          aria-label={`Move ${key.slice(5).toLowerCase()}`}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            window.dispatchEvent(new KeyboardEvent("keydown", { key }));
          }}
          onPointerUp={() =>
            window.dispatchEvent(new KeyboardEvent("keyup", { key }))
          }
          onPointerCancel={() =>
            window.dispatchEvent(new KeyboardEvent("keyup", { key }))
          }
        >
          {label}
        </button>
      ))}
    </div>
  );
}
