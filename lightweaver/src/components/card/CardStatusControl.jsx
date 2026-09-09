import React from 'react';
import { cardFooterNeedsSave } from '../../lib/cardLifecycle.js';

// The footer's card status label IS the lifecycle diagnosis — one authority
// (deriveCardLifecycle) instead of a second raw-link ladder here. The
// `confirming` lifecycle state now supplies "Checking card" where the deleted
// fallback ladder used to derive it from the raw link.
//
// F32 (2026-09-09): "Lights are off on the card." used to float as its own
// notice at the bottom of Patterns, half hidden under the Connect dialog —
// Adrian: "find better place to say it". This chip is on every screen and is
// already the one authority for card state, so the fact moves here: while
// the shared journey (useSetupJourney) reports a blackout, the chip's label
// and its one click both change — it reads "Connected · Lights off" and
// clicking it runs Recover lights (forwarded in as `onRecoverLights`, the
// same request Card Home's banner and the Patterns toolbar button already
// send — src/lib/cardRecoverLights.js) instead of opening the Connection
// Center. Card Home's own in-flow banner is untouched; this is the one place
// Patterns says it now that the floating notice is gone.
export function CardStatusControl({
  link,
  lifecycle,
  onOpen,
  open = false,
  dialogId = 'card-connection-center',
  savePending = false,
  blackout = false,
  onRecoverLights,
  recoveryPending = false,
}) {
  const writesNow = lifecycle?.state === 'length-mismatch' || lifecycle?.state === 'content-mismatch';
  const status = savePending ? 'Saving to card' : lifecycle.label;
  const connected = status === 'Connected';
  const saveToCard = cardFooterNeedsSave(lifecycle) || writesNow || savePending;
  // Gated on `connected`: the shared journey only ever resolves a blackout
  // for the exact card Studio is paired with, and every other status (Save
  // to card, Needs attention, Connecting…) already says something more
  // pressing than the lights — the chip keeps its one status, never two.
  const lightsOff = connected && blackout === true && typeof onRecoverLights === 'function';
  const displayStatus = lightsOff
    ? (recoveryPending ? 'Sending…' : 'Connected · Lights off')
    : status;
  const accessibleName = lightsOff
    ? 'Lights are off on the card. Recover lights'
    : connected
      ? `${link.card?.name || 'Lightweaver'} · Connected`
      : saveToCard
        ? (savePending ? 'Saving to card' : 'Save to card')
        : `Connect Lightweaver · ${status}`;
  const statusClass = displayStatus.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const handleClick = lightsOff ? onRecoverLights : onOpen;

  return (
    <>
      <button
        type="button"
        className={`card-status-control is-${statusClass}${saveToCard ? ' needs-save' : ''}`}
        onClick={handleClick}
        disabled={savePending || (lightsOff && recoveryPending)}
        aria-label={accessibleName}
        aria-haspopup={(writesNow || lightsOff) ? undefined : 'dialog'}
        aria-expanded={(writesNow || lightsOff) ? undefined : open}
        aria-controls={(writesNow || lightsOff) ? undefined : dialogId}
        data-testid="card-link-status"
        data-lifecycle-state={lifecycle?.state || ''}
        data-needs-save={saveToCard ? 'true' : 'false'}
      >
        <span className="card-status-dot" aria-hidden="true" />
        <span className="card-status-copy">
          {!connected && !saveToCard ? (
            <span className="card-status-name">Lightweaver</span>
          ) : null}
          <span className="card-status-state">{displayStatus}</span>
        </span>
      </button>
      <span className="card-status-announcement" role="status" aria-live="polite" aria-atomic="true">
        {displayStatus}
      </span>
    </>
  );
}
