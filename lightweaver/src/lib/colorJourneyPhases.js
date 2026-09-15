// Lossless Q0.16 phase storage; span delta is the unwrapped endpoint difference.
export const COLOR_JOURNEY_MAX_PIXELS = 65535;
export const COLOR_JOURNEY_MAX_PHASE_SPANS = 64;
const wrap = value => ((value % 65536) + 65536) % 65536;
export function expandColorJourneyPhases(journey) {
  if (journey?.version === 1 && typeof journey.phase16 === 'string'
    && /^[0-9a-f]+$/.test(journey.phase16) && journey.phase16.length % 4 === 0
    && journey.phase16.length <= 256 * 4 && !Object.hasOwn(journey, 'phases')) {
    return journey.phase16.match(/.{4}/g).map(value => Number.parseInt(value, 16));
  }
  if (journey?.version !== 2 || Object.hasOwn(journey, 'phase16') || !Array.isArray(journey.phases)
    || journey.phases.length < 1 || journey.phases.length > COLOR_JOURNEY_MAX_PHASE_SPANS) {
    throw new RangeError('Invalid native Color Journey phase encoding.');
  }
  const result = [];
  for (const span of journey.phases) {
    if (!Array.isArray(span) || span.length !== 3 || !span.every(Number.isInteger)) throw new RangeError('Invalid Color Journey phase span.');
    const [count, start, delta] = span;
    if (count < 1 || result.length + count > COLOR_JOURNEY_MAX_PIXELS || start < 0 || start > 65535
      || Math.abs(delta) > (count - 1) * 32768 || (count === 1 && delta !== 0)) throw new RangeError('Invalid Color Journey phase span bounds.');
    for (let i = 0; i < count; i += 1) result.push(wrap(Math.round(start + (count === 1 ? 0 : delta * i / (count - 1)))));
  }
  return result;
}
export function encodeColorJourneyPhases(values) {
  if (!Array.isArray(values) || !values.length || values.length > COLOR_JOURNEY_MAX_PIXELS
    || !values.every(value => Number.isInteger(value) && value >= 0 && value <= 65535)) throw new RangeError('Invalid Color Journey source phases.');
  if (values.length <= 256) return { version: 1, phase16: values.map(value => value.toString(16).padStart(4, '0')).join('') };
  const unwrapped = [values[0]];
  for (let i = 1; i < values.length; i += 1) unwrapped.push(unwrapped[i - 1] + wrap(values[i] - values[i - 1] + 32768) - 32768);
  const phases = [];
  // Find the longest exact endpoint span from each start. Each interior sample
  // constrains the slope to [difference - 0.5, difference + 0.5) / offset.
  // Compare rational bounds as integers so negative half ties match firmware.
  // At most 64 accepted spans scan the remaining input: O(64 * pixels).
  for (let first = 0; first < values.length;) {
    let last = first;
    let lowerNumerator = 0;
    let lowerDenominator = 0;
    let upperNumerator = 0;
    let upperDenominator = 0;
    for (let index = first + 1; index < values.length; index += 1) {
      const offset = index - first;
      const difference = unwrapped[index] - unwrapped[first];
      const low = 2 * difference - 1;
      const high = 2 * difference + 1;
      if (!lowerDenominator || low * lowerDenominator > lowerNumerator * offset) {
        lowerNumerator = low;
        lowerDenominator = offset;
      }
      if (!upperDenominator || high * upperDenominator < upperNumerator * offset) {
        upperNumerator = high;
        upperDenominator = offset;
      }
      if (lowerNumerator * upperDenominator >= upperNumerator * lowerDenominator) break;
      if (2 * difference * lowerDenominator >= lowerNumerator * offset
        && 2 * difference * upperDenominator < upperNumerator * offset) last = index;
    }
    phases.push([last - first + 1, values[first], unwrapped[last] - unwrapped[first]]);
    if (phases.length > COLOR_JOURNEY_MAX_PHASE_SPANS) throw new RangeError('Color Journey geometry is too complex for lossless standalone storage (maximum 64 phase spans). Simplify the artwork geometry or use streamed playback.');
    first = last + 1;
  }
  return { version: 2, phases };
}
