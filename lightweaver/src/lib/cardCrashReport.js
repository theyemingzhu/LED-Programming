// Reads the card's crash record back from /api/status ("lastCrash").
// Contract: todo/plans/crash-recorder.md. Cards without the recorder omit the
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
