// The physical test card exactly as it answered on 2026-11-21: holding the
// factory bench-discovery project, on firmware 1.2.4 build 2464, carrying a
// stale "rolled-back" firmware-update record.
//
// Every value below is copied from the card's own read-back in
// tests/harness/traces/real-card-bench-2026-11-21/ (status, firmware-info,
// wiring_status, zones, patterns; recorded by the durability session, Wi-Fi
// name redacted). tests/bench-discovery-card.spec.ts checks the practice card
// still answers those facts the same way.
//
// Not in CARD_STATES on purpose: the matrix iterates that list, and this is a
// faithful single card, not a new matrix cell.
//
//   const card = createBenchDiscoveryCard();          // Fast
//   const { card } = createBenchDiscoveryPracticeCard({ timing: 'real' });
import { BENCH_PROJECT_REVISION } from '../../src/lib/benchConfig.js';
import { BENCH_PROJECT_ID } from './cardStates.js';
import type { CardStateSpec } from './cardStates.js';
import { createCardSimulator } from './cardSimulator.js';
import type { CardSimulator } from './cardSimulator.js';
import { createPracticeCard } from './practiceTiming.js';
import type { TimingProfileName, TimingOverrides } from './practiceTiming.js';

export const BENCH_DISCOVERY_BUILD_ID = '56c00ce80e638b779e94653be5bd9700e8339070';

export const BENCH_DISCOVERY_STATE: CardStateSpec = {
  id: 'bench-discovery',
  describe: 'holding the factory bench-discovery project, as the physical card answers it now',
  projectId: BENCH_PROJECT_ID,
  projectName: 'Lightweaver Bench Discovery',
  projectRevision: BENCH_PROJECT_REVISION,
  projectFingerprint: 'd93ebe18ab7780b1',
  provisionalSetup: true,
  pin: 18,
  pixels: 256,
  patterns: [{ id: 'bench-warm', label: 'Bench Warm' }],
  currentIndex: 0,
  currentId: 'bench-warm',
  wiringTransactionOpen: false,
  buildId: BENCH_DISCOVERY_BUILD_ID,
  buildNumber: 2464,
  firmwareVersion: '1.2.4',
  dropFirstRequests: 0,
};

/** One output, one full-length segment: status.json and firmware-info.json `outputs`. */
export const BENCH_DISCOVERY_OUTPUTS = [{
  id: 'bench-18', pin: 18, pixels: 256,
  segments: [{ id: 'bench-18-full', count: 256, direction: 'forward' }],
}];

/** status.json `firmwareUpdate`: a past rollback the card still reports. */
export const BENCH_DISCOVERY_FIRMWARE_UPDATE = {
  phase: 'rolled-back',
  receivedBytes: 0,
  expectedBytes: 0,
  expectedBuildId: '',
  activeSlot: 'app0',
  pendingSlot: '',
  lastError: '',
  rollbackReason: 'new-slot-rollback-detected',
  rebootCorrelation: 'reboot-fde5e7912ffd193965c2ed4baed7d186',
  restoredFirmwareVersion: '1.2.4',
  restoredBuildId: BENCH_DISCOVERY_BUILD_ID,
  restoredBuildNumber: 2464,
};

/** zones.json: one zone, bench-full, warm-white at 0.25. */
function applyBenchDetails(card: CardSimulator) {
  const state = card.state as CardSimulator['state'] & {
    zoneIds?: string[];
    firmwareUpdateOverride?: Record<string, unknown>;
  };
  state.zoneIds = ['bench-full'];
  state.firmwareUpdateOverride = { ...BENCH_DISCOVERY_FIRMWARE_UPDATE };
  card.state.zoneControls.clear();
  card.state.zoneControls.set('bench-full', {
    brightness: 0.25, speed: 1, hueShift: 0, customHue: 32, customSaturation: 230,
    customBreathe: false, breatheLowerPct: 85, breatheUpperPct: 100, breatheCycleSeconds: 9,
    customDrift: false, driftHueMin: 0, driftHueMax: 255,
  });
  return card;
}

type SimOptions = NonNullable<Parameters<typeof createCardSimulator>[1]>;

export function createBenchDiscoveryCard(options: Omit<SimOptions, 'initialOutputs'> = {}): CardSimulator {
  const card = createCardSimulator(BENCH_DISCOVERY_STATE, { ...options, initialOutputs: BENCH_DISCOVERY_OUTPUTS });
  return applyBenchDetails(card);
}

export function createBenchDiscoveryPracticeCard(
  options: Omit<SimOptions, 'initialOutputs'> & { timing?: TimingProfileName; seed?: number; overrides?: TimingOverrides } = {},
) {
  const practice = createPracticeCard(BENCH_DISCOVERY_STATE, { ...options, initialOutputs: BENCH_DISCOVERY_OUTPUTS });
  applyBenchDetails(practice.card);
  return practice;
}
