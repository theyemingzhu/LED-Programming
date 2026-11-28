import { createRemoteJWKSet, jwtVerify } from 'jose';
import { normalizeSignInEmail } from './accountStore.js';

const CODE_TTL_MS = 10 * 60_000;
const RESEND_DELAY_MS = 60_000;
const GOOGLE_TTL_MS = 10 * 60_000;
const MAX_CODE_ATTEMPTS = 5;
const GOOGLE_STATE_COOKIE = '__Host-lightweaver_oauth';
const GOOGLE_CALLBACK = '/api/account/google/callback';
const MANDALA_PROVIDER = 'https://mandalacodes.com/api/auth/lightweaver/';
const MANDALA_FLOW = 'mandala'; // Direct Google nonces are random 43-character tokens.
const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];
const googleKeys = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
const encoder = new TextEncoder();

export function studioPasswordlessEnabled(env) {
  return env?.STUDIO_PASSWORDLESS_AUTH_ENABLED === 'true';
}

function configuredMethods(env) {
  const enabled = studioPasswordlessEnabled(env);
  const ready = enabled && env.PROJECTS_DB && typeof env.STUDIO_AUTH_CODE_KEY === 'string'
    && env.STUDIO_AUTH_CODE_KEY.length >= 32;
  const provider = env.STUDIO_EMAIL_PROVIDER || 'cloudflare';
  const emailProviderReady = provider === 'resend'
    || (provider === 'cloudflare' && /^[a-f0-9]{32}$/i.test(env.STUDIO_EMAIL_ACCOUNT_ID || ''));
  return {
    enabled,
    google: Boolean(ready && (env.STUDIO_MANDALA_SIGN_IN_ENABLED === 'true'
      || (env.STUDIO_GOOGLE_CLIENT_ID && env.STUDIO_GOOGLE_CLIENT_SECRET))),
    email: Boolean(ready && emailProviderReady
      && env.STUDIO_EMAIL_API_TOKEN && normalizeSignInEmail(env.STUDIO_EMAIL_FROM)),
  };
}

function encodeBase64Url(bytes) {
  return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function randomToken() {
  return encodeBase64Url(crypto.getRandomValues(new Uint8Array(32)));
}

function randomCode() {
  // Discard the tail above a multiple of 1,000,000 to keep every code equally likely.
  const value = new Uint32Array(1);
  do {
    crypto.getRandomValues(value);
  } while (value[0] >= 4_294_000_000);
  return String(value[0] % 1_000_000).padStart(6, '0');
}

async function sha256(value) {
  return encodeBase64Url(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value))));
}

function oauthCookie(value, maxAge) {
  return `${GOOGLE_STATE_COOKIE}=${value}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;
}

function hasOAuthCookie(request, state) {
  const key = `${GOOGLE_STATE_COOKIE}=`;
  const cookies = (request.headers.get('cookie') || '').split(';')
    .map(part => part.trim()).filter(part => part.startsWith(key));
  return cookies.length === 1 && cookies[0].slice(key.length) === state;
}

function redirect(location, ...cookies) {
  const headers = new Headers({
    location,
    'cache-control': 'no-store',
    'referrer-policy': 'no-referrer',
  });
  for (const cookie of cookies) headers.append('set-cookie', cookie);
  return new Response(null, { status: 302, headers });
}

function studioReturn(success, cookie) {
  return redirect(success ? '/?lwSignIn=success' : '/?lwSignIn=error',
    oauthCookie('', 0), ...(cookie ? [cookie] : []));
}

function assertHttps(url) {
  if (url.protocol !== 'https:') throw new Error('HTTPS is required for Studio OAuth.');
}

async function signInMethods(env) {
  const methods = configuredMethods(env);
  if (!methods.google && !methods.email) return methods;
  try {
    const owner = await env.PROJECTS_DB.prepare(`
      SELECT 1 AS found FROM account_sign_in_emails AS e JOIN accounts AS a ON a.id = e.account_id
      WHERE a.role = 'owner' AND a.status = 'active' LIMIT 1
    `).first();
    if (owner) return methods;
  } catch {
    // Staged deploys may serve the shell before the D1 migration is applied.
  }
  return { enabled: methods.enabled, google: false, email: false };
}

async function sendCode(env, email, code, fetchImpl) {
  const resend = env.STUDIO_EMAIL_PROVIDER === 'resend';
  const endpoint = resend ? 'https://api.resend.com/emails'
    : `https://api.cloudflare.com/client/v4/accounts/${env.STUDIO_EMAIL_ACCOUNT_ID}/email/sending/send`;
  // Workers support manual redirects. The response check rejects all redirects.
  const result = await fetchImpl(endpoint, {
    method: 'POST',
    redirect: 'manual',
    signal: AbortSignal.timeout(8_000),
    headers: {
      authorization: `Bearer ${env.STUDIO_EMAIL_API_TOKEN}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      from: normalizeSignInEmail(env.STUDIO_EMAIL_FROM),
      to: email,
      subject: 'Your Lightweaver Studio sign-in code',
      text: `Your Lightweaver Studio code is ${code}. It expires in 10 minutes. If you did not request this code, ignore this email.`,
    }),
  });
  if (!result.ok) throw new Error('Email delivery failed.');
  const delivery = await result.json();
  const accepted = resend ? typeof delivery.id === 'string' && delivery.id.length > 0
    : delivery.success === true
      && [...(delivery.result?.queued || []), ...(delivery.result?.delivered || [])].includes(email);
  if (!accepted) {
    throw new Error('Email delivery was not accepted.');
  }
}

async function verifyGoogleIdentity({ requestUrl, env, flow, code, googleJwks, fetchImpl, current }) {
  const exchanged = await fetchImpl('https://oauth2.googleapis.com/token', {
    method: 'POST',
    redirect: 'manual',
    signal: AbortSignal.timeout(8_000),
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: env.STUDIO_GOOGLE_CLIENT_ID,
      client_secret: env.STUDIO_GOOGLE_CLIENT_SECRET,
      redirect_uri: new URL(GOOGLE_CALLBACK, requestUrl).href,
      grant_type: 'authorization_code',
      code_verifier: flow.code_verifier,
    }),
  });
  if (!exchanged.ok) throw new Error('Google sign-in failed.');
  const { id_token: token } = await exchanged.json();
  const { payload } = await jwtVerify(token, googleJwks || googleKeys, {
    algorithms: ['RS256'],
    issuer: GOOGLE_ISSUERS,
    audience: env.STUDIO_GOOGLE_CLIENT_ID,
    requiredClaims: ['exp', 'iat', 'sub', 'nonce', 'email', 'email_verified'],
    currentDate: new Date(current),
    maxTokenAge: '10m',
  });
  const email = normalizeSignInEmail(payload.email);
  // A verified non-Google mailbox can change hands. Require the separate email
  // code for addresses outside Gmail and managed Google Workspace.
  const managedDomain = typeof payload.hd === 'string' && /^[a-z0-9][a-z0-9.-]+$/i.test(payload.hd);
  if (payload.nonce !== flow.nonce || payload.email_verified !== true || !email
    || typeof payload.sub !== 'string' || !payload.sub.trim() || payload.sub.length > 255
    || (!email.endsWith('@gmail.com') && !managedDomain)
    || ((payload.azp !== undefined || Array.isArray(payload.aud) && payload.aud.length > 1)
      && payload.azp !== env.STUDIO_GOOGLE_CLIENT_ID)) {
    throw new Error('Google could not verify this sign-in.');
  }
  return { email, subject: payload.sub };
}

function createPasswordlessAuth(env, options) {
  const db = env.PROJECTS_DB;
  const now = options.now || Date.now;
  const fetchImpl = options.providerFetch || globalThis.fetch;
  let key;
  async function keyedDigest(value) {
    key ||= crypto.subtle.importKey('raw', encoder.encode(env.STUDIO_AUTH_CODE_KEY), {
      name: 'HMAC', hash: 'SHA-256',
    }, false, ['sign']);
    return encodeBase64Url(new Uint8Array(await crypto.subtle.sign('HMAC', await key, encoder.encode(value))));
  }

  async function limit(request, action, maxCount, width) {
    const ip = request.headers.get('cf-connecting-ip') || 'unidentified-client';
    const id = await keyedDigest(JSON.stringify(['rate', action, ip]));
    const current = now();
    // Trim a fixed-size batch so sporadic login requests cannot grow the table indefinitely.
    await db.prepare(`
      DELETE FROM account_sign_in_rate_limits WHERE bucket_key IN (
        SELECT bucket_key FROM account_sign_in_rate_limits WHERE resets_at <= ? LIMIT 64
      )
    `).bind(current).run();
    const allowed = await db.prepare(`
      INSERT INTO account_sign_in_rate_limits (bucket_key, count, resets_at) VALUES (?, 1, ?)
      ON CONFLICT(bucket_key) DO UPDATE SET
        count = CASE WHEN resets_at <= ? THEN 1 ELSE count + 1 END,
        resets_at = CASE WHEN resets_at <= ? THEN excluded.resets_at ELSE resets_at END
      WHERE resets_at <= ? OR count < ?
      RETURNING count
    `).bind(id, current + width, current, current, current, maxCount).first();
    return Boolean(allowed);
  }

  async function requestEmailCode(request, email, waitUntil) {
    if (!await limit(request, 'email-send', 15, 10 * 60_000)) return;
    const code = randomCode();
    const emailHash = await keyedDigest(JSON.stringify(['email', email]));
    const codeHash = await keyedDigest(JSON.stringify(['code', email, code]));
    const current = now();
    await db.prepare(`
      DELETE FROM account_email_challenges WHERE email_hash IN (
        SELECT email_hash FROM account_email_challenges WHERE expires_at <= ? LIMIT 64
      )
    `).bind(current).run();
    const challenge = await db.prepare(`
      INSERT INTO account_email_challenges (
        email_hash, account_id, account_generation, code_hash, expires_at, next_send_at, attempts, consumed
      )
      SELECT ?, a.id, a.session_generation, ?, ?, ?, 0, 0
      FROM account_sign_in_emails AS e JOIN accounts AS a ON a.id = e.account_id
      WHERE e.email = ? AND a.status = 'active'
      ON CONFLICT(email_hash) DO UPDATE SET
        account_id = excluded.account_id, account_generation = excluded.account_generation,
        code_hash = excluded.code_hash, expires_at = excluded.expires_at,
        next_send_at = excluded.next_send_at, attempts = 0, consumed = 0
      WHERE next_send_at <= ?
      RETURNING account_id
    `).bind(emailHash, codeHash, current + CODE_TTL_MS, current + RESEND_DELAY_MS, email, current).first();
    if (challenge) {
      // The public response stays identical for unknown accounts, throttled requests,
      // and provider errors. No provider response or private data goes into the logs.
      const delivery = sendCode(env, email, code, fetchImpl).catch(() => {});
      if (waitUntil) waitUntil(delivery);
      else await delivery;
    }
  }

  async function consumeEmailCode(request, email, code) {
    if (!await limit(request, 'email-verify', 30, 10 * 60_000)) return null;
    const emailHash = await keyedDigest(JSON.stringify(['email', email]));
    const codeHash = await keyedDigest(JSON.stringify(['code', email, code]));
    const accepted = await db.prepare(`
      UPDATE account_email_challenges SET
        attempts = attempts + 1,
        consumed = CASE WHEN code_hash = ? THEN 1 ELSE 0 END
      WHERE email_hash = ? AND expires_at > ? AND attempts < ? AND consumed = 0
        AND EXISTS (
          SELECT 1 FROM account_sign_in_emails AS e JOIN accounts AS a ON a.id = e.account_id
          WHERE e.email = ? AND a.id = account_email_challenges.account_id
            AND a.session_generation = account_email_challenges.account_generation AND a.status = 'active'
        )
      RETURNING account_id, account_generation, consumed
    `).bind(codeHash, emailHash, now(), MAX_CODE_ATTEMPTS, email).first();
    return accepted?.consumed === 1 ? accepted : null;
  }

  async function startGoogle(request, requestUrl) {
    assertHttps(requestUrl);
    if (!await limit(request, 'google', 20, 10 * 60_000)) return studioReturn(false);
    const state = randomToken();
    const useMandala = env.STUDIO_MANDALA_SIGN_IN_ENABLED === 'true';
    const nonce = useMandala ? MANDALA_FLOW : randomToken();
    const verifier = randomToken();
    const current = now();
    await db.batch([
      db.prepare(`
        DELETE FROM account_google_challenges WHERE state_hash IN (
          SELECT state_hash FROM account_google_challenges WHERE expires_at <= ? LIMIT 64
        )
      `).bind(current),
      db.prepare(`
        INSERT INTO account_google_challenges (state_hash, code_verifier, nonce, expires_at)
        VALUES (?, ?, ?, ?)
      `).bind(await sha256(state), verifier, nonce, current + GOOGLE_TTL_MS),
    ]);
    if (useMandala) {
      const authorize = new URL('authorize', MANDALA_PROVIDER);
      authorize.search = new URLSearchParams({ state, code_challenge: await sha256(verifier) });
      return redirect(authorize.href, oauthCookie(state, GOOGLE_TTL_MS / 1000));
    }
    const authorize = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authorize.search = new URLSearchParams({
      client_id: env.STUDIO_GOOGLE_CLIENT_ID,
      redirect_uri: new URL(GOOGLE_CALLBACK, requestUrl).href,
      response_type: 'code',
      scope: 'openid email',
      state,
      nonce,
      code_challenge_method: 'S256',
      code_challenge: await sha256(verifier),
      prompt: 'select_account',
    });
    return redirect(authorize.href, oauthCookie(state, GOOGLE_TTL_MS / 1000));
  }

  async function finishMandalaLogin(code, verifier) {
    const exchanged = await fetchImpl(new URL('exchange', MANDALA_PROVIDER).href, {
      method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(8_000),
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code, code_verifier: verifier }),
    });
    if (!exchanged.ok) return null;
    const identity = await exchanged.json();
    const email = normalizeSignInEmail(identity.email);
    const subject = identity.subject;
    const googleSubject = identity.google_subject;
    const validSubject = value => typeof value === 'string' && value.trim().length > 0 && value.length <= 255;
    if (identity.email_verified !== true || !email || !validSubject(subject)
      || (googleSubject !== null && !validSubject(googleSubject))) return null;
    // Reuse the approved Studio account and bind its stable identity on first
    // sign-in. The provider cannot assign a role or create an account.
    const [linked, login] = await db.batch([
      db.prepare(`
        UPDATE account_sign_in_emails SET mandala_subject = ?, google_subject = COALESCE(google_subject, ?)
        WHERE email = ? AND (mandala_subject IS NULL OR mandala_subject = ?)
          AND (google_subject IS NULL OR google_subject = ?)
          AND EXISTS (SELECT 1 FROM accounts WHERE id = account_id AND status = 'active')
        RETURNING account_id
      `).bind(subject, googleSubject, email, subject, googleSubject),
      db.prepare(`
        SELECT a.id AS account_id, a.session_generation AS account_generation
        FROM account_sign_in_emails AS e JOIN accounts AS a ON a.id = e.account_id
        WHERE e.email = ? AND e.mandala_subject = ? AND a.status = 'active'
      `).bind(email, subject),
    ]);
    return linked.results.length && login.results.length ? { ...login.results[0], email } : null;
  }

  async function finishGoogle(request, requestUrl, viaMandala) {
    assertHttps(requestUrl);
    const state = requestUrl.searchParams.get('state');
    const code = requestUrl.searchParams.get('code');
    if (!state || !/^[A-Za-z0-9_-]{43}$/.test(state) || !hasOAuthCookie(request, state)
      || !code || code.length > 4096 || requestUrl.searchParams.has('error')) return null;
    const flow = await db.prepare(`
      DELETE FROM account_google_challenges WHERE state_hash = ? AND expires_at > ?
        AND (nonce = ?) = ?
      RETURNING code_verifier, nonce
    `).bind(await sha256(state), now(), MANDALA_FLOW, viaMandala ? 1 : 0).first();
    if (!flow) return null;
    if (viaMandala) return finishMandalaLogin(code, flow.code_verifier);
    const { email, subject } = await verifyGoogleIdentity({
      requestUrl, env, flow, code, fetchImpl, googleJwks: options.googleJwks, current: now(),
    });
    const [link, login] = await db.batch([
      db.prepare(`
        UPDATE account_sign_in_emails SET google_subject = ?
        WHERE email = ? AND (google_subject IS NULL OR google_subject = ?)
          AND EXISTS (SELECT 1 FROM accounts WHERE id = account_id AND status = 'active')
          AND NOT EXISTS (SELECT 1 FROM account_sign_in_emails WHERE google_subject = ? AND email <> ?)
        RETURNING account_id
      `).bind(subject, email, subject, subject, email),
      db.prepare(`
        SELECT a.id AS account_id, a.session_generation AS account_generation FROM account_sign_in_emails AS e
          JOIN accounts AS a ON a.id = e.account_id
        WHERE e.email = ? AND e.google_subject = ? AND a.status = 'active'
      `).bind(email, subject),
    ]);
    return link.results.length && login.results.length ? { ...login.results[0], email } : null;
  }

  return { requestEmailCode, consumeEmailCode, startGoogle, finishGoogle };
}

const PASSWORDLESS_PATHS = new Set(['methods', 'google/start', 'google/callback', 'mandala/callback', 'email/start', 'email/verify']);

export async function handleStudioPasswordless({ context, options, segments, readJson, jsonResponse, errorResponse, openSession }) {
  const path = segments.join('/');
  if (!PASSWORDLESS_PATHS.has(path)) return null;
  const { request, env } = context;
  const requestUrl = new URL(request.url);
  const requiredMethod = path.startsWith('email/') ? 'POST' : 'GET';
  if (request.method !== requiredMethod) {
    return errorResponse(405, 'method_not_allowed', 'The method is not allowed for this route.');
  }
  const methods = await signInMethods(env);
  if (path === 'methods') return jsonResponse(methods);
  const viaMandala = path === 'mandala/callback';
  if (viaMandala || path.startsWith('google/')) {
    if (!methods.google || (viaMandala && env.STUDIO_MANDALA_SIGN_IN_ENABLED !== 'true')) return studioReturn(false);
    try {
      const auth = createPasswordlessAuth(env, options);
      if (path === 'google/start') return await auth.startGoogle(request, requestUrl);
      const result = await auth.finishGoogle(request, requestUrl, viaMandala);
      if (!result) return studioReturn(false);
      const { cookie } = await openSession(result, result.email);
      return studioReturn(true, cookie);
    } catch {
      return studioReturn(false);
    }
  }
  if (request.headers.get('origin') !== requestUrl.origin) {
    return errorResponse(403, 'invalid_origin', 'The request origin is not allowed.');
  }
  if (!methods.email) return errorResponse(503, 'sign_in_unavailable', 'Email sign-in is unavailable.');
  const body = await readJson(request);
  const email = normalizeSignInEmail(body.email);
  if (!email) return errorResponse(400, 'invalid_email', 'Enter a valid email address.');
  const auth = createPasswordlessAuth(env, options);
  if (path === 'email/start') {
    await auth.requestEmailCode(request, email, context.waitUntil?.bind(context));
    return jsonResponse({ accepted: true }, 202);
  }
  if (typeof body.code !== 'string' || !/^\d{6}$/.test(body.code)) {
    return errorResponse(400, 'invalid_code', 'Enter the six-digit code.');
  }
  const result = await auth.consumeEmailCode(request, email, body.code);
  if (!result) return errorResponse(401, 'invalid_code', 'This code is invalid or has expired.');
  const { cookie, session } = await openSession(result, email);
  return jsonResponse({ session }, 200, { 'set-cookie': cookie });
}
