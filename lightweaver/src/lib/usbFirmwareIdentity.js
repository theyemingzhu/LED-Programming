import { inspectUsbOtaSelection } from './preservingUsbBootstrap.js';

export const LIGHTWEAVER_APP_PARTITION_OFFSET = 0x10000;
export const LIGHTWEAVER_APP_PARTITION_SIZE = 0x640000;
export const USB_FIRMWARE_READ_CHUNK_SIZE = 0x10000;
// A whole-partition scan at USB serial speed is tens of seconds. Nothing about
// connecting or installing depends on its answer, so it is capped rather than
// allowed to run to the end of the flash.
export const USB_FIRMWARE_READ_TIMEOUT_MS = 25_000;

// This historical signed release stores its version and build ID in the
// opposite order from the older string envelope. The exact app bytes are
// authenticated by its publisher-signed update ticket. A one-chunk digest
// avoids scanning every unknown card for the full image; a match is only a
// candidate until the entire signed application digest also matches.
const SIGNED_HISTORICAL_IMAGES = Object.freeze([
  Object.freeze({
    firmwareVersion: '1.1.39',
    buildId: '92bfd6ab1e287b2bd818c5ce79062dc4f12f2a2b',
    buildNumber: 1939,
    size: 2_232_992,
    sha256: '714bf301851a7d1e64da19edf8efe1528b59f47de9881eaf20c980fdb047178c',
    chunkOffset: 0xD0000,
    chunkSha256: 'd0ab579d236b26f8c6b363a166e52fba3a71c3d79702b7f8c7b46a27124f3840',
    tableSha256: '9af3af2b74e944337ba85f2b0027ee80df160579a1ab746ba0f95853f618cd60',
  }),
  Object.freeze({
    firmwareVersion: '1.1.42',
    buildId: '64b1f5da6725d472d54e59cfa8352c8b0bf864d9',
    buildNumber: 2070,
    size: 2_280_496,
    sha256: 'a2c68e32af9534b5947560faf5d0f4c1b85a6a39cf78fc9a140c017510b793fd',
    chunkOffset: 0xD0000,
    chunkSha256: 'e09732fb0b40511341d793446ee9bbd3541204c36699030c07227df8753794a5',
    tableSha256: '9af3af2b74e944337ba85f2b0027ee80df160579a1ab746ba0f95853f618cd60',
  }),
]);
// At 921600 baud, reading the signed 2.28 MB app can exceed the ordinary
// 25-second exploratory scan. Only an exact candidate gets this total bound.
const SIGNED_IMAGE_VERIFICATION_TIMEOUT_MS = 60_000;
// The current signed app is about 2.3 MB. A 921600-baud card observed at
// roughly 25 KB/s needs more than the exploratory 25 seconds to read it back.
// This longer bound applies only after its authenticated first chunk matches.
const CURRENT_SIGNED_IMAGE_VERIFICATION_TIMEOUT_MS = 130_000;
const INSPECTION_PACKET_TIMEOUT_MS = 5_000;

const ENVELOPE_OVERLAP = 1024;
const CONTRACT_MARKER_BEFORE = 'lw-%012llx';
const CONTRACT_MARKER_AFTER = 'provisioningContractVersion';
const CONTRACT_MARKER_DISTANCE = 256;
const IDENTITY_PATTERN = /((?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z.-]{1,32})?)\x00([a-f0-9]{40})\x00/g;
// These numbers are the Git commit counts for the exact signed historical
// build IDs whose factory images are committed in this repository. The build
// ID is read from card flash first; no version-only guess is ever made.
const SIGNED_HISTORICAL_BUILD_NUMBERS = Object.freeze({
  '1366faf23a29a815044bae2e50405ff14b424e42': 1198,
  c80ba832eebe0b681112753b32d24001d01bf56f: 1223,
});

function bytesOf(value) {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  return null;
}

function isErased(bytes) {
  for (let index = 0; index < bytes.length; index += 1) {
    if (bytes[index] !== 0xff) return false;
  }
  return true;
}

async function sha256Hex(bytes) {
  if (!globalThis.crypto?.subtle) return '';
  const digest = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', bytes));
  return [...digest].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

async function currentSignedImageCandidate(release) {
  const { manifest, ticket } = release || {};
  const imageBytes = bytesOf(release?.imageBytes);
  if (!imageBytes || !ticket || !manifest
    || ticket.buildId !== manifest.buildId
    || ticket.firmwareVersion !== manifest.firmwareVersion
    || ticket.buildNumber !== manifest.buildNumber
    || ticket.image?.size !== imageBytes.length
    || ticket.image?.sha256 !== manifest.update?.image?.sha256
    || !/^[a-f0-9]{64}$/.test(String(ticket.partition?.tableSha256 || ''))
    || await sha256Hex(imageBytes) !== ticket.image.sha256) return null;
  return {
    firmwareVersion: ticket.firmwareVersion,
    buildId: ticket.buildId,
    buildNumber: ticket.buildNumber,
    size: imageBytes.length,
    sha256: ticket.image.sha256,
    chunkOffset: 0,
    chunkSha256: await sha256Hex(imageBytes.subarray(0, USB_FIRMWARE_READ_CHUNK_SIZE)),
    tableSha256: ticket.partition.tableSha256,
    verificationTimeoutMs: CURRENT_SIGNED_IMAGE_VERIFICATION_TIMEOUT_MS,
  };
}

// Only the 16 MB ESP32-S3 card carries a Lightweaver image, so no other
// hardware is ever put through the scan.
export function espCanReportFirmwareIdentity(hardware) {
  return String(hardware?.chipName || '') === 'ESP32-S3' && String(hardware?.flashSize || '') === '16MB';
}

export function parseLightweaverFirmwareIdentity(value) {
  const bytes = bytesOf(value);
  if (!bytes?.length) return null;
  const text = new TextDecoder('latin1').decode(bytes);
  IDENTITY_PATTERN.lastIndex = 0;
  for (let match = IDENTITY_PATTERN.exec(text); match; match = IDENTITY_PATTERN.exec(text)) {
    const identityStart = match.index;
    const identityEnd = identityStart + match[0].length;
    const before = text.lastIndexOf(CONTRACT_MARKER_BEFORE, identityStart);
    if (before < 0 || identityStart - (before + CONTRACT_MARKER_BEFORE.length) > CONTRACT_MARKER_DISTANCE) continue;
    const after = text.indexOf(CONTRACT_MARKER_AFTER, identityEnd);
    if (after < 0 || after - identityEnd > CONTRACT_MARKER_DISTANCE) continue;
    const buildNumber = SIGNED_HISTORICAL_BUILD_NUMBERS[match[2]];
    return Object.freeze({
      firmwareVersion: match[1],
      buildId: match[2],
      ...(buildNumber ? { buildNumber } : {}),
      source: 'usb-flash',
    });
  }
  return null;
}

export async function readLightweaverFirmwareIdentity(
  loader,
  options = {},
) {
  const {
    onProgress, timeoutMs = USB_FIRMWARE_READ_TIMEOUT_MS,
    onReadFailure, shouldStop, now = () => Date.now(), verifiedRelease = null,
  } = options;
  if (typeof loader?.readFlash !== 'function') return null;
  const partitionEnd = LIGHTWEAVER_APP_PARTITION_OFFSET + LIGHTWEAVER_APP_PARTITION_SIZE;
  // The scan walks megabytes of card flash one chunk at a time. The overall
  // deadline is checked between reads; each loader read has its own scoped
  // packet-inactivity bound below. An in-flight read cannot be interrupted.
  const startedAt = now();
  let deadline = Number.isFinite(timeoutMs) && timeoutMs > 0 ? startedAt + timeoutMs : Infinity;
  let carry = new Uint8Array(0);
  let signedPrefix = [];
  let signedImage = null;
  const currentCandidate = await currentSignedImageCandidate(verifiedRelease);
  const signedCandidates = currentCandidate
    ? [currentCandidate, ...SIGNED_HISTORICAL_IMAGES] : SIGNED_HISTORICAL_IMAGES;
  const lastCandidateChunkOffset = Math.max(...signedCandidates.map(candidate => candidate.chunkOffset));
  // esptool-js defaults to 100 seconds of silence for EACH flash packet.
  // This loader is held exclusively for inspection; shorten only its packet
  // inactivity timeout, then restore it before any later operation.
  const originalPacketTimeout = loader.FLASH_READ_TIMEOUT;
  const scopedPacketTimeout = Number.isFinite(originalPacketTimeout)
    && originalPacketTimeout > INSPECTION_PACKET_TIMEOUT_MS;
  if (scopedPacketTimeout) loader.FLASH_READ_TIMEOUT = INSPECTION_PACKET_TIMEOUT_MS;
  const invalidateRead = reason => {
    try { onReadFailure?.({ reason, needsReconnect: true }); }
    catch { /* A UI observer cannot turn a failed read into a usable loader. */ }
  };
  try {
    for (let address = LIGHTWEAVER_APP_PARTITION_OFFSET; address < partitionEnd; address += USB_FIRMWARE_READ_CHUNK_SIZE) {
      if (shouldStop?.() === true) return null;
      if (now() >= deadline) return null;
      const size = Math.min(USB_FIRMWARE_READ_CHUNK_SIZE, partitionEnd - address);
      const result = bytesOf(await loader.readFlash(address, size));
      // readFlash itself is not abortable here. A slow final read must not turn
      // an expired or cancelled verification into a positive identity.
      if (shouldStop?.() === true || now() >= deadline) {
        invalidateRead('cancelled-or-expired-during-read');
        return null;
      }
      if (!result || result.length < size) {
        invalidateRead('incomplete-flash-read');
        return null;
      }
      const chunk = result.subarray(0, size);
      if (isErased(chunk)) return null;
      const scan = new Uint8Array(carry.length + chunk.length);
      scan.set(carry);
      scan.set(chunk, carry.length);
      const identity = parseLightweaverFirmwareIdentity(scan);
      const relative = address - LIGHTWEAVER_APP_PARTITION_OFFSET;
      if (identity && !signedImage) {
        onProgress?.({ bytesRead: relative + size, totalBytes: LIGHTWEAVER_APP_PARTITION_SIZE });
        return identity;
      }
      if (!signedImage) {
        const imagesAtChunk = signedCandidates.filter(candidate => relative === candidate.chunkOffset);
        if (imagesAtChunk.length) {
          const chunkSha256 = await sha256Hex(chunk);
          const candidate = imagesAtChunk.find(image => image.chunkSha256 === chunkSha256);
          if (candidate) {
            signedImage = { candidate, bytes: new Uint8Array(candidate.size) };
            for (let index = 0; index < signedPrefix.length; index += 1) {
              signedImage.bytes.set(signedPrefix[index], index * USB_FIRMWARE_READ_CHUNK_SIZE);
            }
            // A caller-supplied deadline remains authoritative. Only the default
            // exploratory scan receives enough time to finish an exact candidate.
            if (!Object.hasOwn(options, 'timeoutMs')) {
              deadline = Math.max(deadline, startedAt
                + (candidate.verificationTimeoutMs || SIGNED_IMAGE_VERIFICATION_TIMEOUT_MS));
            }
          }
          if (candidate || relative >= lastCandidateChunkOffset) signedPrefix = [];
          else signedPrefix.push(chunk.slice());
        } else if (relative < lastCandidateChunkOffset) signedPrefix.push(chunk.slice());
      }
      if (signedImage) {
        const length = Math.min(chunk.length, signedImage.candidate.size - relative);
        if (length > 0) signedImage.bytes.set(chunk.subarray(0, length), relative);
      }
      onProgress?.({
        bytesRead: signedImage ? Math.min(relative + size, signedImage.candidate.size) : relative + size,
        totalBytes: signedImage ? signedImage.candidate.size : LIGHTWEAVER_APP_PARTITION_SIZE,
      });
      if (signedImage && relative + size >= signedImage.candidate.size) {
        const candidate = signedImage.candidate;
        if (await sha256Hex(signedImage.bytes) !== candidate.sha256) return null;
        if (shouldStop?.() === true || now() >= deadline) return null;
        // The image hash identifies stored app0 bytes. Only a separate fresh
        // partition-table and OTA selector read can promote it to the currently
        // booted firmware; otherwise those fixed offsets have no authority.
        const table = bytesOf(await loader.readFlash(0x8000, 0x1000));
        if (shouldStop?.() === true || now() >= deadline) {
          invalidateRead('cancelled-or-expired-during-read');
          return null;
        }
        if (!table || table.byteLength !== 0x1000) {
          invalidateRead('incomplete-partition-table-read');
          return null;
        }
        const canonicalTable = await sha256Hex(table) === candidate.tableSha256;
        let selection = null;
        let selectorReadFailed = false;
        if (canonicalTable) {
          try { selection = await inspectUsbOtaSelection(loader); }
          catch (error) {
            if (error?.code === 'usb-read-failed') {
              invalidateRead('ota-selector-read-failed');
              selectorReadFailed = true;
            }
          }
        }
        if (selectorReadFailed) return null;
        if (shouldStop?.() === true || now() >= deadline) {
          invalidateRead('cancelled-or-expired-during-read');
          return null;
        }
        return Object.freeze({
          firmwareVersion: candidate.firmwareVersion,
          buildId: candidate.buildId,
          buildNumber: candidate.buildNumber,
          ...(selection || {}),
          source: selection?.activeAppOffset === LIGHTWEAVER_APP_PARTITION_OFFSET
            ? 'usb-flash' : 'usb-app0-image',
        });
      }
      carry = scan.slice(Math.max(0, scan.length - ENVELOPE_OVERLAP));
    }
  } catch {
    invalidateRead('flash-read-failed');
    return null;
  } finally {
    if (scopedPacketTimeout && loader.FLASH_READ_TIMEOUT === INSPECTION_PACKET_TIMEOUT_MS) {
      loader.FLASH_READ_TIMEOUT = originalPacketTimeout;
    }
  }
  return null;
}
