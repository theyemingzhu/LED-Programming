import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createDefaultProject, migrateProject, resolveStartupProject } from './projectModel.js';
import { importProjectFromPickedFile } from './projectTransfer.js';
import { readRestorableProjectJson } from './projectStorage.js';
import { compileWiring } from './wiringCompiler.js';

const readFixture = path => JSON.parse(readFileSync(new URL(`../../tests/fixtures/${path}`, import.meta.url)));
const historical = version => readFixture(`project-compatibility/v${version}-7d77a2c3.json`);

for (const version of [1, 2]) {
  test(`opens authentic v${version} Studio output and makes it idempotent`, () => {
    const source = historical(version);
    assert.equal(source.version, version);
    assert.equal(source.id, undefined);
    const project = migrateProject(source);
    assert.equal(project.version, 3);
    assert.match(project.id, /^lwproj-/);
    assert.equal(project.layout.svgText, source.svgText);
    assert.equal(project.layout.viewBox, '0 0 400 400');
    assert.deepEqual(project.layout.strips.map(strip => [strip.sourceLayerId, strip.pixelCount, strip.reversed]), [
      ['wedge-0', 9, true],
    ]);
    const compiled = compileWiring({ wiring: project.layout.wiring, strips: project.layout.strips });
    assert.equal(compiled.ok, true);
    assert.deepEqual(compiled.outputs.map(output => [output.pin, output.count]), [[16, 9]]);
    assert.deepEqual(migrateProject(JSON.parse(JSON.stringify(project))), project);
  });
}

test('preserves archived v3 project identity, physical wiring, sections and look order', () => {
  const original = readFixture('real-card-bench-2026-11-21/nov19-restore.lw.json');
  const restored = migrateProject(original);
  assert.equal(restored.id, 'lightweaver-bench-discovery-v1');
  assert.equal(restored.origin.kind, 'card-partial');
  assert.deepEqual(restored.layout.wiring.outputs, original.layout.wiring.outputs);
  assert.deepEqual(restored.layout.wiring.runs, original.layout.wiring.runs);
  assert.deepEqual(restored.layout.patchBoard.patches, original.layout.patchBoard.patches);
  assert.deepEqual(restored.layout.strips.map(strip => strip.pixelCount), [11, 5, 10, 10, 5]);
  assert.deepEqual(restored.devices.standaloneController.looks.map(look => look.label), [
    'Sparkle', 'Outer circle Aurora + Inner circle Aurora', 'Aurora', 'Twinkle', 'Current sections',
  ]);
  assert.deepEqual(restored.devices.standaloneController.playlist.map(look => look.id),
    original.devices.standaloneController.playlist.map(look => look.id));
  assert.deepEqual(migrateProject(JSON.parse(JSON.stringify(restored))), restored);
});

test('browser startup keeps intentionally empty current or artwork-only work ahead of old layout', () => {
  const legacyLayoutProject = historical(2);
  const savedProject = createDefaultProject();
  savedProject.layout.starterPending = false;
  savedProject.layout.strips = [];
  assert.equal(resolveStartupProject({ savedProject, legacyLayoutProject }).layout.strips.length, 0);
  savedProject.layout.svgText = '<svg viewBox="0 0 20 20"><path d="M1 1H19"/></svg>';
  savedProject.layout.starterPending = true;
  assert.equal(resolveStartupProject({ savedProject, legacyLayoutProject }).layout.svgText, savedProject.layout.svgText);
  savedProject.layout.svgText = null;
  savedProject.devices.standaloneController.playlist = [
    { id: 'personal-aurora', type: 'pattern', patternId: 'aurora', label: 'My Aurora', enabled: true, order: 0 },
  ];
  const playlistOnly = resolveStartupProject({ savedProject, legacyLayoutProject });
  assert.equal(playlistOnly.layout.strips.length, 0);
  assert.equal(playlistOnly.devices.standaloneController.playlist[0].label, 'My Aurora');
  assert.equal(resolveStartupProject({ legacyLayoutProject }).layout.strips.length, 1);
});

test('a throwing primary migration falls back to a readable legacy backup', () => {
  const backup = JSON.stringify(historical(1));
  const broken = JSON.stringify({ version: 2, strips: [], layers: [null] });
  const copies = new Map([['primary', broken], ['backup', backup]]);
  const result = readRestorableProjectJson('primary', 'backup', { storage: { getItem: key => copies.get(key) } });
  assert.equal(result.restoredFrom, 'backup');
  assert.deepEqual(result.primaryFailure, { reason: 'invalid', raw: broken });
  assert.equal(copies.get('primary'), broken);
});

test('future project and envelope versions and non-project JSON stop before replacement', async () => {
  const valid = createDefaultProject();
  const options = data => ({
    readProjectFile: async (_file, parse) => parse(data),
    replaceProject: () => assert.fail('must not replace the current workspace'),
    clearBrowserAssociation: () => assert.fail('must not detach the active record'),
  });
  await assert.rejects(importProjectFromPickedFile({}, options({ ...valid, version: 99 })), /newer Lightweaver Studio/);
  await assert.rejects(importProjectFromPickedFile({}, options({ envelopeVersion: 2, project: valid })), /newer Lightweaver Studio/);
  assert.deepEqual(await importProjectFromPickedFile({}, options({ version: 3 })), { ok: false, reason: 'invalid' });
  assert.deepEqual(await importProjectFromPickedFile({}, options({ ...valid, layout: { strips: {} } })), { ok: false, reason: 'invalid' });
});
