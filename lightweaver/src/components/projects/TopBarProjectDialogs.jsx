import { useRef, useState } from 'react';
import { useCloudLibrary } from '../../state/CloudLibraryContext.jsx';
import { AccountAccessPanel } from './AccountAccessPanel.jsx';
import { CloudLibraryDialogPortal } from './ProjectHistoryDialog.jsx';
import { useStudioSignInMethods } from './useStudioSignInMethods.js';

export function ProjectSaveDialog({ projectName, projectId, googleOutcome, skipDestination, onSaveBrowser, onSaveOnline, onClose }) {
  const library = useCloudLibrary();
  const [signingIn, setSigningIn] = useState(Boolean(googleOutcome));
  const [title, setTitle] = useState(projectName || 'Untitled project');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const dialogRef = useRef(null);
  const closeRef = useRef(null);
  const titleRef = useRef(null);
  const authenticated = library.session.status === 'authenticated';
  const onlineProject = library.activeRemoteProject;
  const checkingOnlineProject = authenticated && !onlineProject && library.restoringOnlineProject;
  const { methods, methodsError, retryMethods } = useStudioSignInMethods(signingIn && !authenticated);

  const save = async event => {
    event.preventDefault();
    const cleanTitle = title.trim();
    if (!cleanTitle || saving) return;
    setSaving(true);
    setError('');
    const result = await library.createProject(cleanTitle);
    setSaving(false);
    if (result.ok) onClose({ saved: true, project: result.project });
    else if (result.reason === 'stale-session') {
      setError('Your session changed. Sign in again to save online.');
      setSigningIn(true);
    } else {
      setError(result.error?.message || 'The project could not be saved online.');
    }
  };

  return (
    <CloudLibraryDialogPortal dialogRef={dialogRef} initialFocusRef={skipDestination ? titleRef : closeRef}
      onClose={() => { if (!saving) onClose(); }}>
      <div className="cloud-library-backdrop">
        <section ref={dialogRef} className="cloud-library-dialog topbar-project-dialog"
          role="dialog" aria-modal="true" aria-labelledby="topbar-save-title">
          <div className="cloud-dialog-heading">
            <h2 id="topbar-save-title">{skipDestination ? 'Save project online' : 'Save project'}</h2>
            <button ref={closeRef} type="button" className="btn ghost-sm topbar-dialog-close"
              aria-label="Close Save project" disabled={saving} onClick={() => onClose()}>×</button>
          </div>
          {error && <p className="cloud-library-notice" role="alert">{error}</p>}
          {authenticated && !onlineProject && !checkingOnlineProject && library.session.role !== 'customer' ? (
            <form onSubmit={save}>
              <label className="topbar-project-title">
                <span>Project title</span>
                <input ref={titleRef} className="pm-input" value={title} disabled={saving} onChange={event => setTitle(event.target.value)} />
              </label>
              <div className="set-actions">
                {!skipDestination && <button type="button" className="btn" disabled={saving} onClick={onSaveBrowser}>Save in browser</button>}
                <button type="submit" className="btn primary" disabled={saving || !title.trim()}>{saving ? 'Saving…' : 'Save online'}</button>
              </div>
            </form>
          ) : (
            <>
              {!authenticated && signingIn && (
                <AccountAccessPanel {...{ googleOutcome, methods, methodsError, retryMethods }} saveProjectId={projectId} />
              )}
              {checkingOnlineProject && <p role="status">Checking the existing online project…</p>}
              {authenticated && !onlineProject && !checkingOnlineProject && <p>Open an assigned project to save online.</p>}
              <div className="set-actions">
                <button type="button" className="btn" disabled={saving} onClick={onSaveBrowser}>Save in browser</button>
                {authenticated && onlineProject && <button type="button" className="btn primary" onClick={onSaveOnline}>Save online</button>}
                {!authenticated && !signingIn && <button type="button" className="btn primary" onClick={() => setSigningIn(true)}>Save online</button>}
              </div>
            </>
          )}
        </section>
      </div>
    </CloudLibraryDialogPortal>
  );
}
