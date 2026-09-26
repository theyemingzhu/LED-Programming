// A read-only view of the existing section targets and compiled physical route.
// `id` remains the Studio patch identity; GPIO and output IDs are never used as
// keys for a look edit, even when several sections share the same output.
function sameLook(a, b) {
  if (Object.is(a, b)) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  const keys = Object.keys(a).sort();
  const otherKeys = Object.keys(b).sort();
  return keys.length === otherKeys.length && keys.every((key, index) =>
    key === otherKeys[index] && sameLook(a[key], b[key]));
}

export function deriveSectionPresentationRows({ targets = [], compiledWiring = null, patternNameFor = id => id } = {}) {
  const sections = targets.filter(target => target.kind === 'section');
  const allShareLook = sections.length > 0 && sections.every(target =>
    sameLook(target.look || {}, sections[0].look || {}));
  const outputPin = new Map((compiledWiring?.outputs || []).map(output => [output.id, output.pin]));

  return targets.map(target => {
    const outputIds = [];
    const pins = [];
    for (const range of target.kind === 'section' ? target.ranges || [] : []) {
      const start = Math.max(0, Number(range.start) || 0);
      const count = Math.max(0, Number(range.count) || 0);
      for (let index = start; index < start + count; index += 1) {
        const outputId = compiledWiring?.pixels?.[index]?.outputId;
        if (!outputId) continue;
        if (!outputIds.includes(outputId)) outputIds.push(outputId);
        const pin = outputPin.get(outputId);
        if (pin != null && !pins.includes(pin)) pins.push(pin);
      }
    }
    const mixed = target.kind === 'all' && sections.length > 1 && !allShareLook;
    const shownLook = target.kind === 'all' && allShareLook ? sections[0].look : target.look;
    return {
      id: target.id,
      zoneId: target.zoneId || '',
      patchId: target.patchId || '',
      label: target.label,
      pixelCount: target.pixelCount || 0,
      outputIds,
      pins,
      spans: target.ranges || [],
      routeLabel: pins.length ? pins.map(pin => `GPIO ${pin}`).join(' · ') : '',
      patternId: mixed ? '' : (shownLook?.patternId || ''),
      lookLabel: mixed ? 'Mixed' : patternNameFor(shownLook?.patternId || ''),
    };
  });
}
