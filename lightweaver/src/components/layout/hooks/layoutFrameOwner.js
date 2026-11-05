/** One running frame and one replaceable animation request. A changed input
 * identity owns a fresh isolated service; late promises can never publish.
 * Failures leave the consumer's last valid frame intact until retry/change.
 */
export function createLayoutFrameOwner({ createService, renderFrame, onFrame, onError }) {
  let disposed = false, generation = 0, identity, service = null;
  let running = false, stopped = false, latest = null, queued = false;
  function reset() {
    generation += 1;
    service?.dispose(); service = null;
    running = false; stopped = false; queued = false;
    onError(null);
  }
  function drain() {
    if (disposed || running || stopped || !queued) return;
    queued = false; running = true;
    const currentGeneration = generation, input = latest;
    // Include preparation failures in the same fail-closed path as worker errors.
    let result;
    try { service ||= createService(); result = renderFrame(input, service); }
    catch (error) { result = Promise.reject(error); }
    Promise.resolve(result).then(frame => {
      if (disposed || currentGeneration !== generation) return;
      running = false; onFrame(frame); drain();
    }, error => {
      if (disposed || currentGeneration !== generation) return;
      running = false; stopped = true; queued = false;
      service?.dispose(); service = null;
      onError(error instanceof Error ? error : new Error('Light preview unavailable.'));
    });
  }
  return {
    request(input, nextIdentity) {
      if (disposed) return;
      latest = input;
      if (identity !== nextIdentity) { identity = nextIdentity; reset(); }
      queued = true; drain();
    },
    retry() { if (!disposed && latest) { reset(); queued = true; drain(); } },
    dispose() { disposed = true; generation += 1; service?.dispose(); service = null; latest = null; queued = false; },
  };
}
