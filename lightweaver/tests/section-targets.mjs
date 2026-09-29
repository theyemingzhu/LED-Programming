// One section list. The project derives its sections once (ProjectContext)
// and every screen shows that list. This spec pins the pure layer that makes
// the list identical whatever fallback look a screen passes, and pins the
// section cap to the hardware contract.
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

// Symmetry sides: two strips in two sides derive one "Both sides, mirrored"
// section (or one per side when the look plays them on their own), and the
// strip left on its own stays a section keyed by its patch.
{
  const symmetry = {
    fold: 2,
    orientation: 'mirror',
    sides: [
      { id: 'side-1', label: 'Left side', stripIds: [strips[1].id] },
      { id: 'side-2', label: 'Right side', stripIds: [strips[0].id] },
    ],
  };
  const sidedWiring = compileWiring({ wiring, strips, symmetry });
  assert.equal(sidedWiring.ok, true, 'sided fixture compiles');
  const look = { patternId: 'aurora' };
  const mirrored = deriveSectionTargets({ strips, patchBoard, wiring, compiledWiring: sidedWiring, symmetry, sidesMirrored: true, defaultLook: look })
    .filter(t => t.kind === 'section');
  assert.equal(mirrored.length, strips.length - 1, 'two mirrored sides are one section');
  assert.deepEqual([mirrored[0].id, mirrored[0].zoneId, mirrored[0].label, mirrored[0].mirroredSides],
    ['side-1', 'side-1', 'Both sides, mirrored', ['side-2']]);
  const own = deriveSectionTargets({ strips, patchBoard, wiring, compiledWiring: sidedWiring, symmetry, sidesMirrored: false, defaultLook: look })
    .filter(t => t.kind === 'section');
  assert.deepEqual(own.slice(0, 2).map(t => [t.id, t.label]), [['side-1', 'Left side'], ['side-2', 'Right side']]);
  assert.equal(own.length, strips.length, 'own sides keep one section per side');
  // Same result when deriveSectionTargets compiles the wiring itself.
  assert.deepEqual(
    deriveSectionTargets({ strips, patchBoard, wiring, symmetry, defaultLook: look }).map(t => [t.id, t.zoneId, t.pixelCount]),
    deriveSectionTargets({ strips, patchBoard, wiring, compiledWiring: sidedWiring, symmetry, defaultLook: look }).map(t => [t.id, t.zoneId, t.pixelCount]),
  );
}

// The saved project writes the symmetry and the compiled wiring reads it.
{
  const context = fs.readFileSync(new URL('../src/state/ProjectContext.jsx', import.meta.url), 'utf8');
  assert.match(context, /symmetry: layoutSymmetry,\s+symmetryOfferDismissed: layoutSymmetryOfferDismissed,\s+sectionFamilies,\s+layerOrder: layoutLayerOrder,\s+patchBoard: normalizePatchBoard/, 'serializeProject writes layout.symmetry');
  assert.match(context, /motionSmoothing, sidesMirrored,\s+\},/, 'serializeProject writes pattern.sidesMirrored');
  assert.match(context, /compileWiring\(\{ wiring, strips, groups: layoutLayerGroups, symmetry: layoutSymmetry \}\)/, 'compiled wiring folds the symmetry in');
  assert.equal(context.includes('mirrorSets'), false, 'ProjectContext no longer reads or writes mirrorSets');
}

// The section cap stays tied to the card contract even when the quiet Patterns
// overview leaves the limit out of its default header.
assert.equal(MAX_SPLIT_SECTIONS, CARD_HARDWARE_CONTRACT.maxZones);
assert.equal(CARD_HARDWARE_CONTRACT.maxZones, 12);
const patternsScreen = fs.readFileSync(new URL('../src/v3/lw-pattern.jsx', import.meta.url), 'utf8');
assert.equal(patternsScreen.includes('card limit 10'), false, 'Patterns must not print a literal section cap');
assert.equal(patternsScreen.includes('card limit 12'), false, 'Patterns must not hard-code the cap in copy');

// Screens read the list from the project, not from their own derivation.
for (const screen of ['../src/v3/lw-settings.jsx']) {
  const source = fs.readFileSync(new URL(screen, import.meta.url), 'utf8');
  assert.equal(source.includes('deriveSectionTargets('), false, `${screen} derives its own section list`);
}
console.log('section-targets: ok');
