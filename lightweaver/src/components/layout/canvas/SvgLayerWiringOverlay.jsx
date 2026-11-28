import './svg-layer-wiring.css';

export function SvgJumperLines({ jumpers, selected }) {
  return <g aria-hidden="true" pointerEvents="none">
    {jumpers.map(({ from, to }) => <line key={`${from.runId}:${to.runId}`}
      className={from.stripId === selected || to.stripId === selected ? 'la-svg-jumper is-selected' : 'la-svg-jumper'}
      data-svg-jumper="" data-from-strip-id={from.stripId} data-to-strip-id={to.stripId}
      x1={from.out.x} y1={from.out.y} x2={to.in.x} y2={to.in.y}
      vectorEffect="non-scaling-stroke"/>)}
  </g>;
}

export function SvgWirePorts({ ports, selected, source, scale, bounds, onPort }) {
  const strips = [...ports.values()];
  const counts = new Map();
  for (const strip of strips) {
    const key = `${strip.layerId}:${strip.outputId}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const focused = ports.get(source || selected);
  const visible = strips.filter(strip => counts.get(`${strip.layerId}:${strip.outputId}`) >= 2
    && (!focused || (focused.layerId === strip.layerId && focused.outputId === strip.outputId)));
  return <g>
    {visible.flatMap(strip => {
      return ['in', 'out'].map(port => {
        const point = strip[port];
        const oppositePort = port === 'in' ? 'out' : 'in';
        // A cut creates two adjacent ports with barely one LED pitch between
        // them. Separate their controls while keeping both on their true ends.
        const nearOpposite = visible.some(other => Math.abs(other[oppositePort].x - point.x) < 36 * scale
          && Math.abs(other[oppositePort].y - point.y) < 25 * scale);
        const isSource = port === 'out' && source === strip.stripId;
        const isTarget = port === 'in' && source && source !== strip.stripId;
        const activate = event => {
          event.stopPropagation();
          onPort(strip.stripId, port);
        };
        const preferredX = nearOpposite ? (port === 'in' ? -22 : 22) : 0;
        const x = Math.max((bounds.x - point.x) / scale + 19,
          Math.min(preferredX, (bounds.x + bounds.w - point.x) / scale - 19));
        const preferredY = nearOpposite && port === 'out' ? -23 : 23;
        const y = Math.max((bounds.y - point.y) / scale + 13,
          Math.min(preferredY, (bounds.y + bounds.h - point.y) / scale - 13));
        return <g key={`${strip.stripId}:${port}`}
          className={`la-svg-wire-port${isSource || isTarget ? ' is-ready' : ''}`}
          data-svg-wire-port={port} data-strip-id={strip.stripId}
          tabIndex="0" role="button" aria-label={`${strip.name} ${port.toUpperCase()}`}
          aria-pressed={port === 'out' ? isSource : undefined}
          transform={`translate(${point.x} ${point.y})`}
          onPointerDown={event => event.stopPropagation()}
          onClick={activate}
          onKeyDown={event => {
            if (event.key === ' ' || event.key === 'Enter') {
              event.preventDefault();
              activate(event);
            }
          }}>
          <g transform={`scale(${scale})`}>
            <path d={`M0 0 L${x} ${y}`} className="la-svg-wire-stem" pointerEvents="none"/>
            <circle r="3" className="la-svg-wire-tip" pointerEvents="none"/>
            <g transform={`translate(${x} ${y})`}>
              <rect x="-18" y="-12" width="36" height="24" rx="4" className="la-svg-wire-chip"/>
              <text dominantBaseline="central" textAnchor="middle" pointerEvents="none">{port.toUpperCase()}</text>
            </g>
          </g>
        </g>;
      });
    })}
  </g>;
}
