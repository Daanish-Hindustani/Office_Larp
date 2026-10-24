import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { SEAT_FORWARD } from "./world";

// The room is chair-free; these independent props can move without leaving ghosts.
const ChairSprite = forwardRef(function ChairSprite({ chair }, ref) {
  const element = useRef(null),
    canvas = useRef(null),
    foreground = useRef(null),
    foregroundCanvas = useRef(null);
  useImperativeHandle(ref, () => ({
    setOffset(offset) {
      if (!element.current) return;
      element.current.style.top = chair.y - 7.1 + offset + "%";
      element.current.style.zIndex = String(
        Math.round((chair.y + offset - SEAT_FORWARD - 0.2) * 10),
      );
      element.current.dataset.offset = offset.toFixed(3);
      if (foreground.current) {
        foreground.current.style.top = element.current.style.top;
        // The front seat lip and armrests cover the lower body behind the chair.
        // The head and torso stay above the foreground mask.
        foreground.current.style.zIndex = String(
          Math.round((chair.y + offset - 0.1) * 10),
        );
      }
    },
  }));
  useEffect(() => {
    const image = new Image();
    image.onload = () => {
      const source = document.createElement("canvas");
      source.width = image.width;
      source.height = image.height;
      const sourceContext = source.getContext("2d");
      sourceContext.drawImage(image, 0, 0);
      const { data } = sourceContext.getImageData(
        0,
        0,
        image.width,
        image.height,
      );
      let left = image.width,
        top = image.height,
        right = 0,
        bottom = 0;
      for (let y = 0; y < image.height; y++)
        for (let x = 0; x < image.width; x++)
          if (data[(y * image.width + x) * 4 + 3] > 128) {
            left = Math.min(left, x);
            right = Math.max(right, x);
            top = Math.min(top, y);
            bottom = Math.max(bottom, y);
          }
      const ctx = canvas.current?.getContext("2d");
      if (!ctx) return;
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, 128, 128);
      ctx.drawImage(
        image,
        left,
        top,
        right - left + 1,
        bottom - top + 1,
        0,
        0,
        128,
        128,
      );
      const front = foregroundCanvas.current?.getContext("2d");
      if (front) {
        front.clearRect(0, 0, 128, 128);
        front.imageSmoothingEnabled = false;
        front.save();
        front.beginPath();
        // Match the separate lower backrest bar and the two armrests in the art.
        const polygons = [
          [
            [0.27, 0.245],
            [0.73, 0.245],
            [0.8, 0.43],
            [0.2, 0.43],
          ],
          [
            [0.15, 0.43],
            [0.85, 0.43],
            [0.86, 0.5],
            [0.81, 0.56],
            [0.19, 0.56],
            [0.14, 0.5],
          ],
          [
            [0, 0.09],
            [0.18, 0.09],
            [0.18, 0.46],
            [0, 0.46],
          ],
          [
            [0.82, 0.09],
            [1, 0.09],
            [1, 0.46],
            [0.82, 0.46],
          ],
        ];
        for (const points of polygons) {
          front.moveTo(points[0][0] * 128, points[0][1] * 128);
          for (const [x, y] of points.slice(1)) front.lineTo(x * 128, y * 128);
          front.closePath();
        }
        front.clip();
        front.drawImage(canvas.current, 0, 0);
        front.restore();
      }
    };
    image.src = "/assets/desk-chair-seat.png";
    return () => {
      image.onload = null;
    };
  }, []);
  return (
    <>
      <div
        ref={element}
        className="movable-chair"
        data-testid={`chair-${chair.id}`}
        style={{ left: chair.x - 2.6 + "%", top: chair.y - 7.1 + "%" }}
      >
        <canvas ref={canvas} width="128" height="128" aria-hidden="true" />
      </div>
      <div
        ref={foreground}
        className="movable-chair chair-occlusion"
        data-testid={`chair-rim-${chair.id}`}
        style={{ left: chair.x - 2.6 + "%", top: chair.y - 7.1 + "%" }}
        aria-hidden="true"
      >
        <canvas ref={foregroundCanvas} width="128" height="128" />
      </div>
    </>
  );
});
export default ChairSprite;
