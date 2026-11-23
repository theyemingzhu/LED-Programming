// Areas: the owner's strips grouped by what they ARE. An area is a set of
// look-alike strips; each copy of it is one shape (a petal, a side circle).
//
// With a centre and a number of sides, strips that land on each other when the
// piece is turned about the centre are copies of one area (the same orbit
// matching the symmetry sides use: matchStripUnder). A strip near the centre
// belongs to no side and is its own area. Copies run clockwise from the top.
// Two things then merge, only when they are clearly one thing:
//   - a petal's two mirrored edges that meet at a tip become ONE shape
//   - two orbits at the same radius, same size and shape (the circles either
//     side of a petal) become one area with all their copies interleaved
// Anything that does not match, with no symmetry, or with no positions: each
// strip is its own area with one copy. A wrong guess here is worse than none,
// so `together` lets the owner say "these belong together" by hand.
//
// Returns { areas: [{ id, name, copies: [[stripId, ...]] }], flips, source }.
// `flips[stripId]` is true when the strip's LED 1 is at the far end of its
// shape (shape 0 should be the end nearer the centre, or the lead's direction).

import { matchStripUnder, stripCentroid } from '../mirrorPartners.js';
import { turnAbout } from '../symmetryTurns.js';

const ON_CENTRE_BAND = 0.15;
const finite = point => point && Number.isFinite(point.x) && Number.isFinite(point.y);
const pointsOf = strip => (strip?.pixels || []).filter(finite);
const mod = (value, modulus) => ((value % modulus) + modulus) % modulus;
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

function pathLength(points) {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) total += dist(points[i - 1], points[i]);
  return total;
}

// Clockwise degrees from straight up (screen y grows downward).
const angleOf = (centre, point) => mod(Math.atan2(point.y - centre.y, point.x - centre.x) * 180 / Math.PI + 90, 360);

function meanPoint(strips) {
  const mids = strips.map(stripCentroid).filter(Boolean);
  return { x: mids.reduce((s, m) => s + m.x, 0) / mids.length, y: mids.reduce((s, m) => s + m.y, 0) / mids.length };
}

function ends(strip) {
  const points = pointsOf(strip);
  return [points[0], points[points.length - 1]];
}

const areaId = copies => `area-${copies[0][0]}`;

export function deriveAreas(strips = [], { fold = 0, centre = null, together = [] } = {}) {
  const list = (strips || []).filter(strip => strip && strip.id != null);
  const flips = {};
  let groups = []; // each: array of copies, each copy an array of strips
  let source = 'strips';
  const positioned = list.filter(strip => pointsOf(strip).length >= 2);
  const unpositioned = list.filter(strip => pointsOf(strip).length < 2);

  if (fold >= 2 && finite(centre) && positioned.length >= 2) {
    source = 'turns';
    const reach = Math.max(...positioned.flatMap(strip => pointsOf(strip).map(point => dist(point, centre))));
    const radiusOf = strip => dist(stripCentroid(strip), centre);
    const band = ON_CENTRE_BAND * reach;
    const centred = positioned.filter(strip => radiusOf(strip) <= band);
    const sided = positioned.filter(strip => radiusOf(strip) > band);
    const wedge = 360 / fold;
    const turns = Array.from({ length: fold - 1 }, (_, index) => turnAbout(centre, (index + 1) * wedge));
    const remaining = sided.slice().sort((a, b) => pointsOf(b).length - pointsOf(a).length);
    const orbits = [];
    const loose = [];
    while (remaining.length) {
      const lead = remaining.shift();
      const picks = [];
      for (const turn of turns) {
        let pick = null;
        for (const candidate of remaining) {
          if (picks.some(taken => taken.strip === candidate)) continue;
          const match = matchStripUnder(lead, candidate, turn);
          if (match.likely && (!pick || match.score < pick.score)) pick = { strip: candidate, score: match.score, flip: match.needsFlip };
        }
        if (!pick) break;
        picks.push(pick);
      }
      if (picks.length !== turns.length) { loose.push(lead); continue; }
      picks.forEach(pick => { remaining.splice(remaining.indexOf(pick.strip), 1); flips[pick.strip.id] = pick.flip; });
      orbits.push([lead, ...picks.map(pick => pick.strip)]);
    }
    const stat = orbit => ({
      radius: orbit.reduce((s, strip) => s + radiusOf(strip), 0) / orbit.length,
      length: orbit.reduce((s, strip) => s + pathLength(pointsOf(strip)), 0) / orbit.length,
      count: orbit.reduce((s, strip) => s + pointsOf(strip).length, 0) / orbit.length,
    });
    const stats = orbits.map(stat);
    const used = new Set();
    orbits.forEach((orbit, i) => {
      if (used.has(i)) return;
      used.add(i);
      let mate = -1;
      for (let j = i + 1; j < orbits.length && mate < 0; j += 1) {
        if (used.has(j)) continue;
        const a = stats[i];
        const b = stats[j];
        if (Math.abs(a.radius - b.radius) <= 0.05 * reach
          && Math.min(a.length, b.length) / Math.max(a.length, b.length) >= 0.85
          && Math.min(a.count, b.count) / Math.max(a.count, b.count) >= 0.8) mate = j;
      }
      if (mate < 0) { groups.push(orbit.map(strip => [strip])); return; }
      used.add(mate);
      const other = orbits[mate];
      // Edges that meet at a tip are one shape; otherwise they are separate shapes of one area.
      const pairs = orbit.map(a => {
        const near = other.map(b => ({ b, gap: Math.min(...ends(a).flatMap(p => ends(b).map(q => dist(p, q)))) }))
          .sort((p, q) => p.gap - q.gap)[0];
        return { a, b: near.b, gap: near.gap };
      });
      const touching = pairs.every(pair => pair.gap <= 0.12 * pathLength(pointsOf(pair.a)))
        && new Set(pairs.map(pair => pair.b)).size === other.length;
      groups.push(touching ? pairs.map(pair => [pair.a, pair.b]) : [...orbit, ...other].map(strip => [strip]));
    });
    centred.forEach(strip => groups.push([[strip]]));
    loose.forEach(strip => groups.push([[strip]]));
  } else {
    groups = positioned.map(strip => [[strip]]);
  }
  unpositioned.forEach(strip => groups.push([[strip]]));

  // The owner's own groupings win over the guess.
  for (const ids of together || []) {
    const wanted = new Set(ids);
    const picked = [];
    groups = groups.map(group => group.map(copy => copy.filter(strip => {
      if (wanted.has(strip.id)) { picked.push(strip); return false; }
      return true;
    })).filter(copy => copy.length)).filter(group => group.length);
    if (picked.length) groups.push(ids.map(id => picked.find(strip => strip.id === id)).filter(Boolean).map(strip => [strip]));
  }

  const hasCentre = finite(centre) && positioned.length > 0;
  const radius = group => {
    const all = group.flat();
    if (!hasCentre || !all.every(strip => pointsOf(strip).length >= 2)) return Infinity;
    return all.reduce((sum, strip) => sum + dist(stripCentroid(strip), centre), 0) / all.length;
  };
  const ordered = groups.map((group, index) => {
    const copies = group.slice();
    if (hasCentre && copies.length > 1 && copies.every(copy => copy.every(strip => pointsOf(strip).length >= 2))) {
      copies.sort((p, q) => angleOf(centre, meanPoint(p)) - angleOf(centre, meanPoint(q)));
    }
    return { copies, radius: radius(group), index };
  }).sort((p, q) => (hasCentre ? (p.radius - q.radius) || (p.index - q.index) : p.index - q.index));

  // Orient each strip: 0 at the end nearer the centre when it runs outward,
  // else the way its orbit's lead runs.
  if (hasCentre) {
    for (const { copies } of ordered) {
      for (const strip of copies.flat()) {
        const points = pointsOf(strip);
        if (points.length < 2) continue;
        const r0 = dist(points[0], centre);
        const r1 = dist(points[points.length - 1], centre);
        if (Math.abs(r1 - r0) > 0.25 * pathLength(points)) flips[strip.id] = r1 < r0;
        else flips[strip.id] = flips[strip.id] === true;
      }
    }
  }
  const areas = ordered.map(({ copies }, index) => {
    const ids = copies.map(copy => copy.map(strip => strip.id));
    return { id: areaId(ids), name: `Area ${index + 1}`, copies: ids };
  });
  return { areas, flips, source };
}
