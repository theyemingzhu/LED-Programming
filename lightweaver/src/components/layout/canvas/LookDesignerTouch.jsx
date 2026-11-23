import { useEffect, useRef, useState } from 'react';
import { getMotion } from '../../../lib/lookEngine/index.js';
import { setOrder, stepMotion } from '../../../lib/lookEngine/index.js';
import { getLookDesigner, setLookDesigner } from './lookDesignerStore.js';
import '../look-designer.css';

const STILL_SECONDS = 2.6;

function prefersReducedMotion() {
  try {
    return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true;
  } catch {
    return false;
  }
}

// Seconds since the designer came on, about 25 times a second. With reduced
// motion it is one still picture, at a moment when most areas are lit.
export function useLookDesignerClock(active) {
  const [time, setTime] = useState(STILL_SECONDS);
  useEffect(() => {
    if (!active) return undefined;
    if (prefersReducedMotion()) { setTime(STILL_SECONDS); return undefined; }
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

// Touch on the artwork: tap a shape to step its pattern (or, with the drawer
// open, to choose it); drag across shapes to set the order they begin in. It
// sits over the strips only while the designer is on, so with it off every
// click and drag on a strip is exactly what it was.
export function LookDesignerTouch({ svgRef, scale, spaceRef, model, look, selected }) {
  const dragRef = useRef(null);
  const [trail, setTrail] = useState([]);
  const points = model.strips.flatMap(strip => (strip.pixels || [])
    .filter(point => Number.isFinite(point?.x) && Number.isFinite(point?.y))
    .map(point => ({ x: point.x, y: point.y, area: model.areaOfStrip.get(strip.id) ?? -1 })));
  const pointAt = event => {
    const matrix = svgRef.current?.getScreenCTM()?.inverse();
    return matrix ? new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix) : null;
  };
  const areaAt = point => {
    let best = -1;
    let bestDistance = (scale * 26) ** 2;
    for (const led of points) {
      const d = (led.x - point.x) ** 2 + (led.y - point.y) ** 2;
      if (led.area >= 0 && d < bestDistance) { bestDistance = d; best = led.area; }
    }
    return best;
  };
  const ids = model.derived.areas.map(area => area.id);
  const nameOf = (index, names) => names?.[ids[index]] || model.names[index];
  const say = text => setLookDesigner({ say: text });
  const begin = event => {
    if (spaceRef?.current || event.button > 0) return;
    const point = pointAt(event);
    if (!point) return;
    event.stopPropagation();
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const area = areaAt(point);
    dragRef.current = { path: area >= 0 ? [area] : [], trail: [point] };
    setTrail([point]);
  };
  const move = event => {
    const drag = dragRef.current;
    if (!drag) return;
    const point = pointAt(event);
    if (!point) return;
    const area = areaAt(point);
    drag.trail.push(point);
    if (area >= 0 && !drag.path.includes(area)) drag.path.push(area);
    setTrail(drag.trail.slice());
  };
  const end = event => {
    const drag = dragRef.current;
    dragRef.current = null;
    setTrail([]);
    if (!drag || event.type === 'pointercancel') return;
    const point = pointAt(event);
    const last = point ? areaAt(point) : -1;
    if (last >= 0 && !drag.path.includes(last)) drag.path.push(last);
    const current = getLookDesigner();
    if (!current.look) return;
    if (drag.path.length === 0) return;
    if (drag.path.length === 1) {
      const id = ids[drag.path[0]];
      if (current.tuneOpen) { setLookDesigner({ selected: id, say: `${nameOf(drag.path[0], current.names)}.` }); return; }
      const next = stepMotion(current.look, id);
      setLookDesigner({ look: next, selected: id, chosen: -1, say: `${nameOf(drag.path[0], current.names)}: ${getMotion(next.areas[id].motion.type).label.toLowerCase()}.` });
      return;
    }
    const order = drag.path.map(index => ids[index]);
    setLookDesigner({
      look: setOrder(current.look, order, ids), chosen: -1,
      say: `${drag.path.map(index => nameOf(index, current.names)).join(', then ')}.`,
    });
  };
  const selectedIndex = selected ? ids.indexOf(selected) : -1;
  return (
    <g className="lw-look-designer" data-testid="look-designer-touch" data-areas={ids.length}
       data-order={ids.map(id => (look.areas[id]?.begins ?? 0).toFixed(2)).join(',')}
       data-motions={ids.map(id => look.areas[id]?.motion?.type).join(',')}>
      {selectedIndex >= 0 && points.filter(led => led.area === selectedIndex).map((led, index) => (
        <circle key={index} cx={led.x} cy={led.y} r={scale * 6} fill="none" stroke="var(--text-hi)" strokeOpacity="0.8"
                strokeWidth={scale * 1.2} pointerEvents="none"/>
      ))}
      <rect data-testid="look-designer-surface" x={-100000} y={-100000} width={200000} height={200000} fill="transparent"
            style={{ touchAction: 'none', cursor: 'pointer' }}
            onPointerDown={begin} onPointerMove={move} onPointerUp={end} onPointerCancel={end}
            onClick={event => event.stopPropagation()} onDoubleClick={event => event.stopPropagation()}/>
      {trail.length > 1 && (
        <polyline points={trail.map(p => `${p.x},${p.y}`).join(' ')} fill="none" stroke="var(--text-hi)" strokeOpacity="0.55"
                  strokeWidth={scale * 3} strokeLinecap="round" strokeLinejoin="round" pointerEvents="none"/>
      )}
    </g>
  );
}
