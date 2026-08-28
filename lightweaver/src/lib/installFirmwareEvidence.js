// The install screen already resolved what this USB-found card is running.
// The footer lives in the shell, so it cannot read that useMemo. This is the
// one-value bus between them: report while Find Card has a card, clear on leave.

let evidence = null;
const listeners = new Set();

function notify() {
  for (const listener of listeners) listener();
}

export function reportInstallFirmwareEvidence(identity) {
  evidence = identity && typeof identity === 'object' && !Array.isArray(identity) ? identity : null;
  notify();
}

export function getInstallFirmwareEvidence() {
  return evidence;
}

export function subscribeInstallFirmwareEvidence(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function clearInstallFirmwareEvidence() {
  if (evidence === null) return;
  evidence = null;
  notify();
}
