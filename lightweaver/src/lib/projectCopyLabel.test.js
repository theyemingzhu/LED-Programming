import test from 'node:test';
import assert from 'node:assert/strict';

import { PROJECT_COPY_KINDS, projectCopyKind, projectCopyLabel } from './projectCopyLabel.js';

test('projectCopyLabel describes a complete copy in each real destination', () => {
  assert.equal(projectCopyLabel('cloud', 'My Piece'), 'Saved online as My Piece');
  assert.equal(projectCopyLabel('browser', 'My Piece'), 'Saved in this browser as My Piece');
  assert.equal(projectCopyLabel('file'), 'Exported as a project file');
  assert.equal(projectCopyLabel('card'), 'Saved on the card');
  assert.equal(projectCopyLabel('none'), 'Not saved yet');
});

test('projectCopyLabel never calls a card reconstruction a complete backup', () => {
  const label = projectCopyLabel('card-partial');
  assert.equal(label, 'Card copy (partial — no artwork)');
  // The whole point of this kind: it must read differently from every label
  // that claims a complete, safely archived copy — "Backup" and "Saved
  // project" style wording included.
  assert.notEqual(label, projectCopyLabel('card'));
  assert.notEqual(label, projectCopyLabel('browser', 'anything'));
  assert.notEqual(label, projectCopyLabel('cloud', 'anything'));
  assert.match(label, /partial/i);
  assert.match(label, /no artwork/i);
  assert.doesNotMatch(label, /^Backup$/i);
  assert.doesNotMatch(label, /^Saved project$/i);
});

test('projectCopyLabel falls back to "Not saved yet" for an unknown kind instead of guessing', () => {
  assert.equal(projectCopyLabel('mystery'), 'Not saved yet');
  assert.equal(projectCopyLabel(undefined), 'Not saved yet');
});

// projectCopyKind — defect C1b. A project reconstructed from a card's own
// /api/status readback (reconstructInstalledCardState in
// cardProjectAdoption.js) sets `project.origin = { kind: 'card-partial', ... }`.
// This is the one place that marker gets translated into a display kind.
test('projectCopyKind reads a fresh reconstruction as card-partial with no association at all', () => {
  const project = { origin: { kind: 'card-partial', cardId: 'lw-abc123', at: 1000 }, layout: {} };
  assert.equal(projectCopyKind(project), 'card-partial');
  assert.equal(projectCopyKind(project, {}), 'card-partial');
});

test('projectCopyKind keeps reading card-partial even after the reconstruction is saved somewhere', () => {
  // The blueprint rule is about completeness, not location: saving a
  // still-artwork-less reconstruction to the browser, the cloud, or a file
  // does not make it a complete backup, so the partial marker must win over
  // every destination signal until real artwork exists.
  const project = { origin: { kind: 'card-partial', cardId: 'lw-abc123', at: 1000 }, layout: {} };
  assert.equal(projectCopyKind(project, { browserRecord: { name: 'My Piece' } }), 'card-partial');
  assert.equal(projectCopyKind(project, { activeRemoteProject: { title: 'My Piece' } }), 'card-partial');
  assert.equal(projectCopyKind(project, { persistedDestination: 'file' }), 'card-partial');
  assert.equal(projectCopyKind(project, { persistedDestination: 'card' }), 'card-partial');
});

test('projectCopyKind stops reading card-partial once the project has real artwork', () => {
  // The rule "cleared when the owner imports artwork" is enforced by
  // deriving completeness from the live project on every call — nothing
  // has to go back and mutate `origin` when artwork shows up.
  const withArtwork = {
    origin: { kind: 'card-partial', cardId: 'lw-abc123', at: 1000 },
    layout: { svgText: '<svg><path d="M0 0" /></svg>' },
  };
  assert.equal(projectCopyKind(withArtwork), 'none');
  assert.equal(projectCopyKind(withArtwork, { browserRecord: { name: 'My Piece' } }), 'browser');
  assert.equal(projectCopyKind(withArtwork, { activeRemoteProject: { title: 'My Piece' } }), 'cloud');
});

test('projectCopyKind treats blank or whitespace-only svgText as still lacking artwork', () => {
  const blank = { origin: { kind: 'card-partial' }, layout: { svgText: '   ' } };
  assert.equal(projectCopyKind(blank), 'card-partial');
  const empty = { origin: { kind: 'card-partial' }, layout: { svgText: '' } };
  assert.equal(projectCopyKind(empty), 'card-partial');
});

test('projectCopyKind ignores an origin whose kind is not card-partial', () => {
  const project = { origin: { kind: 'something-else' }, layout: {} };
  assert.equal(projectCopyKind(project), 'none');
  assert.equal(projectCopyKind(project, { persistedDestination: 'card' }), 'card');
});

test('projectCopyKind falls through to the ordinary destination lookup with no origin at all', () => {
  assert.equal(projectCopyKind({}), 'none');
  assert.equal(projectCopyKind({}, { activeRemoteProject: { title: 'X' } }), 'cloud');
  assert.equal(projectCopyKind({}, { browserRecord: { name: 'X' } }), 'browser');
  assert.equal(projectCopyKind({}, { persistedDestination: 'file' }), 'file');
  assert.equal(projectCopyKind({}, { persistedDestination: 'card' }), 'card');
  assert.equal(projectCopyKind(null, { persistedDestination: 'card' }), 'card');
});

test('projectCopyKind only ever returns one of the recognized kinds', () => {
  const cases = [
    projectCopyKind({ origin: { kind: 'card-partial' }, layout: {} }),
    projectCopyKind({}, { persistedDestination: 'card' }),
    projectCopyKind({}, { persistedDestination: 'file' }),
    projectCopyKind({}, { browserRecord: { name: 'X' } }),
    projectCopyKind({}, { activeRemoteProject: { title: 'X' } }),
    projectCopyKind({}),
  ];
  for (const kind of cases) {
    assert.ok(PROJECT_COPY_KINDS.includes(kind), `${kind} is not a recognized copy kind`);
  }
});
