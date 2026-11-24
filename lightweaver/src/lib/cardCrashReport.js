// Reads the card's crash record back from /api/status ("lastCrash").
// Contract: todo/plans/crash-recorder.md; the card (1.2.7, PR #522) also serves its last
// three records in full on GET /api/crash-log, which this reader does not use. Cards without the recorder omit the
// field; a card that has never crashed reports null. Both mean "nothing to show".
// A field that is present but malformed is reported as unreadable, never guessed.

const REASON_WORDS = {
  panic: 'crashed (software panic)',
  taskWatchdog: 'stopped responding (task watchdog)',
  interruptWatchdog: 'stopped responding (interrupt watchdog)',
  watchdog: 'stopped responding (watchdog)',
  brownout: 'lost power briefly (brownout)',
};

const PHASE_WORDS = {
  idle: 'idle',
  render: 'drawing lights',
  configSave: 'saving a project',
  wifi: 'handling Wi-Fi',
  storage: 'using storage',
  update: 'updating',
  http: 'answering a request',
};

const HEX32 = /^0x[0-9a-f]{8}$/;
const COUNT_FIELDS = ['sequence', 'resetReason', 'uptimeMs', 'freeHeap', 'minFreeHeap'];

function isCount(value) {
  return Number.isInteger(value) && value >= 0 && value <= 0xFFFFFFFF;
}

export function parseCardCrashReport(status) {
  const raw = status && typeof status === 'object' ? status.lastCrash : undefined;
  if (raw === undefined || raw === null) return { state: 'none', crash: null };
  if (typeof raw !== 'object' || Array.isArray(raw)) return { state: 'unreadable', crash: null };
  for (const field of COUNT_FIELDS) {
    if (!isCount(raw[field])) return { state: 'unreadable', crash: null };
  }
  if (raw.sequence < 1) return { state: 'unreadable', crash: null };
  if (typeof raw.reason !== 'string' || typeof raw.phase !== 'string' || typeof raw.task !== 'string') {
    return { state: 'unreadable', crash: null };
  }
  if (typeof raw.pc !== 'string' || !HEX32.test(raw.pc)) return { state: 'unreadable', crash: null };
  if (!Array.isArray(raw.backtrace) || raw.backtrace.length > 16 ||
      !raw.backtrace.every(entry => typeof entry === 'string' && HEX32.test(entry))) {
    return { state: 'unreadable', crash: null };
  }
  return {
    state: 'recorded',
    crash: {
      sequence: raw.sequence,
      resetReason: raw.resetReason,
      reason: raw.reason,
      phase: raw.phase,
      task: raw.task,
      uptimeMs: raw.uptimeMs,
      freeHeap: raw.freeHeap,
      minFreeHeap: raw.minFreeHeap,
      pc: raw.pc,
      backtrace: raw.backtrace.slice(),
      hasBacktrace: raw.backtrace.length > 0,
    },
  };
}

export function describeCardCrash(report) {
  if (report?.state !== 'recorded') return '';
  const { crash } = report;
  const what = REASON_WORDS[crash.reason] || 'restarted unexpectedly';
  const doing = PHASE_WORDS[crash.phase] || 'doing something unknown';
  const hours = (crash.uptimeMs / 3600000).toFixed(2);
  return `The card ${what} while ${doing}, after ${hours} hours running. It has done this ${crash.sequence} time${crash.sequence === 1 ? '' : 's'}.`;
}

// The Health row's line: the plain sentence for a recorded crash, a short
// admission for a record Studio cannot read, nothing otherwise.
export function cardCrashLine(report) {
  if (report?.state === 'recorded') return describeCardCrash(report);
  if (report?.state === 'unreadable') return 'The card reports a crash record Studio cannot read.';
  return '';
}

// What "Copy crash details" puts on the clipboard: enough for support to
// decode the trace addresses against the firmware.elf of the named build.
export function formatCardCrashDetails(report, { cardId = '', firmwareVersion = '', buildNumber = null } = {}) {
  if (report?.state !== 'recorded') return '';
  const { crash } = report;
  const build = Number.isInteger(buildNumber) && buildNumber > 0 ? String(buildNumber) : 'unknown';
  return [
    'Lightweaver card crash record',
    describeCardCrash(report),
    `Card: ${cardId || 'unknown'}`,
    `Firmware: ${firmwareVersion || 'unknown'} (build ${build})`,
    `Crash number: ${crash.sequence}`,
    `Reset reason: ${crash.resetReason} (${crash.reason})`,
    `Doing: ${crash.phase}`,
    `Task: ${crash.task || 'unknown'}`,
    `Uptime: ${crash.uptimeMs} ms`,
    `Free memory: ${crash.freeHeap} bytes (lowest ${crash.minFreeHeap})`,
    `Program address: ${crash.pc}`,
    `Backtrace: ${crash.hasBacktrace ? crash.backtrace.join(' ') : 'none recorded'}`,
  ].join('\n');
}
