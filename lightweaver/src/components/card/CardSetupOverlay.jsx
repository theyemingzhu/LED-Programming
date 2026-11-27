import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { stopCardLights } from '../../lib/cardLiveControl.js';
import { recoverCardLightsVerified } from '../../lib/cardRecoverLights.js';
import { cardConnectionOptionsFor } from '../../lib/cardConnection.js';
import { StripDiscoveryPanel } from './StripDiscoveryPanel.jsx';
import { DiscoveryNotices } from '../NoticeLayer.jsx';

const SAFE_LIFECYCLE = Object.freeze({ phase: 'idle', busy: false, lighting: false });

function focusableElements(root) {
  return [...(root?.querySelectorAll?.(
    'button, select, input, textarea, summary, a[href], [tabindex]',
  ) || [])].filter(element => element.tabIndex >= 0 && !element.matches(':disabled')
    && !element.closest('[hidden], [inert], [aria-hidden="true"]') && element.getClientRects().length > 0);
}

function focusLightCheck(root) {
  const action = root?.querySelector('[data-light-check-action]:not(:disabled)');
  const target = action || root?.querySelector('[data-light-check-heading]') || root?.querySelector('#card-setup-title') || root;
  target?.focus();
}

function canRestoreFocus(element) {
  return element?.isConnected && !element.matches(':disabled, [aria-disabled="true"]')
    && !element.closest('[hidden], [inert], [aria-hidden="true"]') && element.getClientRects().length > 0;
}

export function CardSetupOverlay({
  cardHost = '',
  cardLink = null,
  discoveryHash = '',
  takeOpener,
  onDismiss,
  onDisconnect,
  onComplete,
  onSaveToCard,
  onReplacementSettled,
  onMinimizedChange,
  go,
}) {
  const route = new URLSearchParams(discoveryHash.slice(1));
  const installerSetup = route.get('installer') === '1';
  const pinParam = route.get('pin') || '';
  const replacementParam = route.get('replace') || '';
  const replacementPin = /^\d{1,2}$/.test(replacementParam) ? Number(replacementParam) : null;
  const pin = /^\d{1,2}$/.test(pinParam) ? Number(pinParam) : null;
  const replacementTarget = replacementPin !== null ? pin : null;
  const preferredPin = installerSetup && replacementPin === null ? pin : null;
  const dialogRef = useRef(null);
  const entryHash = useRef(discoveryHash);
  const restoreButtonRef = useRef(null);
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

  useLayoutEffect(() => {
    const opener = takeOpener?.(entryHash.current);
    const origin = opener?.origin || document.activeElement;
    const context = opener?.context || origin?.closest('[data-testid="fact-outputs"], main');
    const contextId = context?.getAttribute('data-testid');
    const openerId = origin?.getAttribute('data-testid');
    const openerHref = origin?.getAttribute('href');
    const openerSelector = openerId ? `[data-testid="${CSS.escape(openerId)}"]`
      : openerHref ? `a[href="${CSS.escape(openerHref)}"]` : null;
    return () => {
      requestAnimationFrame(() => {
        if (document.activeElement !== document.body) return;
        if (origin !== document.body && canRestoreFocus(origin)) {
          origin.focus();
          return;
        }
        // Card Home can remount its outputs when the link becomes ready.
        const currentContext = context?.isConnected ? context
          : document.querySelector(contextId ? `[data-testid="${CSS.escape(contextId)}"]` : 'main');
        const reopened = openerSelector && currentContext?.querySelector(openerSelector);
        const fallback = currentContext?.querySelector('a[href="#screen=discovery"]');
        const target = [reopened, fallback].find(canRestoreFocus);
        if (target) target.focus();
        else {
          const heading = document.querySelector('main h1');
          heading?.setAttribute('tabindex', '-1');
          heading?.focus();
        }
      });
    };
  }, [takeOpener]);

  useEffect(() => {
    if (minimized) restoreButtonRef.current?.focus();
    else if (!dialogRef.current?.contains(document.activeElement)) focusLightCheck(dialogRef.current);
  }, [minimized]);

  useEffect(() => {
    const onKeyDown = event => {
      const dialog = dialogRef.current;
      if (event.defaultPrevented || (minimized && !protectedWork && !dialog?.contains(document.activeElement))) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        if (minimized) restore();
        else if (!protectedWork) {
          const cancel = dialog?.querySelector('[data-light-check-cancel]');
          if (cancel) cancel.click();
          else dismiss();
        } else if (!dialog?.contains(document.activeElement)) focusLightCheck(dialog);
        return;
      }
      if (event.key !== 'Tab' || (minimized && !protectedWork)) return;
      const focusables = focusableElements(dialog);
      const active = document.activeElement;
      const direction = event.shiftKey ? -1 : 1;
      const index = focusables.indexOf(active);
      if (index >= 0 && focusables[index + direction]) return;
      if (index < 0 && dialog?.contains(active)) {
        const mask = event.shiftKey ? Node.DOCUMENT_POSITION_PRECEDING : Node.DOCUMENT_POSITION_FOLLOWING;
        if (focusables.some(element => active.compareDocumentPosition(element) & mask)) return;
      }
      event.preventDefault();
      ((event.shiftKey ? focusables.at(-1) : focusables[0]) || dialog)?.focus();
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
            <DiscoveryNotices />
          </div>
        )}
        <header className="card-setup-overlay-head" hidden={minimized}>
          <div>
            <h2 id="card-setup-title" tabIndex={-1}>Find my strips</h2>
            <p id="card-setup-description" className="strip-discovery-visually-hidden">Lights stay dim and capped while Studio finds and counts them.</p>
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
            installerSetup={installerSetup}
            preferredPin={preferredPin}
            replacementPin={replacementPin}
            replacementTarget={replacementTarget}
            go={go}
            embedded
            minimized={minimized}
            onLifecycleChange={setLifecycle}
            onComplete={onComplete}
            onSaveToCard={onSaveToCard}
            onReplacementSettled={onReplacementSettled}
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
