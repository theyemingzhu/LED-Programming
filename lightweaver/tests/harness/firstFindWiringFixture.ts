import { prepareCardDeployment } from '../../src/lib/cardDeployment.js';
import { cardProjectFingerprint } from '../../src/lib/cardProjectResolver.js';
import { DEFAULT_CARD_CONTROLS } from '../../src/lib/cardRuntimeContract.js';
import { normalizePatchBoard } from '../../src/lib/patchBoard.js';
import { migrateProject } from '../../src/lib/projectModel.js';
import { cardState } from './cardStates';
import { createPracticeCard } from './practiceTiming';
import { counts, oldPins, project } from './replacementFixture';

/** The open draft and the installed Practice card start with the same wiring and fingerprint. */
export function createFirstFindWiringExercise() {
  const draft = migrateProject({
    ...project,
    layout: {
      ...project.layout,
      wiring: {
        ...project.layout.wiring,
        outputs: project.layout.wiring.outputs.map((output, index) => ({ ...output, pin: oldPins[index] })),
      },
    },
  });
  const fingerprint = cardProjectFingerprint(draft);
  const deployment = prepareCardDeployment({
    projectId: draft.id,
    projectName: draft.name,
    projectRevision: 4,
    projectFingerprint: fingerprint,
    strips: draft.layout.strips,
    patchBoard: normalizePatchBoard(draft.layout.patchBoard, draft.layout.strips),
    wiring: draft.layout.wiring,
    symmetry: draft.layout.symmetry,
    sidesMirrored: draft.pattern.sidesMirrored !== false,
    standaloneController: draft.devices.standaloneController,
  }).config;
  const { card, timing } = createPracticeCard({
    ...cardState('installed-match'),
    projectFingerprint: fingerprint,
    patterns: deployment.patterns,
    pixels: counts.reduce((sum, count) => sum + count, 0),
  }, {
    timing: 'real',
    seed: 11,
    initialOutputs: deployment.led.outputs,
    outputTopology: { maxOutputs: 4, outputPins: [15, 16, 17, 18, 21, 38, 40, 41], sequenceVersion: 1, experimental: false },
    overrides: { spontaneousSilence: null, unsettledAfterRestart: null },
  });
  (card.state as { firmwareControls?: unknown }).firmwareControls = DEFAULT_CARD_CONTROLS;
  card.state.minimalWiringCandidateAck = true;
  return { card, timing, draft, fingerprint };
}
