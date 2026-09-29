import React, { useState } from 'react';
import { buildClientPlayerLink } from '../../client/clientPairing.js';

export function ClientPlayerLink({ host, cardId, name, disabled = false }) {
  const [message, setMessage] = useState('');
  let url;
  try { url = buildClientPlayerLink({ host, cardId, name }); } catch { return null; }
  const share = async () => {
    setMessage('');
    try {
      if (navigator.share) {
        await navigator.share({ title: name || 'Lightweaver player', text: 'Your lights, patterns and playlist.', url });
        setMessage('Player link shared.');
      } else {
        await navigator.clipboard.writeText(url);
        setMessage('Player link copied. Open it on your phone on the same Wi-Fi as your lights.');
      }
    } catch (cause) {
      if (cause?.name !== 'AbortError') setMessage('Open the phone player, then copy its address to share it.');
    }
  };
  return <section aria-label="Phone player"><h3>Phone player</h3><p className="cl-hint">A ready-to-use player for these lights.</p><div className="card-control-actions"><a className="btn" href={disabled ? undefined : url} aria-disabled={disabled} tabIndex={disabled ? -1 : undefined} target="_blank" rel="noopener noreferrer">Open phone player</a><button type="button" className="btn" disabled={disabled} onClick={share}>Share player link</button></div>{message && <p role="status">{message}</p>}</section>;
}
