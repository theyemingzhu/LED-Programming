import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPackageForPortRoles } from './cardSetupDeploy.js';
import { prepareCardDeployment } from './cardDeployment.js';
import { createDefaultPatchBoard } from './patchBoard.js';
import { requireBenchInstallReadback } from './benchPatternAudition.js';

test('measured GPIO geometry and distinct looks reach the final card package', () => {
  const strips = [
    { id: 'strip-16', pixelCount: 30, name: 'GPIO 16' },
    { id: 'strip-17', pixelCount: 20, name: 'GPIO 17' },
  ];
  const patchBoard = createDefaultPatchBoard(strips);
  patchBoard.patches[0].playback.patternId = 'fire';
  patchBoard.patches[1].playback.patternId = 'ocean';
  const wiring = {
    version: 1, locked: false, verified: false,
    outputs: [
      { id: 'out1', pin: 16, runIds: ['run-strip-16'] },
      { id: 'out2', pin: 17, runIds: ['run-strip-17'] },
    ],
    runs: [
      { id: 'run-strip-16', type: 'strip', source: { stripId: 'strip-16', from: 0, to: 29 }, directionPolicy: 'flexible', physicalDirection: 'source-forward' },
      { id: 'run-strip-17', type: 'strip', source: { stripId: 'strip-17', from: 0, to: 19 }, directionPolicy: 'flexible', physicalDirection: 'source-forward' },
    ],
  };
  const prepared = buildPackageForPortRoles({
    projectId: 'piece', projectName: 'Piece', projectRevision: 5,
    standaloneController: { defaultLook: { patternId: 'aurora' } },
    portRoles: [{ pin: 16, role: 'strip', pixelCount: 30 }, { pin: 17, role: 'strip', pixelCount: 20 }],
    measuredGeometry: { strips, patchBoard, wiring },
  }, prepareCardDeployment);
  const { config } = prepared;
  assert.deepEqual(config.led.outputs.map(output => [output.pin, output.pixels]), [[16, 30], [17, 20]]);
  assert.deepEqual(config.zones.map(zone => [zone.patternId, zone.ranges]), [
    ['fire', [{ start: 0, count: 30 }]],
    ['ocean', [{ start: 30, count: 20 }]],
  ]);
  assert.deepEqual(config.looks.find(look => look.id === config.startupPatternId).zones.map(zone => zone.patternId), ['fire', 'ocean']);
  assert.equal(config.provisional, undefined);
  const status = { cardId: 'card', projectId: config.piece.id,
    projectRevision: config.projectRevision, projectFingerprint: config.projectFingerprint,
    provisionalSetup: false, outputs: structuredClone(config.led.outputs) };
  const zones = { zones: structuredClone(config.zones) };
  const patterns = { currentId: config.startupPatternId, startupPatternId: config.startupPatternId,
    playlist: structuredClone(config.playlist || { enabled: false, fadeMs: 0, entries: [] }),
    patterns: structuredClone(config.looks) };
  assert.equal(requireBenchInstallReadback(config, status, zones, 'card', patterns,
    { state: 'known-good', hasCandidate: false, activationId: '', cardId: 'card' }), true);
});
