import { buildCardRuntimePackageFromProject } from './cardRuntimeProject.js';
import { BENCH_DEFAULT_PORT_PIXELS, BENCH_MAX_MILLIAMPS, BENCH_PROJECT_ID, BENCH_PROJECT_REVISION, buildBenchConfig } from './benchConfig.js';
import { projectSkeletonFromCardStatus } from './discoveryCommit.js';
import {
  pushConfigToCard,
  readCardFirmwareInfoEnvelope,
  readCardStatusEnvelope,
  shouldDirectApplyLedCountChange,
} from './cardPushClient.js';
import { reconcileWiringToStrips } from './wiringModel.js';
import { getCardWiringStatus } from './cardWiringSafety.js';
import { PORT_ROLE_STRIP } from './portRoles.js';

function isOnlyLedLengthChange(current = {}, runtimePackage = {}) {
  const target = runtimePackage.config || runtimePackage;
  const before = current.outputs;
  const after = target.led?.outputs;
  if (!Array.isArray(before) || !Array.isArray(after) || before.length !== after.length || !before.length) return false;
  if (String(current.ledType || current.led?.type || '') !== String(target.led?.type || '')) return false;
  if (Number(current.maxMilliamps ?? current.led?.maxMilliamps) !== Number(target.led?.maxMilliamps)) return false;
  let changed = 0;
  for (let index = 0; index < before.length; index += 1) {
    const live = before[index];
    const next = after[index];
    const liveSegments = live?.segments;
    const nextSegments = next?.segments;
    if (!live?.id || live.id !== next?.id || Number(live.pin ?? live.gpio) !== Number(next.pin)
      || !Array.isArray(liveSegments) || !Array.isArray(nextSegments) || liveSegments.length !== nextSegments.length) return false;
    for (let segment = 0; segment < liveSegments.length; segment += 1) {
      if (!liveSegments[segment]?.id || liveSegments[segment].id !== nextSegments[segment]?.id
        || (liveSegments[segment].direction || 'forward') !== (nextSegments[segment].direction || 'forward')) return false;
    }
    if (Number(live.pixels) !== Number(next.pixels)) changed += 1;
  }
  return changed === 1;
}

function isLiveBenchHeadroom(status = {}) {
  const outputs = status.outputs;
  return (status.projectId || status.piece?.id) === BENCH_PROJECT_ID
    && Array.isArray(outputs) && outputs.length > 0
    && outputs.every(output => Number(output.pixels) === BENCH_DEFAULT_PORT_PIXELS);
}

function sameOutputEvidence(left = [], right = []) {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
  return left.every((output, index) => {
    const other = right[index];
    if (!output?.id || output.id !== other?.id || Number(output.pin) !== Number(other.pin)
      || Number(output.pixels) !== Number(other.pixels)) return false;
    const segments = output.segments;
    const otherSegments = other.segments;
    return Array.isArray(segments) && Array.isArray(otherSegments)
      && segments.length === otherSegments.length
      && segments.every((segment, part) => segment?.id && segment.id === otherSegments[part]?.id
        && Number(segment.count) === Number(otherSegments[part]?.count)
        && (segment.direction || 'forward') === (otherSegments[part]?.direction || 'forward'));
  });
}

function joinExactCountEvidence(status = {}, firmware = {}) {
  if (!status.cardId || status.cardId !== firmware.cardId
    || !status.bootId || status.bootId !== firmware.bootId
    || !Number.isSafeInteger(status.buildNumber) || status.buildNumber !== firmware.buildNumber
    || !firmware.buildId || !firmware.firmwareVersion
    || status.projectRevision !== firmware.projectRevision
    || !status.projectFingerprint || status.projectFingerprint !== firmware.projectFingerprint
    || status.provisionalSetup !== firmware.provisionalSetup
    || status.led?.type !== firmware.ledType
    || status.led?.colorOrder !== firmware.outputColor?.colorOrder
    || Number(status.maxMilliamps) !== Number(firmware.maxMilliamps)
    || !sameOutputEvidence(status.outputs, firmware.outputs)) return null;
  return {
    ...status,
    ledType: firmware.ledType,
    outputColor: firmware.outputColor,
    controls: firmware.controls,
    led: { ...status.led, brightnessLimit: firmware.led?.brightnessLimit },
  };
}

function countedBenchPackage(status, { pixels, pin }) {
  const live = Array.isArray(status.outputs) ? status.outputs : [];
  if ((status.projectId || status.piece?.id) !== BENCH_PROJECT_ID || status.projectRevision !== BENCH_PROJECT_REVISION
    || !status.projectFingerprint || live.length !== 1
    || (status.provisionalSetup !== true && !isLiveBenchHeadroom(status))) return null;
  const output = live[0];
  const gpio = Number(output.pin ?? output.gpio);
  if (gpio !== Number(pin ?? gpio) || output.id !== `bench-${gpio}`
    || output.segments?.length !== 1 || output.segments[0]?.id !== `bench-${gpio}-full`
    || output.segments[0]?.direction !== 'forward') return null;
  const controls = status.controls;
  const encoder = controls?.encoder;
  const currentLimit = Number(status.maxMilliamps);
  const colorOrder = status.outputColor?.colorOrder;
  if (!encoder || !Number.isSafeInteger(currentLimit) || currentLimit < 100
    || currentLimit > BENCH_MAX_MILLIAMPS || !colorOrder || !status.ledType) return null;
  const built = buildBenchConfig([{ pin: gpio, role: PORT_ROLE_STRIP, pixelCount: pixels }], {
    pixelsPerPort: { [gpio]: pixels },
    ledType: status.ledType,
    colorOrder,
    maxMilliamps: currentLimit,
    brightnessLimit: status.led?.brightnessLimit,
    controls: {
      encoder: {
        a: encoder.a, b: encoder.b, press: encoder.press,
        alternatePress: encoder.configuredAlternatePress,
        rotateDirection: encoder.rotateDirection,
        brightnessStep: encoder.brightnessStep,
      },
      previous: controls.previous, next: controls.next, blackout: controls.blackout,
      brightness: controls.brightnessAnalog, statusLed: controls.statusLed,
    },
    maxPixels: status.limits?.pixels,
  });
  if (!built.config || built.totalPixels !== Number(pixels)) return null;
  return { format: 'lightweaver-card-runtime-package', config: built.config };
}

export function projectForTypedLedCount(project = {}) {
  const strips = Array.isArray(project.strips) && project.strips.length
    ? project.strips
    : (Array.isArray(project.layout?.strips) ? project.layout.strips : []);
  const wiring = reconcileWiringToStrips(project.wiring || project.layout?.wiring, strips);
  const typedPixels = strips.reduce((sum, strip) => {
    const count = Math.trunc(Number(strip?.pixelCount ?? strip?.pixels?.length) || 0);
    return sum + (count > 0 ? count : 0);
  }, 0);
  const configured = Array.isArray(project.standaloneController?.outputs)
    ? project.standaloneController.outputs
    : [];
  const outputs = typedPixels > 0 && configured.length === 1
    ? [{ ...configured[0], pixels: typedPixels }]
    : configured;
  return {
    ...project,
    strips,
    wiring,
    standaloneController: {
      ...(project.standaloneController || {}),
      outputs,
    },
  };
}

export function cardStatusWithPixelCount(status = {}, { pixels, pin } = {}) {
  const count = Math.trunc(Number(pixels));
  if (!Number.isSafeInteger(count) || count < 1) {
    throw new Error('LED count must be a positive whole number.');
  }
  const outputs = Array.isArray(status.outputs) ? status.outputs : [];
  const live = outputs.filter(output => Math.trunc(Number(output?.pixels) || 0) > 0);
  const targetPin = pin == null || pin === ''
    ? (live.length === 1 ? Number(live[0].pin ?? live[0].gpio) : null)
    : Number(pin);
  if (!Number.isFinite(targetPin)) {
    throw new Error('Say which GPIO when the card has more than one strip.');
  }
  const target = live.find(output => Number(output.pin ?? output.gpio) === targetPin);
  if (!target) throw new Error(`No strip on GPIO ${targetPin}.`);
  const segments = Array.isArray(target.segments) ? target.segments : [];
  if (segments.length > 1) {
    throw new Error('This output is split into more than one run. That is a wiring change, not a length change.');
  }
  const nextOutputs = outputs.map(output => {
    if (Number(output.pin ?? output.gpio) !== targetPin) return output;
    const nextSegments = segments.length === 1
      ? [{ ...segments[0], count }]
      : [{ id: `${output.id || 'out'}-full`, count, direction: 'forward' }];
    return { ...output, pixels: count, count, segments: nextSegments };
  });
  const total = nextOutputs.reduce((sum, output) => sum + Math.trunc(Number(output.pixels) || 0), 0);
  return {
    ...status,
    outputs: nextOutputs,
    led: { ...(status.led || {}), pixels: total },
  };
}

export function projectFromCountedCardStatus(status = {}, options = {}) {
  const counted = cardStatusWithPixelCount(status, options);
  const skeleton = projectSkeletonFromCardStatus(counted);
  return {
    projectId: String(status.projectId || status.piece?.id || ''),
    projectName: String(status.piece?.name || 'Lightweaver Piece'),
    strips: skeleton.strips,
    patchBoard: skeleton.patchBoard,
    wiring: { ...skeleton.wiring, locked: false, verified: false },
    standaloneController: {
      outputs: skeleton.outputs,
      led: {
        type: counted.led?.type || skeleton.led?.type,
        colorOrder: counted.led?.colorOrder,
        maxMilliamps: counted.led?.maxMilliamps ?? counted.maxMilliamps ?? skeleton.led?.maxMilliamps,
        outputGammaEnabled: counted.led?.outputGammaEnabled,
        outputGammaValue: counted.led?.outputGammaValue,
        calibration: counted.led?.calibration,
        ...skeleton.led,
      },
      defaultLook: { patternId: status.currentPatternId || 'aurora' },
    },
  };
}

export async function applyTypedLedCountToCard({
  host,
  project,
  runtimePackage: suppliedRuntimePackage,
  expectedEvidence,
  pushConfig = pushConfigToCard,
  readEvidence = readCardStatusEnvelope,
} = {}) {
  if (!host) return { applied: false, reason: 'disconnected' };
  const runtimePackage = suppliedRuntimePackage || buildCardRuntimePackageFromProject(projectForTypedLedCount(project));
  let evidence;
  try {
    evidence = await readEvidence({ host });
  } catch {
    return { applied: false, reason: 'unreachable' };
  }
  if (expectedEvidence && (evidence.cardId !== expectedEvidence.cardId
    || evidence.bootId !== expectedEvidence.bootId
    || evidence.buildNumber !== expectedEvidence.buildNumber
    || evidence.projectFingerprint !== expectedEvidence.projectFingerprint
    || !sameOutputEvidence(evidence.outputs, expectedEvidence.outputs))) {
    return { applied: false, reason: 'status-changed' };
  }
  if (!shouldDirectApplyLedCountChange(evidence, runtimePackage)
    || !isOnlyLedLengthChange(evidence, runtimePackage)) {
    return { applied: false, reason: 'not-a-length-change' };
  }
  const result = await pushConfig(runtimePackage, {
    host,
    reboot: 'if-needed',
    autoDiscover: false,
  });
  if (result?.state === 'staged' || result?.requiresConfirmation === true) {
    return { applied: false, reason: 'staged-candidate', result, runtimePackage };
  }
  return { applied: true, result, runtimePackage };
}

export async function applyLedCountOnCard({
  host,
  pixels,
  pin,
  readStatus = readCardStatusEnvelope,
  readFirmwareInfo = readCardFirmwareInfoEnvelope,
  readWiring = getCardWiringStatus,
  ...rest
} = {}) {
  if (!host) return { applied: false, reason: 'disconnected' };
  let wiring;
  try {
    wiring = await readWiring({ host, transport: 'direct' });
  } catch {
    return { applied: false, reason: 'wiring-unreachable' };
  }
  if (wiring?.state !== 'known-good' || wiring?.hasCandidate === true) {
    return { applied: false, reason: 'wiring-candidate-active' };
  }
  let status;
  try {
    status = await readStatus({ host, transport: 'direct' });
  } catch {
    return { applied: false, reason: 'unreachable' };
  }
  if (wiring.cardId && status.cardId && wiring.cardId !== status.cardId) {
    return { applied: false, reason: 'wrong-card' };
  }
  if ((status.projectId || status.piece?.id) === BENCH_PROJECT_ID
    && (status.provisionalSetup === true || isLiveBenchHeadroom(status))) {
    let firmware;
    try {
      firmware = await readFirmwareInfo({ host, transport: 'direct' });
    } catch {
      return { applied: false, reason: 'firmware-unreachable' };
    }
    const exact = joinExactCountEvidence(status, firmware);
    if (!exact) return { applied: false, reason: 'firmware-evidence-mismatch' };
    const runtimePackage = countedBenchPackage(exact, { pixels, pin });
    if (!runtimePackage) return { applied: false, reason: 'bench-evidence-incomplete' };
    return applyTypedLedCountToCard({ host, runtimePackage, expectedEvidence: exact, ...rest });
  }
  const project = projectFromCountedCardStatus(status, { pixels, pin });
  return applyTypedLedCountToCard({ host, project, ...rest });
}
