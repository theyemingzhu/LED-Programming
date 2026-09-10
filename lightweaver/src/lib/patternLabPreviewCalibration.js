// Studio-owned output profile. It is persisted in browser storage, separately
// from project recipes and card configuration, and is opt-in at creative send
// boundaries only.
export const STUDIO_STRIP_PROFILE_STORAGE_KEY = 'lw_studio_strip_profile_v1';
export const DEFAULT_STUDIO_STRIP_PROFILE = Object.freeze({ red: 1, green: 0.62, blue: 0.65 });
export const NEUTRAL_PATTERN_LAB_CALIBRATION = Object.freeze({ red: 1, green: 1, blue: 1 });

function gain(value, channel) {
  const number = Number(value);
  const factor = Number(channel);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(255, Math.round(number * (Number.isFinite(factor) ? factor : 1))));
}

export function normalizePatternLabPreviewCalibration(value = {}) {
  return {
    red: Math.max(0, Math.min(1, Number.isFinite(Number(value.red)) ? Number(value.red) : 1)),
    green: Math.max(0, Math.min(1, Number.isFinite(Number(value.green)) ? Number(value.green) : 1)),
    blue: Math.max(0, Math.min(1, Number.isFinite(Number(value.blue)) ? Number(value.blue) : 1)),
  };
}

export function readStudioStripProfile(storage = globalThis.localStorage) {
  if (!storage) return { ...DEFAULT_STUDIO_STRIP_PROFILE };
  try {
    const raw = storage.getItem(STUDIO_STRIP_PROFILE_STORAGE_KEY);
    return raw ? normalizePatternLabPreviewCalibration(JSON.parse(raw)) : { ...DEFAULT_STUDIO_STRIP_PROFILE };
  } catch {
    return { ...DEFAULT_STUDIO_STRIP_PROFILE };
  }
}

export function writeStudioStripProfile(value, storage = globalThis.localStorage) {
  const profile = normalizePatternLabPreviewCalibration(value);
  try { storage?.setItem(STUDIO_STRIP_PROFILE_STORAGE_KEY, JSON.stringify(profile)); } catch { /* private mode */ }
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('lw-studio-strip-profile', { detail: profile }));
  return profile;
}

export function applyPatternLabPreviewCalibrationToHex(hex, calibration = NEUTRAL_PATTERN_LAB_CALIBRATION) {
  if (hex && typeof hex === 'object') {
    const normalized = normalizePatternLabPreviewCalibration(calibration);
    return {
      ...hex,
      r: gain(hex.r, normalized.red),
      g: gain(hex.g, normalized.green),
      b: gain(hex.b, normalized.blue),
    };
  }
  const clean = String(hex || '').replace(/^#/, '');
  if (!/^[\da-f]{6}$/i.test(clean)) return hex;
  const normalized = normalizePatternLabPreviewCalibration(calibration);
  const red = gain(Number.parseInt(clean.slice(0, 2), 16), normalized.red);
  const green = gain(Number.parseInt(clean.slice(2, 4), 16), normalized.green);
  const blue = gain(Number.parseInt(clean.slice(4, 6), 16), normalized.blue);
  return [red, green, blue].map(value => value.toString(16).padStart(2, '0').toUpperCase()).join('');
}
