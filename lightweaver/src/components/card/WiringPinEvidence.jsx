import { isCardTransportConnected } from '../../lib/cardConnectionFlow.js';
import { installedProjectIdFromCardStatus } from '../../lib/cardReadiness.js';
import { formatGpio } from '../../lib/cardPinout.js';
import { STRIP_DISCOVERY_ROUTE } from '../../lib/cardAction.js';
import { measuredStripPorts } from '../../lib/designCapacity.js';
import { isUncountedHeadroomCount } from '../../lib/discoveryCommit.js';
import './wiring-pin-evidence.css';

export const WIRING_DISCOVERY_LINK = `#${STRIP_DISCOVERY_ROUTE}`;

function configuredOutputs(link) {
  const status = link?.readiness;
  if (!isCardTransportConnected(link) || link.requiresStableRevalidation
    || !status?.cardId || status.cardId !== link.card?.id
    || (link.expectedCard?.id && status.cardId !== link.expectedCard.id)
    || !status.bootId || status.bootId !== link.validatedBootId
    || !Array.isArray(status.outputs)) return null;

  const pins = new Set();
  const pinsById = new Map();
  let pixels = 0;
  for (const output of status.outputs) {
    const pin = output?.pin ?? output?.gpio;
    const count = output?.pixels ?? output?.count;
    if (!Number.isInteger(pin) || pin < 0 || pins.has(pin)
      || !Number.isInteger(count) || count <= 0) return null;
    pins.add(pin);
    if (typeof output.id === 'string' && output.id) {
      pinsById.set(output.id, pinsById.has(output.id) ? null : pin);
    }
    pixels += count;
  }
  const requested = status.led?.pixels ?? status.requestedPixels ?? status.capacity?.requestedPixels;
  if (Number.isInteger(requested) && pixels !== requested) return null;
  return { pins, pinsById };
}

export function wiringPinEvidence({ wiring, compiledWiring, portRoles, cardLink, projectId, origin }) {
  const planned = (wiring?.outputs || []).filter(output => Number.isInteger(output.pin) && output.pin >= 0);
  const plannedPins = new Set(planned.map(output => output.pin));
  // A partial card copy can populate saved roles and the wiring flag from
  // configuration alone. Those fields cannot prove a physical observation.
  const countHistoryUnknown = origin?.kind === 'card-partial';
  const counted = countHistoryUnknown ? []
    : measuredStripPorts(portRoles).filter(port => !isUncountedHeadroomCount(port.pixelCount));
  const countedByPin = new Map(counted.map(port => [port.pin, port.pixelCount]));
  const configured = configuredOutputs(cardLink);
  const livePins = configured?.pins ?? null;
  const plannedCounts = new Map(compiledWiring.outputs.map(output => [output.id, output.pixels]));
  const outsidePlan = pin => !plannedPins.has(pin);
  const countedPins = [...countedByPin.keys()];
  const sameProject = Boolean(projectId) && installedProjectIdFromCardStatus(cardLink?.readiness) === projectId;
  const configuredOutsidePlan = sameProject && livePins ? [...livePins].filter(outsidePlan) : [];

  const mismatches = planned.flatMap(output => {
    const lastCount = countedByPin.get(output.pin);
    const plannedCount = plannedCounts.get(output.id);
    const missingCount = counted.length > 0 && lastCount === undefined;
    const countDiffers = lastCount !== undefined && plannedCount !== undefined && lastCount !== plannedCount;
    // A card output ID can identify a slot only for the same project. A
    // historical count is attached to its exact GPIO and never to an ID or row.
    const configuredPin = sameProject ? configured?.pinsById.get(output.id) : null;
    const pinDiffers = configuredPin != null && configuredPin !== output.pin;
    const missingConfig = sameProject && livePins !== null && !livePins.has(output.pin);
    if (!missingCount && !countDiffers && !pinDiffers && !missingConfig) return [];
    return [{
      id: output.id,
      name: output.name,
      pin: output.pin,
      countNote: countDiffers ? `Design: ${plannedCount} LEDs · Last counted: ${lastCount} LEDs`
        : missingCount ? 'No count recorded for this pin' : '',
      configuredNote: pinDiffers ? `Card config: ${formatGpio(configuredPin)}`
        : missingConfig ? 'Pin absent from card configuration' : '',
    }];
  });

  return {
    plannedPins,
    countedPins,
    livePins,
    countHistoryUnknown,
    lastCount: counted.reduce((sum, port) => sum + port.pixelCount, 0),
    hasMismatch: mismatches.length > 0 || countedPins.some(outsidePlan) || configuredOutsidePlan.length > 0,
    mismatches,
    replaceSlots: configuredOutsidePlan,
    wiringCheck: countHistoryUnknown ? 'Unknown' : wiring?.verified === true ? 'Verified in design' : 'Unverified',
  };
}

function PinList({ pins, fallback }) {
  const values = pins ? [...pins] : [];
  return values.length ? formatGpio(values.join(', ')) : fallback;
}

export function WiringPinEvidence({ evidence, children }) {
  const { plannedPins, countedPins, livePins, mismatches, wiringCheck, countHistoryUnknown } = evidence;
  return (
    <div className="wiring-pin-evidence" data-testid="wiring-pin-evidence">
      <dl className="wiring-pin-facts">
        <div><dt>Planned pins</dt><dd data-testid="planned-pins"><PinList pins={plannedPins} fallback="No outputs planned" /></dd></div>
        <div><dt>Last counted pins</dt><dd data-testid="last-counted-pins"><PinList pins={countedPins} fallback={countHistoryUnknown ? 'Unknown' : 'No count recorded'} /></dd></div>
        <div><dt>Card-configured pins</dt><dd data-testid="card-configured-pins"><PinList pins={livePins} fallback={livePins ? 'No outputs configured' : 'Unknown'} /></dd></div>
        <div><dt>Wiring check</dt><dd>{evidence.hasMismatch ? 'Re-test planned wiring' : wiringCheck}</dd></div>
      </dl>
      {children}
      {mismatches.length > 0 && (
        <ul className="wiring-pin-mismatches" aria-label="Outputs to re-test">
          {mismatches.map(output => (
            <li key={output.id} data-testid={`pin-mismatch-${output.id}`}>
              <strong>{output.name} · {formatGpio(output.pin)}</strong>
              {output.countNote && <span>{output.countNote}</span>}
              {output.configuredNote && <span>{output.configuredNote}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function WiringReplacementLinks({ slots }) {
  return slots.map(pin => (
    <a key={pin} className="btn" href={`${WIRING_DISCOVERY_LINK}&replace=${pin}`}>Replace {formatGpio(pin)}</a>
  ));
}
