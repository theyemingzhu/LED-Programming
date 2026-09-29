// Appearance overrides for one installed look, never its independent output multiplier.
export function normalizeSavedPatternControls(value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('Invalid saved pattern controls.');
  const ranges = { brightness: [0.02, 1], speed: [0.05, 3], hueShift: [-128, 128] };
  const result = {};
  for (const [key, number] of Object.entries(value)) {
    const range = ranges[key];
    if (!range || typeof number !== 'number' || !Number.isFinite(number) || number < range[0] || number > range[1]
      || (key === 'hueShift' && !Number.isInteger(number))) throw new TypeError('Invalid saved pattern controls.');
    result[key] = number;
  }
  return result;
}

export function savedPatternMetadata(pattern = {}) {
  if (pattern.savedControls === undefined && pattern.savedControlsRevision === undefined) return {};
  if (typeof pattern.savedControlsRevision !== 'string' || !pattern.savedControlsRevision || pattern.savedControlsRevision.length > 128) {
    throw new TypeError('Invalid saved pattern revision.');
  }
  return { savedControls: normalizeSavedPatternControls(pattern.savedControls), savedControlsRevision: pattern.savedControlsRevision };
}
