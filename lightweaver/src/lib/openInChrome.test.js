import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { resolve } from 'node:path';

test('builds a desktop Chrome launch URL without dropping path, query, or hash', async () => {
  let chromeLaunch;
  try {
    chromeLaunch = await import('./openInChrome.js');
  } catch {
    assert.fail('openInChrome should provide the Chrome launch helper');
  }

  const currentUrl = 'https://led.mandalacodes.com/design/?v=3&mode=flash#screen=flash';

  assert.equal(
    chromeLaunch.buildChromeLaunchUrl(currentUrl),
    `google-chrome://${currentUrl}`,
  );
});

test('copies the exact current URL and reports the fallback when Chrome stays closed', async () => {
  let chromeLaunch;
  try {
    chromeLaunch = await import('./openInChrome.js');
  } catch {
    assert.fail('openInChrome should provide the Chrome launch helper');
  }

  const currentUrl = 'https://led.mandalacodes.com/design/?v=3&mode=flash#screen=flash';
  const calls = [];
  let fallback;

  chromeLaunch.openInChrome({
    currentUrl,
    copyText: value => calls.push(['copy', value]),
    launch: value => calls.push(['launch', value]),
    scheduleFallback: callback => { fallback = callback; },
    isPageVisible: () => true,
    onFallback: message => calls.push(['feedback', message]),
  });

  assert.deepEqual(calls, [
    ['copy', currentUrl],
    ['launch', `google-chrome://${currentUrl}`],
  ]);

  await fallback();

  assert.deepEqual(calls.at(-1), [
    'feedback',
    'Link copied — paste it into Chrome.',
  ]);
});

test('does not show fallback feedback after the page leaves for Chrome', async () => {
  let chromeLaunch;
  try {
    chromeLaunch = await import('./openInChrome.js');
  } catch {
    assert.fail('openInChrome should provide the Chrome launch helper');
  }

  const calls = [];
  let fallback;

  chromeLaunch.openInChrome({
    currentUrl: 'https://led.mandalacodes.com/design/#screen=flash',
    copyText: () => {},
    launch: () => {},
    scheduleFallback: callback => { fallback = callback; },
    isPageVisible: () => false,
    onFallback: message => calls.push(message),
  });

  await fallback();

  assert.deepEqual(calls, []);
});

test('the unsupported-browser warning offers the Chrome action and fallback status', () => {
  const screen = readFileSync(resolve(import.meta.dirname, '../v3/lw-flash.jsx'), 'utf8');

  // Since #222 the warning is published through the notice layer, so the
  // action is a notice action (label + testId) and the fallback result rides
  // along as the notice body instead of a separate status element.
  assert.match(screen, /label: 'Open in Chrome'/);
  assert.match(screen, /testId: 'flash-open-in-chrome'/);
  assert.match(screen, /openInChrome/);
  assert.match(screen, /body: chromeFallback/);
  assert.match(screen, /role="status"/);
});
