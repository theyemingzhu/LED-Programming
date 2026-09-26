import { compilePattern, resolvePatternParams } from './frameEngine.js';
import { resolveSceneExpressionSelection } from './sceneExpressionTargets.js';

const sourceKey = (stripId, sourceLed) => `${stripId}:${sourceLed}`;

/**
 * Adapt the existing pixel renderer to one logical route without changing any
 * artwork point or installed output address. PatternPreview still draws at the
 * original x/y coordinates; only effect index/progress and domain identity move.
 */
export function createSceneExpressionPreviewRenderer({
  assignments = [], catalog, segments = [], compile = compilePattern,
  stateByStrip = {}, getFlowTime = null,
} = {}) {
  const errors = [];
  const coordinateBySource = new Map();
  assignments.forEach((assignment, assignmentIndex) => {
    if (assignment.selection?.domain !== 'continuous') return;
    const domain = resolveSceneExpressionSelection(catalog, assignment.selection);
    if (!domain.ok) {
      errors.push(...domain.errors);
      return;
    }
    for (const ref of domain.physicalRefs) {
      const key = sourceKey(ref.stripId, ref.sourceLed);
      if (coordinateBySource.has(key)) {
        errors.push({ code: 'flow-overlap', message: 'Two Flow routes select the same LED.' });
        continue;
      }
      coordinateBySource.set(key, {
        ...ref, domainId: `flow:${assignmentIndex}`,
        speed: stateByStrip[ref.stripId]?.pattern?.speed ?? 1,
      });
    }
  });

  const entries = segments.flatMap(segment => (segment.pixels || []).map(pixel => ({
    key: sourceKey(pixel.stripId, pixel.sourceLed),
    patternId: segment.patternId,
  })));
  const renderedKeys = new Set(entries.map(entry => entry.key));
  for (const key of coordinateBySource.keys()) {
    if (!renderedKeys.has(key)) errors.push({ code: 'flow-preview-source-missing', message: 'A Flow LED is missing from the artwork preview.', source: key });
  }
  const patternIds = [...new Set(entries.map(entry => entry.patternId))];
  const fnByPattern = new Map(patternIds.map(patternId => [patternId, compile(patternId)]));
  const paramsByPattern = new Map(patternIds.map(patternId => [patternId, resolvePatternParams(patternId, {})]));
  for (const [patternId, fn] of fnByPattern) {
    if (!fn) errors.push({ code: 'flow-pattern-unavailable', message: `Pattern ${patternId} cannot render in this Studio.` });
  }
  if (errors.length) return { ok: false, errors, compiledFn: null, coordinates: [] };

  return {
    ok: true,
    errors: [],
    coordinates: entries.map(entry => coordinateBySource.get(entry.key) || null),
    compiledFn(...args) {
      const entry = entries[args[0]];
      if (!entry) return { r: 0, g: 0, b: 0 };
      const fn = fnByPattern.get(entry.patternId);
      const coordinate = coordinateBySource.get(entry.key);
      const next = [...args];
      next[9] = paramsByPattern.get(entry.patternId);
      if (coordinate) {
        if (getFlowTime) {
          next[3] = getFlowTime() * coordinate.speed;
          next[4] = (next[3] / 65.536) % 1;
        }
        next[0] = coordinate.logicalIndex;
        next[1] = coordinate.progress;
        next[2] = 0.5;
        next[5] = coordinate.domainLength;
        next[10] = coordinate.domainId;
        next[11] = coordinate.progress;
        next[15] = coordinate.progress;
        next[16] = coordinate.progress;
      }
      return fn(...next);
    },
  };
}
