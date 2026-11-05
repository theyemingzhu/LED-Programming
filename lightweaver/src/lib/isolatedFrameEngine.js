import { renderPixelFrame } from './frameEngine.js';
import { getPatternById } from './patternRegistry.js';

/** Render existing geometry and postprocessing around one isolated pixel batch.
 * The collection pass never invokes pattern code. Replaying the RGB samples
 * keeps one implementation of all geometry, blends, mirrors and color controls.
 * Deliberately accepts data/source only; callback renderers need separate work.
 */
export async function renderIsolatedPixelFrame(options, service) {
  if (options.activeFn || options.blendFn || options.perStripFns?.size || options.evaluatePixel || options.patternCompiler) {
    throw new Error('Callback patterns need an isolated frame adapter.');
  }
  const snapshot = structuredClone(options);
  const sources = [], samples = [], descriptorById = new Map();
  const patternCompiler = id => {
    if (descriptorById.has(id)) return descriptorById.get(id);
    const source = getPatternById(id)?.code;
    if (typeof source !== 'string') { descriptorById.set(id, null); return null; }
    let index = sources.indexOf(source);
    if (index < 0) { index = sources.length; sources.push(source); }
    const descriptor = { source: index };
    descriptorById.set(id, descriptor);
    return descriptor;
  };
  // Strip-specific patterns use the same source resolver, never the native
  // compilePattern path or a user-controlled claim that an ID is trusted.
  const perStripFns = new Map();
  for (const strip of snapshot.strips || []) {
    if (strip.patternId) perStripFns.set(strip.patternId, patternCompiler(strip.patternId));
  }
  const context = { ...snapshot, patternCompiler, perStripFns,
    ...(snapshot.blendSourcePatternId ? { blendFn: patternCompiler(snapshot.blendSourcePatternId) } : {}),
  };
  const blank = { r: 0, g: 0, b: 0 };
  const emptyFrame = renderPixelFrame({ ...context, evaluatePixel: (descriptor, ...args) => {
    if (samples.length >= 32000) throw new Error('Pattern frame exceeds sample budget.');
    samples.push({ source: descriptor.source, args });
    return blank;
  } });
  if (!samples.length) return emptyFrame;
  const bytes = await service.render({ sources, samples });
  let cursor = 0;
  return renderPixelFrame({ ...context, evaluatePixel: () => {
    const color = { r: bytes[cursor], g: bytes[cursor + 1], b: bytes[cursor + 2] };
    cursor += 3; return color;
  } });
}
