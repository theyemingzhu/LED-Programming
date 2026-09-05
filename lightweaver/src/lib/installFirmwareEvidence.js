// The install screen already resolved what this USB-found card is running.
// The footer lives in the shell, so it cannot read that useMemo. This is the
// one-value bus between them: report while Find Card has a card, clear on leave.

let evidence = null;
let expiryTimer = null;
const listeners = new Set();
const VERIFICATION_KEY = 'lw_install_firmware_verification_v1';
const VERIFICATION_WINDOW_MS = 60_000;

function browserStorage() {
  try { return globalThis.window?.sessionStorage || null; }
  catch { return null; }
}

function cardId(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return /^lw-[a-z0-9][a-z0-9._:-]{0,60}$/.test(normalized) ? normalized : '';
}

function buildId(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return /^[a-f0-9]{40}$/.test(normalized) ? normalized : '';
}

function safeVerification(value, now = Date.now()) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const safe = {
    verification: Number(value.expiresAt) <= Number(now) ? 'reconnect-needed' : 'restarting',
    cardId: cardId(value.cardId),
    expectedBuildNumber: Number.isSafeInteger(value.expectedBuildNumber) && value.expectedBuildNumber > 0
      ? value.expectedBuildNumber
      : null,
    expectedBuildId: buildId(value.expectedBuildId),
    previousBuildId: buildId(value.previousBuildId),
    previousBootId: String(value.previousBootId || '').trim().slice(0, 96),
    expiresAt: Number(value.expiresAt),
  };
  if (!safe.cardId || !safe.expectedBuildId || !Number.isFinite(safe.expiresAt)) return null;
  return Object.freeze(safe);
}


function clearExpiryTimer() {
  if (expiryTimer !== null) clearTimeout(expiryTimer);
  expiryTimer = null;
}

function scheduleVerificationExpiry(storage, now) {
  clearExpiryTimer();
  if (evidence?.verification !== 'restarting') return;
  const pending = evidence;
  expiryTimer = setTimeout(() => {
    expiryTimer = null;
    if (evidence !== pending) return;
    evidence = Object.freeze({ ...pending, verification: 'reconnect-needed' });
    try { storage?.setItem?.(VERIFICATION_KEY, JSON.stringify(evidence)); } catch { /* memory remains authoritative */ }
    notify();
  }, Math.max(0, pending.expiresAt - Number(now)));
  expiryTimer?.unref?.();
}

function notify() {
  for (const listener of listeners) listener();
}

export function reportInstallFirmwareEvidence(identity, { storage = browserStorage() } = {}) {
  clearExpiryTimer();
  evidence = identity && typeof identity === 'object' && !Array.isArray(identity) ? identity : null;
  try { storage?.removeItem?.(VERIFICATION_KEY); } catch { /* best effort */ }
  notify();
}

// A completed flash write proves only that bytes were sent. It does not prove
// the restarted card is running them. Replace the preflash identity with this
// non-firmware marker until the exact card reports the target revision.
export function beginInstallFirmwareVerification(target = {}, {
  storage = browserStorage(),
  now = Date.now(),
} = {}) {
  evidence = safeVerification({
    verification: 'restarting',
    cardId: target.cardId || target.id,
    expectedBuildNumber: target.buildNumber,
    expectedBuildId: target.buildId,
    previousBuildId: target.previousBuildId,
    previousBootId: target.previousBootId,
    expiresAt: Number(now) + VERIFICATION_WINDOW_MS,
  }, now);
  if (!evidence) return null;
  try { storage?.setItem?.(VERIFICATION_KEY, JSON.stringify(evidence)); } catch { /* memory evidence remains useful */ }
  scheduleVerificationExpiry(storage, now);
  notify();
  return evidence;
}

export function isInstallFirmwareVerification(value) {
  return value?.verification === 'restarting' || value?.verification === 'reconnect-needed';
}

export function restoreInstallFirmwareVerification({
  storage = browserStorage(),
  now = Date.now(),
} = {}) {
  let restored = null;
  try { restored = safeVerification(JSON.parse(storage?.getItem?.(VERIFICATION_KEY) || 'null'), now); }
  catch { restored = null; }
  if (!restored) {
    try { storage?.removeItem?.(VERIFICATION_KEY); } catch { /* best effort */ }
    return null;
  }
  evidence = restored;
  scheduleVerificationExpiry(storage, now);
  return evidence;
}

export function settleInstallFirmwareVerification(identity, {
  storage = browserStorage(),
  now = Date.now(),
} = {}) {
  const pending = isInstallFirmwareVerification(evidence)
    ? evidence
    : restoreInstallFirmwareVerification({ storage, now });
  if (!pending || cardId(identity?.id || identity?.cardId) !== pending.cardId) return false;
  const observedBuildId = buildId(identity?.buildId);
  const observedBootId = String(identity?.bootId || '').trim().slice(0, 96);
  const targetAnswered = observedBuildId === pending.expectedBuildId;
  const newBootAnswered = Boolean(observedBootId && pending.previousBootId && observedBootId !== pending.previousBootId);
  if (!targetAnswered && !newBootAnswered) return false;
  reportInstallFirmwareEvidence(identity, { storage });
  return true;
}

export function getInstallFirmwareEvidence() {
  return evidence || restoreInstallFirmwareVerification() || null;
}

export function subscribeInstallFirmwareEvidence(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function clearInstallFirmwareEvidence({
  preserveVerification = false,
  storage = browserStorage(),
} = {}) {
  if (preserveVerification && isInstallFirmwareVerification(evidence)) return;
  clearExpiryTimer();
  try { storage?.removeItem?.(VERIFICATION_KEY); } catch { /* best effort */ }
  if (evidence === null) return;
  evidence = null;
  notify();
}
