const LEGACY_SIGN_IN = Object.freeze({ enabled: false, google: false, email: false });
const GOOGLE_RETURN_KEY = 'lw_studio_google_return_v1';
let methodsInFlight = null;

async function accountRequest(path, body) {
  const response = await fetch(`/api/account/${path}`, {
    credentials: 'same-origin',
    cache: 'no-store',
    redirect: 'error',
    signal: AbortSignal.timeout(12_000),
    headers: { accept: 'application/json', ...(body ? { 'content-type': 'application/json' } : {}) },
    ...(body ? { method: 'POST', body: JSON.stringify(body) } : {}),
  });
  return response;
}

export function readStudioPasswordlessMethods() {
  // Session loading and Projects can ask at the same time.
  methodsInFlight ||= accountRequest('methods').then(async response => {
    const contentType = response.headers.get('content-type') || '';
    if (response.status === 404 || (response.ok && contentType.startsWith('text/html') && import.meta.env?.DEV)) {
      return LEGACY_SIGN_IN;
    }
    if (!response.ok || !contentType.startsWith('application/json')) throw new Error('Sign-in options unavailable.');
    const methods = await response.json();
    if (typeof methods?.enabled !== 'boolean' || typeof methods.google !== 'boolean' || typeof methods.email !== 'boolean') {
      throw new Error('Invalid sign-in options.');
    }
    return methods.enabled ? { enabled: true, google: methods.google, email: methods.email } : LEGACY_SIGN_IN;
  }).finally(() => { methodsInFlight = null; });
  return methodsInFlight;
}

export async function requestStudioEmailCode(email) {
  const response = await accountRequest('email/start', { email });
  if (response.status === 429) return { ok: false, reason: 'rate-limited' };
  if (!response.ok || (await response.json()).accepted !== true) return { ok: false };
  return { ok: true };
}

export async function verifyStudioEmailCode(email, code) {
  const response = await accountRequest('email/verify', { email, code });
  if ([400, 401, 403, 410].includes(response.status)) return { ok: false, reason: 'invalid-code' };
  if (response.status === 429) return { ok: false, reason: 'rate-limited' };
  if (!response.ok || !(await response.json()).session?.username) return { ok: false };
  return { ok: true };
}

export function beginStudioGoogleSignIn(flushProjectAutosave, saveProjectId) {
  if (!flushProjectAutosave()) return false;
  try {
    window.sessionStorage.setItem(GOOGLE_RETURN_KEY, JSON.stringify({
      hash: window.location.hash,
      saveProjectId,
    }));
  } catch {
    // The draft is already safe in the browser. The screen and save choice may reset.
  }
  window.location.assign('/api/account/google/start');
  return true;
}

export function studioGoogleSignInOutcome() {
  const result = new URL(window.location.href).searchParams.get('lwSignIn');
  return result === 'success' || result === 'error' ? result : null;
}

function googleReturnState() {
  try {
    const value = window.sessionStorage.getItem(GOOGLE_RETURN_KEY);
    if (value?.startsWith('#')) return { hash: value };
    return JSON.parse(value) || {};
  } catch {
    return {};
  }
}

export function studioGoogleSignInSaveProject() {
  return googleReturnState().saveProjectId || '';
}

export function clearStudioGoogleSignInReturn() {
  const { hash = '' } = googleReturnState();
  try {
    window.sessionStorage.removeItem(GOOGLE_RETURN_KEY);
  } catch {
    // Route restoration is optional when session storage is unavailable.
  }
  const url = new URL(window.location.href);
  url.searchParams.delete('lwSignIn');
  window.history.replaceState(window.history.state, '', url);
  return typeof hash === 'string' && hash.startsWith('#screen=') ? hash : '#screen=layout';
}
