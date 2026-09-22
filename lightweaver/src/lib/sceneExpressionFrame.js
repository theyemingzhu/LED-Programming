// Maps PatternPreview's flattened RGB callback to the compiled card output.
//
// PatternPreview emits one `{ r, g, b }` per `segments[].pixels[]`, in that
// order. Segment pixels carry the Layout-owned `{ stripId, sourceLed }`
// identity. Compiled wiring is the only authority for physical output order.

const BLACK = '000000';

const sourceKey = (stripId, sourceLed) => `${stripId}:${sourceLed}`;
const validSource = value => (
  value
  && typeof value.stripId === 'string'
  && value.stripId.length > 0
  && Number.isSafeInteger(value.sourceLed)
  && value.sourceLed >= 0
);
const validRgb = value => (
  value
  && Number.isInteger(value.r) && value.r >= 0 && value.r <= 255
  && Number.isInteger(value.g) && value.g >= 0 && value.g <= 255
  && Number.isInteger(value.b) && value.b >= 0 && value.b <= 255
);
const hex = value => value.toString(16).padStart(2, '0').toUpperCase();
const rgbHex = value => `${hex(value.r)}${hex(value.g)}${hex(value.b)}`;

function failure(errors) {
  return { ok: false, pixels: [], errors };
}

function flattenSegmentSources(segments, errors) {
  const sources = [];
  if (!Array.isArray(segments)) {
    errors.push({ code: 'segments-invalid', message: 'Preview segment metadata is required.' });
    return sources;
  }
  for (let segmentIndex = 0; segmentIndex < segments.length; segmentIndex += 1) {
    const pixels = segments[segmentIndex]?.pixels;
    if (!Array.isArray(pixels)) {
      errors.push({ code: 'segment-pixels-invalid', message: 'Each preview segment needs pixel source metadata.', segmentIndex });
      continue;
    }
    for (let pixelIndex = 0; pixelIndex < pixels.length; pixelIndex += 1) {
      const source = pixels[pixelIndex];
      if (!validSource(source)) {
        errors.push({ code: 'rendered-source-invalid', message: 'A rendered preview pixel has no valid strip source.', segmentIndex, pixelIndex });
        continue;
      }
      sources.push({ stripId: source.stripId, sourceLed: source.sourceLed, segmentIndex, pixelIndex });
    }
  }
  return sources;
}

/**
 * Return cardFrameStream-ready uppercase `RRGGBB` pixels for one PatternPreview
 * frame, or structured mapping errors. It never infers order from geometry and
 * never black-pads an unmapped active physical LED. Explicit compiler inactive
 * slots are the sole permitted black output.
 */
export function mapSceneExpressionPreviewFrame({
  framePixels,
  segments,
  compiledWiring,
} = {}) {
  const errors = [];
  if (!compiledWiring || compiledWiring.ok !== true || !Array.isArray(compiledWiring.pixels)) {
    return failure([{ code: 'compiled-wiring-unavailable', message: 'A successful compiled wiring map is required to preview on lights.' }]);
  }
  if (!Array.isArray(framePixels)) errors.push({ code: 'frame-invalid', message: 'PatternPreview must provide an RGB pixel array.' });

  const renderedSources = flattenSegmentSources(segments, errors);
  if (Array.isArray(framePixels) && framePixels.length !== renderedSources.length) {
    errors.push({
      code: 'frame-source-count-mismatch',
      message: 'Preview RGB pixels do not match the preview segment source metadata.',
      frameCount: framePixels.length,
      sourceCount: renderedSources.length,
    });
  }
  if (Array.isArray(framePixels)) {
    framePixels.forEach((color, frameIndex) => {
      if (!validRgb(color)) errors.push({ code: 'frame-rgb-invalid', message: 'Preview RGB values must be whole bytes.', frameIndex });
    });
  }

  const colorBySource = new Map();
  for (let index = 0; index < renderedSources.length; index += 1) {
    const source = renderedSources[index];
    const key = sourceKey(source.stripId, source.sourceLed);
    if (colorBySource.has(key)) {
      errors.push({ code: 'rendered-source-duplicate', message: 'A source LED appears more than once in preview metadata.', source: { stripId: source.stripId, sourceLed: source.sourceLed } });
      continue;
    }
    colorBySource.set(key, framePixels?.[index]);
  }

  const physicalBySource = new Map();
  compiledWiring.pixels.forEach((physical, outputIndex) => {
    if (physical?.inactive === true) return;
    if (!validSource(physical)) {
      errors.push({ code: 'physical-source-invalid', message: 'An active compiled output pixel has no valid strip source.', outputIndex });
      return;
    }
    const key = sourceKey(physical.stripId, physical.sourceLed);
    const entries = physicalBySource.get(key) || [];
    entries.push(outputIndex);
    physicalBySource.set(key, entries);
  });

  for (const [key, outputIndexes] of physicalBySource) {
    if (outputIndexes.length > 1) {
      errors.push({ code: 'physical-source-duplicate', message: 'Compiled wiring addresses a source LED more than once.', source: key, outputIndexes });
    }
    if (!colorBySource.has(key)) {
      errors.push({ code: 'rendered-source-missing', message: 'Compiled wiring has an active LED missing from the rendered preview.', source: key, outputIndexes });
    }
  }
  for (const [key] of colorBySource) {
    if (!physicalBySource.has(key)) {
      errors.push({ code: 'physical-source-missing', message: 'A rendered preview LED is absent from compiled wiring.', source: key });
    }
  }
  if (errors.length) return failure(errors);

  return {
    ok: true,
    pixels: compiledWiring.pixels.map(physical => {
      if (physical?.inactive === true) return BLACK;
      return rgbHex(colorBySource.get(sourceKey(physical.stripId, physical.sourceLed)));
    }),
    errors: [],
  };
}
