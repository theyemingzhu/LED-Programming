// Layout's install and Patterns' Save to card must build the same body.
// Real card lw-b0fe81f61b44, 2026-11-22: after importing the Nov 19 project,
// Layout → Save to card left every section on Sparkle at 1.0 and the startup
// look combo-sparkle; Patterns → Save to card from the same file kept Fire at
// 0.91 and startup fire. The difference was promotePatternFirst, which only
// Patterns applied.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { prepareCardDeployment } from './cardDeployment.js';
import { compactCardStorageConfig } from './cardStoragePayload.js';
import { runtimePackageForCardOperation } from './testStrip.js';
import { compileWiring } from './wiringCompiler.js';
import { layoutInstallController, promotePatternFirst } from './installController.js';

const project = JSON.parse(readFileSync(new URL('../../tests/fixtures/real-card-bench-2026-11-21/nov19-restore.lw.json', import.meta.url), 'utf8'));

function cardBody(controller) {
  const prepared = prepareCardDeployment({
    projectId: project.id,
    projectName: project.name,
    projectRevision: 1,
    strips: project.layout?.strips || [],
    patchBoard: project.layout?.patchBoard,
    wiring: project.layout?.wiring,
    standaloneController: controller,
  });
  return compactCardStorageConfig(runtimePackageForCardOperation(prepared.runtimePackage, { operation: 'save' }));
}

test('the Nov 19 project starts on its own Fire look when installed from Layout', () => {
  const controller = project.devices.standaloneController;
  assert.equal(controller.defaultLook.patternId, 'fire');
  const compiled = compileWiring({ wiring: project.layout.wiring, strips: project.layout.strips });
  const layoutBody = cardBody(layoutInstallController(controller, compiled.outputs || []));
  assert.equal(layoutBody.startupPatternId, 'fire');
  assert.deepEqual(layoutBody.zones.map(zone => [zone.patternId, zone.brightness]), Array(5).fill(['fire', 0.91]));
});

test('Layout and Patterns build the same startup and playlist order', () => {
  const controller = project.devices.standaloneController;
  const compiled = compileWiring({ wiring: project.layout.wiring, strips: project.layout.strips });
  const layout = layoutInstallController(controller, compiled.outputs || []);
  const patterns = promotePatternFirst({ ...controller, outputs: layout.outputs }, controller.defaultLook.patternId);
  assert.deepEqual(layout.playlist.map(entry => entry.id), patterns.playlist.map(entry => entry.id));
  assert.equal(cardBody(layout).startupPatternId, cardBody(patterns).startupPatternId);
});

test('without the promotion the body starts on the first saved look (the defect)', () => {
  const controller = project.devices.standaloneController;
  assert.notEqual(cardBody(controller).startupPatternId, 'fire');
});
