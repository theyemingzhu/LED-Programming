// Run only in the disposable child launched by pattern-execution-boundary.mjs.
// These fixed probes inspect synthetic values, never real browser/user data.
const [target, probe] = process.argv.slice(2);
const sources = {
  color: 'return rgb(1, 0, 0);',
  shadow: "return { r: typeof fetch === 'undefined' ? 0 : 173, g: 0, b: 0 };",
  receiver: 'return { r: this.__lwBoundaryCanary, g: 0, b: 0 };',
  computed: "const key = 'con' + 'structor'; const root = (() => {})[key]('return this')(); return { r: root.__lwBoundaryCanary, g: 0, b: 0 };",
  storage: "return { r: Number(this.localStorage.getItem('boundary-canary')), g: 0, b: 0 };",
  mutation: 'Math.__lwBoundaryMutation = 173; return rgb(0, 0, 0);',
  loop: 'while (true) {}',
};
if (!Object.hasOwn(sources, probe)) throw new Error('Unknown fixed probe');
const source = sources[probe];
globalThis.__lwBoundaryCanary = 173;
globalThis.localStorage = {
  getItem(key) {
    if (key === 'boundary-canary') return '173';
    if (key === 'lw_custom_patterns') {
      return JSON.stringify([{ id: 'custom_boundary_probe', name: 'Synthetic', code: source }]);
    }
    return null;
  },
};
const studio = new URL('../../../src/lib/patterns.js', import.meta.url);
const mapper = new URL('../../../../led-art-mapper/app/src/patterns.js', import.meta.url);
const legacy = new URL('../../../src-v3/lib/patterns.js', import.meta.url);
// Resolve paths relative to this fixture, not the invoking shell's cwd.
const modules = { studio, mapper, registry: studio, legacy };
if (!Object.hasOwn(modules, target)) throw new Error('Unknown compiler target');
const moduleUrl = modules[target];
const { compile, evalPixel } = await import(moduleUrl);
let compiled;
if (target === 'registry') {
  const { compilePattern } = await import(new URL('../../../src/lib/frameEngine.js', import.meta.url));
  const fn = compilePattern('custom_boundary_probe');
  compiled = { fn, error: fn ? null : 'Pattern was rejected' };
} else {
  compiled = compile(source);
}
if (!compiled.fn) {
  process.stdout.write(JSON.stringify({ phase: 'rejected', error: compiled.error }) + '\n');
} else {
  process.stdout.write(JSON.stringify({ phase: 'evaluating' }) + '\n');
  const pixel = evalPixel(compiled.fn, 0, 0.5, 0.5, 0, 0, 1, [{ r: 1, g: 0, b: 0 }], 0, 0, {}, 'synthetic', 0);
  process.stdout.write(JSON.stringify({ phase: 'result', pixel, mutation: Math.__lwBoundaryMutation ?? 0 }) + '\n');
}
