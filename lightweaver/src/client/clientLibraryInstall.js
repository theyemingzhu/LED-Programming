const ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const fail = message => { throw new Error(message); };

// Preserve section topology from the card. Mirrors are not independently
// targetable: their source section owns the effect and they keep following it.
export function normalizeClientSections(value) {
  if (!Array.isArray(value?.zones) || value.zones.length > 12) fail('The card returned invalid sections.');
  const ids = new Set();
  const sections = value.zones.map(zone => {
    if (!ID.test(zone?.id) || ids.has(zone.id) || typeof zone.label !== 'string' || zone.label.length > 128 ||
        !Array.isArray(zone.ranges) || !zone.ranges.length || zone.ranges.length > 32) fail('The card returned invalid sections.');
    ids.add(zone.id);
    const ranges = zone.ranges.map(range => {
      if (!Number.isInteger(range?.start) || range.start < 0 || !Number.isInteger(range.count) || range.count < 1 ||
          range.start + range.count > 65535) fail('The card returned an invalid section range.');
      return { start: range.start, count: range.count };
    });
    if (zone.mirrorOf != null && zone.mirrorOf !== '' && !ID.test(zone.mirrorOf)) fail('The card returned an invalid mirrored section.');
    if (zone.mirrorFlip != null && typeof zone.mirrorFlip !== 'boolean') fail('The card returned an invalid mirrored section.');
    if (zone.continuous != null && typeof zone.continuous !== 'boolean') fail('The card returned an invalid section.');
    return { id: zone.id, label: zone.label || zone.id, mirrorOf: zone.mirrorOf || '',
      mirrorFlip: zone.mirrorFlip === true, continuous: zone.continuous === true, ranges };
  });
  const byId = new Map(sections.map(section => [section.id, section]));
  for (const section of sections) {
    const visited = new Set([section.id]);
    let source = section;
    while (source.mirrorOf) {
      if (!byId.has(source.mirrorOf) || visited.has(source.mirrorOf)) fail('The card returned invalid mirror relationships.');
      visited.add(source.mirrorOf); source = byId.get(source.mirrorOf);
    }
  }
  return sections;
}

export function clientLibraryTargets(sections) {
  // Revalidate public helper inputs rather than trusting a UI-owned object.
  const checked = normalizeClientSections({ zones: sections.map(section => ({ ...section, mirrorOf: section.mirrorOf || undefined })) });
  const byId = new Map(checked.map(section => [section.id, section]));
  const rootId = section => { while (section.mirrorOf) section = byId.get(section.mirrorOf); return section.id; };
  const roots = checked.filter(section => !section.mirrorOf);
  return [
    { id: '*', label: 'Whole piece', sectionIds: roots.map(section => section.id), mirroredIds: checked.filter(section => section.mirrorOf).map(section => section.id) },
    ...roots.map(section => ({ id: section.id, label: section.label, sectionIds: [section.id],
      mirroredIds: checked.filter(item => item.mirrorOf && rootId(item) === section.id).map(item => item.id) })),
  ];
}

// A proposal only: transport must additionally require the card's advertised
// bounded install capability. This never serializes wiring or a whole config.
export function buildClientLibraryInstallRequest({ status, currentLookId, libraryRevision, layoutRevision, presetId, label, targetIds, tuning = {}, sections, assignments }) {
  if (status?.capabilities?.clientLibrary?.version !== 1 || status.playbackReady !== true ||
      typeof status.cardId !== 'string' || !status.cardId || typeof status.bootId !== 'string' || !status.bootId ||
      typeof libraryRevision !== 'string' || !libraryRevision || typeof layoutRevision !== 'string' || !layoutRevision || !ID.test(currentLookId)) fail('The lights need library support before patterns can be added.');
  if (!Array.isArray(status.capabilities.clientLibrary.supportedPresetIds) ||
      !status.capabilities.clientLibrary.supportedPresetIds.includes(presetId)) fail('This pattern cannot be installed on these lights.');
  if (!ID.test(presetId) || typeof label !== 'string' || !label.trim() || label.trim().length > 64) fail('Choose a pattern and a name up to 64 characters.');
  const allowed = new Set(clientLibraryTargets(sections).slice(1).map(target => target.id));
  if (!Array.isArray(targetIds) || !targetIds.length || targetIds.length > 12 || new Set(targetIds).size !== targetIds.length ||
      targetIds.some(id => !allowed.has(id))) fail('Choose actual source sections on these lights.');
  if (!tuning || typeof tuning !== 'object' || Array.isArray(tuning)) fail('Choose valid pattern controls.');
  const controls = {};
  for (const [key, value] of Object.entries(tuning)) {
    const valid = Number.isFinite(value) && (key === 'brightness' ? value >= 0.02 && value <= 1 :
      key === 'speed' ? value >= 0.05 && value <= 3 : key === 'hueShift' && Number.isInteger(value) && value >= -128 && value <= 128);
    if (!valid) fail('Only brightness, speed and hue can be changed here.');
    controls[key] = value;
  }
  let placements;
  if (assignments !== undefined) {
    if (!Array.isArray(assignments) || assignments.length !== targetIds.length ||
        new Set(assignments.map(item => item?.targetId)).size !== assignments.length) fail('Place one pattern on each chosen section.');
    placements = assignments.map(item => {
      if (!item || Object.keys(item).sort().join(',') !== 'presetId,targetId,tuning' || !targetIds.includes(item.targetId)) fail('Choose actual source sections on these lights.');
      const checked = buildClientLibraryInstallRequest({ status, currentLookId, libraryRevision, layoutRevision,
        presetId: item.presetId, label, targetIds: [item.targetId], tuning: item.tuning, sections });
      return { targetId: item.targetId, presetId: item.presetId, tuning: checked.tuning };
    });
  }
  return { expectedCardId: status.cardId, expectedBootId: status.bootId, expectedRevision: libraryRevision,
    expectedLayoutRevision: layoutRevision, expectedCurrentLookId: currentLookId, presetId, label: label.trim(), targetIds: [...targetIds], tuning: controls, ...(placements ? { assignments: placements } : {}) };
}

export function normalizeClientLibrary(value, identity) {
  if (value?.ok !== true || value.cardId !== identity.cardId || value.bootId !== identity.bootId ||
      typeof value.revision !== 'string' || !value.revision || typeof value.layoutRevision !== 'string' || !value.layoutRevision ||
      !ID.test(value.currentLookId) || !Array.isArray(value.supportedPresetIds) || value.supportedPresetIds.length > 64 ||
      value.supportedPresetIds.some(id => !ID.test(id)) || !Number.isInteger(value.remaining) || value.remaining < 0 || value.remaining > 32 ||
      typeof value.canInstall !== 'boolean') fail('The card returned an invalid library.');
  const sections = normalizeClientSections({ zones: value.sections });
  return { ...value, sections, layout: { ...(value.layout || {}), installationFingerprint: value.layoutRevision,
    revision: value.layoutRevision, sections, ready: true } };
}

export function verifyClientLibraryReadback(receipt, library, patterns, identity, draft) {
  const saved = normalizeClientLibrary(receipt, identity);
  const fresh = normalizeClientLibrary(library, identity);
  if (!ID.test(saved.installedPatternId) || saved.layoutRevision !== draft.layoutRevision ||
      saved.layoutRevision !== fresh.layoutRevision || saved.revision !== fresh.revision) fail('The saved pattern changed before verification.');
  const installed = patterns?.patterns?.find(pattern => pattern.id === saved.installedPatternId);
  if (!installed || installed.label !== draft.label.trim() || !Array.isArray(installed.zones) || installed.zones.length !== fresh.sections.length) fail('The card has not confirmed the saved pattern.');
  for (const section of fresh.sections) {
    const zone = installed.zones.find(zone => zone.id === section.id);
    if (!zone || (zone.mirrorOf || '') !== section.mirrorOf || Boolean(zone.mirrorFlip) !== section.mirrorFlip || Boolean(zone.continuous) !== section.continuous) fail('The saved pattern did not preserve the artwork map.');
    if (draft.targetIds.includes(section.id)) {
      const assignment = draft.assignments?.find(item => item.targetId === section.id);
      if (draft.assignments && !assignment) fail('A saved placement is missing.');
      if (zone.patternId !== (assignment?.presetId || draft.presetId)) fail('The saved pattern does not match your selection.');
      for (const [key, value] of Object.entries(assignment?.tuning || draft.tuning || {})) if (typeof zone[key] !== 'number' || Math.abs(zone[key] - value) > 0.00001) fail('The saved pattern controls did not match.');
    }
  }
  return { verified: true, cardId: identity.cardId, patternId: saved.installedPatternId, layoutRevision: fresh.layoutRevision, library: fresh };
}
