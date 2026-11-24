import { CARD_HARDWARE_CONTRACT } from './cardHardwareContract.js';

export const CARD_CONFIG_STORAGE_LIMIT_BYTES = CARD_HARDWARE_CONTRACT.configCapacityBytes;

// What the card fills in for itself when a field is missing from the body.
// Each value is pinned to the firmware source by cardBodyDefaults.test.js, so
// a firmware change that moves one fails there instead of silently changing
// what a shorter body means.
export const CARD_FIRMWARE_DEFAULTS = Object.freeze({
  mode: 'website-flash',
  led: Object.freeze({
    colorOrder: 'RGB',
    outputGammaEnabled: false,
    outputGammaValue: 2.2,
    calibration: Object.freeze({ red: 1, green: 1, blue: 1 }),
  }),
  controls: Object.freeze({
    encoder: Object.freeze({
      a: 4, b: 5, press: 0, alternatePress: 6, rotateDirection: 'clockwise-brighter', brightnessStep: 18,
    }),
    previous: 7, next: 8, blackout: 9, brightness: -1, statusLed: 2,
  }),
});

export class CardConfigCapacityError extends Error {
  constructor(bytes, maxBytes) {
    super(
      `Card configuration is ${bytes} bytes, exceeding the ${maxBytes}-byte flash storage limit. ` +
      'Reduce playlist looks, combo zones, or Kaleidoscope reflection points, then try again.',
    );
    this.name = 'CardConfigCapacityError';
    this.reason = 'config-too-large';
    this.bytes = bytes;
    this.maxBytes = maxBytes;
  }
}

export function compactCardStorageConfig(runtimePackageOrConfig = {}) {
  const source = runtimePackageOrConfig?.format === 'lightweaver-card-runtime-package' &&
    isObject(runtimePackageOrConfig?.config)
    ? runtimePackageOrConfig.config
    : runtimePackageOrConfig;
  const config = cloneValue(isObject(source) ? source : {});

  if (Array.isArray(config.looks) && config.looks.length > 0) {
    delete config.patterns;
    config.looks = config.looks.map(look => compactLook(look, config.mode));
  }

  if (Array.isArray(config.zones)) {
    config.zones = config.zones.map(compactZone);
  }

  if (isObject(config.controls?.encoder)) {
    delete config.controls.encoder.patternCycleIds;
  }

  omitFirmwareDefaults(config);

  if (Array.isArray(config.kaleidoscopeMappings)) {
    config.kaleidoscopeMappings = config.kaleidoscopeMappings.map(compactKaleidoscopeMapping);
  }

  return config;
}

function dropEqual(object, defaults) {
  if (!isObject(object)) return;
  for (const [field, value] of Object.entries(defaults)) {
    if (!isObject(value) && object[field] === value) delete object[field];
  }
}

// The card reads a missing field as the default, so leaving it out changes
// nothing it plays. kept on purpose: led.type, led.colorOrder and led.maxMilliamps (bound into
// the wiring digest and the "explicit current limit" status), and `mode` when
// it is anything but the default (an sd-sequence config is a different file).
function omitFirmwareDefaults(config) {
  const defaults = CARD_FIRMWARE_DEFAULTS;
  if (config.mode === defaults.mode) delete config.mode;

  if (isObject(config.led)) {
    // colorOrder stays: Studio binds it into the wiring digest, and a body
    // without it no longer matches the digest it was prepared with (the
    // install is refused with "wiring-identity-mismatch").
    const { colorOrder, ...ledDefaults } = defaults.led;
    dropEqual(config.led, ledDefaults);
    const calibration = config.led.calibration;
    if (isObject(calibration) && Object.keys(defaults.led.calibration)
      .every(channel => calibration[channel] === defaults.led.calibration[channel])
      && Object.keys(calibration).length === Object.keys(defaults.led.calibration).length) {
      delete config.led.calibration;
    }
  }

  if (isObject(config.controls)) {
    dropEqual(config.controls, defaults.controls);
    if (isObject(config.controls.encoder)) {
      dropEqual(config.controls.encoder, defaults.controls.encoder);
      if (Object.keys(config.controls.encoder).length === 0) delete config.controls.encoder;
    }
    if (Object.keys(config.controls).length === 0) delete config.controls;
  }

  // A look section label the card would show anyway: the label of the live
  // section with the same id. The card only echoes look section labels back
  // (nothing plays from them), and adoption never reads them.
  const liveLabels = new Map((Array.isArray(config.zones) ? config.zones : [])
    .filter(zone => isObject(zone) && typeof zone.id === 'string')
    .map(zone => [zone.id, zone.label]));
  for (const look of Array.isArray(config.looks) ? config.looks : []) {
    for (const zone of Array.isArray(look?.zones) ? look.zones : []) {
      if (isObject(zone) && liveLabels.has(zone.id) && zone.label === liveLabels.get(zone.id)) delete zone.label;
    }
  }
}

function compactKaleidoscopeMapping(mapping) {
  if (!isObject(mapping)) return cloneValue(mapping);
  return {
    id: cloneValue(mapping.id),
    zoneId: cloneValue(mapping.zoneId),
    pixelCount: cloneValue(mapping.pixelCount),
    pointCount: cloneValue(mapping.pointCount),
    startLed: cloneValue(mapping.startLed),
    offsets: cloneValue(mapping.offsets),
    spans: cloneValue(mapping.spans),
  };
}

export function prepareCardStoragePayload(
  runtimePackageOrConfig = {},
  { maxBytes = CARD_CONFIG_STORAGE_LIMIT_BYTES } = {},
) {
  const config = compactCardStorageConfig(runtimePackageOrConfig);
  const json = JSON.stringify(config);
  const bytes = new TextEncoder().encode(json).byteLength;

  if (bytes > maxBytes) {
    throw new CardConfigCapacityError(bytes, maxBytes);
  }

  return { config, json, bytes };
}

function compactLook(look, configMode) {
  if (!isObject(look)) return cloneValue(look);
  const compact = cloneValue(look);

  if (compact.fps === 24) delete compact.fps;
  if (compact.loop === true) delete compact.loop;
  if (compact.fadeOutMs === 320) delete compact.fadeOutMs;
  if (compact.fadeInMs === 420) delete compact.fadeInMs;
  if (compact.brightness === 0.65) delete compact.brightness;
  if (compact.preset === compact.id) delete compact.preset;
  if (compact.mode === 'procedural' && configMode !== 'sd-sequence') delete compact.mode;
  if (Array.isArray(compact.zones)) compact.zones = compact.zones.map(compactZone);

  return compact;
}

function compactZone(zone) {
  if (!isObject(zone)) return cloneValue(zone);
  const compact = cloneValue(zone);
  const defaults = {
    brightness: 1,
    speed: 1,
    hueShift: 0,
    customHue: 32,
    customSaturation: 230,
    customBreathe: false,
    breatheLowerPct: 85,
    breatheUpperPct: 100,
    breatheCycleSeconds: 9,
    customDrift: false,
    blackout: false,
  };

  for (const [field, defaultValue] of Object.entries(defaults)) {
    if (compact[field] === defaultValue) delete compact[field];
  }

  return compact;
}

function cloneValue(value) {
  if (Array.isArray(value)) return value.map(cloneValue);
  if (!isObject(value)) return value;
  return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, cloneValue(nested)]));
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

// Room on the card, measured the way Install measures it: the compacted
// config's byte size against the flash limit, and roughly how many more
// sections would fit, estimated by serialising one more zone shaped like the
// largest one already there. The estimate never exceeds the card's zone cap.
// Nothing is thrown: a config already over the limit reports negative room.
export function cardStorageRoom(runtimePackageOrConfig = {}, { maxBytes = CARD_CONFIG_STORAGE_LIMIT_BYTES } = {}) {
  const config = compactCardStorageConfig(runtimePackageOrConfig);
  const measure = value => new TextEncoder().encode(JSON.stringify(value)).byteLength;
  const bytes = measure(config);
  const remaining = maxBytes - bytes;
  const zones = Array.isArray(config.zones) ? config.zones : [];
  const zoneCap = CARD_HARDWARE_CONTRACT.maxZones;
  let sectionsLeft = Math.max(0, zoneCap - zones.length);
  if (zones.length && remaining > 0) {
    const largest = zones.reduce((best, zone) => (measure(zone) > measure(best) ? zone : best), zones[0]);
    const probe = { ...config, zones: [...zones, { ...cloneValue(largest), id: `${largest.id || 'zone'}-x` }] };
    const perZone = Math.max(1, measure(probe) - bytes);
    sectionsLeft = Math.min(sectionsLeft, Math.floor(remaining / perZone));
  } else if (remaining <= 0) {
    sectionsLeft = 0;
  }
  return { bytes, limit: maxBytes, remaining, zoneCount: zones.length, zoneCap, sectionsLeft };
}

export function cardStorageRoomLine(room) {
  if (!room) return '';
  const fmt = value => Number(value).toLocaleString('en-US');
  if (room.remaining < 0) return `Over the card's room by ${fmt(-room.remaining)} bytes; remove a look or a section`;
  const sections = room.sectionsLeft === 0
    ? 'no room for another section'
    : `about ${fmt(room.sectionsLeft)} more section${room.sectionsLeft === 1 ? '' : 's'}`;
  return `Room on card: ${fmt(room.bytes)} of ${fmt(room.limit)} bytes, ${sections}`;
}
