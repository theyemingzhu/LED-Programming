import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';
import { Miniflare } from 'miniflare';

import { handleAccountPagesRequest } from './[[path]].js';
import { handleLibraryPagesRequest } from '../library/[[path]].js';
import { createD1AccountStore } from '../library/_shared/accountStore.js';

const ROOT = 'https://studio.example.test';
const EMAIL = 'founder@example.test';
const clockStart = Date.parse('2026-08-01T00:00:00.000Z');

const credentials = {
  STUDIO_PASSWORDLESS_AUTH_ENABLED: 'true',
  STUDIO_GOOGLE_CLIENT_ID: 'lightweaver-test.apps.googleusercontent.com',
  STUDIO_GOOGLE_CLIENT_SECRET: 'google-test-client-secret',
  STUDIO_AUTH_CODE_KEY: 'test-key-that-is-32-characters-long',
  STUDIO_EMAIL_ACCOUNT_ID: '0123456789abcdef0123456789abcdef',
  STUDIO_EMAIL_API_TOKEN: 'email-test-token',
  STUDIO_EMAIL_FROM: 'studio@example.test',
};

async function fixture(t) {
  const miniflare = new Miniflare({
    compatibilityDate: '2026-07-15',
    modules: true,
    script: 'export default { fetch() { return new Response("ok") } }',
    d1Databases: ['PROJECTS_DB'],
    r2Buckets: ['PROJECT_BLOBS'],
  });
  t.after(() => miniflare.dispose());
  const db = await miniflare.getD1Database('PROJECTS_DB');
  for (const name of ['0001_cloud_project_library', '0002_account_access', '0003_account_session_generation']) {
    const migration = await readFile(new URL(`../../../migrations/${name}.sql`, import.meta.url), 'utf8');
    for (const statement of migration.split(';').map(value => value.trim()).filter(Boolean)) {
      await db.prepare(statement).run();
    }
  }
  const env = { PROJECTS_DB: db, PROJECT_BLOBS: await miniflare.getR2Bucket('PROJECT_BLOBS'), ...credentials };
  let time = clockStart;
  const accountStore = createD1AccountStore(env, { now: () => time, passwordIterations: 1000 });
  const owner = await accountStore.createAccount({
    username: 'founder', displayName: 'Studio founder', role: 'owner', temporaryPassword: 'unused-temporary-password',
  });
  const mail = [];
  let exchange;
  const waits = [];
  const providerFetch = async (url, options) => {
    assert.equal(options.redirect, 'manual', 'Workers require manual handling of provider redirects');
    if (String(url) === 'https://oauth2.googleapis.com/token') {
      assert.ok(exchange, 'unexpected Google token exchange');
      return exchange(options);
    }
    assert.equal(String(url), 'https://api.cloudflare.com/client/v4/accounts/0123456789abcdef0123456789abcdef/email/sending/send');
    const sent = JSON.parse(options.body);
    assert.equal(options.headers.authorization, 'Bearer email-test-token');
    mail.push(sent);
    return Response.json({ success: true, result: { queued: [sent.to], delivered: [] } });
  };
  async function request(path, { body, sameOrigin = true, headers = {}, options = {} } = {}) {
    const response = await handleAccountPagesRequest({
      env,
      request: new Request(`${ROOT}/api/account/${path}`, {
        method: body ? 'POST' : 'GET',
        headers: { 'cf-connecting-ip': '192.0.2.2', ...headers, ...(body ? {
          'content-type': 'application/json',
          origin: sameOrigin ? ROOT : 'https://other.example.test',
        } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      }),
      waitUntil: promise => waits.push(promise),
    }, { accountStore, now: () => time, providerFetch, ...options });
    await Promise.all(waits.splice(0));
    return response;
  }
  async function migrateAndLink(email = EMAIL) {
    const migration = await readFile(new URL('../../../migrations/0004_studio_passwordless.sql', import.meta.url), 'utf8');
    for (const statement of migration.split(';').map(value => value.trim()).filter(Boolean)) {
      await db.prepare(statement).run();
    }
    await db.prepare('INSERT INTO account_sign_in_emails (email, account_id) VALUES (?, ?)')
      .bind(email, owner.id).run();
  }
  function library(path, cookie, body) {
    return handleLibraryPagesRequest({
      env,
      request: new Request(`${ROOT}/api/library/${path}`, {
        method: body ? 'POST' : 'GET',
        headers: { cookie, ...(body ? { 'content-type': 'application/json', origin: ROOT } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      }),
    }, { accountStore });
  }
  return { env, db, owner, mail, request, library, migrateAndLink, advance: ms => { time += ms; },
    setExchange: handler => { exchange = handler; } };
}

function codeFrom(mail) { return mail.text.match(/\b\d{6}\b/)[0]; }
function cookieFrom(response) {
  const header = response.headers.getSetCookie().find(value => value.startsWith('__Host-lightweaver_session='));
  assert.ok(header);
  return header.split(';')[0];
}

test('passwordless readiness fails closed until D1 migration and an approved owner exist', async t => {
  const f = await fixture(t);
  const pending = await f.request('methods');
  assert.equal(pending.status, 200);
  assert.deepEqual(await pending.json(), { enabled: true, google: false, email: false });
  await f.migrateAndLink();
  const response = await f.request('methods');
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await response.json(), { enabled: true, google: true, email: true });
  f.env.STUDIO_PASSWORDLESS_AUTH_ENABLED = 'false';
  assert.deepEqual(await (await f.request('methods')).json(), { enabled: false, google: false, email: false });
});

test('only an owner can invite buyers by email, and a buyer can open only the artwork assigned to their account', async t => {
  const f = await fixture(t);
  await f.migrateAndLink();
  async function signIn(email) {
    await f.request('email/start', { body: { email } });
    assert.equal(f.mail.at(-1).to, email);
    return cookieFrom(await f.request('email/verify', { body: { email, code: codeFrom(f.mail.at(-1)) } }));
  }
  const owner = await signIn(EMAIL);
  const buyerEmail = 'buyer@custom.example';
  const invite = { email: buyerEmail, displayName: 'Artwork buyer', role: 'customer' };
  const invited = await f.library('accounts', owner, invite);
  assert.equal(invited.status, 201);
  const { account: buyerAccount } = await invited.json();
  assert.equal(buyerAccount.email, buyerEmail);
  assert.equal(buyerAccount.mustChangePassword, false);
  const duplicate = await f.library('accounts', owner, invite);
  assert.equal(duplicate.status, 409);
  assert.equal((await f.db.prepare('SELECT COUNT(*) AS count FROM accounts').first()).count, 2);

  async function art(id) {
    const response = await f.library('projects', owner, {
      title: id, project: { version: 3, id, name: id, layout: { strips: [] }, pattern: {}, show: {}, live: {}, devices: {} },
    });
    assert.equal(response.status, 201);
    return (await response.json()).project;
  }
  const assignedArt = await art('assigned-artwork');
  const unassignedArt = await art('unassigned-artwork');
  const assigned = await f.library(`accounts/${buyerAccount.id}/assignments`, owner, { projectId: assignedArt.id });
  assert.equal(assigned.status, 201);
  const { assignment } = await assigned.json();

  const buyer = await signIn(buyerEmail);
  const visible = await (await f.library('projects', buyer)).json();
  assert.deepEqual(visible.projects.map(project => project.id), [assignment.draftProjectId]);
  assert.equal((await f.library(`projects/${assignment.draftProjectId}`, buyer)).status, 200);
  assert.equal((await f.library(`projects/${unassignedArt.id}`, buyer)).status, 404);
  assert.equal((await f.library('accounts', buyer, { ...invite, email: 'else@custom.example' })).status, 403);
  await f.db.prepare('DELETE FROM account_sign_in_emails WHERE email = ?').bind(buyerEmail).run();
  assert.equal((await f.library('projects', buyer)).status, 401);
});

test('email code is delivered only for approved addresses and creates the same native owner session exactly once', async t => {
  const f = await fixture(t);
  await f.migrateAndLink();
  const unknown = await f.request('email/start', { body: { email: 'other@example.test' } });
  const crossSite = await f.request('email/start', { body: { email: EMAIL }, sameOrigin: false });
  assert.equal(crossSite.status, 403);
  assert.equal(f.mail.length, 0);
  const issued = await f.request('email/start', { body: { email: EMAIL.toUpperCase() } });
  assert.deepEqual(await issued.json(), await unknown.json());
  assert.equal(issued.status, unknown.status);
  assert.equal(f.mail.length, 1);
  assert.equal(f.mail[0].to, EMAIL);
  await f.request('email/start', { body: { email: EMAIL } });
  assert.equal(f.mail.length, 1, 'resend respects the cooldown');

  const code = codeFrom(f.mail[0]);
  const stored = await f.db.prepare('SELECT * FROM account_email_challenges').first();
  assert.equal(JSON.stringify(stored).includes(code), false);
  const attempts = await Promise.all([1, 2].map(() => f.request('email/verify', { body: { email: EMAIL, code } })));
  assert.deepEqual(attempts.map(response => response.status).sort(), [200, 401]);
  const cookie = cookieFrom(attempts.find(response => response.ok));
  assert.match(cookie, /^__Host-lightweaver_session=/);
  const verified = await (await f.request('session', { headers: { cookie } })).json();
  assert.deepEqual(verified.session, {
    username: 'founder', displayName: 'Studio founder', role: 'owner', mustChangePassword: false,
  });
  const sessions = (await f.db.prepare('SELECT account_id FROM account_sessions').all()).results;
  assert.deepEqual(sessions, [{ account_id: f.owner.id }]);
  f.env.STUDIO_PASSWORDLESS_AUTH_ENABLED = 'false';
  // Use the rollback deployment's store rather than the injected enabled store.
  const disabledSession = await handleAccountPagesRequest({
    env: f.env,
    request: new Request(`${ROOT}/api/account/session`, { headers: { cookie } }),
  }, { accountStore: createD1AccountStore(f.env, { now: () => clockStart, passwordIterations: 1000 }) });
  assert.equal(disabledSession.status, 401);
});

test('Resend delivers a Studio code using its sending key without a Cloudflare account ID', async t => {
  const f = await fixture(t);
  await f.migrateAndLink();
  f.env.STUDIO_EMAIL_PROVIDER = 'resend';
  delete f.env.STUDIO_EMAIL_ACCOUNT_ID;
  assert.equal((await (await f.request('methods')).json()).email, true);
  let sent;
  const start = await f.request('email/start', {
    body: { email: EMAIL },
    options: { providerFetch: async (url, options) => {
      assert.equal(url, 'https://api.resend.com/emails');
      assert.equal(options.redirect, 'manual');
      assert.equal(options.headers.authorization, 'Bearer email-test-token');
      sent = JSON.parse(options.body);
      return Response.json({ id: 'c4ad7fce-4210-4ed6-b404-6dddb83ba94b' });
    } },
  });
  assert.equal(start.status, 202);
  assert.equal(sent.to, EMAIL);
  assert.equal(sent.from, credentials.STUDIO_EMAIL_FROM);
  const verified = await f.request('email/verify', { body: { email: EMAIL, code: codeFrom(sent) } });
  assert.equal(verified.status, 200);
  assert.equal((await verified.json()).session.role, 'owner');
});

test('email codes expire, run out of attempts, and fail after the approved account changes', async t => {
  const f = await fixture(t);
  await f.migrateAndLink();
  await f.request('email/start', { body: { email: EMAIL } });
  const expired = codeFrom(f.mail.at(-1));
  f.advance(10 * 60 * 1000 + 1);
  assert.equal((await f.request('email/verify', { body: { email: EMAIL, code: expired } })).status, 401);

  await f.request('email/start', { body: { email: EMAIL } });
  const correct = codeFrom(f.mail.at(-1));
  const wrong = correct === '000000' ? '111111' : '000000';
  for (let n = 0; n < 5; n += 1) {
    assert.equal((await f.request('email/verify', { body: { email: EMAIL, code: wrong } })).status, 401);
  }
  assert.equal((await f.request('email/verify', { body: { email: EMAIL, code: correct } })).status, 401);

  f.advance(60_001);
  await f.request('email/start', { body: { email: EMAIL } });
  const oldGeneration = codeFrom(f.mail.at(-1));
  await f.db.prepare('UPDATE accounts SET session_generation = 1 WHERE id = ?').bind(f.owner.id).run();
  assert.equal((await f.request('email/verify', { body: { email: EMAIL, code: oldGeneration } })).status, 401);
});

test('an unmapped legacy owner cannot be the only owner with sign-in enabled', async t => {
  const f = await fixture(t);
  await f.migrateAndLink();
  const accounts = createD1AccountStore(f.env, { passwordIterations: 1000 });
  await accounts.createAccount({
    username: 'legacy-owner', displayName: 'Legacy owner', role: 'owner', temporaryPassword: 'unused-temporary-password',
  });
  await assert.rejects(accounts.setAccountRole({ id: f.owner.id, role: 'worker' }), { code: 'last_owner_required' });
  await assert.rejects(accounts.setAccountStatus({ id: f.owner.id, status: 'disabled' }), { code: 'last_owner_required' });
  assert.equal((await accounts.getAccount(f.owner.id)).role, 'owner');
  assert.equal((await accounts.getAccount(f.owner.id)).status, 'active');
});

test('Google returns to Studio only after matching browser state, PKCE, nonce and an approved Google subject', async t => {
  const f = await fixture(t);
  await f.migrateAndLink('founder@gmail.com');
  const keys = await generateKeyPair('RS256', { extractable: true });
  const jwk = { ...await exportJWK(keys.publicKey), kid: 'tests' };
  const googleJwks = createLocalJWKSet({ keys: [jwk] });

  async function attempt({ wrongState, wrongNonce, subject = 'known-google-sub', email = 'founder@gmail.com' } = {}) {
    const started = await f.request('google/start?returnTo=https://other.example.test/');
    assert.equal(started.status, 302);
    const authorization = new URL(started.headers.get('location'));
    assert.equal(authorization.origin, 'https://accounts.google.com');
    assert.equal(authorization.searchParams.get('redirect_uri'), `${ROOT}/api/account/google/callback`);
    assert.equal(authorization.searchParams.get('code_challenge_method'), 'S256');
    const state = authorization.searchParams.get('state');
    const nonce = authorization.searchParams.get('nonce');
    const cookie = started.headers.getSetCookie()[0].split(';')[0];

    f.setExchange(async options => {
      const body = new URLSearchParams(options.body);
      assert.equal(body.get('redirect_uri'), `${ROOT}/api/account/google/callback`);
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body.get('code_verifier')));
      assert.equal(Buffer.from(digest).toString('base64url'), authorization.searchParams.get('code_challenge'));
      const token = await new SignJWT({
        nonce: wrongNonce ? 'invalid' : nonce, email, email_verified: true,
      }).setProtectedHeader({ alg: 'RS256', kid: 'tests' })
        .setSubject(subject).setIssuer('https://accounts.google.com').setAudience(credentials.STUDIO_GOOGLE_CLIENT_ID)
        .setIssuedAt(clockStart / 1000).setExpirationTime(clockStart / 1000 + 60).sign(keys.privateKey);
      return Response.json({ id_token: token });
    });
    const callbackPath = `google/callback?state=${wrongState ? 'wrong' : state}&code=google-code`;
    const response = await f.request(callbackPath, { headers: { cookie }, options: { googleJwks } });
    return { response, callbackPath, cookie };
  }

  for (const bad of [{ wrongState: true }, { wrongNonce: true }, { email: 'other@example.com' }]) {
    const { response } = await attempt(bad);
    assert.equal(response.headers.get('location'), '/?lwSignIn=error');
    assert.equal(response.headers.getSetCookie().some(value => value.startsWith('__Host-lightweaver_session=')), false);
  }
  const { response, callbackPath, cookie } = await attempt();
  assert.equal(response.headers.get('location'), '/?lwSignIn=success');
  const existing = await f.db.prepare('SELECT account_id, google_subject FROM account_sign_in_emails').first();
  assert.deepEqual(existing, { account_id: f.owner.id, google_subject: 'known-google-sub' });
  assert.equal((await f.request('session', { headers: { cookie: cookieFrom(response) } })).status, 200);
  assert.equal((await f.request(callbackPath, { headers: { cookie }, options: { googleJwks } })).headers.get('location'), '/?lwSignIn=error');
  assert.equal((await attempt({ subject: 'different-google-sub' })).response.headers.get('location'), '/?lwSignIn=error');
});
