#pragma once

#include <stddef.h>
#include <stdint.h>

// Where a recorded look (.lwseq) lives. A microSD keeps working exactly as it
// always has; a card with no microSD keeps a short recording in its built-in
// flash, in the same LittleFS filesystem the project store already mounts.
//
// This header is pure arithmetic and file-step ordering, with no Arduino
// dependency, so tests/media-store-policy.cpp runs the shipped rules on a host.
//
// The budget (measured 2026-11-23 from the build's own default_16MB.csv):
//   spiffs/LittleFS partition            0x360000 = 3,538,944 bytes
//   project store, worst moment          current + known-good + staging,
//                                        3 x 768 KiB, + 64 KiB recovery
//                                        headroom = 2,424,832 bytes
//   project store's own quota            3 MiB counted against the WHOLE
//                                        filesystem's used bytes
// The quota is the tighter of the two: recordings count against it, so
//   recordings + filesystem overhead <= 3 MiB - 2,424,832 = 720,896 bytes.
// 64 KiB is held back for LittleFS's own blocks (directories, the per-file
// block chain), leaving 640 KiB = 655,360 bytes for every recording together.

static constexpr size_t LW_FLASH_MEDIA_PARTITION_BYTES = 0x360000;
static constexpr size_t LW_FLASH_MEDIA_BLOCK_BYTES = 4096;
static constexpr size_t LW_FLASH_MEDIA_MAX_BYTES = 640u * 1024u;
static constexpr size_t LW_FLASH_MEDIA_FS_OVERHEAD_BYTES = 64u * 1024u;
// The longest single recording, in file bytes: 160 blocks of 4,088 usable
// bytes = 654,080. At 24 frames a second that is 54 s for 168 lights and 13 s
// for 675 (bytes = lights x 3 x 24 x seconds + 64).
static constexpr size_t LW_FLASH_MEDIA_MAX_FILE_BYTES =
    (LW_FLASH_MEDIA_MAX_BYTES / LW_FLASH_MEDIA_BLOCK_BYTES) * (LW_FLASH_MEDIA_BLOCK_BYTES - 8);
static constexpr size_t LW_FLASH_MEDIA_SPACE_MARGIN_BYTES = 4096;

// Mirrors of the project store's limits, kept numeric here so the host test
// needs no Arduino. LightweaverMedia.cpp static_asserts they still agree.
static constexpr size_t LW_FLASH_MEDIA_PROJECT_MAX_BYTES = 768u * 1024u;
static constexpr size_t LW_FLASH_MEDIA_PROJECT_HEADROOM_BYTES = 64u * 1024u;
static constexpr size_t LW_FLASH_MEDIA_PROJECT_QUOTA_BYTES = 3u * 1024u * 1024u;
static constexpr size_t LW_FLASH_MEDIA_PROJECT_WORST_BYTES =
    3u * LW_FLASH_MEDIA_PROJECT_MAX_BYTES + LW_FLASH_MEDIA_PROJECT_HEADROOM_BYTES;

static_assert(LW_FLASH_MEDIA_MAX_BYTES + LW_FLASH_MEDIA_FS_OVERHEAD_BYTES +
    LW_FLASH_MEDIA_PROJECT_WORST_BYTES <= LW_FLASH_MEDIA_PROJECT_QUOTA_BYTES,
    "recordings must never push a full-size project save past the store's quota");
static_assert(LW_FLASH_MEDIA_MAX_BYTES + LW_FLASH_MEDIA_FS_OVERHEAD_BYTES +
    LW_FLASH_MEDIA_PROJECT_WORST_BYTES <= LW_FLASH_MEDIA_PARTITION_BYTES,
    "recordings and a full-size project store must fit the partition together");

enum class LwMediaStore : uint8_t { None, Sd, Flash };

// A microSD always wins: a card that has one behaves exactly as before.
inline LwMediaStore lwSelectMediaStore(bool sdPresent, bool flashAvailable) {
  if (sdPresent) return LwMediaStore::Sd;
  return flashAvailable ? LwMediaStore::Flash : LwMediaStore::None;
}

inline const char* lwMediaStoreName(LwMediaStore store) {
  return store == LwMediaStore::Sd ? "sd" : store == LwMediaStore::Flash ? "flash" : "none";
}

// What a file really costs in LittleFS: whole 4 KiB blocks, each giving up a
// few bytes to the block chain. Rounding with 4,088 usable bytes per block
// over-counts slightly, which is the safe direction.
inline size_t lwFlashMediaFootprint(size_t bytes) {
  if (!bytes) return LW_FLASH_MEDIA_BLOCK_BYTES;
  const size_t usable = LW_FLASH_MEDIA_BLOCK_BYTES - 8;
  return ((bytes + usable - 1) / usable) * LW_FLASH_MEDIA_BLOCK_BYTES;
}

// The built-in store is only trusted on the partition the budget was measured
// for. A smaller filesystem means a different partition table; refuse.
inline bool lwFlashMediaFilesystemTrusted(size_t filesystemTotalBytes) {
  return filesystemTotalBytes >= LW_FLASH_MEDIA_PARTITION_BYTES - 2u * LW_FLASH_MEDIA_BLOCK_BYTES;
}

enum class LwFlashMediaAdmission : uint8_t { Fits, OverLimit, StoreFull, FilesystemFull };

// `keptFootprint` is what must stay on the card: recordings the running
// project plays plus the other files this save declared. Anything else in
// /sequences can be cleared first, so it is not counted here.
// `filesystemFreeBytes` is what the filesystem would have after that clearing.
inline LwFlashMediaAdmission lwAdmitFlashMedia(size_t bytes, size_t keptFootprint,
                                               size_t filesystemFreeBytes) {
  const size_t footprint = lwFlashMediaFootprint(bytes);
  if (footprint > LW_FLASH_MEDIA_MAX_BYTES) return LwFlashMediaAdmission::OverLimit;
  if (keptFootprint > LW_FLASH_MEDIA_MAX_BYTES - footprint) return LwFlashMediaAdmission::StoreFull;
  if (filesystemFreeBytes < footprint + LW_FLASH_MEDIA_SPACE_MARGIN_BYTES)
    return LwFlashMediaAdmission::FilesystemFull;
  return LwFlashMediaAdmission::Fits;
}

// Room one more recording could take right now, for the status report.
inline size_t lwFlashMediaFreeBytes(size_t keptFootprint, size_t filesystemFreeAfterClearing) {
  if (keptFootprint >= LW_FLASH_MEDIA_MAX_BYTES) return 0;
  size_t room = LW_FLASH_MEDIA_MAX_BYTES - keptFootprint;
  const size_t fsRoom = filesystemFreeAfterClearing > LW_FLASH_MEDIA_SPACE_MARGIN_BYTES
      ? filesystemFreeAfterClearing - LW_FLASH_MEDIA_SPACE_MARGIN_BYTES : 0;
  if (fsRoom < room) room = fsRoom;
  // Report what a file's bytes can be, not the block-rounded footprint.
  return (room / LW_FLASH_MEDIA_BLOCK_BYTES) * (LW_FLASH_MEDIA_BLOCK_BYTES - 8);
}

// A file in the built-in /sequences folder may be cleared to make room only
// when nothing can still play it: the running project does not name it and the
// save in progress did not declare it. The previous project's recordings are
// therefore still there if this save is rolled back.
inline bool lwFlashMediaEvictable(bool playedByRunningProject, bool declaredByThisSave) {
  return !playedByRunningProject && !declaredByThisSave;
}

// Only this folder is ever read or written in the built-in filesystem, so a
// recording can never name, overwrite or read a project-store file.
inline bool lwMediaPathInSequences(const char* path) {
  static const char prefix[] = "/sequences/";
  if (path == nullptr) return false;
  for (size_t index = 0; index < sizeof(prefix) - 1; index++) {
    if (path[index] != prefix[index]) return false;
  }
  for (const char* cursor = path + sizeof(prefix) - 1; *cursor; cursor++) {
    if (*cursor == '/') return false;
  }
  return path[sizeof(prefix) - 1] != 0;
}

// The three file steps of an upload, shared by microSD and built-in flash.
// Bytes only ever land in the one staging file. A look can only name
// /sequences/<sha256>.lwseq, and that name appears in a single atomic rename
// after the whole staged file has been hashed. Power lost at any earlier step
// leaves at most the staging file, which nothing can play and which the next
// upload removes.
template <typename Fs>
inline bool lwMediaDiscardStaging(Fs& fs, const char* stagingPath) {
  return !fs.exists(stagingPath) || fs.remove(stagingPath);
}

template <typename Fs>
inline bool lwMediaPromote(Fs& fs, const char* stagingPath, const char* finalPath) {
  return !fs.exists(finalPath) && fs.rename(stagingPath, finalPath);
}
