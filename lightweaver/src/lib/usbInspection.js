let activeInspection = null;
let nextInspectionId = 1;
// After USB is released so the card can rejoin Wi-Fi, Studio must not poke
// /api/status until the owner asks. The card's radio is still coming up, and
// a background LAN poll is what this hold exists to stop.
let holdLanProbes = false;

function cleanCardId(value) {
  return String(value || '').trim().slice(0, 64);
}

export function registerActiveUsbInspection({ cardId, release } = {}) {
  const id = cleanCardId(cardId);
  if (!id) throw new TypeError('An exact USB-inspected card id is required.');
  if (typeof release !== 'function') throw new TypeError('A USB inspection release function is required.');
  const token = Object.freeze({ inspectionId: nextInspectionId++, cardId: id });
  activeInspection = { token, release, releasePromise: null };
  holdLanProbes = false;
  return token;
}

export function getActiveUsbInspection() {
  return activeInspection?.token || null;
}

export function lanProbesHeld() {
  return Boolean(activeInspection) || holdLanProbes;
}

export function allowLanProbes() {
  holdLanProbes = false;
}

export function holdBackgroundLanProbes() {
  holdLanProbes = true;
}

export function clearActiveUsbInspection(token) {
  if (!activeInspection || (token && activeInspection.token !== token)) return false;
  activeInspection = null;
  return true;
}

export async function releaseActiveUsbInspection() {
  const inspection = activeInspection;
  if (!inspection) return Object.freeze({ released: true, cardId: '' });
  if (inspection.releasePromise) return inspection.releasePromise;
  // Hold LAN before the USB disconnect starts. Clearing the token first
  // left a gap where a background status poll could fire while the card's
  // radio was still coming up — the race "Restart card for Wi-Fi" must not
  // lose to.
  holdLanProbes = true;
  inspection.releasePromise = (async () => {
    const released = await inspection.release();
    if (released === false) {
      holdLanProbes = Boolean(activeInspection);
      return Object.freeze({ released: false, cardId: inspection.token.cardId });
    }
    if (activeInspection === inspection) activeInspection = null;
    holdLanProbes = true;
    return Object.freeze({ released: true, cardId: inspection.token.cardId });
  })();
  try { return await inspection.releasePromise; }
  finally { inspection.releasePromise = null; }
}
