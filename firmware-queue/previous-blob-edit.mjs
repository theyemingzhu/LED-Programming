// One-off edit: store the promotion journal (previous known-good) as a blob.
// node firmware-queue/previous-blob-edit.mjs  (from the repo root)
import { readFileSync, writeFileSync } from 'node:fs';
const F = 'firmware/lightweaver-controller/src/LightweaverStorage.cpp';
let s = readFileSync(F, 'utf8');
const once = (from, to) => { const n = s.split(from).length - 1; if (n !== 1) throw new Error(`expected 1 of ${JSON.stringify(from).slice(0, 90)}, found ${n}`); s = s.replace(from, to); };
const count = (x) => s.split(x).length - 1;

once(`constexpr const char* NVS_CANDIDATE_BLOB_KEY = "cdConfigBlob";\n`,
`constexpr const char* NVS_CANDIDATE_BLOB_KEY = "cdConfigBlob";
// Confirming a candidate journals the previous project first, a full project
// copy: same one-page problem, so the same blob form ("candidate confirmation
// failed" on the real card, 2026-11-22, once the candidate itself fitted).
constexpr const char* NVS_PREVIOUS_BLOB_KEY = "prevKnownBlob";
`);
once(`bool hasCandidateConfig(Preferences& prefs) {`,
`String readPrevious(Preferences& prefs) {
  return lightweaver::readProject(prefs, NVS_PREVIOUS_BLOB_KEY, NVS_PREVIOUS_KNOWN_GOOD_KEY);
}
size_t writePrevious(Preferences& prefs, const String& json) {
  return lightweaver::writeProject(prefs, NVS_PREVIOUS_BLOB_KEY, NVS_PREVIOUS_KNOWN_GOOD_KEY, json);
}
bool removePrevious(Preferences& prefs) {
  return lightweaver::removeProject(prefs, NVS_PREVIOUS_BLOB_KEY, NVS_PREVIOUS_KNOWN_GOOD_KEY);
}
bool hasPrevious(Preferences& prefs) {
  return prefs.isKey(NVS_PREVIOUS_BLOB_KEY) || prefs.isKey(NVS_PREVIOUS_KNOWN_GOOD_KEY);
}
bool hasCandidateConfig(Preferences& prefs) {`);

// Guarded removals (two shapes, various indentation).
const before = count('NVS_PREVIOUS_KNOWN_GOOD_KEY');
s = s.replace(/!prefs\.isKey\(NVS_PREVIOUS_KNOWN_GOOD_KEY\) \|\|\s*\n\s*prefs\.remove\(NVS_PREVIOUS_KNOWN_GOOD_KEY\)/g, 'removePrevious(prefs)');
s = s.replace(/  prefs\.remove\(NVS_PREVIOUS_KNOWN_GOOD_KEY\);\n/g, '  removePrevious(prefs);\n');
s = s.replace(/prefs\.getString\(NVS_PREVIOUS_KNOWN_GOOD_KEY, ""\)/g, 'readPrevious(prefs)');
s = s.replace(/prefs\.putString\(NVS_PREVIOUS_KNOWN_GOOD_KEY, previous\)/g, 'writePrevious(prefs, previous)');
s = s.replace(/prefs\.putString\(NVS_PREVIOUS_KNOWN_GOOD_KEY, NVS_NO_PREVIOUS_KNOWN_GOOD\)/g, 'writePrevious(prefs, String(NVS_NO_PREVIOUS_KNOWN_GOOD))');
// Presence checks, except inside hasPrevious itself.
s = s.replace(/prefs\.isKey\(NVS_PREVIOUS_KNOWN_GOOD_KEY\)(?!;\n\})/g, (m, off) => (s.slice(off - 60, off).includes('NVS_PREVIOUS_BLOB_KEY) ||') ? m : 'hasPrevious(prefs)'));
// Clear-project list.
once(`    NVS_CANDIDATE_BLOB_KEY,\n    NVS_PREVIOUS_KNOWN_GOOD_KEY,`, `    NVS_CANDIDATE_BLOB_KEY,\n    NVS_PREVIOUS_KNOWN_GOOD_KEY,\n    NVS_PREVIOUS_BLOB_KEY,`);
// Boot metadata: the journal blob must be a blob.
once(`  if (prefs.isKey(NVS_CANDIDATE_BLOB_KEY) && prefs.getType(NVS_CANDIDATE_BLOB_KEY) != PT_BLOB) {`,
`  if ((prefs.isKey(NVS_CANDIDATE_BLOB_KEY) && prefs.getType(NVS_CANDIDATE_BLOB_KEY) != PT_BLOB) ||
      (prefs.isKey(NVS_PREVIOUS_BLOB_KEY) && prefs.getType(NVS_PREVIOUS_BLOB_KEY) != PT_BLOB)) {`);
writeFileSync(F, s);
console.log('NVS_PREVIOUS_KNOWN_GOOD_KEY mentions', before, '->', count('NVS_PREVIOUS_KNOWN_GOOD_KEY'));
