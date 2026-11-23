// MOTIONS. Adding a motion later means adding ONE object to MOTIONS below and
// ONE test case to motions.test.js (add its id to the list there). Nothing else
// changes: the schema, the renderer and the "It plays" choices on screen all
// read this registry.
//
// A motion is a pure function of where an LED is along its shape and where the
// shape's own clock is. No DOM, no randomness, no clock reads, only simple
// arithmetic, so it can be ported to the card one day.
//
//   level(position, clock, params, where) -> 0..1
//     position  0..1 along the LED's own shape
//     clock     0..1 round one loop of the shape (already sped, shifted and
//               turned by modifiers.js; the loop seam is clock 0 == clock 1)
//     params    { [paramId]: number }, filled from `params` defaults
//     where     { shape, out, copy, copies }  extra context, optional to use

const frac = value => value - Math.floor(value);

export const MOTIONS = Object.freeze([
  Object.freeze({
    id: 'chase',
    label: 'A chase',
    params: Object.freeze([{ id: 'width', label: 'How wide', min: 0.05, max: 0.6, default: 0.22 }]),
    level(position, clock, params) {
      const width = params.width > 0 ? params.width : 0.22;
      const distance = Math.abs(frac(position - clock + 0.5) - 0.5);
      return Math.max(0, 1 - distance / width) ** 2;
    },
  }),
  Object.freeze({
    id: 'fill',
    label: 'Fill and empty',
    params: Object.freeze([]),
    level(position, clock) {
      const reach = clock < 0.5 ? clock * 2 : 2 - clock * 2;
      return position <= reach ? 1 : 0;
    },
  }),
  Object.freeze({
    id: 'pulse',
    label: 'A pulse',
    params: Object.freeze([]),
    level(position, clock) {
      return 0.5 - 0.5 * Math.cos(clock * 2 * Math.PI);
    },
  }),
]);

export const DEFAULT_MOTION_ID = 'pulse';
const byId = new Map(MOTIONS.map(motion => [motion.id, motion]));

export const hasMotion = id => byId.has(id);
export const motionIds = () => MOTIONS.map(motion => motion.id);

/** The motion with this id, or the safe default when a newer Studio saved one this one does not know. */
export function getMotion(id) {
  return byId.get(id) || byId.get(DEFAULT_MOTION_ID);
}

/** Params for a motion with every missing or bad value replaced by its default and clamped to its range. */
export function motionParams(motion, given = {}) {
  const out = {};
  for (const spec of motion.params) {
    const value = Number(given?.[spec.id]);
    out[spec.id] = Number.isFinite(value) ? Math.max(spec.min, Math.min(spec.max, value)) : spec.default;
  }
  return out;
}
