// Colour journeys: a short list of colours the look drifts slowly through.
// Colours are [r, g, b]. A look names one by id, or carries its own list.

export const JOURNEYS = Object.freeze([
  { id: 'dawn', label: 'Dawn', colours: [[255, 176, 80], [240, 110, 150], [150, 130, 255], [90, 215, 200]] },
  { id: 'flame', label: 'Flame', colours: [[255, 200, 110], [255, 140, 60], [220, 70, 50], [255, 170, 90]] },
  { id: 'tide', label: 'Tide', colours: [[110, 220, 255], [70, 130, 240], [150, 110, 250], [90, 215, 200]] },
  { id: 'moss', label: 'Moss', colours: [[200, 240, 140], [90, 200, 130], [60, 160, 170], [240, 220, 120]] },
  { id: 'candle', label: 'Candle', colours: [[255, 235, 205], [255, 205, 150], [240, 170, 120], [255, 225, 185]] },
]);

export const journeyIds = () => JOURNEYS.map(journey => journey.id);

const FALLBACK = JOURNEYS[0].colours;
const channel = value => Math.max(0, Math.min(255, Math.round(Number(value) || 0)));

/** The colour list for a look's `journey` (an id, or a list of [r, g, b]). Never empty. */
export function resolveJourney(journey) {
  if (Array.isArray(journey)) {
    const list = journey.filter(colour => Array.isArray(colour) && colour.length >= 3).map(colour => [channel(colour[0]), channel(colour[1]), channel(colour[2])]);
    return list.length ? list : FALLBACK;
  }
  return (JOURNEYS.find(entry => entry.id === journey) || JOURNEYS[0]).colours;
}

/** A point `p` (any number, wraps) along the journey, [r, g, b] unrounded. */
export function journeyAt(colours, p) {
  const f = (p - Math.floor(p)) * colours.length;
  const i = Math.floor(f);
  const t = f - i;
  const a = colours[i % colours.length];
  const b = colours[(i + 1) % colours.length];
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
