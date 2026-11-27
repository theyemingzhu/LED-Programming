import { useEffect, useId, useRef, useState } from 'react';
import { normalizePlacedLook, placedLookStops } from '../../../lib/placedLook.js';
import { setPlacedLookPreview } from './mirrorEcho.js';
import '../placed-look.css';

function prefersReducedMotion() {
  try {
    return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true;
  } catch {
    return false;
  }
}

// Seconds since the look came on, about 25 times a second. With reduced
// motion the look is one still picture.
export function usePlacedLookClock(active) {
  const [time, setTime] = useState(0);
  useEffect(() => {
    if (!active) return undefined;
    if (prefersReducedMotion()) { setTime(0); return undefined; }
    let frame = 0;
    let last = 0;
    const start = performance.now();
    const tick = now => {
      if (now - last >= 40) { last = now; setTime((now - start) / 1000); }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [active]);
  return time;
}

const turned = look => `translate(${look.frame.x} ${look.frame.y}) rotate(${look.frame.turn})`;

// The picture itself, faint, so the frame reads as "this is what the lights
// are looking at". One repeat as a gradient that repeats: across the frame
// for a sweep, out from its centre for rings.
export function PlacedLookPicture({ look, time }) {
  const id = `lw-placed-look-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const { halfWidth, halfHeight } = look.frame;
  const stops = placedLookStops(look, time).map(stop => (
    <stop key={stop.offset} offset={stop.offset} stopColor={`rgb(${stop.rgb.join(' ')})`} stopOpacity={0.24 * stop.level}/>
  ));
  return (
    <g data-testid="placed-look-picture" data-mode={look.mode} transform={turned(look)} pointerEvents="none">
      <defs>
        {look.mode === 'rings'
          ? <radialGradient id={id} cx="0.5" cy="0.5" r={0.5 / look.repeat} fx="0.5" fy="0.5" spreadMethod="repeat">{stops}</radialGradient>
          : <linearGradient id={id} x1="0" y1="0" x2={1 / look.repeat} y2="0" spreadMethod="repeat">{stops}</linearGradient>}
      </defs>
      <rect x={-halfWidth} y={-halfHeight} width={halfWidth * 2} height={halfHeight * 2} fill={`url(#${id})`}/>
    </g>
  );
}

const CORNERS = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
const CORNER_NAMES = ['top left', 'top right', 'bottom right', 'bottom left'];

// The frame: drag the move handle, drag a corner to size it, arrow keys
// nudge it. Everything is in artwork units, so it stays put when the view
// zooms; only the line weights and handle sizes follow the screen.
export function PlacedLookFrame({ look, svgRef, scale, spaceRef }) {
  const dragRef = useRef(null);
  const { x, y, halfWidth, halfHeight, turn } = look.frame;
  const pointAt = event => {
    const matrix = svgRef.current?.getScreenCTM()?.inverse();
    return matrix ? new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix) : null;
  };
  const setFrame = frame => setPlacedLookPreview(normalizePlacedLook({ ...look, frame: { ...look.frame, ...frame } }));
  const begin = kind => event => {
    // Space-drag still pans the view.
    if (spaceRef?.current || event.button > 0) return;
    const point = pointAt(event);
    if (!point) return;
    event.stopPropagation();
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    dragRef.current = { kind, dx: point.x - x, dy: point.y - y };
  };
  const move = event => {
    const drag = dragRef.current;
    if (!drag) return;
    const point = pointAt(event);
    if (!point) return;
    if (drag.kind === 'move') {
      setFrame({ x: point.x - drag.dx, y: point.y - drag.dy });
      return;
    }
    // A corner: measure the pointer in the frame's own turned axes.
    const angle = -turn * Math.PI / 180;
    const dx = point.x - x;
    const dy = point.y - y;
    const least = scale * 14;
    setFrame({
      halfWidth: Math.max(least, Math.abs(dx * Math.cos(angle) - dy * Math.sin(angle))),
      halfHeight: Math.max(least, Math.abs(dx * Math.sin(angle) + dy * Math.cos(angle))),
    });
  };
  const end = () => { dragRef.current = null; };
  const swallow = event => event.stopPropagation();
  const dragHandlers = kind => ({
    onPointerDown: begin(kind), onPointerMove: move, onPointerUp: end, onPointerCancel: end,
    onClick: swallow, onDoubleClick: swallow,
  });
  return (
    <g className="lw-placed-look" data-testid="placed-look-frame" tabIndex={0} role="group"
       aria-label="Placed look frame. Drag the move handle or use arrow keys to move it. Drag a corner to resize it."
       data-x={x.toFixed(2)} data-y={y.toFixed(2)}
       data-half-width={halfWidth.toFixed(2)} data-half-height={halfHeight.toFixed(2)}
       transform={turned(look)}
       onKeyDown={event => {
         const step = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
         if (!step) return;
         event.preventDefault();
         event.stopPropagation();
         const nudge = scale * (event.shiftKey ? 10 : 2);
         setFrame({ x: x + step[0] * nudge, y: y + step[1] * nudge });
       }}>
      <rect className="lw-placed-look-body" data-testid="placed-look-body"
            x={-halfWidth} y={-halfHeight} width={halfWidth * 2} height={halfHeight * 2}
            fill="none" stroke="var(--text-mid)" strokeOpacity="0.75" strokeWidth={scale * 1.5}
            strokeDasharray={`${scale * 7} ${scale * 6}`} pointerEvents="none"/>
      <g className="lw-placed-look-move" data-testid="placed-look-move"
         aria-label="Move placed look frame"
         transform={`translate(0 ${-halfHeight - scale * 22}) scale(${scale})`}
         {...dragHandlers('move')}>
        <title>Move placed look frame</title>
        <circle r="20" fill="transparent"/>
        <g pointerEvents="none" strokeWidth="1.5">
          <path d="M0 10v12" stroke="var(--text-mid)" strokeOpacity="0.75"/>
          <circle r="10" fill="var(--bg-canvas)" stroke="var(--text-hi)" strokeOpacity="0.9"/>
          <path d="M-6 0H6M0 -6V6M-3 -2L-6 0l3 2M3 -2L6 0 3 2M-2 -3L0 -6l2 3M-2 3L0 6l2 -3"
                fill="none" stroke="var(--text-hi)" strokeLinecap="round" strokeLinejoin="round"/>
        </g>
      </g>
      {CORNERS.map(([i, j], index) => (
        <g key={index} className="lw-placed-look-corner" data-testid={`placed-look-corner-${index}`}
           aria-label={`Size from the ${CORNER_NAMES[index]} corner`}
           transform={`translate(${i * halfWidth} ${j * halfHeight})`}
           style={{ cursor: (i * j > 0) === (Math.abs(((turn % 180) + 180) % 180 - 90) > 45) ? 'nwse-resize' : 'nesw-resize', touchAction: 'none' }}
           {...dragHandlers('size')}>
          <circle r={scale * 20} fill="transparent"/>
          <circle r={scale * 7} fill="var(--bg-canvas)" stroke="var(--text-hi)" strokeOpacity="0.9" strokeWidth={scale * 1.5} pointerEvents="none"/>
        </g>
      ))}
    </g>
  );
}
