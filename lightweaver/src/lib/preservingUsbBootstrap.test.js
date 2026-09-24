import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import {
  PRESERVING_BOOTSTRAP_RANGE,
  LIGHTWEAVER_OTA_SELECTION_RANGE,
  inspectPreservingBootstrapEvidence,
  inspectUsbOtaSelection,
  parseUsbOtaSelection,
  planPreservingBootstrap,
  runPreservingUsbBootstrap,
} from './preservingUsbBootstrap.js';

const CARD_ID = 'lw-b0fe81f61b44';
const SOURCE_BUILD = '1'.repeat(40);
const TARGET_BUILD = '2'.repeat(40);
const TABLE = new Uint8Array(4096).fill(0xff);
TABLE.set([0xaa, 0x50, 0x01, 0x02], 0);
const TABLE_SHA = createHash('sha256').update(TABLE).digest('hex');
const OTA = new Uint8Array(0x2000).fill(0xff);
OTA.set([1, 0, 0, 0], 0);
OTA.set([0x9a, 0x98, 0x43, 0x47], 28);
const OTA_SHA = createHash('sha256').update(OTA).digest('hex');
const IMAGE = new Uint8Array(8193).fill(7);
IMAGE[0] = 0xe9;
const IMAGE_SHA = createHash('sha256').update(IMAGE).digest('hex');

function release() {
  return {
    manifest: { firmwareVersion: '1.2.0', buildId: TARGET_BUILD, buildNumber: 1300 },
    ticket: {
      schemaVersion: 1,
      firmwareVersion: '1.2.0', buildId: TARGET_BUILD, buildNumber: 1300,
      target: 'esp32-s3-n16r8',
      image: { size: IMAGE.byteLength, sha256: IMAGE_SHA },
      partition: {
        layout: 'default_16MB.csv', tableSha256: TABLE_SHA,
        app0Offset: 0x10000, app1Offset: 0x650000, slotSize: 0x640000,
      },
      compatibility: {
        firmwareApiMin: 2, firmwareApiMax: 2, projectSchemaMin: 3, projectSchemaMax: 3,
        minimumUpdaterVersion: 1, minimumBootstrapBuild: 1198,
      },
      preservation: { dataPartitionsIncluded: false },
    },
    imageBytes: IMAGE,
  };
}

function evidence() {
  return {
    cardId: CARD_ID, chipName: 'ESP32-S3', flashBytes: 16 * 1024 * 1024,
    firmwareVersion: '1.1.1', buildId: SOURCE_BUILD, buildNumber: 1198,
    source: 'usb-flash', partitionTableSha256: TABLE_SHA,
    installedAppOffset: 0x10000, activeAppOffset: 0x10000,
    otaSequence: 1, otaState: 0xffffffff, otaDataSha256: OTA_SHA,
  };
}

test('preserving USB plan requires direct exact evidence and permits one app0-only non-erasing write', () => {
  const plan = planPreservingBootstrap(evidence(), release());
  assert.deepEqual({
    address: plan.address, eraseAll: plan.eraseAll, size: plan.bytes.byteLength,
    start: plan.range.start, end: plan.range.end,
  }, {
    address: 0x10000, eraseAll: false, size: IMAGE.byteLength,
    start: 0x10000, end: 0x10000 + IMAGE.byteLength,
  });
  assert.deepEqual(PRESERVING_BOOTSTRAP_RANGE, { start: 0x10000, end: 0x650000 });
  for (const changed of [
    { source: 'remembered' },
    { partitionTableSha256: '0'.repeat(64) },
    { installedAppOffset: 0x650000 },
    { activeAppOffset: 0x650000 },
    { otaDataSha256: 'unverified' },
    { buildNumber: 1197 },
    { chipName: 'ESP32' },
  ]) {
    assert.throws(() => planPreservingBootstrap({ ...evidence(), ...changed }, release()), /before writing|preserving/i);
  }
  assert.throws(() => planPreservingBootstrap(evidence(), {
    ...release(),
    ticket: { ...release().ticket, preservation: { dataPartitionsIncluded: true } },
  }), /data partitions/i);
});

test('USB inspection hashes exactly raw [0x8000,0x9000) bytes and never reads NVS', async () => {
  const reads = [];
  const loader = {
    async readFlash(address, size) {
      reads.push([address, size]);
      return address === 0x8000 ? TABLE : OTA;
    },
  };
  const inspected = await inspectPreservingBootstrapEvidence(loader, evidence());
  assert.equal(inspected.partitionTableSha256, TABLE_SHA);
  assert.equal(inspected.activeAppOffset, 0x10000);
  assert.equal(inspected.otaDataSha256, OTA_SHA);
  assert.deepEqual(reads, [[0x8000, 0x1000], [0xe000, 0x2000]]);
});

test('bootstrap writes app0 without erase, verifies exact SHA-256 readback, resets, and releases USB', async () => {
  const events = [];
  const loader = {
    FLASH_READ_TIMEOUT: 100_000,
    async readFlash(address, size) {
      assert.equal(this.FLASH_READ_TIMEOUT, 5_000);
      events.push(['read', address, size]);
      return address === 0x8000 ? TABLE : address === 0xe000 ? OTA : IMAGE.slice(0, size);
    },
  };
  const result = await runPreservingUsbBootstrap({
    loader, transport: {}, evidence: evidence(), release: release(),
    writeApplication: async (_loader, bytes, address, eraseAll, onProgress) => {
      events.push(['write', address, eraseAll, bytes.byteLength]); onProgress?.(1);
    },
    resetIntoApp: async () => events.push(['reset']),
    disconnect: async () => events.push(['disconnect']),
  });
  assert.equal(result.ok, true);
  assert.equal(loader.FLASH_READ_TIMEOUT, 100_000);
  assert.deepEqual(events, [
    ['read', 0x8000, 0x1000],
    ['read', 0xe000, 0x2000],
    ['read', 0xe000, 0x2000],
    ['write', 0x10000, false, IMAGE.byteLength],
    ['read', 0x10000, IMAGE.byteLength],
    ['reset'], ['disconnect'],
  ]);
});

test('bootstrap announces readback verification as soon as the full USB write is acknowledged', async () => {
  const phases = [];
  let releaseReadback;
  let markReadbackStarted;
  const readbackStarted = new Promise(resolve => { markReadbackStarted = resolve; });
  const readback = new Promise(resolve => { releaseReadback = resolve; });
  const loader = {
    async readFlash(address) {
      if (address === 0x8000) return TABLE;
      if (address === 0xe000) return OTA;
      markReadbackStarted();
      return readback;
    },
  };
  const update = runPreservingUsbBootstrap({
    loader, transport: {}, evidence: evidence(), release: release(),
    writeApplication: async (_loader, _bytes, _address, _eraseAll, onProgress) => onProgress?.(1),
    resetIntoApp: async () => {},
    disconnect: async () => {},
    onProgress: event => phases.push(event.phase),
  });

  await readbackStarted;
  try {
    assert.deepEqual(phases, ['updating', 'verifying']);
  } finally {
    releaseReadback(IMAGE);
    await update;
  }
});

test('post-write interruption attempts app reset, releases USB, and leaves completion unknown', async () => {
  const events = [];
  const loader = {
    FLASH_READ_TIMEOUT: 100_000,
    readFlash: async address => address === 0x8000 ? TABLE.slice() : OTA.slice(),
  };
  await assert.rejects(() => runPreservingUsbBootstrap({
    loader,
    transport: {}, evidence: evidence(), release: release(),
    writeApplication: async (_loader, _bytes, _address, _eraseAll, onProgress) => {
      onProgress?.(1);
      throw new Error('flash finish/MD5 packet failed');
    },
    resetIntoApp: async () => events.push('reset'),
    disconnect: async () => events.push('disconnect'),
  }), error => {
    assert.match(error.message, /completion is unverified/i);
    assert.doesNotMatch(error.message, /repeat the preserving/i);
    assert.equal(error.code, 'usb-update-verification-unknown');
    assert.equal(error.recovery, 'verify-exact-target-runtime');
    return true;
  });
  assert.deepEqual(events, ['reset', 'disconnect']);
  assert.equal(loader.FLASH_READ_TIMEOUT, 100_000);
});

test('readback failure retains the original error even if recovery reset also fails', async () => {
  const events = [];
  await assert.rejects(() => runPreservingUsbBootstrap({
    loader: { async readFlash(address) {
      if (address === 0x8000) return TABLE;
      if (address === 0xe000) return OTA;
      throw new Error('Invalid head of packet (0x45)');
    } },
    transport: {}, evidence: evidence(), release: release(),
    writeApplication: async () => events.push('write'),
    resetIntoApp: async () => { events.push('reset'); throw new Error('reset port closed'); },
    disconnect: async () => events.push('disconnect'),
  }), error => {
    assert.match(error.message, /Invalid head of packet \(0x45\)/);
    assert.equal(error.code, 'usb-update-verification-unknown');
    assert.equal(error.recovery, 'verify-exact-target-runtime');
    return true;
  });
  assert.deepEqual(events, ['write', 'reset', 'disconnect']);
});

test('pre-write refusal keeps its no-write error and does not attempt a reset', async () => {
  const events = [];
  await assert.rejects(() => runPreservingUsbBootstrap({
    loader: { readFlash: async address => address === 0x8000 ? TABLE : OTA },
    transport: {}, evidence: { ...evidence(), source: 'remembered' }, release: release(),
    writeApplication: async () => events.push('write'),
    resetIntoApp: async () => events.push('reset'),
    disconnect: async () => events.push('disconnect'),
  }), error => {
    assert.match(error.message, /Nothing was written/);
    assert.equal(error.code, undefined);
    return true;
  });
  assert.deepEqual(events, ['disconnect']);
});

test('the actual signed build 2070 factory selector proves app0 without reading NVS', async () => {
  const factory = new Uint8Array(await readFile(new URL(
    '../../public/firmware/releases/1.1.42/64b1f5da6725d472d54e59cfa8352c8b0bf864d9/lightweaver-controller-esp32s3-factory.bin',
    import.meta.url,
  )));
  const ota = factory.subarray(LIGHTWEAVER_OTA_SELECTION_RANGE.start, LIGHTWEAVER_OTA_SELECTION_RANGE.end);
  assert.deepEqual(parseUsbOtaSelection(ota), {
    activeAppOffset: 0x10000, otaSequence: 1, otaState: 0xffffffff,
  });
  const selection = await inspectUsbOtaSelection({ readFlash: async () => ota });
  assert.equal(selection.activeAppOffset, 0x10000);
  assert.equal(selection.otaDataSha256, createHash('sha256').update(ota).digest('hex'));
});

test('OTA selector accepts stable newer app0 and rejects app1, pending, invalid and ambiguous records', () => {
  const entry = (sequence, state, crcBytes) => {
    const data = new Uint8Array(32).fill(0xff);
    new DataView(data.buffer).setUint32(0, sequence, true);
    new DataView(data.buffer).setUint32(24, state, true);
    data.set(crcBytes, 28);
    return data;
  };
  const withEntries = (first, second) => {
    const data = new Uint8Array(0x2000).fill(0xff);
    if (first) data.set(first, 0);
    if (second) data.set(second, 0x1000);
    return data;
  };
  const seq1 = entry(1, 0xffffffff, [0x9a, 0x98, 0x43, 0x47]);
  const seq2 = entry(2, 2, [0x74, 0x37, 0xf6, 0x55]);
  const seq3 = entry(3, 2, [0x11, 0x50, 0x4a, 0xed]);
  assert.equal(parseUsbOtaSelection(withEntries(seq1, seq2)).activeAppOffset, 0x650000);
  assert.equal(parseUsbOtaSelection(withEntries(seq2, seq3)).activeAppOffset, 0x10000);
  for (const invalid of [
    withEntries(null, null), withEntries(seq2, null),
    withEntries(seq1, entry(2, 0, [0x74, 0x37, 0xf6, 0x55])),
    withEntries(seq1, entry(2, 1, [0x74, 0x37, 0xf6, 0x55])),
    withEntries(seq1, entry(2, 5, [0x74, 0x37, 0xf6, 0x55])),
    withEntries(entry(1, 0, [0x9a, 0x98, 0x43, 0x47]), null),
    withEntries(entry(1, 1, [0x9a, 0x98, 0x43, 0x47]), null),
    withEntries(entry(1, 3, [0x9a, 0x98, 0x43, 0x47]), null),
    withEntries(entry(1, 4, [0x9a, 0x98, 0x43, 0x47]), null),
    withEntries(entry(1, 2, [0, 0, 0, 0]), null),
    withEntries(seq1, seq1),
    new Uint8Array(32),
  ]) {
    const selection = parseUsbOtaSelection(invalid);
    assert.ok(!selection || selection.activeAppOffset !== 0x10000);
  }
});

test('changed OTA selector after preflight stops before any preserving write', async () => {
  const newer = OTA.slice();
  newer.set([3, 0, 0, 0], 0x1000);
  newer.set([0x11, 0x50, 0x4a, 0xed], 0x1000 + 28);
  let otaReads = 0;
  let writes = 0;
  await assert.rejects(() => runPreservingUsbBootstrap({
    loader: {
      async readFlash(address) {
        if (address === 0x8000) return TABLE;
        if (address === 0xe000) return ++otaReads === 1 ? OTA : newer;
        return IMAGE;
      },
    },
    evidence: evidence(), release: release(),
    writeApplication: async () => { writes += 1; },
  }), /selector changed/i);
  assert.equal(writes, 0);
});

test('app1, pending, malformed and unreadable OTA selectors never reach a preserving write', async () => {
  const app1 = OTA.slice();
  app1.set([2, 0, 0, 0], 0x1000);
  app1.set([2, 0, 0, 0], 0x1000 + 24);
  app1.set([0x74, 0x37, 0xf6, 0x55], 0x1000 + 28);
  const pending = OTA.slice();
  pending.set([2, 0, 0, 0], 0x1000);
  pending.set([1, 0, 0, 0], 0x1000 + 24);
  pending.set([0x74, 0x37, 0xf6, 0x55], 0x1000 + 28);
  const newlySelected = pending.slice();
  newlySelected.set([0, 0, 0, 0], 0x1000 + 24);
  const unknownSelected = pending.slice();
  unknownSelected.set([5, 0, 0, 0], 0x1000 + 24);
  const malformed = OTA.slice();
  malformed[28] ^= 1;
  for (const selection of [app1, pending, newlySelected, unknownSelected, malformed,
    new Uint8Array(0x2000).fill(0xff), OTA.subarray(0, 31)]) {
    let writes = 0;
    await assert.rejects(() => runPreservingUsbBootstrap({
      loader: { readFlash: async address => address === 0x8000 ? TABLE : selection },
      evidence: evidence(), release: release(),
      writeApplication: async () => { writes += 1; },
    }));
    assert.equal(writes, 0);
  }
});
