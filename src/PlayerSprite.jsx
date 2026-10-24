import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

// MetroCity / Pixel Agents sheets: 7 intact 16×32 frames per direction.
// Rows: down, up, right. Frames 0–2 walk, 3–4 seated/typing, 5–6 reading.
// Draw the original cells at one integer scale. Never stretch body parts.
const ROW = { down: 0, up: 1, right: 2, left: 2 };
const WALK = [0, 1, 2, 1];
const PIXEL_SCALE = 4;
const DRAW_X = 32;
const DRAW_Y = 0;
// Pixel Agents' seated registration: six source pixels below the walk origin.
const SEATED_DROP = 6 * PIXEL_SCALE;

const PlayerSprite = forwardRef(function PlayerSprite({ character = 0 }, ref) {
  const canvas = useRef(null),
    image = useRef(null);
  const pose = useRef({ direction: "down", frame: 0, mode: "walk" });
  function draw() {
    if (!canvas.current || !image.current) return;
    const { direction, frame, mode } = pose.current;
    // Authored seated pose replaces the neutral pose on contact with the cushion.
    const cell = mode === "sit" ? (frame < 2 ? 0 : 3) : WALK[frame % 4];
    const ctx = canvas.current.getContext("2d");
    ctx.clearRect(0, 0, 128, 128);
    ctx.imageSmoothingEnabled = false;
    ctx.save();
    if (direction === "left") {
      ctx.translate(128, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(
      image.current,
      cell * 16,
      ROW[direction] * 32,
      16,
      32,
      DRAW_X,
      DRAW_Y + (cell === 3 ? SEATED_DROP : 0),
      16 * PIXEL_SCALE,
      32 * PIXEL_SCALE,
    );
    ctx.restore();
  }
  useImperativeHandle(ref, () => ({
    setPose(direction, frame, mode = "walk") {
      const previous = pose.current;
      if (
        previous.direction === direction &&
        previous.frame === frame &&
        previous.mode === mode
      )
        return;
      pose.current = { direction, frame, mode };
      draw();
    },
  }));
  useEffect(() => {
    const asset = new Image();
    asset.onload = () => {
      image.current = asset;
      draw();
    };
    asset.src = `/assets/game-characters/char_${character}.png`;
    return () => {
      asset.onload = null;
      image.current = null;
    };
  }, [character]);
  return (
    <canvas
      ref={canvas}
      className="player-sprite"
      width={128}
      height={128}
      aria-hidden="true"
    />
  );
});
export default PlayerSprite;
