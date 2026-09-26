// Layout-to-expression target adapter.
//
// This module deliberately stores only Layout identities. It does not sample,
// transform, or duplicate artwork geometry: a source reference means “this
// exact LED on this current Layout strip”. Compiled wiring remains the only
// authority for physical output order.

export const SCENE_EXPRESSION_TARGET_VERSION = 1;
export const SCENE_EXPRESSION_FLOW_VERSION = 1;
export const ALL_SCENE_EXPRESSION_AREA_ID = 'all';

const asArray = value => Array.isArray(value) ? value : [];
const areaIdForStrip = stripId => `strip:${stripId}`;
const areaIdForFamily = familyId => `family:${familyId}`;
const areaIdForGroup = groupId => `group:${groupId}`;

function stripLedCount(strip = {}) {
  const count = Number(strip.pixelCount ?? strip.pixels?.length ?? 0);
  return Number.isFinite(count) ? Math.max(0, Math.trunc(count)) : 0;
}

function sourceRefsForStrip(strip) {
  const count = stripLedCount(strip);
  return count ? [{ stripId: strip.id, sourceLeds: Array.from({ length: count }, (_, index) => index) }] : [];
}

function sourceRefsForStripIds(stripIds, stripsById) {
  return stripIds.flatMap(stripId => sourceRefsForStrip(stripsById.get(stripId)));
}

function uniqueStrings(value) {
  return [...new Set(asArray(value).filter(item => typeof item === 'string' && item.length > 0))];
}

function memberStripIds(group = {}) {
  return uniqueStrings(asArray(group.members).map(member => (
    typeof member === 'string' ? member : member?.stripId
  )));
}

function validCompiledPhysicalOrder(compiledWiring, stripsById) {
  if (compiledWiring?.ok !== true || !Array.isArray(compiledWiring.pixels)) return [];
  return compiledWiring.pixels.flatMap((pixel, outputIndex) => {
    if (!pixel?.stripId || !stripsById.has(pixel.stripId) || !Number.isInteger(pixel.sourceLed)) return [];
    const strip = stripsById.get(pixel.stripId);
    if (pixel.sourceLed < 0 || pixel.sourceLed >= stripLedCount(strip)) return [];
    return [{ stripId: pixel.stripId, sourceLed: pixel.sourceLed, outputIndex }];
  });
}

function refsForPhysicalOrder(physicalOrder, sourceKeys) {
  return physicalOrder.filter(ref => sourceKeys.has(`${ref.stripId}:${ref.sourceLed}`));
}

function sourceKeysForArea(area) {
  return new Set(area.sourceRefs.flatMap(ref => ref.sourceLeds.map(sourceLed => `${ref.stripId}:${sourceLed}`)));
}

function logicalPhysicalRefs(physicalRefs) {
  const domainLength = physicalRefs.length;
  return physicalRefs.map((ref, logicalIndex) => ({
    ...ref,
    logicalIndex,
    domainLength,
    progress: domainLength === 1 ? 0.5 : logicalIndex / (domainLength - 1),
  }));
}

function atomicStripIdsForArea(area) {
  return new Set(area.stripIds || []);
}

function sourceRefsFromAreas(areas) {
  const sourceLedsByStrip = new Map();
  for (const area of areas) {
    for (const ref of area.sourceRefs) {
      const leds = sourceLedsByStrip.get(ref.stripId) || new Set();
      ref.sourceLeds.forEach(sourceLed => leds.add(sourceLed));
      sourceLedsByStrip.set(ref.stripId, leds);
    }
  }
  return [...sourceLedsByStrip].map(([stripId, sourceLeds]) => ({
    stripId,
    sourceLeds: [...sourceLeds].sort((a, b) => a - b),
  }));
}

/**
 * Makes a small, serializable catalog from the current Layout state.
 *
 * `compiledWiring` is optional for editor navigation, but required later for a
 * continuous export: its `pixels` are the existing physical-order authority.
 */
export function buildSceneExpressionAreaCatalog({
  strips = [],
  sectionFamilies = [],
  layerGroups = [],
  compiledWiring = null,
} = {}) {
  const liveStrips = asArray(strips).filter(strip => typeof strip?.id === 'string' && strip.id.length > 0);
  const stripsById = new Map(liveStrips.map(strip => [strip.id, strip]));
  const familyByMemberId = new Map();
  const groupIdsByMemberId = new Map();

  const families = asArray(sectionFamilies).flatMap(family => {
    if (typeof family?.id !== 'string' || !family.id) return [];
    const memberIds = uniqueStrings(family.memberIds);
    if (memberIds.length < 2) return [];
    const unresolvedMemberIds = memberIds.filter(id => !stripsById.has(id));
    const liveMemberIds = memberIds.filter(id => stripsById.has(id));
    const id = areaIdForFamily(family.id);
    liveMemberIds.forEach(memberId => familyByMemberId.set(memberId, id));
    return [{
      id,
      kind: 'family',
      name: String(family.parentName || family.name || 'Connected strip'),
      parentIds: [],
      childIds: memberIds.map(areaIdForStrip),
      stripIds: memberIds,
      sourceRefs: sourceRefsForStripIds(liveMemberIds, stripsById),
      unresolvedMemberIds,
    }];
  });

  const groups = asArray(layerGroups).flatMap(group => {
    const groupId = String(group?.groupId || group?.id || '');
    if (!groupId) return [];
    const memberIds = memberStripIds(group);
    if (!memberIds.length) return [];
    const unresolvedMemberIds = memberIds.filter(id => !stripsById.has(id));
    const liveMemberIds = memberIds.filter(id => stripsById.has(id));
    const id = areaIdForGroup(groupId);
    liveMemberIds.forEach(memberId => {
      const parentIds = groupIdsByMemberId.get(memberId) || [];
      parentIds.push(id);
      groupIdsByMemberId.set(memberId, parentIds);
    });
    return [{
      id,
      kind: 'group',
      name: String(group.name || group.label || groupId),
      parentIds: [],
      childIds: memberIds.map(areaIdForStrip),
      stripIds: memberIds,
      sourceRefs: sourceRefsForStripIds(liveMemberIds, stripsById),
      unresolvedMemberIds,
    }];
  });

  const stripAreas = liveStrips.map(strip => {
    const id = areaIdForStrip(strip.id);
    return {
      id,
      kind: 'strip',
      name: String(strip.name || strip.id),
      parentIds: [
        ...(familyByMemberId.has(strip.id) ? [familyByMemberId.get(strip.id)] : []),
        ...(groupIdsByMemberId.get(strip.id) || []),
      ],
      childIds: [],
      stripIds: [strip.id],
      sourceRefs: sourceRefsForStrip(strip),
      unresolvedMemberIds: [],
    };
  });

  const physicalOrder = validCompiledPhysicalOrder(compiledWiring, stripsById);
  const allArea = {
    id: ALL_SCENE_EXPRESSION_AREA_ID,
    kind: 'all',
    name: 'Whole artwork',
    parentIds: [],
    childIds: stripAreas.map(area => area.id),
    stripIds: liveStrips.map(strip => strip.id),
    sourceRefs: sourceRefsForStripIds(liveStrips.map(strip => strip.id), stripsById),
    unresolvedMemberIds: [],
  };

  return {
    version: SCENE_EXPRESSION_TARGET_VERSION,
    areas: [allArea, ...stripAreas, ...families, ...groups],
    physicalOrder,
    physicalOrderAvailable: compiledWiring?.ok === true && Array.isArray(compiledWiring?.pixels),
  };
}

/**
 * Resolves persisted area IDs without any implicit fallback. `continuous`
 * returns one physical-order domain. `repeat` returns one independent domain
 * per chosen area. A parent and one of its children is an error, never a
 * duplicate pixel selection.
 */
export function resolveSceneExpressionSelection(catalog, { areaIds = [], domain = 'continuous', flow } = {}) {
  const areasById = new Map(asArray(catalog?.areas).map(area => [area?.id, area]));
  const requestedIds = uniqueStrings(areaIds);
  const unresolved = [];
  const selected = [];
  for (const id of requestedIds) {
    const area = areasById.get(id);
    if (!area || area.unresolvedMemberIds?.length) unresolved.push(id);
    else selected.push(area);
  }
  const errors = [];
  if (!requestedIds.length) errors.push({ code: 'empty-selection', message: 'Choose at least one area.' });
  if (domain !== 'continuous' && domain !== 'repeat') errors.push({ code: 'invalid-domain', message: 'Choose a continuous or independently repeated domain.' });
  if (unresolved.length) errors.push({ code: 'unresolved-areas', message: 'Some saved areas are no longer present in Layout.', areaIds: unresolved });

  if (flow !== undefined) {
    if (domain !== 'continuous' || !flow || typeof flow !== 'object' || Array.isArray(flow)
      || flow.version !== SCENE_EXPRESSION_FLOW_VERSION
      || !flow.directions || typeof flow.directions !== 'object' || Array.isArray(flow.directions)) {
      errors.push({ code: 'flow-version-unsupported', message: 'This saved Flow route needs a supported continuous Flow version.' });
    } else {
      for (const [areaId, value] of Object.entries(flow.directions)) {
        if (!requestedIds.includes(areaId)) errors.push({ code: 'flow-direction-stale', message: 'A saved Flow direction points to an area outside this route.', areaIds: [areaId] });
        if (value !== 'forward' && value !== 'reverse') errors.push({ code: 'flow-direction-invalid', message: 'A saved Flow direction is unsupported.', areaIds: [areaId] });
      }
    }
  }

  for (let left = 0; left < selected.length; left += 1) {
    const leftStrips = atomicStripIdsForArea(selected[left]);
    for (let right = left + 1; right < selected.length; right += 1) {
      const overlapping = [...leftStrips].filter(stripId => atomicStripIdsForArea(selected[right]).has(stripId));
      if (overlapping.length) errors.push({
        code: 'overlapping-areas',
        message: 'An area and one of its members cannot be selected together.',
        areaIds: [selected[left].id, selected[right].id],
        stripIds: overlapping,
      });
    }
  }

  if (domain === 'continuous' && selected.length && !catalog?.physicalOrderAvailable) {
    errors.push({ code: 'physical-order-unavailable', message: 'Current compiled wiring is required for a continuous expression.' });
  }
  const sourceRefs = sourceRefsFromAreas(selected);
  const sourceKeys = new Set(sourceRefs.flatMap(ref => ref.sourceLeds.map(sourceLed => `${ref.stripId}:${sourceLed}`)));
  if (selected.length && sourceKeys.size === 0) {
    errors.push({ code: 'empty-source-selection', message: 'The selected areas have no LEDs in the current Layout.' });
  }
  const physicalRefs = domain === 'continuous'
    ? refsForPhysicalOrder(asArray(catalog?.physicalOrder), sourceKeys)
    : [];
  if (domain === 'continuous' && sourceKeys.size && catalog?.physicalOrderAvailable) {
    const physicalCountBySource = new Map();
    for (const ref of physicalRefs) {
      const key = `${ref.stripId}:${ref.sourceLed}`;
      physicalCountBySource.set(key, (physicalCountBySource.get(key) || 0) + 1);
    }
    const missingSourceKeys = [...sourceKeys].filter(key => !physicalCountBySource.has(key));
    const duplicateSourceKeys = [...physicalCountBySource]
      .filter(([, count]) => count > 1)
      .map(([key]) => key);
    if (physicalRefs.length === 0) {
      errors.push({ code: 'physical-coverage-empty', message: 'Compiled wiring has no physical LEDs for the selected areas.' });
    }
    if (missingSourceKeys.length) {
      errors.push({
        code: 'physical-coverage-incomplete',
        message: 'Compiled wiring does not cover every LED in the selected areas.',
        sourceKeys: missingSourceKeys,
      });
    }
    if (duplicateSourceKeys.length) {
      errors.push({
        code: 'physical-coverage-duplicate',
        message: 'Compiled wiring addresses a selected LED more than once.',
        sourceKeys: duplicateSourceKeys,
      });
    }
  }
  if (errors.length) return {
    ok: false,
    domain,
    areaIds: requestedIds,
    unresolved,
    errors,
    sourceRefs: [],
    physicalRefs: [],
    instances: [],
  };

  if (domain === 'repeat') return {
    ok: true,
    domain,
    areaIds: requestedIds,
    unresolved: [],
    errors: [],
    sourceRefs: [],
    physicalRefs: [],
    instances: selected.map(area => ({
      areaId: area.id,
      sourceRefs: area.sourceRefs.map(ref => ({ stripId: ref.stripId, sourceLeds: [...ref.sourceLeds] })),
    })),
  };

  const orderedRefs = flow?.version === SCENE_EXPRESSION_FLOW_VERSION
    ? selected.flatMap(area => {
      const keys = sourceKeysForArea(area);
      const refs = physicalRefs.filter(ref => keys.has(`${ref.stripId}:${ref.sourceLed}`));
      if (flow.directions[area.id] === 'reverse') refs.reverse();
      return refs.map(ref => ({ ...ref, areaId: area.id }));
    })
    : physicalRefs;

  return {
    ok: true,
    domain,
    areaIds: requestedIds,
    unresolved: [],
    errors: [],
    sourceRefs,
    physicalRefs: logicalPhysicalRefs(orderedRefs),
    instances: [],
  };
}
