const DEFAULT_COLORS = Object.freeze(['#f2a65a', '#6d4cc7', '#3478c9']);
const DEFAULT_HOLD_MS = 30_000;
const DEFAULT_FADE_MS = 90_000;
const MIN_STOPS = 2;
const MAX_STOPS = 8;

function bounded(value, minimum, maximum, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(maximum, Math.max(minimum, number));
}

function normalizedHex(value, fallback) {
  const source = String(value || '').trim().toLowerCase();
  const short = source.match(/^#([0-9a-f]{3})$/i);
  if (short) return `#${short[1].split('').map(character => character.repeat(2)).join('')}`;
  return /^#[0-9a-f]{6}$/i.test(source) ? source : fallback;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeStop(stop, index) {
  const source = stop && typeof stop === 'object' && !Array.isArray(stop) ? stop : {};
  return {
    ...source,
    id: String(source.id || `color-${index + 1}`).trim() || `color-${index + 1}`,
    color: normalizedHex(source.color, DEFAULT_COLORS[index % DEFAULT_COLORS.length]),
    holdMs: Math.round(bounded(source.holdMs, 0, 600_000, DEFAULT_HOLD_MS)),
    fadeMs: Math.round(bounded(source.fadeMs, 1_000, 600_000, DEFAULT_FADE_MS)),
    ...(source.locked ? { locked: true } : {}),
  };
}

export function normalizeColorJourney(input = {}) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? clone(input) : {};
  let stops = Array.isArray(source.stops) ? source.stops.slice(0, MAX_STOPS) : [];
  if (stops.length < MIN_STOPS) {
    stops = DEFAULT_COLORS.map((color, index) => ({
      id: `color-${index + 1}`,
      color,
      holdMs: DEFAULT_HOLD_MS,
      fadeMs: DEFAULT_FADE_MS,
    }));
  }
  return {
    ...source,
    version: 1,
    stops: stops.map(normalizeStop),
    easing: source.easing === 'linear' ? 'linear' : 'smooth',
    loop: source.loop === undefined ? true : Boolean(source.loop),
    motionSpeedSeconds: bounded(source.motionSpeedSeconds, 4, 90, 18),
    character: ['restrained', 'balanced', 'expressive'].includes(source.character)
      ? source.character
      : 'balanced',
  };
}

export function createSlowColorDriftJourney(overrides = {}) {
  return normalizeColorJourney({
    version: 1,
    stops: DEFAULT_COLORS.map((color, index) => ({
      id: ['warm-amber', 'deep-violet', 'clear-blue'][index],
      color,
      holdMs: DEFAULT_HOLD_MS,
      fadeMs: DEFAULT_FADE_MS,
    })),
    easing: 'smooth',
    loop: true,
    motionSpeedSeconds: 18,
    character: 'balanced',
    ...overrides,
  });
}

function rgbFromHex(hex) {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function eased(progress, easing) {
  const amount = Math.min(1, Math.max(0, progress));
  return easing === 'linear' ? amount : amount * amount * (3 - 2 * amount);
}

function mixedRgb(first, second, amount) {
  return first.map((channel, index) => Math.round(channel + (second[index] - channel) * amount));
}

export function sampleColorJourney(input, elapsedMs = 0) {
  const journey = normalizeColorJourney(input);
  const durationMs = journey.stops.reduce((total, stop, index) => (
    total + stop.holdMs + (journey.loop || index < journey.stops.length - 1 ? stop.fadeMs : 0)
  ), 0);
  const rawElapsed = Math.max(0, Number.isFinite(Number(elapsedMs)) ? Number(elapsedMs) : 0);
  const time = journey.loop
    ? ((rawElapsed % durationMs) + durationMs) % durationMs
    : Math.min(rawElapsed, durationMs);
  let cursor = 0;
  for (let index = 0; index < journey.stops.length; index += 1) {
    const stop = journey.stops[index];
    const next = journey.stops[(index + 1) % journey.stops.length];
    const holdEnd = cursor + stop.holdMs;
    const fadeEnd = holdEnd + stop.fadeMs;
    if (!journey.loop && index === journey.stops.length - 1) {
      return {
        rgb: rgbFromHex(stop.color),
        segmentIndex: index,
        segmentProgress: 1,
        loopProgress: Math.min(1, time / durationMs),
        durationMs,
      };
    }
    if (time < holdEnd) {
      return {
        rgb: rgbFromHex(stop.color),
        segmentIndex: index,
        segmentProgress: 0,
        loopProgress: time / durationMs,
        durationMs,
      };
    }
    if (time < fadeEnd || index === journey.stops.length - 1) {
      const progress = (time - holdEnd) / stop.fadeMs;
      return {
        rgb: mixedRgb(rgbFromHex(stop.color), rgbFromHex(next.color), eased(progress, journey.easing)),
        segmentIndex: index,
        segmentProgress: Math.min(1, Math.max(0, progress)),
        loopProgress: time / durationMs,
        durationMs,
      };
    }
    cursor = fadeEnd;
  }
  return {
    rgb: rgbFromHex(journey.stops[0].color),
    segmentIndex: 0,
    segmentProgress: 0,
    loopProgress: 0,
    durationMs,
  };
}

function hash(seed, salt) {
  let value = (Math.trunc(Number(seed) || 1) ^ Math.imul(salt + 1, 0x9e3779b1)) >>> 0;
  value ^= value >>> 16;
  value = Math.imul(value, 0x7feb352d);
  value ^= value >>> 15;
  return (value >>> 0) / 0x100000000;
}

function rotateHue(hex, degrees) {
  const [r, g, b] = rgbFromHex(hex).map(channel => channel / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  const lightness = (max + min) / 2;
  if (delta === 0) return hex;
  const saturation = delta / (1 - Math.abs(2 * lightness - 1));
  let hue = max === r ? 60 * (((g - b) / delta) % 6)
    : max === g ? 60 * ((b - r) / delta + 2)
      : 60 * ((r - g) / delta + 4);
  hue = ((hue + degrees) % 360 + 360) % 360;
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const x = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
  const [r0, g0, b0] = hue < 60 ? [chroma, x, 0]
    : hue < 120 ? [x, chroma, 0]
      : hue < 180 ? [0, chroma, x]
        : hue < 240 ? [0, x, chroma]
          : hue < 300 ? [x, 0, chroma]
            : [chroma, 0, x];
  const match = lightness - chroma / 2;
  return `#${[r0, g0, b0].map(channel => Math.round((channel + match) * 255).toString(16).padStart(2, '0')).join('')}`;
}

function variedJourney(recipe, kind, index) {
  const source = normalizeColorJourney(recipe?.journey);
  const seed = Number(recipe?.seed) || 1;
  if (kind === 'soft') {
    return normalizeColorJourney({
      ...source,
      character: 'restrained',
      motionSpeedSeconds: Math.min(90, source.motionSpeedSeconds * 1.35),
    });
  }
  if (kind === 'color') {
    const degrees = Math.round(12 + hash(seed, index) * 18);
    return normalizeColorJourney({
      ...source,
      stops: source.stops.map(stop => stop.locked ? stop : { ...stop, color: rotateHue(stop.color, degrees) }),
    });
  }
  return normalizeColorJourney({
    ...source,
    character: 'expressive',
    motionSpeedSeconds: Math.max(4, source.motionSpeedSeconds * .72),
  });
}

export function createColorJourneyVariations(recipe) {
  const variants = [
    ['soft', 'Same colors, softer movement'],
    ['color', 'A related color path, same gentle pace'],
    ['lively', 'Same colors, a little more movement'],
  ];
  return variants.map(([kind, explanation], index) => ({
    id: `variation-${kind}-${(Number(recipe?.seed) || 1) >>> 0}`,
    explanation,
    journey: variedJourney(recipe, kind, index),
  }));
}

export function applyColorJourneyVariation(recipe, candidate) {
  const journey = normalizeColorJourney(candidate?.journey);
  return {
    ...clone(recipe),
    journey,
    palette: journey.stops.map(stop => stop.color),
  };
}
