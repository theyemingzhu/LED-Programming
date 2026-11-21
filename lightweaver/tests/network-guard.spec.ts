// Proves no spec can reach the physical card (or any off-Mac address) by
// accident. See tests/harness/networkGuard.ts for why this exists.
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { GUARD_PORT, GUARD_PROBE_PATH, checkGuardLog, guardTestIgnore, physicalCardAllowed } from './harness/networkGuard';

test.skip(physicalCardAllowed, 'LW_ALLOW_PHYSICAL_CARD=1 turns the guard off on purpose');

const browserFetch = (url: string) => `fetch(${JSON.stringify(url)}, { signal: AbortSignal.timeout(4000) })
  .then(r => ({ ok: r.ok, status: r.status })).catch(e => ({ ok: false, error: String(e) }))`;

test('a browser request to the physical card address is refused by the tripwire', async ({ page }) => {
  await page.goto('/');
  for (const host of ['192.168.18.70', 'lightweaver.local', '192.168.4.1']) {
    const answer = await page.evaluate(browserFetch(`http://${host}${GUARD_PROBE_PATH}`));
    expect(answer.ok, host).toBe(false);
  }
  const probes: string[] = await (await fetch(`http://127.0.0.1:${GUARD_PORT}/__lw_network_guard/probes`)).json();
  expect(probes.some(p => p.includes('192.168.18.70'))).toBe(true);
  expect(probes.some(p => p.includes('lightweaver.local'))).toBe(true);
});

test('a request the spec answers itself still works (practice card, route stubs)', async ({ page }) => {
  await page.route('http://192.168.18.70/**', route => route.fulfill({
    status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: '{"cardId":"stub"}',
  }));
  await page.goto('/');
  const answer = await page.evaluate(browserFetch('http://192.168.18.70/api/status'));
  expect(answer).toMatchObject({ ok: true, status: 200 });
});

test('a Node-side request to the physical card is refused', async () => {
  await expect(fetch(`http://192.168.18.70${GUARD_PROBE_PATH}`)).rejects.toThrow(/Refused by tests\/harness\/networkGuard/);
  await expect(fetch(`http://192.168.18.70${GUARD_PROBE_PATH}`, { method: 'POST', body: '{}' })).rejects.toThrow(/Refused/);
});

test('a browser WRITE to the physical card is refused before it leaves this Mac', async ({ page }) => {
  await page.goto('/');
  const answer = await page.evaluate(`fetch("http://192.168.18.70${GUARD_PROBE_PATH}", { method: 'POST', body: '{}', signal: AbortSignal.timeout(4000) })
    .then(r => ({ ok: r.ok, status: r.status })).catch(e => ({ ok: false, error: String(e) }))`);
  expect(answer.ok).toBe(false);
  const probes: string[] = await (await fetch(`http://127.0.0.1:${GUARD_PORT}/__lw_network_guard/probes`)).json();
  expect(probes.filter(p => p.includes('192.168.18.70')).length).toBeGreaterThan(0);
});

test('the run fails when anything tried to WRITE to a private-network address', () => {
  const log = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'lw-guard-')), 'network-guard.log');
  fs.writeFileSync(log, `${new Date().toISOString()}\tPRIVATE\tbrowser POST\thttp://192.168.18.70/api/config\n`);
  expect(() => checkGuardLog(log)).toThrow(/NETWORK GUARD: 1 WRITE/);
  fs.writeFileSync(log, `${new Date().toISOString()}\tPRIVATE\tnode POST\thttp://192.168.18.70/api/reboot\n`);
  expect(() => checkGuardLog(log)).toThrow(/NETWORK GUARD: 1 WRITE/);
  // A refused read never reached the card: warned, not failed.
  fs.writeFileSync(log, `${new Date().toISOString()}\tPRIVATE\tbrowser GET\thttp://lightweaver.local/api/status\n`);
  expect(() => checkGuardLog(log)).not.toThrow();
  fs.writeFileSync(log, `${new Date().toISOString()}\tpublic\tbrowser CONNECT\thttps://example.com:443\n`);
  expect(() => checkGuardLog(log)).not.toThrow();
});

test('the live-hardware specs are not collected by default', () => {
  expect(guardTestIgnore).toContain('**/live-*.spec.ts');
});
