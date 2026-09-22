import { compileWiring } from '../lib/wiringCompiler.js';

function text(value) {
  return String(value || '').trim();
}

function direction(value) {
  const normalized = text(value || 'forward').toLowerCase();
  return normalized === 'reverse' ? 'reverse' : normalized === 'forward' ? 'forward' : '';
}

function normalizeOutput(output, index) {
  const pin = Number(output?.pin ?? output?.gpio);
  const pixels = Number(output?.pixels ?? output?.count);
  const segments = output?.segments;
  if (!Number.isInteger(pin) || pin < 0 || !Number.isInteger(pixels) || pixels < 1 || !Array.isArray(segments) || !segments.length) return null;
  const normalizedSegments = segments.map(segment => {
    const id = text(segment?.id);
    const count = Number(segment?.count);
    const physicalDirection = direction(segment?.direction);
    return id && Number.isInteger(count) && count > 0 && physicalDirection
      ? { id, count, direction: physicalDirection }
      : null;
  });
  if (normalizedSegments.some(segment => !segment)
    || normalizedSegments.reduce((sum, segment) => sum + segment.count, 0) !== pixels) return null;
  return {
    id: text(output?.id) || `out${index + 1}`,
    pin,
    pixels,
    direction: direction(output?.direction) || (new Set(normalizedSegments.map(segment => segment.direction)).size > 1 ? 'mixed' : normalizedSegments[0].direction),
    segments: normalizedSegments,
  };
}

function normalizeTopology(source = {}, statusShape = false) {
  const led = statusShape ? (source.led || {}) : (source.led || source);
  const outputs = statusShape ? source.outputs : led.outputs;
  if (!Array.isArray(outputs) || !outputs.length) return null;
  const normalizedOutputs = outputs.map(normalizeOutput);
  const colorOrder = text(led.colorOrder).toUpperCase();
  const ledType = text(led.type || source.ledType).toUpperCase();
  if (normalizedOutputs.some(output => !output) || !colorOrder) return null;
  return { colorOrder, ledType, outputs: normalizedOutputs };
}

export function compareSceneExpressionPreviewTopology({ cardStatus, desiredConfig } = {}) {
  const card = normalizeTopology(cardStatus, true);
  const desired = normalizeTopology(desiredConfig, false);
  if (!card || !desired) {
    return {
      ok: false,
      reason: 'wiring-identity-unavailable',
      message: 'The card did not report enough output and run identity to prove this Layout is installed. Install the Layout changes first.',
    };
  }
  if (JSON.stringify(card) !== JSON.stringify(desired)) {
    return {
      ok: false,
      reason: 'wiring-mismatch',
      message: 'This Layout differs from the wiring installed on the card. Install the Layout changes first.',
      card,
      desired,
    };
  }
  return { ok: true, card, desired };
}

function compiledSourceMap(project) {
  const compiled = compileWiring({
    wiring: project?.layout?.wiring,
    strips: project?.layout?.strips || [],
  });
  if (!compiled.ok) return null;
  return compiled.pixels.map(pixel => ({
    outputId: text(pixel.outputId),
    runId: text(pixel.runId),
    inactive: pixel.inactive === true,
    stripId: pixel.inactive === true ? null : text(pixel.stripId),
    sourceLed: pixel.inactive === true ? null : Number(pixel.sourceLed),
  }));
}

export function compareSceneExpressionPreviewSourceMapping({ installedProject, draftProject } = {}) {
  const installed = compiledSourceMap(installedProject);
  const draft = compiledSourceMap(draftProject);
  if (!installed || !draft) {
    return {
      ok: false,
      reason: 'wiring-source-unavailable',
      message: 'The installed Layout source map could not be verified. Install the Layout changes first.',
    };
  }
  if (JSON.stringify(installed) !== JSON.stringify(draft)) {
    return {
      ok: false,
      reason: 'wiring-source-mismatch',
      message: 'This Layout uses a different source-to-output map from the card. Install the Layout changes first.',
      installed,
      draft,
    };
  }
  return { ok: true, installed, draft };
}
