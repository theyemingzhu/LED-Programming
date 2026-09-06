// Committing a discovery run into a project-shaped record the rest of Studio
// already understands. Discovery never writes anything itself; here its findings
// are turned into the three values a project needs built from either a fresh
// bench walk (discoveryProjectParts) or a card that is already provisioned but
// has no matching local project file (projectSkeletonFromCardStatus). Both are
// pure — no fetch, no localStorage, no React — so they are unit-testable.
import {
  discoveryPortRoleUpdates,
  namedColorOrderFromChannelMap,
} from './stripDiscovery.js';
import {
  PORT_ROLE_STRIP,
  PORT_ROLE_UNUSED,
  normalizePortRoles,
} from './portRoles.js';
import { normalizeUsbLedColorOrder } from './usbLedColorOrder.js';
import { channelProofMap } from './channelProof.js';
import { createDefaultPatchBoard } from './patchBoard.js';
import { BENCH_DEFAULT_PORT_PIXELS, isUncountedDiscoveryHeadroom } from './benchConfig.js';

// Same defaults as createDefaultProject(). Counted LEDs are a physical length
// at the reel density — never a 2px-per-LED sketch or a fixed 480px line.
export const COUNTED_LAYOUT_DENSITY = 60;
export const COUNTED_LAYOUT_PX_PER_MM = 3.7795;

export function countedStripLengthPx(count, {
  density = COUNTED_LAYOUT_DENSITY,
  pxPerMm = COUNTED_LAYOUT_PX_PER_MM,
} = {}) {
  const leds = Math.max(1, Math.trunc(Number(count) || 1));
  const dens = Number(density) > 0 ? Number(density) : COUNTED_LAYOUT_DENSITY;
  const scale = Number(pxPerMm) > 0 ? Number(pxPerMm) : COUNTED_LAYOUT_PX_PER_MM;
  return (leds / dens) * 1000 * scale;
}

export function isUncountedHeadroomCount(value) {
  return Math.trunc(Number(value) || 0) === BENCH_DEFAULT_PORT_PIXELS;
}

export function starterLedCountFromProject({ strips = [], portRoles = [] } = {}) {
  const countedPorts = (Array.isArray(portRoles) ? portRoles : []).filter(entry => (
    entry?.role === PORT_ROLE_STRIP
    && Number(entry.pixelCount) > 0
    && !isUncountedHeadroomCount(entry.pixelCount)
  ));
  const countedSum = countedPorts.reduce((sum, entry) => sum + Number(entry.pixelCount), 0);
  if (countedSum > 0) return countedSum;
  const stripSum = (Array.isArray(strips) ? strips : [])
    .reduce((sum, strip) => sum + Math.max(0, Number(strip.pixelCount) || 0), 0);
  if (stripSum > 0 && !isUncountedHeadroomCount(stripSum)) return stripSum;
  return 37;
}

export function layoutIsUncountedHeadroom(layout = {}) {
  const strips = Array.isArray(layout.strips) ? layout.strips : [];
  if (!strips.length) return false;
  return strips.every(strip => isUncountedHeadroomCount(strip.pixelCount));
}

// One entry per discovered strip port, in the shape standaloneController.led.
// outputs expects (cardRuntimeProject.js): id, pin, pixels. Ports with no pixel
// count, and ports whose role is not a strip, are omitted entirely.
function outputsFromStrips(portRoles) {
  return portRoles
    .filter(entry => entry.role === PORT_ROLE_STRIP && entry.pixelCount > 0)
    .map(entry => ({ id: `strip-${entry.pin}`, pin: entry.pin, pixels: entry.pixelCount }));
}

function provisionalLayoutFromOutputs(outputs, {
  density = COUNTED_LAYOUT_DENSITY,
  pxPerMm = COUNTED_LAYOUT_PX_PER_MM,
} = {}) {
  const strips = outputs.map((output, index) => {
    const count = Math.max(1, Math.trunc(Number(output.pixels) || 1));
    const startX = 80;
    const y = 100 + index * 90;
    const span = countedStripLengthPx(count, { density, pxPerMm });
    const endX = startX + span;
    const pixels = Array.from({ length: count }, (_, pixelIndex) => ({
      x: count === 1 ? startX : startX + (span * pixelIndex) / (count - 1),
      y,
      index: pixelIndex,
    }));
    return {
      id: output.id,
      name: `GPIO ${output.pin}`,
      pathData: `M ${startX} ${y} L ${endX} ${y}`,
      closed: false,
      svgLength: span,
      pixelCount: count,
      pixels,
      color: 'oklch(80% 0.13 72)',
      x: 0,
      y: 0,
      emit: 'omni',
      angle: 0,
      reversed: false,
      speed: 1,
      brightness: 1,
      hueShift: 0,
      patternId: null,
    };
  });
  const runs = outputs.map(output => ({
    id: `run-${output.id}`,
    type: 'strip',
    source: { stripId: output.id, from: 0, to: output.pixels - 1 },
    directionPolicy: 'flexible',
    physicalDirection: 'source-forward',
    seamLed: null,
    verified: false,
  }));
  const wiringOutputs = outputs.map((output, index) => ({
    id: `out${index + 1}`,
    name: `GPIO ${output.pin}`,
    pin: output.pin,
    runIds: [`run-${output.id}`],
  }));
  return {
    strips,
    patchBoard: createDefaultPatchBoard(strips),
    wiring: {
      version: 1,
      locked: false,
      verified: false,
      controllerAnchor: null,
      outputs: wiringOutputs,
      runs,
    },
  };
}

/**
 * The project parts a discovery session has landed on: the port roles exactly
 * as portRoles.js would persist them, the named colour order the proof measured
 * (empty when unheard), and one output per confirmed strip port.
 */
export function discoveryProjectParts(session, channelProof, geometry = {}) {
  const portRoles = normalizePortRoles(discoveryPortRoleUpdates(session));
  const outputs = outputsFromStrips(portRoles);
  return {
    portRoles,
    colorOrder: namedColorOrderFromChannelMap(channelProofMap(channelProof)),
    outputs,
    ...provisionalLayoutFromOutputs(outputs, geometry),
  };
}

/**
 * A project skeleton reconstructed from a live card's /api/status response,
 * used when a provisioned card is found but no matching project file exists
 * locally. Empty / '' values when the card reports nothing.
 */
export function projectSkeletonFromCardStatus(status = {}) {
  const reportedOutputs = Array.isArray(status?.outputs) ? status.outputs : [];
  // knownGoodProject means the stored config can play. Find-my-strips writes a
  // playable 256-pixel ceiling so discovery can light the strip — that is not a
  // counted, checked install, and must not lock the layout.
  const uncountedHeadroom = isUncountedDiscoveryHeadroom(status);
  const verified = status?.knownGoodProject === true
    && status?.outputReady === true
    && status?.provisionalSetup !== true
    && !uncountedHeadroom;
  const portRoles = normalizePortRoles(reportedOutputs.map(entry => ({
    pin: entry?.pin,
    role: entry?.pixels > 0 ? PORT_ROLE_STRIP : PORT_ROLE_UNUSED,
    pixelCount: uncountedHeadroom ? 0 : entry?.pixels,
    controlKind: '',
  })));
  const strips = [];
  const runs = [];
  const wiringOutputs = [];
  for (const [outputIndex, output] of reportedOutputs.entries()) {
    const outputPixels = Math.max(0, Math.trunc(Number(output?.pixels) || 0));
    if (!outputPixels || uncountedHeadroom) continue;
    const outputId = /^out\d+$/i.test(String(output?.id || '')) ? String(output.id) : `out${outputIndex + 1}`;
    const reportedSegments = Array.isArray(output?.segments) && output.segments.length
      ? output.segments
      : [{ id: `run-strip-${strips.length + 1}`, count: outputPixels, direction: 'forward' }];
    const runIds = [];
    for (const segment of reportedSegments) {
      const count = Math.max(0, Math.trunc(Number(segment?.count) || 0));
      if (!count) continue;
      const runId = String(segment?.id || `run-strip-${strips.length + 1}`);
      const stripId = runId.replace(/^run-/, '') || `strip-${strips.length + 1}`;
      const y = 100 + strips.length * 70;
      const startX = 80;
      const span = countedStripLengthPx(count);
      const endX = startX + span;
      const pixels = Array.from({ length: count }, (_, index) => ({
        x: count === 1 ? startX : startX + (span * index) / (count - 1),
        y,
        index,
      }));
      strips.push({
        id: stripId,
        // Same scaffold-name guard as cardIdentity.js: while the temporary
        // Find-my-strips setup is on the card, `piece.name` IS that scaffold,
        // and naming the owner's strip after it carried the label into the
        // artwork permanently.
        name: reportedSegments.length === 1
          ? (status?.piece?.name === 'Lightweaver Bench Discovery' ? 'Line' : (status?.piece?.name || 'Line'))
          : `Line ${strips.length + 1}`,
        pathData: `M ${startX} ${y} L ${endX} ${y}`,
        closed: false,
        svgLength: span,
        pixelCount: count,
        pixels,
        color: 'oklch(80% 0.13 72)',
        x: 0,
        y: 0,
        emit: 'omni',
        angle: 0,
        reversed: segment?.direction === 'reverse',
        speed: 1,
        brightness: 1,
        hueShift: 0,
        patternId: null,
      });
      runs.push({
        id: runId,
        type: 'strip',
        source: { stripId, from: 0, to: count - 1 },
        directionPolicy: 'flexible',
        physicalDirection: segment?.direction === 'reverse' ? 'source-reverse' : 'source-forward',
        seamLed: null,
        verified,
      });
      runIds.push(runId);
    }
    wiringOutputs.push({
      id: outputId,
      name: String(output?.name || `Output ${outputIndex + 1}`),
      pin: Number(output?.pin),
      runIds,
    });
  }
  const patchBoard = createDefaultPatchBoard(strips);
  patchBoard.physicalLocked = verified;
  return {
    portRoles,
    colorOrder: normalizeUsbLedColorOrder(status?.led?.colorOrder || status?.outputColor?.colorOrder, ''),
    led: {
      ...(status?.led?.type ? { type: String(status.led.type) } : {}),
      ...(Number.isSafeInteger(Number(status?.led?.maxMilliamps ?? status?.maxMilliamps))
        ? { maxMilliamps: Number(status?.led?.maxMilliamps ?? status?.maxMilliamps) }
        : {}),
    },
    outputs: uncountedHeadroom ? [] : reportedOutputs
      .filter(output => Number(output?.pixels) > 0)
      .map(output => ({
        id: /^out\d+$/i.test(String(output?.id || '')) ? String(output.id) : `strip-${output.pin}`,
        pin: Number(output.pin),
        pixels: Math.trunc(Number(output.pixels)),
      })),
    strips,
    patchBoard,
    wiring: {
      version: 1,
      locked: verified,
      verified,
      controllerAnchor: null,
      outputs: wiringOutputs,
      runs,
    },
  };
}
