import { CARD_HARDWARE_CAPABILITIES } from './cardRuntimeContract.js';
import { compileCardKaleidoscopeMappings } from './cardKaleidoscope.js';
import { validateWiring } from './wiringModel.js';
import { findSymmetryStructureErrors, normalizeSymmetry } from './pieceSymmetry.js';

const stripCount = strip => Math.max(0, Math.trunc(Number(strip?.pixelCount ?? strip?.pixels?.length ?? strip?.leds ?? 0)));

function sourceOrder(run) {
  let values = Array.from({ length: run.source.to - run.source.from + 1 }, (_, index) => run.source.from + index);
  if (run.seamLed != null) {
    const seamIndex = values.indexOf(run.seamLed);
    if (seamIndex >= 0) values = [...values.slice(seamIndex), ...values.slice(0, seamIndex)];
  }
  return values;
}

function rangeSourceStep(range, pixels) {
  if (range.count < 2) return null;
  const start = range.start;
  const step = pixels[start + 1].sourceLed - pixels[start].sourceLed;
  if (step !== 1 && step !== -1) return false;
  for (let offset = 2; offset < range.count; offset += 1) {
    if (pixels[start + offset].sourceLed - pixels[start + offset - 1].sourceLed !== step) {
      return false;
    }
  }
  return step;
}

function canCoalesceZoneRanges(previous, next, pixels, runsById, previousPhysicalRunById) {
  if (previous.start + previous.count !== next.start) return false;
  const previousPixel = pixels[next.start - 1];
  const nextPixel = pixels[next.start];
  if (!previousPixel || !nextPixel
    || previousPixel.outputId !== nextPixel.outputId
    || previousPixel.stripId !== nextPixel.stripId
    || previousPhysicalRunById.get(nextPixel.runId) !== previousPixel.runId) return false;

  const previousRun = runsById.get(previousPixel.runId);
  const nextRun = runsById.get(nextPixel.runId);
  if ((previousRun?.physicalDirection || 'source-forward')
    !== (nextRun?.physicalDirection || 'source-forward')) return false;

  const boundaryStep = nextPixel.sourceLed - previousPixel.sourceLed;
  if (boundaryStep !== 1 && boundaryStep !== -1) return false;
  const previousStep = rangeSourceStep(previous, pixels);
  const nextStep = rangeSourceStep(next, pixels);
  return previousStep !== false
    && nextStep !== false
    && (previousStep == null || previousStep === boundaryStep)
    && (nextStep == null || nextStep === boundaryStep);
}

function coalesceZoneRanges(zone, pixels, runsById, previousPhysicalRunById) {
  const ranges = [];
  for (const range of zone.ranges) {
    const previous = ranges[ranges.length - 1];
    if (previous && canCoalesceZoneRanges(previous, range, pixels, runsById, previousPhysicalRunById)) {
      previous.count += range.count;
    } else {
      ranges.push({ ...range });
    }
  }
  return { ...zone, ranges };
}

// Each symmetry side compiles to ONE continuous zone: its ranges are the side's
// strips' ranges in stripIds order (the order the pattern flows through the
// side), and `continuous: true` tells the card those ranges are one pattern run
// (pattern index and count span all ranges). Strips in no side compile exactly
// as they always did. A symmetry that breaks a rule is left out (every strip
// then keeps its own zone) and reported as a `symmetry-ignored` warning rather
// than blocking the whole project.
// Indices of the logical samples that will reach each physical LED. Match the
// card's segment copy without changing the compiler's zone/range coordinates.
export const OUTPUT_PLAYBACK_ORDER = 'output-segments-v1';

export function hasPlaybackReversal(compiled) {
  return compiled?.runs?.some(run => (run.playbackReversed ?? run.reversed) && run.count > 1) ?? false;
}

export function playbackSourceIndices(compiled, { includePathFlip = true } = {}) {
  const indices = (compiled?.pixels || []).map((_, index) => index);
  for (const run of compiled?.runs || []) {
    if (!(includePathFlip ? run.playbackReversed ?? run.reversed : run.reversed)) continue;
    for (let offset = 0; offset < run.count; offset++) {
      indices[run.start + offset] = run.start + run.count - 1 - offset;
    }
  }
  return indices;
}

export function pixelsInPlaybackOrder(compiled) {
  const pixels = compiled?.pixels || [];
  if (!hasPlaybackReversal(compiled)) return pixels;
  return playbackSourceIndices(compiled).map((source, index) => ({ ...pixels[source], index }));
}

export function playbackSlotsInStripFrame(compiled, strips, hidden = {}) {
  const starts = new Map();
  let start = 0;
  for (const strip of strips) {
    if (hidden[strip.id]) continue;
    starts.set(strip.id, start);
    start += strip.pixels?.length || 0;
  }
  return pixelsInPlaybackOrder(compiled).map(pixel => {
    const source = starts.get(pixel.stripId);
    return !pixel.inactive && source !== undefined && Number.isInteger(pixel.sourceLed) ? source + pixel.sourceLed : -1;
  });
}

export function compileWiring({ wiring, strips = [], groups = [], symmetry = null, capabilities = CARD_HARDWARE_CAPABILITIES } = {}) {
  const validation = validateWiring(wiring, strips, capabilities);
  const model = validation.wiring;
  const errors = [...validation.errors];
  const warnings = [...validation.warnings];
  const empty = { ok: false, sendReady: false, errors, warnings, totalPixels: 0, physicalOutputCount: 0, outputs: [], runs: [], pixels: [], zones: [], kaleidoscopeMappings: [] };
  if (errors.length) return empty;
  const runsById = new Map(model.runs.map(run => [run.id, run]));
  const previousPhysicalRunById = new Map();
  for (const output of model.outputs) {
    for (let index = 1; index < output.runIds.length; index += 1) {
      previousPhysicalRunById.set(output.runIds[index], output.runIds[index - 1]);
    }
  }
  const stripsById = new Map(strips.map(strip => [strip.id, strip]));
  const zoneByStripId = new Map();
  const requestedSymmetry = normalizeSymmetry(symmetry);
  const groupedStripIds = new Set();
  for (const group of groups || []) {
    for (const member of group.members || []) {
      const stripId = typeof member === 'string' ? member : member?.stripId;
      if (stripId) groupedStripIds.add(String(stripId));
    }
  }
  let symmetryRejection = null;
  if (symmetry) {
    const structure = findSymmetryStructureErrors(symmetry, strips);
    const grouped = (symmetry.sides || []).flatMap(side => side.stripIds || []).find(id => groupedStripIds.has(String(id)));
    if (structure.length) symmetryRejection = structure[0].message;
    else if (!requestedSymmetry) symmetryRejection = 'Choose 2 sides or 4 sides.';
    else if (grouped) symmetryRejection = `Ungroup ${stripsById.get(grouped)?.name || grouped} first.`;
  }
  const appliedSymmetry = symmetryRejection ? null : requestedSymmetry;
  const zoneOrderByStripId = new Map();
  const orderedGroupIds = new Set();
  for (const group of groups || []) {
    const id = String(group.groupId || group.id || '');
    if (!id) continue;
    const ordered = group.ordered === true;
    const overrides = new Set(Array.isArray(group.patternOverrideStripIds) ? group.patternOverrideStripIds : []);
    const identity = { id, label: String(group.name || group.label || id), ...(ordered ? { continuous: true } : {}) };
    if (ordered) orderedGroupIds.add(id);
    (group.members || []).forEach((member, index) => {
      const stripId = typeof member === 'string' ? member : member?.stripId;
      if (!stripId || overrides.has(stripId)) return;
      zoneByStripId.set(stripId, identity);
      if (ordered) zoneOrderByStripId.set(stripId, index);
    });
  }
  // Sides claim their strips after layer groups; validation already refused any
  // strip that is also in a group.
  for (const side of appliedSymmetry?.sides || []) {
    const identity = { id: side.id, label: side.label, continuous: true };
    side.stripIds.forEach((stripId, index) => {
      zoneByStripId.set(stripId, identity);
      zoneOrderByStripId.set(stripId, index);
    });
  }
  const outputs = [];
  const runs = [];
  const pixels = [];
  const zoneMap = new Map();

  for (const output of model.outputs) {
    const outputStart = pixels.length;
    let previousWasStrip = false;
    let previousRun = null;
    for (const runId of output.runIds) {
      const run = runsById.get(runId);
      const start = pixels.length;
      if (run.type === 'cable') {
        runs.push({ ...run, outputId: output.id, start, count: 0 });
        previousWasStrip = false;
        previousRun = null;
        continue;
      }
      if (run.type === 'inactive') {
        for (let index = 0; index < run.count; index++) pixels.push({ index: pixels.length, runId, outputId: output.id, stripId: null, sourceLed: null, x: 0, y: 0, inactive: true });
        runs.push({ ...run, outputId: output.id, start, count: run.count });
        previousWasStrip = false;
        previousRun = null;
        continue;
      }
      if (previousWasStrip && !(model.verified && previousRun?.verified && run.verified)) warnings.push({ code: 'boundary-unverified', runId, message: `Boundary before ${runId} has not been verified.` });
      previousWasStrip = true;
      previousRun = run;
      const strip = stripsById.get(run.source.stripId);
      const order = sourceOrder(run);
      for (const sourceLed of order) {
        const sourcePixel = strip.pixels?.[sourceLed] || {};
        pixels.push({
          index: pixels.length,
          runId,
          outputId: output.id,
          stripId: strip.id,
          sourceLed,
          x: Number(sourcePixel.x || 0) + Number(strip.offsetX || strip.x || 0),
          y: Number(sourcePixel.y || 0) + Number(strip.offsetY || strip.y || 0),
          inactive: false,
        });
      }
      const reversed = run.physicalDirection === 'source-reverse';
      // A flipped drawing already reorders Studio coordinates. Native effects
      // only see section indices, so carry that flip into their output mapping.
      const compiledRun = {
        ...run, outputId: output.id, start, count: order.length, reversed,
        ...(strip.pathPlaybackFlipped === true ? { playbackReversed: !reversed } : {}),
      };
      runs.push(compiledRun);
      const zoneIdentity = zoneByStripId.get(run.source.stripId) || { id: run.source.stripId, label: strip.name || run.source.stripId };
      const zoneId = zoneIdentity.id;
      const zone = zoneMap.get(zoneId) || { ...zoneIdentity, ranges: [] };
      zone.ranges.push({ start, count: order.length });
      zoneMap.set(zoneId, zone);
    }
    const count = pixels.length - outputStart;
    const outputRuns = runs.filter(run => run.outputId === output.id && run.count > 0 && run.type !== 'cable');
    const segments = outputRuns.map(run => ({ id: run.id, count: run.count, direction: (run.playbackReversed ?? run.reversed) ? 'reverse' : 'forward' }));
    const stripDirections = new Set(outputRuns.filter(run => run.type === 'strip').map(run => (run.playbackReversed ?? run.reversed) ? 'reverse' : 'forward'));
    const direction = stripDirections.size === 1 ? [...stripDirections][0] : stripDirections.size > 1 ? 'mixed' : 'forward';
    outputs.push({ id: output.id, name: output.name || output.id, pin: output.pin, start: outputStart, count, pixels: count, direction, segments });
  }

  if (pixels.length > capabilities.maxPixels) errors.push({ code: 'pixel-limit', message: `Compiled wiring uses ${pixels.length} pixels; hardware supports ${capabilities.maxPixels}.` });
  // Continuous zones follow the authored member order. A member's own
  // ranges retain their physical order, which is also used by legacy zones.
  for (const zone of zoneMap.values()) {
    if (!zone.continuous) continue;
    const orderOf = range => zoneOrderByStripId.get(pixels[range.start]?.stripId) ?? Number.MAX_SAFE_INTEGER;
    zone.ranges.sort((a, b) => orderOf(a) - orderOf(b) || a.start - b.start);
  }
  const zones = [...zoneMap.values()].map(zone => (
    coalesceZoneRanges(zone, pixels, runsById, previousPhysicalRunById)
  ));
  let brokenSymmetry = null;
  for (const side of appliedSymmetry?.sides || []) {
    const zone = zones.find(candidate => candidate.id === side.id);
    const rangesByStrip = new Map(side.stripIds.map(stripId => [stripId, 0]));
    for (const range of zone?.ranges || []) {
      const stripId = pixels[range.start]?.stripId;
      if (rangesByStrip.has(stripId)) rangesByStrip.set(stripId, rangesByStrip.get(stripId) + 1);
    }
    const split = [...rangesByStrip.entries()].find(([, count]) => count !== 1);
    if (split) {
      const name = stripsById.get(split[0])?.name || split[0];
      brokenSymmetry = `Join ${name}'s wiring into one run first.`;
    } else if ((zone?.ranges || []).length > capabilities.maxRangesPerZone) {
      brokenSymmetry = `${side.label} needs more wiring runs than one card section holds.`;
    }
    if (brokenSymmetry) break;
  }
  if (brokenSymmetry) {
    const retry = compileWiring({ wiring, strips, groups, capabilities });
    retry.warnings.push({ code: 'symmetry-ignored', message: brokenSymmetry });
    return retry;
  }
  if (symmetryRejection) warnings.push({ code: 'symmetry-ignored', message: symmetryRejection });
  if (zones.length > capabilities.maxZones) errors.push({ code: 'zone-limit', message: `Compiled wiring uses ${zones.length} zones.` });
  for (const zone of zones) if (zone.ranges.length > capabilities.maxRangesPerZone) errors.push({ code: 'zone-range-limit', zoneId: zone.id, message: `Zone ${zone.id} has too many ranges.` });
  const kaleidoscope = compileCardKaleidoscopeMappings({ strips, pixels, zones });
  errors.push(...kaleidoscope.errors);
  for (const mapping of kaleidoscope.mappings) {
    if (!orderedGroupIds.has(mapping.zoneId)) continue;
    const name = stripsById.get(mapping.id)?.name || mapping.id;
    errors.push({
      code: 'effect-group-kaleidoscope',
      zoneId: mapping.zoneId,
      stripId: mapping.id,
      message: `Turn off Kaleidoscope on ${name} to play it as part of an ordered group.`,
    });
  }
  const ok = errors.length === 0;
  const sendReady = ok && model.locked && model.verified && model.runs.every(run => run.verified) && model.migrationWarnings.length === 0;
  return { ok, sendReady, errors, warnings, totalPixels: pixels.length, physicalOutputCount: outputs.length, outputs, runs, pixels, zones, groups, symmetry: appliedSymmetry, kaleidoscopeMappings: kaleidoscope.mappings };
}
