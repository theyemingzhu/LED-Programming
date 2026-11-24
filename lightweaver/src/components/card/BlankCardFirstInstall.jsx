import { useSyncExternalStore } from 'react';
import { getFirstInstallState, setFirstInstallState, subscribeFirstInstallState } from '../../lib/firstInstallState.js';
import { useProject } from '../../state/ProjectContext.jsx';
import { pushConfigToCard, readCardProjectEvidence, readCardStatusEnvelope } from '../../lib/cardPushClient.js';
import { prepareCardDeployment, waitForCardDeploymentVerification, correlateCardDeploymentReadinessEvidence, CARD_RESTART_WAIT_MS } from '../../lib/cardDeployment.js';
import { prepareCardStoragePayload } from '../../lib/cardStoragePayload.js';
import { withStudioHardwareOperation } from '../../lib/studioHardwareOperation.js';
import { acquireCardWriteLease } from '../../lib/cardWriteLease.js';
import { readPersistedCardIdentity } from '../../lib/cardIdentity.js';
import { getCardLinkState, noteCardRestartPlanned, noteCardRestartSettled } from '../../lib/cardLink.js';

// First install on a blank card: one whole-project save.
//
// A blank card has never held a layout, so the card applies its first wiring
// directly (LightweaverStorage.cpp "first wiring applied directly") instead of
// staging a candidate. That matters: the candidate is kept in one page of the
// card's small settings store, and a card that already holds the temporary
// Find-my-strips setup may have no page left for it ("candidate storage
// failed"). Studio's way out of that refusal is "clear that setup, then save
// again" — which leaves the card blank, and used to offer only Find my strips,
// looping the owner (real card, 2026-11-22).
//
// The write itself is pushConfigToCard's factory-blank path, the same one batch
// production uses (src/v3/lw-production.jsx): it proves the exact paired card
// and fresh factory-blank authority before it posts anything.
//
// The pre-install LED check is not asked for here because a blank card cannot
// play frames until it holds a project. The light check follows the install.
export function BlankCardFirstInstall({ host, transport, board, controller, className, onStart, onSettled }) {
  const {
    projectId, projectName, strips, wiring, compiledWiring,
    projectLifecycle, markProjectInstalled,
  } = useProject();
  // Shared, so a panel rebuilt while the card restarts keeps it (firstInstallState.js).
  const state = useSyncExternalStore(subscribeFirstInstallState, getFirstInstallState, getFirstInstallState);
  const setState = ({ status, message }) => setFirstInstallState({ status, message });
  const busy = state.status === 'pending';

  const save = async () => {
    if (busy || getFirstInstallState().phase === 'running') return;
    const cleanHost = String(host || getCardLinkState().host || 'lightweaver.local').trim().toLowerCase();
    const cardId = readPersistedCardIdentity()?.id || cleanHost;
    const claim = acquireCardWriteLease({ cardId, operation: 'install-project' });
    if (!claim.ok) { setState({ status: 'failed', message: claim.message }); return; }
    setState({ status: 'pending', message: 'Saving your project to the blank card…' });
    setFirstInstallState({ cardId });
    onStart?.();
    let ok = false;
    try {
      await withStudioHardwareOperation('install-project', async () => {
        const revision = projectLifecycle.editedRevision;
        const generation = projectLifecycle.generation;
        const prepared = prepareCardDeployment({
          projectId,
          projectName,
          projectRevision: revision,
          strips,
          patchBoard: board,
          wiring,
          compiledWiring,
          standaloneController: controller,
        }, (() => {
          // The read-back below checks the exact paired card. Without its
          // identity it threw "Exact card identity is required before
          // installation" after a write that had landed (practice card,
          // tests/blank-card-one-write.spec.ts; D10 on the real card).
          const identity = readPersistedCardIdentity();
          const card = getCardLinkState().card || {};
          return { cardId: identity?.id || card.cardId || '', buildId: identity?.buildId || card.buildId || '' };
        })());
        prepareCardStoragePayload(prepared.runtimePackage);
        const link = getCardLinkState();
        const fromBootId = link.validatedBootId || link.readiness?.bootId || '';
        noteCardRestartPlanned();
        try {
          const pushed = await pushConfigToCard(prepared.runtimePackage, {
            host: cleanHost,
            transport: transport || link.transport,
            autoDiscover: false,
            reboot: 'if-needed',
            allowProjectChange: true,
            allowLayoutChange: true,
            factoryBlank: true,
          });
          // A blank card's first save restarts the card only when the reply
          // says so (reboot: 'if-needed'), the same rule CardPushControl
          // follows. Waiting for a restart that never came held the card link
          // on "restarting" for the full 45 s and then flashed "Not connected"
          // (find-strips-combined way in 1, Fast).
          const restarting = pushed?.rebooting === true || pushed?.requiresReboot === true;
          if (!restarting) noteCardRestartSettled();
          setState({ status: 'pending', message: restarting ? 'Restarting the card…' : 'Checking the card…' });
          const verification = await waitForCardDeploymentVerification(prepared, {
            // Project evidence joined with the card's status, as the ordinary
            // install reads it (CardPushControl readReadyDeploymentEvidence):
            // project evidence alone carries no readiness, so requireReady
            // could never pass and a landed install read as failed.
            readEvidence: async () => {
              const route = { host: cleanHost, transport: transport || link.transport };
              const [project, status] = await Promise.all([readCardProjectEvidence(route), readCardStatusEnvelope(route)]);
              return { ...correlateCardDeploymentReadinessEvidence(project, status), readiness: status };
            },
            restartWaitMs: restarting ? CARD_RESTART_WAIT_MS : 0,
            restartFromBootId: restarting ? fromBootId : '',
            requireReady: true,
          });
          markProjectInstalled({
            revision,
            generation,
            cardId: verification.cardId,
            projectRevision: prepared.config.projectRevision,
            projectFingerprint: prepared.config.projectFingerprint,
          });
        } finally {
          noteCardRestartSettled();
        }
      });
      setState({ status: 'confirmed', message: 'Installed on card. Next, check the lights.' });
      ok = true;
    } catch (error) {
      setState({ status: 'failed', message: error?.message || 'Studio could not save the project to this blank card.' });
      setFirstInstallState({ reason: String(error?.reason || '') });
    } finally {
      claim.release();
      onSettled?.(ok);
    }
  };

  return (
    <>
      <button type="button" className={className} data-testid="blank-card-save" disabled={busy} aria-busy={busy ? 'true' : undefined} onClick={save}>
        {busy ? (state.message.startsWith('Restarting') ? 'Restarting the card…' : 'Saving…') : state.status === 'failed' ? 'Try saving again' : 'Save to card'}
      </button>
      {state.message && (
        <p className="lww-flow-message" role={state.status === 'failed' ? 'alert' : 'status'} data-testid="blank-card-save-status">{state.message}</p>
      )}
    </>
  );
}
