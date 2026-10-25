import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { validateCardHardwareManifest } from './generate-card-hardware-contract.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const manifest = JSON.parse(await readFile(path.join(root, 'packages/lightweaver-contract/card-hardware.json'), 'utf8'));

test('N16R8 flash and PSRAM GPIOs cannot enter the output contract', () => {
  for (let pin = 26; pin <= 37; pin += 1) {
    assert.throws(
      () => validateCardHardwareManifest({ ...manifest, outputPins: [...manifest.outputPins, pin] }),
      /reserved.*flash.*PSRAM|flash.*PSRAM.*reserved/i,
      `GPIO ${pin} must not be offered as an LED output`,
    );
  }
});

test('GPIO 39 is permitted as an N16R8 LED output', () => {
  const outputPins = [...manifest.outputPins.filter((pin) => pin !== 39), 39];
  assert.deepEqual(validateCardHardwareManifest({ ...manifest, outputPins }).outputPins, outputPins);
});
