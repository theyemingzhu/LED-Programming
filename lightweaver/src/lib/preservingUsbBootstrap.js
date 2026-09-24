export const PRESERVING_BOOTSTRAP_RANGE = Object.freeze({ start: 0x10000, end: 0x650000 });
export const LIGHTWEAVER_PARTITION_TABLE_RANGE = Object.freeze({ start: 0x8000, end: 0x9000 });
export const LIGHTWEAVER_OTA_SELECTION_RANGE = Object.freeze({ start: 0xe000, end: 0x10000 });
const USB_READ_PACKET_TIMEOUT_MS = 5_000;

const BUILD_ID = /^[a-f0-9]{40}$/;
const SHA256 = /^[a-f0-9]{64}$/;

function text(value, max = 128) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function bytes(value) {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  return null;
}

async function sha256Hex(value) {
  const source = bytes(value);
  if (!source || !globalThis.crypto?.subtle) throw new Error('SHA-256 verification is unavailable.');
  const digest = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', source));
  return [...digest].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function fail(message) {
  throw new Error(`${message} Nothing was written; preserving update stopped before writing.`);
}

function otaSequenceCrc(bytes) {
  // ESP-IDF v4.4.7 uses crc32_le(0xffffffff, &ota_seq, 4). Each OTA record
  // stores that CRC at byte 28; the other bytes do not enter the checksum.
  let crc = 0;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 1) ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export function parseUsbOtaSelection(value) {
  const data = bytes(value);
  if (!data || data.byteLength !== LIGHTWEAVER_OTA_SELECTION_RANGE.end - LIGHTWEAVER_OTA_SELECTION_RANGE.start) return null;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const entries = [0, 0x1000].map(offset => {
    const sequence = view.getUint32(offset, true);
    const state = view.getUint32(offset + 24, true);
    const crc = view.getUint32(offset + 28, true);
    // Mirror the bootloader's candidate set first. NEW/PENDING and unknown
    // states can outrank an older valid app0 record; filtering them here would
    // falsely claim that app0 is currently selected.
    if (sequence === 0 || sequence === 0xffffffff || state === 3 || state === 4
      || crc !== otaSequenceCrc(data.subarray(offset, offset + 4))) return null;
    return { sequence, state };
  }).filter(Boolean);
  // An erased, invalid, or tied selector is not proof of the active slot,
  // even if a bootloader could choose a fallback image.
  if (!entries.length || (entries.length === 2 && entries[0].sequence === entries[1].sequence)) return null;
  const selected = entries.reduce((best, entry) => !best || entry.sequence > best.sequence ? entry : best, null);
  if (![2, 0xffffffff].includes(selected.state)) return null;
  return Object.freeze({
    activeAppOffset: selected.sequence % 2 === 1 ? PRESERVING_BOOTSTRAP_RANGE.start : PRESERVING_BOOTSTRAP_RANGE.end,
    otaSequence: selected.sequence,
    otaState: selected.state,
  });
}

export async function inspectUsbOtaSelection(loader) {
  if (typeof loader?.readFlash !== 'function') fail('The connected card cannot provide OTA boot-selection evidence.');
  let data;
  try { data = bytes(await loader.readFlash(LIGHTWEAVER_OTA_SELECTION_RANGE.start,
    LIGHTWEAVER_OTA_SELECTION_RANGE.end - LIGHTWEAVER_OTA_SELECTION_RANGE.start)); }
  catch {
    const error = new Error('Studio could not read the card OTA selector. Nothing was written.');
    error.code = 'usb-read-failed';
    throw error;
  }
  if (!data || data.byteLength !== 0x2000) {
    const error = new Error('The card returned an incomplete OTA selector. Nothing was written.');
    error.code = 'usb-read-failed';
    throw error;
  }
  const selection = parseUsbOtaSelection(data);
  if (!selection) fail('The active application slot cannot be proven from this card’s OTA selector.');
  return Object.freeze({ ...selection, otaDataSha256: await sha256Hex(data) });
}

export async function inspectPreservingBootstrapEvidence(loader, installedEvidence = {}) {
  if (typeof loader?.readFlash !== 'function') fail('The connected card cannot provide partition-layout evidence.');
  const size = LIGHTWEAVER_PARTITION_TABLE_RANGE.end - LIGHTWEAVER_PARTITION_TABLE_RANGE.start;
  let table;
  try { table = bytes(await loader.readFlash(LIGHTWEAVER_PARTITION_TABLE_RANGE.start, size)); }
  catch { fail('Studio could not read the card partition table.'); }
  if (!table || table.byteLength !== size) fail('The card returned an incomplete partition table.');
  const disposableTable = table.slice();
  const partitionTableSha256 = await sha256Hex(disposableTable);
  disposableTable.fill(0);
  const selection = await inspectUsbOtaSelection(loader);
  return Object.freeze({ ...installedEvidence, partitionTableSha256, ...selection });
}

export function planPreservingBootstrap(evidence = {}, release = {}) {
  const ticket = release?.ticket;
  const image = bytes(release?.imageBytes);
  const partition = ticket?.partition;
  const compatibility = ticket?.compatibility;
  const preservation = ticket?.preservation;
  if (!/^lw-[A-Za-z0-9][A-Za-z0-9._:-]{0,60}$/.test(text(evidence.cardId, 64))
    || text(evidence.chipName, 24).toUpperCase() !== 'ESP32-S3'
    || Number(evidence.flashBytes) !== 16 * 1024 * 1024) {
    fail('Studio could not prove the exact ESP32-S3 16 MB card.');
  }
  if (evidence.source !== 'usb-flash' || !text(evidence.firmwareVersion, 48)
    || !BUILD_ID.test(text(evidence.buildId, 40).toLowerCase())
    || !Number.isSafeInteger(evidence.buildNumber) || evidence.buildNumber < 1) {
    fail('Installed firmware identity was not read directly from this card.');
  }
  if (!ticket || ticket.target !== 'esp32-s3-n16r8'
    || !image || image.byteLength < 1 || image[0] !== 0xe9
    || ticket.image?.size !== image.byteLength
    || !SHA256.test(text(ticket.image?.sha256, 64).toLowerCase())) {
    fail('The signed application update is incomplete or targets another card.');
  }
  if (partition?.layout !== 'default_16MB.csv'
    || partition.app0Offset !== PRESERVING_BOOTSTRAP_RANGE.start
    || partition.app1Offset !== PRESERVING_BOOTSTRAP_RANGE.end
    || partition.slotSize !== PRESERVING_BOOTSTRAP_RANGE.end - PRESERVING_BOOTSTRAP_RANGE.start
    || !SHA256.test(text(partition.tableSha256, 64).toLowerCase())
    || text(evidence.partitionTableSha256, 64).toLowerCase() !== partition.tableSha256) {
    fail('The installed partition layout is not the signed preserving layout.');
  }
  if (evidence.installedAppOffset !== PRESERVING_BOOTSTRAP_RANGE.start
    || evidence.activeAppOffset !== PRESERVING_BOOTSTRAP_RANGE.start
    || !Number.isSafeInteger(evidence.otaSequence)
    || !SHA256.test(text(evidence.otaDataSha256, 64).toLowerCase())) {
    fail('The active application is not proven to be the supported app0 bootstrap source.');
  }
  if (!Number.isSafeInteger(compatibility?.minimumBootstrapBuild)
    || evidence.buildNumber < compatibility.minimumBootstrapBuild) {
    fail('This firmware build is not eligible for preserving USB bootstrap.');
  }
  if (preservation?.dataPartitionsIncluded !== false) {
    throw new Error('The signed update must declare that data partitions are not included. Nothing was written.');
  }
  const end = PRESERVING_BOOTSTRAP_RANGE.start + image.byteLength;
  if (end > PRESERVING_BOOTSTRAP_RANGE.end) fail('The signed application does not fit entirely inside app0.');
  return Object.freeze({
    address: PRESERVING_BOOTSTRAP_RANGE.start,
    eraseAll: false,
    bytes: image,
    expectedSha256: ticket.image.sha256,
    range: Object.freeze({ start: PRESERVING_BOOTSTRAP_RANGE.start, end }),
    cardId: evidence.cardId,
    target: Object.freeze({
      firmwareVersion: ticket.firmwareVersion,
      buildId: ticket.buildId,
      buildNumber: ticket.buildNumber,
    }),
  });
}

function interrupted(cause) {
  const error = new Error(`Preserving update stopped: ${cause?.message || String(cause)}. Update completion is unverified. Wi-Fi, projects, patterns, wiring, and settings were not targeted by this write. Reconnect this exact card and verify its running firmware before deciding whether another update is needed.`);
  error.cause = cause;
  error.code = 'usb-update-verification-unknown';
  error.recovery = 'verify-exact-target-runtime';
  return error;
}

export async function runPreservingUsbBootstrap({
  loader,
  transport,
  evidence,
  release,
  writeApplication,
  resetIntoApp,
  disconnect,
  onProgress,
} = {}) {
  let writeStarted = false;
  let resetAttempted = false;
  // esptool-js otherwise waits up to 100 seconds of silence for each read
  // packet. This transaction owns the loader until it disconnects; shorten
  // that inactivity wait for the selector, table, and final app readback.
  const originalPacketTimeout = loader?.FLASH_READ_TIMEOUT;
  const scopedPacketTimeout = Number.isFinite(originalPacketTimeout)
    && originalPacketTimeout > USB_READ_PACKET_TIMEOUT_MS;
  if (scopedPacketTimeout) loader.FLASH_READ_TIMEOUT = USB_READ_PACKET_TIMEOUT_MS;
  try {
    const inspected = await inspectPreservingBootstrapEvidence(loader, evidence);
    const plan = planPreservingBootstrap(inspected, release);
    const actualImageSha = await sha256Hex(plan.bytes);
    if (actualImageSha !== plan.expectedSha256) fail('The application bytes do not match the signed SHA-256.');
    if (typeof writeApplication !== 'function') fail('The preserving writer is unavailable.');
    const freshSelection = await inspectUsbOtaSelection(loader);
    if (freshSelection.activeAppOffset !== PRESERVING_BOOTSTRAP_RANGE.start
      || freshSelection.otaDataSha256 !== inspected.otaDataSha256) {
      fail('The card boot selector changed during USB preflight.');
    }
    writeStarted = true;
    await writeApplication(loader, plan.bytes, plan.address, false, value => onProgress?.({ phase: 'updating', progress: value }));
    onProgress?.({ phase: 'verifying', progress: 1 });
    const readback = bytes(await loader.readFlash(plan.address, plan.bytes.byteLength));
    if (!readback || readback.byteLength !== plan.bytes.byteLength
      || await sha256Hex(readback) !== plan.expectedSha256) {
      throw new Error('Application readback SHA-256 did not match.');
    }
    resetAttempted = true;
    await resetIntoApp?.(transport, loader);
    return Object.freeze({ ok: true, cardId: plan.cardId, target: plan.target, range: plan.range });
  } catch (error) {
    if (writeStarted) {
      // A failed finish/MD5/readback can leave the chip in the ROM loader even
      // when all write blocks were acknowledged. Best-effort boot the app
      // before releasing USB, but never turn that reset into update proof.
      if (!resetAttempted) {
        try { await resetIntoApp?.(transport, loader); } catch { /* preserve the original write/verification error */ }
      }
      throw interrupted(error);
    }
    throw error;
  } finally {
    if (scopedPacketTimeout && loader.FLASH_READ_TIMEOUT === USB_READ_PACKET_TIMEOUT_MS) {
      loader.FLASH_READ_TIMEOUT = originalPacketTimeout;
    }
    try { await disconnect?.(loader, transport); } catch { /* USB is already released */ }
  }
}
