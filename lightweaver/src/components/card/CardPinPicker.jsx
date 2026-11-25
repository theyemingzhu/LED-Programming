import { useEffect, useState } from 'react';
import { CARD_HEADER_ROWS } from '../../lib/cardPinout.js';
import '../../styles/lw-pinpicker.css';

// The card drawing as the way to choose where a strip plugs in (Find my
// strips, combined flow 2026-11-23). Pins the card can light are buttons;
// every other pin is drawn dim and cannot be pressed, which replaces the old
// "not set up to drive this pin" notice. On a phone the card stands upright so
// each pin row is tall enough for a finger.
//
// `pickable`  pins that can be pressed.
// `lit`       the pin lit right now (a steady fill).
// `pulse`     the pin the card is lighting in its sweep (blinks).
// `labels`    print the board's pin labels. Off while Studio already knows
//             which pin is lit: the owner looks at the strip, not at numbers.
// `ground`    outline the ground pins (the "nothing lit" check).
function useNarrow(query = '(max-width: 640px)') {
  const read = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    && window.matchMedia(query).matches;
  const [narrow, setNarrow] = useState(read);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined;
    const list = window.matchMedia(query);
    const update = () => setNarrow(list.matches);
    list.addEventListener?.('change', update);
    return () => list.removeEventListener?.('change', update);
  }, [query]);
  return narrow;
}

export function CardPinPicker({
  pickable = [],
  lit = null,
  pulse = null,
  labels = true,
  ground = false,
  onPick = null,
  disabled = false,
  testId = 'card-pin-picker',
  label = 'Card pins',
}) {
  const upright = useNarrow();
  const pickSet = new Set(pickable.map(Number));
  const pitch = upright ? 30 : 26;
  const first = 34;
  const length = CARD_HEADER_ROWS[0].pins.length;
  const span = first * 2 + pitch * (length - 1);
  const width = upright ? 250 : span;
  const height = upright ? span : 176;
  const across = upright ? { J3: 168, J1: 82 } : { J3: 62, J1: 114 };
  const press = pin => { if (!disabled && onPick && pickSet.has(pin)) onPick(pin); };
  return (
    <figure className={`lw-pinpicker${upright ? ' is-upright' : ''}`} data-testid={testId}>
      <svg viewBox={`0 0 ${width} ${height}`} role="group" aria-label={label}>
        <rect className="lw-pinpicker-board" x="4" y="4" width={width - 8} height={height - 8} rx="10" />
        {upright ? (
          <>
            <text className="lw-pinpicker-end" x={width / 2} y="22" textAnchor="middle">antenna</text>
            <text className="lw-pinpicker-end" x={width / 2} y={height - 12} textAnchor="middle">USB</text>
          </>
        ) : (
          <>
            <text className="lw-pinpicker-end" x="18" y={height / 2} transform={`rotate(-90 18 ${height / 2})`} textAnchor="middle">antenna</text>
            <text className="lw-pinpicker-end" x={width - 18} y={height / 2} transform={`rotate(90 ${width - 18} ${height / 2})`} textAnchor="middle">USB</text>
          </>
        )}
        {CARD_HEADER_ROWS.map(row => row.pins.map((pinLabel, index) => {
          const along = first + index * pitch;
          const x = upright ? across[row.id] : along;
          const y = upright ? along : across[row.id];
          const isNumber = typeof pinLabel === 'number';
          const canPick = isNumber && pickSet.has(pinLabel);
          const isLit = isNumber && pinLabel === lit;
          const isPulse = isNumber && pinLabel === pulse;
          const isGround = pinLabel === 'G' && ground;
          const size = canPick || isLit || isPulse ? 18 : 10;
          const classes = ['lw-pinpicker-pin',
            canPick ? 'is-pickable' : 'is-inert',
            isLit ? 'is-lit' : '', isPulse ? 'is-pulse' : '', isGround ? 'is-ground' : ''].filter(Boolean).join(' ');
          const labelX = upright ? (row.id === 'J1' ? x - 26 : x + 26) : x;
          const labelY = upright ? y + 4 : (row.id === 'J3' ? y - 16 : y + 24);
          const showLabel = labels || !isNumber;
          const body = (
            <>
              {canPick && <rect className="lw-pinpicker-hit" x={x - pitch / 2} y={y - pitch / 2} width={pitch} height={pitch} />}
              <rect className="lw-pinpicker-pad" x={x - size / 2} y={y - size / 2} width={size} height={size} rx="3" />
              {showLabel && <text className="lw-pinpicker-label" x={labelX} y={labelY} textAnchor="middle">{pinLabel}</text>}
            </>
          );
          if (!canPick) return <g key={`${row.id}-${index}`} className={classes} data-pin={pinLabel}>{body}</g>;
          return (
            <g
              key={`${row.id}-${index}`}
              className={classes}
              data-pin={pinLabel}
              data-testid={`discovery-probe-${pinLabel}`}
              role="button"
              tabIndex={disabled ? -1 : 0}
              aria-label={`Pin ${pinLabel}`}
              aria-pressed={isLit}
              aria-disabled={disabled || undefined}
              onClick={() => press(pinLabel)}
              onKeyDown={event => {
                if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); press(pinLabel); }
              }}
            >{body}</g>
          );
        }))}
      </svg>
    </figure>
  );
}

export default CardPinPicker;
