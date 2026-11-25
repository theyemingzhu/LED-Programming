import { confirmedBoardProfile } from './boardLedPins.js';
import { displayStripName } from './stripLabels.js';
import { wiringFingerprint } from './wiringModel.js';

const RECEIPT_PREFIX = 'lw-installer-wiring-v1:';

function identity({ cardId, projectId, wiring, profile }) {
  if (typeof cardId !== 'string' || !/^lw-[a-f0-9]{12}$/.test(cardId) || !projectId || !wiring) return null;
  return {
    projectId,
    wiring: wiringFingerprint(wiring),
    profile: profile ? `${profile.id}@${profile.revision}` : '',
  };
}

// Called after an operator chooses Keep and Studio matches the saved card to
// that exact trial. Draft edits, automatic saves, and rolled-back trials do not
// create a receipt. Store the latest observed setup for each paired card.
export function recordInstallerWiringConfirmation({ cardId, projectId, wiring, confirmedRunIds }, storage = globalThis.localStorage) {
  try {
    const receipt = identity({ cardId, projectId, wiring, profile: confirmedBoardProfile(cardId, storage) });
    if (!receipt || !Array.isArray(confirmedRunIds)) return false;
    const eligible = new Set(wiring.runs.filter(run => run.type === 'strip').map(run => run.id));
    const runs = [...new Set(confirmedRunIds.filter(id => eligible.has(id)))];
    storage.setItem(`${RECEIPT_PREFIX}${cardId}`, JSON.stringify({ ...receipt, runs }));
    return true;
  } catch {
    return false;
  }
}

function confirmedRuns(input, storage) {
  try {
    const expected = identity(input);
    if (!expected) return new Set();
    const saved = JSON.parse(storage.getItem(`${RECEIPT_PREFIX}${input.cardId}`));
    if (!Array.isArray(saved?.runs) || saved.projectId !== expected.projectId
      || saved.wiring !== expected.wiring || saved.profile !== expected.profile) return new Set();
    return new Set(saved.runs);
  } catch {
    return new Set();
  }
}

function connectorPositions(profile, gpio) {
  const positions = [];
  for (const group of profile?.groups ?? []) {
    if (group.kind !== 'header') continue;
    group.pins.forEach((pin, index) => {
      if (pin.gpio === gpio) positions.push(`${group.name} pin ${group.start + index * group.step}`);
    });
  }
  return positions;
}

export function deriveInstallerWiringSheet({ cardId, projectId, wiring, compiled, strips = [], sectionFamilies, profile }, storage = globalThis.localStorage) {
  if (!compiled?.ok) return [];
  const checked = confirmedRuns({ cardId, projectId, wiring, profile }, storage);
  const names = new Map(strips.map(strip => [strip.id, displayStripName(strip, sectionFamilies)]));
  const outputs = new Map(compiled.outputs.map(output => [output.id, output.pin]));
  const rows = compiled.runs.filter(run => run.type === 'strip' && outputs.has(run.outputId)).map(run => {
    const { stripId, from, to } = run.source;
    const pin = outputs.get(run.outputId);
    return {
      id: run.id,
      stripId,
      name: names.get(stripId) || 'Unnamed strip',
      pins: connectorPositions(profile, pin),
      pin,
      count: run.count,
      start: from + 1,
      end: to + 1,
      checked: checked.has(run.id),
    };
  });
  const segments = new Map();
  for (const { stripId } of rows) segments.set(stripId, (segments.get(stripId) ?? 0) + 1);
  return rows.map(row => ({ ...row, segmented: segments.get(row.stripId) > 1 }));
}
