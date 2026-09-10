import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyPatternLabPreviewCalibrationToHex,
  NEUTRAL_PATTERN_LAB_CALIBRATION,
  normalizePatternLabPreviewCalibration,
  DEFAULT_STUDIO_STRIP_PROFILE,
  readStudioStripProfile,
  writeStudioStripProfile,
  STUDIO_STRIP_PROFILE_STORAGE_KEY,
} from './patternLabPreviewCalibration.js';

test('Studio profile defaults to the accepted red/green/blue gains', () => {
  assert.deepEqual(readStudioStripProfile({ getItem: () => null }), { red: 1, green: 0.62, blue: 0.65 });
  assert.deepEqual(DEFAULT_STUDIO_STRIP_PROFILE, { red: 1, green: 0.62, blue: 0.65 });
});

test('Studio profile persists normalized gains independently of recipes', () => {
  const values = new Map();
  const storage = {
    getItem: key => values.get(key) || null,
    setItem: (key, value) => values.set(key, value),
  };
  const saved = writeStudioStripProfile({ red: 2, green: 0.62, blue: 0.65 }, storage);
  assert.deepEqual(saved, { red: 1, green: 0.62, blue: 0.65 });
  assert.deepEqual(readStudioStripProfile(storage), saved);
  assert.equal(values.has(STUDIO_STRIP_PROFILE_STORAGE_KEY), true);
});

test('Studio profile reduces green and blue while preserving red', () => {
  assert.equal(applyPatternLabPreviewCalibrationToHex('C8C850', DEFAULT_STUDIO_STRIP_PROFILE), 'C87C34');
  assert.equal(applyPatternLabPreviewCalibrationToHex('FFFFFF', DEFAULT_STUDIO_STRIP_PROFILE), 'FF9EA6');
});

test('the Studio profile makes yellow greener-neutral without changing its recipe color', () => {
  const recipe = { palette: ['#FFFF00'], base: { patternId: 'gradient' } };
  const original = JSON.stringify(recipe);
  assert.equal(applyPatternLabPreviewCalibrationToHex('FFFF00', DEFAULT_STUDIO_STRIP_PROFILE), 'FF9E00');
  assert.equal(JSON.stringify(recipe), original);
});

test('neutral preview calibration leaves pixels and hex values unchanged', () => {
  assert.equal(applyPatternLabPreviewCalibrationToHex('#0C2238'), '0C2238');
  assert.deepEqual(normalizePatternLabPreviewCalibration(NEUTRAL_PATTERN_LAB_CALIBRATION), { red: 1, green: 1, blue: 1 });
});

test('preview calibration clamps gains and output channels safely', () => {
  assert.deepEqual(normalizePatternLabPreviewCalibration({ red: 2, green: -1, blue: 'bad' }), { red: 1, green: 0, blue: 1 });
  assert.equal(applyPatternLabPreviewCalibrationToHex('FFFFFF', { red: 2, green: 0, blue: 0.5 }), 'FF0080');
});
