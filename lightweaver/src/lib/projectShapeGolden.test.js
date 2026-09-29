// A project WITHOUT symmetry must load, save, hash and install exactly as it did
// before symmetry sides existed. Every owner's installed card is matched by
// these values: the card config fingerprint for a plain install, and the
// project's canonical content hash for an expression-scene install (the card
// stores it as its projectFingerprint and the installation record keeps it as
// studioFingerprint). If any of them moves, existing cards read as out of date.
//
// The golden file was measured with origin/main's code (ba9c1886) on a saved
// project exactly as main writes it. Do not regenerate it from this branch: a
// golden taken from the code under test proves nothing.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { migrateProject, sidesMirroredPatternFields, symmetryLayoutFields } from './projectModel.js';
import { cardProjectFingerprint } from './cardProjectResolver.js';
import { prepareCardDeployment } from './cardDeployment.js';
import { normalizePatchBoard } from './patchBoard.js';
import { sha256Canonical } from './projectRepository.js';

const golden = JSON.parse(fs.readFileSync(new URL('./projectShapeGolden.fixture.json', import.meta.url), 'utf8'));
const sha = text => createHash('sha256').update(text).digest('hex');

const variants = {
  saved: project => project,
  // A project saved before v1 mirror sets existed at all.
  savedBeforeMirrorSets: project => { delete project.layout.mirrorSets; return project; },
};

for (const [name, mutate] of Object.entries(variants)) {
  test(`a project without symmetry keeps main's identity (${name})`, () => {
    const loaded = migrateProject(mutate(structuredClone(golden.input)));
    const strips = loaded.layout.strips;
    // Exactly the arguments the install path passes (cardProjectResolver.js).
    const prepared = prepareCardDeployment({
      projectId: loaded.id,
      projectName: loaded.name,
      projectRevision: 3,
      strips,
      patchBoard: normalizePatchBoard(loaded.layout.patchBoard, strips),
      wiring: loaded.layout.wiring,
      symmetry: loaded.layout.symmetry || null,
      sidesMirrored: loaded.pattern?.sidesMirrored !== false,
      standaloneController: loaded.devices.standaloneController,
    });
    const expected = golden.expected[name];
    assert.deepEqual({
      loadedProjectJsonSha256: sha(JSON.stringify(loaded)),
      loadedProjectContentHash: sha256Canonical(loaded),
      cardProjectFingerprint: cardProjectFingerprint(loaded),
      cardConfigJsonSha256: sha(JSON.stringify(prepared.config)),
      cardConfigProjectFingerprint: prepared.config.projectFingerprint,
    }, expected);
    // And a second load of what the first one produced changes nothing.
    assert.equal(sha(JSON.stringify(migrateProject(structuredClone(loaded)))), expected.loadedProjectJsonSha256);
  });
}

test('serializeProject writes a symmetry-free layout and pattern in main\'s shape', () => {
  // ProjectContext spreads these at the old `mirrorSets` slot and after
  // `motionSmoothing`; main wrote exactly `mirrorSets: []` and nothing after.
  assert.equal(
    JSON.stringify({ layerGroups: [], ...symmetryLayoutFields(null, false), sectionFamilies: [] }),
    '{"layerGroups":[],"mirrorSets":[],"sectionFamilies":[]}',
  );
  assert.deepEqual(sidesMirroredPatternFields(true), {});
  assert.deepEqual(sidesMirroredPatternFields(undefined), {});
  // A real choice is written.
  const symmetry = { fold: 2, sides: [] };
  assert.deepEqual(symmetryLayoutFields(symmetry, true), { mirrorSets: [], symmetry, symmetryOfferDismissed: true });
  assert.deepEqual(sidesMirroredPatternFields(false), { sidesMirrored: false });
});
