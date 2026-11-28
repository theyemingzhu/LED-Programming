import { activeBoardGpios } from './gpioAssignments.js';
import { CARD_CONNECTOR_PINS, makeDefaultWiring, normalizeWiring } from './wiringModel.js';

function namedPin(layer) {
  const match = /(?:^|[^a-z0-9])gpio[\s_:-]*(\d+)(?!\d)/i.exec(`${layer.name || ''} ${layer.layerId || ''}`);
  return match ? Number(match[1]) : null;
}

// Stays optional on saved strips so existing artwork projects keep their
// independent GPIO assignments until their artwork is explicitly remapped.
export function svgLayerStripId(strip) {
  return strip?.svgWiringLayerId ?? (strip?.svgLayerWired ? strip.sourceLayerId : null);
}

export function addSvgLayerWiring(wiring, groups, { availablePins, maxOutputs, controls } = {}) {
  const next = wiring ? normalizeWiring(wiring) : { ...makeDefaultWiring(), outputs: [] };
  const controlPins = new Set(activeBoardGpios([], controls).map(({ pin }) => pin));
  const pins = [...new Set([...CARD_CONNECTOR_PINS, ...availablePins])]
    .filter(pin => availablePins.includes(pin) && !controlPins.has(pin));
  const routes = groups.map(group => ({
    ...group,
    requestedPins: [...new Set([...group.layers].map(namedPin).filter(pin => pin !== null))],
  }));
  const namedPins = new Set(routes.flatMap(({ requestedPins }) => requestedPins.filter(pin => pins.includes(pin))));
  const warnings = [];

  for (const { svgColor, layers, strips, existingStripIds, requestedPins } of routes) {
    const label = svgColor ? `SVG color ${svgColor}` : [...layers][0].name;
    const existingRuns = next.runs.filter(run => existingStripIds.includes(run.source?.stripId));
    let output = next.outputs.find(item => existingRuns.some(run => item.runIds.includes(run.id)));
    if (!output) {
      const used = new Set(next.outputs.filter(item => item.runIds.length).map(item => item.pin));
      const preferred = requestedPins.find(pin => pins.includes(pin) && !used.has(pin));
      const pin = preferred ?? pins.find(pin => !used.has(pin) && !namedPins.has(pin))
        ?? pins.find(pin => !used.has(pin));
      output = next.outputs.find(item => item.pin === pin);
      if (!output && pin !== undefined) {
        const emptyOutput = next.outputs.find(item => !item.runIds.length);
        if (emptyOutput) {
          output = emptyOutput;
          output.pin = pin;
        } else if (next.outputs.length < maxOutputs) {
          let index = 1;
          while (next.outputs.some(item => item.id === `out${index}`)) index += 1;
          output = { id: `out${index}`, name: `Output ${index}`, pin, runIds: [] };
          next.outputs.push(output);
        }
      }
      if (!output) return { ok: false, error: `No separate GPIO output is available for ${label}.` };
    }
    if (requestedPins.some(pin => pin !== output.pin)) warnings.push(`${label} uses GPIO ${output.pin}. Review the output assignment.`);
    const newRuns = makeDefaultWiring(strips).runs;
    next.runs.push(...newRuns);
    output.runIds.push(...newRuns.map(run => run.id));
  }
  next.locked = false;
  next.verified = false;
  next.runs.forEach(run => { run.verified = false; });
  return { ok: true, wiring: next, warning: warnings.join(' ') };
}

// SVG ports edit complete physical runs exclusively. Keep any cut runs on
// their Advanced wiring route instead of guessing which end should move.
export function svgLayerWireGeometry(compiled, strips, hidden = {}) {
  const stripsById = new Map(strips.map(strip => [strip.id, strip]));
  const counts = new Map();
  const ports = new Map();
  const jumpers = [];
  if (!compiled?.ok) return { ports, jumpers };
  for (const run of compiled.runs) {
    const stripId = run.source?.stripId;
    counts.set(stripId, (counts.get(stripId) || 0) + 1);
  }
  let previous = null;
  for (const run of compiled.runs) {
    if (run.type === 'cable') continue;
    const stripId = run.source?.stripId;
    const strip = stripsById.get(stripId);
    if (run.type !== 'strip' || !strip || hidden[stripId] || !run.count) {
      previous = null;
      continue;
    }
    const a = compiled.pixels[run.start];
    const b = compiled.pixels[run.start + run.count - 1];
    const from = run.reversed ? b : a;
    const to = run.reversed ? a : b;
    const layerId = svgLayerStripId(strip);
    const item = { runId: run.id, stripId, layerId, outputId: run.outputId, name: strip.name, in: from, out: to };
    if (layerId && counts.get(stripId) === 1) ports.set(stripId, item);
    if (previous?.outputId === item.outputId && (previous.layerId || item.layerId) && previous.stripId !== stripId) {
      jumpers.push({ from: previous, to: item });
    }
    previous = item;
  }
  return { ports, jumpers };
}
