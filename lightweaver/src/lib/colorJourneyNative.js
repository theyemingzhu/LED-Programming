import {
  COLOR_JOURNEY_MAX_PHASE_ERROR_TICKS,
  COLOR_JOURNEY_MAX_PIXELS,
  encodeBoundedColorJourneyPhases,
  expandColorJourneyPhases,
  encodeColorJourneyPhases,
} from './colorJourneyPhases.js';
import { normalizeColorJourney, sampleColorJourney } from './colorJourney.js';
import { createPatternLabRecipe, normalizePatternLabRecipe } from './patternLabRecipe.js';
import { compileWiring } from './wiringCompiler.js';
import { normalizeProjectRenderStrips } from './renderGeometry.js';

export const COLOR_JOURNEY_NATIVE_VERSION = 1;
export const COLOR_JOURNEY_NATIVE_MAX_PIXELS = COLOR_JOURNEY_MAX_PIXELS;

const DEPTH_BY_CHARACTER = Object.freeze({
  restrained: 0.12,
  balanced: 0.25,
  expressive: 0.42,
});

function moduloOne(value) {
  return ((value % 1) + 1) % 1;
}

function physicalPixels(compiled) {
  const ordered = [];
  for (const output of compiled.outputs) {
    for (const segment of output.segments || []) {
      const run = compiled.runs.find(candidate => candidate.id === segment.id && candidate.outputId === output.id);
      if (!run || run.count < 1) continue;
      const pixels = compiled.pixels.slice(run.start, run.start + run.count);
      ordered.push(...(run.reversed ? pixels.reverse() : pixels));
    }
  }
  return ordered;
}

function hashText(value) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function colorJourneyLayoutKey({ strips = [], wiring = null } = {}) {
  const geometry = strips.map(strip => ({
    id: strip.id,
    points: (strip.pixels || strip.pts || []).map(point => [Number(point.x) || 0, Number(point.y) || 0]),
  }));
  return `cj1-${hashText(JSON.stringify({ geometry, wiring }))}`;
}

export function normalizeStoredNativeColorJourney(value, expectedPixels = null) {
  const journey = value?.journey;
  const phases = expandColorJourneyPhases(journey);
  const inferredPixels = phases.length;
  const pixels = expectedPixels == null ? inferredPixels : expectedPixels;
  const stops = journey?.stops;
  const id = String(value?.id || '');
  if (!Number.isInteger(pixels) || pixels < 1 || pixels > COLOR_JOURNEY_NATIVE_MAX_PIXELS
    || value?.version !== 1 || value?.kind !== 'color-journey'
    || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id) || id.length > 64
    || ![1, 2, 3].includes(journey?.version)
    || !Array.isArray(stops) || stops.length < 2 || stops.length > 8
    || !stops.every(stop => /^#[0-9a-f]{6}$/.test(stop?.color)
      && Number.isInteger(stop?.holdMs) && stop.holdMs >= 0 && stop.holdMs <= 600_000
      && Number.isInteger(stop?.fadeMs) && stop.fadeMs >= 1_000 && stop.fadeMs <= 600_000)
    || !['linear', 'smooth'].includes(journey.easing) || typeof journey.loop !== 'boolean'
    || journey.restart !== 'restart'
    || !Number.isInteger(journey.motionSpeedMs) || journey.motionSpeedMs < 4_000 || journey.motionSpeedMs > 90_000
    || ![0.12, 0.25, 0.42].includes(journey.depth)
    || phases.length !== pixels) {
    throw new RangeError('Stored native Color Journey is invalid.');
  }
  return structuredClone(value);
}

export function nativeColorJourneySourcePhase16(nativeRecipe, { strips = [], wiring = null } = {}) {
  const native = normalizeStoredNativeColorJourney(nativeRecipe);
  const phase16 = expandColorJourneyPhases(native.journey).map(value => value.toString(16).padStart(4, '0')).join('');
  const compiled = compileWiring({ wiring, strips });
  if (!compiled?.ok || compiled.totalPixels * 4 !== phase16.length) {
    throw new RangeError('Native Color Journey readback does not match the reconstructed layout.');
  }
  const bySource = new Map();
  physicalPixels(compiled).forEach((pixel, index) => {
    bySource.set(`${pixel.stripId}:${pixel.sourceLed}`, phase16.slice(index * 4, index * 4 + 4));
  });
  return strips.flatMap(strip => (strip.pixels || strip.pts || []).map((_, index) => bySource.get(`${strip.id}:${index}`) || '')).join('');
}

export function patternLabRecipeFromNativeColorJourney(nativeRecipe, { id = '', name = '', strips = [], wiring = null } = {}) {
  const native = normalizeStoredNativeColorJourney(nativeRecipe);
  const character = ({ 0.12: 'restrained', 0.25: 'balanced', 0.42: 'expressive' })[native.journey.depth];
  return createPatternLabRecipe({
    id: id || native.id,
    name: name || native.id,
    base: { kind: 'color-journey', id: 'slow-color-drift', params: {} },
    palette: native.journey.stops.map(stop => stop.color),
    playback: { brightness: 1 },
    journey: {
      version: 1,
      stops: native.journey.stops.map((stop, index) => ({ ...stop, id: `color-${index + 1}` })),
      easing: native.journey.easing,
      loop: native.journey.loop,
      motionSpeedSeconds: native.journey.motionSpeedMs / 1000,
      character,
    },
    evolution: { enabled: false },
    sourceLook: {
      nativeSourcePhase16: nativeColorJourneySourcePhase16(native, { strips, wiring }),
      nativePhaseEncoding: [2, 3].includes(native.journey.version)
        ? {
            version: native.journey.version,
            ...(native.journey.version === 3 ? { maxPhaseErrorTicks: native.journey.maxPhaseErrorTicks } : {}),
            phases: structuredClone(native.journey.phases),
          }
        : { version: 1, phase16: native.journey.phase16 },
      nativeRecipeLayoutKey: colorJourneyLayoutKey({ strips, wiring }),
    },
  });
}

function geometryBounds(pixels) {
  const xs = pixels.map(pixel => Number(pixel.x) || 0);
  const ys = pixels.map(pixel => Number(pixel.y) || 0);
  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    range: Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), 0.001),
  };
}

function assertNativeJourneyShape(recipe, symSettings) {
  if (recipe.base?.kind !== 'color-journey') throw new TypeError('Native Color Journey compilation requires a color-journey base.');
  if (Object.keys(recipe.base?.params || {}).length) throw new RangeError('Native Color Journeys do not support base modifiers.');
  if (recipe.layers.length) throw new RangeError('Native Color Journeys do not support Pattern Lab layers.');
  if (recipe.evolution?.enabled === true) throw new RangeError('Native Color Journeys do not support the separate evolution engine.');
  if (recipe.requirements.some(requirement => requirement?.required !== false)) {
    throw new RangeError('Native Color Journeys do not support additional runtime requirements.');
  }
  if (recipe.targets.length !== 1 || !['whole-piece', 'all'].includes(recipe.targets[0]?.kind)) {
    throw new RangeError('Native Color Journeys must target the whole piece.');
  }
  if (recipe.sourceLook?.selectedTargetId && recipe.sourceLook.selectedTargetId !== 'all') {
    throw new RangeError('Native Color Journeys cannot preserve saved section-only authority; reopen the whole piece.');
  }
  if (symSettings?.enabled === true) throw new RangeError('Native Color Journeys do not support Studio symmetry.');
}

export function compileColorJourneyNativeRecipe({
  recipe: input,
  strips = [],
  groups = [],
  wiring = null,
  compiledWiring = null,
  hidden = {},
  symSettings = null,
  id = '',
} = {}) {
  const recipe = normalizePatternLabRecipe(input);
  assertNativeJourneyShape(recipe, symSettings);
  const modifiedStrip = strips.find(strip => (
    (strip?.brightness !== undefined && Number(strip.brightness) !== 1)
    || (strip?.speed !== undefined && Number(strip.speed) !== 1)
    || (strip?.hueShift !== undefined && Number(strip.hueShift) !== 0)
  ));
  if (modifiedStrip) throw new RangeError('Native Color Journeys do not support per-strip brightness, speed, or hue modifiers.');
  if (recipe.sourceLook?.nativeRecipeLayoutKey
    && recipe.sourceLook.nativeRecipeLayoutKey !== colorJourneyLayoutKey({ strips, wiring })) {
    throw new RangeError('This read-back Color Journey belongs to the previous layout. Restore that layout before installing it.');
  }
  const compiled = compiledWiring || compileWiring({ wiring, strips, groups });
  if (!compiled?.ok) {
    throw new RangeError(`Native Color Journey layout is invalid. ${(compiled?.errors || []).map(error => error.message).join(' ')}`.trim());
  }
  if (compiled.totalPixels > COLOR_JOURNEY_NATIVE_MAX_PIXELS) {
    throw new RangeError(`Native Color Journeys support at most ${COLOR_JOURNEY_NATIVE_MAX_PIXELS} physical pixels.`);
  }
  if (compiled.pixels.some(pixel => pixel?.inactive === true || !pixel?.stripId)) {
    throw new RangeError('Native Color Journeys cannot use inactive address holes.');
  }
  if (strips.some(strip => (hidden?.[strip.id] === true || strip?.hidden === true) && (strip?.pixels?.length || strip?.pixelCount))) {
    throw new RangeError('Native Color Journeys cannot hide a wired artwork strip.');
  }
  const expectedSources = strips.flatMap(strip => Array.from(
    { length: strip?.pixels?.length || Math.max(0, Math.trunc(Number(strip?.pixelCount) || 0)) },
    (_, sourceLed) => `${strip.id}:${sourceLed}`,
  ));
  const actualSources = compiled.pixels.map(pixel => `${pixel.stripId}:${pixel.sourceLed}`);
  const sourceSet = new Set(actualSources);
  if (actualSources.length !== expectedSources.length
    || new Set(actualSources).size !== actualSources.length
    || expectedSources.some(source => !sourceSet.has(source))) {
    throw new RangeError('Native Color Journeys require every artwork pixel exactly once; partial or duplicated wiring is unsupported.');
  }
  const compiledPhysicalPixels = physicalPixels(compiled);
  if (compiledPhysicalPixels.length !== compiled.totalPixels || compiledPhysicalPixels.length < 1) {
    throw new RangeError('Native Color Journey physical pixel order is incomplete.');
  }
  const renderStrips = normalizeProjectRenderStrips(strips, { hidden });
  const stripsById = new Map(renderStrips.map(strip => [strip.id, strip]));
  const renderPixels = renderStrips.flatMap(strip => strip.pts || []);
  const pixels = compiledPhysicalPixels.map(pixel => {
    const point = stripsById.get(pixel.stripId)?.pts?.[pixel.sourceLed];
    if (!point) throw new RangeError('Native Color Journey artwork geometry is incomplete.');
    return point;
  });
  const bounds = geometryBounds(renderPixels);
  const retainedSource = recipe.sourceLook?.nativeSourcePhase16;
  const retainedBySource = new Map();
  if (retainedSource !== undefined) {
    if (typeof retainedSource !== 'string' || retainedSource.length !== expectedSources.length * 4 || !/^[0-9a-f]+$/.test(retainedSource)) {
      throw new RangeError('Read-back Color Journey source phase data is invalid.');
    }
    expectedSources.forEach((source, index) => retainedBySource.set(source, retainedSource.slice(index * 4, index * 4 + 4)));
  }
  const phase16 = pixels.map((pixel, index) => {
    if (retainedSource !== undefined) {
      const source = compiledPhysicalPixels[index];
      return retainedBySource.get(`${source.stripId}:${source.sourceLed}`);
    }
    const x = (Number(pixel.x || 0) - bounds.minX) / bounds.range;
    const y = (Number(pixel.y || 0) - bounds.minY) / bounds.range;
    const quantized = Math.round(moduloOne(x + y * 0.35) * 0x10000) & 0xffff;
    return quantized.toString(16).padStart(4, '0');
  }).join('');
  const phaseValues = phase16.match(/.{4}/g).map(value => Number.parseInt(value, 16));
  const retainedEncoding = recipe.sourceLook?.nativePhaseEncoding;
  const retainedValues = retainedEncoding ? expandColorJourneyPhases(retainedEncoding) : null;
  let encoding;
  if (retainedValues?.length === phaseValues.length && retainedValues.every((value, index) => value === phaseValues[index])) {
    encoding = structuredClone(retainedEncoding);
  } else {
    try {
      encoding = encodeColorJourneyPhases(phaseValues);
    } catch (error) {
      if (!/geometry is too complex/.test(String(error?.message || error))) throw error;
      encoding = encodeBoundedColorJourneyPhases(phaseValues);
    }
  }
  const journey = normalizeColorJourney(recipe.journey);
  return {
    version: COLOR_JOURNEY_NATIVE_VERSION,
    kind: 'color-journey',
    id: String(id || recipe.base.id || recipe.id),
    journey: {
      ...encoding,
      stops: journey.stops.map(stop => ({
        color: stop.color,
        holdMs: stop.holdMs,
        fadeMs: stop.fadeMs,
      })),
      easing: journey.easing,
      loop: journey.loop,
      restart: 'restart',
      motionSpeedMs: Math.round(journey.motionSpeedSeconds * 1000),
      depth: DEPTH_BY_CHARACTER[journey.character],
    },
  };
}

export function sampleNativeColorJourneyPixel(nativeRecipe, pixelIndex, elapsedMs = 0) {
  if (nativeRecipe?.version !== COLOR_JOURNEY_NATIVE_VERSION || nativeRecipe?.kind !== 'color-journey') {
    throw new TypeError('A native Color Journey v1 recipe is required.');
  }
  const journey = nativeRecipe.journey || {};
  const phaseValue = expandColorJourneyPhases(journey)[pixelIndex];
  if (!Number.isInteger(phaseValue)) throw new RangeError('Native Color Journey pixel index is outside phase data.');
  const time = Math.max(0, Math.trunc(Number.isFinite(Number(elapsedMs)) ? Number(elapsedMs) : 0));
  const { rgb } = sampleColorJourney({
    version: 1,
    stops: journey.stops,
    easing: journey.easing,
    loop: journey.loop,
  }, time);
  const phase = phaseValue / 0x10000;
  const period = Math.max(4_000, Number(journey.motionSpeedMs) || 18_000);
  const depth = Number(journey.depth) || 0.12;
  const motionCycle = (time % period) / period;
  const movement = 1 - depth * (0.5 + 0.5 * Math.sin((phase - motionCycle) * Math.PI * 2));
  return {
    r: Math.round(rgb[0] * movement),
    g: Math.round(rgb[1] * movement),
    b: Math.round(rgb[2] * movement),
  };
}

export function runtimeConfigUsesColorJourney(configOrPackage = {}) {
  const config = configOrPackage?.config || configOrPackage;
  return Array.isArray(config?.looks) && config.looks.some(look => (
    look?.nativeRecipe?.version === COLOR_JOURNEY_NATIVE_VERSION
      && look.nativeRecipe.kind === 'color-journey'
  ));
}

export function hasColorJourneyRecipeCapability(evidence, version = 1) {
  if (version === 3) {
    const capability = evidence?.recipeCapabilities?.colorJourneyV3;
    return capability?.version === 3 && capability?.maxPixels === 65535
      && capability?.maxPhaseSpans === 64
      && capability?.maxPhaseErrorTicks === COLOR_JOURNEY_MAX_PHASE_ERROR_TICKS
      && capability?.phaseEncoding === 'q0.16-affine-rgb1' && capability?.restart === 'restart';
  }
  if (version === 2) {
    const capability = evidence?.recipeCapabilities?.colorJourneyV2;
    return capability?.version === 2 && capability?.maxPixels === 65535
      && capability?.maxPhaseSpans === 64 && capability?.phaseEncoding === 'q0.16-affine' && capability?.restart === 'restart';
  }
  if (version !== 1) return false;
  const capability = evidence?.recipeCapabilities?.colorJourney;
  return capability?.version === 1
    && capability?.maxPixels === 256
    && capability?.phaseEncoding === 'q0.16-hex'
    && capability?.restart === 'restart';
}
