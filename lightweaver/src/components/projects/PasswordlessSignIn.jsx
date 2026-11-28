import { useEffect, useRef, useState } from 'react';
import { useProject } from '../../state/ProjectContext.jsx';
import {
  beginStudioGoogleSignIn, requestStudioEmailCode, verifyStudioEmailCode,
} from '../../lib/studioPasswordlessClient.js';

export function PasswordlessSignIn({ methods, googleOutcome, onSignedIn, saveProjectId }) {
  const { flushProjectAutosave } = useProject();
  const [email, setEmail] = useState('');
  const [recipient, setRecipient] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(googleOutcome === 'error'
    ? 'Google sign-in didn’t complete. Try again or use an email code.' : '');
  const codeField = useRef(null);

  useEffect(() => {
    if (recipient) codeField.current?.focus();
  }, [recipient]);

  function startGoogle() {
    if (!beginStudioGoogleSignIn(flushProjectAutosave, saveProjectId)) {
      setNotice('Download a backup of your project before signing in. This browser couldn’t save your draft.');
    }
  }

  async function sendCode(address) {
    setBusy(true);
    setNotice('');
    try {
      const result = await requestStudioEmailCode(address);
      if (result.ok) {
        setRecipient(address);
        setCode('');
        codeField.current?.focus();
      } else {
        setNotice(result.reason === 'rate-limited'
          ? 'Wait a moment before requesting another code.'
          : 'Couldn’t send a sign-in code. Try again.');
      }
    } catch {
      setNotice('Couldn’t send a sign-in code. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  async function submit(event) {
    event.preventDefault();
    if (!recipient) {
      await sendCode(email.trim());
      return;
    }
    setBusy(true);
    setNotice('');
    try {
      const result = await verifyStudioEmailCode(recipient, code.trim());
      if (result.ok) await onSignedIn();
      else if (result.reason === 'invalid-code') setNotice('That code didn’t work. Try again or request a new code.');
      else if (result.reason === 'rate-limited') setNotice('Too many attempts. Wait a moment and request a new code.');
      else setNotice('Couldn’t verify the code. Try again.');
    } catch {
      setNotice('Couldn’t verify the code. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  function changeEmail() {
    setRecipient('');
    setCode('');
    setNotice('');
  }

  return (
    <section className="cloud-library-guidance studio-sign-in" aria-labelledby="studio-sign-in-title">
      <strong id="studio-sign-in-title">Sign in</strong>
      {methods.google && !recipient && (
        <button type="button" className="btn" disabled={busy} onClick={startGoogle}>Continue with Google</button>
      )}
      {methods.email && (
        <form onSubmit={submit}>
          {recipient ? (
            <>
              <p role="status">If <strong>{recipient}</strong> has access, a code will arrive by email.</p>
              <label htmlFor="studio-sign-in-code">Sign-in code</label>
              <div className="studio-sign-in-row">
                <input id="studio-sign-in-code" ref={codeField} className="pm-input" inputMode="numeric"
                  autoComplete="one-time-code" required pattern="[0-9]{6}" maxLength={6} disabled={busy}
                  value={code} onChange={event => setCode(event.target.value)} />
                <button type="submit" className="btn primary" disabled={busy}>Verify code</button>
              </div>
              <div className="studio-sign-in-actions">
                <button type="button" className="btn ghost-sm" onClick={changeEmail} disabled={busy}>Change email</button>
                <button type="button" className="btn ghost-sm" onClick={() => sendCode(recipient)} disabled={busy}>Send a new code</button>
              </div>
            </>
          ) : (
            <>
              <label htmlFor="studio-sign-in-email">Email address</label>
              <div className="studio-sign-in-row">
                <input id="studio-sign-in-email" className="pm-input" type="email" autoComplete="email"
                  required maxLength={254} disabled={busy} value={email} onChange={event => setEmail(event.target.value)} />
                <button type="submit" className="btn primary" disabled={busy}>Email me a code</button>
              </div>
            </>
          )}
        </form>
      )}
      {notice && <p className="cloud-account-error" role="alert">{notice}</p>}
    </section>
  );
}
