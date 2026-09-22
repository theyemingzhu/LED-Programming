import { deriveCardAccess } from '../lib/cardAccess.js';
import { cardStatusAsConfig, verifyCardPostSaveState } from '../lib/cardDeployment.js';
import { createCardProjectRepository } from '../lib/cardProjectRepository.js';
import { pushConfigToCard, readCardProjectEvidence, readCardStatusEnvelope } from '../lib/cardPushClient.js';
import { syncRuntimePackageToCard } from '../lib/cardSectionSync.js';
import { getCardWiringStatus } from '../lib/cardWiringSafety.js';
import { runtimePackageForCardOperation } from '../lib/testStrip.js';

export async function readSceneDeliveryCardEvidence({ host, transport, cardLink, connected }) {
  const [firmware, status, wiringStatus] = await Promise.all([
    readCardProjectEvidence({ host, transport }),
    readCardStatusEnvelope({ host, transport }),
    getCardWiringStatus({ host, transport }),
  ]);
  const cardAccess = deriveCardAccess({ ...cardLink, readiness: status }, {
    connected,
    projectEvidence: [firmware, status],
  }).install;
  return {
    cardId: firmware.cardId,
    buildId: firmware.buildId,
    cardAccess,
    status,
    wiringStatus,
    previousConfig: cardStatusAsConfig(status),
    maxPixels: status.maxPixels ?? firmware.maxPixels,
    maxLooks: status.limits?.maxLooks ?? firmware.limits?.maxLooks,
  };
}

export function createSceneDeliveryOperations({
  authority,
  host,
  transport,
  cardLink,
  connected,
  acquireAuthority,
  signal,
  onProgress,
}) {
  const readPreflightEvidence = () => readSceneDeliveryCardEvidence({ host, transport, cardLink, connected });
  return {
    authority,
    host,
    signal,
    onProgress,
    commissioningProof: 'owner-confirmed-physical-control',
    readPreflightEvidence,
    async readSource({ projectId }) {
      const envelope = await createCardProjectRepository({ authority }).read(projectId);
      return { cardId: authority.cardId, envelope };
    },
    async syncRuntime({ runtimePackage, cardId }) {
      const exactPackage = runtimePackageForCardOperation(runtimePackage, { operation: 'save' });
      if (exactPackage?.config?.projectFingerprint !== runtimePackage?.config?.projectFingerprint) {
        const error = new Error('The runtime package changed after source preparation.');
        error.reason = 'runtime-fingerprint-mismatch';
        throw error;
      }
      const result = await syncRuntimePackageToCard({
        host,
        runtimePackage: exactPackage,
        expectedCardId: cardId,
        allowProjectChange: true,
        verifyPostSave: null,
        pushConfig: (packageToPush, options) => pushConfigToCard(packageToPush, { ...options, transport }),
      });
      return { ...result, ok: result?.ok !== false, delivered: result?.delivered !== false };
    },
    verifyRuntime: input => verifyCardPostSaveState({
      ...input,
      host,
      acquireAuthority,
    }),
    acquireAuthority,
  };
}

export function sceneDeliveryFailureMessage(reason, state = '') {
  if (reason === 'pairing-required') return 'Touch a physical control on the card, then try again.';
  if (reason === 'head-conflict') return 'The editable project on the card changed. Reopen that copy before replacing it.';
  if (reason === 'quota-exceeded') return 'The card does not have enough space for this editable project.';
  if (reason === 'project-mismatch') return 'This card belongs to a different project. Open the matching project or finish setup first.';
  if (reason === 'not-commissioned') return 'Run the LED check and confirm the colour order before installing this scene.';
  if (reason === 'wiring-incomplete' || reason === 'wiring-not-known-good') return 'Finish and verify the card wiring before installing this scene.';
  if (reason === 'scene-not-native') return 'This scene contains choices the card cannot play yet. Your editable draft is unchanged.';
  if (reason === 'cancelled') return 'Scene installation was cancelled. Your editable draft is unchanged.';
  if (['disconnected', 'direct-unavailable', 'identity-missing'].includes(reason)) return 'Connect this exact card before installing the scene.';
  if (state === 'saved-not-installed' || state === 'source-unverified') return 'The editable source was saved, but the scene is not verified on the card. Reconnect and retry.';
  if (state === 'needs-verification') return 'The card may have received the scene, but exact readback is still missing. Reconnect to verify it.';
  return 'The scene was not installed. Your editable draft remains saved in Studio.';
}
