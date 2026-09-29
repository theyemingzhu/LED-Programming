import { normalizeSavedPatternControls } from '../lib/cardSavedControls.js';

export function normalizeClientPattern(value, cardId, patternId) {
  if (value?.ok !== true || value.cardId !== cardId || value.patternId !== patternId
    || typeof value.revision !== 'string' || !value.revision || value.revision.length > 128) {
    throw new Error('The lights did not confirm this exact saved pattern.');
  }
  return { ok: true, cardId, patternId, revision: value.revision, overrides: normalizeSavedPatternControls(value.overrides) };
}

export function verifySavedPattern(receipt, readback, changes) {
  if (receipt.cardId !== readback.cardId || receipt.patternId !== readback.patternId || receipt.revision !== readback.revision
    || Object.entries(changes).some(([key, value]) => typeof receipt.overrides[key] !== 'number'
      || typeof readback.overrides[key] !== 'number'
      || Math.abs(receipt.overrides[key] - value) > 0.00001 || Math.abs(readback.overrides[key] - value) > 0.00001)) {
    throw new Error('The saved pattern could not be verified. Your changes are still unsaved here.');
  }
  return true;
}
