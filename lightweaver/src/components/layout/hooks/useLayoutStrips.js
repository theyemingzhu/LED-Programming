import { useCallback } from 'react';
import { nextStripNames, isGeneratedStripName, stripColorKey } from '../../../lib/stripLabels.js';
import {
  nextStripId,
  STRIP_COLORS,
  sampleStripPixels,
  translatePathData,
  svgPathLength,
  parsedVb,
} from '../../../lib/layoutGeometry.js';
import {
  createPrimitiveStripDefinition,
  DEFAULT_STARTER_PIXEL_COUNT,
} from '../../../lib/layoutPrimitives.js';
import { scaleStripGeometry } from '../../../lib/stripScale.js';
import { moveStripRowsInChain, normalizePatchBoard } from '../../../lib/patchBoard.js';
import { reprojectStripKaleidoscope, reverseKaleidoscope } from '../../../lib/kaleidoscope.js';
import {
  nextSplitName,
  nextSplitNames,
  planStripSplitCounts,
  planStripSplitFromCounts,
  splitStripPaths,
  splitStripPathsN,
} from '../../../lib/stripSplit.js';
import { useProject } from '../../../state/ProjectContext.jsx';
import {
  connectedFamilyForStrip,
  createSectionFamily,
  familyGeometryStatus,
  moveSectionBoundary,
  reconcileSectionFamilyRuns,
  resizeSectionFamily,
  updateFamilyMemberGeometry,
} from '../../../lib/connectedSections.js';
import { derivePxPerMmFromCounts } from '../../../lib/layoutLedCounts.js';
import { LED_COUNT_MAX } from '../../../lib/controlScale.js';

// scaleStrip clamps: never shrink a strip's path below this length (px)…
const MIN_STRIP_SVG_LENGTH = 20;
// …and never grow it beyond this multiple of the artwork's larger dimension.
const MAX_STRIP_LENGTH_ARTWORK_FACTOR = 4;

// Strip entity CRUD + batch ops (group / merge / duplicate / reorder).
// Reads the shared layout bundle assembled by useLayoutState.
export function useLayoutStrips(ctx) {
  const {
    strips, setStrips,
    editCounts, setEditCounts,
    hidden, setHidden,
    layers, svgText, viewBox, density, pxPerMm,
    stripCountOverrides, setStripCountOverrides,
    // Per-strip density map (id → LEDs/m) being introduced in a parallel
    // change; read defensively — absent entries fall back to the global density.
    stripDensities, setStripDensities,
    layerGroups, setLayerGroups, setLayerOrder,
    sectionFamilies, setSectionFamilies,
    setPxPerMm,
    pushLayoutHistory,
    selectStrip, selectStrips, clearLayoutSelection,
    patchBoard, setPatchBoard, updatePatchBoard,
    selectedStripIds, orderedStrips, stripSelectionName,
    nextColor, scrollToStrip, stripGroupMember,
    rebuildStrip,
    setKaleidoscopeResetNotices,
  } = ctx;
  // Splitting rewrites the physical chain as well as the strip list, so this
  // one action reaches wiring directly (same route useLayoutWire takes).
  const { wiring, updateWiring, projectName } = useProject();

  // Density is a physical fact of the purchased strip — count and length are
  // locked together through it: count = length(m) × density(LEDs/m).
  const safePxPerMm = Number.isFinite(pxPerMm) && pxPerMm > 0 ? pxPerMm : 3.7795;
  const densityFor = useCallback(
    (id) => {
      const perStrip = stripDensities?.[id];
      return Number.isFinite(perStrip) && perStrip > 0 ? perStrip : density;
    },
    [stripDensities, density],
  );
  const physicalCountForLength = useCallback(
    (svgLength, id) => Math.max(1, Math.round((svgLength / safePxPerMm) * densityFor(id) / 1000)),
    [safePxPerMm, densityFor],
  );

  const updateStrip = useCallback((id, patch) => {
    setStrips(prev => prev.map(x => x.id === id ? { ...x, ...patch } : x));
  }, [setStrips]);

  const updateStripWithHistory = useCallback((id, patch) => {
    pushLayoutHistory();
    setStrips(prev => prev.map(x => x.id === id ? { ...x, ...patch } : x));
  }, [setStrips, pushLayoutHistory]);

  const setStripOffset = useCallback((id, nextX, nextY, withHistory = false) => {
    if (withHistory) pushLayoutHistory();
    setStrips(prev => prev.map(s => {
      if (s.id !== id) return s;
      return {
        ...s,
        x: nextX,
        y: nextY,
        pixels: sampleStripPixels(s.pathData, s.pixelCount, s.reversed, nextX, nextY),
      };
    }));
  }, [setStrips, pushLayoutHistory]);

  const removeStrip = useCallback((id) => {
    const newStrips = strips.filter(s => s.id !== id);
    const newEditCounts = { ...editCounts };
    delete newEditCounts[id];
    // Drop the strip's own hidden flag so a reused strip-<n> id can't inherit a
    // stale "hidden" state.
    const newHidden = { ...hidden };
    delete newHidden[id];
    const emptiedGroupIds = new Set(layerGroups
      .filter(g => g.members.length > 0 && g.members.every(m => (m.stripId || m.pathId) === id))
      .map(g => g.groupId));
    pushLayoutHistory();
    setStrips(newStrips);
    setLayerGroups(prev => prev
      .map(g => ({ ...g, members: g.members.filter(m => (m.stripId || m.pathId) !== id) }))
      .filter(g => g.members.length > 0));
    setLayerOrder(prev => prev.filter(item => !emptiedGroupIds.has(item.id)));
    setEditCounts(newEditCounts);
    setHidden(newHidden);
    // Selection pruning happens in the strips-change effect in the composer.
  }, [strips, layers, editCounts, hidden, svgText, viewBox, density, layerGroups, pushLayoutHistory]);

  const reverseStrip = (id) => {
    const newStrips = strips.map(s => {
      if (s.id !== id) return s;
      const reversed = !s.reversed;
      const pixels = s.pixels.slice().reverse();
      return {
        ...s,
        reversed,
        pixels,
        ...(s.kaleidoscope ? { kaleidoscope: reverseKaleidoscope(s.kaleidoscope, s.pixelCount) } : {}),
      };
    });
    pushLayoutHistory();
    setStrips(newStrips);
  };

  const renameStrip = (id, name) => updateStrip(id, { name });

  const duplicateStrip = useCallback((id) => {
    const s = strips.find(st => st.id === id);
    if (!s) return;
    const newId = nextStripId(strips);
    // A duplicate is a free copy: it does not own the original's artwork source,
    // so it never counts as the whole-layer strip for that layer.
    const newStrip = {
      ...s, id: newId, name: `${s.name} copy`,
      sourceLayerId: null, sourcePathId: null,
      pixels: s.pixels.slice(),
      ...(s.kaleidoscope ? {
        kaleidoscope: { ...s.kaleidoscope, offsets: [...s.kaleidoscope.offsets] },
      } : {}),
    };
    const newStrips = strips.flatMap(st => st.id === id ? [st, newStrip] : [st]);
    pushLayoutHistory();
    setStrips(newStrips);
    selectStrip(newId);
    scrollToStrip(newId);
  }, [strips, layers, editCounts, hidden, svgText, viewBox, density, pushLayoutHistory, selectStrip]);

  // "+ Add strip" — append a fresh Line / Circle / Square primitive to the
  // existing layout (the starter picker only exists before the first strip).
  // Physical-first: `ledCount` is the LEDs of the strip the user is physically
  // adding (ground truth), and the shape arrives SIZED to hold exactly that
  // count at its density — path length = (count / density) metres at the
  // current scale. The size↔count round-trip is exact by construction, so no
  // count override is needed and later resizes recount cleanly.
  // Each new strip is nudged +24px per existing strip so it never lands exactly
  // on top of another one.
  const addPrimitiveStrip = useCallback((type, ledCount, ledsPerM, lengthM) => {
    const id = nextStripId(strips);
    const offset = 24 * strips.length;
    const definition = createPrimitiveStripDefinition({
      type,
      viewBox,
      pixelCount: DEFAULT_STARTER_PIXEL_COUNT,
      id,
      color: nextColor(),
    });
    // No count given (legacy callers): derive it from the default shape size.
    const effectiveDensity = Number.isFinite(Number(ledsPerM)) && Number(ledsPerM) > 0
      ? Number(ledsPerM)
      : densityFor(id);
    const count = Number.isFinite(Number(ledCount)) && Number(ledCount) > 0
      ? Math.round(Number(ledCount))
      : physicalCountForLength(definition.svgLength, id);
    // Scale the default shape so its length holds `count` LEDs at this
    // strip's density. Only the minimum-length clamp applies here: the
    // physical strip is as long as it is, even if that overflows the artwork
    // (the resize clamps still stop runaway ± growth afterwards).
    const physicalLength = Number.isFinite(Number(lengthM)) && Number(lengthM) > 0
      ? Number(lengthM)
      : count / effectiveDensity;
    const targetLen = Math.max(MIN_STRIP_SVG_LENGTH, physicalLength * 1000 * safePxPerMm);
    const sized = (definition.svgLength > 0 && Number.isFinite(targetLen) && targetLen !== definition.svgLength)
      ? scaleStripGeometry(definition, targetLen / definition.svgLength)
      : definition;
    // "Circle", "Circle 2", "Circle 3"… so rows stay tellable-apart.
    const sameShape = strips.filter(s =>
      s.name === definition.name || s.name?.startsWith(`${definition.name} `)).length;
    const strip = rebuildStrip({
      ...sized,
      pixelCount: count,
      name: sameShape ? `${definition.name} ${sameShape + 1}` : definition.name,
      x: offset,
      y: offset,
    });
    pushLayoutHistory();
    setStripDensities(prev => ({ ...prev, [id]: effectiveDensity }));
    setStrips(prev => [...prev, strip]);
    selectStrip(id);
    scrollToStrip(id);
    return id;
  }, [strips, viewBox, rebuildStrip, nextColor, pushLayoutHistory, setStripDensities, setStrips, selectStrip, scrollToStrip, physicalCountForLength, densityFor, safePxPerMm]);

  // Uniform resize of a strip's geometry about its own center (Draw panel
  // − / + Size control). Same shape as reverseStrip: history push + setStrips,
  // so undo/redo and autosave pick it up through the normal strip-update path.
  // Physical-first: resizing changes how many LEDs the strip holds. Density is
  // the reel, so count is always re-derived from the new length.
  const scaleStrip = useCallback((id, factor) => {
    if (!Number.isFinite(factor) || factor <= 0 || factor === 1) return;
    const s = strips.find(st => st.id === id);
    if (!s) return;
    const currentLen = (Number.isFinite(s.svgLength) && s.svgLength > 0)
      ? s.svgLength
      : svgPathLength(s.pathData);
    if (!(currentLen > 0)) return;
    const vb = parsedVb(viewBox);
    // A strip sized from its real LED count can legitimately start larger than
    // the artwork. Give the ± control room to grow that strip twice over while
    // retaining the canvas-relative guard for ordinary artwork paths.
    const maxLen = Math.max(
      MAX_STRIP_LENGTH_ARTWORK_FACTOR * Math.max(vb.w, vb.h),
      currentLen * 2,
    );
    const nextLen = currentLen * factor;
    // Directional clamps: never grow past the artwork cap, never shrink into a
    // degenerate dot — but always allow moving back TOWARD the valid range
    // (a count-sized strip can legitimately start beyond the grow cap).
    if (factor > 1 && nextLen > maxLen) return;
    if (factor < 1 && nextLen < MIN_STRIP_SVG_LENGTH) return;
    const scaled = scaleStripGeometry({ ...s, svgLength: currentLen }, factor);
    // A count the owner typed is a fact about the strip they own — 60 lights
    // stay 60 lights however the drawing is resized; what changes is how far
    // apart they sit. Only a strip whose count is still derived recounts from
    // the new length at its density. Without this the ± control silently
    // rewrote a hand-entered 60 to 67, and the card would have been addressed
    // for lights that are not on the reel.
    const pinnedCount = stripCountOverrides?.[id]
      ? Math.round(Number(s.pixelCount))
      : null;
    const pixelCount = Number.isFinite(pinnedCount) && pinnedCount > 0
      ? pinnedCount
      : physicalCountForLength(scaled.svgLength, id);
    pushLayoutHistory();
    const projection = reprojectStripKaleidoscope(scaled, pixelCount);
    if (projection.resetPointIndices.length) {
      setKaleidoscopeResetNotices?.(current => ({
        ...current,
        [id]: projection.resetPointIndices,
      }));
    }
    const projected = projection.strip;
    setStrips(prev => prev.map(st => st.id !== id ? st : {
      ...projected,
      pixels: sampleStripPixels(projected.pathData, pixelCount, projected.reversed, projected.x || 0, projected.y || 0),
    }));
  }, [strips, viewBox, physicalCountForLength, stripCountOverrides, pushLayoutHistory, setStrips, setKaleidoscopeResetNotices]);

  // Divide one strip into two named strips that stay adjacent on the same
  // output — the inverse of "Combine into one strip", for a reel that runs
  // across two layers of the artwork and should be addressed as two.
  const splitStripInTwo = useCallback((id) => {
    if (wiring.locked) return null;
    const source = strips.find(st => st.id === id);
    if (!source) return null;
    const counts = planStripSplitCounts(source.pixelCount);
    if (!counts) return null;
    const paths = splitStripPaths(source.pathData, counts, source.reversed);
    if (!paths) return null;
    // A strip already cut into several runs in Advanced wiring has no single
    // run to divide; those boundaries are edited there instead.
    const sourceRuns = wiring.runs.filter(run => run.type === 'strip' && run.source?.stripId === id);
    if (sourceRuns.length > 1) return null;

    const tailId = nextStripId(strips);
    const x = source.x || 0;
    const y = source.y || 0;
    const halfOf = (pathData, pixelCount) => ({
      ...source,
      pathData,
      pixelCount,
      svgLength: svgPathLength(pathData),
      pixels: sampleStripPixels(pathData, pixelCount, source.reversed, x, y),
      // Reflection points are placed against a whole run; a cut invalidates them.
      kaleidoscope: undefined,
      mergedFrom: undefined,
      // Neither half covers the artwork layer on its own any more, so neither
      // one claims it (same rule "Combine into one strip" applies).
      sourceLayerId: null,
      sourcePathId: null,
    });
    const head = halfOf(paths.head, counts.head);
    const tail = {
      ...halfOf(paths.tail, counts.tail),
      id: tailId,
      name: nextSplitName(source.name, strips.map(st => st.name)),
      color: nextColor(),
    };

    pushLayoutHistory();
    setStrips(prev => prev.flatMap(st => (st.id === id ? [head, tail] : [st])));
    setSectionFamilies(prev => [
      ...prev.filter(family => !family.memberIds?.includes(id)),
      createSectionFamily(source, [head, tail]),
    ].filter(Boolean));
    setStripDensities(prev => ({ ...prev, [tailId]: densityFor(id) }));
    // A hand-pinned count on the original means both halves are hand-set too,
    // so a later resize does not silently recount them.
    if (stripCountOverrides?.[id]) {
      setStripCountOverrides(prev => ({ ...prev, [id]: true, [tailId]: true }));
    }
    updateWiring(draft => {
      const existing = draft.runs.find(run => run.type === 'strip' && run.source?.stripId === id);
      const run = {
        id: `run-${tailId}`,
        type: 'strip',
        source: { stripId: tailId, from: 0, to: Math.max(0, counts.tail - 1) },
        directionPolicy: existing?.directionPolicy || 'flexible',
        physicalDirection: existing?.physicalDirection || 'source-forward',
        seamLed: null,
        verified: false,
      };
      let suffix = 2;
      while (draft.runs.some(item => item.id === run.id)) run.id = `run-${tailId}-${suffix++}`;
      if (existing) {
        existing.source = { ...existing.source, from: 0, to: Math.max(0, counts.head - 1) };
        existing.seamLed = null;
        existing.verified = false;
      }
      draft.runs.push(run);
      // Land the new half immediately after the original on its own output, so
      // the list keeps reading in the order the data actually travels.
      const host = draft.outputs.find(output => existing && output.runIds.includes(existing.id));
      if (host) host.runIds.splice(host.runIds.indexOf(existing.id) + 1, 0, run.id);
      else (draft.outputs[0] || {}).runIds?.push(run.id);
    }, { changeKind: 'route' });
    selectStrip(tailId);
    scrollToStrip(tailId);
    return tailId;
  }, [strips, wiring, updateWiring, nextColor, densityFor, stripCountOverrides,
      setStripCountOverrides, setStripDensities, setSectionFamilies, pushLayoutHistory, setStrips, selectStrip, scrollToStrip]);

  // Divide one strip into 2..MAX_SPLIT_SECTIONS named strips that stay
  // adjacent on the same output — the general form of splitStripInTwo above,
  // for an owner who wants several independently-patterned zones out of one
  // drawn reel (each new strip becomes its own zone once compiled — see
  // wiringCompiler.js — so no wiring/contract change is needed here).
  //
  // Kept as its own function rather than built on splitStripInTwo: that
  // function's single-click behaviour and its naming (the first half keeps
  // the strip's own name, only the second half is suffixed) are asserted
  // byte-for-byte by tests/layout-strip-split.spec.ts for the existing
  // "Split into two" control. This function powers a separate "Divide"
  // control with its own owner-picked section count and its own naming rule
  // (nextSplitNames — every piece suffixed 1..N, including piece 1).
  // `sections` is a count (the even plan) or an array of the owner's own
  // counts (uneven divide); both resolve to the same plan shape.
  const divideStripIntoSections = useCallback((id, sections) => {
    if (wiring.locked) return null;
    const source = strips.find(st => st.id === id);
    if (!source) return null;
    const counts = Array.isArray(sections)
      ? planStripSplitFromCounts(source.pixelCount, sections)
      : planStripSplitCounts(source.pixelCount, sections);
    if (!counts || counts.counts.length < 2) return null;
    const paths = splitStripPathsN(source.pathData, counts, source.reversed);
    if (!paths || paths.length !== counts.counts.length) return null;
    // A strip already cut into several runs in Advanced wiring has no single
    // run to divide; those boundaries are edited there instead.
    const sourceRuns = wiring.runs.filter(run => run.type === 'strip' && run.source?.stripId === id);
    if (sourceRuns.length > 1) return null;

    const x = source.x || 0;
    const y = source.y || 0;
    const partOf = (pathData, pixelCount) => ({
      ...source,
      pathData,
      pixelCount,
      svgLength: svgPathLength(pathData),
      pixels: sampleStripPixels(pathData, pixelCount, source.reversed, x, y),
      // Reflection points are placed against a whole run; a cut invalidates them.
      kaleidoscope: undefined,
      mergedFrom: undefined,
      // No piece covers the artwork layer on its own any more, so none of
      // them claims it (same rule "Combine into one strip" applies).
      sourceLayerId: null,
      sourcePathId: null,
    });

    // Allocate one fresh id per new piece (the first piece keeps `id`),
    // walking nextStripId forward so two pieces never collide.
    let pool = strips;
    const newIds = [];
    for (let index = 1; index < counts.counts.length; index += 1) {
      const newId = nextStripId(pool);
      newIds.push(newId);
      pool = [...pool, { id: newId }];
    }
    const names = isGeneratedStripName(source.name, projectName)
      ? nextStripNames(strips, counts.counts.length, id)
      : nextSplitNames(source.name, counts.counts.length, strips.map(st => st.name));

    // The palette cursor restarts after restoration. Skip sibling colors so
    // a newly divided card strip cannot start with two identical sections.
    const pieceColors = new Set([stripColorKey(source.color)]);
    const nextPieceColor = () => {
      let color = nextColor();
      for (let attempt = 1; pieceColors.has(stripColorKey(color)) && attempt < STRIP_COLORS.length; attempt += 1) color = nextColor();
      pieceColors.add(stripColorKey(color));
      return color;
    };
    const pieces = counts.counts.map((pixelCount, index) => {
      const piece = partOf(paths[index], pixelCount);
      return index === 0
        ? { ...piece, id, name: names[0] }
        : { ...piece, id: newIds[index - 1], name: names[index], color: nextPieceColor() };
    });

    const wiringResult = updateWiring(draft => {
      const existing = draft.runs.find(run => run.type === 'strip' && run.source?.stripId === id);
      if (existing) {
        existing.source = { ...existing.source, from: 0, to: Math.max(0, counts.counts[0] - 1) };
        existing.seamLed = null;
        existing.verified = false;
      }
      const host = draft.outputs.find(output => existing && output.runIds.includes(existing.id));
      // Land each new piece immediately after the one before it on its own
      // output, so the list keeps reading in the order the data travels.
      let previousRunId = existing?.id;
      newIds.forEach((newId, index) => {
        const pieceIndex = index + 1;
        const run = {
          id: `run-${newId}`,
          type: 'strip',
          source: { stripId: newId, from: 0, to: Math.max(0, counts.counts[pieceIndex] - 1) },
          directionPolicy: existing?.directionPolicy || 'flexible',
          physicalDirection: existing?.physicalDirection || 'source-forward',
          seamLed: null,
          verified: false,
        };
        let suffix = 2;
        while (draft.runs.some(item => item.id === run.id)) run.id = `run-${newId}-${suffix++}`;
        draft.runs.push(run);
        if (host && previousRunId) {
          const at = host.runIds.indexOf(previousRunId);
          host.runIds.splice(at + 1, 0, run.id);
        } else {
          (draft.outputs[0] || {}).runIds?.push(run.id);
        }
        previousRunId = run.id;
      });
    }, { changeKind: 'route', strips: strips.flatMap(st => st.id === id ? pieces : [st]) });
    if (!wiringResult?.ok) return null;
    // updateWiring records the single pre-division snapshot before either
    // geometry or density changes, so one Undo restores the whole strip.
    setStrips(prev => prev.flatMap(st => (st.id === id ? pieces : [st])));
    setSectionFamilies(prev => [
      ...prev.filter(family => !family.memberIds?.includes(id)),
      createSectionFamily(source, pieces),
    ].filter(Boolean));
    setStripDensities(prev => {
      const next = { ...prev };
      const sourceDensity = densityFor(id);
      newIds.forEach(newId => { next[newId] = sourceDensity; });
      return next;
    });
    // A hand-pinned count on the original means every piece is hand-set too,
    // so a later resize does not silently recount them.
    if (stripCountOverrides?.[id]) {
      setStripCountOverrides(prev => {
        const next = { ...prev, [id]: true };
        newIds.forEach(newId => { next[newId] = true; });
        return next;
      });
    }
    // Keep the first section open for editing. Selecting every new section
    // automatically opens the batch Group/Combine panel and obscures the
    // result the owner is trying to inspect.
    selectStrip(id);
    scrollToStrip(id);
    return newIds;
  }, [strips, wiring, updateWiring, projectName, nextColor, densityFor, stripCountOverrides,
      setStripCountOverrides, setStripDensities, setSectionFamilies, pushLayoutHistory, setStrips, selectStrip, scrollToStrip]);

  const familyMutationContext = useCallback((familyId) => {
    if (wiring.locked) return { ok: false, error: 'Wiring is locked — unlock it in Test & Install.' };
    const family = sectionFamilies.find(candidate => candidate.id === familyId);
    if (!family) return { ok: false, error: 'This connected strip is no longer available.' };
    const status = familyGeometryStatus(family, strips);
    if (!status.ok) return status;
    for (const memberId of family.memberIds) {
      const runs = wiring.runs.filter(run => run.type === 'strip' && run.source?.stripId === memberId);
      if (runs.length > 1) return { ok: false, error: 'A section is divided into multiple advanced runs. Restore one run per section before editing boundaries.' };
    }
    const byId = new Map(strips.map(strip => [strip.id, strip]));
    return { ok: true, family, members: family.memberIds.map(id => byId.get(id)) };
  }, [sectionFamilies, strips, wiring]);

  const resliceConnectedFamily = useCallback((family, counts, sourceStrips = strips) => {
    if (!counts.every(count => Number.isSafeInteger(Number(count)) && Number(count) >= 1 && Number(count) <= LED_COUNT_MAX)) {
      return { ok: false, error: `Each section must contain 1–${LED_COUNT_MAX.toLocaleString('en-US')} LEDs.` };
    }
    const total = counts.reduce((sum, count) => sum + count, 0);
    const plan = planStripSplitFromCounts(total, counts);
    const paths = plan ? splitStripPathsN(family.source.pathData, plan, family.source.reversed) : null;
    if (!paths) return { ok: false, error: 'The original path could not be divided at those LED boundaries.' };
    return resizeSectionFamily({
      family,
      strips: sourceStrips,
      counts,
      paths,
      measurePath: svgPathLength,
      samplePixels: (member, pixelCount) => sampleStripPixels(
        member.pathData,
        pixelCount,
        member.reversed,
        member.x || 0,
        member.y || 0,
      ),
    });
  }, [strips]);

  const commitConnectedGeometry = useCallback((family, nextStrips, { removedIds = [], newMember = null } = {}) => {
    const result = updateWiring(draft => {
      reconcileSectionFamilyRuns(draft, { family, nextStrips, removedIds, newMember });
    }, { changeKind: 'route', strips: nextStrips });
    if (!result?.ok) return { ok: false, error: result?.errors?.[0]?.message || 'The connected sections could not be updated.' };
    setStrips(nextStrips);
    setSectionFamilies(current => current.map(candidate => candidate.id === family.id ? family : candidate));
    return { ok: true };
  }, [setSectionFamilies, setStrips, updateWiring]);

  const moveConnectedBoundary = useCallback((familyId, boundaryIndex, absoluteLed) => {
    const context = familyMutationContext(familyId);
    if (!context.ok) return context;
    const counts = context.members.map(member => member.pixelCount);
    const nextCounts = moveSectionBoundary(counts, boundaryIndex, absoluteLed);
    if (!nextCounts) return { ok: false, error: 'Keep at least one LED on both sides of the boundary.' };
    if (nextCounts.every((count, index) => count === counts[index])) return { ok: true, unchanged: true };
    const resized = resliceConnectedFamily(context.family, nextCounts);
    if (!resized.ok) return resized;
    const commit = commitConnectedGeometry(resized.family, resized.strips);
    if (!commit.ok) return commit;
    setStripCountOverrides(current => ({
      ...current,
      ...Object.fromEntries(context.family.memberIds.map(id => [id, true])),
    }));
    return { ok: true };
  }, [commitConnectedGeometry, familyMutationContext, resliceConnectedFamily, setStripCountOverrides]);

  const addConnectedSplit = useCallback((memberId) => {
    const family = connectedFamilyForStrip(sectionFamilies, memberId);
    const context = familyMutationContext(family?.id);
    if (!context.ok) return context;
    const memberIndex = context.family.memberIds.indexOf(memberId);
    const member = context.members[memberIndex];
    if (!member || member.pixelCount < 2) return { ok: false, error: 'This section needs at least 2 LEDs to split.' };
    const newId = nextStripId(strips);
    const newMember = {
      ...member,
      id: newId,
      name: nextSplitName(member.name, strips.map(strip => strip.name)),
      color: nextColor(),
      pixels: member.pixels?.slice() || [],
      kaleidoscope: undefined,
    };
    const insertAt = strips.findIndex(strip => strip.id === memberId) + 1;
    const withMember = [...strips];
    withMember.splice(insertAt, 0, newMember);
    const nextFamily = updateFamilyMemberGeometry({
      ...context.family,
      memberIds: context.family.memberIds.flatMap(id => id === memberId ? [id, newId] : [id]),
    }, withMember);
    const split = planStripSplitCounts(member.pixelCount, 2)?.counts;
    const counts = context.members.flatMap(item => item.id === memberId ? split : [item.pixelCount]);
    const resized = resliceConnectedFamily(nextFamily, counts, withMember);
    if (!resized.ok) return resized;
    const committedMember = resized.strips.find(strip => strip.id === newId);
    const commit = commitConnectedGeometry(resized.family, resized.strips, { newMember: committedMember });
    if (!commit.ok) return commit;
    setPatchBoard(current => {
      const board = normalizePatchBoard(current, resized.strips);
      const sourcePatch = board.patches.find(patch => patch.source?.type === 'strip' && patch.source.stripId === memberId);
      const newPatch = board.patches.find(patch => patch.source?.type === 'strip' && patch.source.stripId === newId);
      if (sourcePatch && newPatch) newPatch.playback = { ...(sourcePatch.playback || {}) };
      return board;
    });
    setStripDensities(current => ({ ...current, [newId]: densityFor(memberId) }));
    setStripCountOverrides(current => ({ ...current, [memberId]: true, [newId]: true }));
    selectStrip(newId);
    return { ok: true, stripId: newId };
  }, [sectionFamilies, familyMutationContext, strips, nextColor, resliceConnectedFamily,
      commitConnectedGeometry, setPatchBoard, setStripDensities, densityFor, setStripCountOverrides, selectStrip]);

  const mergeConnectedSection = useCallback((memberId) => {
    const family = connectedFamilyForStrip(sectionFamilies, memberId);
    const context = familyMutationContext(family?.id);
    if (!context.ok) return context;
    const index = context.family.memberIds.indexOf(memberId);
    const right = context.members[index + 1];
    if (!right) return { ok: false, error: 'Choose a section with a neighbour after it.' };
    const leftOutput = wiring.outputs.find(output => output.runIds.some(runId => wiring.runs.find(run => run.id === runId)?.source?.stripId === memberId));
    const rightOutput = wiring.outputs.find(output => output.runIds.some(runId => wiring.runs.find(run => run.id === runId)?.source?.stripId === right.id));
    if (leftOutput?.pin !== rightOutput?.pin) return { ok: false, error: 'Put both sections on the same GPIO to merge.' };
    const mergedCount = context.members[index].pixelCount + right.pixelCount;
    if (mergedCount > LED_COUNT_MAX) return { ok: false, error: `A merged section cannot exceed ${LED_COUNT_MAX.toLocaleString('en-US')} LEDs.` };
    const remaining = strips.filter(strip => strip.id !== right.id);
    const memberIds = context.family.memberIds.filter(id => id !== right.id);
    if (memberIds.length === 1) {
      const survivor = remaining.find(strip => strip.id === memberIds[0]);
      const restored = {
        ...survivor,
        id: context.family.parentId,
        name: context.family.parentName,
        ...context.family.source,
        pixelCount: context.members.reduce((sum, member) => sum + member.pixelCount, 0),
      };
      restored.pixels = sampleStripPixels(restored.pathData, restored.pixelCount, restored.reversed, restored.x || 0, restored.y || 0);
      const nextStrips = remaining.map(strip => strip.id === survivor.id ? restored : strip);
      const commit = updateWiring(draft => {
        const removedRuns = new Set(draft.runs.filter(run => run.source?.stripId === right.id).map(run => run.id));
        draft.runs = draft.runs.filter(run => !removedRuns.has(run.id));
        draft.outputs.forEach(output => { output.runIds = output.runIds.filter(id => !removedRuns.has(id)); });
        const survivorRun = draft.runs.find(run => run.type === 'strip' && run.source?.stripId === survivor.id);
        if (survivorRun) {
          survivorRun.source = { ...survivorRun.source, stripId: restored.id, from: 0, to: Math.max(0, restored.pixelCount - 1) };
          survivorRun.seamLed = null;
          survivorRun.verified = false;
        }
      }, { changeKind: 'route', strips: nextStrips });
      if (!commit?.ok) return { ok: false, error: commit?.errors?.[0]?.message || 'The sections could not be merged.' };
      setStrips(nextStrips);
      setSectionFamilies(current => current.filter(candidate => candidate.id !== context.family.id));
      setStripDensities(current => { const next = { ...current }; delete next[right.id]; return next; });
      setStripCountOverrides(current => { const next = { ...current }; delete next[right.id]; return next; });
      setHidden(current => { const next = { ...current }; delete next[right.id]; return next; });
      setEditCounts(current => { const next = { ...current }; delete next[right.id]; return next; });
      selectStrip(restored.id);
      return { ok: true, detached: true };
    }
    const counts = context.members
      .filter(member => member.id !== right.id)
      .map(member => member.id === memberId ? member.pixelCount + right.pixelCount : member.pixelCount);
    const nextFamily = updateFamilyMemberGeometry({ ...context.family, memberIds }, remaining);
    const resized = resliceConnectedFamily(nextFamily, counts, remaining);
    if (!resized.ok) return resized;
    const commit = commitConnectedGeometry(resized.family, resized.strips, { removedIds: [right.id] });
    if (!commit.ok) return commit;
    setStripDensities(current => { const next = { ...current }; delete next[right.id]; return next; });
    setStripCountOverrides(current => { const next = { ...current }; delete next[right.id]; return next; });
    setHidden(current => { const next = { ...current }; delete next[right.id]; return next; });
    setEditCounts(current => { const next = { ...current }; delete next[right.id]; return next; });
    selectStrip(memberId);
    return { ok: true };
  }, [sectionFamilies, familyMutationContext, wiring, strips, updateWiring, setStrips,
      setSectionFamilies, setStripDensities, setStripCountOverrides, setHidden, setEditCounts,
      selectStrip, resliceConnectedFamily, commitConnectedGeometry]);

  const correctConnectedSectionCount = useCallback((memberId, requestedCount) => {
    const count = Number(requestedCount);
    if (!Number.isSafeInteger(count) || count < 1 || count > LED_COUNT_MAX) {
      return { ok: false, error: `Enter a whole LED count from 1 to ${LED_COUNT_MAX.toLocaleString('en-US')}.` };
    }
    const family = connectedFamilyForStrip(sectionFamilies, memberId);
    const context = familyMutationContext(family?.id);
    if (!context.ok) return context;
    const current = context.members.find(member => member.id === memberId)?.pixelCount;
    if (current === count) return { ok: true, unchanged: true };
    const counts = context.members.map(member => member.id === memberId ? count : member.pixelCount);
    const resized = resliceConnectedFamily(context.family, counts);
    if (!resized.ok) return resized;
    const commit = commitConnectedGeometry(resized.family, resized.strips);
    if (!commit.ok) return commit;
    const nextPxPerMm = derivePxPerMmFromCounts(resized.strips, { defaultDensity: density, stripDensities });
    if (nextPxPerMm > 0) setPxPerMm(nextPxPerMm);
    setStripCountOverrides(current => ({
      ...current,
      ...Object.fromEntries(context.family.memberIds.map(id => [id, true])),
    }));
    return { ok: true };
  }, [sectionFamilies, familyMutationContext, resliceConnectedFamily, commitConnectedGeometry,
      density, stripDensities, setPxPerMm, setStripCountOverrides]);

  const detachSectionFamily = useCallback((familyId) => {
    if (!sectionFamilies.some(family => family.id === familyId)) return;
    pushLayoutHistory();
    setSectionFamilies(current => current.filter(family => family.id !== familyId));
  }, [sectionFamilies, pushLayoutHistory, setSectionFamilies]);

  const createStripGroupFromIds = useCallback((stripIds, nameOverride = '') => {
    const uniqueIds = [...new Set(stripIds)].filter(Boolean);
    const picked = strips.filter(s => uniqueIds.includes(s.id));
    if (picked.length < 2) return;

    const pickedIds = new Set(picked.map(s => s.id));
    const emptiedGroupIds = new Set(layerGroups
      .filter(g => g.members.length > 0 && g.members.every(m => pickedIds.has(m.stripId || m.pathId)))
      .map(g => g.groupId));
    const groupId = `strip-grp-${Date.now()}`;
    const name = nameOverride.trim() || stripSelectionName.trim() || `Strip Group ${layerGroups.length + 1}`;
    const newGroup = {
      groupId,
      type: 'strip',
      name,
      _hidden: false,
      _expanded: true,
      members: picked.map(stripGroupMember),
    };

    pushLayoutHistory();
    setLayerGroups(prev => [
      ...prev
        .map(g => ({ ...g, members: g.members.filter(m => !pickedIds.has(m.stripId || m.pathId)) }))
        .filter(g => g.members.length > 0),
      newGroup,
    ]);
    setLayerOrder(prev => [{ type: 'group', id: groupId }, ...prev.filter(item => item.id !== groupId && !emptiedGroupIds.has(item.id))]);
    selectStrips(picked.map(s => s.id));
  }, [strips, layerGroups, stripSelectionName, layers, editCounts, hidden, svgText, viewBox, density, pushLayoutHistory, selectStrips]);

  const addStripsToGroup = useCallback((groupId, stripIds) => {
    const group = layerGroups.find(g => g.groupId === groupId);
    if (!group || group.type !== 'strip') return;
    const ids = [...new Set(stripIds)].filter(Boolean);
    const picked = strips.filter(s => ids.includes(s.id));
    if (!picked.length) return;
    const pickedIds = new Set(picked.map(s => s.id));

    pushLayoutHistory();
    setLayerGroups(prev => prev
      .map(g => {
        const existing = g.members.filter(m => !pickedIds.has(m.stripId || m.pathId));
        if (g.groupId !== groupId) return { ...g, members: existing };
        return {
          ...g,
          type: 'strip',
          _expanded: true,
          members: [...existing, ...picked.map(stripGroupMember)],
        };
      })
      .filter(g => g.members.length > 0));
    selectStrips(picked.map(s => s.id));
  }, [layerGroups, strips, layers, editCounts, hidden, svgText, viewBox, density, pushLayoutHistory, selectStrips]);

  const groupSelectedStrips = useCallback(() => {
    createStripGroupFromIds(selectedStripIds);
  }, [selectedStripIds, createStripGroupFromIds]);

  const mergeSelectedStrips = useCallback(() => {
    const selected = new Set(selectedStripIds);
    // Merge in displayed wire (chain) order — the list order the user sees.
    const picked = orderedStrips.filter(s => selected.has(s.id));
    if (picked.length < 2) return;

    const first = picked[0];
    const pickedIds = new Set(picked.map(s => s.id));
    const emptiedGroupIds = new Set(layerGroups
      .filter(g => g.members.length > 0 && g.members.every(m => pickedIds.has(m.stripId || m.pathId)))
      .map(g => g.groupId));
    const mergedId = nextStripId(strips);
    const mergedName = stripSelectionName.trim() || `Merged Strip ${strips.length - picked.length + 1}`;
    const pixels = picked.flatMap(s => s.pixels?.length ? s.pixels : []);
    const mergedStrip = {
      ...first,
      id: mergedId,
      // Merged from several strips: no single artwork source.
      sourceLayerId: null, sourcePathId: null,
      name: mergedName,
      pathData: picked.map(s => translatePathData(s.pathData, s.x || 0, s.y || 0)).filter(Boolean).join(' '),
      pixelCount: picked.reduce((sum, s) => sum + (s.pixelCount || 0), 0),
      pixels,
      x: 0,
      y: 0,
      color: first.color || nextColor(),
      reversed: false,
      mergedFrom: picked.map(s => ({ id: s.id, name: s.name, pixelCount: s.pixelCount })),
    };
    delete mergedStrip.kaleidoscope;
    const insertAt = strips.findIndex(s => pickedIds.has(s.id));
    const remaining = strips.filter(s => !pickedIds.has(s.id));
    const newStrips = [...remaining];
    newStrips.splice(Math.max(0, insertAt), 0, mergedStrip);

    pushLayoutHistory();
    setLayerGroups(prev => prev
      .map(g => ({ ...g, members: g.members.filter(m => !pickedIds.has(m.stripId || m.pathId)) }))
      .filter(g => g.members.length > 0));
    setLayerOrder(prev => prev.filter(item => !emptiedGroupIds.has(item.id)));
    setStrips(newStrips);
    setHidden(prev => {
      const next = { ...prev };
      pickedIds.forEach(id => { delete next[id]; });
      return next;
    });
    selectStrip(mergedId);
    scrollToStrip(mergedId);
  }, [selectedStripIds, strips, orderedStrips, stripSelectionName, layerGroups, layers, editCounts, hidden, svgText, viewBox, density, pushLayoutHistory, selectStrip]);

  const removeSelectedStrips = useCallback(() => {
    const selected = new Set(selectedStripIds);
    if (selected.size < 2) return;
    const newStrips = strips.filter(s => !selected.has(s.id));
    const emptiedGroupIds = new Set(layerGroups
      .filter(g => g.members.length > 0 && g.members.every(m => selected.has(m.stripId || m.pathId)))
      .map(g => g.groupId));
    pushLayoutHistory();
    setStrips(newStrips);
    setLayerGroups(prev => prev
      .map(g => ({ ...g, members: g.members.filter(m => !selected.has(m.stripId || m.pathId)) }))
      .filter(g => g.members.length > 0));
    setLayerOrder(prev => prev.filter(item => !emptiedGroupIds.has(item.id)));
    setHidden(prev => {
      const next = { ...prev };
      selected.forEach(id => { delete next[id]; });
      return next;
    });
    clearLayoutSelection();
  }, [selectedStripIds, strips, layers, editCounts, hidden, svgText, viewBox, density, layerGroups, pushLayoutHistory, clearLayoutSelection]);

  // Drag a strip row onto another to change the physical wire order. Only the
  // patch-board chain moves — the strips[] array order is never touched by
  // reordering. moveStripRowsInChain moves each dragged strip's patches as one
  // contiguous block (splits preserved, off rows pinned to their slots). One
  // gesture = one undo entry (updatePatchBoard pushes history exactly once).
  const reorderStripRows = useCallback((draggedIds, targetId) => {
    const ids = (draggedIds || []).filter(Boolean);
    if (!ids.length || ids.includes(targetId)) return;
    updatePatchBoard(board => {
      // moveStripRowsInChain returns a normalized copy; write its result back
      // onto the mutable board `updatePatchBoard` hands us.
      const moved = moveStripRowsInChain(board, ids, targetId);
      board.patches = moved.patches;
      board.chains = moved.chains;
      board.groups = moved.groups;
      board.physicalLocked = moved.physicalLocked;
    });
  }, [updatePatchBoard]);

  return {
    updateStrip,
    updateStripWithHistory,
    setStripOffset,
    removeStrip,
    reverseStrip,
    renameStrip,
    duplicateStrip,
    splitStripInTwo,
    divideStripIntoSections,
    moveConnectedBoundary,
    addConnectedSplit,
    mergeConnectedSection,
    correctConnectedSectionCount,
    detachSectionFamily,
    addPrimitiveStrip,
    scaleStrip,
    createStripGroupFromIds,
    addStripsToGroup,
    groupSelectedStrips,
    mergeSelectedStrips,
    removeSelectedStrips,
    reorderStripRows,
  };
}
