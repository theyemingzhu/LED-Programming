import { CARD_HARDWARE_CONTRACT } from './cardHardwareContract.js';

// Splitting one drawn strip into two, or dividing it into several.
//
// The inverse of "Combine into one strip": a single reel becomes several
// named strips that still run in the same order on the same output, so an
// owner can map one continuous run across several layers of the artwork (or
// several zones of one layer) and light each one independently.

// The card renders each strip as its own zone, so an owner can never divide a
// strip into more sections than the card can address as zones.
export const MAX_SPLIT_SECTIONS = CARD_HARDWARE_CONTRACT.maxZones;

// A cut divides a physical reel, so the LED total never changes. The
// remainder is spread evenly starting from the first section — 41 into 2
// gives 21 + 20 (matching where an owner would actually cut a reel of 41),
// 41 into 4 gives 11, 10, 10, 10, and 41 into 3 gives 14, 14, 13.
//
// `sections` defaults to 2 and the resulting `head`/`tail` fields are always
// present (head = counts[0], tail = total - counts[0]) so every existing
// two-way caller keeps reading exactly what it read before — the two-way
// split is byte-identical to calling this with no second argument.
export function planStripSplitCounts(pixelCount, sections = 2) {
  const total = Math.max(0, Math.trunc(Number(pixelCount) || 0));
  if (total < 2) return null;
  const requested = Math.trunc(Number(sections));
  const n = Math.max(2, Math.min(
    MAX_SPLIT_SECTIONS,
    total,
    Number.isFinite(requested) ? requested : 2,
  ));
  if (n < 2) return null;
  const base = Math.floor(total / n);
  const remainder = total - base * n;
  const counts = Array.from({ length: n }, (_, index) => base + (index < remainder ? 1 : 0));
  return { counts, total, sections: n, head: counts[0], tail: total - counts[0] };
}

// Where along the path the cut falls, as a 0..1 fraction of its length.
// `reversed` strips are sampled end-first, so their first half is the far end
// of the path and the fraction is mirrored.
export function splitFractionForCounts(counts, reversed = false) {
  if (!counts) return null;
  const fraction = counts.head / counts.total;
  return reversed ? 1 - fraction : fraction;
}

// Trace part of a path as a path of its own. Sampled densely rather than cut
// analytically, so half of a circle still draws as an arc and not as a chord.
export function pathSegment(pathData, fromFraction, toFraction, { spacing = 3, minPoints = 24 } = {}) {
  const element = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  element.setAttribute('d', String(pathData || ''));
  if (typeof element.getTotalLength !== 'function') return null;
  const total = element.getTotalLength();
  if (!(total > 0)) return null;
  const from = Math.max(0, Math.min(1, Number(fromFraction)));
  const to = Math.max(0, Math.min(1, Number(toFraction)));
  if (!(to > from)) return null;
  const span = (to - from) * total;
  const steps = Math.max(minPoints, Math.ceil(span / spacing));
  const points = [];
  for (let i = 0; i <= steps; i += 1) {
    const point = element.getPointAtLength((from + (to - from) * (i / steps)) * total);
    points.push(`${point.x.toFixed(2)},${point.y.toFixed(2)}`);
  }
  return `M ${points.join(' L ')}`;
}

// The two path halves in LED order: `head` holds LED 1 onward, `tail` the rest.
export function splitStripPaths(pathData, counts, reversed = false, options = {}) {
  const cut = splitFractionForCounts(counts, reversed);
  if (cut == null) return null;
  // Reversed strips run end-first, so the head of the LED run is the tail of
  // the path and the two segments swap sides of the cut.
  const head = reversed
    ? pathSegment(pathData, cut, 1, options)
    : pathSegment(pathData, 0, cut, options);
  const tail = reversed
    ? pathSegment(pathData, 0, cut, options)
    : pathSegment(pathData, cut, 1, options);
  if (!head || !tail) return null;
  return { head, tail };
}

// "Ring" already taken → "Ring 2", then "Ring 3". Keeps the original row's
// name untouched so nothing the owner has labelled gets renamed underneath them.
export function nextSplitName(baseName, takenNames = []) {
  const taken = new Set(takenNames);
  const base = String(baseName || 'Strip').trim() || 'Strip';
  let suffix = 2;
  while (taken.has(`${base} ${suffix}`)) suffix += 1;
  return `${base} ${suffix}`;
}

// The N-1 interior cuts (as 0..1 fractions of the drawn path) that divide a
// strip into `counts.counts.length` LED-order pieces. Boundary N of N is
// always 1 and boundary 0 is always 0, so the returned array has one more
// entry than there are pieces.
export function splitBoundaryFractions(counts) {
  if (!counts?.counts?.length) return null;
  const { counts: parts, total } = counts;
  if (!(total > 0)) return null;
  const cumulative = [0];
  let running = 0;
  for (const part of parts) {
    running += part;
    cumulative.push(running / total);
  }
  return cumulative;
}

// The N path pieces in LED order, generalising splitStripPaths above to any
// section count. `reversed` strips are sampled end-first: LED order and path
// order run opposite ways, so LED-order piece i sits at the MIRRORED path
// range — verified against splitStripPaths for N=2, where this produces the
// identical head/tail path pair it always has.
export function splitStripPathsN(pathData, counts, reversed = false, options = {}) {
  const cumulative = splitBoundaryFractions(counts);
  if (!cumulative) return null;
  const pieceCount = cumulative.length - 1;
  const segments = [];
  for (let index = 0; index < pieceCount; index += 1) {
    const from = reversed ? 1 - cumulative[index + 1] : cumulative[index];
    const to = reversed ? 1 - cumulative[index] : cumulative[index + 1];
    const segment = pathSegment(pathData, from, to, options);
    if (!segment) return null;
    segments.push(segment);
  }
  return segments;
}

// N names for a divided strip, suffixed 1..N ("Ring 1", "Ring 2", "Ring 3"…).
// This is deliberately its own naming rule, separate from nextSplitName
// above: nextSplitName's "keep the original name on the first half" behaviour
// is asserted byte-for-byte by tests/layout-strip-split.spec.ts for the
// existing two-way Split control, so it stays untouched. Dividing into
// several sections is a new, separate control and gets a naming rule that
// reads correctly for any N, including 2.
export function nextSplitNames(baseName, count, takenNames = []) {
  const taken = new Set(takenNames);
  const base = String(baseName || 'Strip').trim() || 'Strip';
  const names = [];
  for (let index = 1; index <= count; index += 1) {
    let suffix = index;
    let candidate = `${base} ${suffix}`;
    while (taken.has(candidate)) {
      suffix += 1;
      candidate = `${base} ${suffix}`;
    }
    taken.add(candidate);
    names.push(candidate);
  }
  return names;
}
