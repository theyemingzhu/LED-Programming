// Browser-only authoring metadata for one physical strip divided into editable
// sections. Runtime consumers still receive the same flat strips[] they always
// have; this record only lets Layout recover the original path and relationships.

function geometrySignature(strip = {}) {
  return JSON.stringify([
    String(strip.pathData || ''),
    Number(strip.x) || 0,
    Number(strip.y) || 0,
    Boolean(strip.reversed),
    Number(strip.pixelCount) || 0,
  ]);
}

export function createSectionFamily(source, members = []) {
  const memberIds = members.map(member => member?.id).filter(Boolean);
  if (!source?.id || memberIds.length < 2) return null;
  return {
    id: `section-family-${source.id}`,
    parentId: source.id,
    parentName: String(source.name || 'Strip'),
    source: {
      pathData: String(source.pathData || ''),
      svgLength: Number(source.svgLength) || 0,
      x: Number(source.x) || 0,
      y: Number(source.y) || 0,
      reversed: Boolean(source.reversed),
      closed: Boolean(source.closed ?? source.isClosed),
      sourceLayerId: source.sourceLayerId ?? null,
      sourcePathId: source.sourcePathId ?? null,
      calibratedFromArtwork: Boolean(source.calibratedFromArtwork),
    },
    memberIds,
    memberGeometry: Object.fromEntries(members.map(member => [member.id, geometrySignature(member)])),
  };
}

export function normalizeSectionFamilies(value, strips = []) {
  if (!Array.isArray(value)) return [];
  const liveIds = new Set((strips || []).map(strip => strip?.id).filter(Boolean));
  const claimed = new Set();
  const normalized = [];
  for (const family of value) {
    const memberIds = family?.memberIds;
    const unique = Array.isArray(memberIds) ? [...new Set(memberIds)] : [];
    const valid = typeof family?.id === 'string'
      && family.id.length > 0
      && typeof family?.parentId === 'string'
      && unique.length >= 2
      && unique.length === memberIds.length
      && unique.includes(family.parentId)
      && unique.every(id => liveIds.has(id) && !claimed.has(id))
      && typeof family?.source?.pathData === 'string'
      && family.source.pathData.trim().length > 0;
    if (!valid) continue;
    unique.forEach(id => claimed.add(id));
    normalized.push(family);
  }
  return normalized;
}

export function familyGeometryStatus(family, strips = []) {
  if (!family || !Array.isArray(family.memberIds) || family.memberIds.length < 2) {
    return { ok: false, error: 'This connected strip no longer has enough sections. Detach it and keep the current strips.' };
  }
  const byId = new Map(strips.map(strip => [strip.id, strip]));
  for (const memberId of family.memberIds) {
    const member = byId.get(memberId);
    if (!member) return { ok: false, error: 'A connected section is missing. Detach it and keep the remaining strips.' };
    if (family.memberGeometry?.[memberId] !== geometrySignature(member)) {
      return { ok: false, error: `${member.name || 'A section'} changed separately. Detach the sections or undo that geometry edit before moving a boundary.` };
    }
  }
  return { ok: true };
}

// boundaryIndex identifies the boundary after counts[boundaryIndex]. The value
// is the absolute number of LEDs before that boundary, which makes 20/40 →
// boundary 25 read as 25/35 instead of exposing two coupled fields.
export function moveSectionBoundary(counts = [], boundaryIndex, absoluteLed) {
  if (!counts.every(value => Number.isSafeInteger(Number(value)) && Number(value) >= 1)) return null;
  const normalized = counts.map(Number);
  const index = Number(boundaryIndex);
  const boundary = Number(absoluteLed);
  if (normalized.length < 2 || !Number.isSafeInteger(index) || index < 0 || index >= normalized.length - 1 || !Number.isSafeInteger(boundary)) return null;
  const before = normalized.slice(0, index).reduce((sum, value) => sum + value, 0);
  const pairTotal = normalized[index] + normalized[index + 1];
  const left = boundary - before;
  const right = pairTotal - left;
  if (left < 1 || right < 1) return null;
  const next = [...normalized];
  next[index] = left;
  next[index + 1] = right;
  return next;
}

export function resizeSectionFamily({
  family,
  strips = [],
  counts = [],
  paths = [],
  samplePixels = () => [],
  measurePath = () => 0,
} = {}) {
  const status = familyGeometryStatus(family, strips);
  if (!status.ok) return status;
  if (counts.length !== family.memberIds.length || paths.length !== family.memberIds.length) {
    return { ok: false, error: 'The section boundaries could not be mapped onto the original path.' };
  }
  const countById = new Map(family.memberIds.map((id, index) => [id, Math.max(1, Math.trunc(Number(counts[index]) || 0))]));
  const pathById = new Map(family.memberIds.map((id, index) => [id, paths[index]]));
  const nextStrips = strips.map(strip => {
    if (!countById.has(strip.id)) return strip;
    const pixelCount = countById.get(strip.id);
    const pathData = pathById.get(strip.id);
    const next = {
      ...strip,
      pathData,
      pixelCount,
      svgLength: measurePath(pathData),
      x: family.source.x,
      y: family.source.y,
      reversed: family.source.reversed,
    };
    next.pixels = samplePixels(next, pixelCount);
    return next;
  });
  const byId = new Map(nextStrips.map(strip => [strip.id, strip]));
  const nextFamily = {
    ...family,
    memberGeometry: Object.fromEntries(family.memberIds.map(id => [id, geometrySignature(byId.get(id))])),
  };
  return { ok: true, strips: nextStrips, family: nextFamily };
}

export function connectedFamilyForStrip(families = [], stripId) {
  return (families || []).find(family => family?.memberIds?.includes(stripId)) || null;
}

// Update only runs owned by this connected family. Other strips may use
// several partial advanced runs with deliberate seams; a section boundary
// edit must never expand or clear those unrelated routes.
export function reconcileSectionFamilyRuns(draft, {
  family,
  nextStrips = [],
  removedIds = [],
  newMember = null,
} = {}) {
  const removed = new Set(removedIds);
  for (const removedId of removed) {
    const runIds = new Set(draft.runs
      .filter(run => run.type === 'strip' && run.source?.stripId === removedId)
      .map(run => run.id));
    draft.runs = draft.runs.filter(run => !runIds.has(run.id));
    draft.outputs.forEach(output => { output.runIds = output.runIds.filter(id => !runIds.has(id)); });
  }

  if (newMember) {
    const beforeId = family.memberIds[family.memberIds.indexOf(newMember.id) - 1];
    const beforeRun = draft.runs.find(run => run.type === 'strip' && run.source?.stripId === beforeId);
    const run = {
      id: `run-${newMember.id}`,
      type: 'strip',
      source: { stripId: newMember.id, from: 0, to: Math.max(0, newMember.pixelCount - 1) },
      directionPolicy: beforeRun?.directionPolicy || 'flexible',
      physicalDirection: beforeRun?.physicalDirection || 'source-forward',
      seamLed: null,
      verified: false,
    };
    let suffix = 2;
    while (draft.runs.some(item => item.id === run.id)) run.id = `run-${newMember.id}-${suffix++}`;
    draft.runs.push(run);
    const host = draft.outputs.find(output => beforeRun && output.runIds.includes(beforeRun.id));
    if (host && beforeRun) host.runIds.splice(host.runIds.indexOf(beforeRun.id) + 1, 0, run.id);
    else draft.outputs[0]?.runIds.push(run.id);
  }

  const familyIds = new Set(family?.memberIds || []);
  const nextById = new Map(nextStrips.map(strip => [strip.id, strip]));
  draft.runs.forEach(run => {
    if (run.type !== 'strip' || !familyIds.has(run.source?.stripId)) return;
    const strip = nextById.get(run.source.stripId);
    if (!strip) return;
    run.source = { ...run.source, from: 0, to: Math.max(0, strip.pixelCount - 1) };
    run.seamLed = null;
    run.verified = false;
  });
}

export function updateFamilyMemberGeometry(family, strips = []) {
  const byId = new Map(strips.map(strip => [strip.id, strip]));
  return {
    ...family,
    memberGeometry: Object.fromEntries((family.memberIds || [])
      .filter(id => byId.has(id))
      .map(id => [id, geometrySignature(byId.get(id))])),
  };
}
