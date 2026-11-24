// Runs the shipped LightweaverMediaStorePolicy.h on a host: which store a
// recording goes to, the built-in memory limit, the not-enough-room refusals,
// what may be cleared, and that an upload cut off at any step leaves nothing a
// look could play and nothing changed in the project store.

#include <cassert>
#include <cstdio>
#include <map>
#include <string>

#include "LightweaverMediaStorePolicy.h"

namespace {

// The four calls LightweaverMedia.cpp makes on SD and on LittleFS.
struct FakeFs {
  std::map<std::string, std::string> files;
  bool exists(const char* path) const { return files.count(path) > 0; }
  bool remove(const char* path) { return files.erase(path) > 0; }
  bool rename(const char* from, const char* to) {
    if (!exists(from) || exists(to)) return false;
    files[to] = files[from];
    files.erase(from);
    return true;
  }
};

const char* kStaging = "/sequences/.upload-staging.tmp";
const char* kFinal =
    "/sequences/0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef.lwseq";

// The upload exactly as the card performs it, one numbered step per request:
// step 0 is begin, steps 1..chunks are the chunk writes, the last is commit.
// `stopAfter` cuts the power once that many steps have completed.
bool upload(FakeFs& fs, const std::string& recording, size_t chunkBytes, size_t stopAfter) {
  size_t step = 0;
  if (!lwMediaDiscardStaging(fs, kStaging)) return false;
  fs.files[kStaging] = "";
  if (++step > stopAfter) return false;
  for (size_t offset = 0; offset < recording.size(); offset += chunkBytes) {
    fs.files[kStaging] += recording.substr(offset, chunkBytes);
    if (++step > stopAfter) return false;
  }
  // Commit: the whole staged file is read back and compared before promotion.
  if (fs.files[kStaging] != recording) return false;
  return lwMediaPromote(fs, kStaging, kFinal);
}

// What playback demands before it shows a frame: the file a look names exists
// and its bytes match the look's declared hash (modelled as the exact bytes).
bool playable(const FakeFs& fs, const std::string& recording) {
  const auto found = fs.files.find(kFinal);
  return found != fs.files.end() && found->second == recording;
}

void storeSelection() {
  assert(lwSelectMediaStore(true, true) == LwMediaStore::Sd);
  assert(lwSelectMediaStore(true, false) == LwMediaStore::Sd);
  assert(lwSelectMediaStore(false, true) == LwMediaStore::Flash);
  assert(lwSelectMediaStore(false, false) == LwMediaStore::None);
  assert(std::string(lwMediaStoreName(LwMediaStore::Sd)) == "sd");
  assert(std::string(lwMediaStoreName(LwMediaStore::Flash)) == "flash");
  assert(std::string(lwMediaStoreName(LwMediaStore::None)) == "none");
}

void budget() {
  // The numbers the limit was worked out from; see the header's comment.
  assert(LW_FLASH_MEDIA_PARTITION_BYTES == 3538944u);
  assert(LW_FLASH_MEDIA_PROJECT_WORST_BYTES == 2424832u);
  assert(LW_FLASH_MEDIA_MAX_BYTES == 655360u);
  assert(LW_FLASH_MEDIA_MAX_FILE_BYTES == 654080u);
  // A full-size project save still fits the store's own 3 MiB quota when
  // recordings and filesystem overhead are both at their largest.
  const size_t othersUsed = LW_FLASH_MEDIA_MAX_BYTES + LW_FLASH_MEDIA_FS_OVERHEAD_BYTES +
      2u * LW_FLASH_MEDIA_PROJECT_MAX_BYTES;
  assert(LW_FLASH_MEDIA_PROJECT_MAX_BYTES + LW_FLASH_MEDIA_PROJECT_HEADROOM_BYTES <=
      LW_FLASH_MEDIA_PROJECT_QUOTA_BYTES - othersUsed);
  assert(LW_FLASH_MEDIA_PROJECT_MAX_BYTES + LW_FLASH_MEDIA_PROJECT_HEADROOM_BYTES <=
      LW_FLASH_MEDIA_PARTITION_BYTES - othersUsed);
  // Seconds at 24 frames a second: bytes = lights x 3 x 24 x seconds + 64.
  assert((LW_FLASH_MEDIA_MAX_FILE_BYTES - 64u) / (168u * 3u * 24u) == 54u);
  assert((LW_FLASH_MEDIA_MAX_FILE_BYTES - 64u) / (675u * 3u * 24u) == 13u);
  // A different partition table voids the arithmetic: built-in memory is off.
  assert(lwFlashMediaFilesystemTrusted(3538944u));
  assert(!lwFlashMediaFilesystemTrusted(1441792u));
}

void footprint() {
  assert(lwFlashMediaFootprint(0) == 4096u);
  assert(lwFlashMediaFootprint(1) == 4096u);
  assert(lwFlashMediaFootprint(4088) == 4096u);
  assert(lwFlashMediaFootprint(4089) == 8192u);
  assert(lwFlashMediaFootprint(LW_FLASH_MEDIA_MAX_FILE_BYTES) == LW_FLASH_MEDIA_MAX_BYTES);
}

void admission() {
  const size_t roomy = 2u * 1024u * 1024u;
  // Five seconds for 168 lights and for 675 lights both fit an empty store.
  assert(lwAdmitFlashMedia(168u * 3u * 24u * 5u + 64u, 0, roomy) == LwFlashMediaAdmission::Fits);
  assert(lwAdmitFlashMedia(675u * 3u * 24u * 5u + 64u, 0, roomy) == LwFlashMediaAdmission::Fits);
  // Limit refusal: exactly the limit fits, one byte more never does, however
  // empty the filesystem is.
  assert(lwAdmitFlashMedia(LW_FLASH_MEDIA_MAX_FILE_BYTES, 0, roomy) == LwFlashMediaAdmission::Fits);
  assert(lwAdmitFlashMedia(LW_FLASH_MEDIA_MAX_FILE_BYTES + 1, 0, roomy) ==
      LwFlashMediaAdmission::OverLimit);
  assert(lwAdmitFlashMedia(16777216u, 0, 16u * 1024u * 1024u) == LwFlashMediaAdmission::OverLimit);
  // Recordings still in use count against the same limit.
  const size_t kept = lwFlashMediaFootprint(400u * 1024u);
  assert(lwAdmitFlashMedia(200u * 1024u, kept, roomy) == LwFlashMediaAdmission::Fits);
  assert(lwAdmitFlashMedia(300u * 1024u, kept, roomy) == LwFlashMediaAdmission::StoreFull);
  // Not-enough-space refusal: under the limit, but the filesystem itself has
  // less than the recording plus a spare block.
  const size_t bytes = 100u * 1024u;
  const size_t needs = lwFlashMediaFootprint(bytes) + LW_FLASH_MEDIA_SPACE_MARGIN_BYTES;
  assert(lwAdmitFlashMedia(bytes, 0, needs) == LwFlashMediaAdmission::Fits);
  assert(lwAdmitFlashMedia(bytes, 0, needs - 1) == LwFlashMediaAdmission::FilesystemFull);
  assert(lwAdmitFlashMedia(bytes, 0, 0) == LwFlashMediaAdmission::FilesystemFull);
  // The room reported to Studio is itself always admitted.
  const size_t reported = lwFlashMediaFreeBytes(kept, roomy);
  assert(reported > 0 && lwAdmitFlashMedia(reported, kept, roomy) == LwFlashMediaAdmission::Fits);
  assert(lwFlashMediaFreeBytes(0, roomy) == LW_FLASH_MEDIA_MAX_FILE_BYTES);
  assert(lwFlashMediaFreeBytes(LW_FLASH_MEDIA_MAX_BYTES, roomy) == 0);
  assert(lwFlashMediaFreeBytes(0, 0) == 0);
}

void clearing() {
  // Only a recording nothing can play any more may be cleared.
  assert(lwFlashMediaEvictable(false, false));
  assert(!lwFlashMediaEvictable(true, false));
  assert(!lwFlashMediaEvictable(false, true));
  assert(!lwFlashMediaEvictable(true, true));
  // Built-in memory is only ever addressed inside /sequences.
  assert(lwMediaPathInSequences(kFinal));
  assert(lwMediaPathInSequences(kStaging));
  assert(!lwMediaPathInSequences("/lw-projects/head.json"));
  assert(!lwMediaPathInSequences("/sequences/"));
  assert(!lwMediaPathInSequences("/sequences/../lw-projects/head.json"));
  assert(!lwMediaPathInSequences("/sequences/a/b.lwseq"));
  assert(!lwMediaPathInSequences(""));
  assert(!lwMediaPathInSequences(nullptr));
}

void interruptedUpload() {
  const std::string recording(5000, 'r');
  const size_t chunkBytes = 2048;
  const size_t chunks = 3;
  const std::map<std::string, std::string> project = {
    {"/lw-projects/head.json", "{\"current\":\"abc\"}"},
    {"/lw-projects/immutable-abc.json", std::string(3000, 'p')},
  };
  // Cut the power after every possible number of completed steps short of the
  // commit: after begin alone, and after each chunk.
  for (size_t stopAfter = 0; stopAfter <= chunks; stopAfter++) {
    FakeFs fs;
    fs.files = project;
    assert(!upload(fs, recording, chunkBytes, stopAfter));
    assert(!fs.exists(kFinal));
    assert(!playable(fs, recording));
    for (const auto& file : project) assert(fs.files.at(file.first) == file.second);
    // Only the one staging file is left behind, and it is not a name a look
    // can carry.
    assert(fs.files.size() == project.size() + 1u);
    assert(fs.exists(kStaging));
    // After the restart the next upload removes it and completes normally.
    assert(upload(fs, recording, chunkBytes, 100));
    assert(playable(fs, recording));
    assert(!fs.exists(kStaging));
    for (const auto& file : project) assert(fs.files.at(file.first) == file.second);
  }
  // A staged file that is not the declared recording is never promoted.
  FakeFs wrong;
  wrong.files[kStaging] = "not the recording";
  assert(!(wrong.files[kStaging] == recording && lwMediaPromote(wrong, kStaging, kFinal)));
  assert(!wrong.exists(kFinal));
  // Promotion never replaces a recording that is already there.
  FakeFs taken;
  taken.files[kFinal] = "earlier";
  taken.files[kStaging] = recording;
  assert(!lwMediaPromote(taken, kStaging, kFinal));
  assert(taken.files[kFinal] == "earlier");
}

}  // namespace

int main() {
  storeSelection();
  budget();
  footprint();
  admission();
  clearing();
  interruptedUpload();
  std::puts("media store policy: 6 groups passed");
  return 0;
}
