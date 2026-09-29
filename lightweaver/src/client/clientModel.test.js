import test from 'node:test';
import assert from 'node:assert/strict';
import { controlPatch, normalizeClientPlaylist, updatePlaylistEntry, movePlaylistEntry, validateClientStatus } from './clientModel.js';

test('brightness command never changes pattern or pauses playlist', () => {
  assert.deepEqual(controlPatch('brightness', 0.4), { brightness: 0.4 });
  assert.deepEqual(controlPatch('patternId', 'installed_Moon'), { patternId: 'installed_Moon', syncZones: true });
  assert.throws(() => controlPatch('config', {}));
});
test('playlist uses exact installed IDs and bounded durations, never authoring defaults', () => {
  const patterns = [{ id: 'installed_Moon' }];
  const value = { ok: true, cardId: 'lw-card', revision: 'revision-2', enabled: true, fadeMs: 1500, entries: [{ patternId: 'installed_Moon', dwellSeconds: 45 }] };
  assert.deepEqual(normalizeClientPlaylist(value, patterns, 'lw-card'), value);
  assert.throws(() => normalizeClientPlaylist({ ...value, cardId: 'lw-other' }, patterns, 'lw-card'));
  assert.throws(() => normalizeClientPlaylist({ ...value, entries: [{ patternId: 'missing', dwellSeconds: 45 }] }, patterns, 'lw-card'));
  assert.throws(() => normalizeClientPlaylist({ ...value, entries: [{ patternId: 'installed_Moon', dwellSeconds: 0 }] }, patterns, 'lw-card'));
});
test('reordering and editing preserves other entries', () => {
  const entries = [{ patternId: 'a', dwellSeconds: 30 }, { patternId: 'b', dwellSeconds: 60 }];
  assert.deepEqual(movePlaylistEntry(entries, 0, 1), [entries[1], entries[0]]);
  assert.deepEqual(updatePlaylistEntry(entries, 0, '45'), [{ patternId: 'a', dwellSeconds: 45 }, entries[1]]);
  assert.throws(() => updatePlaylistEntry(entries, 0, ''));
});
test('status cannot rebind to another card or boot silently', () => {
  const status = { app: 'Lightweaver', cardId: 'lw-a', bootId: 'boot-a', playbackReady: true };
  assert.equal(validateClientStatus(status, { cardId: 'lw-a', bootId: 'boot-a' }), status);
  assert.throws(() => validateClientStatus({ ...status, cardId: 'lw-b' }, { cardId: 'lw-a' }));
  assert.throws(() => validateClientStatus({ ...status, bootId: 'boot-b' }, { cardId: 'lw-a', bootId: 'boot-a' }));
});
