import { LED_COUNT_MAX } from './controlScale.js';

const formatted = value => Number(value).toLocaleString('en-US');

export function allocateLedCountsByLength(strips = [], requestedTotal, maxPerStrip = LED_COUNT_MAX) {
  const total = Number(requestedTotal);
  const count = strips.length;
  if (!count) return { ok: false, error: 'Create at least one LED strip first.' };
  if (!Number.isSafeInteger(total)) return { ok: false, error: 'Enter a whole number of LEDs.' };
  if (total < count) {
    return { ok: false, error: `Enter at least ${formatted(count)} LEDs so every strip has one.` };
  }
  const maximum = count * maxPerStrip;
  if (total > maximum) {
    return { ok: false, error: `Enter no more than ${formatted(maximum)} LEDs for ${count} strips.` };
  }

  const lengths = strips.map(strip => Number(strip?.svgLength));
  if (lengths.some(length => !Number.isFinite(length) || length <= 0)) {
    return { ok: false, error: 'Every strip needs measurable artwork before its LEDs can be distributed.' };
  }
  const lengthTotal = lengths.reduce((sum, length) => sum + length, 0);
  const ideals = lengths.map(length => total * length / lengthTotal);
  const counts = ideals.map(ideal => Math.max(1, Math.min(maxPerStrip, Math.floor(ideal))));
  let assigned = counts.reduce((sum, value) => sum + value, 0);

  while (assigned < total) {
    let best = -1;
    for (let index = 0; index < counts.length; index += 1) {
      if (counts[index] >= maxPerStrip) continue;
      if (best < 0 || ideals[index] - counts[index] > ideals[best] - counts[best]) best = index;
    }
    if (best < 0) return { ok: false, error: 'That LED total cannot be represented by these strips.' };
    counts[best] += 1;
    assigned += 1;
  }
  while (assigned > total) {
    let best = -1;
    for (let index = 0; index < counts.length; index += 1) {
      if (counts[index] <= 1) continue;
      if (best < 0 || counts[index] - ideals[index] > counts[best] - ideals[best]) best = index;
    }
    if (best < 0) return { ok: false, error: 'That LED total cannot be represented by these strips.' };
    counts[best] -= 1;
    assigned -= 1;
  }

  return { ok: true, counts };
}

export function derivePxPerMmFromCounts(strips = [], { defaultDensity, stripDensities = {} } = {}) {
  if (!strips.length) return null;
  let totalSvgLength = 0;
  let totalPhysicalMm = 0;
  for (const strip of strips) {
    const length = Number(strip?.svgLength);
    const pixelCount = Number(strip?.pixelCount);
    const ownDensity = Number(stripDensities[strip?.id]);
    const density = Number.isFinite(ownDensity) && ownDensity > 0 ? ownDensity : Number(defaultDensity);
    if (!(length > 0) || !Number.isSafeInteger(pixelCount) || pixelCount < 1 || !(density > 0)) return null;
    totalSvgLength += length;
    totalPhysicalMm += (pixelCount / density) * 1000;
  }
  const scale = totalSvgLength / totalPhysicalMm;
  return Number.isFinite(scale) && scale > 0 ? scale : null;
}
