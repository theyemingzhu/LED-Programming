import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import {
  LIGHTWEAVER_APP_PARTITION_OFFSET,
  LIGHTWEAVER_APP_PARTITION_SIZE,
  USB_FIRMWARE_READ_CHUNK_SIZE,
  espCanReportFirmwareIdentity,
  parseLightweaverFirmwareIdentity,
  readLightweaverFirmwareIdentity,
} from './usbFirmwareIdentity.js';

const releases = [
  {
    version: '1.1.1',
    buildId: '1366faf23a29a815044bae2e50405ff14b424e42',
    buildNumber: 1198,
    path: '../../public/firmware/releases/1.1.1/1366faf23a29a815044bae2e50405ff14b424e42/lightweaver-controller-esp32s3-factory.bin',
  },
  {
    version: '1.1.3',
    buildId: 'c80ba832eebe0b681112753b32d24001d01bf56f',
    buildNumber: 1223,
    path: '../../public/firmware/releases/1.1.3/c80ba832eebe0b681112753b32d24001d01bf56f/lightweaver-controller-esp32s3-factory.bin',
  },
];

const signed2070 = {
  version: '1.1.42',
  buildId: '64b1f5da6725d472d54e59cfa8352c8b0bf864d9',
  buildNumber: 2070,
  path: '../../public/firmware/releases/1.1.42/64b1f5da6725d472d54e59cfa8352c8b0bf864d9/lightweaver-controller-esp32s3-factory.bin',
};

async function signed2070Flash() {
  return new Uint8Array(await readFile(new URL(signed2070.path, import.meta.url)));
}

function flashReader(flash, { onRead } = {}) {
  return {
    async readFlash(address, size) {
      onRead?.(address, size);
      const result = new Uint8Array(size).fill(0xff);
      result.set(flash.subarray(address, Math.min(flash.length, address + size)));
      return result;
    },
  };
}

for (const release of releases) {
  test(`parses the strict identity envelope from the signed ${release.version} image`, async () => {
    const image = new Uint8Array(await readFile(new URL(release.path, import.meta.url)));
    const expected = {
      firmwareVersion: release.version,
      buildId: release.buildId,
      buildNumber: release.buildNumber,
      source: 'usb-flash',
    };
    assert.deepEqual(parseLightweaverFirmwareIdentity(image), expected);
    assert.deepEqual(await readLightweaverFirmwareIdentity({
      async readFlash(address, size) {
        const result = new Uint8Array(size).fill(0xff);
        result.set(image.subarray(address, Math.min(image.length, address + size)));
        return result;
      },
    }), expected);
  });
}

test('recognizes exact signed build 2070 from its complete application bytes on USB', async () => {
  const flash = await signed2070Flash();
  const expected = {
    firmwareVersion: signed2070.version,
    buildId: signed2070.buildId,
    buildNumber: signed2070.buildNumber,
    activeAppOffset: 0x10000,
    otaSequence: 1,
    otaState: 0xffffffff,
    otaDataSha256: createHash('sha256').update(flash.subarray(0xe000, 0x10000)).digest('hex'),
    source: 'usb-flash',
  };
  assert.equal(parseLightweaverFirmwareIdentity(flash), null, 'legacy string order must not guess this build');
  const reads = [];
  const progress = [];
  assert.deepEqual(await readLightweaverFirmwareIdentity(flashReader(flash, {
    onRead: (address, size) => reads.push([address, size]),
  }), { onProgress: value => progress.push(value) }), expected);
  assert.ok(reads.every(([address, size]) => (address >= LIGHTWEAVER_APP_PARTITION_OFFSET
    && address + size <= LIGHTWEAVER_APP_PARTITION_OFFSET + LIGHTWEAVER_APP_PARTITION_SIZE)
    || (address === 0x8000 && size === 0x1000)
    || (address === 0xe000 && size === 0x2000)), 'reads stay in app0, partition table, and OTA selector');
  assert.ok(progress.length > 1, 'the full-image verification remains visible');
});

test('signed app0 bytes with app1 selected remain informational, never installed firmware', async () => {
  const flash = await signed2070Flash();
  flash.set([2, 0, 0, 0], 0xf000);
  flash.set([2, 0, 0, 0], 0xf000 + 24);
  flash.set([0x74, 0x37, 0xf6, 0x55], 0xf000 + 28);
  const identity = await readLightweaverFirmwareIdentity(flashReader(flash));
  assert.equal(identity?.buildNumber, 2070);
  assert.equal(identity?.source, 'usb-app0-image');
  assert.equal(identity?.activeAppOffset, 0x650000);
});

test('signed app0 bytes on a different partition layout remain informational', async () => {
  const flash = await signed2070Flash();
  flash[0x8000 + 16] ^= 1;
  const identity = await readLightweaverFirmwareIdentity(flashReader(flash));
  assert.equal(identity?.buildNumber, 2070);
  assert.equal(identity?.source, 'usb-app0-image');
  assert.equal(identity?.activeAppOffset, undefined);
});

test('signed build 2070 recognition fails closed for altered or truncated flash', async () => {
  const factory = await signed2070Flash();
  for (const appRelativeOffset of [0xD0000, 0x80000, 0x180000]) {
    const altered = factory.slice();
    altered[LIGHTWEAVER_APP_PARTITION_OFFSET + appRelativeOffset] ^= 1;
    assert.equal(await readLightweaverFirmwareIdentity(flashReader(altered)), null,
      `altered application byte at ${appRelativeOffset.toString(16)} must not identify the signed build`);
  }
  const truncated = factory.subarray(0, LIGHTWEAVER_APP_PARTITION_OFFSET + 0x180000);
  assert.equal(await readLightweaverFirmwareIdentity(flashReader(truncated)), null);
});

test('signed build 2070 full-image verification honors cancellation and an explicit deadline', async () => {
  const flash = await signed2070Flash();
  let reads = 0;
  assert.equal(await readLightweaverFirmwareIdentity(flashReader(flash, {
    onRead: () => { reads += 1; },
  }), { shouldStop: () => reads >= 16 }), null);
  assert.equal(reads, 16);

  reads = 0;
  let clock = 0;
  assert.equal(await readLightweaverFirmwareIdentity({
    async readFlash(address, size) {
      reads += 1;
      clock += 1_000;
      return flashReader(flash).readFlash(address, size);
    },
  }, { timeoutMs: 16_000, now: () => clock }), null);
  assert.equal(reads, 16, 'an explicit caller deadline is never extended for a candidate');
});

test('an exact signed candidate can finish past the ordinary scan deadline, within its own bound', async () => {
  const flash = await signed2070Flash();
  let clock = 0;
  const identity = await readLightweaverFirmwareIdentity({
    async readFlash(address, size) {
      clock += 1_000;
      return flashReader(flash).readFlash(address, size);
    },
  }, { now: () => clock });
  assert.equal(identity?.buildNumber, 2070);
  assert.ok(clock > 25_000 && clock <= 60_000);
});

test('signed build 2070 is not accepted when the final flash read exceeds its deadline', async () => {
  const flash = await signed2070Flash();
  let clock = 0;
  const identity = await readLightweaverFirmwareIdentity({
    async readFlash(address, size) {
      clock += address >= LIGHTWEAVER_APP_PARTITION_OFFSET + 34 * USB_FIRMWARE_READ_CHUNK_SIZE
        ? 2_000 : 1_000;
      return flashReader(flash).readFlash(address, size);
    },
  }, { timeoutMs: 35_500, now: () => clock });
  assert.equal(identity, null);
  assert.equal(clock, 36_000);
});

test('a flash read failure invalidates the held inspection loader and restores its packet timeout', async () => {
  const failures = [];
  const loader = {
    FLASH_READ_TIMEOUT: 100_000,
    async readFlash() { throw new Error('packet stalled'); },
  };
  assert.equal(await readLightweaverFirmwareIdentity(loader, {
    onReadFailure: failure => failures.push(failure),
  }), null);
  assert.deepEqual(failures, [{ reason: 'flash-read-failed', needsReconnect: true }]);
  assert.equal(loader.FLASH_READ_TIMEOUT, 100_000);
});

test('a late cancellation or OTA selector read failure invalidates the held loader', async () => {
  const flash = await signed2070Flash();
  let cancelled = false;
  const cancellation = [];
  const late = {
    FLASH_READ_TIMEOUT: 100_000,
    async readFlash(address, size) {
      cancelled = true;
      return flashReader(flash).readFlash(address, size);
    },
  };
  assert.equal(await readLightweaverFirmwareIdentity(late, {
    shouldStop: () => cancelled,
    onReadFailure: failure => cancellation.push(failure.reason),
  }), null);
  assert.deepEqual(cancellation, ['cancelled-or-expired-during-read']);
  assert.equal(late.FLASH_READ_TIMEOUT, 100_000);

  const failures = [];
  const brokenSelector = {
    FLASH_READ_TIMEOUT: 100_000,
    async readFlash(address, size) {
      if (address === 0xe000) throw new Error('selector packet stalled');
      return flashReader(flash).readFlash(address, size);
    },
  };
  assert.equal(await readLightweaverFirmwareIdentity(brokenSelector, {
    onReadFailure: failure => failures.push(failure.reason),
  }), null);
  assert.deepEqual(failures, ['ota-selector-read-failed']);
  assert.equal(brokenSelector.FLASH_READ_TIMEOUT, 100_000);
});

test('rejects an arbitrary binary that only contains version and build strings', () => {
  const bytes = new TextEncoder().encode(`noise${'\0'}1.1.3${'\0'}${'a'.repeat(40)}${'\0'}noise`);
  assert.equal(parseLightweaverFirmwareIdentity(bytes), null);
});

test('chunked reader stays inside the app partition and finds an envelope across chunks', async () => {
  const prefix = 'lw-%012llx\0';
  const identity = `1.1.3\0${'c'.repeat(40)}\0`;
  const suffix = 'provisioningContractVersion';
  const envelope = new TextEncoder().encode(prefix + identity + suffix);
  const start = USB_FIRMWARE_READ_CHUNK_SIZE - 20;
  const virtual = new Uint8Array(USB_FIRMWARE_READ_CHUNK_SIZE * 2).fill(0xff);
  virtual.set(envelope, start);
  const calls = [];
  const loader = {
    async readFlash(address, size) {
      calls.push({ address, size });
      const relative = address - LIGHTWEAVER_APP_PARTITION_OFFSET;
      return virtual.slice(relative, relative + size);
    },
  };
  assert.deepEqual(await readLightweaverFirmwareIdentity(loader), {
    firmwareVersion: '1.1.3', buildId: 'c'.repeat(40), source: 'usb-flash',
  });
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0], {
    address: LIGHTWEAVER_APP_PARTITION_OFFSET,
    size: USB_FIRMWARE_READ_CHUNK_SIZE,
  });
  assert.ok(calls.every(({ address, size }) => address >= LIGHTWEAVER_APP_PARTITION_OFFSET
    && address + size <= LIGHTWEAVER_APP_PARTITION_OFFSET + LIGHTWEAVER_APP_PARTITION_SIZE));
});

test('read failure and erased app flash return null without leaving the app partition', async () => {
  const failedCalls = [];
  assert.equal(await readLightweaverFirmwareIdentity({
    async readFlash(address, size) {
      failedCalls.push({ address, size });
      throw new Error('serial read stopped');
    },
  }), null);
  assert.deepEqual(failedCalls, [{
    address: LIGHTWEAVER_APP_PARTITION_OFFSET,
    size: USB_FIRMWARE_READ_CHUNK_SIZE,
  }]);

  let erasedCalls = 0;
  assert.equal(await readLightweaverFirmwareIdentity({
    async readFlash() {
      erasedCalls += 1;
      return new Uint8Array(USB_FIRMWARE_READ_CHUNK_SIZE).fill(0xff);
    },
  }), null);
  assert.equal(erasedCalls, 1, 'an erased app stops without reading the full partition');
});

// The scan walks megabytes of card flash. Both of these bounds exist so a card
// whose stored version cannot be read can never present as a stuck button.
test('gives up at the deadline instead of scanning the whole partition', async () => {
  let chunks = 0;
  let clock = 0;
  const identity = await readLightweaverFirmwareIdentity({
    async readFlash(_address, size) {
      chunks += 1;
      clock += 4_000;
      return new Uint8Array(size).fill(0x41);
    },
  }, { timeoutMs: 10_000, now: () => clock });
  assert.equal(identity, null);
  assert.equal(chunks, 3, 'stops once the deadline has passed, not at the end of the partition');
});

test('stops between chunks when the caller takes the connection back', async () => {
  let chunks = 0;
  let stop = false;
  const identity = await readLightweaverFirmwareIdentity({
    async readFlash(_address, size) {
      chunks += 1;
      if (chunks === 2) stop = true;
      return new Uint8Array(size).fill(0x41);
    },
  }, { shouldStop: () => stop });
  assert.equal(identity, null);
  assert.equal(chunks, 2, 'no further read is issued once the caller asks it to stop');
});

test('reports how far through the card it has read', async () => {
  const seen = [];
  await readLightweaverFirmwareIdentity({
    async readFlash(_address, size) { return new Uint8Array(size).fill(0x41); },
  }, {
    timeoutMs: Infinity,
    shouldStop: () => seen.length >= 3,
    onProgress: report => seen.push(report),
  });
  assert.equal(seen.length, 3);
  assert.deepEqual(seen[0], { bytesRead: USB_FIRMWARE_READ_CHUNK_SIZE, totalBytes: LIGHTWEAVER_APP_PARTITION_SIZE });
  assert.equal(seen[2].bytesRead, USB_FIRMWARE_READ_CHUNK_SIZE * 3);
});

test('only the 16 MB ESP32-S3 card is put through the scan', () => {
  assert.equal(espCanReportFirmwareIdentity({ chipName: 'ESP32-S3', flashSize: '16MB' }), true);
  assert.equal(espCanReportFirmwareIdentity({ chipName: 'ESP32-S3', flashSize: '4MB' }), false);
  assert.equal(espCanReportFirmwareIdentity({ chipName: 'ESP32-C3', flashSize: '16MB' }), false);
  assert.equal(espCanReportFirmwareIdentity(null), false);
});
