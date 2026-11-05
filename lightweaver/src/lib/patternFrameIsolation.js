import compilerSource from './patterns.js?raw';
import legacyCompilerSource from '../../src-v3/lib/patterns.js?raw';
import bootstrapSource from './pattern-isolation/bootstrap.js?raw';
import { packPatternFrameJob, unpackPatternSample } from './patternFrameProtocol.js';

// Share the existing compiler/evaluator verbatim, including its restrictions,
// helpers and RGB conversion. They are compatibility checks, NOT isolation.
const runtimeFor = source => source.replace(/export function /g, 'function ')
  .replace(/^if \(import\.meta\.hot\).*$/m, '');

function workerRuntime() {
  // CSP supplies the network boundary. Remove worker creation/import APIs too:
  // a child could otherwise outlive the worker that owns the render deadline.
  for (const name of ['Worker', 'SharedWorker', 'importScripts']) {
    Object.defineProperty(globalThis, name, { value: undefined, writable: false, configurable: false });
  }
}
const workerSourceFor = dialect => `(${workerRuntime.toString()})();\n${dialect === 'legacy-v3' ? '(() => {' : ''}\n${runtimeFor(dialect === 'legacy-v3' ? legacyCompilerSource : compilerSource)}\n
const send = postMessage.bind(globalThis);
const unpack = ${unpackPatternSample.toString()};
let previousSources = '', functions = [];
onmessage = ({data}) => {
  try {
    const key = JSON.stringify(data.sources);
    if (key !== previousSources) {
      functions = data.sources.map(source => { const result = compile(source); if (result.error) throw new Error(result.error); return result.fn; });
      previousSources = key;
    }
    const pixels = new Uint8Array(data.sampleCount * 3);
    const args = Array(21);
    let currentFunction;
    const invoke = () => currentFunction(...${dialect === 'legacy-v3' ? 'args.slice(0, 15)' : 'args'});
    for (let i = 0; i < data.sampleCount; i++) {
      unpack(data, i, args);
      currentFunction = functions[data.sourceIndices[i]];
      // Reuse the existing result normalization and error RGB. The invocation
      // already contains the exact native argument values for this fixed dialect.
      const color = evalPixel(invoke);
      pixels[i*3] = color.r; pixels[i*3+1] = color.g; pixels[i*3+2] = color.b;
    }
    send({id: data.id, pixels}, [pixels.buffer]);
  } catch (error) { send({id: data.id, error: String(error?.message || 'Pattern failed').slice(0, 300)}); }
};
${dialect === 'legacy-v3' ? '})();' : ''}`;

/** One outstanding frame per owner. No execution fallback is permitted. */
export function createPatternFrameService({ deadlineMs = 500, startupMs = 3000, dialect = 'modern' } = {}) {
  if (dialect !== 'modern' && dialect !== 'legacy-v3') throw new Error('Unsupported pattern dialect.');
  const workerSource = workerSourceFor(dialect);
  let frame = null, port = null, ready = null, pending = null;
  let disposed = false, serial = 0, sourcesKey = null, cancelStartup = null;

  function teardown() {
    port?.postMessage({ type: 'stop' });
    port?.close(); port = null;
    frame?.remove(); frame = null; ready = null; sourcesKey = null;
  }
  function fail(error) {
    cancelStartup?.(error); cancelStartup = null;
    const current = pending; pending = null;
    if (current) { clearTimeout(current.timer); current.reject(error); }
    teardown();
  }
  function initialize() {
    if (ready) return ready;
    ready = new Promise((resolve, reject) => {
      const channel = new MessageChannel(); port = channel.port1;
      const timer = setTimeout(() => fail(new Error('Pattern isolation startup deadline.')), startupMs);
      cancelStartup = error => { clearTimeout(timer); reject(error); };
      frame = document.createElement('iframe');
      frame.hidden = true; frame.dataset.patternIsolation = '';
      frame.sandbox = 'allow-scripts';
      // Fixed inline bootstrap is authorized by its exact hash in public/_headers.
      // No resource request from the opaque origin: this also works offline and
      // avoids local-network permissions on card/localhost origins.
      const policy = "default-src 'none'; script-src 'sha256-sJeyY46W711mvXEdtYlm84OtUDmSrB+A4SL8VvKHaiA=' blob: 'unsafe-eval'; worker-src blob:; connect-src 'none'; img-src 'none'; media-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";
      frame.srcdoc = `<meta http-equiv="Content-Security-Policy" content="${policy}"><script>${bootstrapSource}</script>`;
      frame.onload = () => frame?.contentWindow?.postMessage('pattern-isolation-init', '*', [channel.port2]);
      port.onmessage = ({ data }) => {
        if (data?.ready === true) { clearTimeout(timer); cancelStartup = null; resolve(); return; }
        const current = pending;
        if (!current || data?.id !== current.id) return;
        if (data.pixels instanceof Uint8Array && data.pixels.length === current.length
          && data.pixels.buffer instanceof ArrayBuffer && data.pixels.byteOffset === 0
          && data.pixels.byteLength === data.pixels.buffer.byteLength) {
          pending = null; clearTimeout(current.timer); current.resolve(data.pixels);
        } else {
          fail(new Error(typeof data?.error === 'string' ? data.error.slice(0, 300) : 'Invalid pattern frame reply.'));
        }
      };
      port.start(); document.body.append(frame);
    });
    return ready;
  }
  return {
    async render({ sources, samples }) {
      if (disposed) throw new Error('Pattern service disposed.');
      if (pending) throw new Error('Pattern frame already pending.');
      const packet = packPatternFrameJob({ sources, samples }, { argumentCount: dialect === 'legacy-v3' ? 15 : 21 });
      const key = JSON.stringify(sources);
      if (sourcesKey !== null && key !== sourcesKey) teardown();
      await initialize();
      if (disposed) throw new Error('Pattern service disposed.');
      if (pending) throw new Error('Pattern frame already pending.');
      if (sourcesKey === null) { port.postMessage({ type: 'start', runtime: workerSource }); sourcesKey = key; }
      return new Promise((resolve, reject) => {
        const id = ++serial;
        const timer = setTimeout(() => fail(new Error('Pattern execution deadline exceeded.')), deadlineMs);
        pending = { id, length: samples.length * 3, resolve, reject, timer };
        // Bootstrap's fixed sample-count metadata stays compatible; all pixel
        // argument data travels as bounded buffers rather than nested arrays.
        port.postMessage({ type: 'render', job: { id, ...packet, samples: { length: packet.sampleCount } } },
          [packet.numbers.buffer, packet.tags.buffer, packet.sourceIndices.buffer]);
      });
    },
    dispose() { disposed = true; fail(new Error('Pattern service disposed.')); },
  };
}
