import test from 'node:test';
import assert from 'node:assert/strict';

import { defaultStandaloneController } from './projectModel.js';
import {
  CARD_PLAYLIST_ENTRY_LIMIT,
  buildCardPlaylistConfig,
  deriveLegacyPatternCycleIds,
  normalizeCardPlaylist,
  normalizePlaylistTiming,
  playlistContainsCombo,
  playlistContainsPattern,
} from './cardPlaylist.js';

test('defaultStandaloneController migrates old knob cycle order into a card playlist', () => {
  const controller = defaultStandaloneController({
    defaultLook: { patternId: 'fire' },
    controls: { encoder: { patternCycleIds: ['ocean', 'aurora', 'ocean'] } },
  });

  assert.deepEqual(controller.playlist.map(item => item.type), ['pattern', 'pattern', 'pattern']);
  assert.deepEqual(controller.playlist.map(item => item.patternId), ['fire', 'ocean', 'aurora']);
  assert.equal(controller.playlist[0].id, 'fire');
  assert.equal(playlistContainsPattern(controller.playlist, 'fire'), true);
  assert.equal(playlistContainsPattern(controller.playlist, 'sparkle'), false);
  assert.deepEqual(deriveLegacyPatternCycleIds(controller.playlist), ['fire', 'ocean', 'aurora']);
});

test('normalizeCardPlaylist preserves pattern and combo playlist items in card order', () => {
  const savedLooks = [{
    id: 'split-glow',
    label: 'Split glow',
    defaultLook: { patternId: 'aurora' },
    sectionLooks: {
      outer: { patternId: 'fire' },
      inner: { patternId: 'ocean' },
    },
  }];

  const playlist = normalizeCardPlaylist([
    { type: 'pattern', patternId: 'plasma' },
    { type: 'combo', lookId: 'split-glow' },
    { type: 'combo', lookId: 'missing' },
    { type: 'pattern', patternId: 'missing' },
  ], { savedLooks });

  assert.deepEqual(playlist.map(item => item.id), ['plasma', 'combo-split-glow']);
  assert.deepEqual(playlist.map(item => item.label), ['Plasma', 'Split glow']);
  assert.equal(playlist[1].type, 'combo');
  assert.equal(playlist[1].lookId, 'split-glow');
  assert.equal(playlistContainsCombo(playlist, 'split-glow'), true);
  assert.equal(playlistContainsCombo(playlist, 'missing'), false);
  assert.deepEqual(deriveLegacyPatternCycleIds(playlist), ['plasma']);
});

// ── timed playlist: dwellSeconds default + clamp ─────────────────────────

test('normalizeCardPlaylist defaults dwellSeconds to 30 and clamps to 1..3600', () => {
  const playlist = normalizeCardPlaylist([
    { type: 'pattern', patternId: 'plasma' },
    { type: 'pattern', patternId: 'aurora', dwellSeconds: 90 },
    { type: 'pattern', patternId: 'ember', dwellSeconds: 0 },
    { type: 'pattern', patternId: 'ocean', dwellSeconds: 4000 },
    { type: 'pattern', patternId: 'fire', dwellSeconds: 'not-a-number' },
    { type: 'pattern', patternId: 'scanner', dwellSeconds: -5 },
  ]);
  assert.deepEqual(playlist.map(item => item.dwellSeconds), [30, 90, 1, 3600, 30, 1]);

  // Old entries saved before dwellSeconds existed tolerate the missing field.
  const legacy = normalizeCardPlaylist([{ type: 'pattern', patternId: 'plasma' }]);
  assert.equal(legacy[0].dwellSeconds, 30);
});

// ── timed playlist: playlist-wide fadeMs + enabled default + clamp ───────

test('normalizePlaylistTiming defaults enabled false and fadeMs 1500, and clamps fadeMs 0..10000', () => {
  assert.deepEqual(normalizePlaylistTiming(), { enabled: false, fadeMs: 1500 });
  assert.deepEqual(normalizePlaylistTiming({}), { enabled: false, fadeMs: 1500 });
  assert.deepEqual(normalizePlaylistTiming({ enabled: true, fadeMs: 2200 }), { enabled: true, fadeMs: 2200 });
  assert.deepEqual(normalizePlaylistTiming({ enabled: 'true', fadeMs: -50 }), { enabled: false, fadeMs: 0 });
  assert.deepEqual(normalizePlaylistTiming({ enabled: true, fadeMs: 99999 }), { enabled: true, fadeMs: 10000 });
  assert.deepEqual(normalizePlaylistTiming({ enabled: true, fadeMs: 'nope' }), { enabled: true, fadeMs: 1500 });
});

// ── buildCardPlaylistConfig: the exact /api/config "playlist" block ──────

test('buildCardPlaylistConfig derives entries the same way the dial derives patternCycleIds', () => {
  const savedLooks = [{
    id: 'split-glow',
    label: 'Split glow',
    defaultLook: { patternId: 'aurora' },
    sectionLooks: { outer: { patternId: 'fire' }, inner: { patternId: 'ocean' } },
  }];
  const playlist = [
    { type: 'pattern', patternId: 'plasma', dwellSeconds: 45 },
    { type: 'combo', lookId: 'split-glow', dwellSeconds: 12 },
    { type: 'pattern', patternId: 'aurora', enabled: false, dwellSeconds: 5 },
  ];
  const config = buildCardPlaylistConfig(playlist, savedLooks, { enabled: true, fadeMs: 800 });
  assert.deepEqual(config, {
    enabled: true,
    fadeMs: 800,
    entries: [
      { patternId: 'plasma', dwellSeconds: 45 },
      { patternId: 'combo-split-glow', dwellSeconds: 12 },
    ],
  });
});

test('buildCardPlaylistConfig refuses excess enabled entries without silently dropping them', () => {
  assert.equal(CARD_PLAYLIST_ENTRY_LIMIT, 16);
  const overflowing = Array.from({ length: 20 }, (_, index) => ({
    type: 'pattern',
    patternId: 'plasma',
    id: `entry-${index + 1}`,
    dwellSeconds: 30,
  }));
  assert.throws(() => buildCardPlaylistConfig(overflowing, [], { enabled: true }), /16 entries/);
  assert.equal(overflowing.length, 20);
});

test('buildCardPlaylistConfig defaults to disabled with no entries when no timing is given', () => {
  const config = buildCardPlaylistConfig([{ type: 'pattern', patternId: 'plasma' }]);
  assert.equal(config.enabled, false);
  assert.equal(config.fadeMs, 1500);
  assert.deepEqual(config.entries, [{ patternId: 'plasma', dwellSeconds: 30 }]);
});

test('manual bank retains 19 looks while enabled timed playback refuses overflow',()=>{
 const bank=Array.from({length:19},(_,i)=>({id:`manual-${i}`,type:'pattern',patternId:'fire'}));
 assert.equal(buildCardPlaylistConfig(bank,[],{enabled:false}).entries.length,19);
 assert.throws(()=>buildCardPlaylistConfig(bank,[],{enabled:true}),/16 entries/);
 const overflow=Array.from({length:33},(_,i)=>({...bank[0],id:`manual-${i}`}));
 assert.throws(()=>buildCardPlaylistConfig(overflow,[],{enabled:false}),/32 installed/);
});
