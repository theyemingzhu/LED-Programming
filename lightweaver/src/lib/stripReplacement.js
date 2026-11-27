import { activeBoardGpios, BOARD_CONTROL_FIELDS } from './gpioAssignments.js';
import { formatGpio } from './cardPinout.js';
import { selectBoardLedPins } from './boardLedPins.js';
import { readCardOutputCapabilities } from './cardHardwareContract.js';
import { prepareCardDeployment } from './cardDeployment.js';
import { compileWiring } from './wiringCompiler.js';
import { normalizePortRoles, PORT_ROLE_CONTROL, PORT_ROLE_STRIP, PORT_ROLE_UNUSED } from './portRoles.js';

// The signed 1.2.8 ESP32-S3 build used this compiled GPIO table before its
// status envelope began publishing outputTopology. Keep the fallback scoped
// to the exact build and live four-output/control evidence.
export const LEGACY_REPLACEMENT_BUILD_ID = '3d1b77422cb95042efa1602eba15c0633689098c';
const LEGACY_REPLACEMENT_PINS = [4, 5, 6, 7, 15, 16, 17, 18, 21, 38, 39, 40, 41, 42, 47, 48];

const pinOf = output => Number(output?.pin ?? output?.gpio);
const countOf = output => Number(output?.pixels ?? output?.count);

export function replacementOutputs(outputs, slotId, pin, { maxOutputs, pins }) {
  const slot = outputs.find(output => output.id === slotId);
  if (!slot) throw new Error('This output slot is no longer on the card.');
  if (outputs.length > maxOutputs) throw new Error(`This card supports ${maxOutputs} outputs.`);
  if (outputs.some(output => pinOf(output) === pin)) throw new Error(`${formatGpio(pin)} is already in use.`);
  if (!pins?.includes(pin)) throw new Error(`${formatGpio(pin)} is unavailable for LED output on this card.`);
  return outputs.map(output => output.id === slotId ? { ...output, pin } : output);
}

export function replacementCapabilities(evidence, profile) {
  const { maxOutputs, outputPins } = readCardOutputCapabilities(evidence);
  const reported = evidence?.controls;
  const reportedLimit = evidence?.limits?.outputs ?? evidence?.maxOutputs;
  const legacyPins = evidence?.app === 'Lightweaver' && evidence?.buildId === LEGACY_REPLACEMENT_BUILD_ID
    && evidence?.firmwareVersion === '1.2.8' && reportedLimit === 4 ? LEGACY_REPLACEMENT_PINS : null;
  const firmwarePins = outputPins ?? legacyPins;
  if (!firmwarePins || !Number.isSafeInteger(reportedLimit) || reportedLimit < 1 || !reported?.encoder) {
    return { maxOutputs, pins: null };
  }
  const controls = {
    ...reported,
    encoder: {
      ...reported.encoder,
      alternatePress: reported.encoder.effectiveAlternatePress
        ?? reported.encoder.configuredAlternatePress ?? reported.encoder.alternatePress,
    },
    brightness: reported.brightnessAnalog ?? reported.brightness,
  };
  if (!BOARD_CONTROL_FIELDS.every(({ path }) => Number.isInteger(path.reduce((object, key) => object?.[key], controls)))) {
    return { maxOutputs, pins: null };
  }
  const controlPins = activeBoardGpios([], controls).map(item => item.pin);
  const configuredAlternate = reported.encoder.configuredAlternatePress;
  if (Number.isInteger(configuredAlternate) && configuredAlternate >= 0) controlPins.push(configuredAlternate);
  return { maxOutputs, pins: selectBoardLedPins({ profile, firmwarePins, controlPins }) };
}

export function sameReplacementOutputs(expected, observed = []) {
  return Array.isArray(observed) && expected.length === observed.length && expected.every((output, index) => {
    const read = observed[index];
    const segments = read?.segments || [];
    const wanted = output.segments || [];
    return output.id === read?.id && pinOf(output) === pinOf(read) && countOf(output) === countOf(read)
      && wanted.length === segments.length && wanted.every((segment, i) => (
        segment.id === segments[i]?.id && Number(segment.count) === Number(segments[i].count)
        && (segment.direction || 'forward') === (segments[i].direction || 'forward')
      ));
  });
}

export function prepareStripReplacement({ project, status, outputs }) {
  if (!project?.id || status.projectId !== project.id || !status.projectFingerprint
    || status.knownGoodProject !== true || status.provisionalSetup === true) {
    throw new Error('Open the matching installed project before replacing an output.');
  }
  if (status.productionJobId) {
    throw new Error('Use the full production wiring check to replace a pin on this installed job.');
  }
  const layout = project.layout || {};
  const strips = layout.strips || [];
  const design = layout.wiring || {};
  const installed = status.outputs || [];
  const designById = new Map((design.outputs || []).map(output => [output.id, output]));
  if (!installed.length || installed.length !== designById.size || installed.some(output => !designById.has(output.id))) {
    throw new Error('The design and card have different output slots. Review the wiring plan before testing.');
  }
  const fromOutputs = current => {
    const wiring = { ...design, outputs: current.map(output => ({ ...designById.get(output.id), pin: pinOf(output) })) };
    const compiledWiring = compileWiring({ wiring, strips, groups: layout.layerGroups, symmetry: layout.symmetry });
    return prepareCardDeployment({
      projectId: project.id, projectName: project.name,
      projectRevision: Number(status.projectRevision),
      strips, wiring, compiledWiring, patchBoard: layout.patchBoard,
      symSettings: project.pattern?.symSettings,
      standaloneController: project.devices?.standaloneController,
    }, { cardId: status.cardId, buildId: status.buildId });
  };
  const previous = fromOutputs(installed);
  if (!sameReplacementOutputs(previous.config.led.outputs, installed) || previous.config.projectFingerprint !== status.projectFingerprint) {
    throw new Error('The open project differs from the card beyond pin assignments. Load the installed copy before replacing an output.');
  }
  const candidate = fromOutputs(outputs);
  if (!sameReplacementOutputs(candidate.config.led.outputs, outputs)) {
    throw new Error('The replacement changes the existing strip lengths or sections. Review the wiring plan first.');
  }
  return candidate;
}

export function designSlotForReplacement(wiring, outputId, oldPin, newPin) {
  const outputs = wiring?.outputs || [];
  const slot = outputs.find(output => output.id === outputId);
  return slot?.pin === oldPin && !outputs.some(output => output.pin === newPin) ? slot : null;
}

export function updateReplacementPortRoles(portRoles, oldPin, newPin) {
  const roles = normalizePortRoles(portRoles);
  const source = roles.find(entry => entry.pin === oldPin);
  const destination = roles.find(entry => entry.pin === newPin);
  if (source?.role === PORT_ROLE_CONTROL || (destination && destination.role !== PORT_ROLE_UNUSED)) {
    throw new Error('A saved pin assignment conflicts with this replacement. Review the recorded wiring before testing.');
  }
  if (source?.role !== PORT_ROLE_STRIP) return roles;
  const cleared = roles.map(entry => entry.pin === oldPin
    ? { ...entry, role: PORT_ROLE_UNUSED, pixelCount: 0 } : entry);
  return normalizePortRoles([{ ...source, pin: newPin }, ...cleared]);
}
