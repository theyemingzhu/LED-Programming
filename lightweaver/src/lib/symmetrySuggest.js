// Studio's best guess at a piece's symmetry sides, from where the strips sit.
//
// suggestSymmetry(strips, fold, artwork?) places every strip into one of
// `fold` sides (2: left/right or top/bottom, 4: top, right, bottom, left) or
// leaves it on its own, and orders each side the way the pattern should flow
// through it. It never changes a strip and never stores anything: the Layout
// sidebar hands the result to pieceSymmetry.setSymmetryFold.
//
// How a guess is made:
// - Strips whose middle sits on the dividing line (two sides) or at the
//   centre (four sides) play on their own: a centre ring belongs to no side.
// - Strips are paired across the line with the same geometry test the rest
//   of Layout uses (mirrorPartners.matchStripUnder): a reflection, or a half
//   turn, carries one strip's LEDs onto its partner's. For four sides a strip
//   must find all three partners, by quarter turns or by the two reflections.
// - Which way round partners are drawn decides `orientation`. A pair drawn the
//   same way (both from the centre outward) plays correctly without reversing
//   the second side: 'same'. A pair drawn the opposite way needs the second
//   side reversed: 'mirror' (pieceSymmetry's flip rule), and the second side's
//   strips are listed in reverse so the whole run lines up.
// - A strip with no partner is still placed by where it sits, after the
//   matched ones. It just does not count towards confidence.
//
// `score` is the share of LEDs (on strips that belong to a side) whose strip
// found a partner drawn the agreed way round; `confidence` buckets it. The
// Layout offer card appears only for 'high'.

import { matchStripUnder, stripCentroid, stripsBoundsCentre } from './mirrorPartners.js';

// A strip whose middle is this close to the dividing line, as a share of the
// piece's reach from its centre, sits on the line.
const ON_AXIS_BAND = 0.08;
// Four sides: this close to the centre is the centre.
const ON_CENTRE_BAND = 0.15;
const HIGH_SCORE = 0.9;
const MEDIUM_SCORE = 0.6;

export const TWO_SIDE_LABELS = Object.freeze({
  x: Object.freeze(['Left side', 'Right side']),
  y: Object.freeze(['Top side', 'Bottom side']),
});
export const FOUR_SIDE_LABELS = Object.freeze(['Side 1', 'Side 2', 'Side 3', 'Side 4']);

export function symmetryConfidence(score) {
  if (score >= HIGH_SCORE) return 'high';
  if (score >= MEDIUM_SCORE) return 'medium';
  return 'low';
}

const finite = point => point && Number.isFinite(point.x) && Number.isFinite(point.y);
const weightOf = strip => (strip.pixels || []).filter(finite).length;
const sum = (list, fn) => list.reduce((total, item) => total + fn(item), 0);

function reachFrom(centre, strips) {
  let reach = 0;
  for (const strip of strips) {
    for (const point of strip.pixels || []) {
      if (finite(point)) reach = Math.max(reach, Math.hypot(point.x - centre.x, point.y - centre.y));
    }
  }
  return reach;
}

// Transforms about a centre, in screen coordinates (y grows downward, so a
// clockwise quarter turn carries the top of the piece to its right).
const about = (c, fn) => point => {
  const [x, y] = fn(point.x - c.x, point.y - c.y);
  return { x: x + c.x, y: y + c.y };
};
const T = {
  reflectX: c => about(c, (x, y) => [-x, y]),
  reflectY: c => about(c, (x, y) => [x, -y]),
  halfTurn: c => about(c, (x, y) => [-x, -y]),
  quarterCw: c => about(c, (x, y) => [-y, x]),
  quarterCcw: c => about(c, (x, y) => [y, -x]),
  diagonal: c => about(c, (x, y) => [y, x]),
  antiDiagonal: c => about(c, (x, y) => [-y, -x]),
};

// Greedy one-to-one pairing, closest matches first.
function pairAcross(first, second, transform) {
  const candidates = [];
  for (const a of first) {
    for (const b of second) {
      const match = matchStripUnder(a, b, transform);
      if (match.likely) candidates.push({ a, b, match });
    }
  }
  candidates.sort((left, right) => left.match.score - right.match.score);
  const used = new Set();
  const pairs = [];
  for (const candidate of candidates) {
    if (used.has(candidate.a.id) || used.has(candidate.b.id)) continue;
    used.add(candidate.a.id);
    used.add(candidate.b.id);
    pairs.push(candidate);
  }
  return pairs;
}

function twoSides(strips, centre, split) {
  const along = split; // the coordinate that tells the two sides apart
  const across = split === 'x' ? 'y' : 'x';
  const band = ON_AXIS_BAND * reachFrom(centre, strips);
  const placed = strips.map(strip => ({ strip, mid: stripCentroid(strip) }));
  const first = placed.filter(item => item.mid[along] < centre[along] - band).map(item => item.strip);
  const second = placed.filter(item => item.mid[along] > centre[along] + band).map(item => item.strip);
  const own = placed.filter(item => Math.abs(item.mid[along] - centre[along]) <= band).map(item => item.strip);

  let best = null;
  for (const transform of [split === 'x' ? T.reflectX(centre) : T.reflectY(centre), T.halfTurn(centre)]) {
    const pairs = pairAcross(first, second, transform);
    const forward = sum(pairs.filter(pair => !pair.match.needsFlip), pair => weightOf(pair.a) + weightOf(pair.b));
    const backward = sum(pairs.filter(pair => pair.match.needsFlip), pair => weightOf(pair.a) + weightOf(pair.b));
    const orientation = backward > forward ? 'mirror' : 'same';
    const sidedWeight = sum([...first, ...second], weightOf);
    const score = sidedWeight > 0 ? Math.max(forward, backward) / sidedWeight : 0;
    if (!best || score > best.score) best = { pairs, orientation, score };
  }

  const readingOrder = (a, b) => {
    const ma = stripCentroid(a); const mb = stripCentroid(b);
    return (ma[across] - mb[across]) || (ma[along] - mb[along]);
  };
  const pairs = best.pairs.slice().sort((p, q) => readingOrder(p.a, q.a));
  const matched = new Set(pairs.flatMap(pair => [pair.a.id, pair.b.id]));
  const leftovers = list => list.filter(strip => !matched.has(strip.id)).sort(readingOrder).map(strip => strip.id);
  const sideTwo = pairs.map(pair => pair.b.id);
  if (best.orientation === 'mirror') sideTwo.reverse();
  const labels = TWO_SIDE_LABELS[split];
  return {
    fold: 2,
    split,
    orientation: best.orientation,
    score: best.score,
    sides: [
      { id: 'side-1', label: labels[0], stripIds: [...pairs.map(pair => pair.a.id), ...leftovers(first)] },
      { id: 'side-2', label: labels[1], stripIds: [...sideTwo, ...leftovers(second)] },
    ],
    onOwn: own.map(strip => strip.id),
    matched: pairs.map(pair => [pair.a.id, pair.b.id]),
  };
}

// Clockwise angle from the top-left diagonal, so the top quarter sorts first,
// then right, bottom, left.
function clockwiseKey(centre, strip) {
  const mid = stripCentroid(strip);
  const degrees = Math.atan2(mid.y - centre.y, mid.x - centre.x) * 180 / Math.PI;
  return (((degrees + 135) % 360) + 360) % 360;
}

function fourSides(strips, centre) {
  const band = ON_CENTRE_BAND * reachFrom(centre, strips);
  const distance = strip => {
    const mid = stripCentroid(strip);
    return Math.hypot(mid.x - centre.x, mid.y - centre.y);
  };
  const own = strips.filter(strip => distance(strip) <= band);
  const sided = strips.filter(strip => distance(strip) > band);
  const families = [
    [T.quarterCw(centre), T.halfTurn(centre), T.quarterCcw(centre)],
    [T.reflectX(centre), T.halfTurn(centre), T.reflectY(centre)],
  ];
  const remaining = sided.slice().sort((a, b) => weightOf(b) - weightOf(a));
  const orbits = [];
  const unmatched = [];
  while (remaining.length) {
    const lead = remaining.shift();
    let best = null;
    for (const family of families) {
      const picks = [];
      let total = 0;
      for (const transform of family) {
        let pick = null;
        for (const candidate of remaining) {
          if (picks.includes(candidate)) continue;
          const match = matchStripUnder(lead, candidate, transform);
          if (match.likely && (!pick || match.score < pick.score)) pick = { strip: candidate, score: match.score };
        }
        if (!pick) break;
        picks.push(pick.strip);
        total += pick.score;
      }
      if (picks.length === family.length && (!best || total < best.total)) best = { picks, total };
    }
    if (!best) { unmatched.push(lead); continue; }
    best.picks.forEach(pick => remaining.splice(remaining.indexOf(pick), 1));
    orbits.push([lead, ...best.picks].sort((a, b) => clockwiseKey(centre, a) - clockwiseKey(centre, b)));
  }

  // Which way round side 2 is drawn, compared with side 1, decides whether
  // alternate sides play reversed.
  const neighbourTransforms = [T.quarterCw, T.quarterCcw, T.reflectX, T.reflectY, T.diagonal, T.antiDiagonal]
    .map(make => make(centre));
  let forward = 0;
  let backward = 0;
  const flips = orbits.map(orbit => {
    let best = null;
    for (const transform of neighbourTransforms) {
      const match = matchStripUnder(orbit[0], orbit[1], transform);
      if (match.likely && (!best || match.score < best.score)) best = match;
    }
    const weight = sum(orbit, weightOf);
    if (best?.needsFlip) backward += weight; else forward += weight;
    return Boolean(best?.needsFlip);
  });
  const orientation = backward > forward ? 'mirror' : 'same';
  const sidedWeight = sum(sided, weightOf);
  const agreeing = sum(orbits.filter((_, index) => flips[index] === (orientation === 'mirror')), orbit => sum(orbit, weightOf));
  const score = sidedWeight > 0 ? agreeing / sidedWeight : 0;

  const ordered = orbits.slice().sort((p, q) => (distance(p[0]) - distance(q[0])) || (clockwiseKey(centre, p[0]) - clockwiseKey(centre, q[0])));
  const sides = FOUR_SIDE_LABELS.map((label, index) => {
    const ids = ordered.map(orbit => orbit[index].id);
    if (orientation === 'mirror' && index % 2 === 1) ids.reverse();
    return { id: `side-${index + 1}`, label, stripIds: ids };
  });
  unmatched
    .sort((a, b) => distance(a) - distance(b))
    .forEach(strip => {
      const sector = Math.min(3, Math.floor(clockwiseKey(centre, strip) / 90));
      sides[sector].stripIds.push(strip.id);
    });
  return {
    fold: 4, split: null, orientation, score, sides,
    onOwn: own.map(strip => strip.id),
    matched: orbits.map(orbit => orbit.map(strip => strip.id)),
  };
}

/**
 * Suggest how `strips` divide into `fold` sides (2 or 4).
 *
 * `artwork` may carry `centre: {x, y}` (the artwork's middle, or what
 * artworkSymmetry.detectArtworkSymmetry reports). The strips' own middle is
 * tried as well, and whichever explains more of the piece wins.
 *
 * Returns null for any other fold, else:
 *   { fold, orientation: 'mirror' | 'same', sides: [{ id, label, stripIds }],
 *     onOwn: [stripId], matched: [[partner ids]], split: 'x' | 'y' | null,
 *     centre, score, confidence }
 * `matched` lists the strips that found their partners (a pair, or four).
 */
export function suggestSymmetry(strips, fold, artwork = null) {
  if (fold !== 2 && fold !== 4) return null;
  const usable = (strips || []).filter(strip => strip?.id && (strip.pixels || []).filter(finite).length >= 2);
  const centres = [];
  if (finite(artwork?.centre)) centres.push({ x: artwork.centre.x, y: artwork.centre.y });
  const own = stripsBoundsCentre(usable);
  if (own && !centres.some(centre => Math.hypot(centre.x - own.x, centre.y - own.y) < 1e-6)) centres.push(own);

  let best = null;
  for (const centre of centres) {
    const options = fold === 2
      ? [twoSides(usable, centre, 'x'), twoSides(usable, centre, 'y')]
      : [fourSides(usable, centre)];
    for (const option of options) {
      if (!best || option.score > best.score + 1e-9) best = { ...option, centre };
    }
  }
  if (!best) {
    const labels = fold === 2 ? TWO_SIDE_LABELS.x : FOUR_SIDE_LABELS;
    best = {
      fold,
      split: fold === 2 ? 'x' : null,
      orientation: fold === 2 ? 'mirror' : 'same',
      score: 0,
      centre: null,
      sides: labels.map((label, index) => ({ id: `side-${index + 1}`, label, stripIds: [] })),
      onOwn: [],
      matched: [],
    };
  }
  // Strips with no LED positions yet still play: on their own.
  const placed = new Set([...best.sides.flatMap(side => side.stripIds), ...best.onOwn]);
  const onOwn = [...best.onOwn, ...(strips || []).filter(strip => strip?.id && !placed.has(strip.id)).map(strip => strip.id)];
  return { ...best, onOwn, confidence: symmetryConfidence(best.score) };
}

/**
 * Whether a suggestion is strong enough to offer unprompted on the artwork.
 * Beyond high confidence it needs two matched pairs of separate physical
 * strips: a strip and its fresh duplicate, or the parts of one divided
 * strip, trivially mirror each other and are not "two matching sides".
 * `familyOf(stripId)` names a strip's physical strip (null for a whole one).
 */
export function worthOffering(suggestion, familyOf = () => null) {
  if (suggestion?.confidence !== 'high') return false;
  const groups = suggestion.matched || [];
  if (groups.length < 2) return false;
  return groups.every(ids => {
    const families = ids.map(id => familyOf(id)).filter(Boolean);
    return new Set(families).size === families.length;
  });
}

/**
 * Where each strip sits in a stored symmetry, for numbering and tinting:
 * Map stripId -> { sideIndex, sideId, label, position (1-based), count }.
 */
export function symmetryStripPlaces(symmetry) {
  const places = new Map();
  (symmetry?.sides || []).forEach((side, sideIndex) => {
    const ids = side.stripIds || [];
    ids.forEach((stripId, index) => places.set(stripId, {
      sideIndex, sideId: side.id, label: side.label, position: index + 1, count: ids.length,
    }));
  });
  return places;
}

/**
 * The line two sides mirror across, for drawing on the artwork: the
 * perpendicular bisector between the two sides' middles, long enough to
 * cross every strip. Null unless there are two non-empty sides.
 *   { x1, y1, x2, y2, middles: [side 1 middle, side 2 middle] }
 */
export function symmetryAxisLine(symmetry, strips = []) {
  if (symmetry?.fold !== 2 || symmetry.sides?.length !== 2) return null;
  const byId = new Map((strips || []).map(strip => [strip.id, strip]));
  const middles = symmetry.sides.map(side => {
    const points = (side.stripIds || []).flatMap(id => (byId.get(id)?.pixels || []).filter(finite));
    if (!points.length) return null;
    return { x: sum(points, point => point.x) / points.length, y: sum(points, point => point.y) / points.length };
  });
  if (middles.some(middle => !middle)) return null;
  const [a, b] = middles;
  const dx = b.x - a.x; const dy = b.y - a.y;
  const length = Math.hypot(dx, dy);
  if (!(length > 0)) return null;
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const all = (strips || []).filter(strip => (strip.pixels || []).some(finite));
  const reach = Math.max(length, reachFrom(mid, all)) * 1.08;
  const ux = -dy / length; const uy = dx / length;
  return { x1: mid.x - ux * reach, y1: mid.y - uy * reach, x2: mid.x + ux * reach, y2: mid.y + uy * reach, middles: [a, b] };
}
