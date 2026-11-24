// A designed look is Studio-only. These tests are the proof: with kept looks in
// the project, everything that builds the card's files is byte-identical to the
// same project without them, and nothing designed can enter the playlist.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { migrateProject, defaultStandaloneController } from './projectModel.js';
import { cardProjectFingerprint } from './cardProjectResolver.js';
import { prepareCardDeployment } from './cardDeployment.js';
import { prepareCardStoragePayload } from './cardStoragePayload.js';
import { normalizePatchBoard } from './patchBoard.js';
import { normalizeCardPlaylist, buildCardPlaylistConfig } from './cardPlaylist.js';
import { sha256Canonical } from './projectRepository.js';
import { addDesignedLook, areaRecordsOf, designedLooksProjectFields, layoutKeyOf, normalizeDesignedLooks } from './designedLooks.js';
import { buildPieceModel } from './lookEngine/model.js';
import { startingLooks } from './lookEngine/variations.js';
import { C, lotus } from './lookEngine/testFixtures.js';

const golden = JSON.parse(fs.readFileSync(new URL('./projectShapeGolden.fixture.json', import.meta.url), 'utf8'));
const model = buildPieceModel(lotus(), { fold: 6, centre: C });
const kept = addDesignedLook([], { name: 'Evening bloom', look: startingLooks(model.derived.areas)[0].look, areas: areaRecordsOf(model, {}), layoutKey: layoutKeyOf(model.derived, 6) }).looks;

const without = () => migrateProject(structuredClone(golden.input));
const withKept = () => migrateProject({ ...structuredClone(golden.input), ...designedLooksProjectFields(kept) });

function cardFiles(project) {
  const strips = project.layout.strips;
  const prepared = prepareCardDeployment({
    projectId: project.id, projectName: project.name, projectRevision: 3, strips,
    patchBoard: normalizePatchBoard(project.layout.patchBoard, strips), wiring: project.layout.wiring,
    symmetry: project.layout.symmetry || null, sidesMirrored: project.pattern?.sidesMirrored !== false,
    standaloneController: project.devices.standaloneController,
  });
  return {
    fingerprint: cardProjectFingerprint(project),
    prepared: JSON.stringify(prepared),
    storage: JSON.stringify(prepareCardStoragePayload(prepared.runtimePackage || prepared.config)),
  };
}

test('with kept looks, the card fingerprint, runtime package and storage payload are byte-identical', () => {
  const a = cardFiles(without());
  const b = cardFiles(withKept());
  assert.ok(a.fingerprint && a.prepared.length > 100 && a.storage.length > 10);
  assert.deepEqual(b, a);
});

test('a project with no kept looks loads exactly as before: no field, same content hash and JSON', () => {
  const plain = without();
  assert.equal('designedLooks' in plain, false);
  assert.equal(JSON.stringify(migrateProject(structuredClone(plain))), JSON.stringify(plain));
  assert.equal(sha256Canonical(migrateProject(structuredClone(plain))), sha256Canonical(plain));
});

test('a project with kept looks round-trips exactly through load, and the kept looks are the only difference', () => {
  const loaded = withKept();
  assert.deepEqual(normalizeDesignedLooks(loaded.designedLooks), { looks: kept, dropped: 0 });
  assert.equal(JSON.stringify(migrateProject(structuredClone(loaded))), JSON.stringify(loaded));
  const { designedLooks, ...rest } = loaded;
  assert.equal(JSON.stringify(rest), JSON.stringify(without()));
});

test('nothing designed can enter the playlist, even if a hand-edited project names one', () => {
  const ids = kept.map(entry => entry.id);
  const hostile = ids.flatMap(id => [{ type: 'combo', lookId: id }, { lookId: id }, { comboId: id }, { type: 'pattern', patternId: id }]);
  assert.deepEqual(normalizeCardPlaylist(hostile, { savedLooks: [], allowEmpty: true }), []);
  const controller = defaultStandaloneController({ playlist: hostile, looks: [] });
  assert.deepEqual(controller.playlist, []);
  assert.deepEqual(controller.controls.encoder.patternCycleIds.filter(id => ids.includes(id)), []);
  assert.deepEqual(buildCardPlaylistConfig(hostile, [], {}, []).entries, []);
  // And the controller never carries designed looks, even if offered one.
  assert.equal(JSON.stringify(defaultStandaloneController({ designedLooks: kept })).includes('Evening bloom'), false);
});
