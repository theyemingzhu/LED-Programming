// One-off edit, C attempt 3: slot swap (design in claude/realtiming-reds
// real-card-2026-11-22/NOTES.md). node firmware-queue/slot-swap-edit.mjs
import { readFileSync, writeFileSync } from 'node:fs';
const F = 'firmware/lightweaver-controller/src/LightweaverStorage.cpp';
let s = readFileSync(F, 'utf8');
const once = (from, to) => { const n = s.split(from).length - 1; if (n !== 1) throw new Error(`expected 1 of ${JSON.stringify(from).slice(0, 100)}, found ${n}`); s = s.replace(from, to); };
const between = (startMark, endMark, to) => { const a = s.indexOf(startMark); const b = s.indexOf(endMark, a); if (a < 0 || b < 0) throw new Error('marks ' + startMark.slice(0, 40)); s = s.slice(0, a) + to + s.slice(b); };

// 1. Helpers: two slots, a live pointer, a candidate pointer, a journal pointer.
between(`constexpr const char* NVS_CANDIDATE_BLOB_KEY = "cdConfigBlob";`, `bool isKnownGoodKey(const char* key) {`,
`constexpr const char* NVS_CANDIDATE_BLOB_KEY = "cdConfigBlob";
// Slot swap (2026-11-23). The project lives in one of two blob slots:
// slot 0 = kgConfigBlob (older firmware's known-good blob), slot 1 =
// cdConfigBlob. kgSlot names the live one, cdSlot the slot holding a staged
// candidate, prevSlot the live slot before a promotion (255 = none). A
// promotion is one byte (kgSlot = cdSlot), so confirming a wiring change never
// needs room for another project copy. Before this, confirming copied the
// project into a journal and over the live slot, and on the real card
// (lw-b0fe81f61b44, 2026-11-22) it answered "candidate confirmation failed".
// After a promotion kgSlot == cdSlot, so readKnownGood() == readCandidate()
// and every existing "promoted" test below keeps its meaning.
constexpr const char* NVS_KG_SLOT_KEY = "kgSlot";
constexpr const char* NVS_CD_SLOT_KEY = "cdSlot";
constexpr const char* NVS_PREV_SLOT_KEY = "prevSlot";
constexpr uint8_t NO_SLOT = 255;

const char* slotBlobKey(uint8_t slot) { return slot == 1 ? NVS_CANDIDATE_BLOB_KEY : NVS_KNOWN_GOOD_BLOB_KEY; }
// Older data: slot 0 falls back to the known-good string, slot 1 to the
// candidate string, exactly as each key was read before.
const char* slotStringKey(uint8_t slot) { return slot == 1 ? NVS_CANDIDATE_CONFIG_KEY : NVS_KNOWN_GOOD_CONFIG_KEY; }
uint8_t readSlot(Preferences& prefs, const char* key, uint8_t fallback) {
  if (!prefs.isKey(key)) return fallback;
  uint8_t v = prefs.getUChar(key, fallback);
  return v <= 1 || v == NO_SLOT ? v : fallback;
}
uint8_t liveSlot(Preferences& prefs) { return readSlot(prefs, NVS_KG_SLOT_KEY, 0) == 1 ? 1 : 0; }
uint8_t otherSlot(uint8_t slot) { return slot == 1 ? 0 : 1; }
uint8_t candidateSlot(Preferences& prefs) {
  uint8_t slot = readSlot(prefs, NVS_CD_SLOT_KEY, NO_SLOT);
  if (slot != NO_SLOT) return slot;
  // Older firmware wrote the candidate string with no pointer.
  return prefs.isKey(NVS_CANDIDATE_CONFIG_KEY) ? 1 : NO_SLOT;
}

String readKnownGood(Preferences& prefs) {
  uint8_t slot = liveSlot(prefs);
  return lightweaver::readProject(prefs, slotBlobKey(slot), slotStringKey(slot));
}
size_t writeKnownGood(Preferences& prefs, const String& json) {
  uint8_t slot = liveSlot(prefs);
  return lightweaver::writeProject(prefs, slotBlobKey(slot), slotStringKey(slot), json);
}
bool hasKnownGood(Preferences& prefs) {
  uint8_t slot = liveSlot(prefs);
  return lightweaver::projectStored(prefs, slotBlobKey(slot), slotStringKey(slot));
}
bool removeKnownGood(Preferences& prefs) {
  uint8_t slot = liveSlot(prefs);
  return lightweaver::removeProject(prefs, slotBlobKey(slot), slotStringKey(slot));
}
String readCandidate(Preferences& prefs) {
  uint8_t slot = candidateSlot(prefs);
  if (slot == NO_SLOT) return String("");
  return lightweaver::readProject(prefs, slotBlobKey(slot), slotStringKey(slot));
}
// Stage into the slot the live project is not in; name it only once written.
size_t writeCandidate(Preferences& prefs, const String& json) {
  uint8_t slot = otherSlot(liveSlot(prefs));
  if (prefs.isKey(NVS_CD_SLOT_KEY)) prefs.remove(NVS_CD_SLOT_KEY);
  size_t written = lightweaver::writeProject(prefs, slotBlobKey(slot), slotStringKey(slot), json);
  if (written != json.length()) return 0;
  return prefs.putUChar(NVS_CD_SLOT_KEY, slot) > 0 ? written : 0;
}
// Drop the candidate. Before a promotion that erases the staged slot; after it
// (cdSlot == kgSlot) the slot to erase is the old project, the other one.
bool removeCandidate(Preferences& prefs) {
  uint8_t live = liveSlot(prefs);
  uint8_t slot = candidateSlot(prefs);
  bool ok = true;
  uint8_t erase = slot == NO_SLOT ? otherSlot(live) : (slot == live ? otherSlot(live) : slot);
  if (!lightweaver::removeProject(prefs, slotBlobKey(erase), slotStringKey(erase))) ok = false;
  if (prefs.isKey(NVS_CD_SLOT_KEY) && !prefs.remove(NVS_CD_SLOT_KEY)) ok = false;
  return ok;
}
bool hasCandidateConfig(Preferences& prefs) {
  uint8_t slot = candidateSlot(prefs);
  return slot != NO_SLOT && lightweaver::projectStored(prefs, slotBlobKey(slot), slotStringKey(slot));
}
// The journal is the live slot before a promotion, not a copy of it.
bool hasPrevious(Preferences& prefs) { return prefs.isKey(NVS_PREV_SLOT_KEY); }
bool writePreviousSlot(Preferences& prefs, uint8_t slot) { return prefs.putUChar(NVS_PREV_SLOT_KEY, slot) > 0; }
bool removePrevious(Preferences& prefs) {
  return !prefs.isKey(NVS_PREV_SLOT_KEY) || prefs.remove(NVS_PREV_SLOT_KEY);
}
`);

// 2. readNvsString type checks follow the slot.
once(`    if (prefs.isKey(NVS_KNOWN_GOOD_BLOB_KEY)
            ? prefs.getType(NVS_KNOWN_GOOD_BLOB_KEY) != PT_BLOB
            : prefs.getType(key) != PT_STR) {`,
`    const char* liveBlob = slotBlobKey(liveSlot(prefs));
    if (prefs.isKey(liveBlob)
            ? prefs.getType(liveBlob) != PT_BLOB
            : prefs.getType(slotStringKey(liveSlot(prefs))) != PT_STR) {`);
once(`    if (prefs.isKey(NVS_CANDIDATE_BLOB_KEY)
            ? prefs.getType(NVS_CANDIDATE_BLOB_KEY) != PT_BLOB
            : prefs.getType(key) != PT_STR) {`,
`    const uint8_t cdSlot = candidateSlot(prefs);
    const char* cdBlob = slotBlobKey(cdSlot);
    if (prefs.isKey(cdBlob)
            ? prefs.getType(cdBlob) != PT_BLOB
            : prefs.getType(slotStringKey(cdSlot)) != PT_STR) {`);

// 3. restorePreviousKnownGood: put kgSlot back.
between(`bool restorePreviousKnownGood(Preferences& prefs) {`, `bool finalizeCommittedPromotion(Preferences& prefs) {`,
`bool restorePreviousKnownGood(Preferences& prefs) {
  if (!prefs.getBool(NVS_PROMOTION_ARMED_KEY, false)) {
    return removePrevious(prefs);
  }
  if (!hasPrevious(prefs)) return false;
  uint8_t previous = readSlot(prefs, NVS_PREV_SLOT_KEY, NO_SLOT);
  bool restored = false;
  if (previous == NO_SLOT) {
    // There was no project before this one: the promoted slot must go.
    restored = !hasKnownGood(prefs) || removeKnownGood(prefs);
    if (restored) restored = prefs.putUChar(NVS_KG_SLOT_KEY, otherSlot(liveSlot(prefs))) > 0;
  } else {
    restored = liveSlot(prefs) == previous || prefs.putUChar(NVS_KG_SLOT_KEY, previous) > 0;
  }
  if (!restored) return false;
  bool disarmed = prefs.putBool(NVS_PROMOTION_ARMED_KEY, false) > 0 ||
                  !prefs.getBool(NVS_PROMOTION_ARMED_KEY, false);
  if (!disarmed) return false;
  removePrevious(prefs);
  return true;
}

`);

// 4. Confirm: journal the live slot, arm, flip.
once(`  String previous = readKnownGood(prefs);
  bool journaled = previous.length()
    ? writePrevious(prefs, previous) == previous.length()
    : writePrevious(prefs, String(NVS_NO_PREVIOUS_KNOWN_GOOD)) ==
        strlen(NVS_NO_PREVIOUS_KNOWN_GOOD);`,
`  bool journaled = writePreviousSlot(prefs, hasKnownGood(prefs) ? liveSlot(prefs) : NO_SLOT);`);
between(`  // Erase the saved project before writing the candidate over it: an NVS`, `  bool confirmed = promoted && prefs.putString(NVS_CONFIRMED_ID_KEY`,
`  const uint8_t promotedSlot = candidateSlot(prefs);
  bool promoted = armed && promotedSlot != NO_SLOT &&
                  prefs.putUChar(NVS_KG_SLOT_KEY, promotedSlot) > 0 &&
                  readKnownGood(prefs) == candidate;
`);

// 5. Clear project removes every slot key.
once(`    NVS_PREVIOUS_KNOWN_GOOD_KEY,\n    NVS_PREVIOUS_BLOB_KEY,`, `    NVS_PREVIOUS_KNOWN_GOOD_KEY,\n    NVS_KG_SLOT_KEY,\n    NVS_CD_SLOT_KEY,\n    NVS_PREV_SLOT_KEY,`);
// 6. Boot metadata: the old journal blob key no longer exists.
once(`  if ((prefs.isKey(NVS_CANDIDATE_BLOB_KEY) && prefs.getType(NVS_CANDIDATE_BLOB_KEY) != PT_BLOB) ||
      (prefs.isKey(NVS_PREVIOUS_BLOB_KEY) && prefs.getType(NVS_PREVIOUS_BLOB_KEY) != PT_BLOB)) {`,
`  if ((prefs.isKey(NVS_CANDIDATE_BLOB_KEY) && prefs.getType(NVS_CANDIDATE_BLOB_KEY) != PT_BLOB) ||
      (prefs.isKey(NVS_PREV_SLOT_KEY) && prefs.getType(NVS_PREV_SLOT_KEY) != PT_U8)) {`);
writeFileSync(F, s);
console.log('slot swap applied; leftover mentions:',
  ['NVS_PREVIOUS_BLOB_KEY', 'writePrevious(', 'readPrevious('].map((k) => `${k} ${s.split(k).length - 1}`).join(', '));
