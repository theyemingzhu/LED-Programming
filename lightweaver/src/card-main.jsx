import { OLD_CARD_TOUCH_SENTENCE, cardNeedsTouch } from './lib/cardNeedsTouch.js';
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import './v3/v3-styles.css';
import './v3/v3-screens.css';
import './styles/v3-layout-extra.css';
import './styles/v3-layout-modes.css';
import './styles/v3-settings-extra.css';
import './styles/v3-patterns-extra.css';
import './styles/v3-playlist-extra.css';
import App from './v3/app.jsx';
import { authorizeCardLocalProject, bootstrapCardLocalAuthority } from './lib/cardLocalBootstrap.js';
import { detectRuntimeMode, installCardSecureToolHandback } from './lib/runtimeMode.js';

const runtimeMode = detectRuntimeMode();
if (runtimeMode.kind !== 'card-local') {
  throw new Error('The card Studio entry may only run from a local card origin.');
}
globalThis.__LW_RUNTIME_MODE__ = runtimeMode;
installCardSecureToolHandback();

function CardProjectGate({ authority }) {
  const [opened, setOpened] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (opened) {
    return <App projectRepository={opened.repository} initialProjectEnvelope={opened.envelope} />;
  }
  const openProject = async () => {
    setBusy(true);
    setError('');
    try {
      setOpened(await authorizeCardLocalProject({ authority }));
    } catch (cause) {
      setError(cause?.status === 403
        ? (cardNeedsTouch(authority) ? OLD_CARD_TOUCH_SENTENCE : 'The card did not grant editing permission. Reload this page and try again.')
        : (cause?.message || 'The editable project could not be opened from this card.'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="screen screen-recovery" role="main">
      <section className="screen-recovery-card">
        <span className="screen-recovery-kicker">Lightweaver card Studio</span>
        <h1>Open the editable project on this card</h1>
        <p>{cardNeedsTouch(authority)
          ? 'Touch a physical control on the card, then continue. This creates a short editing permission bound to this exact card, boot, network, and project head.'
          : 'Continue to get a short editing permission for this exact card.'}</p>
        <button type="button" className="btn primary" onClick={openProject} disabled={busy}>
          {busy ? 'Opening card project…' : 'Open card project'}
        </button>
        {error && <p role="alert">{error}</p>}
      </section>
    </main>
  );
}

async function startCardStudio() {
  const authority = await bootstrapCardLocalAuthority();
  globalThis.__LW_CARD_AUTHORITY__ = authority;
  createRoot(document.getElementById('root')).render(<CardProjectGate authority={authority} />);
}

void startCardStudio().catch(() => globalThis.location?.replace?.('/'));
