// Runs only in an opaque-origin sandbox. Never evaluate pattern source here:
// DOM navigation would be a capability even with connect-src 'none'.
addEventListener('message', function initialize(event) {
  if (event.source !== parent || event.data !== 'pattern-isolation-init' || !event.ports[0]) return;
  removeEventListener('message', initialize);
  const port = event.ports[0];
  let worker = null;
  let url = null;
  let expected = null;
  port.onmessage = ({ data }) => {
    if (data.type === 'stop') { worker?.terminate(); worker = null; return; }
    if (data.type === 'start') {
      worker?.terminate();
      if (url) URL.revokeObjectURL(url);
      url = URL.createObjectURL(new Blob([data.runtime], { type: 'text/javascript' }));
      worker = new Worker(url);
      worker.onmessage = ({ data: reply }) => {
        // Only a bounded byte buffer crosses back to the page. A hostile worker
        // may lie about its own colors; it cannot supply page objects or code.
        if (!expected || reply?.id !== expected.id) return;
        if (reply?.pixels instanceof Uint8Array && reply.pixels.length === expected.length
          && reply.pixels.buffer instanceof ArrayBuffer && reply.pixels.byteOffset === 0
          && reply.pixels.byteLength === reply.pixels.buffer.byteLength) {
          expected = null;
          port.postMessage({ id: reply.id, pixels: reply.pixels }, [reply.pixels.buffer]);
        } else if (typeof reply?.error === 'string') {
          expected = null;
          port.postMessage({ id: reply.id, error: reply.error.slice(0, 300) });
        }
      };
      worker.onerror = () => port.postMessage({ error: 'Pattern worker failed.' });
    }
    if (data.type === 'render') {
      expected = { id: data.job.id, length: data.job.samples.length * 3 };
      worker?.postMessage(data.job);
    }
  };
  port.start();
  port.postMessage({ ready: true });
});
