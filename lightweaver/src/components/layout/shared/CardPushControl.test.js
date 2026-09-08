import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(new URL('./CardPushControl.jsx', import.meta.url), 'utf8');

test('cached retry and candidate mutations revalidate the prepared project transaction', () => {
  assert.match(source, /assertCurrentAttempt\(attempt\)[\s\S]*pushConfigToCard/);
  assert.match(source, /assertCurrentAttempt\(wiringCandidate\.attempt\)[\s\S]*activateAndWaitForCardWiring/);
  assert.match(source, /if \(visible\)[\s\S]*assertCurrentAttempt\(wiringCandidate\.attempt\)[\s\S]*confirmCardWiringCandidate/);
  assert.match(source, /else \{[\s\S]*assertCurrentAttempt\(wiringCandidate\.attempt\)[\s\S]*rollbackCardWiringCandidate/);
});

test('final card verification combines project identity with fresh runtime readiness', () => {
  assert.match(source, /readReadyDeploymentEvidence/);
  assert.match(source, /readCardProjectEvidence/);
  assert.match(source, /readCardStatusEnvelope/);
});

test('a resumed or expiring wiring test re-reads the exact card and clears stale confirmation controls', () => {
  assert.match(source, /resume-physical-test[\s\S]*expiresAt/);
  assert.match(source, /wiringTestState !== 'testing'[\s\S]*getCardWiringStatus/);
  assert.match(source, /status\.cardId === expectedCardId/);
  assert.match(source, /setWiringCandidate\(null\)[\s\S]*dispatchAction\(\{ type: 'fail'/);
});
