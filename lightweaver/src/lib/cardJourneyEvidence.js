// The card evidence the setup journey is decided from, held once instead of
// once per screen.
//
// `deriveSetupJourney` is the single journey decision, but its callers used to
// supply it different facts. Card Home's Setup screen read `/api/status`, the
// wiring safety status and the card's project evidence itself and passed them
// in; the Patterns/Playlist chip and the shell's task router called the same
// function with none of them. Same card, same instant, two verdicts — Setup
// said "confirm the lights on your piece", the chip said the setup was
// finished and removed itself.
//
// So the evidence lives here, at module scope, in the style of cardLink.js: a
// small external store any screen can subscribe to, published by whoever read
// the card most recently. Screens still decide nothing about firmware
// authority — the card enforces every write. This is only about the four
// screens agreeing on what they were told.

import { getCardWiringStatus } from './cardWiringSafety.js';
import { readCardStatusEnvelope } from './cardPushClient.js';
import { isBenchProjectEvidence } from './benchConfig.js';
import { STUDIO_HARDWARE_OPERATION_EVENT } from './studioHardwareOperation.js';
import { sendCardBridgeRequest } from './cardBridge.js';
import { cardHostToUrl } from './cardConnection.js';

export const CARD_JOURNEY_EVIDENCE_EVENT = 'lw-card-journey-evidence';

const EMPTY = Object.freeze({
  cardId: '',
  bootId: '',
  host: '',
  // The Studio project that was open when this was read. `matchesOpenProject`
  // and `resolutionKind` are claims ABOUT that project, so they may not be
  // spent on a different one.
  projectId: '',
  wiringStatus: null,
  status: null,
  evidence: null,
  resolutionKind: 'unknown',
  matchesOpenProject: false,
  // The card's own zones report — false until a zones read has actually
  // said otherwise. Card Home's Setup screen re-publishes evidence on its
  // own richer read (see journeyEvidenceSnapshot below) without knowing
  // anything about zones, so this field is preserved-by-key rather than
  // defaulted, or every one of Setup's polls would flicker a real blackout
  // back to "off" a moment after refreshCardJourneyEvidence learned it.
  blackout: false,
  // Whether `blackout` above reflects an actual zones read, as opposed to the
  // field's own default. `read` is true the moment ANY fact has been read for
  // this card+boot (status, wiring, or blackout), so it cannot tell a caller
  // that only wants the blackout fact (useSetupJourney's `refresh: false`
  // path) whether zones specifically have ever been read — without this, that
  // caller would see `read: true` the instant Card Home's Setup screen
  // published its OWN status/wiring read and never attempt the zones read at
  // all.
  blackoutKnown: false,
  readAt: 0,
  read: false,
  // A hardware operation finished, so whatever we hold predates it. The
  // snapshot is KEPT (dropping it makes the journey flicker back to its
  // reduced verdict mid-operation) and simply re-read.
  stale: false,
});

export function emptyCardJourneyEvidence() {
  return EMPTY;
}

function text(value) {
  return String(value ?? '').trim();
}

// The card identity a snapshot must still name to be spendable. Read from the
// LINK, never from the payload the card returned: the question this answers is
// "is this still the boot we are talking to", and the link is what knows that.
export function journeyEvidenceKey(cardLink) {
  return {
    cardId: text(cardLink?.card?.id || cardLink?.readiness?.cardId),
    bootId: text(cardLink?.readiness?.bootId),
    host: text(cardLink?.host),
  };
}

// Build a snapshot without publishing it. Exported for tests and for callers
// that want to hand an assembled journey its evidence directly.
export function journeyEvidenceSnapshot({
  cardLink,
  cardId,
  bootId,
  host,
  projectId = '',
  wiringStatus = null,
  status = null,
  evidence = null,
  resolutionKind = 'unknown',
  matchesOpenProject = false,
  blackout,
  readAt = Date.now(),
} = {}) {
  const key = cardLink ? journeyEvidenceKey(cardLink) : { cardId: text(cardId), bootId: text(bootId), host: text(host) };
  // `blackout` is spent-then-preserved, not defaulted: a caller that never
  // reads zones (SetupScreen's own richer publish, below) does not know the
  // answer and must not assert "false" over whatever the last zones read
  // said — only for the SAME card and boot the current snapshot names.
  const sameKey = Boolean(key.cardId)
    && key.cardId.toLowerCase() === text(current.cardId).toLowerCase()
    && key.bootId === text(current.bootId);
  const resolvedBlackout = blackout === undefined
    ? (sameKey ? current.blackout === true : false)
    : blackout === true;
  // A caller that passes `blackout` explicitly just attempted (or reused) a
  // zones read; a caller that omits it (SetupScreen's own richer publish)
  // knows nothing new about zones and must not mark the fact known if it
  // never was.
  const resolvedBlackoutKnown = blackout !== undefined || (sameKey && current.blackoutKnown === true);
  return Object.freeze({
    ...key,
    projectId: text(projectId),
    wiringStatus: wiringStatus || null,
    status: status || null,
    evidence: evidence || null,
    resolutionKind: text(resolutionKind) || 'unknown',
    matchesOpenProject: matchesOpenProject === true,
    blackout: resolvedBlackout,
    blackoutKnown: resolvedBlackoutKnown,
    readAt: Number(readAt) || 0,
    read: true,
    stale: false,
  });
}

let current = EMPTY;
const listeners = new Set();

function notify() {
  for (const listener of [...listeners]) {
    try {
      listener(current);
    } catch {
      // A subscriber that throws must not stop the others being told.
    }
  }
  const target = typeof window !== 'undefined' ? window : null;
  if (!target?.dispatchEvent) return;
  const CustomEventConstructor = target.CustomEvent || globalThis.CustomEvent;
  if (!CustomEventConstructor) return;
  target.dispatchEvent(new CustomEventConstructor(CARD_JOURNEY_EVIDENCE_EVENT, { detail: current }));
}

export function subscribeCardJourneyEvidence(listener) {
  if (typeof listener !== 'function') return () => {};
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function getCardJourneyEvidence() {
  return current;
}

export function publishCardJourneyEvidence(input = {}) {
  current = journeyEvidenceSnapshot(input);
  notify();
  return current;
}

// The evidence predates something that changed the card. Keep it — it is still
// the best account anyone has until the re-read lands — but say so, so the
// hook knows to read again.
export function invalidateCardJourneyEvidence() {
  if (!current.read || current.stale) return current;
  current = Object.freeze({ ...current, stale: true });
  notify();
  return current;
}

export function resetCardJourneyEvidence() {
  current = EMPTY;
  notify();
  return current;
}

// A snapshot is spendable only against the card AND boot it was read from. A
// reply that lands after the card rebooted describes a card that no longer
// exists, and letting it advance the journey is how a finished light test
// re-appears on a card that has moved on.
export function freshJourneyEvidence(snapshot, cardLink) {
  if (!snapshot?.read) return EMPTY;
  const key = journeyEvidenceKey(cardLink);
  if (!key.cardId) return EMPTY;
  if (key.cardId.toLowerCase() !== text(snapshot.cardId).toLowerCase()) return EMPTY;
  if (key.bootId !== text(snapshot.bootId)) return EMPTY;
  return snapshot;
}

export function hasFreshCardJourneyEvidence(cardLink, snapshot = current) {
  const fresh = freshJourneyEvidence(snapshot, cardLink);
  return fresh.read === true && fresh.stale !== true;
}

// The blackout-specific twin of the above (F16). `read` goes true the moment
// ANY fact has been published for this card+boot, so a `refresh: false`
// caller that only wants the blackout fact needs its own, narrower question:
// has zones specifically ever been read, since the last invalidation.
export function hasFreshCardJourneyBlackout(cardLink, snapshot = current) {
  const fresh = freshJourneyEvidence(snapshot, cardLink);
  return fresh.blackoutKnown === true && fresh.stale !== true;
}

// ── Reading the card ───────────────────────────────────────────────────────
//
// One flight per (card, boot) at a time. Four screens can mount at once and
// every one of them wants the same two answers; the card is a small
// microcontroller on somebody's shelf, and the 45-resolutions-per-second
// handoff loop (THINKING.md, 2026-08-07) is what happens when that is not
// enforced.
const inFlight = new Map();

// A minimal, best-effort zones read, mirroring readCardStatusEnvelope's own
// transport handling (cardPushClient.js) rather than reusing
// readCardZonesFromCard (cardLiveControl.js) — that wrapper additionally runs
// an identity-mutation guard meant for the customer-control drawer's actual
// writes, which this passive fact-gathering read has no business paying for
// on every journey refresh. Failure here must never surface as an error: a
// screen asking "what does the journey look like" is not an operation the
// owner can be shown a failure about (see the allSettled call below).
async function readCardZonesEnvelope({ host, timeoutMs = 3000, transport } = {}) {
  if (transport === 'bridge') {
    return sendCardBridgeRequest('zones', {}, { host, timeoutMs, retryOnTimeout: false });
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const response = await fetch(`${cardHostToUrl(host)}/api/zones`, {
      method: 'GET', cache: 'no-store', signal: ctrl.signal,
    });
    if (!response?.ok) throw new Error('The card did not return a fresh zones envelope.');
    const result = await response.json().catch(() => null);
    if (!result || typeof result !== 'object' || Array.isArray(result)) {
      throw new Error('The card returned an invalid zones envelope.');
    }
    return result;
  } finally {
    clearTimeout(timer);
  }
}

// The defect this exists to end (F16): a card can hold the open project,
// answer "Connected", and report a ready runtime while every zone sits
// blacked out — nothing in the status envelope says so, only /api/zones does.
function blackoutFromZonesEnvelope(envelope) {
  const zones = Array.isArray(envelope?.zones) ? envelope.zones : [];
  return zones.length > 0 && zones[0]?.blackout === true;
}

// Deliberately NOT an `async function`: an async wrapper mints a fresh promise
// per call, so a second caller would get a different object back and the
// single-flight contract would be unobservable (and untestable) even though the
// card was only read once.
// F22c: `openProjectId` is the id of whatever project Studio has open AT THE
// MOMENT the caller asked for this refresh — passed by useSetupJourney, which
// always has it, never derived from the card's own status read. Card Home's
// SetupScreen remains the only place that resolves the harder question (does
// the card's project MATCH the open one, exactly or by saved copy); this is
// only "which project was open when this evidence was gathered", the same tag
// Card Home's own publish has always carried. Before this, a caller other
// than Card Home refreshing first for a card+boot published evidence with no
// project tag at all (`previous.projectId` was still the EMPTY default), so
// `setupJourneyBlackout`'s project-scoping check could never match — not a
// stale value, an ABSENT one, because nobody had ever supplied it yet.
export function refreshCardJourneyEvidence({ cardLink, reason = '', openProjectId } = {}) {
  const key = journeyEvidenceKey(cardLink);
  if (!key.cardId) return Promise.resolve(current);
  const flightKey = `${key.cardId}:${key.bootId}`;
  const running = inFlight.get(flightKey);
  if (running) return running;
  const flight = (async () => {
    const host = key.host;
    const transport = cardLink?.transport;
    const [statusResult, wiringResult, zonesResult] = await Promise.allSettled([
      readCardStatusEnvelope({ host, transport }),
      getCardWiringStatus({ host, transport }),
      readCardZonesEnvelope({ host, transport }),
    ]);
    const status = statusResult.status === 'fulfilled' ? statusResult.value : null;
    const wiringStatus = wiringResult.status === 'fulfilled' ? wiringResult.value : null;
    const zonesEnvelope = zonesResult.status === 'fulfilled' ? zonesResult.value : null;
    // The MATCH question (matchesOpenProject / resolutionKind) is still
    // preserved from whatever Card Home last resolved: this refresh cannot
    // redo that work. The project TAG itself is not — a caller that knows
    // which project was open when it asked is authoritative for that, and
    // must not have its answer discarded in favor of a fact nobody has
    // published yet.
    const previous = freshJourneyEvidence(current, cardLink);
    const bench = status ? isBenchProjectEvidence(status) : false;
    return publishCardJourneyEvidence({
      cardLink,
      projectId: openProjectId !== undefined ? openProjectId : previous.projectId,
      status,
      wiringStatus,
      evidence: previous.evidence,
      resolutionKind: bench ? 'bench' : previous.resolutionKind,
      matchesOpenProject: previous.matchesOpenProject,
      // A failed zones read (dropped request, older firmware) keeps whatever
      // the last successful read said, same posture as every other fact here
      // — never asserted false off a read that never happened.
      blackout: zonesEnvelope ? blackoutFromZonesEnvelope(zonesEnvelope) : previous.blackout,
      reason,
    });
  })()
    .catch(() => current)
    .finally(() => { inFlight.delete(flightKey); });
  inFlight.set(flightKey, flight);
  return flight;
}

// A single-fact refresh, for a caller that already does its OWN richer
// status+wiring read (Card Home's Setup screen, via `publishCardJourneyEvidence`
// directly — see lw-setup.jsx) and calls `useSetupJourney` with `refresh: false`
// to avoid a second full conversation with the card. That caller still has no
// way to learn whether the card's zones are blacked out (F16) — nothing else
// reads /api/zones for it — so this is the one additional lightweight read
// `useSetupJourney` runs for a `refresh: false` caller. Kept on its own flight
// map, separate from `inFlight` above: the two kinds of caller must never wait
// on each other's request.
const blackoutInFlight = new Map();

// F22c: same `openProjectId` tag as `refreshCardJourneyEvidence` above — a
// `refresh: false` caller's own richer publish (SetupScreen) usually lands
// the project tag first, but nothing enforces that ordering, and a caller
// that already knows which project is open must not leave the tag empty
// for however long that other publish takes to land.
export function refreshCardJourneyBlackout({ cardLink, reason = '', openProjectId } = {}) {
  const key = journeyEvidenceKey(cardLink);
  if (!key.cardId) return Promise.resolve(current);
  const flightKey = `${key.cardId}:${key.bootId}`;
  const running = blackoutInFlight.get(flightKey);
  if (running) return running;
  const flight = readCardZonesEnvelope({ host: key.host, transport: cardLink?.transport })
    .then(envelope => {
      const previous = freshJourneyEvidence(current, cardLink);
      return publishCardJourneyEvidence({
        cardLink,
        projectId: openProjectId !== undefined ? openProjectId : previous.projectId,
        status: previous.status,
        wiringStatus: previous.wiringStatus,
        evidence: previous.evidence,
        resolutionKind: previous.resolutionKind,
        matchesOpenProject: previous.matchesOpenProject,
        blackout: blackoutFromZonesEnvelope(envelope),
        reason,
      });
    })
    .catch(() => current)
    .finally(() => { blackoutInFlight.delete(flightKey); });
  blackoutInFlight.set(flightKey, flight);
  return flight;
}

// A hardware operation just ended — a wiring light test confirmed or restored,
// a project written, a recovery run. Everything read before it is behind.
// Installed lazily and guarded so Node test runs can import this module.
if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener(STUDIO_HARDWARE_OPERATION_EVENT, event => {
    if (event?.detail?.active !== false) return;
    invalidateCardJourneyEvidence();
  });
}
