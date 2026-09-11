import { CARD_HARDWARE_CONTRACT } from './cardHardwareContract.js';

export const CARD_CONFIG_STORAGE_LIMIT_BYTES = CARD_HARDWARE_CONTRACT.configCapacityBytes;

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

  if (Array.isArray(config.kaleidoscopeMappings)) {
    config.kaleidoscopeMappings = config.kaleidoscopeMappings.map(compactKaleidoscopeMapping);
  }

  return config;
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
