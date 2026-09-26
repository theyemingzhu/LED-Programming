import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import {
  MAX_PATTERN_LAB_SEQUENCE_ASSETS,
  applyPatternLabHandoff,
  createPatternLabHandoff,
  normalizePatternLabSequenceAssets,
} from './patternLabHandoff.js';
import { classifyPatternLabCompatibility } from './patternLabCompatibility.js';
import { CARD_HARDWARE_CONTRACT } from './cardHardwareContract.js';
import { bakePatternLabRecipe, canonicalPatternLabBakeJson } from './lwseqBake.js';
import { recipeFromSequenceAsset } from './patternLabFromLook.js';
import { createDefaultProject, migrateProject } from './projectModel.js';
import { MAX_SAVED_LOOKS } from './sectionLookModel.js';
import { LWSEQ_HEADER_BYTES } from './standaloneController.js';

function recipe(overrides = {}) {
  return {
    version: 1,
    id: 'pattern-lab-aurora-journey',
    name: 'Aurora Journey',
    base: { kind: 'lightweaver-pattern', patternId: 'aurora', params: {} },
    palette: ['#102040', '#f0a060'],
    macros: { color: 0.6, movement: 0.45, shape: 0.5, texture: 0.5, energy: 0.7 },
    evolution: { enabled: false, character: 'slow-bloom', durationSeconds: 300, change: 0.35 },
    seed: 17,
    layers: [],
    targets: [{ kind: 'whole-piece', id: 'all' }],
    requirements: [],
    provenance: [],
    ...overrides,
  };
}

function compatibilityFor(source) {
  return classifyPatternLabCompatibility(source, {
    metrics: {
      pixelCount: 1,
      fps: 1,
      operationsPerFrame: 100,
      stateBytes: 256,
      framebufferBytes: 3,
      nativeConfigBytes: 256,
      microSdBytes: 1_000_000,
    },
  });
}

function compatibility(classification, reasons = []) {
  const result = compatibilityFor(recipe());
  return structuredClone({
    ...result,
    classification,
    reasons,
    actions: classification === 'bake-to-card'
      ? [{ id: 'bake', label: 'Bake to card', kind: 'bake' }]
      : [],
  });
}

const strips = [{ id: 'main', name: 'Main', pixels: [{ x: 0, y: 0 }] }];
const wiring = {
  version: 1,
  locked: true,
  verified: true,
  outputs: [{ id: 'main', name: 'Main', pin: 16, runIds: ['main-run'] }],
  runs: [{
    id: 'main-run',
    type: 'strip',
    verified: true,
    source: { stripId: 'main', from: 0, to: 0 },
    directionPolicy: 'fixed',
    physicalDirection: 'source-forward',
    seamLed: null,
  }],
};

const bakedRecipe = recipe({
  evolution: { enabled: true, character: 'slow-bloom', durationSeconds: 300, change: 0.35 },
});
const baked = await bakePatternLabRecipe({ recipe: bakedRecipe, strips, wiring, fps: 1 });
const bakedContext = { strips, wiring };

test('creates a new normalized look handoff without changing the recipe', async () => {
  const source = recipe();
  const before = JSON.stringify(source);
  const result = await createPatternLabHandoff({
    recipe: source,
    compatibility: compatibility('live-on-card'),
  });
  assert.equal(result.kind, 'look');
  assert.equal(result.look.label, 'Aurora Journey');
  assert.equal(result.look.defaultLook.patternId, 'aurora');
  assert.equal(JSON.stringify(source), before);
});

test('creates a project-only Patterns entry for a Studio-only recipe without granting card eligibility', async () => {
  const source = recipe({
    requirements: [{ capability: 'live-audio', required: true, bakeable: false }],
  });
  const before = JSON.stringify(source);
  const result = await createPatternLabHandoff({
    recipe: source,
    compatibility: compatibility('studio-only', [{ code: 'required-capability-unsupported', message: 'Live audio is unavailable on the card.' }]),
    projectLibraryOnly: true,
  });

  assert.equal(result.kind, 'project-look');
  assert.equal(result.look.label, 'Aurora Journey');
  assert.equal(result.look.projectOnly, true);
  assert.equal(result.look.patternLabClassification, 'studio-only');
  assert.equal(result.look.patternLabRecipe.requirements[0].capability, 'live-audio');
  assert.equal(JSON.stringify(source), before);

  const original = { defaultLook: { patternId: 'fire' }, looks: [] };
  const applied = await applyPatternLabHandoff(original, result);
  assert.deepEqual(applied.defaultLook, original.defaultLook, 'a project-only entry cannot replace the card default');
  assert.equal(applied.activeLookId, result.look.id);
  assert.equal(applied.looks[0].projectOnly, true);
});

test('procedural handoff copies direct playback brightness and speed', async () => {
  const source = recipe({
    version: 2,
    macros: { color: 0.6, movement: 0.45, shape: 0.5, texture: 0.5 },
    playback: { brightness: 0.42, speed: 1.7 },
    evolution: {
      enabled: false,
      character: 'slow-bloom',
      durationSeconds: 300,
      change: 0.35,
      dynamics: { dynamicRange: 0.55, rareEventStrength: 0.4 },
    },
  });
  const result = await createPatternLabHandoff({
    recipe: source,
    compatibility: compatibility('live-on-card'),
  });
  assert.equal(result.look.defaultLook.brightness, 0.42);
  assert.equal(result.look.defaultLook.speed, 1.7);
});

test('native Color Journey handoff validates current physical layout and preserves the authored recipe', async () => {
  const source = recipe({
    version: 2,
    base: { kind: 'color-journey', id: 'slow-color-drift', params: {} },
    journey: {
      version: 1,
      stops: [
        { id: 'red', color: '#ff0000', holdMs: 1_000, fadeMs: 2_000 },
        { id: 'blue', color: '#0000ff', holdMs: 1_000, fadeMs: 2_000 },
      ],
      easing: 'smooth', loop: false, motionSpeedSeconds: 18, character: 'balanced',
    },
    evolution: { enabled: false },
  });
  const result = await createPatternLabHandoff({
    recipe: source,
    compatibility: compatibilityFor(source),
    strips,
    wiring,
    cardEvidence: { recipeCapabilities: { colorJourney: { version: 1, maxPixels: 256, phaseEncoding: 'q0.16-hex', restart: 'restart' } } },
  });

  assert.equal(result.kind, 'look');
  assert.equal(result.look.patternLabRecipe.base.kind, 'color-journey');
  assert.equal(result.look.patternLabRecipe.journey.loop, false);
  assert.equal(result.look.nativeRecipe, undefined, 'layout-derived phase is compiled into the card package, not authored project state');

  const blocked = await createPatternLabHandoff({
    recipe: source,
    compatibility: compatibilityFor(source),
    strips,
    wiring: {
      ...wiring,
      outputs: [{ ...wiring.outputs[0], runIds: ['main-run', 'hole'] }],
      runs: [...wiring.runs, { id: 'hole', type: 'inactive', count: 1, verified: true }],
    },
    cardEvidence: { recipeCapabilities: { colorJourney: { version: 1, maxPixels: 256, phaseEncoding: 'q0.16-hex', restart: 'restart' } } },
  });
  assert.equal(blocked.kind, 'blocked');
  assert.equal(blocked.reasons[0].code, 'look-unsupported');
});

test('fails closed on versionless or malformed compatibility results', async () => {
  const cases = [
    { classification: 'live-on-card', reasons: [] },
    { ...compatibility('live-on-card'), version: 99 },
    { ...compatibility('live-on-card'), descriptor: null },
    { ...compatibility('live-on-card'), budgets: null },
    { ...compatibility('live-on-card'), budgets: {} },
    { ...compatibility('live-on-card'), descriptor: { id: {}, version: 1 } },
    { ...compatibility('studio-only'), reasons: [null] },
    { ...compatibility('unknown-target'), classification: 'unknown-target' },
  ];
  for (const candidate of cases) {
    const result = await createPatternLabHandoff({ recipe: recipe(), compatibility: candidate });
    assert.equal(result.kind, 'blocked');
    assert.equal(result.reasons[0].code, 'compatibility-invalid');
  }
});

test('a stale live classification cannot flatten evolution or layers into a static look', async () => {
  const cases = [
    bakedRecipe,
    recipe({
      layers: [{
        id: 'glow-layer',
        name: 'Glow layer',
        enabled: true,
        opacity: 0.5,
        blendMode: 'normal',
        generator: { kind: 'lightweaver-pattern', patternId: 'fire', params: {} },
        transforms: [],
        mask: null,
        target: { kind: 'whole-piece', id: 'all' },
      }],
    }),
  ];
  for (const source of cases) {
    const result = await createPatternLabHandoff({
      recipe: source,
      compatibility: compatibility('live-on-card'),
    });
    assert.equal(result.kind, 'blocked');
    assert.equal(result.reasons[0].code, 'look-unsupported');
  }
});

test('creates a complete sequence package from the canonical bake result', async () => {
  const result = await createPatternLabHandoff({
    recipe: bakedRecipe,
    compatibility: compatibilityFor(bakedRecipe),
    bakeResult: baked,
    ...bakedContext,
  });
  assert.equal(result.kind, 'sequence');
  assert.equal(result.manifest.lwseqSha256, baked.sidecar.lwseqSha256);
  assert.equal(result.asset.assetRef, `sha256:${baked.sidecar.lwseqSha256}`);
  assert.equal(result.look.mode, 'sequence');
  assert.equal(result.look.file, result.asset.file);
  assert.equal(result.package.app, 'Lightweaver');
  assert.equal(result.package.format, 'standalone-controller-package');
  assert.equal(result.package.version, 1);
  assert.equal(result.package.files[result.asset.file].encoding, 'base64');
  assert.equal(result.package.files[result.asset.file].bytes, baked.bytes.byteLength);
  assert.deepEqual(
    new Uint8Array(Buffer.from(result.package.files[result.asset.file].data, 'base64')),
    baked.bytes,
  );
  assert.equal(result.package.files[result.asset.sidecarFile], `${baked.sidecarJson}\n`);
  assert.equal(result.package.files['/lightweaver.json'].runtimeMode, 'sd-sequence');
  assert.equal(result.package.files['/lightweaver.json'].looks[0].file, result.asset.file);
  assert.notEqual(result.package.files[result.asset.file], baked.bytes);
});

test('a sequence output may be as long as the card, while the file budget stays its own bound', async () => {
  const result = await createPatternLabHandoff({
    recipe: bakedRecipe,
    compatibility: compatibilityFor(bakedRecipe),
    bakeResult: baked,
    ...bakedContext,
  });
  // 2000 sits past the old 1024 wiring literal and inside the .lwseq storage
  // budget, so it separates the two ceilings cleanly: the card's pixel count is
  // contract-driven, the file size is not.
  const pixels = 2_000;
  const frameCount = 4;
  const long = structuredClone(result.asset);
  long.manifest.pixelCount = pixels;
  long.manifest.frameCount = frameCount;
  long.byteLength = LWSEQ_HEADER_BYTES + pixels * frameCount * 3;
  long.outputs = [{ ...long.outputs[0], pixels }];
  const [normalized] = normalizePatternLabSequenceAssets([long]);
  assert.equal(normalized?.outputs[0].pixels, pixels);
  assert.ok(pixels <= CARD_HARDWARE_CONTRACT.maxPixels, 'the fixture must stay a length the card really accepts');

  // The file budget is a separate ceiling and still bites: a manifest asking
  // for more pixels than a sidecar may describe is dropped, contract or not.
  const oversizedFile = structuredClone(long);
  oversizedFile.manifest.pixelCount = 8_192;
  oversizedFile.outputs = [{ ...long.outputs[0], pixels: 8_192 }];
  oversizedFile.byteLength = LWSEQ_HEADER_BYTES + 8_192 * frameCount * 3;
  assert.deepEqual(normalizePatternLabSequenceAssets([oversizedFile]), []);
});

test('rejects incomplete, tampered, or stale-recipe bake results', async () => {
  const tamperedBytes = new Uint8Array(baked.bytes);
  tamperedBytes[tamperedBytes.length - 1] ^= 0xff;
  const stale = { ...structuredClone(bakedRecipe), seed: bakedRecipe.seed + 1 };
  const cases = [
    null,
    {},
    { ...baked, sidecarJson: '{}' },
    { ...baked, bytes: tamperedBytes },
    {
      ...baked,
      estimate: {
        totalBytes: baked.estimate.totalBytes,
        pixelCount: baked.estimate.pixelCount,
        frameCount: baked.estimate.frameCount,
        fps: baked.estimate.fps,
      },
    },
  ];
  for (const bakeResult of cases) {
    const result = await createPatternLabHandoff({
      recipe: bakedRecipe,
      compatibility: compatibilityFor(bakedRecipe),
      bakeResult,
    });
    assert.equal(result.kind, 'blocked');
    assert.match(result.reasons[0].code, /^bake-(?:required|invalid)$/);
  }
  const staleResult = await createPatternLabHandoff({
    recipe: stale,
    compatibility: compatibilityFor(stale),
    bakeResult: baked,
    ...bakedContext,
  });
  assert.equal(staleResult.kind, 'blocked');
  assert.equal(staleResult.reasons[0].code, 'bake-stale-recipe');
});

test('a finished bake cannot be handed off after physical artwork changes', async () => {
  const changedStrips = structuredClone(strips);
  changedStrips[0].pixels[0].x = 42;
  const result = await createPatternLabHandoff({
    recipe: bakedRecipe,
    compatibility: compatibilityFor(bakedRecipe),
    bakeResult: baked,
    strips: changedStrips,
    wiring,
  });
  assert.equal(result.kind, 'blocked');
  assert.equal(result.reasons[0].code, 'bake-stale-layout');
});

test('a stale canonical section mask cannot enter the project library through handoff', async () => {
  const layered = recipe({ layers: [{
    id: 'section-fire', name: 'Section fire', enabled: true, opacity: 0.5,
    blendMode: 'normal', generator: { kind: 'lightweaver-pattern', patternId: 'fire', params: {} },
    target: { kind: 'section', id: 'area-main', stripIds: ['main'] },
  }] });
  const result = await createPatternLabHandoff({
    recipe: layered, compatibility: compatibilityFor(layered), projectLibraryOnly: true,
    strips, sectionTargets: [{ kind: 'section', id: 'area-main', stripIds: ['different'] }],
  });
  assert.equal(result.kind, 'blocked');
  assert.equal(result.reasons[0].code, 'section-target-stale');
});

test('handoff refuses a layered recipe that would flatten different saved section bases', async () => {
  const layered = recipe({
    sourceLook: {
      defaultLook: { patternId: 'aurora', customHue: 10 },
      sectionLooks: { main: { patternId: 'fire', customHue: 240 } },
    },
    layers: [{ id: 'fire-over', name: 'Fire over', enabled: true, opacity: 0.4,
      blendMode: 'normal', generator: { kind: 'lightweaver-pattern', patternId: 'fire', params: {} },
      target: { kind: 'whole-piece', id: 'all' } }],
  });
  const result = await createPatternLabHandoff({
    recipe: layered, compatibility: compatibilityFor(layered), projectLibraryOnly: true,
  });
  assert.equal(result.kind, 'blocked');
  assert.equal(result.reasons[0].code, 'layer-base-mix-unsupported');
});

test('invalid, canceled, unsupported, and failed handoffs mutate nothing', async () => {
  const controller = { looks: [{ id: 'kept', label: 'Kept' }], sequenceAssets: [{ id: 'kept-sequence' }] };
  const source = recipe();
  const beforeController = JSON.stringify(controller);
  const beforeRecipe = JSON.stringify(source);
  const cases = await Promise.all([
    createPatternLabHandoff({ recipe: source, compatibility: null }),
    createPatternLabHandoff({ recipe: source, compatibility: compatibility('live-on-card'), cancelled: true }),
    createPatternLabHandoff({ recipe: source, compatibility: compatibility('studio-only', [{ code: 'unsupported', message: 'No card path' }]) }),
    createPatternLabHandoff({ recipe: source, compatibility: compatibility('bake-to-card'), exportError: new Error('bake failed') }),
  ]);
  for (const result of cases) {
    assert.equal(result.kind, 'blocked');
    assert.deepEqual(await applyPatternLabHandoff(controller, result), controller);
  }
  assert.equal(JSON.stringify(controller), beforeController);
  assert.equal(JSON.stringify(source), beforeRecipe);
});

test('applying a look never overwrites a built-in or existing saved look', async () => {
  const controller = {
    defaultLook: { patternId: 'fire' },
    activeLookId: 'aurora-journey',
    looks: [{ id: 'aurora-journey', label: 'Older Journey', defaultLook: { patternId: 'fire' } }],
  };
  const result = await createPatternLabHandoff({
    recipe: recipe({ id: 'aurora', name: 'Aurora Journey' }),
    compatibility: compatibility('live-on-card'),
    controller,
  });
  const next = await applyPatternLabHandoff(controller, result);
  assert.equal(next.looks.length, 2);
  assert.equal(next.looks[0].id, 'aurora-journey-2');
  assert.equal(next.looks[1].label, 'Older Journey');
  assert.equal(controller.looks.length, 1);
});

test('native look capacity blocks instead of evicting an existing look', async () => {
  const controller = {
    looks: Array.from({ length: MAX_SAVED_LOOKS }, (_, index) => ({
      id: `kept-${index + 1}`,
      label: `Kept ${index + 1}`,
      defaultLook: { patternId: 'aurora' },
    })),
  };
  const result = await createPatternLabHandoff({
    recipe: recipe(),
    compatibility: compatibility('live-on-card'),
    controller,
  });
  assert.equal(result.kind, 'blocked');
  assert.equal(result.reasons[0].code, 'look-capacity');
  assert.strictEqual(await applyPatternLabHandoff(controller, result), controller);

  const forged = { kind: 'look', look: { id: 'new', label: 'New', defaultLook: { patternId: 'fire' } } };
  assert.strictEqual(await applyPatternLabHandoff(controller, forged), controller);
  assert.equal(controller.looks.at(-1).id, `kept-${MAX_SAVED_LOOKS}`);
});

test('sequence apply stores only bounded metadata and a sequence look reference', async () => {
  const controller = { sequenceAssets: [] };
  const result = await createPatternLabHandoff({
    recipe: bakedRecipe,
    compatibility: compatibilityFor(bakedRecipe),
    bakeResult: baked,
    ...bakedContext,
    controller,
  });
  const next = await applyPatternLabHandoff(controller, result);
  assert.equal(next.sequenceAssets.length, 1);
  assert.equal(next.sequenceAssets[0].look.mode, 'sequence');
  assert.equal(next.sequenceAssets[0].look.file, next.sequenceAssets[0].file);
  assert.equal(next.sequenceAssets[0].manifest.lwseqSha256, baked.sidecar.lwseqSha256);
  assert.equal(next.activeSequenceAssetId, next.sequenceAssets[0].id);
  assert.ok(!/(?:package|base64|sidecarJson|\"bytes\"|\"data\")/i.test(JSON.stringify(next)));
  assert.equal(controller.sequenceAssets.length, 0);

  const tamperedResult = structuredClone(result);
  tamperedResult.package.files[result.asset.sidecarFile] = '{}\n';
  assert.strictEqual(await applyPatternLabHandoff(controller, tamperedResult), controller);

  const tamperedBytes = structuredClone(result);
  tamperedBytes.package.files[result.asset.file].data = Buffer.alloc(result.asset.byteLength, 0).toString('base64');
  assert.strictEqual(await applyPatternLabHandoff(controller, tamperedBytes), controller);

  const tamperedProfile = structuredClone(result);
  tamperedProfile.package.files['/lightweaver.json'].looks[0].file = '/sequences/other.lwseq';
  assert.strictEqual(await applyPatternLabHandoff(controller, tamperedProfile), controller);

  const cyclicResult = structuredClone(result);
  cyclicResult.manifest.self = cyclicResult.manifest;
  await assert.doesNotReject(() => applyPatternLabHandoff(controller, cyclicResult));
  assert.strictEqual(await applyPatternLabHandoff(controller, cyclicResult), controller);
});

test('recorded sequence reopens for exact Update or Save as New without becoming a native look', async () => {
  const layered = recipe({
    evolution: { enabled: true, character: 'slow-bloom', durationSeconds: 300, change: 0.35 },
    layers: [{ id: 'layer-fire', name: 'Fire', enabled: true, opacity: 0.3,
      blendMode: 'screen', generator: { kind: 'lightweaver-pattern', patternId: 'fire', params: {} },
      target: { kind: 'whole-piece', id: 'all' } }],
  });
  const layeredBake = await bakePatternLabRecipe({ recipe: layered, ...bakedContext, fps: 1 });
  const recorded = await createPatternLabHandoff({
    recipe: layered, compatibility: compatibilityFor(layered), bakeResult: layeredBake, ...bakedContext,
  });
  const first = await applyPatternLabHandoff({}, recorded);
  const reopened = await recipeFromSequenceAsset(first.sequenceAssets[0]);
  assert.equal(reopened.sourceSequenceAssetId, recorded.asset.id);
  assert.equal(reopened.sourceSequenceAssetSha256, recorded.asset.manifest.lwseqSha256);
  assert.deepEqual(reopened.layers, layeredBake.recipe.layers);
  assert.equal(reopened.layers[0].blendMode, 'screen');
  assert.equal(reopened.layers[0].opacity, 0.3);

  const changed = { ...reopened, name: 'Aurora revised', seed: reopened.seed + 1 };
  const revisedBake = await bakePatternLabRecipe({ recipe: changed, ...bakedContext, fps: 1 });
  const update = await createPatternLabHandoff({
    recipe: changed, compatibility: compatibilityFor(changed), bakeResult: revisedBake,
    ...bakedContext, controller: first,
  });
  assert.equal(update.kind, 'sequence');
  assert.equal(update.replaceSequenceAssetId, recorded.asset.id);
  const updated = await applyPatternLabHandoff(first, update);
  assert.equal(updated.sequenceAssets.length, 1);
  assert.equal(updated.sequenceAssets[0].id, recorded.asset.id);
  assert.equal(updated.sequenceAssets[0].manifest.recipe.seed, changed.seed);
  assert.equal(updated.looks, undefined);
  const conflictingUpdate = await createPatternLabHandoff({
    recipe: changed, compatibility: compatibilityFor(changed), bakeResult: revisedBake,
    ...bakedContext, controller: updated,
  });
  assert.equal(conflictingUpdate.kind, 'blocked');
  assert.equal(conflictingUpdate.reasons[0].code, 'sequence-source-changed');
  const project = createDefaultProject();
  project.devices.standaloneController = updated;
  const restoredProject = migrateProject(JSON.parse(JSON.stringify(project)));
  assert.deepEqual(restoredProject.devices.standaloneController.sequenceAssets[0].manifest.recipe.layers,
    updated.sequenceAssets[0].manifest.recipe.layers);

  const savedNew = await createPatternLabHandoff({
    recipe: changed, compatibility: compatibilityFor(changed), bakeResult: revisedBake,
    ...bakedContext, controller: updated, saveAsNew: true,
  });
  const withCopy = await applyPatternLabHandoff(updated, savedNew);
  assert.equal(withCopy.sequenceAssets.length, 2);
  assert.notEqual(withCopy.sequenceAssets[0].id, recorded.asset.id);
  assert.equal(withCopy.sequenceAssets[1].id, recorded.asset.id);
});

test('an older recording verifies its original idless layer hash before migration for editing', async () => {
  const source = recipe({
    evolution: { enabled: true, character: 'slow-bloom', durationSeconds: 300, change: 0.35 },
    layers: [{ id: 'old-layer', name: 'Old layer', enabled: true, opacity: 0.6,
      blendMode: 'normal', generator: { kind: 'lightweaver-pattern', patternId: 'fire', params: {} },
      target: { kind: 'whole-piece', id: 'all' } }],
  });
  const bakedSource = await bakePatternLabRecipe({ recipe: source, ...bakedContext, fps: 1 });
  const recorded = await createPatternLabHandoff({
    recipe: source, compatibility: compatibilityFor(source), bakeResult: bakedSource, ...bakedContext,
  });
  const old = structuredClone(recorded.asset);
  delete old.manifest.recipe.layers[0].id;
  const oldHash = createHash('sha256').update(canonicalPatternLabBakeJson(old.manifest.recipe)).digest('hex');
  old.manifest.recipeSha256 = oldHash;
  old.recipe.sha256 = oldHash;
  const reopened = await recipeFromSequenceAsset(old);
  assert.equal(reopened.layers[0].id, `layer-legacy-${source.id}-0`);
  assert.equal(reopened.sourceSequenceAssetId, old.id);
});

test('sequence metadata survives project JSON migration round trip and rejects unbounded data', async () => {
  const project = createDefaultProject();
  const result = await createPatternLabHandoff({
    recipe: bakedRecipe,
    compatibility: compatibilityFor(bakedRecipe),
    bakeResult: baked,
    ...bakedContext,
    controller: project.devices.standaloneController,
  });
  project.devices.standaloneController = await applyPatternLabHandoff(project.devices.standaloneController, result);
  project.devices.standaloneController.sequenceAssets.push({
    id: 'malformed',
    label: 'x'.repeat(10_000),
    package: result.package,
    bytes: Array.from(baked.bytes),
  });
  project.devices.standaloneController.sequenceAssets.push({
    ...project.devices.standaloneController.sequenceAssets[0],
    id: 'malformed-nested-output',
    file: '/sequences/malformed-nested-output.lwseq',
    sidecarFile: '/sequences/malformed-nested-output.lwseq.json',
    outputs: [null],
  });

  const migrated = migrateProject(JSON.parse(JSON.stringify(project)));
  const controller = migrated.devices.standaloneController;
  assert.equal(controller.sequenceAssets.length, 1);
  assert.deepEqual(controller.sequenceAssets[0], project.devices.standaloneController.sequenceAssets[0]);
  assert.equal(controller.activeSequenceAssetId, controller.sequenceAssets[0].id);
  assert.ok(JSON.stringify(controller).length < 4_000);
  assert.ok(!/(?:package|base64|sidecarJson|\"bytes\"|\"data\")/i.test(JSON.stringify(controller)));
});

test('sequence asset capacity blocks instead of evicting metadata', async () => {
  const seedResult = await createPatternLabHandoff({
    recipe: bakedRecipe,
    compatibility: compatibilityFor(bakedRecipe),
    bakeResult: baked,
    ...bakedContext,
  });
  const asset = (await applyPatternLabHandoff({}, seedResult)).sequenceAssets[0];
  const controller = {
    sequenceAssets: Array.from({ length: MAX_PATTERN_LAB_SEQUENCE_ASSETS }, (_, index) => ({
      ...asset,
      id: `kept-sequence-${index + 1}`,
      label: `Kept sequence ${index + 1}`,
      file: `/sequences/kept-sequence-${index + 1}.lwseq`,
      sidecarFile: `/sequences/kept-sequence-${index + 1}.lwseq.json`,
      look: {
        ...asset.look,
        id: `kept-sequence-${index + 1}`,
        label: `Kept sequence ${index + 1}`,
        file: `/sequences/kept-sequence-${index + 1}.lwseq`,
      },
    })),
  };
  const result = await createPatternLabHandoff({
    recipe: bakedRecipe,
    compatibility: compatibilityFor(bakedRecipe),
    bakeResult: baked,
    controller,
  });
  assert.equal(result.kind, 'blocked');
  assert.equal(result.reasons[0].code, 'sequence-capacity');
});

test('linked native Update preserves capacity, identity, playlist and portable editable recipe', async () => {
  const { recipeFromLook } = await import('./patternLabFromLook.js');
  const source = { id: 'mine', label: 'Mine', defaultLook: { patternId: 'aurora', customHue: 32, customSaturation: 0, hueShift: 80 } };
  const draft = { ...recipeFromLook(source), name: 'Renamed', evolution: { enabled: false } };
  const controller = { looks: [source, ...Array.from({ length: 11 }, (_, i) => ({ ...source, id: `other-${i}` }))], playlist: [{ id: 'first', type: 'combo', lookId: 'mine', label: 'Mine', dwellSeconds: 87 }] };
  const handoff = await createPatternLabHandoff({ recipe: draft, compatibility: compatibility('live-on-card'), controller });
  assert.equal(handoff.kind, 'look');
  assert.equal(handoff.replaceLookId, 'mine');
  const applied = await applyPatternLabHandoff(controller, handoff);
  assert.equal(applied.looks.length, 12);
  assert.equal(applied.activeLookId, 'mine');
  assert.equal(applied.playlist[0].label, 'Renamed');
  assert.equal(applied.playlist[0].dwellSeconds, 87);
  const project = createDefaultProject();
  project.devices.standaloneController = { ...project.devices.standaloneController, ...applied };
  const reopened = migrateProject(JSON.parse(JSON.stringify(project))).devices.standaloneController.looks.find(look => look.id === 'mine');
  assert.deepEqual(recipeFromLook(reopened).palette, draft.palette);
  assert.equal(reopened.defaultLook.customSaturation, 0);
  const duplicate = await createPatternLabHandoff({ recipe: draft, compatibility: compatibility('live-on-card'), controller, saveAsNew: true });
  assert.equal(duplicate.kind, 'blocked');
});
