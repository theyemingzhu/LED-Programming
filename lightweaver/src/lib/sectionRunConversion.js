import { normalizePatchBoard } from './patchBoard.js';
import { createSectionFamily } from './connectedSections.js';
import { nextSplitNames, planSectionsAtRunBoundaries } from './stripSplit.js';
import { compileWiring } from './wiringCompiler.js';

const clone = value => JSON.parse(JSON.stringify(value));

/** Convert a logical strip at its existing physical-run boundaries. No output
 * or run is reordered; only each run's source identity/local index changes. */
export function convertExistingRunsToSections({ strips = [], wiring, patchBoard, stripId, paths, pathLengths = [], layerGroups = [], sectionFamilies = [] } = {}) {
  const source = strips.find(strip => strip.id === stripId);
  if (!source) return { ok: false, error: 'The selected strip is missing.' };
  if (!Array.isArray(source.pixels) || source.pixels.length !== source.pixelCount) {
    return { ok: false, error: 'This strip has no complete source LED coordinates. Reopen its artwork before separating runs.' };
  }
  const plan = planSectionsAtRunBoundaries(source, wiring);
  if (!plan.ok) return plan;
  if (!Array.isArray(paths) || paths.length !== plan.runs.length || paths.some(path => !path)) {
    return { ok: false, error: 'The artwork path could not be separated at those run boundaries.' };
  }
  if (sectionFamilies.some(family => family.memberIds?.includes(stripId))) {
    return { ok: false, error: 'Detach this connected section before separating its physical runs.' };
  }
  const owningGroup = layerGroups.find(group => (group.members || []).some(member =>
    (typeof member === 'string' ? member : member?.stripId) === stripId));
  if (owningGroup) {
    return { ok: false, error: `${owningGroup.name || 'This layer group'} renders its member strips as one card zone. Ungroup it in Layout before assigning different run patterns.` };
  }
  const board = normalizePatchBoard(patchBoard, strips);
  const sourcePatches = board.patches.filter(patch => patch.source?.type === 'strip' && patch.source.stripId === stripId);
  if (sourcePatches.length !== 1 || sourcePatches[0].source.startLed !== 0
      || sourcePatches[0].source.endLed !== source.pixelCount - 1) {
    return { ok: false, error: 'This strip has custom or overlapping patch ranges. Separate those patches in Advanced wiring before dividing its runs.' };
  }
  const oldPatch = sourcePatches[0];
  let sequence = 1;
  const usedIds = new Set(strips.map(strip => strip.id));
  const ids = [stripId, ...plan.runs.slice(1).map(() => {
    while (usedIds.has(`strip-${sequence}`)) sequence += 1;
    const id = `strip-${sequence++}`;
    usedIds.add(id);
    return id;
  })];
  const names = nextSplitNames(source.name, ids.length, strips.map(strip => strip.name));
  const pieces = plan.runs.map((run, index) => {
    const { from, to } = run.source;
    return {
      ...source,
      id: ids[index], name: names[index], pathData: paths[index],
      svgLength: Number(pathLengths[index]) > 0 ? Number(pathLengths[index]) : (Number(source.svgLength) || 0) * ((to - from + 1) / source.pixelCount),
      closed: false,
      pixelCount: to - from + 1,
      pixels: (source.pixels || []).slice(from, to + 1).map((pixel, localIndex) => ({ ...clone(pixel), index: localIndex })),
      // The family retains the complete original source metadata and geometry.
      sourceLayerId: null, sourcePathId: null, kaleidoscope: undefined, mergedFrom: undefined,
    };
  });
  const nextStrips = strips.flatMap(strip => strip.id === stripId ? pieces : [strip]);
  const nextWiring = clone(wiring);
  const runToPiece = new Map(plan.runs.map((run, index) => [run.id, { id: ids[index], from: run.source.from, count: plan.counts[index] }]));
  nextWiring.runs = nextWiring.runs.map(run => {
    const piece = runToPiece.get(run.id);
    if (!piece) return run;
    return {
      ...run,
      source: { ...run.source, stripId: piece.id, from: 0, to: piece.count - 1 },
      seamLed: run.seamLed == null ? null : run.seamLed - piece.from,
    };
  });
  const usedPatchIds = new Set(board.patches.map(patch => patch.id));
  const newPatchIds = [oldPatch.id, ...ids.slice(1).map(id => {
    const base = `patch-${id}`;
    let candidate = base;
    let suffix = 2;
    while (usedPatchIds.has(candidate)) candidate = `${base}-${suffix++}`;
    usedPatchIds.add(candidate);
    return candidate;
  })];
  const nextBoard = clone(board);
  const newPatches = ids.slice(1).map((id, index) => ({
    ...clone(oldPatch), id: newPatchIds[index + 1], name: names[index + 1],
    source: { ...clone(oldPatch.source), stripId: id, startLed: 0, endLed: plan.counts[index + 1] - 1, autoRange: true },
  }));
  nextBoard.patches = nextBoard.patches.flatMap(patch => patch.id === oldPatch.id ? [
    { ...patch, name: names[0], source: { ...patch.source, stripId, startLed: 0, endLed: plan.counts[0] - 1, autoRange: true } },
    ...newPatches,
  ] : [patch]);
  nextBoard.chains = nextBoard.chains.map(chain => ({ ...chain,
    rowIds: chain.rowIds.flatMap(id => id === oldPatch.id ? newPatchIds : [id]),
  }));
  const nextGroups = layerGroups.map(group => ({ ...group,
    members: (group.members || []).flatMap(member => {
      const memberId = typeof member === 'string' ? member : member?.stripId;
      return memberId === stripId ? ids.map((id, index) => typeof member === 'string' ? id : { ...member, stripId: id, name: names[index] }) : [member];
    }),
  }));
  const before = compileWiring({ wiring, strips, groups: layerGroups });
  const after = compileWiring({ wiring: nextWiring, strips: nextStrips, groups: nextGroups });
  if (!before.ok || !after.ok) return { ok: false, error: after.errors?.[0]?.message || before.errors?.[0]?.message || 'The output mapping could not be verified.' };
  const physical = compiled => ({
    outputs: compiled.outputs.map(output => [output.id, output.pin, output.start, output.count]),
    pixels: compiled.pixels.map(pixel => [pixel.runId, pixel.outputId, pixel.x, pixel.y, pixel.inactive]),
    runs: compiled.runs.map(run => [run.id, run.outputId, run.start, run.count, run.physicalDirection, run.directionPolicy]),
  });
  if (JSON.stringify(physical(before)) !== JSON.stringify(physical(after))) {
    return { ok: false, error: 'The proposed sections would change a physical LED address. Repair the run mapping before separating them.' };
  }
  return {
    ok: true, strips: nextStrips, wiring: nextWiring, patchBoard: nextBoard,
    layerGroups: nextGroups,
    sectionFamilies: [...sectionFamilies, createSectionFamily(source, pieces)].filter(Boolean),
    identityMap: { [stripId]: ids }, patchIdentityMap: { [oldPatch.id]: newPatchIds },
    pieces, runs: plan.runs,
  };
}

export function migrateRunSectionReferences({ controller = {}, expressionScenes = null, patchIdentityMap = {}, identityMap = {}, reverse = false } = {}) {
  const nextController = clone(controller);
  nextController.looks = (nextController.looks || []).map(look => {
    const sectionLooks = { ...(look.sectionLooks || {}) };
    for (const [oldId, newIds] of [...Object.entries(patchIdentityMap), ...Object.entries(identityMap)]) {
      if (reverse) {
        const values = newIds.filter(id => Object.hasOwn(sectionLooks, id)).map(id => sectionLooks[id]);
        if (values.length > 0 && values.length !== newIds.length) {
          throw new Error(`Saved look ${look.label || look.id} has an override on only some separated sections. Match their patterns before undoing separation.`);
        }
        if (values.some(value => JSON.stringify(value) !== JSON.stringify(values[0]))) {
          throw new Error(`Saved look ${look.label || look.id} has different patterns in the new sections. Make them the same before undoing separation.`);
        }
        if (values.length) sectionLooks[oldId] = clone(values[0]);
        newIds.slice(1).forEach(id => { delete sectionLooks[id]; });
      } else {
        if (!Object.hasOwn(sectionLooks, oldId)) continue;
        for (const id of newIds) sectionLooks[id] = clone(sectionLooks[oldId]);
      }
    }
    return { ...look, sectionLooks };
  });
  const nextScenes = expressionScenes == null ? expressionScenes : clone(expressionScenes);
  for (const scene of nextScenes?.scenes || []) {
    for (const step of scene.steps || []) {
      for (const assignment of step.assignments || []) {
        if (!Array.isArray(assignment.selection?.areaIds)) continue;
        let areaIds = assignment.selection.areaIds;
        for (const [oldId, newIds] of Object.entries(identityMap)) {
          const oldAreaId = `strip:${oldId}`;
          const newAreaIds = newIds.map(id => `strip:${id}`);
          if (reverse) {
            const selected = newAreaIds.filter(id => areaIds.includes(id));
            if (selected.length > 0 && selected.length !== newAreaIds.length) {
              throw new Error(`Scene ${scene.name || scene.id} selects only some separated sections. Select all sections or remove that assignment before undoing separation.`);
            }
            if (selected.length) areaIds = areaIds.flatMap(id => id === oldAreaId ? [oldAreaId] : (newAreaIds.includes(id) ? (id === newAreaIds[0] ? [oldAreaId] : []) : [id]));
          } else {
            areaIds = areaIds.flatMap(id => id === oldAreaId ? newAreaIds : [id]);
          }
        }
        assignment.selection.areaIds = [...new Set(areaIds)];
      }
    }
  }
  return { controller: nextController, expressionScenes: nextScenes };
}
