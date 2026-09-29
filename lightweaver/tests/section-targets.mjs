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

// A mirror set is one section: two mirrored strips compile to one zone with a
// range each, and the section carries the lead strip's patch id, so looks and
// playlists address the set exactly once.
{
  const mirrorSets = [{ id: 'mirror-1', name: 'Left and right', members: [strips[1].id, strips[0].id] }];
  const mirroredWiring = compileWiring({ wiring, strips, mirrorSets });
  assert.equal(mirroredWiring.ok, true, 'mirrored fixture compiles');
  const mirrored = deriveSectionTargets({ strips, patchBoard, wiring, compiledWiring: mirroredWiring, defaultLook: { patternId: 'aurora' } })
    .filter(t => t.kind === 'section');
  assert.equal(mirrored.length, strips.length - 1, 'a two-strip set replaces two sections with one');
  const set = mirrored.find(t => t.zoneId === 'mirror-1');
  assert.ok(set, 'the set is a section keyed by its own id');
  assert.equal(set.ranges.length, 2, 'one range per member');
  assert.equal(set.patchId, patchBoard.patches.find(p => p.source.stripId === strips[1].id).id, 'the lead member supplies the patch');
  // Same result when deriveSectionTargets compiles the wiring itself.
  assert.deepEqual(
    deriveSectionTargets({ strips, patchBoard, wiring, mirrorSets, defaultLook: { patternId: 'aurora' } }).map(t => [t.id, t.zoneId, t.pixelCount]),
    deriveSectionTargets({ strips, patchBoard, wiring, compiledWiring: mirroredWiring, defaultLook: { patternId: 'aurora' } }).map(t => [t.id, t.zoneId, t.pixelCount]),
  );
}

// The saved project writes the sets and the compiled wiring reads them.
{
  const context = fs.readFileSync(new URL('../src/state/ProjectContext.jsx', import.meta.url), 'utf8');
  assert.match(context, /mirrorSets: layoutMirrorSets,\s+sectionFamilies,\s+layerOrder: layoutLayerOrder,\s+patchBoard: normalizePatchBoard/, 'serializeProject writes layout.mirrorSets');
  assert.match(context, /compileWiring\(\{ wiring, strips, groups: layoutLayerGroups, mirrorSets: layoutMirrorSets \}\)/, 'compiled wiring folds the mirror sets in');
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
