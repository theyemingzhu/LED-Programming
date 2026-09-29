import test from 'node:test';
import assert from 'node:assert/strict';
import { handleOwnerStudio, ownerEntryHtml, OWNER_LOGIN_SCRIPT } from '../functions/api/owner/studio.js';

const token = 'a'.repeat(43);
function harness(identity = null, cookie = `__Host-lightweaver_session=${token}`) {
  const calls = [];
  return {
    calls,
    context: { request: new Request('https://led.mandalacodes.com/api/owner/studio?return=https://evil.example', { headers: cookie ? { cookie } : {} }), env: { ASSETS: { fetch: async request => { calls.push(request); return new Response('<html>Studio</html>', { headers: { 'content-type': 'text/html', 'set-cookie': 'untrusted=1', 'cache-control': 'public' } }); } } } },
    options: { accountStore: { authenticateSession: async value => { assert.equal(value, token); return identity; } } },
  };
}

test('missing or invalid session cannot load Studio through owner entry', async () => {
  for (const cookie of ['', `__Host-lightweaver_session=${token}`]) {
    const h = harness(null, cookie); const response = await handleOwnerStudio(h.context, h.options);
    assert.equal(response.status, 401); assert.equal(response.headers.get('cache-control'), 'no-store');
    const html = await response.text(); assert.match(html, /Username/); assert.doesNotMatch(html, /evil\.example|<html>Studio/);
    assert.equal(h.calls.length, 0);
  }
});
test('nonowners and temporary passwords cannot load owner tools', async () => {
  for (const identity of [{ role: 'customer' }, { role: 'worker' }, { role: 'owner', mustChangePassword: true }]) {
    const h = harness(identity); const response = await handleOwnerStudio(h.context, h.options);
    assert.equal(response.status, 403); assert.equal(h.calls.length, 0);
    assert.match(await response.text(), identity.role === 'owner' ? /Choose your password/ : /Owner account needed/);
  }
});
test('owner receives static Studio without forwarding or returning cookies', async () => {
  const h = harness({ role: 'owner', mustChangePassword: false });
  const response = await handleOwnerStudio(h.context, h.options);
  assert.equal(response.status, 200); assert.equal(await response.text(), '<html>Studio</html>');
  assert.equal(response.headers.get('cache-control'), 'no-store'); assert.equal(response.headers.get('set-cookie'), null);
  assert.equal(response.headers.get('vary'), 'Cookie');
  assert.equal(h.calls[0].url, 'https://led.mandalacodes.com/index.html'); assert.equal(h.calls[0].headers.get('cookie'), null);
});
test('session/storage failure fails closed; no arbitrary redirect or POST entry', async () => {
  const h = harness({ role: 'owner' }); delete h.context.env.ASSETS;
  assert.equal((await handleOwnerStudio(h.context, h.options)).status, 503);
  h.options.accountStore.authenticateSession = async () => { throw Error('database failure'); };
  assert.equal((await handleOwnerStudio(h.context, h.options)).status, 503);
  h.context.request = new Request(h.context.request.url, { method: 'POST' });
  assert.equal((await handleOwnerStudio(h.context, h.options)).status, 405);
  assert.match(ownerEntryHtml(), /https:\/\/light\.mandalacodes\.com\//);
  assert.match(OWNER_LOGIN_SCRIPT, /location.replace\('\/api\/owner\/studio'\)/);
});
test('public sign-in script is no-store and contains no Studio code or credentials', async () => {
  const h = harness(); h.context.request = new Request('https://led.mandalacodes.com/api/owner/studio?asset=login.js');
  const response = await handleOwnerStudio(h.context, h.options);
  assert.equal(response.status, 200); assert.equal(response.headers.get('content-type'), 'text/javascript; charset=utf-8');
  assert.equal(await response.text(), OWNER_LOGIN_SCRIPT); assert.equal(h.calls.length, 0);
});
