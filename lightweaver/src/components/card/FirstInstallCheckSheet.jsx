import { useSyncExternalStore } from 'react';
import { getCardLinkState, subscribeCardLink } from '../../lib/cardLink.js';
import { getFirstInstallState, resetFirstInstallState, subscribeFirstInstallState } from '../../lib/firstInstallState.js';
import { FirstInstallLightCheck } from './FirstInstallLightCheck.jsx';

// The light check after a blank card's first whole-project save (Find my
// strips, way in 1), as one app-level sheet. The save can start on Card Home
// or in Layout, and Card Home rebuilds itself the moment the card holds a
// project, so the check cannot live in the panel that pressed Save: it would
// vanish with it. Mounted once beside the light-check overlay, it is the one
// owner of the check whatever screen is showing.
export function FirstInstallCheckSheet({ cardHost = '' }) {
  const phase = useSyncExternalStore(subscribeFirstInstallState, getFirstInstallState, getFirstInstallState).phase;
  const cardLink = useSyncExternalStore(subscribeCardLink, getCardLinkState, getCardLinkState);
  if (phase !== 'checking') return null;
  const finish = next => {
    // The card lit the check, so it is no longer blank: nothing to hold.
    resetFirstInstallState();
    window.location.hash = next;
  };
  return (
    <div className="card-setup-backdrop">
      <section className="card-setup-overlay" role="dialog" aria-modal="true" aria-labelledby="first-install-check-title" data-testid="first-install-check-sheet">
        <header className="card-setup-overlay-head">
          <div>
            <h2 id="first-install-check-title">Check the lights</h2>
          </div>
        </header>
        <div className="card-setup-overlay-body">
          <FirstInstallLightCheck
            host={cardHost || cardLink.host}
            transport={cardLink.transport}
            bootId={cardLink.readiness?.bootId || ''}
            onDone={({ colourFixed }) => finish(colourFixed ? '#screen=card&section=setup' : '#screen=pattern')}
            onOpenLayout={() => finish('#screen=layout&mode=draw')}
          />
        </div>
      </section>
    </div>
  );
}

export default FirstInstallCheckSheet;
