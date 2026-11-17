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

const tuningBounds = {
  brightnessScale: [0.02, 1],
  speedScale: [0.05, 3],
  hueOffset: [-128, 127],
};

function normalizeTuningValues(values) {
  const entries = Object.entries(tuningBounds).map(([key, [min, max]]) => {
    const value = values?.[key];
    if (!Number.isFinite(value) || value < min || value > max || (key === 'hueOffset' && !Number.isInteger(value))) {
      throw new Error('The lights returned invalid look adjustments.');
    }
    return [key, value];
  });
  return Object.fromEntries(entries);
}

function validRevision(revision) {
  return typeof revision === 'string' && revision.length > 0 && revision.length <= 128;
}

export function normalizeLookTuning(value, patternId) {
  if (!patternId || value?.patternId !== patternId || !Number.isInteger(value.session)
    || value.session < 1 || value.session > 0xFFFFFFFF || !validRevision(value.revision)
    || typeof value.motion !== 'boolean' || !Number.isFinite(value.speedMin) || !Number.isFinite(value.speedMax)
    || value.speedMin < 0.05 || value.speedMin > 1 || value.speedMax < 1 || value.speedMax > 3) {
    throw new Error('The lights did not confirm the active look adjustments.');
  }
  const { session, revision, motion, speedMin, speedMax } = value;
  return { patternId, session, revision, motion, speedMin, speedMax,
    live: normalizeTuningValues(value.live), saved: normalizeTuningValues(value.saved) };
}

export function sameTuningValues(a, b) {
  return Object.keys(tuningBounds).every(key => Math.abs(a[key] - b[key]) < 0.00001);
}

export function normalizeSavedLookTuning(value, cardId, patternId) {
  if (!patternId || value?.ok !== true || value.cardId !== cardId || value.patternId !== patternId
    || !validRevision(value.tuning?.revision)) {
    throw new Error('The lights did not confirm the saved look adjustments.');
  }
  return { revision: value.tuning.revision, values: normalizeTuningValues(value.tuning.values) };
}
