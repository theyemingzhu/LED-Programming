import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { handleAccountPagesRequest } from '../functions/api/account/[[path]].js';
import { handleLibraryPagesRequest } from '../functions/api/library/[[path]].js';

const headers = readFileSync(resolve(import.meta.dirname, '../public/_headers'), 'utf8');

assert.match(headers, /^\/\*$/m, 'root deployment headers must apply to every Studio route');
assert.doesNotMatch(headers, /^\/design/m, 'headers must not preserve the removed deployment mount');

assert.doesNotMatch(
  headers,
  /^ \s*X-Frame-Options:/im,
  'Studio keeps legacy iframe compatibility for already-installed cards',
);

const cspLine = headers.split('\n').find(line => /Content-Security-Policy:/i.test(line)) || '';
assert.match(cspLine, /frame-ancestors[^;\n]+https:\/\/led\.mandalacodes\.com/);
assert.match(cspLine, /frame-ancestors[^;\n]+http:\/\/lightweaver\.local:\*/);
assert.match(cspLine, /frame-ancestors[^;\n]+http:\/\/192\.168\.4\.1:\*/);

// Cloudflare Web Analytics is injected at the edge: its beacon loads from
// static.cloudflareinsights.com and reports to cloudflareinsights.com. Allow
// exactly those two hosts, never a wildcard or bare https:, so the CSP still
// blocks every other outbound script and request.
const cspDirective = name => (cspLine.match(new RegExp(`${name} ([^;]+)`)) || [])[1]?.split(/\s+/) || [];
assert.ok(cspDirective('script-src').includes('https://static.cloudflareinsights.com'), 'analytics beacon script must be allowed');
assert.ok(cspDirective('connect-src').includes('https://cloudflareinsights.com'), 'analytics beacon reports must be allowed');
for (const directive of ['script-src', 'connect-src']) {
  const sources = cspDirective(directive);
  assert.ok(!sources.includes('https:') && !sources.some(s => s.includes('*.')), `${directive} must not open every HTTPS host`);
  assert.ok(!sources.includes("'unsafe-inline'"), `${directive} must not allow inline code`);
}

// index.html's classic inline script (the open-from-file fallback) ships
// byte-for-byte through Vite, so it is allowed by its exact hash. Editing that
// script changes the hash: update public/_headers with the value printed here.
const indexHtml = readFileSync(resolve(import.meta.dirname, '../index.html'), 'utf8');
for (const [, attrs, body] of indexHtml.matchAll(/<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/g)) {
  if (/type=["']module["']/.test(attrs) || !body.trim()) continue; // module entries are bundled to /assets
  const hash = `'sha256-${createHash('sha256').update(body).digest('base64')}'`;
  assert.ok(cspDirective('script-src').includes(hash), `index.html inline script must be allowed by script-src ${hash}`);
}

const unauthenticatedLibraryResponse = await handleLibraryPagesRequest({
  request: new Request('https://led.mandalacodes.com/api/library/session'),
  env: {},
  params: { path: ['session'] },
});
assert.equal(unauthenticatedLibraryResponse.status, 401, 'the Function must deny a missing Access assertion');
assert.equal(
  unauthenticatedLibraryResponse.headers.get('cache-control'),
  'no-store',
  'even API authentication failures must be explicitly non-cacheable',
);
const unauthenticatedProjectsResponse = await handleLibraryPagesRequest({
  request: new Request('https://led.mandalacodes.com/api/library/projects'),
  env: {},
  params: { path: ['projects'] },
});
assert.equal(unauthenticatedProjectsResponse.status, 401, 'project data must remain private without an authenticated session');
assert.equal(unauthenticatedProjectsResponse.headers.get('cache-control'), 'no-store');

const unauthenticatedAccountResponse = await handleAccountPagesRequest({
  request: new Request('https://led.mandalacodes.com/api/account/session'),
  env: {},
}, { accountStore: {} });
assert.equal(unauthenticatedAccountResponse.status, 401, 'the public account session route must deny a missing native session');
assert.equal(
  unauthenticatedAccountResponse.headers.get('cache-control'),
  'no-store',
  'native account authentication failures must be explicitly non-cacheable',
);

const missingAccountBindingResponse = await handleAccountPagesRequest({
  request: new Request('https://led.mandalacodes.com/api/account/session'),
  env: {},
});
assert.equal(missingAccountBindingResponse.status, 503, 'account access must fail closed when PROJECTS_DB is absent');
assert.equal(missingAccountBindingResponse.headers.get('cache-control'), 'no-store');

const invalidCredentialsResponse = await handleAccountPagesRequest({
  request: new Request('https://led.mandalacodes.com/api/account/login', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: 'https://led.mandalacodes.com',
    },
    body: JSON.stringify({ username: 'unknown-user', password: 'synthetic-invalid-password' }),
  }),
  env: {},
}, {
  accountStore: {
    async verifyLogin() {
      throw Object.assign(new Error('internal credential detail'), { code: 'invalid_credentials' });
    },
  },
});
assert.equal(invalidCredentialsResponse.status, 401, 'the public login route must reject bad credentials');
assert.equal(invalidCredentialsResponse.headers.get('cache-control'), 'no-store');
assert.deepEqual(await invalidCredentialsResponse.json(), {
  error: {
    code: 'invalid_credentials',
    message: 'Invalid username or password.',
  },
}, 'bad login details must be rejected with one generic public error');

console.log('pages-headers tests passed');
