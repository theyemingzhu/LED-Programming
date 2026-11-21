// The practice card's two timing profiles. See docs/practice-card.md.
import { test, expect } from '@playwright/test';
import { cardState } from './harness/cardStates.js';
import { createPracticeCard, TimingController, REAL_PROFILE, FAST_PROFILE } from './harness/practiceTiming.js';

test.describe('practice card timing', () => {
  test('every Real-timing number names the trace it came from', () => {
    const numbers = [
      ...Object.keys(REAL_PROFILE.replyMs).map(k => `replyMs ${k}`),
      'restartSilenceMs', 'wifiReconnectGapMs', 'spontaneousSilence', 'unsettledAfterRestart', 'defaultReplyMs',
    ];
    for (const key of numbers) expect(REAL_PROFILE.sources[key], key).toBeTruthy();
    expect(REAL_PROFILE.restartSilenceMs).toBe(14_200);
  });

  test('Fast answers at once; Real-timing restarts for 14.2 s, then answers at card speed', () => {
    let now = 0;
    const clock = () => now;
    const fast = new TimingController('fast', { now: clock });
    const real = new TimingController('real', { now: clock, overrides: { spontaneousSilence: null, unsettledAfterRestart: null } });
    expect(fast.verdict('GET', '/api/status')).toEqual({ kind: 'answer', delayMs: 0 });
    const status = real.verdict('GET', '/api/status');
    expect(status.kind).toBe('answer');
    if (status.kind === 'answer') expect(status.delayMs).toBeGreaterThanOrEqual(59), expect(status.delayMs).toBeLessThanOrEqual(81);

    fast.answered('POST', '/api/reboot');
    real.answered('POST', '/api/reboot');
    now = 14_000;
    expect(fast.verdict('GET', '/api/status').kind).toBe('answer');
    expect(real.verdict('GET', '/api/status')).toMatchObject({ kind: 'drop', reason: 'restart' });
    now = 14_300;
    expect(real.verdict('GET', '/api/status').kind).toBe('answer');
  });

  test('a Fast card and a Real-timing card run at the same time in two tabs', async ({ browser }) => {
    const fast = createPracticeCard(cardState('playing'), { timing: 'fast' });
    const real = createPracticeCard(cardState('playing'), {
      timing: 'real',
      overrides: { spontaneousSilence: null, unsettledAfterRestart: null, restartSilenceMs: 3_000 },
    });
    expect(FAST_PROFILE.restartSilenceMs).toBe(0);
    const [a, b] = await Promise.all([browser.newPage(), browser.newPage()]);
    await fast.card.install(a);
    await real.card.install(b);
    const timed = (page: typeof a, path: string, method = 'GET') => page.evaluate(async ({ path, method }) => {
      const t0 = performance.now();
      try {
        const r = await fetch(`http://lightweaver.local${path}`, { method, body: method === 'POST' ? '{}' : undefined, signal: AbortSignal.timeout(1500) });
        return { ok: r.ok, ms: performance.now() - t0 };
      } catch { return { ok: false, ms: performance.now() - t0 }; }
    }, { path, method });

    expect((await timed(b, '/api/reboot', 'POST')).ok).toBe(true);
    expect((await timed(a, '/api/reboot', 'POST')).ok).toBe(true);
    // Same moment: the Fast card is back at once, the Real-timing card is off the air.
    const [fastAfter, realAfter] = await Promise.all([timed(a, '/api/status'), timed(b, '/api/status')]);
    expect(fastAfter.ok).toBe(true);
    expect(realAfter.ok).toBe(false);
    await b.waitForTimeout(1_700);
    const realBack = await timed(b, '/api/status');
    expect(realBack.ok).toBe(true);
    expect(realBack.ms).toBeGreaterThan(50);
    await Promise.all([a.close(), b.close()]);
  });
});
