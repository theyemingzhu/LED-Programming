import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { getCardLinkState, subscribeCardLink } from '../../lib/cardLink.js';
import { classifyCardReadiness } from '../../lib/cardReadiness.js';
import { useProject } from '../../state/ProjectContext.jsx';
import { normalizePatchBoard } from '../../lib/patchBoard.js';
import { CardPushControl } from '../layout/shared/CardPushControl.jsx';
import { WireHoverDescription } from '../layout/shared/WireHoverDescription.jsx';
import { WiringPreflight } from '../layout/wire/WiringPreflight.jsx';
import { WiringBenchTest } from '../layout/wire/WiringBenchTest.jsx';
import { StripColorOrderCheck } from '../layout/wire/StripColorOrderCheck.jsx';
import { evaluateCardInstallGate, readCardAccessLevel, readCardCommissioningVerification } from '../../lib/cardInstallGate.js';
import { STRIP_DISCOVERY_BLANK_MESSAGE, STRIP_DISCOVERY_LABEL, STRIP_DISCOVERY_ROUTE, needsStripDiscovery } from '../../lib/cardAction.js';
import { planAdjacentStripBoundary, planOutputPixelCountAdjustment } from '../../lib/wiringChase.js';
import '../../styles/lw-wire.css';

// Guided find-strips / finish-wire / LED check / color-order / install flow.
// Extracted from Test & Install so Card Home can render the same action later.
// CardPushControl stays the only project-write implementation.
export function CardInstallAction({
  connected,
  cardHost,
  onEditInWire,
  onAdjustBoundary,
  onAdjustOutput,
  mutationError = '',
}) {
  const {
    wiring, updateWiring, compiledWiring, patchBoard,
    projectId, projectName, standaloneController, setStandaloneController, confirmedCardLook,
    strips, setStrips,
  } = useProject();
  // True while the guided LED check owns the primary flow area — the bench
  // wizard runs first, then the color quiz presents itself as the next question.
  const [checkFlowOpen, setCheckFlowOpen] = useState(false);
  // The wiring check asks the owner to judge by COLOUR ("first blue, last red,
  // green in between") but the colour order is only verified afterwards. When
  // the order is wrong that step is unanswerable — the strip shows the wrong
  // colours and the only trouble option offered was the LED count, which is not
  // the fault. This lets the colour check jump the queue and hand back.
  const [colorCheckFirst, setColorCheckFirst] = useState(false);
  const stripsById = useMemo(() => new Map(strips.map(strip => [strip.id, strip])), [strips]);
  const runsById = useMemo(() => new Map(wiring.runs.map(run => [run.id, run])), [wiring.runs]);
  // CardPushControl still accepts the legacy transport shape. Build that shape
  // from canonical wiring at the boundary; patchBoard is never read or mutated.
  const cardTransportBoard = useMemo(() => normalizePatchBoard({
    physicalLocked: wiring.locked,
    patches: wiring.runs.filter(run => run.type !== 'cable').map(run => run.type === 'inactive'
      ? { id: run.id, name: 'Reserved · unlit', source: { type: 'off', ledCount: run.count }, output: { mode: 'off' } }
      : {
          id: run.id,
          name: stripsById.get(run.source.stripId)?.name || run.id,
          source: {
            type: 'strip', stripId: run.source.stripId,
            startLed: run.physicalDirection === 'source-reverse' ? run.source.to : run.source.from,
            endLed: run.physicalDirection === 'source-reverse' ? run.source.from : run.source.to,
          },
          output: { mode: 'normal' },
        }),
    chains: wiring.outputs.map(output => ({ id: output.id, name: output.name || output.id, rowIds: output.runIds.filter(id => runsById.get(id)?.type !== 'cable') })),
  }, strips), [wiring, strips, stripsById, runsById]);
  const installController = useMemo(() => ({
    ...standaloneController,
    outputs: compiledWiring.outputs.map(output => ({
      id: output.id,
      name: output.name,
      pin: output.pin,
      pixels: output.count,
      direction: output.direction,
      segments: output.segments,
    })),
  }), [standaloneController, compiledWiring.outputs]);
  const adjustableRunIds = useMemo(() => wiring.outputs.flatMap(output => output.runIds.filter((runId, index) => {
    const run = runsById.get(runId);
    if (run?.type !== 'strip') return false;
    return runsById.get(output.runIds[index + 1])?.type === 'strip' || runsById.get(output.runIds[index - 1])?.type === 'strip';
  })), [wiring.outputs, runsById]);
  const adjustableOutputIds = useMemo(() => wiring.outputs
    .filter(output => output.runIds.some(runId => runsById.get(runId)?.type === 'strip'))
    .map(output => output.id), [wiring.outputs, runsById]);

  const applyStripCountUpdates = updates => {
    const validationStrips = strips.map(strip => {
      const update = updates.find(item => item.stripId === strip.id);
      return update ? { ...strip, pixelCount: update.count } : strip;
    });
    const result = updateWiring(draft => {
      for (const update of updates) {
        const run = draft.runs.find(item => item.id === update.runId);
        if (!run || run.type !== 'strip') continue;
        run.source.from = 0;
        run.source.to = update.count - 1;
        if (run.seamLed != null && run.seamLed > run.source.to) run.seamLed = run.source.to;
      }
    }, { changeKind: 'seam', runIds: updates.map(item => item.runId), strips: validationStrips });
    if (!result.ok) return result;
    setStrips(current => current.map(strip => {
      const update = updates.find(item => item.stripId === strip.id);
      return update ? { ...strip, pixelCount: update.count } : strip;
    }), { recordHistory: false });
    return result;
  };
  const adjustRunBoundary = (runId, delta) => {
    if (onAdjustBoundary) return onAdjustBoundary(runId, delta);
    const output = wiring.outputs.find(item => item.runIds.includes(runId));
    if (!output) return { ok: false, error: 'Run is not assigned to an output.' };
    try {
      return applyStripCountUpdates(planAdjacentStripBoundary(
        wiring,
        Object.fromEntries(strips.map(strip => [strip.id, strip.pixelCount])),
        { outputId: output.id, runId, delta },
      ));
    } catch (error) {
      return { ok: false, error: error.message };
    }
  };
  const adjustOutputCount = (outputId, delta) => {
    if (onAdjustOutput) return onAdjustOutput(outputId, delta);
    try {
      return applyStripCountUpdates([planOutputPixelCountAdjustment(
        wiring,
        Object.fromEntries(strips.map(strip => [strip.id, strip.pixelCount])),
        { outputId, delta },
      )]);
    } catch (error) {
      return { ok: false, error: error.message };
    }
  };

  const stripIds = new Set(strips.map(strip => strip.id));
  const mappedStripIds = new Set(wiring.runs.filter(run => run.type === 'strip' && stripIds.has(run.source.stripId)).map(run => run.source.stripId));
  const mappingCoversEveryStrip = mappedStripIds.size === stripIds.size
    && !wiring.runs.some(run => run.type === 'strip' && !stripIds.has(run.source.stripId));
  const mappingReady = compiledWiring.ok && mappingCoversEveryStrip;
  // Shared with the Playlist install gate so the two screens can never
  // disagree about what counts as a commissioned card (src/lib/cardInstallGate.js).
  const commissioning = readCardCommissioningVerification({ wiring, standaloneController });
  const physicallyVerified = commissioning.physicallyVerified;
  const commissioningVerified = commissioning.verified;
  // What the card itself reports it is holding. LayoutScreen passes only
  // `connected`/`cardHost`, so the readiness evidence is read from the shared
  // card link here rather than threaded through a file this panel does not own.
  const cardLink = useSyncExternalStore(subscribeCardLink, getCardLinkState, getCardLinkState);
  const cardReadinessState = cardLink.readiness
    ? classifyCardReadiness(cardLink.readiness, { expectedCard: cardLink.expectedCard }).state
    : (cardLink.cardBlank === true ? 'blank' : '');
  const cardAccess = readCardAccessLevel(
    cardReadinessState === 'blank' ? 'blank' : 'ready',
    cardLink.card,
    cardLink.readiness,
  );
  // This push always sends allowLayoutChange, so it is the wiring-affecting
  // case the gate exists for. It deliberately does not require a live ambient
  // link: pushConfigToCard runs its own discovery and can fall back to the
  // bounded installer handoff for the exact paired card. cardAccess is still
  // stated at its single source, so this screen cannot drift from the ones that
  // do check the link.
  const installGate = evaluateCardInstallGate({
    cardAccess,
    wiringAffecting: true,
    wiringSendReady: compiledWiring.sendReady,
    commissioningVerified,
    requiresLiveLink: false,
  });
  useEffect(() => {
    // Verification auto-locks the wiring. Safe from looping: changeKind null
    // plus an unchanged wiring fingerprint (locked is excluded from it) means
    // locking never invalidates the verification it depends on.
    if (!commissioningVerified || !compiledWiring.ok || wiring.locked) return;
    updateWiring(draft => { draft.locked = true; }, { changeKind: null });
  }, [commissioningVerified, compiledWiring.ok, wiring.locked, updateWiring]);
  // The LED check below lights real LEDs, which means 'frame' messages, which
  // the bridge refuses while the card reports playbackReady=false. A card with
  // no project always reports exactly that — so offering the check here is
  // offering a button that cannot work, and the install it gates cannot be
  // reached any other way. Send those cards to discovery instead.
  //
  // A bench card is NOT sent there. It is Ready, it lights LEDs, and the whole
  // point of the bench config is to be replaced: this branch owns the install
  // CTA, so routing a bench card back to discovery would close the only exit
  // discovery has and loop the owner between the two screens forever.
  const cardNeedsStripDiscovery = needsStripDiscovery({ readinessState: cardReadinessState });
  const openStripDiscovery = () => { window.location.hash = STRIP_DISCOVERY_ROUTE; };
  const unlockWiring = () => {
    updateWiring(draft => {
      draft.locked = false;
      draft.verified = false;
      draft.runs.forEach(run => { run.verified = false; });
    }, { changeKind: null });
  };

  return (
    <WireHoverDescription className="lww-flow" data-testid="commissioning-step">
      {cardNeedsStripDiscovery ? (
        <>
          <h3 className="lww-flow-title">Find this card&rsquo;s strips first</h3>
          <p className="lww-flow-message" data-testid="wire-blank-card-message">{STRIP_DISCOVERY_BLANK_MESSAGE}</p>
          <button
            type="button"
            className="btn primary lww-cta"
            data-testid="wire-find-strips"
            title="Open strip discovery, which sets the card up once and then counts each strip with its own LEDs."
            data-tooltip="Open strip discovery, which sets the card up once and then counts each strip with its own LEDs."
            onClick={openStripDiscovery}
          >{STRIP_DISCOVERY_LABEL}</button>
        </>
      ) : patchBoard?.dataWireCountNeedsReview || !mappingReady ? (
        <>
          <h3 className="lww-flow-title">Finish the setup in Wire</h3>
          <p className="lww-flow-message">
            {patchBoard?.dataWireCountNeedsReview
              ? 'This older project needs each strip’s GPIO confirmed before the physical check.'
              : 'Every strip needs a GPIO and a place in the first-to-last wiring order.'}
          </p>
          <WiringPreflight compiled={compiledWiring} mutationError={mutationError} />
          <button type="button" className="btn primary lww-cta" title="Open the Wire workspace to assign GPIOs and arrange the physical LED order." data-tooltip="Open the Wire workspace to assign GPIOs and arrange the physical LED order." onClick={onEditInWire}>Edit in Wire</button>
        </>
      ) : !commissioningVerified ? (
        wiring.locked ? (
          // REACHABLE, despite the note that used to sit here saying it was a
          // loaded state only: a light test the owner declines to confirm
          // restores the card and clears the verification, leaving the wiring
          // locked and unchecked. This is the LAST step of the whole setup,
          // and it used to hand back a sentence pointing at a control inside a
          // collapsed "Advanced installation tools" section — the owner is
          // told where to go hunting instead of being given the thing to press.
          <>
            <p className="lww-flow-message">This wiring has not been checked on the real lights yet.</p>
            <button
              type="button"
              className="btn primary lww-cta"
              data-testid="unlock-and-check"
              title="Reopen the wiring and start the check that lights the real LEDs."
              data-tooltip="Reopen the wiring and start the check that lights the real LEDs."
              onClick={() => { unlockWiring(); setCheckFlowOpen(true); }}
            >Start LED check</button>
          </>
        ) : checkFlowOpen && colorCheckFirst ? (
          <>
            <p className="lww-flow-message">The wiring check is judged by colour, so the colour order has to be right first.</p>
            <StripColorOrderCheck
              autoStart
              cardHost={cardHost}
              controller={standaloneController}
              setController={setStandaloneController}
            />
            <button type="button" className="btn primary lww-cta" data-testid="color-check-done" title="Return to the wiring check with the corrected colour order." data-tooltip="Return to the wiring check with the corrected colour order." onClick={() => setColorCheckFirst(false)}>Back to the light check</button>
          </>
        ) : checkFlowOpen && !physicallyVerified ? (
          <WiringBenchTest
            wiring={wiring}
            compiled={compiledWiring}
            updateWiring={updateWiring}
            priorConfirmedLook={confirmedCardLook}
            cardHost={cardHost}
            strips={strips}
            adjustableRunIds={adjustableRunIds}
            onAdjustBoundary={adjustRunBoundary}
            adjustableOutputIds={adjustableOutputIds}
            onAdjustOutput={adjustOutputCount}
            onDefer={() => setCheckFlowOpen(false)}
            onColorProblem={() => setColorCheckFirst(true)}
          />
        ) : checkFlowOpen ? (
          <>
            <StripColorOrderCheck
              autoStart
              cardHost={cardHost}
              controller={standaloneController}
              setController={setStandaloneController}
            />
            <button type="button" className="btn btn-ghost" title="Leave the color check for now; the LED color order remains unconfirmed." data-tooltip="Leave the color check for now; the LED color order remains unconfirmed." onClick={() => setCheckFlowOpen(false)}>Do this later</button>
          </>
        ) : (
          <>
            {!connected && (
              <p className="lw-card-banner is-inline">
                This check lights the real LEDs — use <b>Connect Lightweaver</b> in the footer first.
              </p>
            )}
            <button type="button" className="btn primary lww-cta" data-testid="start-led-check" title="Begin or resume the guided check that lights the real LEDs to verify each run." data-tooltip="Begin or resume the guided check that lights the real LEDs to verify each run." onClick={() => setCheckFlowOpen(true)}>
              {physicallyVerified ? 'Finish the LED check' : 'Start LED check'}
            </button>
          </>
        )
      ) : (
        <>
          <p className="lww-install-ready" role="status">Checked ✓ — install it on the card.</p>
          <section className="lw-wire-finish">
            <CardPushControl
              connected={connected}
              board={cardTransportBoard}
              compiledWiring={compiledWiring}
              strips={strips}
              projectId={projectId}
              projectName={projectName}
              standaloneController={installController}
              disabled={!installGate.allowed}
            />
          </section>
        </>
      )}
    </WireHoverDescription>
  );
}
