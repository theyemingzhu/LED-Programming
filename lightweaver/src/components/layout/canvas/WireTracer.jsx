import { useEffect, useState } from 'react';

const LAST_LED_HOLD_MS = 450;
const TAIL_LEDS = 7;

export function WireTracer({ pixels, scale, onComplete }) {
  const [position, setPosition] = useState(0);
  useEffect(() => {
    const last = pixels.length - 1;
    const travelMs = last > 0 ? Math.max(1500, Math.min(12000, last * 30)) : 0;
    let frame;
    const startedAt = performance.now();
    const advance = now => {
      const elapsed = Math.max(0, now - startedAt);
      if (elapsed >= travelMs + LAST_LED_HOLD_MS) {
        onComplete();
        return;
      }
      setPosition(elapsed >= travelMs ? last : Math.floor(elapsed * last / travelMs));
      frame = requestAnimationFrame(advance);
    };
    frame = requestAnimationFrame(advance);
    return () => cancelAnimationFrame(frame);
  }, [pixels, onComplete]);

  const head = pixels[position];
  const tail = pixels.slice(Math.max(0, position - TAIL_LEDS), position + 1)
    .filter(pixel => pixel.outputId === head.outputId);
  return (
    <g pointerEvents="none" aria-hidden="true">
      {tail.length > 1 && <polyline points={tail.map(pixel => `${pixel.x},${pixel.y}`).join(' ')}
        fill="none" stroke="var(--accent-hi)" strokeOpacity={0.72}
        strokeWidth={scale * 2.5} strokeLinejoin="round" strokeLinecap="round"/>}
      <circle cx={head.x} cy={head.y} r={scale * 8} fill="var(--bg-canvas)"
        stroke="var(--accent-hi)" strokeWidth={scale * 2}
        data-testid="wire-tracer-head" data-address={head.index} data-strip-id={head.stripId}
        data-output-id={head.outputId} data-source-led={head.sourceLed}/>
      <circle cx={head.x} cy={head.y} r={scale * 3.5} fill="var(--text-hi)"/>
    </g>
  );
}
