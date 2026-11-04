import { CARD_HEADER_ROWS, cardPinNotes, describeCardPinPlace } from '../../lib/cardPinout.js';
import { CARD_CONNECTOR_PINS } from '../../lib/wiringModel.js';
import '../../styles/lw-pinmap.css';

// A drawing of the card lying on its side, antenna at the left and USB at the
// right, with both pin rows in board order. A pin picker that only says
// "GPIO 18" leaves an owner with the strip in one hand hunting for 18; this
// lights the place itself. Pin labels match the board's own printing.
const PITCH = 19;
const FIRST_PIN_X = 40;
const ROW_Y = { J3: 46, J1: 104 };
const WIDTH = FIRST_PIN_X * 2 + PITCH * 21;

function pinClass(label, litPins, connector) {
  if (typeof label !== 'number') return label === 'G' ? 'is-ground' : 'is-power';
  if (litPins.has(label)) return 'is-lit';
  if (connector.has(label)) return 'is-connector';
  return '';
}

// `lit` is [{ pin, tag?, name?, color? }]: tag is the short mark drawn beside
// the pin (a port number), name prefixes its sentence under the drawing, and
// color fills the pin with the colour the card is showing on it right now.
export function CardPinMap({ lit = [], showConnector = true, title = 'Where it plugs in', testId = 'card-pin-map' }) {
  const litEntries = lit.filter(entry => Number.isInteger(Number(entry?.pin)));
  const litPins = new Map(litEntries.map(entry => [Number(entry.pin), entry]));
  const connector = new Set(showConnector ? CARD_CONNECTOR_PINS : []);
  const notes = cardPinNotes([...litPins.keys()]);
  // Port numbers sit outside the board; without any, the drawing drops that margin.
  const hasTags = litEntries.some(entry => entry.tag);
  return (
    <figure className="lw-pinmap" data-testid={testId}>
      <figcaption className="lw-pinmap-title">{title}</figcaption>
      <svg viewBox={hasTags ? `0 0 ${WIDTH} 150` : `0 22 ${WIDTH} 106`} role="img" aria-label={litEntries.length
        ? `Card pin rows with ${litEntries.map(entry => `GPIO ${entry.pin}`).join(', ')} marked`
        : 'Card pin rows'}>
        <rect className="lw-pinmap-board" x="6" y="28" width={WIDTH - 12} height="94" rx="6"/>
        <text className="lw-pinmap-end" x="18" y="75" transform="rotate(-90 18 75)" textAnchor="middle">antenna</text>
        <text className="lw-pinmap-end" x={WIDTH - 18} y="75" transform={`rotate(90 ${WIDTH - 18} 75)`} textAnchor="middle">USB</text>
        {CARD_HEADER_ROWS.map(row => row.pins.map((label, index) => {
          const x = FIRST_PIN_X + index * PITCH;
          const y = ROW_Y[row.id];
          const top = row.id === 'J3';
          const entry = typeof label === 'number' ? litPins.get(label) : null;
          return (
            <g key={`${row.id}-${index}`} className={`lw-pinmap-pin ${pinClass(label, litPins, connector)}`} data-pin={label}>
              <rect x={x - 5} y={y - 5} width="10" height="10" rx="2" style={entry?.color ? { fill: entry.color, stroke: entry.color } : undefined}/>
              <text className="lw-pinmap-label" x={x} y={top ? y + 17 : y - 10} textAnchor="middle">{label}</text>
              {entry?.tag && <text className="lw-pinmap-tag" x={x} y={top ? 18 : 142} textAnchor="middle">{entry.tag}</text>}
            </g>
          );
        }))}
      </svg>
      <div className="lw-pinmap-text">
        {litEntries.map(entry => (
          <p key={entry.pin} data-testid={`${testId}-place-${entry.pin}`}>
            {entry.name ? <strong>{entry.name} · </strong> : null}{describeCardPinPlace(entry.pin)}
          </p>
        ))}
        {notes.map(note => <p key={note} className="lw-pinmap-note">{note}</p>)}
        <p className="lw-pinmap-key">
          {showConnector && 'Outlined: the four main LED pins. '}
          G: join your LED supply&apos;s ground here.
        </p>
      </div>
    </figure>
  );
}
