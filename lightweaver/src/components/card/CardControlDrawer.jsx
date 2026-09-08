import React, { useEffect, useRef, useState } from 'react';
import { readCardPatternsFromCard, readCardZonesFromCard, pushLivePreviewToCard, readBackLivePreview } from '../../lib/cardLiveControl.js';
import {
  applyCustomerControlAcknowledgement,
  beginCustomerControl,
  createCardCustomerControls,
  normalizeCardCustomerControls,
} from '../../lib/cardCustomerControls.js';
import { deriveCardLifecycle } from '../../lib/cardLifecycle.js';
import { retryWhileTransient } from '../../lib/cardTransientFailure.js';

function percent(value) {
  return Math.round(Number(value || 0) * 100);
}

export function CardControlDrawer({ open, link, lifecycle = null, host, onClose, onAdvanced, onReconnect }) {
  const panelRef = useRef(null);
  const restoreFocusRef = useRef(null);
  const [controls, setControls] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!open) return undefined;
    let active = true;
    restoreFocusRef.current = document.activeElement;
    window.setTimeout(() => panelRef.current?.focus(), 0);
    setControls(null);
    setLoadError('');
    // Both are pure reads, so opening the drawer on a card that is still
    // starting is waited out rather than reported. The Try again button below
    // did exactly this — but only when the owner pressed it, which meant the
    // first thing they saw on opening the controls was a failure about a
    // moment that had already passed.
    retryWhileTransient(() => Promise.all([
      readCardZonesFromCard({ host, expectedCardId: link.card?.id || '', timeoutMs: 1800 }),
      readCardPatternsFromCard({ host, expectedCardId: link.card?.id || '', timeoutMs: 1800 }),
    ]), { attempts: 3, delayMs: 400 }).then(([zones, patterns]) => {
      if (!active) return;
      setControls(createCardCustomerControls(normalizeCardCustomerControls(zones, patterns)));
    }).catch(error => {
      if (active) setLoadError(error?.message || 'Studio could not read the card controls.');
    });
    const onKeyDown = event => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      } else if (event.key === 'Tab' && panelRef.current) {
        const focusable = [...panelRef.current.querySelectorAll('button:not(:disabled), select:not(:disabled), input:not(:disabled), [href], [tabindex]:not([tabindex="-1"])')];
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const focusIsOutside = !panelRef.current.contains(document.activeElement);
        if (focusIsOutside || document.activeElement === panelRef.current) {
          event.preventDefault();
          (event.shiftKey ? last : first).focus();
        } else if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      active = false;
      document.removeEventListener('keydown', onKeyDown);
      restoreFocusRef.current?.focus?.();
    };
  }, [host, link.card?.id, onClose, open, reloadKey]);

  if (!open) return null;
  const view = controls?.view;
  // The lifecycle is the one status authority; the app shell always passes
  // it, and a bare render derives the same diagnosis from the link.
  // connectionLabel, not label: this line answers "Card connection", and
  // `label` is the footer chip's errand text, so a drifted card's drawer used
  // to answer that question with "Save to card". See CONNECTION_LABELS in
  // cardLifecycle.js. `connected` is now true for every command-ready card
  // rather than only an exactly-matching one, which is what the word means.
  const cardLifecycle = lifecycle || deriveCardLifecycle({ link: link || {} });
  const connectionStatus = cardLifecycle.connectionLabel || cardLifecycle.label;
  const connected = connectionStatus === 'Connected';
  const safeControlsReady = lifecycle?.safeControlAccess === 'ready';
  const mutationDisabled = !safeControlsReady || Boolean(controls?.pending);
  const activePattern = view?.patterns.find(pattern => pattern.id === view.activePatternId);
  const customControls = activePattern?.controls && Object.values(activePattern.controls).some(Boolean)
    ? activePattern.controls
    : null;
  const runControl = patch => {
    if (!controls?.view || mutationDisabled) return;
    const optimistic = beginCustomerControl(controls, patch);
    setControls(optimistic);
    const look = {
      ...optimistic.view.look,
      blackout: optimistic.view.blackout,
      ...(patch.patternId ? { syncZones: true } : {}),
    };
    // Setting THIS pattern, THIS brightness, means the same thing twice, so a
    // card that is still starting is waited out rather than reported. The
    // Retry button below stays for a settled refusal — but the owner should
    // never be handed it for a moment that was going to pass anyway.
    //
    // A reply lost AFTER the card applied the command is the one case where
    // "the same thing twice" is a second real command. Before any retry the
    // card is read back; a pattern change the card already shows is settled
    // by that read (brightness and colour patches come back in the card's
    // own units and are not read-verifiable, so those still retry).
    const controlOptions = {
      host,
      expectedCardId: link.card?.id || '',
      preferBridge: link.transport === 'bridge',
      latestOnly: false,
      autoDiscover: false,
      revision: optimistic.command.id,
      exactCardPatternId: look.patternId,
      expectedControlPatch: patch,
    };
    retryWhileTransient(() => pushLivePreviewToCard(look, controlOptions), {
      attempts: 3,
      delayMs: 350,
      readBack: () => readBackLivePreview(look, { ...controlOptions, timeoutMs: 1200 }),
    }).then(response => {
      setControls(current => current ? applyCustomerControlAcknowledgement(current, optimistic.command.id, response) : current);
    }).catch(error => {
      setControls(current => current ? applyCustomerControlAcknowledgement(current, optimistic.command.id, error) : current);
    });
  };
  const cyclePattern = direction => {
    if (!view?.patterns?.length) return;
    const current = Math.max(0, view.patterns.findIndex(pattern => pattern.id === view.activePatternId));
    const index = (current + direction + view.patterns.length) % view.patterns.length;
    runControl({ patternId: view.patterns[index].id });
  };

  return (
    <div className="card-control-layer" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <aside
        id="card-control-drawer"
        className="card-control-drawer"
        role="dialog"
        aria-modal="true"
        aria-label={`${link.card?.name || 'Lightweaver'} controls`}
        ref={panelRef}
        tabIndex={-1}
      >
        <header className="card-control-head">
          <div>
            <p>{connected ? 'Connected card' : 'Card connection'}</p>
            <h2>{link.card?.name || 'Lightweaver'}</h2>
            <span>{connected ? (link.state === 'connected-bridge' ? 'Connected through card page' : 'Connected on local network') : connectionStatus}</span>
          </div>
          <button type="button" className="card-connection-close" onClick={onClose} aria-label="Close card controls">×</button>
        </header>

        {!safeControlsReady ? <div className="card-control-error" role="status"><p>Card controls are paused until this exact card and installed project are verified.</p><button type="button" className="btn" onClick={onReconnect}>Reconnect</button></div> : null}

        {loadError ? <div className="card-control-error" role="alert"><p>{loadError}</p><button type="button" className="btn" onClick={() => setReloadKey(key => key + 1)}>Try again</button></div> : null}
        {!controls && !loadError ? <p className="card-control-loading" role="status">Reading the card controls…</p> : null}
        {view ? <div className="card-control-body">
          <section aria-labelledby="card-pattern-heading">
            <h3 id="card-pattern-heading">Pattern</h3>
            <div className="card-pattern-select">
              <button type="button" onClick={() => cyclePattern(-1)} disabled={mutationDisabled} aria-label="Previous pattern">Previous</button>
              <select aria-label="Pattern" value={view.activePatternId} disabled={mutationDisabled} onChange={event => runControl({ patternId: event.target.value })}>
                {view.patterns.map(pattern => <option key={pattern.id} value={pattern.id}>{pattern.label}</option>)}
              </select>
              <button type="button" onClick={() => cyclePattern(1)} disabled={mutationDisabled} aria-label="Next pattern">Next</button>
            </div>
          </section>

          <section className="card-control-sliders" aria-label="Pattern controls">
            <label>Brightness <output>{percent(view.look.brightness)}%</output><input aria-label="Brightness" type="range" min="0" max="100" value={percent(view.look.brightness)} disabled={mutationDisabled} onChange={event => runControl({ brightness: Number(event.target.value) / 100 })} /></label>
            <label>Speed <output>{view.look.speed.toFixed(2)}×</output><input aria-label="Speed" type="range" min="0.05" max="3" step="0.05" value={view.look.speed} disabled={mutationDisabled} onChange={event => runControl({ speed: Number(event.target.value) })} /></label>
            <label>Hue shift <output>{view.look.hueShift}</output><input aria-label="Hue shift" type="range" min="-128" max="128" value={view.look.hueShift} disabled={mutationDisabled} onChange={event => runControl({ hueShift: Number(event.target.value) })} /></label>
          </section>

          {customControls ? <section className="card-control-custom" aria-labelledby="card-custom-heading">
            <h3 id="card-custom-heading">Custom color</h3>
            {customControls.customColor ? <>
              <label>Hue <output>{view.look.customHue}</output><input aria-label="Custom hue" type="range" min="0" max="255" value={view.look.customHue} disabled={mutationDisabled} onChange={event => runControl({ customHue: Number(event.target.value) })} /></label>
              <label>Saturation <output>{view.look.customSaturation}</output><input aria-label="Custom saturation" type="range" min="0" max="255" value={view.look.customSaturation} disabled={mutationDisabled} onChange={event => runControl({ customSaturation: Number(event.target.value) })} /></label>
            </> : null}
            {customControls.breathe ? <label className="card-control-toggle"><input aria-label="Breathe" type="checkbox" checked={view.look.customBreathe} disabled={mutationDisabled} onChange={event => runControl({ customBreathe: event.target.checked })} /> Breathe</label> : null}
            {customControls.drift ? <>
              <label className="card-control-toggle"><input aria-label="Drift" type="checkbox" checked={view.look.customDrift} disabled={mutationDisabled} onChange={event => runControl({ customDrift: event.target.checked })} /> Drift</label>
              <div className="card-palette-presets" aria-label="Color palettes">
                <button type="button" aria-label="Warm palette" disabled={mutationDisabled} onClick={() => runControl({ customHue: 22, customSaturation: 230, customDrift: true, driftHueMin: 0, driftHueMax: 60 })}>Warm</button>
                <button type="button" aria-label="Cool palette" disabled={mutationDisabled} onClick={() => runControl({ customHue: 158, customSaturation: 220, customDrift: true, driftHueMin: 130, driftHueMax: 200 })}>Cool</button>
                <button type="button" aria-label="Rainbow palette" disabled={mutationDisabled} onClick={() => runControl({ customSaturation: 230, customDrift: true, driftHueMin: 0, driftHueMax: 255 })}>Rainbow</button>
              </div>
            </> : null}
          </section> : null}

          {controls.failure ? <div className="card-control-error" role="alert"><p>{controls.failure.message}</p><button type="button" className="btn" disabled={mutationDisabled} onClick={() => runControl(controls.retry)}>Retry</button></div> : null}
          <footer className="card-control-actions">
            <button type="button" className="btn" disabled={mutationDisabled} onClick={() => onAdvanced(activePattern)}>Advanced editing</button>
            <button type="button" className={view.blackout ? 'btn primary' : 'btn'} aria-pressed={view.blackout} onClick={() => runControl({ blackout: !view.blackout })} disabled={mutationDisabled}>{view.blackout ? 'Restore' : 'Blackout'}</button>
          </footer>
        </div> : null}
      </aside>
    </div>
  );
}
