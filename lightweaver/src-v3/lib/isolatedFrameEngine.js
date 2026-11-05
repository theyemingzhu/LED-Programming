import { renderPixelFrame } from './frameEngine.js';
import { getPatternById } from './patternRegistry.js';
import { getCompiledPatternSource } from './patterns.js';

const codeById = id => { const pattern = getPatternById(id); return pattern ? String(pattern.code) : null; };
const codeByFn = fn => {
  const code = getCompiledPatternSource(fn);
  if (code == null) throw new Error('This callback has no isolated legacy source.');
  return code;
};

/** Source identity excludes ordinary coordinate/control changes, so a stopped
 * source is not retried forever, while replacing any effective source recovers.
 */
export function legacyPatternSourceKey(options) {
  const active = options.activeFn ? getCompiledPatternSource(options.activeFn) ?? '[unsupported callback]' : codeById(options.patternId || 'aurora');
  const sources = new Set();
  for (const strip of options.strips || []) {
    if (strip.hidden || !strip.pts?.length) continue;
    const supplied = strip.patternId && options.perStripFns?.get(strip.patternId);
    sources.add(supplied ? getCompiledPatternSource(supplied) ?? '[unsupported callback]'
      : (strip.patternId ? codeById(strip.patternId) : null) ?? active);
  }
  if (options.blendAmount > 0) sources.add(options.blendFn
    ? getCompiledPatternSource(options.blendFn) ?? '[unsupported callback]'
    : codeById(options.blendSourcePatternId || options.blendPatternId));
  return JSON.stringify([...sources].filter(code => code != null).sort());
}

/** Same legacy geometry/color engine, with source-only sample collection. */
export async function renderLegacyPixelFrame(options, service) {
  if (options.evaluatePixel || options.patternCompiler) throw new Error('Legacy callback evaluation is unavailable.');
  const { activeFn, blendFn, perStripFns: suppliedFns, ...data } = options;
  const activeCode = activeFn ? codeByFn(activeFn) : null;
  const blendCode = blendFn ? codeByFn(blendFn) : null;
  const suppliedCodes = new Map([...(suppliedFns || [])].map(([id, fn]) => [id, fn ? codeByFn(fn) : null]));
  const snapshot = structuredClone(data);
  const sources = [], samples = [], descriptors = new Map();
  const descriptor = code => {
    if (code == null) return null;
    if (!descriptors.has(code)) { descriptors.set(code, { source: sources.length }); sources.push(code); }
    return descriptors.get(code);
  };
  const patternCompiler = id => descriptor(codeById(id));
  const perStripFns = new Map();
  for (const strip of snapshot.strips || []) if (strip.patternId) {
    perStripFns.set(strip.patternId, suppliedCodes.has(strip.patternId)
      ? descriptor(suppliedCodes.get(strip.patternId)) : patternCompiler(strip.patternId));
  }
  const context = { ...snapshot, patternCompiler, perStripFns,
    activeFn: descriptor(activeCode),
    blendFn: descriptor(blendCode) || (snapshot.blendSourcePatternId ? patternCompiler(snapshot.blendSourcePatternId) : null),
  };
  const emptyFrame = renderPixelFrame({ ...context, evaluatePixel: (fn, ...args) => {
    if (samples.length >= 32000) throw new Error('Pattern frame exceeds sample budget.');
    samples.push({ source: fn.source, args }); return { r:0, g:0, b:0 };
  } });
  if (!samples.length) return emptyFrame;
  // The synchronous engine may prepare a global function that no strip uses.
  // Compile only sampled sources, so an unused invalid/looping global source
  // cannot block valid per-strip work or poison its failure identity.
  const used = [...new Set(samples.map(sample => sample.source))];
  const remap = new Map(used.map((index, next) => [index, next]));
  for (const sample of samples) sample.source = remap.get(sample.source);
  const bytes = await service.render({ sources:used.map(index => sources[index]), samples });
  let cursor = 0;
  return renderPixelFrame({ ...context, evaluatePixel: () => {
    const color = { r:bytes[cursor], g:bytes[cursor+1], b:bytes[cursor+2] }; cursor += 3; return color;
  } });
}
