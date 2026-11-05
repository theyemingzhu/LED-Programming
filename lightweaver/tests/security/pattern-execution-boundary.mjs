// Explicit unresolved security regressions: run manually; this is intentionally
// outside test:unit until the execution boundary is repaired.
//   node lightweaver/tests/security/pattern-execution-boundary.mjs
// --characterize verifies the known findings/harness, not security containment.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import test from 'node:test';

const characterize = process.argv.includes('--characterize');
const child = fileURLToPath(new URL('./fixtures/pattern-boundary-probe.mjs', import.meta.url));

function probe(target, name) {
  const result = spawnSync(process.execPath, ['--max-old-space-size=64', child, target, name], {
    // No inherited tokens, cwd files, browser profile, network requests, storage,
    // or user input. Only the fixed synthetic probes above execute in this child.
    env: {}, cwd: tmpdir(), encoding: 'utf8', timeout: 1200, killSignal: 'SIGKILL', maxBuffer: 16_384,
  });
  const records = result.stdout.trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
  const timedOut = result.error?.code === 'ETIMEDOUT';
  if (timedOut) {
    assert.ok(records.some(record => record.phase === 'evaluating'), 'timeout must occur during pattern evaluation');
    assert.equal(result.signal, 'SIGKILL', 'the unresponsive child must be killed');
    return { timedOut: true };
  }
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
  return { timedOut: false, ...records.at(-1) };
}

for (const target of ['studio', 'mapper', 'registry', 'legacy']) {
  test(`${target}: normal math returns the expected color`, () => {
    const result = probe(target, 'color');
    assert.deepEqual(result.pixel, { r: 255, g: 0, b: 0 });
  });
  test(`${target}: direct fetch name is unavailable`, () => {
    assert.equal(probe(target, 'shadow').pixel.r, characterize && target === 'legacy' ? 173 : 0);
  });
  for (const escape of ['receiver', 'computed', 'storage']) {
    test(`${target}: ${escape} cannot reach the caller realm's synthetic canary`, () => {
      const result = probe(target, escape);
      assert.equal(result.timedOut, false);
      const leaked = result.pixel?.r === 173;
      assert.equal(leaked, characterize, characterize
        ? 'known escape changed; investigate before updating characterization'
        : 'untrusted pattern reached caller-realm data');
    });
  }
  test(`${target}: pattern cannot mutate caller-realm Math`, () => {
    const result = probe(target, 'mutation');
    assert.equal(result.mutation ?? 0, characterize ? 173 : 0, 'shared realm mutation crossed the boundary');
  });
  test(`${target}: a nonterminating pattern must be rejected or stop within a bounded evaluator`, () => {
    const result = probe(target, 'loop');
    assert.equal(result.timedOut, characterize, characterize
      ? 'known unbounded evaluation changed; investigate'
      : 'the compiler/evaluator hung; only the external test harness killed it');
  });
}
