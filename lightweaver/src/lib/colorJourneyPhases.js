// Lossless Q0.16 phase storage; span delta is the unwrapped endpoint difference.
export const COLOR_JOURNEY_MAX_PIXELS = 65535;
export const COLOR_JOURNEY_MAX_PHASE_SPANS = 64;
export const COLOR_JOURNEY_MAX_RENDER_DEPTH = 0.42;
export const COLOR_JOURNEY_MAX_PHASE_ERROR_TICKS = Math.floor(
  Math.asin(1 / (255 * COLOR_JOURNEY_MAX_RENDER_DEPTH)) / Math.PI * 65536,
);
const wrap = value => ((value % 65536) + 65536) % 65536;

export function colorJourneyRenderedChannelDelta(
  phaseErrorTicks,
  depth = COLOR_JOURNEY_MAX_RENDER_DEPTH,
  channel = 255,
) {
  const ticks = Math.abs(Number(phaseErrorTicks));
  if (!Number.isFinite(ticks) || ticks > 32768 || !Number.isFinite(depth)
    || depth < 0 || depth > COLOR_JOURNEY_MAX_RENDER_DEPTH
    || !Number.isFinite(channel) || channel < 0 || channel > 255) {
    throw new RangeError('Invalid Color Journey rendered-error bound.');
  }
  return channel * depth * Math.sin(Math.PI * ticks / 65536);
}

function validateValues(values) {
  if (!Array.isArray(values) || !values.length || values.length > COLOR_JOURNEY_MAX_PIXELS
    || !values.every(value => Number.isInteger(value) && value >= 0 && value <= 65535)) {
    throw new RangeError('Invalid Color Journey source phases.');
  }
}

function unwrappedValues(values) {
  const result = [values[0]];
  for (let index = 1; index < values.length; index += 1) {
    result.push(result[index - 1] + wrap(values[index] - values[index - 1] + 32768) - 32768);
  }
  return result;
}
export function expandColorJourneyPhases(journey) {
  if (journey?.version === 1 && typeof journey.phase16 === 'string'
    && /^[0-9a-f]+$/.test(journey.phase16) && journey.phase16.length % 4 === 0
    && journey.phase16.length <= 256 * 4 && !Object.hasOwn(journey, 'phases')) {
    return journey.phase16.match(/.{4}/g).map(value => Number.parseInt(value, 16));
  }
  const affine = journey?.version === 2 || journey?.version === 3;
  if (!affine || Object.hasOwn(journey, 'phase16') || !Array.isArray(journey.phases)
    || journey.phases.length < 1 || journey.phases.length > COLOR_JOURNEY_MAX_PHASE_SPANS) {
    throw new RangeError('Invalid native Color Journey phase encoding.');
  }
  if ((journey.version === 3 && journey.maxPhaseErrorTicks !== COLOR_JOURNEY_MAX_PHASE_ERROR_TICKS)
    || (journey.version === 2 && Object.hasOwn(journey, 'maxPhaseErrorTicks'))) {
    throw new RangeError('Invalid native Color Journey phase error contract.');
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
  validateValues(values);
  if (values.length <= 256) return { version: 1, phase16: values.map(value => value.toString(16).padStart(4, '0')).join('') };
  const unwrapped = unwrappedValues(values);
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

function measuredSpan(unwrapped, first, last) {
  if (first === last) return { first, last, worstError: 0, split: -1 };
  const delta = unwrapped[last] - unwrapped[first];
  let worstError = 0;
  let split = -1;
  for (let index = first + 1; index < last; index += 1) {
    const predicted = Math.round(unwrapped[first] + delta * (index - first) / (last - first));
    const error = Math.abs(unwrapped[index] - predicted);
    if (error > worstError) {
      worstError = error;
      split = index;
    }
  }
  return { first, last, worstError, split };
}

export function encodeBoundedColorJourneyPhases(values) {
  validateValues(values);
  try {
    const exact = encodeColorJourneyPhases(values);
    if (exact.version === 2) {
      return {
        version: 3,
        maxPhaseErrorTicks: COLOR_JOURNEY_MAX_PHASE_ERROR_TICKS,
        phases: exact.phases,
      };
    }
  } catch (error) {
    if (!/geometry is too complex/.test(String(error?.message || error))) throw error;
  }

  const unwrapped = unwrappedValues(values);
  const spans = [measuredSpan(unwrapped, 0, values.length - 1)];
  while (true) {
    const spanIndex = spans.findIndex(span => span.worstError > COLOR_JOURNEY_MAX_PHASE_ERROR_TICKS);
    if (spanIndex < 0) break;
    const span = spans[spanIndex];
    if (span.split <= span.first || span.split >= span.last || spans.length >= COLOR_JOURNEY_MAX_PHASE_SPANS) {
      throw new RangeError(
        'Color Journey geometry exceeds the 64-span bounded standalone limit at one-channel rendered parity.',
      );
    }
    spans.splice(
      spanIndex,
      1,
      measuredSpan(unwrapped, span.first, span.split),
      measuredSpan(unwrapped, span.split + 1, span.last),
    );
  }
  const phases = spans.map(({ first, last }) => [
    last - first + 1,
    values[first],
    unwrapped[last] - unwrapped[first],
  ]);
  const encoding = {
    version: 3,
    maxPhaseErrorTicks: COLOR_JOURNEY_MAX_PHASE_ERROR_TICKS,
    phases,
  };
  const expanded = expandColorJourneyPhases(encoding);
  const invalid = expanded.some((value, index) => (
    Math.abs(wrap(value - values[index] + 32768) - 32768) > COLOR_JOURNEY_MAX_PHASE_ERROR_TICKS
  ));
  if (invalid) throw new RangeError('Color Journey bounded phase verification failed.');
  return encoding;
}
