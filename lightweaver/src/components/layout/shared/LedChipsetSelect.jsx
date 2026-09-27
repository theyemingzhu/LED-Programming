import { useId } from 'react';
import {
  CARD_LED_TYPES,
  CARD_LED_TYPE_HINTS,
  normalizeCardLedType,
} from '../../../lib/cardHardwareContract.js';

const CHIPSET_VOLTAGE = Object.freeze({ WS2812B: '5V', WS2815: '12V' });

// One chipset per project, not per strip: the card holds a single
// RuntimeConfig.ledType and drives every output with it, and the firmware
// validator accepts only the two entries in CARD_LED_TYPES.
export function LedChipsetSelect({ value, onChange, fallback, groupLabel = 'LED chipset' }) {
  const selected = normalizeCardLedType(value, fallback);
  const hintId = useId();
  return (
    <div className="la-led-chipset" data-testid="led-chipset-control">
      <span className="k">Chipset</span>
      {/* Keep the option concise and expose the selected reel detail as a
          separate, accessible line so it remains readable in narrow panels. */}
      <div className="la-gpio-wrap">
        <select className="la-gpio-select la-chipset-select"
                aria-label={groupLabel}
                aria-describedby={hintId}
                data-testid="led-chipset-select"
                value={selected}
                onChange={event => {
                  const next = normalizeCardLedType(event.target.value, selected);
                  if (next !== selected) onChange(next);
                }}>
          {CARD_LED_TYPES.map(type => (
            <option key={type} value={type} data-testid={`led-chipset-${type}`}>
              {type} · {CHIPSET_VOLTAGE[type]}
            </option>
          ))}
        </select>
      </div>
      <p id={hintId} className="la-chipset-hint" data-testid="led-chipset-hint">
        {CARD_LED_TYPE_HINTS[selected]}
      </p>
    </div>
  );
}
