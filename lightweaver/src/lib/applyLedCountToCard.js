import { buildCardRuntimePackageFromProject } from './cardRuntimeProject.js';
import { projectSkeletonFromCardStatus } from './discoveryCommit.js';
import {
  pushConfigToCard,
  readCardStatusEnvelope,
  shouldDirectApplyLedCountChange,
} from './cardPushClient.js';

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
  pushConfig = pushConfigToCard,
  readEvidence = readCardStatusEnvelope,
} = {}) {
  if (!host) return { applied: false, reason: 'disconnected' };
  const runtimePackage = buildCardRuntimePackageFromProject(project);
  let evidence;
  try {
    evidence = await readEvidence({ host });
  } catch {
    return { applied: false, reason: 'unreachable' };
  }
  if (!shouldDirectApplyLedCountChange(evidence, runtimePackage)) {
    return { applied: false, reason: 'not-a-length-change' };
  }
  const result = await pushConfig(runtimePackage, {
    host,
    reboot: 'if-needed',
    autoDiscover: false,
  });
  return { applied: true, result };
}

export async function applyLedCountOnCard({
  host,
  pixels,
  pin,
  readStatus = readCardStatusEnvelope,
  ...rest
} = {}) {
  if (!host) return { applied: false, reason: 'disconnected' };
  let status;
  try {
    status = await readStatus({ host, transport: 'direct' });
  } catch {
    return { applied: false, reason: 'unreachable' };
  }
  const project = projectFromCountedCardStatus(status, { pixels, pin });
  return applyTypedLedCountToCard({ host, project, ...rest });
}
