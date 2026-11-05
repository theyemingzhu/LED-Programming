const ARGUMENTS = 21;
const MAX_SAMPLES = 32000;
const MAX_TRANSPORT_BYTES = 8_000_000;

/** Preserve native argument values while transferring fixed-width numeric data.
 * Tags 0..4 represent number/undefined/null/true/false; tag 5 references a
 * deduplicated value table (palettes, params, strip IDs and reflection points).
 */
export function packPatternFrameJob({ sources, samples }) {
  if (!Array.isArray(sources) || !sources.length || sources.length > 64
    || sources.some(source => typeof source !== 'string' || source.length > 65536)
    || !Array.isArray(samples) || samples.length > MAX_SAMPLES
    || samples.some(sample => !Number.isInteger(sample?.source) || sample.source < 0 || sample.source >= sources.length
      || !Array.isArray(sample.args) || sample.args.length > 17)) {
    throw new Error('Pattern frame exceeds input budget.');
  }
  const count = samples.length;
  const numbers = new Float64Array(count * ARGUMENTS);
  // Reference indices use the same Float64 slot as numbers, so a one-byte tag
  // suffices even with a large dictionary. No integer precision is lost.
  const tags = new Uint8Array(count * ARGUMENTS);
  const sourceIndices = new Uint8Array(count);
  const values = [], references = new Map();
  let transportBytes = numbers.byteLength + tags.byteLength + sourceIndices.byteLength
    + sources.reduce((sum, source) => sum + source.length * 2, 0);
  const checkBudget = () => {
    if (transportBytes > MAX_TRANSPORT_BYTES) throw new Error('Pattern frame exceeds transport budget.');
  };
  checkBudget();
  function write(index, value) {
    if (typeof value === 'number') { numbers[index] = value; return; }
    if (value === undefined) { tags[index] = 1; return; }
    if (value === null) { tags[index] = 2; return; }
    if (value === true) { tags[index] = 3; return; }
    if (value === false) { tags[index] = 4; return; }
    let reference = references.get(value);
    if (reference === undefined) {
      // Serialize each distinct shared value only once to bound clone volume.
      // Source/sample count and fixed buffers are checked before allocation.
      const serialized = JSON.stringify(value);
      if (serialized === undefined) throw new Error('Pattern frame contains unsupported value data.');
      transportBytes += serialized.length * 2;
      checkBudget();
      reference = values.length;
      values.push(value); references.set(value, reference);
    }
    tags[index] = 5; numbers[index] = reference;
  }
  const args = Array(ARGUMENTS);
  for (let i = 0; i < count; i++) {
    const sample = samples[i], input = sample.args;
    // evalPixel catches an explicit null reflection before invoking the source.
    // Index 255 is outside the bounded source table and keeps that error RGB.
    if (input[15] === null) { sourceIndices[i] = 255; continue; }
    const reflection = input[15] ?? {};
    for (let j = 0; j < 10; j++) args[j] = input[j];
    args[10] = input[10] || 0;
    args[11] = input[11] || 0;
    args[12] = input[12] === undefined ? 0 : input[12];
    args[13] = input[13] === undefined ? 0 : input[13];
    args[14] = input[14] === undefined ? 0 : input[14];
    args[15] = reflection.reflectionProgress ?? input[11] ?? 0;
    args[16] = reflection.kaleidoscopeProgress ?? input[11] ?? 0;
    args[17] = reflection.reflectionDistance ?? 1;
    args[18] = reflection.reflectionSegment ?? 0;
    args[19] = reflection.reflectionPoint ?? null;
    args[20] = reflection.isReflectionPoint === true;
    sourceIndices[i] = sample.source;
    for (let j = 0; j < ARGUMENTS; j++) write(i * ARGUMENTS + j, args[j]);
  }
  return { sources, sampleCount: count, numbers, tags, sourceIndices, values, transportBytes };
}

/** This exact function is embedded into the opaque Worker; no host bridge. */
export function unpackPatternSample(packet, index, target = Array(21)) {
  const start = index * 21;
  for (let j = 0; j < 21; j++) {
    const tag = packet.tags[start + j];
    target[j] = tag === 0 ? packet.numbers[start + j]
      : tag === 1 ? undefined : tag === 2 ? null : tag === 3 ? true
        : tag === 4 ? false : packet.values[packet.numbers[start + j]];
  }
  return target;
}
