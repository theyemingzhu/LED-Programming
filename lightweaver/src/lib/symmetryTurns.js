// Sides by turning: a piece with 3, 5, 6 or 8 matching sides around a
// centre (a six-petal mandala), and the "amber copies" that let the owner see
// whether a number of sides fits.
//
// symmetrySuggest.js owns two sides (a mirror line) and four sides (quarter
// turns or two mirror lines). Everything else is a plain turn of 360/fold
// degrees about the centre and lives here. Both return the same suggestion
// shape, so pieceSymmetry.setSymmetryFold takes either.
//
// Geometry only. Nothing here changes a strip or stores anything.

import { matchStripUnder, stripCentroid } from './mirrorPartners.js';

// This close to the centre, as a share of the piece's reach, is the centre: a
// centre ring belongs to no side. Same band symmetrySuggest uses for four sides.
const ON_CENTRE_BAND = 0.15;
// Points sampled per strip when measuring how well copies land.
const FIT_SAMPLES = 24;

const finite = point => point && Number.isFinite(point.x) && Number.isFinite(point.y);
const pointsOf = strip => (strip?.pixels || []).filter(finite);
const weightOf = strip => pointsOf(strip).length;
const sum = (list, fn) => list.reduce((total, item) => total + fn(item), 0);
const mod = (value, modulus) => ((value % modulus) + modulus) % modulus;

function reachFrom(centre, strips) {
  let reach = 0;
  for (const strip of strips) {
    for (const point of pointsOf(strip)) reach = Math.max(reach, Math.hypot(point.x - centre.x, point.y - centre.y));
  }
  return reach;
}

// Screen coordinates: y grows downward, so a positive turn is clockwise.
export function turnAbout(centre, degrees) {
  const radians = degrees * Math.PI / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return point => {
    const x = point.x - centre.x;
    const y = point.y - centre.y;
    return { x: centre.x + x * cos - y * sin, y: centre.y + x * sin + y * cos };
  };
}

const reflectAbout = (centre, fn) => point => {
  const [x, y] = fn(point.x - centre.x, point.y - centre.y);
  return { x: x + centre.x, y: y + centre.y };
};

// Clockwise angle of a strip's middle, measured from straight up.
function clockAngle(centre, strip) {
  const mid = stripCentroid(strip);
  return mod(Math.atan2(mid.y - centre.y, mid.x - centre.x) * 180 / Math.PI + 90, 360);
}

/**
 * Where the first dividing line goes, in clockwise degrees from straight up,
 * so that the lines fall in the widest gap between strips and do not cut a
 * petal in half. 0..(360/fold).
 */
export function dividingLineStart(strips, centre, fold) {
  const wedge = 360 / fold;
  const angles = strips.map(strip => mod(clockAngle(centre, strip), wedge)).sort((a, b) => a - b);
  if (!angles.length) return 0;
  let best = { gap: -1, at: 0 };
  angles.forEach((angle, index) => {
    const next = index + 1 < angles.length ? angles[index + 1] : angles[0] + wedge;
    const gap = next - angle;
    if (gap > best.gap + 1e-9) best = { gap, at: angle + gap / 2 };
  });
  return mod(best.at, wedge);
}

/**
 * Place strips into `fold` sides by turning about `centre`.
 *
 * Returns the suggestSymmetry shape:
 *   { fold, split: null, orientation, score, sides: [{ id, label, stripIds }],
 *     onOwn: [stripId], matched: [[one strip per side]], start }
 * `start` is where the first dividing line sits (see dividingLineStart).
 */
export function turnSides(strips, centre, fold, { start = null } = {}) {
  const wedge = 360 / fold;
  const band = ON_CENTRE_BAND * reachFrom(centre, strips);
  const distance = strip => {
    const mid = stripCentroid(strip);
    return Math.hypot(mid.x - centre.x, mid.y - centre.y);
  };
  const own = strips.filter(strip => distance(strip) <= band);
  const sided = strips.filter(strip => distance(strip) > band);
  // The first line sits just anticlockwise of straight up, so side 1 is the
  // side at the top of the piece and the rest follow clockwise.
  const from = (Number.isFinite(start) ? mod(start, wedge) : dividingLineStart(sided, centre, fold)) - wedge;
  const sectorAngle = strip => mod(clockAngle(centre, strip) - from, 360);
  const turns = Array.from({ length: fold - 1 }, (_, index) => turnAbout(centre, (index + 1) * wedge));

  const remaining = sided.slice().sort((a, b) => weightOf(b) - weightOf(a));
  const orbits = [];
  const unmatched = [];
  while (remaining.length) {
    const lead = remaining.shift();
    const picks = [];
    for (const turn of turns) {
      let pick = null;
      for (const candidate of remaining) {
        if (picks.some(taken => taken.strip === candidate)) continue;
        const match = matchStripUnder(lead, candidate, turn);
        if (match.likely && (!pick || match.score < pick.score)) pick = { strip: candidate, score: match.score, needsFlip: match.needsFlip };
      }
      if (!pick) break;
      picks.push(pick);
    }
    if (picks.length !== turns.length) { unmatched.push(lead); continue; }
    picks.forEach(pick => remaining.splice(remaining.indexOf(pick.strip), 1));
    const members = [{ strip: lead, needsFlip: false }, ...picks]
      .sort((a, b) => sectorAngle(a.strip) - sectorAngle(b.strip));
    // Flips are relative to whichever member leads its side.
    const base = members[0].needsFlip;
    orbits.push(members.map(member => ({ strip: member.strip, flipped: member.needsFlip !== base })));
  }

  // Alternate sides drawn the other way round play reversed ('mirror'). That
  // only closes up on an even number of sides.
  const alternates = orbit => orbit.every((member, index) => member.flipped === (index % 2 === 1));
  const allSame = orbit => orbit.every(member => !member.flipped);
  const orbitWeight = orbit => sum(orbit, member => weightOf(member.strip));
  const sameWeight = sum(orbits.filter(allSame), orbitWeight);
  const mirrorWeight = fold % 2 === 0 ? sum(orbits.filter(alternates), orbitWeight) : 0;
  const orientation = mirrorWeight > sameWeight ? 'mirror' : 'same';
  const sidedWeight = sum(sided, weightOf);
  const score = sidedWeight > 0 ? Math.max(sameWeight, mirrorWeight) / sidedWeight : 0;

  const ordered = orbits.slice().sort((p, q) => (distance(p[0].strip) - distance(q[0].strip)) || (sectorAngle(p[0].strip) - sectorAngle(q[0].strip)));
  const sides = Array.from({ length: fold }, (_, index) => {
    const ids = ordered.map(orbit => orbit[index].strip.id);
    if (orientation === 'mirror' && index % 2 === 1) ids.reverse();
    return { id: `side-${index + 1}`, label: `Side ${index + 1}`, stripIds: ids };
  });
  unmatched
    .sort((a, b) => distance(a) - distance(b))
    .forEach(strip => {
      const sector = Math.min(fold - 1, Math.floor(sectorAngle(strip) / wedge));
      sides[sector].stripIds.push(strip.id);
    });

  return {
    fold,
    split: null,
    orientation,
    score,
    sides,
    onOwn: own.map(strip => strip.id),
    matched: orbits.map(orbit => orbit.map(member => member.strip.id)),
    start: from,
  };
}

function sample(points, count = FIT_SAMPLES) {
  if (points.length <= count) return points;
  return Array.from({ length: count }, (_, index) => points[Math.round(index * (points.length - 1) / (count - 1))]);
}

function meanNearest(points, onto) {
  if (!points.length || !onto.length) return Infinity;
  let total = 0;
  for (const point of points) {
    let nearest = Infinity;
    for (const other of onto) {
      const d = (point.x - other.x) ** 2 + (point.y - other.y) ** 2;
      if (d < nearest) nearest = d;
    }
    total += Math.sqrt(nearest);
  }
  return total / points.length;
}

// The ways side 1 can be carried onto the other sides. Two sides mirror
// across a line or half-turn; four sides quarter-turn or mirror across two
// lines; every other count turns.
function copyFamilies(fold, centre) {
  const turns = Array.from({ length: fold - 1 }, (_, index) => turnAbout(centre, (index + 1) * 360 / fold));
  if (fold === 2) {
    return [
      [reflectAbout(centre, (x, y) => [-x, y])],
      [reflectAbout(centre, (x, y) => [x, -y])],
      turns,
    ];
  }
  if (fold === 4) {
    return [
      turns,
      [reflectAbout(centre, (x, y) => [-x, y]), turnAbout(centre, 180), reflectAbout(centre, (x, y) => [x, -y])],
    ];
  }
  return [turns];
}

/**
 * The amber copies: side 1's strips carried onto every other side about
 * `centre`. Right number of sides and right centre: every copy lands on a
 * real strip. Wrong: the copies sit beside the strips as doubled lines.
 *
 *   { copies: [{ sourceId, points: [{x, y}] }], distance }
 * `distance` is how far the copies sit from the real LEDs, as a share of the
 * piece's reach from the centre (0 = exactly on top). It only picks which way
 * to copy (turn or mirror); whether the count FITS is suggestSymmetry's
 * confidence, which forgives hand-drawn strips. Null symmetry or an empty
 * first side gives no copies.
 */
export function symmetryEchoes(strips, symmetry, centre) {
  const none = { copies: [], distance: Infinity };
  const fold = Number(symmetry?.fold);
  if (!(fold >= 2) || !finite(centre)) return none;
  const byId = new Map((strips || []).map(strip => [String(strip?.id), strip]));
  const sources = (symmetry.sides?.[0]?.stripIds || []).map(id => byId.get(String(id))).filter(strip => strip && pointsOf(strip).length >= 2);
  if (!sources.length) return none;
  const sourceIds = new Set(sources.map(strip => String(strip.id)));
  const sidedIds = new Set((symmetry.sides || []).flatMap(side => side.stripIds || []).map(String));
  const targets = (strips || [])
    .filter(strip => sidedIds.has(String(strip?.id)) && !sourceIds.has(String(strip.id)))
    .flatMap(strip => sample(pointsOf(strip)));
  const reach = reachFrom(centre, strips || []);
  if (!targets.length || !(reach > 0)) return none;

  let best = null;
  for (const family of copyFamilies(fold, centre)) {
    const copies = [];
    const landed = [];
    for (const strip of sources) {
      const points = pointsOf(strip);
      for (const transform of family) {
        const moved = points.map(transform);
        copies.push({ sourceId: String(strip.id), points: moved });
        landed.push(...sample(moved));
      }
    }
    // Both ways: every copy sits on a real LED, and every real LED outside
    // side 1 has a copy on it. One way alone calls four sides a fit on a
    // six-petal piece, whose top quarter does mirror onto the other three.
    const distance = Math.max(meanNearest(landed, targets), meanNearest(targets, landed)) / reach;
    if (!best || distance < best.distance) best = { copies, distance };
  }
  return best;
}
