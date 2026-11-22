// One-off edit: store the wiring candidate as a blob like the known-good project.
// node firmware-queue/candidate-blob-edit.mjs  (from the repo root)
import { readFileSync, writeFileSync } from 'node:fs';
const F = 'firmware/lightweaver-controller/src/LightweaverStorage.cpp';
let s = readFileSync(F, 'utf8');
const once = (from, to) => { const n = s.split(from).length - 1; if (n !== 1) throw new Error(`expected 1 of ${JSON.stringify(from).slice(0, 80)}, found ${n}`); s = s.replace(from, to); };
const all = (from, to, min = 1) => { const n = s.split(from).length - 1; if (n < min) throw new Error(`expected >=${min} of ${JSON.stringify(from).slice(0, 80)}, found ${n}`); s = s.split(from).join(to); return n; };

// 1. Key + helpers, right after the known-good blob helpers.
once(`constexpr const char* NVS_KNOWN_GOOD_BLOB_KEY = "kgConfigBlob";\n`,
`constexpr const char* NVS_KNOWN_GOOD_BLOB_KEY = "kgConfigBlob";
// The staged wiring candidate is a blob for the same reason as the project:
// a string must fit whole in one NVS page, and beside a saved project there
// may be no page with room for it ("candidate storage failed", real card
// lw-b0fe81f61b44, 2026-11-22). NVS_CANDIDATE_CONFIG_KEY is the string an
// older firmware left; it is read until the next staging replaces it.
constexpr const char* NVS_CANDIDATE_BLOB_KEY = "cdConfigBlob";
`);
once(`size_t writeKnownGood(Preferences& prefs, const String& json) {\n  return lightweaver::writeProject(prefs, NVS_KNOWN_GOOD_BLOB_KEY, NVS_KNOWN_GOOD_CONFIG_KEY, json);\n}\n`,
`size_t writeKnownGood(Preferences& prefs, const String& json) {
  return lightweaver::writeProject(prefs, NVS_KNOWN_GOOD_BLOB_KEY, NVS_KNOWN_GOOD_CONFIG_KEY, json);
}
String readCandidate(Preferences& prefs) {
  return lightweaver::readProject(prefs, NVS_CANDIDATE_BLOB_KEY, NVS_CANDIDATE_CONFIG_KEY);
}
size_t writeCandidate(Preferences& prefs, const String& json) {
  return lightweaver::writeProject(prefs, NVS_CANDIDATE_BLOB_KEY, NVS_CANDIDATE_CONFIG_KEY, json);
}
bool removeCandidate(Preferences& prefs) {
  return lightweaver::removeProject(prefs, NVS_CANDIDATE_BLOB_KEY, NVS_CANDIDATE_CONFIG_KEY);
}
bool hasCandidateConfig(Preferences& prefs) {
  return prefs.isKey(NVS_CANDIDATE_BLOB_KEY) || prefs.isKey(NVS_CANDIDATE_CONFIG_KEY);
}
`);
once(`bool isKnownGoodKey(const char* key) {\n  return strcmp(key, NVS_KNOWN_GOOD_CONFIG_KEY) == 0;\n}\n`,
`bool isKnownGoodKey(const char* key) {
  return strcmp(key, NVS_KNOWN_GOOD_CONFIG_KEY) == 0;
}
bool isCandidateKey(const char* key) {
  return strcmp(key, NVS_CANDIDATE_CONFIG_KEY) == 0;
}
`);

// 2. Reads.
all(`prefs.getString(NVS_CANDIDATE_CONFIG_KEY, "")`, `readCandidate(prefs)`, 6);
// 3. Removals guarded by isKey.
s = s.replace(/!prefs\.isKey\(NVS_CANDIDATE_CONFIG_KEY\) \|\|\s*\n\s*prefs\.remove\(NVS_CANDIDATE_CONFIG_KEY\)/g, 'removeCandidate(prefs)');
// 4. Write.
once(`  prefs.putString(NVS_CANDIDATE_CONFIG_KEY, json);\n`, `  writeCandidate(prefs, json);\n`);
// 5. Bare removals.
all(`prefs.remove(NVS_CANDIDATE_CONFIG_KEY);`, `removeCandidate(prefs);`, 2);
// 6. Presence.
all(`prefs.isKey(NVS_CANDIDATE_CONFIG_KEY)`, `hasCandidateConfig(prefs)`, 2);
// 7. Clear-project key list.
once(`    NVS_CANDIDATE_CONFIG_KEY,\n    NVS_PREVIOUS_KNOWN_GOOD_KEY,`, `    NVS_CANDIDATE_CONFIG_KEY,\n    NVS_CANDIDATE_BLOB_KEY,\n    NVS_PREVIOUS_KNOWN_GOOD_KEY,`);
// 8. Strict boot read and the legacy digest write-back.
once(`  if (!prefs.isKey(key)) return ProvisioningStorageState::Absent;\n  if (prefs.getType(key) != PT_STR) {`,
`  if (isCandidateKey(key)) {
    if (!hasCandidateConfig(prefs)) return ProvisioningStorageState::Absent;
    if (prefs.isKey(NVS_CANDIDATE_BLOB_KEY)
            ? prefs.getType(NVS_CANDIDATE_BLOB_KEY) != PT_BLOB
            : prefs.getType(key) != PT_STR) {
      message = String("nvs value has invalid type: ") + key;
      return ProvisioningStorageState::Error;
    }
    value = readCandidate(prefs);
    if (!value.length()) {
      message = String("nvs value read failed or empty: ") + key;
      return ProvisioningStorageState::Error;
    }
    return ProvisioningStorageState::Present;
  }
  if (!prefs.isKey(key)) return ProvisioningStorageState::Absent;
  if (prefs.getType(key) != PT_STR) {`);
once(`    if (isKnownGoodKey(key)) writeKnownGood(prefs, json);\n    else prefs.putString(key, json);`,
`    if (isKnownGoodKey(key)) writeKnownGood(prefs, json);\n    else if (isCandidateKey(key)) writeCandidate(prefs, json);\n    else prefs.putString(key, json);`);
once(`String readback = isKnownGoodKey(key) ? readKnownGood(prefs) : prefs.getString(key, "");`,
`String readback = isKnownGoodKey(key) ? readKnownGood(prefs)\n                      : isCandidateKey(key) ? readCandidate(prefs)\n                      : prefs.getString(key, "");`);
// 9. Boot metadata check: the blob must be a blob.
once(`bool validateCandidateMetadataForBoot(Preferences& prefs, WiringCandidateState state,\n                                      String& message) {\n`,
`bool validateCandidateMetadataForBoot(Preferences& prefs, WiringCandidateState state,\n                                      String& message) {\n  if (prefs.isKey(NVS_CANDIDATE_BLOB_KEY) && prefs.getType(NVS_CANDIDATE_BLOB_KEY) != PT_BLOB) {\n    message = "candidate metadata corrupt: invalid candidate blob type";\n    return false;\n  }\n`);

const left = (s.match(/NVS_CANDIDATE_CONFIG_KEY/g) || []).length;
writeFileSync(F, s);
console.log('edited; remaining NVS_CANDIDATE_CONFIG_KEY mentions:', left);
