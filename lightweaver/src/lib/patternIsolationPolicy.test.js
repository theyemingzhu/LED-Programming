import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

test('public and sandbox policies authorize only the exact fixed bootstrap', () => {
  const source = readFileSync(new URL('./pattern-isolation/bootstrap.js', import.meta.url));
  const hash = `sha256-${createHash('sha256').update(source).digest('base64')}`;
  const headers = readFileSync(new URL('../../public/_headers', import.meta.url), 'utf8');
  const service = readFileSync(new URL('./patternFrameIsolation.js', import.meta.url), 'utf8');
  assert.ok(headers.includes(`'${hash}'`), 'bootstrap edits must update the deployed CSP');
  assert.ok(service.includes(`'${hash}'`), 'sandbox CSP must match the exact bytes');
  assert.ok(!headers.includes("script-src 'self' 'unsafe-inline'"));
});
