import assert from 'node:assert/strict';
import test from 'node:test';

// Importing the helper must not launch an install.
const { missingRollupNativePackage } = await import('./ensure-rollup-native.mjs');

test('native repair follows the installed Rollup dependency name, including Windows MSVC and Linux musl', () => {
  assert.equal(typeof missingRollupNativePackage, 'function');
  for (const name of ['@rollup/rollup-win32-x64-msvc', '@rollup/rollup-linux-x64-musl']) {
    const error = new Error('Rollup failed', { cause: Object.assign(new Error(`Cannot find module '${name}'`), { code: 'MODULE_NOT_FOUND' }) });
    assert.deepEqual(missingRollupNativePackage(error, { [name]: '4.62.2' }), { name, version: '4.62.2' });
  }
});

test('repair refuses unrelated, unlisted, or broken DLL errors instead of installing guessed packages', () => {
  for (const error of [
    new Error("Cannot find module '@rollup/rollup-win32-x64'"),
    Object.assign(new Error("Cannot find module 'untrusted-package'"), { code: 'MODULE_NOT_FOUND' }),
    Object.assign(new Error('Required DLL was not found'), { code: 'ERR_DLOPEN_FAILED' }),
  ]) assert.equal(missingRollupNativePackage(error, { '@rollup/rollup-win32-x64-msvc': '4.62.2' }), null);
});
