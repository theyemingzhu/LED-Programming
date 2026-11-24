// Real card lw-b0fe81f61b44, signed 1.2.4 and 1.2.5 bench builds, 23 Nov 2026:
// GET /api/client-pattern?patternId=fire, then POST /api/client-pattern with a
// valid body answered 400 "invalid pattern envelope". The same POST alone, or
// after a GET /api/status, passed the envelope check. The query argument of the
// GET is still counted by server.args() when the raw-body POST is checked, so
// the envelope must be judged by the body alone. The body check (exactly four
// keys, typed) already rejects anything a query argument could smuggle in.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const web = readFileSync(new URL('../src/LightweaverWeb.cpp', import.meta.url), 'utf8');
const start = web.indexOf('void handleClientPatternPost() {');
assert.ok(start >= 0, 'handleClientPatternPost exists');
const body = web.slice(start, web.indexOf('\n}\n', start));
const envelope = body.slice(body.indexOf('if (!parsed'), body.indexOf('invalid pattern envelope'));
assert.doesNotMatch(envelope, /server\.args\(\)/,
  'a query GET before the save must not make the envelope check fail');
assert.match(envelope, /doc\.size\(\) != 4/, 'the body must still carry exactly four keys');
assert.match(envelope, /expectedCardId[\s\S]*expectedRevision[\s\S]*patternId/, 'typed keys still checked');
console.log('client-pattern-after-query-get: ok');
