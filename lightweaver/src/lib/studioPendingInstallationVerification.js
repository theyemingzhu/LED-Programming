import { correlateFirmwareUpdateRecovery } from './cardFirmwareUpdater.js';
import { CONNECTED_CARD_LINK_STATES } from './setupJourney.js';

const STORAGE_PREFIX = 'lw_installation_check_after_update_v1:';
const CARD_ID = /^lw-[A-Za-z0-9][A-Za-z0-9._:-]{0,60}$/;

function browserStorage() {
  try { return globalThis.window?.localStorage ?? null; }
  catch { return null; }
}

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export function readPendingInstallationVerification(cardId, { storage = browserStorage() } = {}) {
  if (!CARD_ID.test(cardId || '')) return null;
  try {
    const record = JSON.parse(storage?.getItem(STORAGE_PREFIX + cardId) || 'null');
    if (record?.cardId !== cardId || !/^[a-f0-9]{40}$/.test(record.buildId)
      || !/^[a-f0-9]{64}$/.test(record.projectHead) || !text(record.observedBootId)
      || typeof record.projectFingerprint !== 'string') return null;
    return { record, retained: true };
  } catch { return null; }
}

// Persist only installation identity. The correlated reboot says which saved
// installation needs checking. It supplies no physical look recall evidence.
export function recordPendingInstallationVerification({ session, readiness, updateStatus }, {
  storage = browserStorage(),
} = {}) {
  if (!session?.expectedProjectHead || !readiness) return null;
  const proof = correlateFirmwareUpdateRecovery(session, updateStatus || {}, readiness);
  if (!proof.ok || !proof.terminal) return null;

  const record = {
    cardId: text(readiness.cardId ?? readiness.id),
    buildId: text(readiness.buildId).toLowerCase(),
    projectHead: text(readiness.projectHead).toLowerCase(),
    projectFingerprint: text(readiness.projectFingerprint).toLowerCase(),
    previousBootId: text(session.previousBootId),
    observedBootId: text(readiness.bootId),
  };
  const existing = readPendingInstallationVerification(record.cardId, { storage });
  if (existing && ['buildId', 'projectHead', 'projectFingerprint', 'previousBootId']
    .every(key => existing.record[key] === record[key])) return existing;

  try {
    if (!storage) return { record, retained: false };
    storage.setItem(STORAGE_PREFIX + record.cardId, JSON.stringify(record));
    return { record, retained: true };
  } catch {
    return { record, retained: false };
  }
}

// On a later boot the pending fact still applies to the same installation.
// Show it only once the link validates that boot and reads the same scope.
export function pendingVerificationForCard(pending, link) {
  if (!pending || !CONNECTED_CARD_LINK_STATES.includes(link?.state)) return null;
  const { record } = pending;
  const readiness = link.readiness;
  if (!readiness?.bootId || readiness.bootId !== link.validatedBootId
    || readiness.cardId !== record.cardId || link.card?.id !== record.cardId
    || (link.expectedCard?.id && link.expectedCard.id !== record.cardId)
    || text(readiness.buildId).toLowerCase() !== record.buildId
    || text(readiness.projectHead).toLowerCase() !== record.projectHead
    || (record.projectFingerprint && text(readiness.projectFingerprint).toLowerCase() !== record.projectFingerprint)) {
    return null;
  }
  return pending;
}
