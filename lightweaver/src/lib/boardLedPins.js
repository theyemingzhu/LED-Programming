import { readBoardLibrary, rememberedBoard } from './boardProfiles.js';

const sharedRoles = new Set(['gpio', 'led', 'jtag']);
const reservedInstallationFunctions = /^(microSD\b|Dial\b|Previous$|Next$|Blackout$|Brightness$|Status LED$)/i;

export function confirmedBoardProfile(cardId, storage = globalThis.localStorage) {
  if (!cardId || !storage) return null;
  try {
    const choice = rememberedBoard(readBoardLibrary(storage), cardId);
    return choice?.current ? choice.profile : null;
  } catch {
    return null;
  }
}

// A profile can rule out a pin. The connected firmware remains the source of
// output capability, including when a saved map describes a newer PCB.
export function selectBoardLedPins({ profile, firmwarePins, controlPins = [] }) {
  const blocked = new Set(controlPins.filter(Number.isInteger));
  if (!profile) return firmwarePins.filter(gpio => !blocked.has(gpio));

  const exposed = new Set();
  for (const group of profile.groups) {
    for (const pin of group.pins) {
      if (!Number.isInteger(pin.gpio)) continue;
      if (!sharedRoles.has(pin.role) || reservedInstallationFunctions.test(pin.installation || '')) {
        blocked.add(pin.gpio);
      }
      if (group.kind === 'header') exposed.add(pin.gpio);
    }
  }
  return firmwarePins.filter(gpio => exposed.has(gpio) && !blocked.has(gpio));
}
