import { formatGpio } from './cardPinout.js';
import { confirmedBoardProfile, selectBoardLedPins } from './boardLedPins.js';
import manifest from '../../../packages/lightweaver-contract/card-hardware.json' with { type: 'json' };

export const CARD_HARDWARE_CONTRACT = Object.freeze({
  outputPins: Object.freeze([...manifest.outputPins]),
  maxOutputs: manifest.limits.maxOutputs,
  defaultOutputLimit: manifest.limits.defaultOutputLimit ?? 4,
  maxPixels: manifest.limits.maxPixels,
  maxZones: manifest.limits.maxZones,
  maxRangesPerZone: manifest.limits.maxRangesPerZone,
  configCapacityBytes: manifest.limits.configCapacityBytes,
});

// Authoring uses the Studio schema ceiling. A deploy or discovery operation
// uses the connected firmware's ceiling, with the original four-output limit
// for a card that predates capacity reporting.
export function readCardOutputCapabilities(evidence = {}) {
  const topology = evidence?.capabilities?.outputTopology;
  const reportedLimit = evidence?.limits?.outputs ?? evidence?.maxOutputs;
  const maxOutputs = Number.isSafeInteger(reportedLimit) && reportedLimit > 0
    ? Math.min(reportedLimit, CARD_HARDWARE_CONTRACT.maxOutputs)
    : CARD_HARDWARE_CONTRACT.defaultOutputLimit;
  const reportedPins = topology?.version === 1 && Array.isArray(topology.outputPins)
    ? topology.outputPins
    : (Array.isArray(evidence?.outputPins) ? evidence.outputPins : null);
  const outputPins = reportedPins === null ? null : Object.freeze(CARD_HARDWARE_CONTRACT.outputPins
    .filter(pin => reportedPins.includes(pin)));
  return { maxOutputs, outputPins };
}

export function assertCardOutputCapacity(config = {}, evidence = {}) {
  const outputs = (config.config || config)?.led?.outputs;
  if (!Array.isArray(outputs)) return;
  const { maxOutputs, outputPins } = readCardOutputCapabilities(evidence);
  if (outputs.length > maxOutputs) {
    const error = new RangeError(`This design uses ${outputs.length} LED outputs. The card supports up to ${maxOutputs}.`);
    error.reason = 'card-output-capacity';
    error.delivery = 'not-sent';
    throw error;
  }
  const maxPixels = evidence?.limits?.pixels ?? evidence?.maxPixels;
  const pixelCount = outputs.reduce((total, output) => total + Number(output.pixels ?? output.count), 0);
  if (Number.isSafeInteger(maxPixels) && maxPixels > 0 && pixelCount > maxPixels) {
    const error = new RangeError(`This design uses ${pixelCount} LEDs. The card supports up to ${maxPixels}.`);
    error.reason = 'card-pixel-capacity';
    throw error;
  }
  const profile = confirmedBoardProfile(evidence?.cardId ?? evidence?.id);
  const eligiblePins = profile
    ? selectBoardLedPins({ profile, firmwarePins: outputPins ?? CARD_HARDWARE_CONTRACT.outputPins })
    : outputPins;
  const unsupported = eligiblePins && outputs.find(output => !eligiblePins.includes(Number(output.pin ?? output.gpio)));
  if (unsupported) {
    const error = new RangeError(`${formatGpio(unsupported.pin ?? unsupported.gpio)} is unavailable for LED output on this card.`);
    error.reason = 'card-output-pin';
    error.delivery = 'not-sent';
    throw error;
  }
}

// The card drives one chipset for every output: RuntimeConfig carries a single
// `ledType` (LightweaverTypes.h) and main.cpp's addLedsForOrder() branches on
// that one value for every output. validateRuntimeConfigJsonStrict()
// (LightweaverStorage.cpp) rejects any other value outright, so Studio must
// never offer or forward a third option.
export const CARD_LED_TYPES = Object.freeze(['WS2812B', 'WS2815']);

// Reel-facing hints so the owner can match what is printed on the strip.
export const CARD_LED_TYPE_HINTS = Object.freeze({
  WS2812B: '5V strip (also sold as WS2812/NeoPixel)',
  WS2815: '12V strip with a backup data line',
});

export function isCardLedType(value) {
  return CARD_LED_TYPES.includes(value);
}

export function normalizeCardLedType(value, fallback = CARD_LED_TYPES[0]) {
  const upper = String(value ?? '').trim().toUpperCase();
  if (isCardLedType(upper)) return upper;
  return isCardLedType(fallback) ? fallback : CARD_LED_TYPES[0];
}
