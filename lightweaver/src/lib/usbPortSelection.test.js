import test from 'node:test';
import assert from 'node:assert/strict';
import { isUsbPortSelectionCancelled } from './usbPortSelection.js';

test('dismissing the USB picker is a cancel, not a Serial exception to show', () => {
  assert.equal(isUsbPortSelectionCancelled(new DOMException('No port selected by the user.', 'NotFoundError')), true);
  assert.equal(isUsbPortSelectionCancelled(new Error("Failed to execute 'requestPort' on 'Serial': No port selected by the user.")), true);
});

test('real USB failures stay failures', () => {
  assert.equal(isUsbPortSelectionCancelled(new Error('USB serial driver was not found')), false);
  assert.equal(isUsbPortSelectionCancelled(new Error('Failed to connect')), false);
  assert.equal(isUsbPortSelectionCancelled(new DOMException('Access denied', 'NetworkError')), false);
});
