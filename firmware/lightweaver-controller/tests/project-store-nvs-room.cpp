// Host harness for LightweaverProjectStore.h.
//
// Runs the SHIPPED project read/write/room code against a model of the NVS
// page rules, so "a project under the stated limit can always replace the
// current one" is checked against how NVS allocates rather than against a
// map that accepts everything.
//
// The model follows ESP-IDF v4.4.7 components/nvs_flash/src (the IDF inside
// arduino-esp32 2.0.17, which platformio.ini pins):
//   Storage::writeItem          - a string goes on the current page; if it
//                                 does not fit, ONE new page is requested and
//                                 a second miss is ESP_ERR_NVS_NOT_ENOUGH_SPACE.
//                                 The old value is erased only afterwards.
//   Storage::writeMultiPageBlob - a blob is chunked across pages, one
//                                 requestNewPage per chunk; the index entry
//                                 is written last; the old version is erased
//                                 after that.
//   PageManager::requestNewPage - with one free page left, the page with the
//                                 most unused entries is copied into it and
//                                 erased.
//   Page::getVarDataTailroom    - (126 - next - 1) * 32, 0 on a full page.
//   Page::calcEntries           - free_entries counts everything not live,
//                                 including the spare page.
// The partition is 0x5000 bytes (default_16MB.csv): five pages.

#include <cassert>
#include <cstdio>
#include <cstring>
#include <string>
#include <vector>

#include "Arduino.h"
#include "LightweaverProjectStore.h"

namespace {

constexpr int ENTRY_COUNT = 126;
constexpr int ENTRY_SIZE = 32;
constexpr int PAGE_COUNT = 5;
constexpr int CHUNK_MAX = ENTRY_SIZE * (ENTRY_COUNT - 1);

struct PowerLoss {};

enum class Kind { Small, Str, BlobData, BlobIdx };

struct Record {
  std::string key;
  Kind kind = Kind::Small;
  int span = 1;
  int chunk = 0;       // BlobData: chunk index. BlobIdx: chunkStart.
  int chunkCount = 0;  // BlobIdx only.
  std::string data;
  bool live = true;
  long sequence = 0;
};

struct Page {
  std::vector<Record> records;
  int next = 0;
  bool full = false;
  int used() const {
    int total = 0;
    for (const Record& r : records) if (r.live) total += r.span;
    return total;
  }
  int tailroom() const {
    if (full) return 0;
    return next < ENTRY_COUNT - 1 ? (ENTRY_COUNT - next - 1) * ENTRY_SIZE : 0;
  }
};

class Nvs {
 public:
  Nvs() {
    for (int i = 1; i < PAGE_COUNT; ++i) freePages_.push_back(i);
    order_.push_back(0);
  }

  // Flash operations left before the power drops; negative means never.
  long powerBudget = -1;

  bool setSmall(const std::string& key) { return setSingle(key, Kind::Small, 1, ""); }
  bool setString(const std::string& key, const std::string& value) {
    const int span = 1 + (static_cast<int>(value.size()) + 1 + ENTRY_SIZE - 1) / ENTRY_SIZE;
    if (span > ENTRY_COUNT) return false;
    return setSingle(key, Kind::Str, span, value);
  }

  bool setBlob(const std::string& key, const std::string& value) {
    Record* index = find(key, Kind::BlobIdx);
    int previousStart = -1;
    if (index) {
      if (readBlob(key) == value) return true;
      previousStart = index->chunk;
    }
    const int nextStart = previousStart == 0 ? 128 : 0;
    if (!writeBlob(key, value, nextStart)) return false;
    if (previousStart >= 0) eraseBlobVersion(key, previousStart);
    return true;
  }

  bool has(const std::string& key, Kind kind) { return find(key, kind) != nullptr; }
  std::string readString(const std::string& key) {
    Record* r = find(key, Kind::Str);
    return r ? r->data : std::string();
  }
  std::string readBlob(const std::string& key) {
    Record* index = find(key, Kind::BlobIdx);
    if (!index) return std::string();
    std::string value;
    for (int i = 0; i < index->chunkCount; ++i) {
      Record* chunk = find(key, Kind::BlobData, index->chunk + i);
      if (!chunk) return std::string();
      value += chunk->data;
    }
    return value;
  }
  bool erase(const std::string& key) {
    if (Record* index = find(key, Kind::BlobIdx)) {
      eraseBlobVersion(key, index->chunk);
      return true;
    }
    for (Kind kind : {Kind::Str, Kind::Small}) {
      if (Record* r = find(key, kind)) { kill(*r); return true; }
    }
    return false;
  }

  size_t freeEntries() const {
    size_t total = freePages_.size() * ENTRY_COUNT;
    for (int p : order_) total += ENTRY_COUNT - pages_[p].used();
    return total;
  }

  // What Storage::init does after a power cut: the earlier of two indexes for
  // one key goes, then any chunk no index claims.
  void reboot() {
    powerBudget = -1;
    for (int p : order_) {
      for (Record& r : pages_[p].records) {
        if (!r.live || r.kind != Kind::BlobIdx) continue;
        for (int q : order_) {
          for (Record& other : pages_[q].records) {
            if (other.live && other.kind == Kind::BlobIdx && other.key == r.key &&
                other.sequence < r.sequence) other.live = false;
          }
        }
      }
    }
    for (int p : order_) {
      for (Record& r : pages_[p].records) {
        if (!r.live || r.kind != Kind::BlobData) continue;
        bool claimed = false;
        for (int q : order_) {
          for (Record& index : pages_[q].records) {
            if (index.live && index.kind == Kind::BlobIdx && index.key == r.key &&
                r.chunk >= index.chunk && r.chunk < index.chunk + index.chunkCount) claimed = true;
          }
        }
        if (!claimed) r.live = false;
      }
    }
  }

 private:
  Page pages_[PAGE_COUNT];
  std::vector<int> order_;
  std::vector<int> freePages_;
  long sequence_ = 0;

  Page& current() { return pages_[order_.back()]; }

  void spend() {
    if (powerBudget == 0) throw PowerLoss{};
    if (powerBudget > 0) --powerBudget;
  }
  void kill(Record& r) { spend(); r.live = false; }

  Record* find(const std::string& key, Kind kind, int chunk = -1) {
    for (int p : order_) {
      for (Record& r : pages_[p].records) {
        if (r.live && r.kind == kind && r.key == key &&
            (chunk < 0 || kind != Kind::BlobData || r.chunk == chunk)) return &r;
      }
    }
    return nullptr;
  }

  bool append(Page& page, Record record) {
    if (page.full || page.next + record.span > ENTRY_COUNT) return false;
    spend();
    record.sequence = ++sequence_;
    page.next += record.span;
    page.records.push_back(record);
    return true;
  }

  bool requestNewPage() {
    if (freePages_.empty()) return false;
    if (freePages_.size() >= 2) {
      order_.push_back(freePages_.front());
      freePages_.erase(freePages_.begin());
      return true;
    }
    int best = -1;
    int bestUnused = 0;
    for (int p : order_) {
      const int unused = ENTRY_COUNT - pages_[p].used();
      if (unused > bestUnused) { best = p; bestUnused = unused; }
    }
    if (best < 0) return false;
    const int fresh = freePages_.front();
    freePages_.clear();
    Page& target = pages_[fresh];
    for (const Record& r : pages_[best].records) {
      if (!r.live) continue;
      target.records.push_back(r);
      target.next += r.span;
    }
    pages_[best] = Page();
    for (size_t i = 0; i < order_.size(); ++i) {
      if (order_[i] == best) { order_.erase(order_.begin() + i); break; }
    }
    order_.push_back(fresh);
    freePages_.push_back(best);
    return true;
  }

  bool setSingle(const std::string& key, Kind kind, int span, const std::string& value) {
    Record* old = find(key, kind);
    if (old && old->data == value) return true;
    Record record;
    record.key = key; record.kind = kind; record.span = span; record.data = value;
    if (!append(current(), record)) {
      current().full = true;
      if (!requestNewPage()) return false;
      if (!append(current(), record)) return false;  // ESP_ERR_NVS_NOT_ENOUGH_SPACE
    }
    // The page the old value was on may have been collected; find it again.
    for (int p : order_) {
      for (Record& r : pages_[p].records) {
        if (r.live && r.kind == kind && r.key == key && r.sequence != sequence_) kill(r);
      }
    }
    return true;
  }

  bool writeBlob(const std::string& key, const std::string& value, int chunkStart) {
    if (static_cast<int>(value.size()) > (PAGE_COUNT - 1) * CHUNK_MAX) return false;
    const int size = static_cast<int>(value.size());
    int remaining = size;
    int offset = 0;
    int chunkCount = 0;
    bool ok = true;
    while (true) {
      Page& page = current();
      const int tailroom = page.tailroom();
      if (chunkCount == 0 && tailroom < size && tailroom < CHUNK_MAX / 10) {
        page.full = true;
        if (!requestNewPage()) return false;
        if (current().tailroom() == tailroom) return false;
        continue;
      } else if (!tailroom) {
        ok = false;
        break;
      }
      const int chunkSize = remaining > tailroom ? tailroom : remaining;
      remaining -= chunkSize;
      Record chunk;
      chunk.key = key; chunk.kind = Kind::BlobData; chunk.chunk = chunkStart + chunkCount;
      chunk.span = 1 + (chunkSize + ENTRY_SIZE - 1) / ENTRY_SIZE;
      chunk.data = value.substr(offset, chunkSize);
      if (!append(page, chunk)) { ok = false; break; }
      ++chunkCount;
      if (remaining || (tailroom - chunkSize) < ENTRY_SIZE) {
        current().full = true;
        if (!requestNewPage()) { ok = false; break; }
      }
      offset += chunkSize;
      if (!remaining) {
        Record index;
        index.key = key; index.kind = Kind::BlobIdx; index.chunk = chunkStart;
        index.chunkCount = chunkCount;
        ok = append(current(), index);
        break;
      }
    }
    if (!ok) {
      for (int i = 0; i < chunkCount; ++i) {
        if (Record* chunk = find(key, Kind::BlobData, chunkStart + i)) kill(*chunk);
      }
    }
    return ok;
  }

  void eraseBlobVersion(const std::string& key, int chunkStart) {
    for (int p : order_) {
      for (Record& r : pages_[p].records) {
        if (r.live && r.kind == Kind::BlobIdx && r.key == key && r.chunk == chunkStart) {
          const int count = r.chunkCount;
          kill(r);
          for (int i = 0; i < count; ++i) {
            if (Record* chunk = find(key, Kind::BlobData, chunkStart + i)) kill(*chunk);
          }
          return;
        }
      }
    }
  }
};

// The slice of the Arduino Preferences API LightweaverProjectStore.h uses.
class Preferences {
 public:
  explicit Preferences(Nvs& nvs) : nvs_(nvs) {}
  bool isKey(const char* key) {
    return nvs_.has(key, Kind::Str) || nvs_.has(key, Kind::BlobIdx) || nvs_.has(key, Kind::Small);
  }
  String getString(const char* key, const char* fallback) {
    return nvs_.has(key, Kind::Str) ? String(nvs_.readString(key)) : String(fallback);
  }
  size_t putString(const char* key, const String& value) {
    return nvs_.setString(key, value.c_str()) ? value.length() : 0;
  }
  size_t getBytesLength(const char* key) { return nvs_.readBlob(key).size(); }
  size_t getBytes(const char* key, void* buffer, size_t maxLength) {
    const std::string value = nvs_.readBlob(key);
    if (value.empty() || value.size() > maxLength) return 0;
    std::memcpy(buffer, value.data(), value.size());
    return value.size();
  }
  size_t putBytes(const char* key, const void* value, size_t length) {
    return nvs_.setBlob(key, std::string(static_cast<const char*>(value), length)) ? length : 0;
  }
  bool remove(const char* key) { return nvs_.erase(key); }

 private:
  Nvs& nvs_;
};

constexpr const char* BLOB_KEY = "kgConfigBlob";
constexpr const char* STRING_KEY = "knownGoodConfig";
constexpr size_t LIMIT = 3968;

bool same(const String& a, const std::string& b) { return b == a.c_str(); }

std::string project(size_t bytes, char fill) { return std::string(bytes, fill); }

// A card that has been in use: the project (saved by firmware 1.2.3 as a
// string) fills one page together with a few small keys, and each of the
// other three pages holds `others` live entries of everything else (Wi-Fi,
// PHY calibration, saved looks, playlist) among entries already erased.
// Built only from ordinary writes and erases, as a real card's history is.
void seedUsedCard(Nvs& nvs, size_t projectBytes, int othersA, int othersB, int othersC) {
  assert(nvs.setString(STRING_KEY, project(projectBytes, 'a')));
  const int pad = ENTRY_COUNT - static_cast<int>(lightweaver::nvsStringEntries(projectBytes));
  for (int i = 0; i < pad; ++i) assert(nvs.setSmall("pad" + std::to_string(i)));
  const int perPage[3] = {othersA, othersB, othersC};
  for (int page = 0; page < 3; ++page) {
    const int others = perPage[page];
    for (int i = 0; i < others; ++i) {
      assert(nvs.setSmall("k" + std::to_string(page) + "_" + std::to_string(i)));
    }
    const int rest = ENTRY_COUNT - others;
    if (rest >= 2) {
      assert(nvs.setString("filler" + std::to_string(page), project((rest - 1) * ENTRY_SIZE - 1, 'f')));
    } else if (rest == 1) {
      assert(nvs.setSmall("fill" + std::to_string(page)));
    }
  }
  for (int page = 0; page < 3; ++page) nvs.erase("filler" + std::to_string(page));
}
void seedUsedCard(Nvs& nvs, size_t projectBytes, int others) {
  seedUsedCard(nvs, projectBytes, others, others, others);
}

void stringProjectIsRefusedOnAUsedCard() {
  // The defect, as measured on card lw-b0fe81f61b44: a 3,514-byte project
  // under the 3,968 limit is refused, twice, and the old project survives.
  Nvs nvs;
  seedUsedCard(nvs, 3400, 30);
  Preferences prefs(nvs);
  const std::string next = project(3514, 'b');
  // Plenty of room in total: about 260 entries, and the project needs 111.
  assert(nvs.freeEntries() - ENTRY_COUNT > 2 * lightweaver::nvsStringEntries(3514));
  assert(prefs.putString(STRING_KEY, String(next)) == 0);
  assert(prefs.putString(STRING_KEY, String(next)) == 0);
  assert(same(prefs.getString(STRING_KEY, ""), project(3400, 'a')));
}

void blobProjectReplacesTheStringOnTheSameCard() {
  Nvs nvs;
  seedUsedCard(nvs, 3400, 30);
  Preferences prefs(nvs);
  const std::string next = project(3514, 'b');
  assert(lightweaver::projectRoomBytes(nvs.freeEntries(), LIMIT) >= next.size());
  assert(lightweaver::writeProject(prefs, BLOB_KEY, STRING_KEY, String(next)) == next.size());
  assert(same(lightweaver::readProject(prefs, BLOB_KEY, STRING_KEY), next));
  assert(!nvs.has(STRING_KEY, Kind::Str));
  // And again, blob over blob, at the full stated limit.
  const std::string full = project(LIMIT, 'c');
  assert(lightweaver::projectRoomBytes(nvs.freeEntries(), LIMIT) == LIMIT);
  assert(lightweaver::writeProject(prefs, BLOB_KEY, STRING_KEY, String(full)) == full.size());
  assert(same(lightweaver::readProject(prefs, BLOB_KEY, STRING_KEY), full));
}

void reportedRoomIsNeverMoreThanASaveCanTake() {
  // Sweep how full the card is. Whatever room is reported, a project of
  // exactly that size must save; and the reported room never exceeds the limit.
  // The other keys are spread evenly and unevenly across the pages, because
  // what a blob can use depends on the size of each hole, not only the total.
  int honoured = 0;
  for (int a = 0; a <= 126; a += 9) for (int b = 0; b <= 126; b += 9) for (int c = 0; c <= 126; c += 9) {
    const int others = a + b + c;
    for (size_t current : {size_t(0), size_t(900), size_t(3400), LIMIT}) {
      Nvs nvs;
      if (current) seedUsedCard(nvs, current, a, b, c);
      else {
        for (int i = 0; i < others; ++i) assert(nvs.setSmall("k" + std::to_string(i)));
      }
      Preferences prefs(nvs);
      // Fill with saved looks until the guard refuses, as the firmware does.
      for (int i = 0; i < 6; ++i) {
        const size_t bytes = 1500;
        if (!lightweaver::recordLeavesProjectRoom(nvs.freeEntries(), 0, false, bytes, LIMIT)) break;
        nvs.setString("look" + std::to_string(i), project(bytes, 'l'));
      }
      const size_t room = lightweaver::projectRoomBytes(nvs.freeEntries(), LIMIT);
      assert(room <= LIMIT);
      if (!room) continue;
      const std::string next = project(room, 'n');
      if (lightweaver::writeProject(prefs, BLOB_KEY, STRING_KEY, String(next)) != next.size()) {
        std::fprintf(stderr, "reported room %zu not honoured (others=%d/%d/%d current=%zu)\n",
                     room, a, b, c, current);
        assert(false);
      }
      assert(same(lightweaver::readProject(prefs, BLOB_KEY, STRING_KEY), next));
      ++honoured;
    }
  }
  assert(honoured > 1000);
}

void guardedRecordsKeepTheFullLimitAvailable() {
  // With saved looks and the playlist held back by the guard, a card with a
  // full-size project and ordinary system keys still reports the full limit.
  Nvs nvs;
  seedUsedCard(nvs, LIMIT, 25);
  Preferences prefs(nvs);
  int stored = 0;
  for (int i = 0; i < 8; ++i) {
    if (!lightweaver::recordLeavesProjectRoom(nvs.freeEntries(), 0, false, LIMIT, LIMIT)) break;
    if (nvs.setString("big" + std::to_string(i), project(LIMIT, 'g'))) ++stored;
  }
  assert(lightweaver::projectRoomBytes(nvs.freeEntries(), LIMIT) == LIMIT);
  const std::string next = project(LIMIT, 'z');
  assert(lightweaver::writeProject(prefs, BLOB_KEY, STRING_KEY, String(next)) == next.size());
  // A record that is not growing is never refused, however full the card is.
  assert(lightweaver::recordLeavesProjectRoom(0, 2000, true, 2000, LIMIT));
  assert(!lightweaver::recordLeavesProjectRoom(0, 2000, true, 2001, LIMIT));
  (void)stored;
}

void powerLossAtEveryStepKeepsOneWholeProject() {
  // Cut the power after every possible flash operation of a save, from both
  // starting forms. After the reboot the card holds the old project or the
  // new one, whole, never neither and never a mixture.
  for (bool startAsBlob : {false, true}) {
    const std::string before = project(3400, 'a');
    const std::string after = project(3514, 'b');
    bool finished = false;
    for (long budget = 0; !finished; ++budget) {
      Nvs nvs;
      seedUsedCard(nvs, 3400, 30);
      Preferences prefs(nvs);
      if (startAsBlob) {
        assert(lightweaver::writeProject(prefs, BLOB_KEY, STRING_KEY, String(before)) == before.size());
      }
      nvs.powerBudget = budget;
      try {
        assert(lightweaver::writeProject(prefs, BLOB_KEY, STRING_KEY, String(after)) == after.size());
        finished = true;
      } catch (const PowerLoss&) {}
      nvs.reboot();
      const String stored = lightweaver::readProject(prefs, BLOB_KEY, STRING_KEY);
      assert(same(stored, before) || same(stored, after));
      assert(lightweaver::projectStored(prefs, BLOB_KEY, STRING_KEY));
      assert(budget < 100000);
    }
  }
}

void costsMatchThePageArithmetic() {
  assert(lightweaver::nvsStringEntries(3514) == 111);
  assert(lightweaver::nvsStringEntries(3968) == 126);  // a whole page to itself
  assert(lightweaver::projectRoomBytes(0, LIMIT) == 0);
  assert(lightweaver::projectRoomBytes(lightweaver::NVS_PAGE_ENTRIES, LIMIT) == 0);
  assert(lightweaver::projectRoomBytes(5 * lightweaver::NVS_PAGE_ENTRIES, LIMIT) == LIMIT);
}

void removeClearsBothForms() {
  Nvs nvs;
  Preferences prefs(nvs);
  assert(!lightweaver::projectStored(prefs, BLOB_KEY, STRING_KEY));
  assert(same(lightweaver::readProject(prefs, BLOB_KEY, STRING_KEY), ""));
  assert(prefs.putString(STRING_KEY, String(project(500, 's'))) == 500);
  assert(lightweaver::projectStored(prefs, BLOB_KEY, STRING_KEY));
  assert(same(lightweaver::readProject(prefs, BLOB_KEY, STRING_KEY), project(500, 's')));
  assert(lightweaver::writeProject(prefs, BLOB_KEY, STRING_KEY, String(project(700, 't'))) == 700);
  assert(lightweaver::removeProject(prefs, BLOB_KEY, STRING_KEY));
  assert(!lightweaver::projectStored(prefs, BLOB_KEY, STRING_KEY));
}

}  // namespace


void candidateBesideASavedProjectNeedsTheBlob() {
  // Real card lw-b0fe81f61b44, 2026-11-22: with a saved project on the card,
  // staging a wiring change answered 400 "candidate storage failed". The
  // candidate was a string beside the saved project; it must be a blob.
  Nvs nvs;
  seedUsedCard(nvs, 3400, 30);
  Preferences prefs(nvs);
  const std::string saved = project(3514, 'b');
  assert(lightweaver::writeProject(prefs, BLOB_KEY, STRING_KEY, String(saved)) == saved.size());
  const char* CANDIDATE_STRING_KEY = "candidateConfig";
  const char* CANDIDATE_BLOB_KEY = "cdConfigBlob";
  const std::string candidate = project(3514, 'w');
  // As a string it finds no page (the defect).
  assert(prefs.putString(CANDIDATE_STRING_KEY, String(candidate)) == 0);
  // As a blob it fits beside the saved project, and both read back whole.
  assert(lightweaver::writeProject(prefs, CANDIDATE_BLOB_KEY, CANDIDATE_STRING_KEY, String(candidate)) == candidate.size());
  assert(same(lightweaver::readProject(prefs, CANDIDATE_BLOB_KEY, CANDIDATE_STRING_KEY), candidate));
  assert(same(lightweaver::readProject(prefs, BLOB_KEY, STRING_KEY), saved));
  // Rolling it back frees the room again for the next attempt.
  assert(lightweaver::removeProject(prefs, CANDIDATE_BLOB_KEY, CANDIDATE_STRING_KEY));
  assert(lightweaver::writeProject(prefs, CANDIDATE_BLOB_KEY, CANDIDATE_STRING_KEY, String(candidate)) == candidate.size());
}
int main() {
  costsMatchThePageArithmetic();
  stringProjectIsRefusedOnAUsedCard();
  blobProjectReplacesTheStringOnTheSameCard();
  reportedRoomIsNeverMoreThanASaveCanTake();
  guardedRecordsKeepTheFullLimitAvailable();
  powerLossAtEveryStepKeepsOneWholeProject();
  removeClearsBothForms();
  candidateBesideASavedProjectNeedsTheBlob();
  return 0;
}
