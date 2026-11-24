import assert from 'node:assert/strict';
import test from 'node:test';
import { describeCardCrash, parseCardCrashReport } from './cardCrashReport.js';

const recorded = {
  sequence: 2, resetReason: 6, reason: 'taskWatchdog', phase: 'configSave', task: 'loopTask',
  uptimeMs: 27252000, freeHeap: 91234, minFreeHeap: 40960, pc: '0x420a1b2c',
  backtrace: ['0x420a1b2c', '0x4037f001'],
};

test('older cards and cards that never crashed show nothing', () => {
  assert.deepEqual(parseCardCrashReport({}), { state: 'none', crash: null });
  assert.deepEqual(parseCardCrashReport({ lastCrash: null }), { state: 'none', crash: null });
  assert.deepEqual(parseCardCrashReport(null), { state: 'none', crash: null });
  assert.equal(describeCardCrash(parseCardCrashReport({})), '');
});

test('a recorded crash is read back whole', () => {
  const report = parseCardCrashReport({ lastCrash: recorded });
  assert.equal(report.state, 'recorded');
  assert.equal(report.crash.reason, 'taskWatchdog');
  assert.equal(report.crash.uptimeMs, 27252000);
  assert.equal(report.crash.hasBacktrace, true);
  assert.deepEqual(report.crash.backtrace, recorded.backtrace);
});

test('a crash with no backtrace (watchdog) is still a crash', () => {
  const report = parseCardCrashReport({ lastCrash: { ...recorded, pc: '0x00000000', backtrace: [] } });
  assert.equal(report.state, 'recorded');
  assert.equal(report.crash.hasBacktrace, false);
});

test('malformed records are unreadable, never guessed', () => {
  for (const broken of [
    'crashed', [], { ...recorded, sequence: 0 }, { ...recorded, uptimeMs: -1 },
    { ...recorded, uptimeMs: 1.5 }, { ...recorded, freeHeap: '91234' }, { ...recorded, pc: '420a1b2c' },
    { ...recorded, pc: 4333500204 }, { ...recorded, backtrace: ['zz'] }, { ...recorded, backtrace: 'x' },
    { ...recorded, backtrace: new Array(17).fill('0x00000001') }, { ...recorded, task: 7 },
    { ...recorded, reason: undefined },
  ]) {
    assert.equal(parseCardCrashReport({ lastCrash: broken }).state, 'unreadable', JSON.stringify(broken));
  }
});

test('the plain-language line names the cause, the activity and the count', () => {
  const line = describeCardCrash(parseCardCrashReport({ lastCrash: recorded }));
  assert.match(line, /task watchdog/);
  assert.match(line, /saving a project/);
  assert.match(line, /7\.57 hours/);
  assert.match(line, /2 times/);
  const first = describeCardCrash(parseCardCrashReport({ lastCrash: { ...recorded, sequence: 1, reason: 'mystery', phase: 'x' } }));
  assert.match(first, /restarted unexpectedly/);
  assert.match(first, /1 time\./);
});
