import assert from 'node:assert/strict';
import { createDefaultCircleLayout } from '../src/lib/defaultCircleLayout.js';
import { createDefaultPatchBoard } from '../src/lib/patchBoard.js';
import {
  buildPatternPlaylistPreview,
  buildSavedLookPlaylistPreviewTargets,
} from '../src/lib/playlistLivePreview.js';
import {
  cardActionReducer,
  cardActionStatusLabel,
  createCardActionState,
} from '../src/lib/cardAction.js';

const strips = createDefaultCircleLayout({ sectionPixelCounts: [22, 22] });
const patchBoard = createDefaultPatchBoard(strips);

const firePreview = buildPatternPlaylistPreview('fire');
assert.equal(firePreview.patternId, 'fire');
assert.equal(firePreview.syncZones, true);
assert.equal(firePreview.brightness, 1);

// No wiring: deriveSectionTargets falls back to the patch board, so the
// runtime identity (zoneId) is the sanitized patch id. This is the correct
// shape for a project with no compiled wiring, not the shape a wired card
// reports (see the compiled-wiring case below).
const targets = buildSavedLookPlaylistPreviewTargets({
  strips,
  patchBoard,
  savedLook: {
    id: 'split-look',
    label: 'Split Look',
    defaultLook: { patternId: 'plasma' },
    sectionLooks: {
      'patch-default-outer-circle': { patternId: 'sparkle', brightness: 0.6 },
    },
  },
});

const allTarget = targets.find(target => target.kind === 'all');
const outerTarget = targets.find(target => target.id === 'patch-default-outer-circle');
const innerTarget = targets.find(target => target.id === 'patch-default-inner-circle');

assert.equal(allTarget?.look.patternId, 'plasma');
assert.equal(outerTarget?.zoneId, 'patch-default-outer-circle');
assert.equal(outerTarget?.look.patternId, 'sparkle');
assert.equal(outerTarget?.look.brightness, 0.6);
assert.equal(innerTarget?.zoneId, 'patch-default-inner-circle');
assert.equal(innerTarget?.look.patternId, 'plasma');

// Wired project: the card's runtime identity is the compiled zone id, which
// is shaped like the strip id ('default-outer-circle'), never the patch id
// ('patch-default-outer-circle'). A playlist preview built without wiring
// requests zones the card does not have, which is the reboot bug this test
// guards against — see lw-playlist.jsx's call site for buildSavedLookPlaylistPreviewTargets.
const wiring = {
  version: 1,
  locked: true,
  verified: true,
  outputs: [{ id: 'o1', name: 'One', pin: 16, runIds: ['run-outer', 'run-inner'] }],
  runs: [
    {
      id: 'run-outer',
      type: 'strip',
      source: { stripId: 'default-outer-circle', from: 0, to: 21 },
      directionPolicy: 'flexible',
      physicalDirection: 'source-forward',
      seamLed: null,
    },
    {
      id: 'run-inner',
      type: 'strip',
      source: { stripId: 'default-inner-circle', from: 0, to: 21 },
      directionPolicy: 'flexible',
      physicalDirection: 'source-forward',
      seamLed: null,
    },
  ],
};

const wiredTargets = buildSavedLookPlaylistPreviewTargets({
  strips,
  patchBoard,
  wiring,
  savedLook: {
    id: 'split-look',
    label: 'Split Look',
    defaultLook: { patternId: 'plasma' },
    sectionLooks: {
      'patch-default-outer-circle': { patternId: 'sparkle', brightness: 0.6 },
    },
  },
});

const wiredOuterTarget = wiredTargets.find(target => target.id === 'patch-default-outer-circle');
const wiredInnerTarget = wiredTargets.find(target => target.id === 'patch-default-inner-circle');

assert.equal(wiredOuterTarget?.zoneId, 'default-outer-circle');
assert.equal(wiredOuterTarget?.look.patternId, 'sparkle');
assert.equal(wiredInnerTarget?.zoneId, 'default-inner-circle');
assert.equal(wiredInnerTarget?.look.patternId, 'plasma');
assert.notEqual(wiredOuterTarget?.zoneId, 'patch-default-outer-circle');

// Playlist selection is a Studio intent immediately, while the highlighted
// runtime-applied row remains the last card-acknowledged revision. Late
// acknowledgements from a superseded row cannot move the highlight backwards.
let physicalState = createCardActionState({ confirmedRevision: 'row-fire' });
physicalState = cardActionReducer(physicalState, { type: 'start', revision: 'row-ocean' });
assert.equal(cardActionStatusLabel(physicalState), 'Sending to Lightweaver');
assert.equal(physicalState.confirmedRevision, 'row-fire');
physicalState = cardActionReducer(physicalState, { type: 'start', revision: 'row-plasma' });
const afterLateOcean = cardActionReducer(physicalState, { type: 'confirm', revision: 'row-ocean' });
assert.strictEqual(afterLateOcean, physicalState);
physicalState = cardActionReducer(physicalState, { type: 'confirm', revision: 'row-plasma' });
assert.equal(physicalState.confirmedRevision, 'row-plasma');
assert.equal(cardActionStatusLabel(physicalState), 'Applied by Lightweaver runtime');

console.log('playlist live preview helpers OK');
