import React, { useCallback, useEffect, useRef, useState } from 'react';
import { stopCardLights } from '../../lib/cardLiveControl.js';
import { recoverCardLightsVerified } from '../../lib/cardRecoverLights.js';
import { cardConnectionOptionsFor } from '../../lib/cardConnection.js';
import { StripDiscoveryPanel } from './StripDiscoveryPanel.jsx';

const SAFE_LIFECYCLE = Object.freeze({ phase: 'idle', busy: false, lighting: false });

function focusableElements(root) {
  return [...(root?.querySelectorAll?.(
    'button:not([disabled]), select:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
  ) || [])].filter(element => !element.closest('[hidden]')
    && element.getAttribute('aria-hidden') !== 'true' && element.getClientRects().length > 0);
}

export function CardSetupOverlay({
  cardHost = '',
  cardLink = null,
  onDismiss,
  onDisconnect,
  onComplete,
  onMinimizedChange,
  go,
}) {
  const dialogRef = useRef(null);
  const restoreButtonRef = useRef(null);
  const restoreFocusRef = useRef(null);
  const [lifecycle, setLifecycle] = useState(SAFE_LIFECYCLE);
  const [minimized, setMinimized] = useState(false);
  const [releaseState, setReleaseState] = useState('idle');
  const [releaseFailure, setReleaseFailure] = useState('');
  const [lightAction, setLightAction] = useState({ status: 'idle', message: '' });
  const protectedWork = lifecycle.busy
    || lifecycle.phase === 'bench-install'
    || lifecycle.phase === 'record'
    || lifecycle.lighting
    || lifecycle.probeActive
    || lifecycle.auditionActive;
  const protectedWorkRef = useRef(protectedWork);
  protectedWorkRef.current = protectedWork;

  const dismiss = useCallback(() => {
    if (protectedWorkRef.current) return;
    // Dismissal is only a UI boundary. The passive local card page remains the
    // live bridge for Layout, install, Patterns, and later card commands.
    onDismiss?.();
  }, [onDismiss]);

  const minimize = useCallback(() => {
    setMinimized(true);
    onMinimizedChange?.(true);
  }, [onMinimizedChange]);

  const restore = useCallback(() => {
    setMinimized(false);
    onMinimizedChange?.(false);
  }, [onMinimizedChange]);

  useEffect(() => {
    restoreFocusRef.current = document.activeElement;
    const timer = window.setTimeout(() => {
      const focusables = focusableElements(dialogRef.current);
      (focusables[0] || dialogRef.current)?.focus?.();
    }, 0);
    return () => {
      window.clearTimeout(timer);
      restoreFocusRef.current?.focus?.();
    };
  }, []);

  useEffect(() => {
    if (minimized) restoreButtonRef.current?.focus();
    else (focusableElements(dialogRef.current)[0] || dialogRef.current)?.focus?.();
  }, [minimized]);

  useEffect(() => {
    if (minimized && !protectedWork) return undefined;
    const onKeyDown = event => {
      if (event.key === 'Escape') {
        event.preventDefault();
        if (minimized) restore();
        else dismiss();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusables = focusableElements(dialogRef.current);
      if (!focusables.length) {
        event.preventDefault();
        dialogRef.current?.focus?.();
        return;
      }
      const first = focusables[0];
      const last = focusables.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [dismiss, minimized, protectedWork, restore]);

  const stopLights = async () => {
    if (lightAction.status === 'stopping' || !cardHost) return;
    setLightAction({ status: 'stopping', message: 'Stopping the lights…' });
    try {
      await stopCardLights({ ...cardConnectionOptionsFor(cardLink, cardHost), timeoutMs: 3200 });
      setLightAction({ status: 'stopped', message: 'Lights stopped and blackout confirmed by the card.' });
    } catch (error) {
      setLightAction({
        status: 'failed',
        message: error?.message || 'The card did not confirm that the lights stopped. Recover the last working setup.',
      });
    }
  };

  const recoverLights = async () => {
    if (lightAction.status === 'recovering' || !cardHost) return;
    setLightAction({ status: 'recovering', message: 'Recovering the last working setup…' });
    try {
      await recoverCardLightsVerified({}, { ...cardConnectionOptionsFor(cardLink, cardHost), timeoutMs: 3200 });
      setLightAction({ status: 'recovered', message: 'The card restored its last working light setup.' });
    } catch (error) {
      setLightAction({ status: 'failed', message: error?.message || 'The card could not recover the lights.' });
    }
  };

  const disconnect = async () => {
    if (protectedWork || releaseState === 'releasing') return;
    setReleaseState('releasing');
    setReleaseFailure('');
    try {
      await onDisconnect?.();
      setReleaseState('released');
    } catch (error) {
      setReleaseFailure(error?.message || 'Studio could not disconnect this card. Try again.');
      setReleaseState('idle');
    }
  };

  return (
    <div
      className={`card-setup-backdrop${minimized ? ' is-minimized' : ''}${minimized && protectedWork ? ' is-protected' : ''}`}
      onPointerDown={event => { if (!minimized && event.target === event.currentTarget) dismiss(); }}
    >
      <section
        ref={dialogRef}
        className={`card-setup-overlay${minimized ? ' is-minimized' : ''}`}
        role={minimized && !protectedWork ? 'region' : 'dialog'}
        aria-modal={minimized && !protectedWork ? undefined : 'true'}
        aria-label={minimized ? 'Light check dock' : undefined}
        aria-labelledby={minimized ? undefined : 'card-setup-title'}
        aria-describedby={minimized ? undefined : 'card-setup-description'}
        data-testid="card-setup-overlay"
        tabIndex={-1}
      >
        {minimized && (
          <div className="card-setup-dock" data-testid="card-setup-dock">
            <div className="card-setup-dock-copy">
              <strong>Count your lights</strong>
              <span>{protectedWork ? 'Light check active — restore to continue' : 'Ready when you are'}</span>
            </div>
            <div className="card-setup-dock-actions">
              <button ref={restoreButtonRef} type="button" className="btn primary" data-testid="card-setup-restore" onClick={restore}>
                Restore
              </button>
              <button
                type="button"
                className="btn"
                data-testid="card-setup-stop-lights"
                disabled={!cardHost || lightAction.status === 'stopping' || lightAction.status === 'recovering'}
                onClick={() => void stopLights()}
              >
                {lightAction.status === 'stopping' ? 'Stopping…' : 'Stop lights'}
              </button>
            </div>
            {lightAction.status === 'failed' && (
              <button type="button" className="btn" data-testid="card-setup-recover-lights" onClick={() => void recoverLights()}>
                Recover lights
              </button>
            )}
            {lightAction.message && <span className="card-setup-dock-status" role="status">{lightAction.message}</span>}
          </div>
        )}
        <header className="card-setup-overlay-head" hidden={minimized}>
          <div>
            <h2 id="card-setup-title">Count your lights</h2>
            <p id="card-setup-description">Find the strip. Read the markers. Save the count.</p>
          </div>
          <div className="card-setup-overlay-head-actions">
            <button type="button" className="btn btn-ghost" data-testid="card-setup-minimize" onClick={minimize}>Minimize</button>
            <button
              type="button"
              className="card-setup-overlay-close"
              aria-label={protectedWork ? 'Light check is active' : 'Close light check'}
              data-testid="card-setup-close"
              disabled={protectedWork}
              onClick={dismiss}
            >
              <svg aria-hidden="true" viewBox="0 0 20 20" width="16" height="16">
                <path d="M5 5l10 10M15 5L5 15" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </header>

        <div className="card-setup-overlay-body" hidden={minimized}>
          <StripDiscoveryPanel
            cardHost={cardHost}
            cardLink={cardLink}
            go={go}
            embedded
            onLifecycleChange={setLifecycle}
            onComplete={onComplete}
          />
        </div>

        <footer className="card-setup-overlay-foot" hidden={minimized}>
          <div className="card-setup-overlay-safety">
            <button
              type="button"
              className="btn"
              data-testid={minimized ? undefined : 'card-setup-stop-lights'}
              disabled={!cardHost || lightAction.status === 'stopping' || lightAction.status === 'recovering'}
              onClick={() => void stopLights()}
            >
              {lightAction.status === 'stopping' ? 'Stopping…' : 'Stop lights'}
            </button>
            {lightAction.status === 'failed' && (
              <button type="button" className="btn" data-testid={minimized ? undefined : 'card-setup-recover-lights'} onClick={() => void recoverLights()}>
                Recover lights
              </button>
            )}
          </div>
          <p>
            {protectedWork
              ? 'Keep the card connected.'
              : 'Your card stays connected when you close this.'}
          </p>
          <button
            type="button"
            className="btn btn-ghost"
            data-testid="card-setup-disconnect"
            disabled={protectedWork || releaseState === 'releasing'}
            onClick={() => void disconnect()}
          >
            {releaseState === 'releasing' ? 'Disconnecting…' : 'Disconnect card'}
          </button>
          {lightAction.message && <p className="card-setup-light-status" role="status">{lightAction.message}</p>}
          {releaseFailure && <p className="card-setup-release-error" role="alert">{releaseFailure}</p>}
        </footer>
      </section>
    </div>
  );
}

export default CardSetupOverlay;
