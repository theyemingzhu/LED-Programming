import test from 'node:test';
import assert from 'node:assert/strict';

import { projectCopyLabel } from './projectCopyLabel.js';

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
