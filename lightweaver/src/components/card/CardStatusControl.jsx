import React from 'react';
import { cardFooterNeedsSave } from '../../lib/cardLifecycle.js';

// The footer's card status label IS the lifecycle diagnosis — one authority
// (deriveCardLifecycle) instead of a second raw-link ladder here. The
// `confirming` lifecycle state now supplies "Checking card" where the deleted
// fallback ladder used to derive it from the raw link.
export function CardStatusControl({ link, lifecycle, onOpen, open = false, dialogId = 'card-connection-center', savePending = false }) {
  const writesNow = lifecycle?.state === 'length-mismatch' || lifecycle?.state === 'content-mismatch';
  const status = savePending ? 'Saving to card' : lifecycle.label;
  const connected = status === 'Connected';
  const saveToCard = cardFooterNeedsSave(lifecycle) || writesNow || savePending;
  const accessibleName = connected
    ? `${link.card?.name || 'Lightweaver'} · Connected`
    : saveToCard
      ? (savePending ? 'Saving to card' : 'Save to card')
      : `Connect Lightweaver · ${status}`;
  const statusClass = status.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  return (
    <>
      <button
        type="button"
        className={`card-status-control is-${statusClass}${saveToCard ? ' needs-save' : ''}`}
        onClick={onOpen}
        disabled={savePending}
        aria-label={accessibleName}
        aria-haspopup={writesNow ? undefined : 'dialog'}
        aria-expanded={writesNow ? undefined : open}
        aria-controls={writesNow ? undefined : dialogId}
        data-testid="card-link-status"
        data-lifecycle-state={lifecycle?.state || ''}
        data-needs-save={saveToCard ? 'true' : 'false'}
      >
        <span className="card-status-dot" aria-hidden="true" />
        <span className="card-status-copy">
          {!connected && !saveToCard ? (
            <span className="card-status-name">Lightweaver</span>
          ) : null}
          <span className="card-status-state">{status}</span>
        </span>
      </button>
      <span className="card-status-announcement" role="status" aria-live="polite" aria-atomic="true">
        {status}
      </span>
    </>
  );
}
