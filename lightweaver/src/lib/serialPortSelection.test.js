import assert from 'node:assert/strict';
import test from 'node:test';
import { selectEspSerialPort } from './serialPortSelection.js';

const usb = (id, connected = true) => ({ id, connected,
  getInfo: () => ({ usbVendorId: 0x303a, usbProductId: 0x1001 }) });
const bluetooth = { id: 'bluetooth', connected: true,
  getInfo: () => ({ bluetoothServiceClassId: '1101' }) };

test('an explicit port takes priority without enumerating or prompting', async () => {
  const selected = usb('selected');
  let enumerations = 0;
  let prompts = 0;
  assert.equal(await selectEspSerialPort({ suppliedPort: selected, serial: {
    getPorts: async () => { enumerations++; return []; },
    requestPort: async () => { prompts++; return usb('prompted'); },
  } }), selected);
  assert.equal(enumerations, 0);
  assert.equal(prompts, 0);
});

test('one connected, previously authorized USB port is reused', async () => {
  const remembered = usb('remembered');
  let prompts = 0;
  assert.equal(await selectEspSerialPort({ serial: {
    getPorts: async () => [bluetooth, usb('disconnected', false), remembered],
    requestPort: async () => { prompts++; return usb('prompted'); },
  } }), remembered);
  assert.equal(prompts, 0);
});

test('zero, multiple, and unidentified USB ports retain the normal chooser', async () => {
  for (const authorized of [[], [usb('one'), usb('two')], [bluetooth],
    [{ id: 'unknown', connected: true }]]) {
    const chosen = usb('prompted');
    let prompts = 0;
    assert.equal(await selectEspSerialPort({ serial: {
      getPorts: async () => authorized,
      requestPort: async () => { prompts++; return chosen; },
    } }), chosen);
    assert.equal(prompts, 1);
  }
});

test('failed or stalled enumeration falls back to the normal chooser', async () => {
  const chosen = usb('prompted');
  for (const getPorts of [
    async () => { throw new Error('enumeration unavailable'); },
    async () => new Promise(() => {}),
  ]) {
    let prompts = 0;
    assert.equal(await selectEspSerialPort({ serial: {
      getPorts,
      requestPort: async () => { prompts++; return chosen; },
    } }), chosen);
    assert.equal(prompts, 1);
  }
});
