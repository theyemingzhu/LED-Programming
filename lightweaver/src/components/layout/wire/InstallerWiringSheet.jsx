import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { boardTitle } from '../../../lib/boardProfiles.js';
import { confirmedBoardProfile } from '../../../lib/boardLedPins.js';
import { readPersistedCardIdentity } from '../../../lib/cardIdentity.js';
import { formatGpio } from '../../../lib/cardPinout.js';
import { deriveInstallerWiringSheet } from '../../../lib/installerWiringSheet.js';
import { useProject } from '../../../state/ProjectContext.jsx';
import { useWiringCard } from '../modes/useWiringCard.js';
import './installer-wiring-sheet.css';

export function InstallerWiringSheetButton({ cardId: preferredCardId, className = 'btn', openOnMount = false }) {
  const { projectId, projectName, wiring, compiledWiring, strips, sectionFamilies } = useProject();
  const { cardId: liveCardId } = useWiringCard();
  const dialogRef = useRef(null);
  const triggerRef = useRef(null);
  const didAutoOpen = useRef(false);
  const [snapshot, setSnapshot] = useState(null);
  const available = compiledWiring?.ok && compiledWiring.runs.some(run => run.type === 'strip');

  const openSheet = useCallback(() => {
    const cardId = preferredCardId || liveCardId || readPersistedCardIdentity()?.id;
    const profile = confirmedBoardProfile(cardId);
    const rows = deriveInstallerWiringSheet({ cardId, projectId, wiring, compiled: compiledWiring, strips, sectionFamilies, profile });
    setSnapshot({ projectName, board: profile ? boardTitle(profile) : '', revisionKnown: Boolean(profile?.pcbRevision), rows });
  }, [compiledWiring, liveCardId, preferredCardId, projectId, projectName, sectionFamilies, strips, wiring]);

  useEffect(() => {
    if (openOnMount && available && !didAutoOpen.current) {
      didAutoOpen.current = true;
      openSheet();
    }
  }, [openOnMount, available, openSheet]);

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (snapshot && dialog && !dialog.open) dialog.showModal();
  }, [snapshot]);

  if (!available) return null;

  return <>
    <button className={className} type="button" ref={triggerRef} onClick={openSheet} aria-haspopup="dialog" data-testid="installer-wiring-sheet-trigger">Wiring sheet</button>
    {createPortal(
      <dialog className="lw-installer-sheet" ref={dialogRef} aria-label="Wiring sheet" onClose={() => triggerRef.current?.focus({ preventScroll: true })}>
        {snapshot && <>
          <header className="lw-installer-sheet-header">
            <div><h2>Wiring sheet</h2><p>{snapshot.projectName}</p></div>
            <button className="btn" type="button" onClick={() => dialogRef.current.close()}>Close</button>
          </header>
          <div className="lw-installer-sheet-body">
            <p className="lw-installer-sheet-board">{snapshot.board || 'Choose the board in Connect to see its connector positions.'}</p>
            {snapshot.board && !snapshot.revisionKnown && <p className="lw-installer-sheet-board">Printed revision unknown.</p>}
            <ul className="lw-installer-sheet-rows" role="list">
              {snapshot.rows.map(row => (
                <li key={row.id}>
                  <div>
                    <strong>{row.name}</strong>
                    {row.segmented && <span className="lw-installer-sheet-part">Strip LEDs {row.start}–{row.end}</span>}
                    <span>{row.pins.length > 0 ? `${row.pins.join(' / ')} · ` : ''}{formatGpio(row.pin)}</span>
                    {snapshot.board && !row.pins.length && <span className="lw-installer-sheet-part">Connector position unknown</span>}
                  </div>
                  <div>
                    <strong>{row.count.toLocaleString()} LEDs</strong>
                    <span className={row.checked ? 'lw-installer-sheet-checked' : ''}>{row.checked ? 'Checked in person' : 'Awaiting light test'}</span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <footer className="lw-installer-sheet-footer">
            <button className="btn primary" type="button" onClick={() => window.print()}>Print or save as PDF</button>
          </footer>
        </>}
      </dialog>, document.body,
    )}
  </>;
}
