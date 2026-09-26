import { DEFAULT_CARD_CONTROLS, DEFAULT_CARD_LED, DEFAULT_CARD_PATTERN_BANK, makeCardRuntimePackage, patchBoardToZones } from './cardRuntimeContract.js';
import { DEFAULT_STANDALONE_OUTPUTS, deriveStandaloneOutputsFromStrips, normalizeStandaloneOutputs, totalStandalonePixels } from './standaloneController.js';
import { normalizeCardVisualLook } from './cardVisualLook.js';
import { getCardPatternById, getCardPatternRuntimeId, orderedCardPatterns } from './cardPatternBank.js';
import { applySavedLookToPatchBoard, deriveSectionTargets, normalizeSavedLooks } from './sectionLookModel.js';
import { chainAddressCount } from './patchBoard.js';
import { compileWiring } from './wiringCompiler.js';
import { colorJourneyLayoutKey, compileColorJourneyNativeRecipe, normalizeStoredNativeColorJourney } from './colorJourneyNative.js';
import {
  buildCardPlaylistConfig,
  CARD_PLAYLIST_LIMIT,
  derivePlaylistLookIds,
  isDefaultPatternCycle,
  isImplicitDefaultPatternPlaylist,
  normalizeCardPlaylist,
  normalizePlaylistTiming,
} from './cardPlaylist.js';
import { normalizePatternLabSequenceAssets } from './patternLabHandoff.js';

export function totalProjectPixels(strips = []) {
  return strips.reduce((sum, strip) => sum + (strip.pixels?.length || strip.pixelCount || strip.leds || 0), 0);
}

export function totalPhysicalAddresses(patchBoard, strips = []) {
  const sourcePixels = totalProjectPixels(strips);
  return patchBoard ? Math.max(sourcePixels, chainAddressCount(patchBoard, strips)) : sourcePixels;
}

export function buildCardRuntimePackageFromProject({
  projectId = '',
  projectName = 'Lightweaver Piece',
  projectRevision,
  projectFingerprint,
  productionJobId,
  productionJobDigest,
  strips = [],
  patchBoard = null,
  wiring = null,
  compiledWiring = null,
  symSettings = null,
  standaloneController = {},
} = {}) {
  const usesKaleidoscope = strips.some(strip => strip?.kaleidoscope?.enabled === true);
  if (usesKaleidoscope && !compiledWiring && !wiring) {
    throw new Error('Kaleidoscope card setup requires current project wiring so its standalone mapping can be compiled safely.');
  }
  const compiled = compiledWiring || (wiring ? compileWiring({ wiring, strips }) : null);
  if (compiled && !compiled.ok) throw new Error(compiled.errors.map(error => error.message).join(' '));
  const totalPixels = compiled?.totalPixels ?? totalPhysicalAddresses(patchBoard, strips);
  const configuredOutputs = standaloneController?.outputs || [];
  const configuredOutputPixels = totalStandalonePixels(configuredOutputs);
  // A freshly-created project carries the one-pixel controller default even
  // after artwork has been added. Treat output topology as intentional only
  // when it accounts for the actual project; otherwise derive it from strips.
  const explicitOutputLayout = configuredOutputPixels > 0
    && configuredOutputs.length > 0
    && (!totalPixels || configuredOutputPixels === totalPixels);
  const resolvedPixels = compiled
    ? compiled.totalPixels
    : explicitOutputLayout
    ? configuredOutputPixels
    : (totalPixels || configuredOutputPixels || DEFAULT_CARD_LED.pixels);
  const outputs = compiled?.outputs || resolveCardOutputs({
    strips,
    configuredOutputs,
    resolvedPixels,
  });
  const visualLook = normalizeCardVisualLook(standaloneController?.defaultLook);
  // Project-only Lab entries belong in Studio's Patterns library but have not
  // passed the card boundary. Exclude them before playlist normalization and
  // runtime compilation even if a stale or hand-edited project references one.
  const savedLooks = normalizeSavedLooks(standaloneController?.looks)
    .filter(look => look.projectOnly !== true);
  const sequenceAssets = normalizePatternLabSequenceAssets(standaloneController?.sequenceAssets);
  const legacyCycleIds = Array.isArray(standaloneController?.controls?.encoder?.patternCycleIds) &&
    !isDefaultPatternCycle(standaloneController.controls.encoder.patternCycleIds)
    ? standaloneController.controls.encoder.patternCycleIds
    : [];
  const rawPlaylist = isImplicitDefaultPatternPlaylist(standaloneController?.playlist)
    ? []
    : standaloneController?.playlist;
  for (const item of rawPlaylist || []) {
    if (item?.enabled === false || (item?.type !== 'sequence' && !item?.sequenceAssetId)) continue;
    const asset = sequenceAssets.find(candidate => candidate.id === item.sequenceAssetId);
    if (!asset?.mediaRef || asset.mediaRef.sha256 !== asset.manifest.lwseqSha256) {
      throw new Error(`Playlist recording “${item.label || item.sequenceAssetId}” has missing media. Restore the original project backup or record it again.`);
    }
  }
  const zones = compiled?.zones || (patchBoard ? patchBoardToZones(patchBoard, strips) : []);
  const runtimeZones = zones.length ? applyVisualLookDefaultsToZones(zones, patchBoard, visualLook, compiled, strips) : [{
    id: 'full-piece',
    label: 'Full Piece',
    patternId: getCardPatternRuntimeId(visualLook.patternId) || visualLook.patternId,
    brightness: visualLook.brightness,
    speed: visualLook.speed,
    hueShift: visualLook.hueShift,
    customHue: visualLook.customHue,
    customSaturation: visualLook.customSaturation,
    customBreathe: visualLook.customBreathe,
    breatheLowerPct: visualLook.breatheLowerPct,
    breatheUpperPct: visualLook.breatheUpperPct,
    breatheCycleSeconds: visualLook.breatheCycleSeconds,
    customDrift: visualLook.customDrift,
    ranges: [{ start: 0, count: resolvedPixels }],
  }];
  const playlist = normalizeCardPlaylist(rawPlaylist, {
    savedLooks,
    sequenceAssets,
    fallbackPatternIds: [visualLook.patternId, ...legacyCycleIds],
  });
  // The playlist-wide "played on the card" settings (fadeMs, whether the card
  // auto-plays it) live at controls.playlist — see cardPlaylist.js's
  // normalizePlaylistTiming doc comment for why they are stored there rather
  // than as a bare standaloneController field.
  const playlistTiming = normalizePlaylistTiming(standaloneController?.controls?.playlist);
  const playlistConfig = buildCardPlaylistConfig(playlist, savedLooks, playlistTiming, sequenceAssets);
  const looks = buildRuntimeLooksFromPlaylist({
    playlist,
    savedLooks,
    sequenceAssets,
    patchBoard,
    strips,
    runtimeZones,
    visualLook,
    compiled: Boolean(compiled),
    compiledWiring: compiled,
    strips,
    wiring,
    symSettings,
  });
  // A plain startup look replaces every zone's pattern at boot. When sections
  // have different appearances, give a non-autoplay project a startup combo
  // that reproduces them. An enabled playlist deliberately chooses its own
  // first look and timing, so its startup selection remains authoritative.
  const sectionLooks = zoneLooksFromZones(runtimeZones);
  const appearance = ({ id, label, ...look }) => JSON.stringify(look);
  const hasIndependentLooks = new Set(sectionLooks.map(appearance)).size > 1;
  const firstPlainPattern = looks[0]?.preset;
  const plainStartupWouldChangeSections = runtimeZones.some(zone => (
    zone.patternId !== firstPlainPattern || zone.blackout === true
  ));
  const hasAuthoredSectionLook = (patchBoard?.patches || []).some(patch => (
    patch.playback && Object.values(patch.playback).some(value => value !== undefined && value !== null)
  ));
  let startupPatternId = looks[0]?.id || visualLook.patternId;
  if ((hasIndependentLooks || (hasAuthoredSectionLook && plainStartupWouldChangeSections))
    && !playlistTiming.enabled && looks[0]?.mode !== 'combo') {
    if (looks.length >= CARD_PLAYLIST_LIMIT) {
      throw new RangeError('The card has no room for a combined startup look. Remove one playlist look and try again.');
    }
    const usedIds = new Set(looks.map(look => look.id));
    let id = 'lightweaver-section-layout';
    for (let suffix = 2; usedIds.has(id); suffix += 1) id = `lightweaver-section-layout-${suffix}`;
    looks.push({
      id,
      label: 'Current sections',
      mode: 'combo',
      preset: getCardPatternRuntimeId(visualLook.patternId) || visualLook.patternId,
      brightness: 1,
      zones: sectionLooks,
    });
    startupPatternId = id;
  }
  const requestedPatternIds = [
    visualLook.patternId,
    ...runtimeZones.map(zone => zone.patternId),
    ...looks.flatMap(look => [look.preset, ...(look.zones || []).map(zone => zone.patternId)]),
  ];
  const patterns = resolvePackagePatterns(standaloneController, requestedPatternIds);

  const runtimePackage = makeCardRuntimePackage({
    projectId,
    projectName,
    projectRevision,
    projectFingerprint,
    productionJobId,
    productionJobDigest,
    mode: 'website-flash',
    led: {
      type: standaloneController?.led?.type,
      pixels: resolvedPixels,
      colorOrder: standaloneController?.led?.colorOrder,
      brightnessLimit: standaloneController?.led?.brightnessLimit,
      maxMilliamps: standaloneController?.led?.maxMilliamps,
      outputGammaEnabled: standaloneController?.led?.outputGammaEnabled,
      outputGammaValue: standaloneController?.led?.outputGammaValue,
      calibration: standaloneController?.led?.calibration,
      outputs: outputs.length
        ? outputs.map((output, index) => ({
            id: output.id || `out${index + 1}`,
            name: output.name || `Output ${index + 1}`,
            pin: output.pin,
            pixels: output.pixels,
            direction: output.direction || 'forward',
            segments: output.segments || [{ id: `${output.id || `out${index + 1}`}-full`, count: output.pixels, direction: output.direction || 'forward' }],
          }))
        : undefined,
    },
    controls: cardSafeControls(standaloneController?.controls, playlist),
    patterns,
    looks,
    startupPatternId,
    zones: runtimeZones,
    kaleidoscopeMappings: compiled?.kaleidoscopeMappings,
    syncZones: runtimeZones.length <= 1,
    playlist: playlistConfig,
  });
  const mediaAssets = playlist.filter(item => item.type === 'sequence' && item.enabled !== false)
    .map(item => sequenceAssets.find(asset => asset.id === item.sequenceAssetId));
  return mediaAssets.length ? { ...runtimePackage, mediaAssets } : runtimePackage;
}

function cardSafeControls(controls = {}, playlist = []) {
  const playlistLookIds = derivePlaylistLookIds(playlist);
  const playlistLookIdSet = new Set(playlistLookIds);
  const configuredCycleIds = Array.isArray(controls?.encoder?.patternCycleIds)
    ? controls.encoder.patternCycleIds
    : [];
  const safeConfiguredCycleIds = configuredCycleIds.filter(id => (
    getCardPatternById(id) || playlistLookIdSet.has(id)
  ));
  return {
    ...(controls || {}),
    encoder: {
      ...(controls?.encoder || {}),
      patternCycleIds: safeConfiguredCycleIds.length
        ? safeConfiguredCycleIds
        : playlistLookIds.length
        ? playlistLookIds
        : DEFAULT_CARD_CONTROLS.encoder.patternCycleIds,
    },
  };
}

function resolveCardOutputs({ strips = [], configuredOutputs = [], resolvedPixels = DEFAULT_CARD_LED.pixels } = {}) {
  const normalizedConfigured = normalizeStandaloneOutputs(configuredOutputs);
  const configuredPixelTotal = normalizedConfigured.reduce((sum, output) => sum + output.pixels, 0);
  const pixels = Math.max(1, Math.floor(Number(resolvedPixels) || DEFAULT_CARD_LED.pixels));

  if (normalizedConfigured.length > 0 && configuredPixelTotal === pixels) {
    return retainOutputTopology(normalizedConfigured, configuredOutputs);
  }

  const configuredPins = (configuredOutputs || []).map(output => ({ ...output, pixels: 0 }));
  const derivedOutputs = deriveStandaloneOutputsFromStrips(strips, configuredPins);
  const derivedPixelTotal = derivedOutputs.reduce((sum, output) => sum + output.pixels, 0);
  if (derivedOutputs.length > 0 && derivedPixelTotal === pixels) {
    return derivedOutputs;
  }

  const firstOutput = normalizedConfigured[0] || configuredOutputs[0] || DEFAULT_CARD_LED.outputs[0];
  return [{
    id: 'out1',
    name: 'Output 1',
    pin: firstOutput.pin ?? DEFAULT_CARD_LED.outputs[0].pin,
    pixels,
    direction: firstOutput.direction || 'forward',
    segments: firstOutput.segments || [{ id: 'out1-full', count: pixels, direction: firstOutput.direction || 'forward' }],
  }];
}

function retainOutputTopology(outputs, configuredOutputs) {
  return outputs.map((output, index) => {
    const source = configuredOutputs.find(candidate => candidate?.id === output.id) || configuredOutputs[index] || {};
    return {
      ...output,
      direction: source.direction || 'forward',
      segments: Array.isArray(source.segments) && source.segments.length
        ? source.segments.map((segment, segmentIndex) => ({
            id: segment.id || `${output.id}-segment-${segmentIndex + 1}`,
            count: segment.count,
            direction: segment.direction || 'forward',
          }))
        : [{ id: `${output.id}-full`, count: output.pixels, direction: source.direction || 'forward' }],
    };
  });
}

function resolvePackagePatterns(standaloneController = {}, requestedPatternIds = []) {
  const configuredCycle = standaloneController?.controls?.encoder?.patternCycleIds;
  const requested = Array.isArray(configuredCycle) &&
    configuredCycle.length &&
    !isDefaultPatternCycle(configuredCycle)
    ? configuredCycle
    : [];
  const ids = [
    ...requestedPatternIds,
    ...requested,
  ].filter(Boolean);
  return orderedCardPatterns(ids);
}

function buildRuntimeLooksFromPlaylist({
  playlist = [],
  savedLooks = [],
  sequenceAssets = [],
  patchBoard = null,
  strips = [],
  runtimeZones = [],
  visualLook = {},
  compiled = false,
  compiledWiring = null,
  wiring = null,
  symSettings = null,
} = {}) {
  const savedLookById = new Map(savedLooks.map(look => [look.id, look]));
  const sequenceAssetById = new Map(sequenceAssets.map(asset => [asset.id, asset]));
  const patchIdByZoneId = new Map(compiledWiring?.ok ? deriveSectionTargets({
    strips, patchBoard, compiledWiring, defaultLook: visualLook,
  }).filter(target => target.kind === 'section').map(target => [target.zoneId, target.patchId]) : []);
  return (playlist || [])
    .filter(item => item?.enabled !== false)
    .map(item => {
      if (item.type === 'sequence') {
        const asset = sequenceAssetById.get(item.sequenceAssetId);
        if (!asset?.mediaRef) return null;
        return {
          id: item.id, label: item.label || asset.label,
          mode: 'sequence', file: asset.file, fps: asset.manifest.fps,
          loop: true, brightness: 1,
          bytes: asset.byteLength, sha256: asset.manifest.lwseqSha256,
        };
      }
      if (item.type === 'combo') {
        const savedLook = savedLookById.get(item.lookId);
        if (!savedLook) return null;
        const comboDefault = normalizeCardVisualLook(savedLook.defaultLook);
        if (savedLook.patternLabRecipe?.base?.kind === 'color-journey') {
          const compiledNative = compileColorJourneyNativeRecipe({
            id: item.id,
            recipe: savedLook.patternLabRecipe,
            strips,
            wiring,
            compiledWiring,
            symSettings,
          });
          const retainedNative = savedLook.nativeRecipe
            && savedLook.nativeRecipeLayoutKey === colorJourneyLayoutKey({ strips, wiring })
            ? normalizeStoredNativeColorJourney(savedLook.nativeRecipe, runtimeZones.reduce((sum, zone) => sum + (zone.ranges || []).reduce((n, range) => n + range.count, 0), 0) || undefined)
            : null;
          return {
            id: item.id,
            label: item.label || savedLook.label,
            mode: 'procedural',
            preset: item.id,
            brightness: 1,
            zones: zoneLooksFromZones(runtimeZones).map(zone => ({
              ...zone,
              patternId: item.id,
              brightness: comboDefault.brightness,
              speed: 1,
              hueShift: 0,
              customBreathe: false,
              customDrift: false,
            })),
            nativeRecipe: retainedNative
              ? { ...compiledNative, journey: { ...retainedNative.journey, stops: compiledNative.journey.stops, easing: compiledNative.journey.easing, loop: compiledNative.journey.loop, motionSpeedMs: compiledNative.journey.motionSpeedMs, depth: compiledNative.journey.depth } }
              : compiledNative,
          };
        }
        const effectiveZones = compiled
          ? runtimeZones.map(zone => applyLookFieldsToZone(
              zone,
              normalizeCardVisualLook(savedLook.sectionLooks?.[patchIdByZoneId.get(zone.id)] || savedLook.sectionLooks?.[zone.id] || comboDefault),
            ))
          : (() => {
              const comboBoard = applySavedLookToPatchBoard({ patchBoard, strips, savedLook });
              const comboZones = patchBoardToZones(comboBoard, strips);
              return comboZones.length
                ? applyVisualLookDefaultsToZones(comboZones, comboBoard, comboDefault)
                : runtimeZones.map(zone => applyLookFieldsToZone(zone, comboDefault));
            })();
        return {
          id: item.id,
          label: item.label || savedLook.label,
          mode: 'combo',
          preset: getCardPatternRuntimeId(comboDefault.patternId) || comboDefault.patternId,
          brightness: 1,
          zones: zoneLooksFromZones(effectiveZones),
        };
      }

      const pattern = getCardPatternById(item.patternId);
      if (!pattern) return null;
      const runtimePatternId = getCardPatternRuntimeId(pattern);
      return {
        id: item.id || pattern.id,
        label: item.label || pattern.label,
        mode: pattern.mode === 'preset' ? 'preset' : 'procedural',
        preset: runtimePatternId,
        brightness: 1,
      };
    })
    .filter(Boolean);
}

function applyLookFieldsToZone(zone, look) {
  return {
    ...zone,
    patternId: getCardPatternRuntimeId(look.patternId) || look.patternId,
    brightness: look.brightness,
    speed: look.speed,
    hueShift: look.hueShift,
    customHue: look.customHue,
    customSaturation: look.customSaturation,
    customBreathe: look.customBreathe,
    breatheLowerPct: look.breatheLowerPct,
    breatheUpperPct: look.breatheUpperPct,
    breatheCycleSeconds: look.breatheCycleSeconds,
    customDrift: look.customDrift,
  };
}

function zoneLooksFromZones(zones = []) {
  return zones.map(zone => ({
    id: zone.id,
    label: zone.label,
    patternId: zone.patternId,
    brightness: zone.brightness,
    speed: zone.speed,
    hueShift: zone.hueShift,
    customHue: zone.customHue,
    customSaturation: zone.customSaturation,
    customBreathe: zone.customBreathe,
    breatheLowerPct: zone.breatheLowerPct,
    breatheUpperPct: zone.breatheUpperPct,
    breatheCycleSeconds: zone.breatheCycleSeconds,
    customDrift: zone.customDrift,
  }));
}

function applyVisualLookDefaultsToZones(zones, patchBoard, visualLook, compiled = null, strips = []) {
  const patchesById = new Map((patchBoard?.patches || []).map(patch => [patch.id, patch]));
  const patchIdByZoneId = new Map(compiled?.ok ? deriveSectionTargets({
    strips, patchBoard, compiledWiring: compiled, defaultLook: visualLook,
  }).filter(target => target.kind === 'section').map(target => [target.zoneId, target.patchId]) : []);
  const playbackByPatchId = new Map((patchBoard?.patches || []).map(patch => [
    sanitizeId(patch.id || ''),
    patch.playback || {},
  ]));
  return zones.map(zone => {
    const patchId = patchIdByZoneId.get(zone.id);
    const playback = (patchId ? patchesById.get(patchId)?.playback : playbackByPatchId.get(zone.id)) || {};
    const displayPatternId = hasExplicit(playback.patternId) ? playback.patternId : visualLook.patternId;
    return {
      ...zone,
      patternId: getCardPatternRuntimeId(displayPatternId) || displayPatternId,
      brightness: hasExplicit(playback.brightness) ? playback.brightness : visualLook.brightness,
      speed: hasExplicit(playback.speed) ? playback.speed : visualLook.speed,
      hueShift: hasExplicit(playback.hueShift) ? playback.hueShift : visualLook.hueShift,
      customHue: hasExplicit(playback.customHue) ? playback.customHue : visualLook.customHue,
      customSaturation: hasExplicit(playback.customSaturation) ? playback.customSaturation : visualLook.customSaturation,
      customBreathe: hasExplicit(playback.customBreathe) ? playback.customBreathe : visualLook.customBreathe,
      breatheLowerPct: hasExplicit(playback.breatheLowerPct) ? playback.breatheLowerPct : visualLook.breatheLowerPct,
      breatheUpperPct: hasExplicit(playback.breatheUpperPct) ? playback.breatheUpperPct : visualLook.breatheUpperPct,
      breatheCycleSeconds: hasExplicit(playback.breatheCycleSeconds) ? playback.breatheCycleSeconds : visualLook.breatheCycleSeconds,
      customDrift: hasExplicit(playback.customDrift) ? playback.customDrift : visualLook.customDrift,
    };
  });
}

function hasExplicit(value) {
  return value !== undefined && value !== null && value !== '';
}

function sanitizeId(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
