import { CARD_HEADER_ROWS, describeCardPinPlace, describeCardPinRole, formatGpio } from '../../lib/cardPinout.js';
import { boardTitle } from '../../lib/boardProfiles.js';
import { confirmedBoardProfile } from '../../lib/boardLedPins.js';
import { CARD_HARDWARE_CONTRACT } from '../../lib/cardHardwareContract.js';
import { DEFAULT_CARD_CONTROLS } from '../../lib/cardRuntimeContract.js';
import { activeBoardGpios, BOARD_CONTROL_FIELDS } from '../../lib/gpioAssignments.js';
import { BoardDrawing } from './BoardDrawing.jsx';
import '../../styles/lw-pinmap.css';

const defaultHeaders = [...CARD_HEADER_ROWS].reverse().map(row => ({
  name: row.id, start: 1, step: 1,
  pins: row.pins.map(label => ({ label, gpio: Number.isInteger(label) ? label : null })),
}));
const controlLabels = new Map(BOARD_CONTROL_FIELDS.map(field => [`control:${field.key}`, field.label]));

function HeaderPin({ pin, side, marker, role, onPick, disabled }) {
  if (!pin) return <div />;
  const style = marker?.color ? { borderColor: marker.color, background: marker.color } : undefined;
  return (
    <div className={`lw-pinmap-pin lw-pinmap-pin-${side} is-${role.kind}${marker ? ' is-lit' : ''}`} data-pin={pin.gpio ?? pin.label}>
      <span className="lw-pinmap-role">
        {marker?.tag && <strong>Port {marker.tag} · </strong>}
        {role.label}
      </span>
      {onPick ? (
        <button type="button" className="lw-pinmap-pad lw-pinmap-pick" style={style}
          data-testid={`discovery-probe-${pin.gpio}`} aria-label={`Pin ${pin.label}`}
          aria-pressed={Boolean(marker)} disabled={disabled} onClick={() => onPick(pin.gpio)}>{pin.label}</button>
      ) : <span className="lw-pinmap-pad" style={style}>{pin.label}</span>}
    </div>
  );
}

export function CardPinMap({
  lit = [], outputs = [], controls, controlSource = 'Project controls', cardId,
  availablePins = null, outputCapabilities, pickable = [], onPick, disabled,
  title = 'Where it plugs in', testId = 'card-pin-map',
}) {
  const profile = confirmedBoardProfile(cardId);
  const headers = profile ? profile.groups.filter(group => group.kind === 'header') : defaultHeaders;
  const devkit = !profile || profile.id.startsWith('espressif-devkitc-1-');
  const litEntries = lit.map(entry => ({ ...entry, pin: Number(entry?.pin ?? NaN) }))
    .filter(entry => Number.isInteger(entry.pin));
  const litPins = new Map(litEntries.map(entry => [entry.pin, entry]));
  const outputPins = new Map(outputs.map(entry => [Number(entry.pin ?? entry.gpio), entry]));
  const controlPins = new Map(activeBoardGpios([], controls ?? DEFAULT_CARD_CONTROLS)
    .map(({ owner, pin }) => [pin, controlLabels.get(owner)]));
  const roles = {
    controls: controlPins, outputs: outputPins,
    supportedPins: outputCapabilities?.outputPins ?? CARD_HARDWARE_CONTRACT.outputPins, availablePins,
  };
  const roleFor = pin => pin && describeCardPinRole(pin.gpio ?? pin.label, {
    ...roles, profilePin: profile ? pin : null, profile,
  });
  const placeFor = gpio => {
    if (!profile) return describeCardPinPlace(gpio);
    for (const header of headers) {
      const index = header.pins.findIndex(pin => pin.gpio === gpio);
      if (index >= 0) return `${formatGpio(gpio)} · ${header.name}, position ${header.start + index * header.step}`;
    }
    return `${formatGpio(gpio)} · No header position recorded for this profile.`;
  };
  const pairs = headers.filter((_, index) => index % 2 === 0).map((header, index) => [header, headers[index * 2 + 1]]);

  return (
    <figure className="lw-pinmap" data-testid={testId}>
      <figcaption className="lw-pinmap-title">
        <strong>{title}</strong><span>{controls ? controlSource : 'Default controls'}</span>
      </figcaption>
      {profile && <p className="lw-pinmap-profile">{boardTitle(profile)}{profile.orientation && ` · ${profile.orientation}`}</p>}
      {!pairs.length && <p className="lw-pinmap-profile">This profile has no header positions.</p>}
      {pairs.map(([left, right]) => (
        <div className={`lw-pinmap-board${devkit ? ' lw-pinmap-with-art' : ''}`} key={left.name}>
          {devkit && <BoardDrawing chip="ESP32-S3" antenna />}
          <div className="lw-pinmap-end">{left.name}{devkit && ' · Antenna'}{right && ` · ${right.name}`}</div>
          {Array.from({ length: Math.max(left.pins.length, right?.pins.length ?? 0) }, (_, index) => {
            const leftPin = left.pins[index];
            const rightPin = right?.pins[index];
            return (
              <div className="lw-pinmap-row" key={index}>
                <HeaderPin pin={leftPin} side="left" marker={litPins.get(leftPin?.gpio)} role={roleFor(leftPin)}
                  onPick={pickable.includes(leftPin?.gpio) ? onPick : undefined} disabled={disabled}/>
                <HeaderPin pin={rightPin} side="right" marker={litPins.get(rightPin?.gpio)} role={roleFor(rightPin)}
                  onPick={pickable.includes(rightPin?.gpio) ? onPick : undefined} disabled={disabled}/>
              </div>
            );
          })}
          {devkit && <div className="lw-pinmap-end">USB</div>}
        </div>
      ))}
      <div className="lw-pinmap-text">
        {litEntries.map(entry => (
          <p key={entry.pin} data-testid={`${testId}-place-${entry.pin}`}>
            {entry.name ? <strong>{entry.name} · </strong> : null}{placeFor(entry.pin)}
          </p>
        ))}
        <p>Match the pin label on your card. Share ground with the LED supply.</p>
      </div>
    </figure>
  );
}
