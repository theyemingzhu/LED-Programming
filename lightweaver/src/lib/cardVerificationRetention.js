import { normalizeUsbLedColorOrder } from './usbLedColorOrder.js';

const canonical = value => JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item)
  ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
const runPhysical = ({ verified, name, label, ...run }) => run;
const outputPhysical = output => ({ id: output?.id, pin: output?.pin, pixels: output?.pixels ?? output?.pixelCount });

// These are existing browser-project checks, not portable card-backed proof.
// Keep the legacy gate's shape; never manufacture evidence from an RGB fallback
// or the vacuous "every run passed" result for a project with no runs.
export function readBrowserPhysicalVerification({ wiring, standaloneController } = {}) {
  const runs = Array.isArray(wiring?.runs) ? wiring.runs : [];
  const physicallyVerified = Boolean(wiring?.verified && runs.length && runs.every(run => run?.verified));
  const led = standaloneController?.led;
  const colorOrder = normalizeUsbLedColorOrder(led?.colorOrder, '');
  const confirmedColorOrder = normalizeUsbLedColorOrder(led?.confirmedColorOrder, '');
  const colorConfirmed = Boolean(led?.colorOrderConfirmed && colorOrder && confirmedColorOrder === colorOrder);
  return Object.freeze({ physicallyVerified, colorConfirmed, verified: physicallyVerified && colorConfirmed });
}

// Called only after the existing edit/lock gate accepts a controller edit.
// Restore prior run flags only where the exact output and run remain comparable.
// Does not create new confirmations, bypass a lock, or authorise a card command.
export function retainCardPhysicalVerification({ wiring, nextWiring, standaloneController, nextStandaloneController, physicalColorConfirmed = false } = {}) {
  const priorOutputs = standaloneController?.outputs || [];
  const nextOutputs = nextStandaloneController?.outputs || [];
  const sameType = standaloneController?.led?.type === nextStandaloneController?.led?.type;
  const sameControls = canonical(standaloneController?.controls) === canonical(nextStandaloneController?.controls);
  const sameOutputs = canonical(priorOutputs.map(outputPhysical)) === canonical(nextOutputs.map(outputPhysical));
  const unchangedRun = run => {
    const priorRun = wiring?.runs?.find(item => item.id === run.id);
    if (!sameType || !sameControls || !priorRun?.verified || canonical(runPhysical(priorRun)) !== canonical(runPhysical(run))) return false;
    const before = wiring?.outputs?.filter(output => output.runIds?.includes(run.id)) || [];
    const after = nextWiring?.outputs?.filter(output => output.runIds?.includes(run.id)) || [];
    if (before.length !== 1 || after.length !== 1 || canonical(before.map(({ id, pin, runIds }) => ({ id, pin, runIds }))) !== canonical(after.map(({ id, pin, runIds }) => ({ id, pin, runIds })))) return false;
    const oldOutput = priorOutputs.filter(output => output.pin === before[0].pin);
    const newOutput = nextOutputs.filter(output => output.pin === after[0].pin);
    return oldOutput.length === 1 && newOutput.length === 1
      && canonical(outputPhysical(oldOutput[0])) === canonical(outputPhysical(newOutput[0]));
  };
  const runs = (nextWiring?.runs || []).map(run => ({ ...run, verified: unchangedRun(run) }));
  const retainedWiring = nextWiring === wiring && sameType && sameControls && sameOutputs
    ? nextWiring
    : { ...nextWiring, runs, verified: Boolean(wiring?.verified && runs.length && runs.every(run => run.verified)) };
  const led = nextStandaloneController?.led;
  const colorOrder = normalizeUsbLedColorOrder(led?.colorOrder, '');
  // Only explicit human-confirmation producers may set physicalColorConfirmed.
  const explicitNewConfirmation = physicalColorConfirmed === true
    || (standaloneController?.led?.colorOrderConfirmed !== true && led?.colorOrderConfirmed === true);
  const colorStillConfirmed = (explicitNewConfirmation || (sameType && sameControls && sameOutputs)) && Boolean(colorOrder)
    && normalizeUsbLedColorOrder(led?.confirmedColorOrder, '') === colorOrder && led?.colorOrderConfirmed === true;
  return {
    wiring: retainedWiring,
    standaloneController: led ? { ...nextStandaloneController, led: { ...led, colorOrderConfirmed: colorStillConfirmed } } : nextStandaloneController,
  };
}
