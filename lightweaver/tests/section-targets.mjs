// One section list. The project derives its sections once (ProjectContext)
// and every screen shows that list. This spec pins the pure layer that makes
// the list identical whatever fallback look a screen passes, and pins the
// section cap the Patterns header prints to the hardware contract.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createDefaultCircleLayout } from '../src/lib/defaultCircleLayout.js';
import { createDefaultPatchBoard } from '../src/lib/patchBoard.js';
import { makeDefaultWiring } from '../src/lib/wiringModel.js';
import { compileWiring } from '../src/lib/wiringCompiler.js';
import { deriveSectionTargets } from '../src/lib/sectionLookModel.js';
import { MAX_SPLIT_SECTIONS } from '../src/lib/stripSplit.js';
import { CARD_HARDWARE_CONTRACT } from '../src/lib/cardHardwareContract.js';

const strips = createDefaultCircleLayout({ sectionPixelCounts: [10, 21, 10] });
const patchBoard = createDefaultPatchBoard(strips);
const wiring = makeDefaultWiring(strips);
const compiledWiring = compileWiring({ wiring, strips });
assert.equal(compiledWiring.ok, true, 'fixture wiring compiles');

const structure = (targets) => targets.map(t => [t.id, t.zoneId, t.kind, t.label, t.pixelCount]);

// Two screens, two fallback looks (Settings passes the saved default, Patterns
// warms an unknown default pattern): the sections, order and names must not
// move, only the fallback look may.
const fromSettings = deriveSectionTargets({ strips, patchBoard, wiring, compiledWiring, defaultLook: { patternId: 'aurora' } });
const fromPatterns = deriveSectionTargets({ strips, patchBoard, wiring, compiledWiring, defaultLook: { patternId: 'ember', speed: 2 } });
assert.deepEqual(structure(fromSettings), structure(fromPatterns));
assert.equal(fromSettings.filter(t => t.kind === 'section').length, 3, 'three strips give three sections');
assert.deepEqual(fromSettings.filter(t => t.kind === 'section').map(t => t.pixelCount), [10, 21, 10]);

// Same inputs, same list: the memo in ProjectContext relies on the derivation
// being a pure function of (strips, patchBoard, wiring, compiledWiring, look).
assert.deepEqual(
  deriveSectionTargets({ strips, patchBoard, wiring, compiledWiring, defaultLook: { patternId: 'aurora' } }),
  fromSettings,
);

// The cap the owner sees is the cap the card enforces.
assert.equal(MAX_SPLIT_SECTIONS, CARD_HARDWARE_CONTRACT.maxZones);
assert.equal(CARD_HARDWARE_CONTRACT.maxZones, 12);
const patternsScreen = fs.readFileSync(new URL('../src/v3/lw-pattern.jsx', import.meta.url), 'utf8');
assert.equal(patternsScreen.includes('card limit 10'), false, 'Patterns must not print a literal section cap');
assert.equal(patternsScreen.includes('card limit {CARD_HARDWARE_CONTRACT.maxZones}'), true);

// Screens read the list from the project, not from their own derivation.
for (const screen of ['../src/v3/lw-settings.jsx']) {
  const source = fs.readFileSync(new URL(screen, import.meta.url), 'utf8');
  assert.equal(source.includes('deriveSectionTargets('), false, `${screen} derives its own section list`);
}
console.log('section-targets: ok');
