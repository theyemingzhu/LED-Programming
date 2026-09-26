#include "LightweaverMedia.h"

#if defined(ARDUINO_ARCH_ESP32)
#include <ArduinoJson.h>
#include <WebServer.h>
#include <SD.h>
#include <mbedtls/base64.h>
#include <mbedtls/sha256.h>
#include <esp_system.h>
#include <esp_task_wdt.h>

#include "LightweaverOwnerCapability.h"
#include "LightweaverProjectRepository.h"
#include "LightweaverFirmwareUpdate.h"
#include "LightweaverCardStudio.h"
#include "LightweaverRuntimeApi.h"
#include "LightweaverWeb.h"
#include "LightweaverSequencePlayback.h"

#ifndef LW_SD_CS
#define LW_SD_CS 10
#endif

namespace {
WebServer* g_server = nullptr;
uint8_t g_body[LW_SEQUENCE_MEDIA_HTTP_MAX_BODY_BYTES + 1] = {};
size_t g_bodyLength = 0;
size_t g_expectedLength = 0;
bool g_bodyReady = false;
bool g_bodyRejected = false;

struct Transfer {
  String file;
  String temp;
  String hash;
  String uploadId;
  LightweaverOwnerBinding owner;
  size_t bytes = 0;
  size_t received = 0;
  uint32_t lastTouched = 0;
  uint32_t startedAt = 0;
  uint32_t ownerEpoch = 0;
  bool alreadyPresent = false;
} g_transfer;
Transfer g_receipt;
static constexpr uint32_t LW_MEDIA_LEASE_MS = 10U * 60U * 1000U;
static constexpr uint32_t LW_MEDIA_BATCH_MS = 30U * 60U * 1000U;
static constexpr uint32_t LW_MEDIA_RECEIPT_MS = 2U * 60U * 1000U;
static constexpr const char* LW_MEDIA_STAGING_PATH = "/sequences/.upload-staging.tmp";
static constexpr size_t LW_MEDIA_BATCH_MAX_BYTES = 48U * 1024U * 1024U;
static constexpr size_t LW_MEDIA_BATCH_MAX_ASSETS = 16;
struct BatchAsset { String file; String hash; size_t bytes = 0; bool committed = false; };
struct Batch {
  String id;
  LightweaverOwnerBinding owner;
  uint32_t ownerEpoch = 0;
  uint32_t startedAt = 0;
  size_t count = 0;
  BatchAsset assets[LW_MEDIA_BATCH_MAX_ASSETS];
} g_batch;

bool sameOwner(const LightweaverOwnerBinding& a, const LightweaverOwnerBinding& b);

String randomId() {
  char id[33] = {};
  snprintf(id, sizeof(id), "%08lx%08lx%08lx%08lx", static_cast<unsigned long>(esp_random()),
      static_cast<unsigned long>(esp_random()), static_cast<unsigned long>(esp_random()),
      static_cast<unsigned long>(esp_random()));
  return String(id);
}

bool batchAuthority(const LightweaverOwnerBinding& owner, const String& id) {
  return g_batch.id.length() && id == g_batch.id && sameOwner(owner, g_batch.owner) &&
      owner.cardId == runtimeCardId() && owner.bootId == runtimeBootId() &&
      owner.networkIdentity == runtimeNetworkIdentity() &&
      owner.expectedProjectHead == lightweaverProjectRepository().currentHead() &&
      g_batch.ownerEpoch == lightweaverOwnerCapability().leaseEpoch() &&
      millis() - g_batch.startedAt <= LW_MEDIA_BATCH_MS;
}

BatchAsset* batchAsset(const String& file, const String& hash, size_t bytes) {
  for (size_t i = 0; i < g_batch.count; i++) {
    auto& asset = g_batch.assets[i];
    if (asset.file == file && asset.hash == hash && asset.bytes == bytes) return &asset;
  }
  return nullptr;
}

String hexDigest(const uint8_t digest[32]) {
  static const char digits[] = "0123456789abcdef";
  char text[65] = {};
  for (size_t i = 0; i < 32; i++) {
    text[i * 2] = digits[digest[i] >> 4];
    text[i * 2 + 1] = digits[digest[i] & 15];
  }
  return String(text);
}

bool validHash(const String& value) {
  if (value.length() != 64) return false;
  for (size_t i = 0; i < 64; i++) {
    const char c = value[i];
    if (!((c >= '0' && c <= '9') || (c >= 'a' && c <= 'f'))) return false;
  }
  return true;
}

bool validFile(const String& file, const String& hash) {
  return validHash(hash) && file == String("/sequences/") + hash + ".lwseq";
}

bool sameOwner(const LightweaverOwnerBinding& a, const LightweaverOwnerBinding& b) {
  return a.cardId == b.cardId && a.bootId == b.bootId &&
      a.allowedOrigin == b.allowedOrigin && a.host == b.host &&
      a.networkIdentity == b.networkIdentity && a.ownerSessionId == b.ownerSessionId &&
      a.operationGeneration == b.operationGeneration && a.expectedProjectHead == b.expectedProjectHead;
}

void sendCors() {
  const String origin = g_server->header("Origin");
  if (corsOriginAllowed(origin)) {
    g_server->sendHeader("Access-Control-Allow-Origin", origin);
    g_server->sendHeader("Vary", "Origin");
    g_server->sendHeader("Access-Control-Allow-Headers", "Content-Type,X-Lightweaver-Card-Id,X-Lightweaver-Boot-Id,X-Lightweaver-Owner-Session,X-Lightweaver-Operation-Generation,X-Lightweaver-Expected-Head,X-Lightweaver-Capability");
    g_server->sendHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
    g_server->sendHeader("Access-Control-Allow-Private-Network", "true");
  }
  g_server->sendHeader("Cache-Control", "no-store");
}

void sendResult(int status, bool ok, const String& message, const Transfer* transfer = nullptr,
    bool includeBatch = false) {
  JsonDocument response;
  response["ok"] = ok;
  if (!ok) response["error"] = message;
  else response["message"] = message;
  if (transfer) {
    response["file"] = transfer->file;
    response["bytes"] = transfer->bytes;
    response["sha256"] = transfer->hash;
    response["uploadId"] = transfer->uploadId;
    response["received"] = transfer->received;
    response["chunkBytes"] = LW_SEQUENCE_MEDIA_CHUNK_BYTES;
    if (transfer->alreadyPresent) response["alreadyPresent"] = true;
  }
  if (ok && includeBatch) {
    response["batchId"] = g_batch.id;
    response["chunkBytes"] = LW_SEQUENCE_MEDIA_CHUNK_BYTES;
  }
  String body; serializeJson(response, body);
  g_server->send(status, "application/json", body);
}

LightweaverOwnerBinding binding(JsonVariantConst source) {
  LightweaverOwnerBinding value;
  value.cardId = source["cardId"] | "";
  value.bootId = source["bootId"] | "";
  value.allowedOrigin = g_server->header("Origin");
  value.host = g_server->hostHeader();
  value.networkIdentity = runtimeNetworkIdentity();
  value.ownerSessionId = source["ownerSessionId"] | "";
  value.operationGeneration = source["operationGeneration"] | 0U;
  value.expectedProjectHead = source["expectedHead"] | "";
  return value;
}

bool authorize(JsonVariantConst source, LightweaverOwnerBinding& owner) {
  owner = binding(source);
  if (owner.expectedProjectHead != lightweaverProjectRepository().currentHead()) {
    sendResult(409, false, "stale expected project head"); return false;
  }
  if (lightweaverOwnerCapability().validate(String(source["capability"] | ""), owner, millis())
      != LightweaverOwnerValidation::Accepted) {
    sendResult(403, false, "owner capability rejected"); return false;
  }
  return true;
}

// Begin consumes a fresh physical owner capability. Upload ID then acts only as
// a short, file-scoped lease: the general capability's 60-second TTL is not
// extended, and this lease cannot alter config or read any other file.
bool authorizeTransfer(JsonVariantConst source, LightweaverOwnerBinding& owner) {
  owner = binding(source);
  if (!g_transfer.uploadId.length() || !sameOwner(owner, g_transfer.owner) ||
      owner.cardId != runtimeCardId() || owner.bootId != runtimeBootId() ||
      owner.networkIdentity != runtimeNetworkIdentity() ||
      owner.expectedProjectHead != lightweaverProjectRepository().currentHead() ||
      millis() - g_transfer.startedAt > LW_MEDIA_LEASE_MS ||
      g_transfer.ownerEpoch != lightweaverOwnerCapability().leaseEpoch() ||
      !batchAuthority(owner, String(source["batchId"] | ""))) {
    sendResult(403, false, "media transfer lease rejected"); return false;
  }
  return true;
}

bool authorizeBatch(JsonVariantConst source, LightweaverOwnerBinding& owner) {
  owner = binding(source);
  if (!batchAuthority(owner, String(source["batchId"] | ""))) {
    sendResult(403, false, "media batch lease rejected"); return false;
  }
  return true;
}

bool mutationsReady() {
  if (lightweaverFirmwareUpdateActive()) {
    sendResult(409, false, "firmware update owns the card mutation lease"); return false;
  }
  if (!lightweaverCardStudioMutationsEnabled()) {
    sendResult(503, false, lightweaverCardStudioValidationError()); return false;
  }
  return true;
}

bool mounted() {
  if (SD.cardType() != CARD_NONE) return true;
  return SD.begin(LW_SD_CS) && SD.cardType() != CARD_NONE;
}

void clearTransfer() {
  if (g_transfer.temp.length() && SD.exists(g_transfer.temp.c_str())) SD.remove(g_transfer.temp.c_str());
  g_transfer = Transfer{};
}

bool hashFile(const String& path, size_t& size, String& hash) {
  File file = SD.open(path.c_str(), FILE_READ);
  if (!file) return false;
  if (file.size() > LW_SEQUENCE_MEDIA_MAX_BYTES) { file.close(); return false; }
  size = 0;
  mbedtls_sha256_context context;
  mbedtls_sha256_init(&context);
  mbedtls_sha256_starts_ret(&context, 0);
  uint8_t buffer[1024];
  while (file.available()) {
    const size_t read = file.read(buffer, sizeof(buffer));
    if (!read) break;
    mbedtls_sha256_update_ret(&context, buffer, read);
    size += read;
    if ((size & 8191U) == 0) { esp_task_wdt_reset(); yield(); }
  }
  file.close();
  uint8_t digest[32] = {};
  mbedtls_sha256_finish_ret(&context, digest);
  mbedtls_sha256_free(&context);
  hash = hexDigest(digest);
  return true;
}

bool validSequenceHeader(const String& path, size_t expectedBytes) {
  File file = SD.open(path.c_str(), FILE_READ);
  if (!file) return false;
  uint8_t header[64] = {};
  const bool read = file.read(header, sizeof(header)) == sizeof(header);
  file.close();
  if (!read || memcmp(header, "LWSEQ1", 6) != 0) return false;
  const auto u16 = [&](size_t offset) { return uint16_t(header[offset]) | (uint16_t(header[offset + 1]) << 8); };
  const auto u32 = [&](size_t offset) { return uint32_t(header[offset]) | (uint32_t(header[offset + 1]) << 8) |
      (uint32_t(header[offset + 2]) << 16) | (uint32_t(header[offset + 3]) << 24); };
  const uint16_t outputs = u16(10);
  const uint32_t pixels = u32(12);
  const uint32_t frames = u32(16);
  const uint16_t fps = u16(20);
  return u16(8) == 1 && outputs >= 1 && outputs <= 4 && pixels >= 1 && pixels <= 4096 &&
      sequenceOutputTopologySyntax(header, sizeof(header)) &&
      frames >= 1 && fps >= 1 && fps <= 60 && u16(22) == 3 &&
      uint64_t(64) + uint64_t(pixels) * 3U * frames == expectedBytes;
}

bool parseBody(JsonDocument& doc) {
  if (!g_bodyReady || g_bodyRejected) { sendResult(400, false, "media request body unavailable"); return false; }
  const DeserializationError error = deserializeJson(doc, g_body, g_bodyLength);
  g_bodyLength = 0; g_bodyReady = false;
  if (error || !doc.is<JsonObject>()) { sendResult(400, false, "media request is not valid JSON"); return false; }
  return true;
}

void handleMutation(const String& uri) {
  sendCors();
  if (!mutationsReady()) return;
  JsonDocument doc;
  if (!parseBody(doc)) return;
  LightweaverOwnerBinding owner;
  if (uri == "/api/media/begin" && doc["assets"].is<JsonArray>()) {
    if (!authorize(doc.as<JsonVariantConst>(), owner)) return;
  } else if (uri == "/api/media/begin") {
    if (!authorizeBatch(doc.as<JsonVariantConst>(), owner)) return;
  } else if (uri == "/api/media/abort") {
    if (!authorizeBatch(doc.as<JsonVariantConst>(), owner)) return;
  } else if (!authorizeTransfer(doc.as<JsonVariantConst>(), owner)) return;
  if (uri == "/api/media/abort") {
    // This scoped batch action remains available after a failed file begin or
    // the last successful commit. It never removes immutable sequence files.
    clearTransfer();
    g_batch = Batch{};
    sendResult(200, true, "media batch closed");
    return;
  }
  if (!mounted()) { sendResult(503, false, "microSD media unavailable"); return; }
  if (g_transfer.uploadId.length() && millis() - g_transfer.lastTouched > 120000U) clearTransfer();
  if (uri == "/api/media/begin" && doc["assets"].is<JsonArray>()) {
    if (g_transfer.uploadId.length() &&
        (g_transfer.ownerEpoch != lightweaverOwnerCapability().leaseEpoch() ||
         millis() - g_transfer.startedAt > LW_MEDIA_LEASE_MS)) clearTransfer();
    if (g_batch.id.length() &&
        (g_batch.ownerEpoch != lightweaverOwnerCapability().leaseEpoch() ||
         millis() - g_batch.startedAt > LW_MEDIA_BATCH_MS)) g_batch = Batch{};
  }

  if (uri == "/api/media/begin") {
    if (doc["assets"].is<JsonArray>()) {
      if (g_transfer.uploadId.length() || g_batch.id.length() && millis() - g_batch.startedAt <= LW_MEDIA_BATCH_MS) {
        sendResult(409, false, "another media batch is active"); return;
      }
      g_batch = Batch{};
      JsonArrayConst assets = doc["assets"].as<JsonArrayConst>();
      if (!assets.size() || assets.size() > LW_MEDIA_BATCH_MAX_ASSETS) {
        sendResult(400, false, "media batch asset count is invalid"); return;
      }
      size_t aggregate = 0;
      for (JsonVariantConst item : assets) {
        const String file = item["file"] | "";
        const String hash = item["sha256"] | "";
        const size_t bytes = item["bytes"] | 0U;
        if (!validFile(file, hash) || bytes < 64 || bytes > LW_SEQUENCE_MEDIA_MAX_BYTES ||
            aggregate > LW_MEDIA_BATCH_MAX_BYTES - bytes) {
          g_batch = Batch{}; sendResult(400, false, "media batch contains an invalid asset"); return;
        }
        for (size_t i = 0; i < g_batch.count; i++) {
          if (g_batch.assets[i].file == file) {
            g_batch = Batch{}; sendResult(400, false, "media batch repeats one immutable path"); return;
          }
        }
        auto& declared = g_batch.assets[g_batch.count++];
        declared.file = file;
        declared.hash = hash;
        declared.bytes = bytes;
        declared.committed = false;
        aggregate += bytes;
      }
      g_batch.id = randomId();
      g_batch.owner = owner;
      g_batch.ownerEpoch = lightweaverOwnerCapability().leaseEpoch();
      g_batch.startedAt = millis();
      sendResult(200, true, "bounded media batch authorized", nullptr, true);
      return;
    }
    const String file = doc["file"] | "";
    const String hash = doc["sha256"] | "";
    const size_t bytes = doc["bytes"] | 0U;
    if (!validFile(file, hash) || bytes < 64 || bytes > LW_SEQUENCE_MEDIA_MAX_BYTES) {
      sendResult(400, false, "media file, hash, or size is invalid"); return;
    }
    if (!batchAsset(file, hash, bytes)) {
      sendResult(403, false, "file was not declared in media batch"); return;
    }
    if (g_transfer.uploadId.length() && millis() - g_transfer.startedAt > LW_MEDIA_LEASE_MS) clearTransfer();
    if (g_transfer.uploadId.length()) { sendResult(409, false, "another media transfer is active"); return; }
    if (!SD.exists("/sequences") && !SD.mkdir("/sequences")) {
      sendResult(503, false, "microSD sequence directory unavailable"); return;
    }
    const uint64_t freeBytes = SD.totalBytes() > SD.usedBytes() ? SD.totalBytes() - SD.usedBytes() : 0;
    if (!SD.exists(file.c_str()) && freeBytes < uint64_t(bytes) + 4096U) {
      sendResult(507, false, "microSD capacity is insufficient"); return;
    }
    g_transfer.file = file;
    g_transfer.hash = hash;
    g_transfer.bytes = bytes;
    g_transfer.owner = owner;
    g_transfer.lastTouched = millis();
    g_transfer.startedAt = millis();
    g_transfer.ownerEpoch = lightweaverOwnerCapability().leaseEpoch();
    g_transfer.uploadId = randomId();
    // One transaction at a time permits a fixed staging path. A power loss
    // leaves only this file; the next authorized begin removes it before use.
    g_transfer.temp = LW_MEDIA_STAGING_PATH;
    if (SD.exists(file.c_str())) {
      size_t existingBytes = 0; String existingHash;
      if (!hashFile(file, existingBytes, existingHash) || existingBytes != bytes || existingHash != hash ||
          !validSequenceHeader(file, bytes)) {
        clearTransfer(); sendResult(409, false, "immutable media path has different content"); return;
      }
      g_transfer.alreadyPresent = true;
      g_transfer.received = bytes;
      sendResult(200, true, "immutable media already present", &g_transfer);
      return;
    }
    if (SD.exists(LW_MEDIA_STAGING_PATH) && !SD.remove(LW_MEDIA_STAGING_PATH)) {
      clearTransfer(); sendResult(503, false, "abandoned microSD staging cannot be removed"); return;
    }
    File temp = SD.open(g_transfer.temp.c_str(), FILE_WRITE);
    if (!temp) { clearTransfer(); sendResult(503, false, "microSD upload staging unavailable"); return; }
    temp.close();
    sendResult(200, true, "media upload started", &g_transfer);
    return;
  }

  const String uploadId = doc["uploadId"] | "";
  if (!g_transfer.uploadId.length() || uploadId != g_transfer.uploadId || !sameOwner(owner, g_transfer.owner)) {
    sendResult(409, false, "media transfer owner or upload id changed"); return;
  }
  g_transfer.lastTouched = millis();
  if (uri == "/api/media/chunk") {
    const size_t offset = doc["offset"] | UINT32_MAX;
    const String encoded = doc["data"] | "";
    if (g_transfer.alreadyPresent || offset != g_transfer.received || encoded.length() > 2740) {
      sendResult(409, false, "media chunk offset is stale or upload is complete"); return;
    }
    uint8_t decoded[LW_SEQUENCE_MEDIA_CHUNK_BYTES] = {};
    size_t decodedSize = 0;
    const int result = mbedtls_base64_decode(decoded, sizeof(decoded), &decodedSize,
        reinterpret_cast<const unsigned char*>(encoded.c_str()), encoded.length());
    if (result != 0 || !decodedSize || decodedSize > LW_SEQUENCE_MEDIA_CHUNK_BYTES ||
        decodedSize > g_transfer.bytes - g_transfer.received) {
      sendResult(400, false, "media chunk is invalid"); return;
    }
    File temp = SD.open(g_transfer.temp.c_str(), FILE_APPEND);
    if (!temp) { sendResult(503, false, "microSD upload staging unavailable"); return; }
    const size_t written = temp.write(decoded, decodedSize);
    temp.flush(); temp.close();
    if (written != decodedSize) {
      clearTransfer(); sendResult(507, false, "microSD chunk write failed; upload abandoned"); return;
    }
    g_transfer.received += written;
    sendResult(200, true, "media chunk accepted", &g_transfer);
    return;
  }
  if (uri == "/api/media/commit") {
    if (g_transfer.received != g_transfer.bytes) { sendResult(409, false, "media upload is incomplete"); return; }
    if (!g_transfer.alreadyPresent) {
      size_t actualBytes = 0; String actualHash;
      if (!hashFile(g_transfer.temp, actualBytes, actualHash) || actualBytes != g_transfer.bytes ||
          actualHash != g_transfer.hash || !validSequenceHeader(g_transfer.temp, actualBytes)) {
        sendResult(422, false, "media hash, size, or LWSEQ header failed readback"); return;
      }
      if (SD.exists(g_transfer.file.c_str()) || !SD.rename(g_transfer.temp.c_str(), g_transfer.file.c_str())) {
        sendResult(409, false, "immutable media promotion failed"); return;
      }
    }
    size_t readBytes = 0; String readHash;
    if (!hashFile(g_transfer.file, readBytes, readHash) || readBytes != g_transfer.bytes || readHash != g_transfer.hash) {
      sendResult(500, false, "promoted media readback failed"); return;
    }
    const Transfer completed = g_transfer;
    if (BatchAsset* asset = batchAsset(completed.file, completed.hash, completed.bytes)) asset->committed = true;
    g_receipt = completed;
    g_receipt.startedAt = millis();
    g_transfer = Transfer{};
    sendResult(200, true, "media committed and read back", &completed);
  }
}

void handleReadCore(JsonVariantConst query, const String& file,
    const String& receiptId, const String& batchId) {
  LightweaverOwnerBinding owner;
  bool batchReadAuthorized = false;
  if (batchId.length() && batchAuthority(binding(query), batchId)) {
    for (size_t i = 0; i < g_batch.count; i++) {
      if (g_batch.assets[i].file == file && g_batch.assets[i].committed) batchReadAuthorized = true;
    }
  }
  const bool receiptAuthorized = receiptId.length() && receiptId == g_receipt.uploadId &&
      millis() - g_receipt.startedAt <= LW_MEDIA_RECEIPT_MS &&
      sameOwner(binding(query), g_receipt.owner) &&
      g_receipt.owner.cardId == runtimeCardId() && g_receipt.owner.bootId == runtimeBootId() &&
      g_receipt.owner.networkIdentity == runtimeNetworkIdentity() &&
      g_receipt.owner.expectedProjectHead == lightweaverProjectRepository().currentHead() &&
      g_receipt.ownerEpoch == lightweaverOwnerCapability().leaseEpoch();
  if (!receiptAuthorized && !batchReadAuthorized && !authorize(query, owner)) return;
  if (!mounted()) { sendResult(503, false, "microSD media unavailable"); return; }
  if (receiptAuthorized && file != g_receipt.file) {
    sendResult(403, false, "media receipt is scoped to another file"); return;
  }
  const int begin = strlen("/sequences/");
  const String hash = file.substring(begin, begin + 64);
  if (!validFile(file, hash)) { sendResult(400, false, "media path is invalid"); return; }
  size_t bytes = 0; String actualHash;
  if (!hashFile(file, bytes, actualHash)) { sendResult(404, false, "media file is missing"); return; }
  if (bytes < 64 || bytes > LW_SEQUENCE_MEDIA_MAX_BYTES || actualHash != hash ||
      !validSequenceHeader(file, bytes)) { sendResult(422, false, "media readback failed integrity checks"); return; }
  Transfer result; result.file = file; result.bytes = bytes; result.hash = actualHash;
  sendResult(200, true, "media independently read back", &result);
}

void handleReadPost() {
  sendCors();
  JsonDocument doc;
  if (!parseBody(doc)) return;
  handleReadCore(doc.as<JsonVariantConst>(), String(doc["file"] | ""),
      String(doc["uploadId"] | ""), String(doc["batchId"] | ""));
}

void handleRaw(HTTPRaw& raw) {
  if (raw.status == RAW_START) {
    g_bodyLength = 0; g_bodyReady = false; g_bodyRejected = false;
    g_expectedLength = g_server->clientContentLength();
    if (!g_expectedLength || g_expectedLength > LW_SEQUENCE_MEDIA_HTTP_MAX_BODY_BYTES) {
      g_bodyRejected = true; sendCors(); sendResult(g_expectedLength ? 413 : 411, false, "media request size rejected"); g_server->client().stop();
    }
  } else if (raw.status == RAW_WRITE && !g_bodyRejected) {
    if (g_bodyLength + raw.currentSize > g_expectedLength || g_bodyLength + raw.currentSize > LW_SEQUENCE_MEDIA_HTTP_MAX_BODY_BYTES) {
      g_bodyRejected = true; lightweaverOwnerCapability().revoke(); g_server->client().stop();
    } else { memcpy(g_body + g_bodyLength, raw.buf, raw.currentSize); g_bodyLength += raw.currentSize; }
  } else if (raw.status == RAW_END && !g_bodyRejected) {
    if (g_bodyLength != g_expectedLength) { g_bodyRejected = true; lightweaverOwnerCapability().revoke(); }
    else { g_body[g_bodyLength] = 0; g_bodyReady = true; }
  } else if (raw.status == RAW_ABORTED) {
    g_bodyLength = 0; g_bodyReady = false; g_bodyRejected = false;
    lightweaverOwnerCapability().revoke();
  }
}

class BoundedMediaRequestHandler final : public RequestHandler {
 public:
  bool canHandle(HTTPMethod method, String uri) override {
    return method == HTTP_POST && (uri == "/api/media/begin" || uri == "/api/media/chunk" ||
      uri == "/api/media/commit" || uri == "/api/media/abort" || uri == "/api/media/read");
  }
  bool canUpload(String) override { return false; }
  bool canRaw(String uri) override { return canHandle(HTTP_POST, uri); }
  bool handle(WebServer&, HTTPMethod method, String uri) override {
    if (!canHandle(method, uri)) return false;
    if (uri == "/api/media/read") handleReadPost(); else handleMutation(uri);
    return true;
  }
  void raw(WebServer&, String uri, HTTPRaw& body) override { if (canRaw(uri)) handleRaw(body); }
};

void handleOptions() { sendCors(); g_server->send(204, "text/plain", ""); }
}  // namespace

void registerLightweaverMedia(WebServer& server) {
  g_server = &server;
  for (const char* route : {"/api/media/begin", "/api/media/chunk", "/api/media/commit",
      "/api/media/abort", "/api/media/read"}) server.on(route, HTTP_OPTIONS, handleOptions);
  server.addHandler(new BoundedMediaRequestHandler());
}
#else
void registerLightweaverMedia(WebServer&) {}
#endif
