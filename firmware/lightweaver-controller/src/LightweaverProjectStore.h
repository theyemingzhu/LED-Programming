#pragma once

// How the canonical (known-good) project is laid down in NVS.
//
// The NVS partition is 0x5000 bytes (default_16MB.csv): five 4096-byte pages,
// one of which NVS always keeps empty for garbage collection. Each of the four
// usable pages holds 126 entries of 32 bytes.
//
// A STRING must sit in one page as one contiguous run: 1 header entry plus
// ceil((bytes + 1) / 32) data entries. A 3,514-byte project is 111 entries of
// a 126-entry page, so it needs a page holding at most 15 entries of anything
// else. NVS reclaims one page per write (PageManager::requestNewPage), and the
// old project is erased only after the new one is written, so the page the old
// project lives in is never the one reclaimed. Once the card's small keys
// (Wi-Fi, PHY calibration, saved looks, playlist) are spread over the other
// pages, no page can ever take the string again and every save is refused,
// however much total space is free.
//
// A BLOB is split into chunks across pages, using whatever is free on each
// (Storage::writeMultiPageBlob). It needs total free space, not one empty
// page, and it keeps the same power-loss guarantee: the new version becomes
// visible only when its index entry is written, and the previous version is
// erased after that.
//
// So the project is written as a blob under its own key. A project an older
// firmware left as a string is read as before and is removed only after the
// blob that replaces it has been committed.
//
// Templated on the Preferences type so the host test can run this exact code
// against a model of the NVS page rules (tests/project-store-nvs-room.cpp).

#include <Arduino.h>
#include <cstddef>
#include <new>

namespace lightweaver {

constexpr size_t NVS_ENTRY_BYTES = 32;
constexpr size_t NVS_PAGE_ENTRIES = 126;
// Entries a blob costs beyond its data: one header per chunk (a chunk per page
// touched, and a first chunk may be a short tail), one index entry, and slack
// so the promise below is never off by a boundary.
constexpr size_t NVS_BLOB_OVERHEAD_ENTRIES = 12;

constexpr size_t nvsBlobEntries(size_t bytes) {
  return (bytes + NVS_ENTRY_BYTES - 1) / NVS_ENTRY_BYTES + NVS_BLOB_OVERHEAD_ENTRIES;
}

constexpr size_t nvsStringEntries(size_t bytes) {
  return 1 + (bytes + 1 + NVS_ENTRY_BYTES - 1) / NVS_ENTRY_BYTES;
}

// The largest project a save can take right now. freeEntries is
// nvs_stats_t.free_entries, which counts every entry not holding live data,
// including the page NVS keeps back for garbage collection. The project being
// replaced is still live while its replacement is written, so its entries are
// correctly not counted as room.
//
// NVS will not start a blob in a hole smaller than a tenth of a page (13
// entries) unless the whole blob fits there. With fewer than 56 spare entries
// the four pages could each hold only such a hole, so below that the honest
// answer is that nothing is promised.
constexpr size_t NVS_BLOB_START_FLOOR_ENTRIES = 56;

constexpr size_t nvsSpareEntries(size_t freeEntries) {
  return freeEntries > NVS_PAGE_ENTRIES ? freeEntries - NVS_PAGE_ENTRIES : 0;
}

constexpr size_t projectRoomBytes(size_t freeEntries, size_t limitBytes) {
  return nvsSpareEntries(freeEntries) < NVS_BLOB_START_FLOOR_ENTRIES
      ? 0
      : ((nvsSpareEntries(freeEntries) - NVS_BLOB_OVERHEAD_ENTRIES) * NVS_ENTRY_BYTES < limitBytes
          ? (nvsSpareEntries(freeEntries) - NVS_BLOB_OVERHEAD_ENTRIES) * NVS_ENTRY_BYTES
          : limitBytes);
}

// True when another record may grow to newBytes (a string) and still leave
// room for a project of limitBytes to replace the current one. A record that
// is not growing is always allowed: it cannot make things worse.
constexpr bool recordLeavesProjectRoom(size_t freeEntries, size_t oldBytes, bool hadOld,
                                       size_t newBytes, size_t limitBytes) {
  return (hadOld && newBytes <= oldBytes) ||
         freeEntries + (hadOld ? nvsStringEntries(oldBytes) : 0) >=
             nvsStringEntries(newBytes) + NVS_PAGE_ENTRIES + nvsBlobEntries(limitBytes);
}

template <class Prefs>
bool projectStored(Prefs& prefs, const char* blobKey, const char* stringKey) {
  return prefs.isKey(blobKey) || prefs.isKey(stringKey);
}

// The blob wins whenever it exists: it is only ever written as the newer copy.
// An unreadable blob reads as empty rather than falling back to the string,
// which could be an older project.
template <class Prefs>
String readProject(Prefs& prefs, const char* blobKey, const char* stringKey) {
  if (!prefs.isKey(blobKey)) {
    return prefs.isKey(stringKey) ? prefs.getString(stringKey, "") : String("");
  }
  const size_t length = prefs.getBytesLength(blobKey);
  if (!length) return String("");
  char* buffer = new (std::nothrow) char[length + 1];
  if (!buffer) return String("");
  const size_t read = prefs.getBytes(blobKey, buffer, length);
  buffer[read == length ? length : 0] = '\0';
  String value(buffer);
  delete[] buffer;
  return value;
}

// Returns json.length() when the project is committed, 0 when nothing changed.
// The older string copy goes only after the blob is in place; if power drops
// between the two, both exist and readProject returns the blob.
template <class Prefs>
size_t writeProject(Prefs& prefs, const char* blobKey, const char* stringKey,
                    const String& json) {
  const size_t length = json.length();
  if (!length) return 0;
  if (prefs.putBytes(blobKey, json.c_str(), length) != length) return 0;
  if (prefs.isKey(stringKey)) prefs.remove(stringKey);
  return length;
}

template <class Prefs>
bool removeProject(Prefs& prefs, const char* blobKey, const char* stringKey) {
  bool ok = true;
  if (prefs.isKey(blobKey) && !prefs.remove(blobKey)) ok = false;
  if (prefs.isKey(stringKey) && !prefs.remove(stringKey)) ok = false;
  return ok;
}

}  // namespace lightweaver
