import assert from 'node:assert/strict';
import test from 'node:test';
import {
  REFERENCE_BOARDS, boardEvidence, draftBoard, exportBoardProfile, importBoardProfile,
  rememberedBoard, rememberBoard, resolveBoardMatch, shortlistBoards, storeBoardProfile, validateBoardProfile,
} from './boardProfiles.js';

const [original, revised, otg] = REFERENCE_BOARDS;
const cardId = 'lw-aabbccddeeff';

test('reference revisions preserve physical contacts and put onboard RGB on the documented GPIO', () => {
  const rgb = profile => profile.groups.flatMap(group => group.pins).find(pin => pin.role === 'led').gpio;
  assert.deepEqual([rgb(original), rgb(revised)], [48, 38]);
  assert.deepEqual(original.groups.map(group => group.pins.map(pin => pin.label)),
    revised.groups.map(group => group.pins.map(pin => pin.label)));
  assert.ok(Object.isFrozen(revised.groups[0].pins[0]));
  assert.deepEqual(otg.groups.filter(group => group.kind === 'header').map(group => [group.start, group.step]), [[1, 2], [2, 2]]);
  assert.deepEqual(otg.groups.find(group => group.name === 'microSD').pins.map(pin => pin.gpio), [36, 35, 37, 38, 33, 34]);
});

test('only explicit board evidence distinguishes the DevKit revisions', () => {
  const envelope = { cardId, chipName: 'ESP32-S3', flashBytes: 16 * 1024 ** 2, psramBytes: 8 * 1024 ** 2 };
  const candidates = shortlistBoards(REFERENCE_BOARDS, boardEvidence(envelope));
  assert.deepEqual(candidates.map(candidate => candidate.profile.id), [original.id, revised.id]);
  assert.equal(candidates[0].score, candidates[1].score);
  assert.ok(candidates.every(candidate => !candidate.reported && !candidate.confirmed));

  const reported = boardEvidence({ ...envelope, boardProfile: { id: revised.id, revision: revised.revision } });
  const exact = shortlistBoards(REFERENCE_BOARDS, reported);
  assert.equal(exact[0].profile, revised);
  assert.equal(exact[0].reported, true);
  assert.equal(shortlistBoards(REFERENCE_BOARDS, boardEvidence({ cardId, usbVendorId: 0x303a })).length, 3);
  const sameCardUsb = { cardId, chipName: 'ESP32-S3', flashBytes: envelope.flashBytes };
  assert.deepEqual(boardEvidence({ cardId }, sameCardUsb).usbHints, ['chip', 'flash size']);
  assert.deepEqual(boardEvidence({ cardId: 'lw-aabbccddee00' }, sameCardUsb).usbHints, []);
  assert.deepEqual(boardEvidence(envelope, sameCardUsb).usbHints, []);
});

test('board selection requires a reported revision or a current exact-card confirmation', () => {
  const envelope = { cardId, chipName: 'ESP32-S3', flashBytes: 16 * 1024 ** 2, psramBytes: 8 * 1024 ** 2 };
  const evidence = boardEvidence(envelope);
  const ambiguous = resolveBoardMatch(REFERENCE_BOARDS, evidence);
  assert.equal(ambiguous.status, 'review');
  assert.equal(ambiguous.reason, 'check-pcb-revision');
  assert.equal(ambiguous.profile, null);
  assert.equal(ambiguous.candidates.length, 2);
  assert.equal(resolveBoardMatch([revised], evidence).status, 'review');

  const library = rememberBoard({ profiles: [], confirmations: {} }, cardId, original);
  const remembered = rememberedBoard(library, cardId);
  assert.equal(resolveBoardMatch(REFERENCE_BOARDS, evidence, remembered).profile, original);
  assert.equal(resolveBoardMatch(REFERENCE_BOARDS, boardEvidence({ ...envelope, cardId: 'lw-aabbccddee00' }), remembered).profile, null);
  assert.equal(resolveBoardMatch(REFERENCE_BOARDS, evidence, { ...remembered, current: false }).profile, null);

  const exact = boardEvidence({ ...envelope, boardProfile: { id: revised.id, revision: revised.revision } });
  const reported = resolveBoardMatch(REFERENCE_BOARDS, exact, remembered);
  assert.equal(reported.status, 'reported');
  assert.equal(reported.profile, revised);
  const unknown = boardEvidence({ ...envelope, boardProfile: { id: revised.id, revision: revised.revision + 1 } });
  assert.equal(resolveBoardMatch(REFERENCE_BOARDS, unknown, remembered).reason, 'reported-profile-unavailable');
  assert.equal(resolveBoardMatch(REFERENCE_BOARDS, unknown, remembered).profile, null);
  assert.equal(resolveBoardMatch(REFERENCE_BOARDS, boardEvidence({ cardId })).status, 'unavailable');
  assert.equal(resolveBoardMatch(REFERENCE_BOARDS, boardEvidence({ ...envelope, chipName: 'ESP32-C3' })).status, 'no-match');
});

test('USB evidence from another card is ignored and conflicting readings prevent automatic selection', () => {
  const envelope = { cardId, chipName: 'ESP32-S3', flashBytes: 16 * 1024 ** 2 };
  const usb = { cardId, chipName: 'ESP32-S3', flashBytes: 8 * 1024 ** 2 };
  assert.equal(boardEvidence(envelope, { ...usb, cardId: 'lw-aabbccddee00' }).readingsConflict, false);
  const conflict = boardEvidence(envelope, usb);
  assert.equal(conflict.readingsConflict, true);
  assert.deepEqual(resolveBoardMatch(REFERENCE_BOARDS, conflict), {
    status: 'review', reason: 'hardware-readings-conflict', profile: null, candidates: [],
  });
  assert.equal(boardEvidence({ boardProfile: { id: revised.id, revision: revised.revision } }).reported, null);
});

test('portable profiles validate, keep references immutable and never overwrite a conflicting import', () => {
  const draft = draftBoard(revised);
  const profile = validateBoardProfile({ ...draft, revision: 1, supplier: 'Example store' });
  const roundTrip = importBoardProfile(exportBoardProfile(profile));
  assert.deepEqual(roundTrip, profile);

  const base = { profiles: [], confirmations: {} };
  const saved = storeBoardProfile(base, profile, 0);
  assert.equal(storeBoardProfile(saved, roundTrip), saved);
  assert.throws(() => storeBoardProfile(saved, { ...profile, name: 'Conflicting edit' }), /already exists/);
  assert.throws(() => storeBoardProfile(saved, { ...profile, revision: 2 }, 0), /updated in another tab/);
  assert.throws(() => importBoardProfile(exportBoardProfile({ ...revised, name: 'Edited reference' })), /read-only/);
  assert.throws(() => validateBoardProfile({ ...profile, sources: ['javascript:alert(1)'] }), /HTTP or HTTPS/);
  const groups = [{ ...profile.groups[0], pins: [{ ...profile.groups[0].pins[4], gpio: 24 }] }];
  assert.throws(() => validateBoardProfile({ ...profile, groups }), /absent on ESP32-S3/);
});

test('remembered choices are scoped to the exact card and saved revision', () => {
  const profile = validateBoardProfile({ ...draftBoard(revised), revision: 1 });
  const initial = storeBoardProfile({ profiles: [], confirmations: {} }, profile, 0);
  const confirmed = rememberBoard(initial, cardId, profile);
  assert.equal(rememberedBoard(confirmed, cardId).current, true);
  assert.equal(rememberedBoard(confirmed, 'lw-aabbccddee00'), null);
  const next = storeBoardProfile(confirmed, { ...profile, revision: 2 }, 1);
  assert.equal(rememberedBoard(next, cardId).current, false);
  assert.equal(rememberedBoard(next, cardId).revision, 1);
  assert.throws(() => rememberBoard(next, cardId, profile), /Reopen the saved profile/);
});
