import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { getCardLinkState, subscribeCardLink } from '../../lib/cardLink.js';
import { classifyCardReadiness } from '../../lib/cardReadiness.js';
import { useProject } from '../../state/ProjectContext.jsx';
import { normalizePatchBoard } from '../../lib/patchBoard.js';
import { CardPushControl } from '../layout/shared/CardPushControl.jsx';
import { WireHoverDescription } from '../layout/shared/WireHoverDescription.jsx';
import { WiringPreflight } from '../layout/wire/WiringPreflight.jsx';
import { evaluateCardInstallGate, readCardAccessLevel, readCardCommissioningVerification } from '../../lib/cardInstallGate.js';
import { STRIP_DISCOVERY_BLANK_MESSAGE, STRIP_DISCOVERY_LABEL, STRIP_DISCOVERY_ROUTE, needsStripDiscovery } from '../../lib/cardAction.js';
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
  // True while the Setup ladder above is already offering the page's primary
  // action. Card Home renders three surfaces that each believe they own the
  // next step; only one may wear the primary style at a time, and the ladder
  // wins because it is the only one that knows which phase the owner is in.
  yieldPrimary = false,
}) {
  // `cta` is the class every headline button in this component uses. Kept as
  // one binding so a future branch cannot forget the rule.
  const cta = yieldPrimary ? 'btn lww-cta' : 'btn primary lww-cta';
  const {
    wiring, updateWiring, compiledWiring, patchBoard,
    projectId, projectName, standaloneController, strips,
  } = useProject();
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

  const stripIds = new Set(strips.map(strip => strip.id));
  const mappedStripIds = new Set(wiring.runs.filter(run => run.type === 'strip' && stripIds.has(run.source.stripId)).map(run => run.source.stripId));
  const mappingCoversEveryStrip = mappedStripIds.size === stripIds.size
    && !wiring.runs.some(run => run.type === 'strip' && !stripIds.has(run.source.stripId));
  const mappingReady = compiledWiring.ok && mappingCoversEveryStrip;
  // Shared with the Playlist install gate so the two screens can never
  // disagree about what counts as a commissioned card (src/lib/cardInstallGate.js).
  const commissioning = readCardCommissioningVerification({ wiring, standaloneController });
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
    // Valid mapped wiring can enter CardPushControl's staged transaction even
    // before it has its final verification flags. The card keeps its working
    // setup until that control's real-light confirmation succeeds.
    wiringSendReady: compiledWiring.ok,
    commissioningVerified,
    // CardPushControl owns the card's staged wiring transaction and does not
    // commit it until the owner confirms the real lights there.
    stagedWiringConfirmation: true,
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
  const cardRoute = typeof window !== 'undefined'
    ? new URLSearchParams(window.location.hash.slice(1))
    : new URLSearchParams();
  const continueToPatterns = cardRoute.get('next') === 'patterns';
  const installTaskOpen = cardRoute.get('task') === 'install-project';

  // While Setup owns the next step, it also owns the only button. Its Open
  // Patterns action remounts this surface with an explicit install intent.
  if (yieldPrimary && !installTaskOpen) return null;

  return (
    <WireHoverDescription className="lww-flow" data-testid="commissioning-step" aria-label="Check and install on this card">
      {/* This surface used to begin with a bare button sitting directly under
          the ladder's last phase description, so "Start LED check" read as
          that phase's button and was not. It is its own thing and says so. */}
      <h2 className="lww-flow-heading">Check and install on this card</h2>
      {cardNeedsStripDiscovery ? (
        <>
          <h3 className="lww-flow-title">Find this card&rsquo;s strips first</h3>
          <p className="lww-flow-message" data-testid="wire-blank-card-message">{STRIP_DISCOVERY_BLANK_MESSAGE}</p>
          <button
            type="button"
            className={cta}
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
          <button type="button" className={cta} title="Open the Wire workspace to assign GPIOs and arrange the physical LED order." data-tooltip="Open the Wire workspace to assign GPIOs and arrange the physical LED order." onClick={onEditInWire}>Edit in Wire</button>
        </>
      ) : (
        <>
          <p className="lww-install-ready" role="status">Ready to install on the card.</p>
          <section className="lw-wire-finish">
            <CardPushControl
              connected={connected}
              yieldPrimary={yieldPrimary}
              board={cardTransportBoard}
              compiledWiring={compiledWiring}
              strips={strips}
              projectId={projectId}
              projectName={projectName}
              standaloneController={installController}
              disabled={!installGate.allowed}
              autoStart={continueToPatterns}
              onInstalled={continueToPatterns ? () => { window.location.hash = '#screen=pattern'; } : undefined}
            />
          </section>
        </>
      )}
    </WireHoverDescription>
  );
}
