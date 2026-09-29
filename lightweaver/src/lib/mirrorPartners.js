// Which strips look like the mirror image of a given strip, and which way they
// run. Layout's symmetry suggestion (symmetrySuggest.js) uses it to place
// strips into sides and to tell which way round the sides are drawn.
//
// A strip's `pixels` are its LED positions in LED order (LED 1 first). Two
// strips look like mirror images when some symmetry of the piece (a
// reflection or rotation about its centre) carries one's LED k onto the
// other's LED k. If it only works with the partner read backwards, the
// partner is drawn the other way round.
//
// Geometry only. Nothing here changes a strip.

const SAMPLES = 16;
// Mean LED distance after the transform, as a share of the strips' length.
const MATCH_TOLERANCE = 0.08;
// Counts further apart than this are not called a likely match, even when the
// shapes line up: they would stretch the pattern noticeably.
const MIN_COUNT_RATIO = 0.75;
// A mirror image has the same drawn length.
const MIN_LENGTH_RATIO = 0.85;

// Reflections and the half turn: their axis (or centre) always passes through
// the midpoint of a strip and its image, so they are tried about that midpoint
// as well as about the piece's centre.
const PAIR_TRANSFORMS = [
  (x, y) => [-x, y],   // reflect left/right
  (x, y) => [x, -y],   // reflect top/bottom
  (x, y) => [-x, -y],  // half turn
  (x, y) => [y, x],    // reflect across a diagonal
  (x, y) => [-y, -x],  // reflect across the other diagonal
];
// Quarter turns only make sense about the piece's centre.
const CENTRE_TRANSFORMS = [
  ...PAIR_TRANSFORMS,
  (x, y) => [-y, x],   // quarter turn
  (x, y) => [y, -x],   // quarter turn the other way
];

function finitePoints(strip) {
  return (strip?.pixels || []).filter(point => Number.isFinite(point?.x) && Number.isFinite(point?.y));
}

// Evenly spaced LEDs stand in for evenly spaced arc length: LEDs are placed at
// equal spacing along the path already.
function resample(points, count = SAMPLES) {
  if (points.length === 0) return [];
  if (points.length === 1) return Array.from({ length: count }, () => points[0]);
  return Array.from({ length: count }, (_, index) => {
    const at = index * (points.length - 1) / (count - 1);
    const lo = Math.floor(at);
    const hi = Math.min(points.length - 1, lo + 1);
    const t = at - lo;
    return {
      x: points[lo].x + (points[hi].x - points[lo].x) * t,
      y: points[lo].y + (points[hi].y - points[lo].y) * t,
    };
  });
}

function boundsCentre(pointLists) {
  let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
  for (const points of pointLists) {
    for (const point of points) {
      minX = Math.min(minX, point.x); maxX = Math.max(maxX, point.x);
      minY = Math.min(minY, point.y); maxY = Math.max(maxY, point.y);
    }
  }
  if (!Number.isFinite(minX)) return null;
  return { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
}

function pathLength(points) {
  let total = 0;
  for (let index = 1; index < points.length; index += 1) {
    total += Math.hypot(points[index].x - points[index - 1].x, points[index].y - points[index - 1].y);
  }
  return total;
}

function meanDistance(a, b) {
  let sum = 0;
  for (let index = 0; index < a.length; index += 1) {
    sum += Math.hypot(a[index].x - b[index].x, a[index].y - b[index].y);
  }
  return sum / a.length;
}

/**
 * Rank `candidates` as mirror partners of `lead`.
 *
 * `centre` is the piece's centre (the artwork's, when there is artwork); when
 * omitted, the centre of every strip passed in is used. Reflections are also
 * tried about the pair's own midpoint, so a stray strip elsewhere on the piece
 * cannot throw the match off.
 *
 * Returns one entry per candidate, likely matches first (closest first), then
 * the rest in their original order:
 *   { id, likely, needsFlip, score }
 * `needsFlip` is true only for a likely match that lines up with the lead
 * solely when read backwards.
 */
export function rankMirrorPartners(lead, candidates = [], { centre = null } = {}) {
  const leadPoints = finitePoints(lead);
  const candidateList = (candidates || []).filter(Boolean);
  const unranked = candidateList.map((candidate, order) => ({
    id: candidate.id, likely: false, needsFlip: false, score: Infinity, order,
  }));
  if (leadPoints.length < 2) return unranked.map(({ order, ...entry }) => entry);

  const pivot = centre && Number.isFinite(centre.x) && Number.isFinite(centre.y)
    ? centre
    : boundsCentre([leadPoints, ...candidateList.map(finitePoints)]);
  const leadLength = pathLength(leadPoints);

  const leadSamples = resample(leadPoints);
  const imagesAbout = (centreOf, transforms) => transforms.map(transform => leadSamples.map(point => {
    const [x, y] = transform(point.x - centreOf.x, point.y - centreOf.y);
    return { x: x + centreOf.x, y: y + centreOf.y };
  }));
  const centreImages = imagesAbout(pivot, CENTRE_TRANSFORMS);
  const leadMid = boundsCentre([leadPoints]);

  const ranked = candidateList.map((candidate, order) => {
    const points = finitePoints(candidate);
    if (points.length < 2) return unranked[order];
    const forward = resample(points);
    const backward = forward.slice().reverse();
    const candidateMid = boundsCentre([points]);
    const pairImages = imagesAbout({ x: (leadMid.x + candidateMid.x) / 2, y: (leadMid.y + candidateMid.y) / 2 }, PAIR_TRANSFORMS);
    const candidateLength = pathLength(points);
    const scale = Math.max(leadLength, candidateLength);
    if (!(scale > 0)) return unranked[order];
    let bestForward = Infinity;
    let bestBackward = Infinity;
    for (const image of [...centreImages, ...pairImages]) {
      bestForward = Math.min(bestForward, meanDistance(image, forward) / scale);
      bestBackward = Math.min(bestBackward, meanDistance(image, backward) / scale);
    }
    const score = Math.min(bestForward, bestBackward);
    const countRatio = Math.min(points.length, leadPoints.length) / Math.max(points.length, leadPoints.length);
    const lengthRatio = Math.min(leadLength, candidateLength) / scale;
    const likely = score <= MATCH_TOLERANCE && countRatio >= MIN_COUNT_RATIO && lengthRatio >= MIN_LENGTH_RATIO;
    return {
      id: candidate.id,
      likely,
      needsFlip: likely && bestForward > MATCH_TOLERANCE,
      score,
      order,
    };
  });

  return ranked
    .sort((a, b) => {
      if (a.likely !== b.likely) return a.likely ? -1 : 1;
      if (a.likely) return a.score - b.score;
      return a.order - b.order;
    })
    .map(({ order, ...entry }) => entry);
}

/**
 * How well `candidate` lines up with `lead` carried through one symmetry.
 *
 * `transform(point) -> point` works in the strips' own coordinates (a
 * reflection or rotation about some centre). The lead's LEDs are carried
 * through it and compared with the candidate read forwards (LED k onto LED
 * k) and backwards. Same thresholds as rankMirrorPartners, so "likely" means
 * the same thing everywhere:
 *   { likely, needsFlip, score, forward, backward }
 * `needsFlip` is true only for a likely match that lines up solely when the
 * candidate is read backwards.
 */
export function matchStripUnder(lead, candidate, transform) {
  const none = { likely: false, needsFlip: false, score: Infinity, forward: Infinity, backward: Infinity };
  const leadPoints = finitePoints(lead);
  const points = finitePoints(candidate);
  if (leadPoints.length < 2 || points.length < 2 || typeof transform !== 'function') return none;
  const leadLength = pathLength(leadPoints);
  const candidateLength = pathLength(points);
  const scale = Math.max(leadLength, candidateLength);
  if (!(scale > 0)) return none;
  const image = resample(leadPoints).map(point => transform(point));
  const along = resample(points);
  const forward = meanDistance(image, along) / scale;
  const backward = meanDistance(image, along.slice().reverse()) / scale;
  const score = Math.min(forward, backward);
  const countRatio = Math.min(points.length, leadPoints.length) / Math.max(points.length, leadPoints.length);
  const lengthRatio = Math.min(leadLength, candidateLength) / scale;
  const likely = score <= MATCH_TOLERANCE && countRatio >= MIN_COUNT_RATIO && lengthRatio >= MIN_LENGTH_RATIO;
  return { likely, needsFlip: likely && forward > MATCH_TOLERANCE, score, forward, backward };
}

// Mean LED position of a strip, or null when it has none.
export function stripCentroid(strip) {
  const points = finitePoints(strip);
  if (!points.length) return null;
  let x = 0; let y = 0;
  for (const point of points) { x += point.x; y += point.y; }
  return { x: x / points.length, y: y / points.length };
}

// Centre of the box around every LED of the strips given, or null.
export function stripsBoundsCentre(strips = []) {
  return boundsCentre((strips || []).map(finitePoints));
}
