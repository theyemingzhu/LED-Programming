// The wiring panel's two read-outs: the strip schedule and the build sheet.
//
// Every figure here already existed somewhere in the app — the compiled wiring
// knows each run's first pixel and how many it carries, the strips know their
// drawn length, and controllerProfiles has estimated the power budget since
// long before this file. What did not exist was one place that put them in the
// order somebody solders in, so the panel showed "1 strip · 44 LEDs" and kept
// the rest folded away under Wire tools.
//
// Nothing is invented. Where a number cannot be known — a pitch needs two LEDs
// to have a gap between them, a headroom needs a supply the owner has actually
// named — the field comes back null and the panel says so rather than printing
// a confident guess onto something that will be wired to mains.

import { estimatePowerBudget } from './controllerProfiles.js';
import { readPowerSupplySettings } from './powerSupplySettings.js';

// DrawModePanel's own fallback, kept identical: 96 CSS px per inch over 25.4mm.
const DEFAULT_PX_PER_MM = 3.7795;

function scaleOf(pxPerMm) {
  return Number.isFinite(pxPerMm) && pxPerMm > 0 ? pxPerMm : DEFAULT_PX_PER_MM;
}

export function stripLengthMm(strip, pxPerMm) {
  const px = Number(strip?.svgLength);
  if (!Number.isFinite(px) || px <= 0) return null;
  return px / scaleOf(pxPerMm);
}

// Centre-to-centre spacing. A one-LED strip has no gap to measure, so this is
// null rather than the strip's whole length — which is what dividing by zero
// gaps would otherwise imply.
export function stripPitchMm(strip, ledCount, pxPerMm) {
  const lengthMm = stripLengthMm(strip, pxPerMm);
  if (lengthMm === null) return null;
  const gaps = Number(ledCount) - 1;
  if (!Number.isFinite(gaps) || gaps < 1) return null;
  return lengthMm / gaps;
}

/**
 * The strips in the order the data line reaches them, each with the block of
 * pixel addresses it answers to.
 *
 * Order comes from the compiled wiring when there is one, because that is the
 * order somebody physically solders and the order the card addresses. Before a
 * wire plan exists the strips are still worth listing, so they fall back to
 * their own order with ranges counted off the same way — flagged `planned:
 * false` so the caller can say which it is showing.
 */
export function buildStripSchedule({ strips = [], compiledWiring = null, pxPerMm = 0 } = {}) {
  const stripsById = new Map((strips || []).map(strip => [String(strip?.id), strip]));
  const rows = [];

  const runs = compiledWiring?.ok ? (compiledWiring.runs || []) : [];
  const pinByOutputId = new Map((compiledWiring?.outputs || []).map(output => [output?.id, output?.pin]));

  if (runs.length) {
    for (const run of runs) {
      // Cable runs carry no pixels; they are the gap between two strips, not a
      // row of the schedule.
      if (!run || run.type !== 'strip' || !Number(run.count)) continue;
      // A run points at its strip through `source`, not a flat `stripId` — the
      // source also carries which slice of that strip the run covers. Reading
      // the flat key looked right and silently found nothing, so every row
      // showed the name "undefined" and no pitch, because the strip it needed
      // the length from was never located.
      const stripId = String(run.source?.stripId ?? run.stripId ?? '');
      const strip = stripsById.get(stripId);
      const leds = Number(run.count);
      const start = Number(run.start) || 0;
      rows.push({
        index: rows.length + 1,
        stripId,
        name: strip?.name || stripId || 'Unnamed strip',
        color: strip?.color || null,
        leds,
        from: start + 1,
        to: start + leds,
        lengthMm: stripLengthMm(strip, pxPerMm),
        pitchMm: stripPitchMm(strip, leds, pxPerMm),
        angleDeg: Number.isFinite(Number(strip?.angle)) ? Number(strip.angle) : null,
        pin: pinByOutputId.has(run.outputId) ? pinByOutputId.get(run.outputId) : null,
        planned: true,
      });
    }
    return rows;
  }

  let cursor = 0;
  for (const strip of strips || []) {
    const leds = Array.isArray(strip?.pixels) ? strip.pixels.length : 0;
    if (!leds) continue;
    rows.push({
      index: rows.length + 1,
      stripId: String(strip.id),
      name: strip?.name || String(strip.id),
      color: strip?.color || null,
      leds,
      from: cursor + 1,
      to: cursor + leds,
      lengthMm: stripLengthMm(strip, pxPerMm),
      pitchMm: stripPitchMm(strip, leds, pxPerMm),
      angleDeg: Number.isFinite(Number(strip?.angle)) ? Number(strip.angle) : null,
      pin: null,
      planned: false,
    });
    cursor += leds;
  }
  return rows;
}

/**
 * What somebody needs in front of them to wire the piece: the run in order, how
 * much of it there is, and whether the supply can carry it.
 *
 * `power.declared` is the honest part. readPowerSupplySettings always answers,
 * falling back to a 5 A supply at 12 mA a pixel, so a sheet that simply printed
 * its numbers would state a headroom for a power supply nobody has told it
 * about. When the owner has not named one, the draw is still real — it depends
 * only on the LED count — but the verdict is withheld.
 */
export function buildRunSheet({
  strips = [],
  compiledWiring = null,
  pxPerMm = 0,
  standaloneController = null,
} = {}) {
  const rows = buildStripSchedule({ strips, compiledWiring, pxPerMm });
  const totalLeds = rows.reduce((sum, row) => sum + row.leds, 0);
  const totalLengthMm = rows.reduce(
    (sum, row) => (row.lengthMm === null ? sum : sum + row.lengthMm),
    0,
  );
  const lengthKnown = rows.length > 0 && rows.every(row => row.lengthMm !== null);

  const outputs = [];
  for (const row of rows) {
    const found = outputs.find(entry => entry.pin === row.pin);
    if (found) found.leds += row.leds;
    else outputs.push({ pin: row.pin, leds: row.leds });
  }

  const supply = readPowerSupplySettings(standaloneController);
  const declared = Number.isFinite(Number(standaloneController?.led?.psuAmps))
    && Number(standaloneController.led.psuAmps) > 0;
  const budget = estimatePowerBudget({
    led: {
      length: totalLeds,
      maxBrightness: standaloneController?.led?.maxBrightness,
    },
    power: { milliampsPerPixel: supply.milliampsPerPixel, psuAmps: supply.psuAmps },
  });

  return {
    rows,
    planned: rows.length > 0 && rows.every(row => row.planned),
    totalLeds,
    totalLengthMm: lengthKnown ? totalLengthMm : null,
    outputs,
    // One data line means one continuous run — the thing the panel used to
    // claim in prose without ever checking how many outputs were in play.
    continuous: outputs.length === 1,
    power: {
      declared,
      milliampsPerPixel: supply.milliampsPerPixel,
      psuAmps: declared ? supply.psuAmps : null,
      maxAmps: budget.maxAmps,
      safeAmps: declared ? budget.safeAmps : null,
      headroomAmps: declared ? budget.headroomAmps : null,
      status: declared ? budget.status : 'unknown',
    },
  };
}

export function formatMillimetres(mm, digits = 1) {
  if (mm === null || !Number.isFinite(mm)) return '—';
  if (mm >= 1000) return `${(mm / 1000).toFixed(2)} m`;
  return `${mm.toFixed(digits)} mm`;
}

export function formatAmps(amps) {
  if (amps === null || !Number.isFinite(amps)) return '—';
  return `${amps.toFixed(2)} A`;
}
