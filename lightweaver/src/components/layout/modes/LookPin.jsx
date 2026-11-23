import { useEffect, useMemo, useRef } from 'react';
import { thumbnailBytes, thumbnailSpots } from '../../../lib/lookEngine/index.js';
import '../look-designer.css';

export const PIN_HEIGHT = 56;
const SIZE = 40;
const STILL_SECONDS = 2.6;
const reduced = () => {
  try { return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true; } catch { return false; }
};

/**
 * The pinned strip: a tiny live picture of the piece with the chosen area
 * brighter than the rest, the area's name and copy count, and the pattern's
 * name. One button: it takes the owner back to the area chips. A few frames a
 * second; with reduced motion, a still frame. The picture is decoration: the
 * button's own label carries the names, so nothing is announced per frame.
 */
export function LookPin({ look, model, areaIndex, areaName, copies, patternName, onJump }) {
  const canvas = useRef(null);
  const spots = useMemo(() => thumbnailSpots(model, SIZE, 3), [model]);
  useEffect(() => {
    const draw = t => {
      const ctx = canvas.current?.getContext?.('2d');
      if (!ctx) return;
      const bytes = thumbnailBytes(look, model, t);
      ctx.clearRect(0, 0, SIZE, SIZE);
      model.map.leds.forEach((led, i) => {
        const spot = spots[i];
        if (!spot) return;
        const mine = led.area === areaIndex;
        const dim = mine ? 1 : 0.32;
        ctx.fillStyle = `rgb(${Math.round(Math.max(bytes[i * 3], 34) * dim)},${Math.round(Math.max(bytes[i * 3 + 1], 34) * dim)},${Math.round(Math.max(bytes[i * 3 + 2], 32) * dim)})`;
        ctx.beginPath(); ctx.arc(spot.x, spot.y, mine ? 1.9 : 1.2, 0, 7); ctx.fill();
      });
    };
    if (reduced()) { draw(STILL_SECONDS); return undefined; }
    const start = performance.now();
    draw(STILL_SECONDS);
    const timer = setInterval(() => draw(STILL_SECONDS + (performance.now() - start) / 1000), 250);
    return () => clearInterval(timer);
  }, [look, model, spots, areaIndex]);
  return (
    <button type="button" className="ld-pin" data-testid="look-designer-pin" onClick={onJump}
            aria-label={`${areaName}, ${patternName}. Back to the shape buttons.`}>
      <canvas ref={canvas} width={SIZE} height={SIZE} aria-hidden="true"/>
      <span className="ld-pin-text" aria-hidden="true">
        <span className="ld-pin-area" data-testid="look-designer-pin-area">{areaName}<span className="ld-count">{copies}</span></span>
        <span className="ld-pin-pattern" data-testid="look-designer-pin-pattern">{patternName}</span>
      </span>
    </button>
  );
}
