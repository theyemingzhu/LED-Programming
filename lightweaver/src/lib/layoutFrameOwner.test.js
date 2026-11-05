import test from 'node:test';
import assert from 'node:assert/strict';
import { createLayoutFrameOwner } from '../components/layout/hooks/layoutFrameOwner.js';

const flush = () => new Promise(resolve => setImmediate(resolve));
function harness() {
  const calls = [], frames = [], errors = [], services = [];
  const owner = createLayoutFrameOwner({
    createService: () => { const service = { disposed: false, dispose() { this.disposed = true; } }; services.push(service); return service; },
    renderFrame: (input, service) => new Promise((resolve, reject) => calls.push({ input, service, resolve, reject })),
    onFrame: frame => frames.push(frame), onError: error => errors.push(error),
  });
  return { owner, calls, frames, errors, services };
}
test('one running frame coalesces animation requests to the latest input', async () => {
  const h = harness(), identity = {};
  h.owner.request({ t: 1 }, identity); h.owner.request({ t: 2 }, identity); h.owner.request({ t: 3 }, identity);
  assert.equal(h.calls.length, 1);
  h.calls[0].resolve('first'); await flush();
  assert.deepEqual(h.frames, ['first']); assert.equal(h.calls.length, 2); assert.equal(h.calls[1].input.t, 3);
  h.calls[1].resolve('latest'); await flush(); assert.deepEqual(h.frames, ['first', 'latest']); h.owner.dispose();
});
test('new geometry/source generation cancels old work and stale success or rejection cannot publish', async () => {
  const h = harness(); h.owner.request({ t: 1 }, {}); h.owner.request({ t: 2 }, {});
  assert.equal(h.services[0].disposed, true); assert.equal(h.calls.length, 2);
  h.calls[0].resolve('stale'); h.calls[1].resolve('new'); await flush();
  assert.deepEqual(h.frames, ['new']); assert.deepEqual(h.errors, [null, null]);
  h.owner.request({ t: 3 }, {}); h.owner.dispose(); h.calls[2].reject(Error('late')); await flush();
  assert.deepEqual(h.frames, ['new']); assert.equal(h.errors.length, 3);
});
test('failure retains the last frame and stops ticking until explicit retry or changed inputs', async () => {
  const h = harness(), identity = {};
  h.owner.request({ t: 1 }, identity); h.calls[0].resolve('held'); await flush();
  h.owner.request({ t: 2 }, identity); h.owner.request({ t: 3 }, identity);
  h.calls[1].reject(Error('deadline')); await flush();
  assert.deepEqual(h.frames, ['held']); assert.equal(h.errors.at(-1).message, 'deadline'); assert.equal(h.services[0].disposed, true);
  h.owner.request({ t: 4 }, identity); assert.equal(h.calls.length, 2);
  h.owner.retry(); assert.equal(h.calls.length, 3); assert.equal(h.calls[2].input.t, 4);
  h.calls[2].resolve('recovered'); await flush(); assert.deepEqual(h.frames, ['held', 'recovered']); h.owner.dispose();
});
