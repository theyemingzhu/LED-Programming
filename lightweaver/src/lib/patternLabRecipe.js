import { normalizeColorJourney } from './colorJourney.js';

export const PATTERN_LAB_RECIPE_VERSION = 2;
export const PATTERN_LAB_MAX_LAYERS = 3;

export function assertPatternLabLayerCount(layers) {
  if (!Array.isArray(layers)) throw new TypeError('Pattern Lab layers must be an array');
  if (layers.length > PATTERN_LAB_MAX_LAYERS) {
    throw new RangeError(`Pattern Lab supports at most ${PATTERN_LAB_MAX_LAYERS} layers`);
  }
  return layers;
}

const DEFAULT_PALETTE = ['#1a0c05', '#8f3f18', '#f0a04a', '#ffe1a3'];
const DEFAULT_MACROS = { color: 0.5, movement: 0.5, shape: 0.5, texture: 0.5 };
const DEFAULT_PLAYBACK = { brightness: 0.575, speed: 1.125 };
const DEFAULT_DYNAMICS = { dynamicRange: 0.55, rareEventStrength: 0.4 };
const DEFAULT_EVOLUTION = {
  enabled: true,
  character: 'slow-bloom',
  durationSeconds: 600,
  change: 0.35,
  dynamics: DEFAULT_DYNAMICS,
};
let fallbackId = 0;

function clone(value, ancestors = new WeakSet()) {
  if (value && typeof value === 'object') {
    if (ancestors.has(value)) throw new TypeError('Pattern Lab recipe must be JSON-safe: cyclic value');
    if (Object.getOwnPropertySymbols(value).length) throw new TypeError('Pattern Lab recipe must be JSON-safe: symbol key');
    if (Array.isArray(value)) {
      for (let index = 0; index < value.length; index += 1) {
        if (!Object.hasOwn(value, index)) throw new TypeError('Pattern Lab recipe must be JSON-safe: sparse array');
      }
    } else if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) {
      throw new TypeError('Pattern Lab recipe must be JSON-safe: non-plain object');
    }
    ancestors.add(value);
  }
  if (Array.isArray(value)) {
    const result = value.map(item => clone(item, ancestors));
    ancestors.delete(value);
    return result;
  }
  if (value && typeof value === 'object') {
    const result = Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, clone(nested, ancestors)]));
    ancestors.delete(value);
    return result;
  }
  return value;
}

export function assertPatternLabJsonSafe(value) {
  const ancestors = new WeakSet();
  function visit(current, path) {
    if (current === null || typeof current === 'string' || typeof current === 'boolean') return;
    if (typeof current === 'number') {
      if (!Number.isFinite(current)) throw new TypeError(`Pattern Lab recipe must be JSON-safe: non-finite number at ${path}`);
      return;
    }
    if (typeof current !== 'object') throw new TypeError(`Pattern Lab recipe must be JSON-safe: ${typeof current} at ${path}`);
    if (ancestors.has(current)) throw new TypeError(`Pattern Lab recipe must be JSON-safe: cyclic value at ${path}`);
    if (Object.getOwnPropertySymbols(current).length) throw new TypeError(`Pattern Lab recipe must be JSON-safe: symbol key at ${path}`);
    if (Array.isArray(current)) {
      for (let index = 0; index < current.length; index += 1) {
        if (!Object.hasOwn(current, index)) throw new TypeError(`Pattern Lab recipe must be JSON-safe: sparse array at ${path}`);
      }
    }
    if (!Array.isArray(current) && Object.getPrototypeOf(current) !== Object.prototype && Object.getPrototypeOf(current) !== null) {
      throw new TypeError(`Pattern Lab recipe must be JSON-safe: non-plain object at ${path}`);
    }
    ancestors.add(current);
    if (Array.isArray(current)) current.forEach((item, index) => visit(item, `${path}[${index}]`));
    else Object.entries(current).forEach(([key, nested]) => visit(nested, `${path}.${key}`));
    ancestors.delete(current);
  }
  visit(value, '$');
  return value;
}

function objectOr(value, fallback = {}) {
  return value && typeof value === 'object' && !Array.isArray(value) ? clone(value) : clone(fallback);
}

function arrayOr(value, fallback = []) {
  return Array.isArray(value) ? clone(value) : clone(fallback);
}

function bounded(value, minimum, maximum, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(maximum, Math.max(minimum, number));
}

function majorVersion(version) {
  const match = String(version ?? PATTERN_LAB_RECIPE_VERSION).match(/^\s*(\d+)/);
  return match ? Number(match[1]) : Number.NaN;
}

function cryptoSafeId() {
  const cryptoApi = globalThis.crypto;
  if (typeof cryptoApi?.randomUUID === 'function') return `pattern-lab-${cryptoApi.randomUUID()}`;
  if (typeof cryptoApi?.getRandomValues === 'function') {
    const bytes = cryptoApi.getRandomValues(new Uint32Array(4));
    return `pattern-lab-${Array.from(bytes, value => value.toString(16).padStart(8, '0')).join('')}`;
  }
  fallbackId += 1;
  return `pattern-lab-${Date.now().toString(36)}-${fallbackId.toString(36)}`;
}

export function normalizePatternLabRecipe(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('Pattern Lab recipe must be an object');
  const major = majorVersion(input.version);
  if (major !== 1 && major !== PATTERN_LAB_RECIPE_VERSION) {
    throw new RangeError(`Unsupported Pattern Lab recipe version: ${String(input.version)}`);
  }

  const source = clone(input);
  const id = String(source.id || '').trim();
  if (!id) throw new TypeError('Pattern Lab recipe ID is required');
  const base = { kind: 'lightweaver-pattern', patternId: 'aurora', params: {}, ...objectOr(source.base) };
  base.params = objectOr(base.params);
  if (base.sectionMix !== undefined) {
    const mix = base.sectionMix;
    if (base.kind !== 'lightweaver-pattern' || !mix || typeof mix !== 'object' || Array.isArray(mix)
      || mix.version !== 1 || !mix.defaultLook || typeof mix.defaultLook !== 'object'
      || typeof mix.defaultLook.patternId !== 'string' || !Array.isArray(mix.sections)
      || mix.sections.some(section => !section || typeof section.id !== 'string' || !section.id.trim()
        || !Array.isArray(section.stripIds) || !section.stripIds.length
        || section.stripIds.some(stripId => typeof stripId !== 'string' || !stripId.trim())
        || !section.look || typeof section.look.patternId !== 'string')
      || new Set(mix.sections.map(section => section.id)).size !== mix.sections.length) {
      throw new TypeError('Pattern Lab mixed base assignment is malformed');
    }
    const looks = [mix.defaultLook, ...mix.sections.map(section => section.look)];
    if (looks.some(look => typeof look.speed !== 'number' || !Number.isFinite(look.speed)
      || look.speed < 0.05 || look.speed > 3
      || typeof look.brightness !== 'number' || !Number.isFinite(look.brightness)
      || look.brightness < 0 || look.brightness > 1)) {
      throw new TypeError('Pattern Lab mixed base look needs finite speed and brightness');
    }
    base.sectionMix = { ...mix, defaultParams: objectOr(mix.defaultParams),
      sections: mix.sections.map(section => ({ ...section, params: objectOr(section.params) })) };
  }

  let palette = arrayOr(source.palette, DEFAULT_PALETTE).filter(color => typeof color === 'string' && color.trim()).map(color => color.trim());
  if (!palette.length) palette = clone(DEFAULT_PALETTE);
  if (palette.length === 1) palette.push(palette[0]);
  palette = palette.slice(0, 8);

  const macroSource = objectOr(source.macros);
  const macros = { ...DEFAULT_MACROS, ...macroSource };
  for (const key of Object.keys(DEFAULT_MACROS)) macros[key] = bounded(macroSource[key], 0, 1, DEFAULT_MACROS[key]);
  delete macros.energy;

  const playbackSource = objectOr(source.playback);
  const playback = { ...DEFAULT_PLAYBACK, ...playbackSource };
  const oldMovement = bounded(macroSource.movement, 0, 1, DEFAULT_MACROS.movement);
  const oldEnergy = bounded(macroSource.energy, 0, 1, 0.5);
  playback.brightness = major === 1
    ? 0.15 + oldEnergy * 0.85
    : bounded(playbackSource.brightness, 0, 1, DEFAULT_PLAYBACK.brightness);
  const linkedNativeSpeed = base.kind === 'lightweaver-pattern' && source.sourceLook?.defaultLook;
  playback.speed = major === 1
    ? 0.25 + oldMovement * 1.75
    : bounded(playbackSource.speed, linkedNativeSpeed ? 0.05 : 0.25, linkedNativeSpeed ? 3 : 2, DEFAULT_PLAYBACK.speed);

  const evolutionSource = objectOr(source.evolution);
  const evolution = { ...DEFAULT_EVOLUTION, ...evolutionSource };
  evolution.enabled = evolutionSource.enabled === undefined ? DEFAULT_EVOLUTION.enabled : Boolean(evolutionSource.enabled);
  evolution.character = String(evolutionSource.character || DEFAULT_EVOLUTION.character);
  evolution.durationSeconds = bounded(evolutionSource.durationSeconds, 300, 900, DEFAULT_EVOLUTION.durationSeconds);
  evolution.change = bounded(evolutionSource.change, 0, 1, DEFAULT_EVOLUTION.change);
  const dynamicsSource = objectOr(evolutionSource.dynamics);
  const dynamics = { ...DEFAULT_DYNAMICS, ...dynamicsSource };
  dynamics.dynamicRange = major === 1
    ? 0.1 + oldEnergy * 0.9
    : bounded(dynamicsSource.dynamicRange, 0.1, 1, DEFAULT_DYNAMICS.dynamicRange);
  dynamics.rareEventStrength = major === 1
    ? oldEnergy * 0.8
    : bounded(dynamicsSource.rareEventStrength, 0, 0.8, DEFAULT_DYNAMICS.rareEventStrength);
  evolution.dynamics = dynamics;
  const layers = arrayOr(source.layers);
  assertPatternLabLayerCount(layers);
  // Valid legacy numeric IDs stay numeric so existing persisted recipe hashes
  // and references remain stable. New editor-created IDs are always strings.
  const reservedLayerIds = new Set(layers.map(layer => (
    typeof layer?.id === 'string' || typeof layer?.id === 'number' ? String(layer.id).trim() : ''
  )).filter(Boolean));
  const layerIds = new Set();
  layers.forEach((layer, index) => {
    if (!layer || typeof layer !== 'object' || Array.isArray(layer)) return;
    const current = typeof layer.id === 'string' || typeof layer.id === 'number' ? String(layer.id).trim() : '';
    if (current && !layerIds.has(current)) {
      layerIds.add(current);
      return;
    }
    let migrated = `layer-legacy-${id}-${index}`;
    let suffix = 1;
    while (reservedLayerIds.has(migrated) || layerIds.has(migrated)) migrated = `layer-legacy-${id}-${index}-${suffix++}`;
    layer.id = migrated;
    layerIds.add(migrated);
  });

  const journey = source.journey === undefined ? undefined : normalizeColorJourney(source.journey);

  return {
    ...source,
    version: PATTERN_LAB_RECIPE_VERSION,
    id,
    name: String(source.name || 'Untitled evolution').trim() || 'Untitled evolution',
    base,
    palette,
    macros,
    playback,
    evolution,
    seed: (Number.isFinite(Number(source.seed)) ? Math.trunc(Number(source.seed)) : 1) >>> 0,
    layers,
    ...(journey ? { journey } : {}),
    ...(source.sourceLook ? { sourceLook: objectOr(source.sourceLook) } : {}),
    ...(source.sourceLookBaseline ? { sourceLookBaseline: objectOr(source.sourceLookBaseline) } : {}),
    targets: arrayOr(source.targets, [{ kind: 'whole-piece', id: 'all' }]),
    requirements: arrayOr(source.requirements),
    provenance: arrayOr(source.provenance),
  };
}

export function createPatternLabRecipe(overrides = {}) {
  return normalizePatternLabRecipe({
    version: PATTERN_LAB_RECIPE_VERSION,
    id: overrides.id || cryptoSafeId(),
    name: overrides.name || 'Untitled evolution',
    base: { kind: 'lightweaver-pattern', patternId: 'aurora', params: {} },
    palette: DEFAULT_PALETTE,
    macros: DEFAULT_MACROS,
    playback: DEFAULT_PLAYBACK,
    evolution: DEFAULT_EVOLUTION,
    seed: 1,
    layers: [],
    targets: [{ kind: 'whole-piece', id: 'all' }],
    requirements: [],
    provenance: [],
    ...overrides,
  });
}
