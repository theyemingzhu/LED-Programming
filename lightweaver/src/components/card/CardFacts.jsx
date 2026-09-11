import React, { useEffect, useRef, useState } from 'react';
import { isUncountedHeadroomCount } from '../../lib/discoveryCommit.js';
import { useProject } from '../../state/ProjectContext.jsx';
import { pushLiveHardwareToCard } from '../../lib/cardLiveControl.js';
import { readCardStatusEnvelope } from '../../lib/cardPushClient.js';
import { cardConnectionOptionsFor, cardLoadMethodForProtocol } from '../../lib/cardConnection.js';
import { readPowerSupplySettings, withPowerSupplySettings } from '../../lib/powerSupplySettings.js';

// Card Home's facts: the numbers an owner changes at any moment, without
// walking a ladder. One module, two columns, and the common edits happen
// right in the row (surveyed 2026-09-11, round 7):
//   light count       −/+/type, then Set: the same write Setup's "Use this
//                     count" makes (project parts + the card, then warm
//                     white so the owner can see the count), supplied by
//                     SetupScreen as `countEditor`
//   colour order      RGB/GRB/BRG keys, tried on the strip right now
//                     (pushLiveHardwareToCard, read back from the exact
//                     card); "Check colors" is still the two-question
//                     confirmation (StripColorOrderCheck in the Hardware fold)
//   power limit       supply amps typed in the row; the card caps itself at
//                     80% (withPowerSupplySettings, the same writer as Wire)
//   brightness limit  a fader in the row (led.brightnessLimit)
//   outputs / pins    Layout → Wire (structure stays Layout's)
//   artwork placement Layout → Draw, optional
//   card release      the update screen
//   health            Verify hardware / Recover lights, with the last result
//                     remembered per card so the row is never wallpaper
// Nothing here writes a project to the card; the install control stays the
// one writer. Live colour previews are ephemeral until Save to card.

const COLOR_ORDERS = ['RGB', 'GRB', 'BRG'];

function discoveryEvidence(project) {
  const outputs = (Array.isArray(project?.portRoles) ? project.portRoles : [])
    .filter(output => output?.role === 'strip' && Number(output.pixelCount) > 0);
  return {
    outputs,
    count: outputs.reduce((sum, output) => sum + Number(output.pixelCount || 0), 0),
    counted: outputs.length > 0 && !outputs.every(output => isUncountedHeadroomCount(output.pixelCount)),
  };
}

function Row({ label, hint, hintTone, children, testId, last, note }) {
  return (
    <div className={`lw-fact${last ? ' is-last' : ''}`} data-testid={testId}>
      <div className="lw-fact-k">
        <span className="kk">{label}</span>
        {hint && <span className={`hh${hintTone ? ` is-${hintTone}` : ''}`}>{hint}</span>}
        {note}
      </div>
      <div className="lw-fact-v">{children}</div>
    </div>
  );
}

function Readout({ children, dim, testId }) {
  return <span className={`lw-rv${dim ? ' is-dim' : ''}`} data-testid={testId}>{children}</span>;
}

function formatWhen(at) {
  if (!at) return '';
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return '';
  const today = new Date();
  const sameDay = date.toDateString() === today.toDateString();
  return sameDay
    ? date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : date.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' + date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export function CardFacts({ currentProject, cardLink, cardHost, firmwareStatus, go, health = null, countEditor = null }) {
  const { standaloneController, setStandaloneController } = useProject();
  const led = currentProject?.devices?.standaloneController?.led || {};
  const evidence = discoveryEvidence(currentProject);
  const outputs = evidence.outputs;
  const pins = outputs.map(output => output.pin).filter(pin => pin !== undefined && pin !== null && pin !== '');
  const count = evidence.counted ? Number(evidence.count || 0) : 0;
  const colorConfirmed = led.colorOrderConfirmed === true && Boolean(led.colorOrder);
  const strips = Array.isArray(currentProject?.layout?.strips) ? currentProject.layout.strips : [];
  const drawn = currentProject?.layout?.starterPending === false && strips.length > 0;
  const powerLimit = Number.isFinite(Number(led.maxMilliamps)) && Number(led.maxMilliamps) > 0 ? Math.round(Number(led.maxMilliamps)) : 0;
  const powerSupply = readPowerSupplySettings(standaloneController);
  const brightness255 = Math.round((Number.isFinite(Number(led.brightnessLimit)) ? Number(led.brightnessLimit) : 0.45) * 255);
  const installedBuild = Number.isSafeInteger(firmwareStatus?.installedBuildNumber)
    ? firmwareStatus.installedBuildNumber
    : (Number.isSafeInteger(cardLink?.readiness?.buildNumber) ? cardLink.readiness.buildNumber : null);
  const releaseBuild = Number.isSafeInteger(firmwareStatus?.releaseBuildNumber) ? firmwareStatus.releaseBuildNumber : null;
  const updateAvailable = firmwareStatus?.actionable === true;
  const updateRequired = updateAvailable && firmwareStatus?.state !== 'update-available';
  const releaseHint = updateRequired
    ? 'This card’s software is behind. Update the card software before relying on it.'
    : updateAvailable && releaseBuild
      ? `A newer card release is available. Your lights keep working on ${installedBuild || 'this build'}. Update to ${releaseBuild} when convenient.`
      : 'The software the card is running';

  // ── light count, edited in the row ──────────────────────────────────
  const [countDraft, setCountDraft] = useState(String(count || ''));
  // Follow the project's count only while the owner is not mid-edit: a status
  // poll that re-reads the count must not wipe a number being typed.
  const lastCountRef = useRef(count);
  useEffect(() => {
    const previous = String(lastCountRef.current || '');
    lastCountRef.current = count;
    setCountDraft(draft => (draft === previous || draft === '' ? String(count || '') : draft));
  }, [count]);
  const draftNumber = Math.trunc(Number(countDraft));
  const draftValid = Number.isSafeInteger(draftNumber) && draftNumber >= 1;
  const countChanged = draftValid && draftNumber !== count;
  const canSetCount = Boolean(countEditor?.apply) && !countEditor?.busy;
  const nudge = delta => setCountDraft(String(Math.max(1, (draftValid ? draftNumber : count || 0) + delta)));
  const applyCount = () => { if (canSetCount && draftValid) countEditor.apply(draftNumber); };

  // ── colour order, tried on the strip right now ──────────────────────
  const [colorStatus, setColorStatus] = useState({ kind: '', text: '' });
  const colorSeq = useRef(0);
  const setColorOrder = order => {
    const colorOrder = String(order || '').toUpperCase();
    setStandaloneController(prev => ({ ...(prev || {}), led: { ...((prev || {}).led || {}), colorOrder } }));
    const directPush = cardLoadMethodForProtocol(typeof window !== 'undefined' ? window.location.protocol : 'https:').directPush;
    if (!directPush) {
      setColorStatus({ kind: '', text: `${colorOrder} set in Studio. Open the local Studio to try it on the strip.` });
      return;
    }
    const seq = ++colorSeq.current;
    setColorStatus({ kind: '', text: `Trying ${colorOrder} on the strip…` });
    pushLiveHardwareToCard({ colorOrder }, { ...cardConnectionOptionsFor(cardLink, cardHost), timeoutMs: 2000 })
      .then(async response => {
        if (response?.ok !== true || !Number.isSafeInteger(response?.stateRevision)) throw new Error('no card acknowledgement');
        const readback = await readCardStatusEnvelope({ ...cardConnectionOptionsFor(cardLink, cardHost), timeoutMs: 2000 });
        if (!response.cardId || readback?.cardId !== response.cardId || readback?.led?.colorOrder !== colorOrder) throw new Error('readback mismatch');
        if (seq !== colorSeq.current) return;
        setColorStatus({ kind: 'ok', text: `${colorOrder} is on the strip. Check colors to confirm it; Save to card to keep it.` });
      })
      .catch(() => {
        if (seq !== colorSeq.current) return;
        setColorStatus({ kind: 'err', text: `${colorOrder} set in Studio, but the card did not answer.` });
      });
  };

  // ── power and brightness, in the row ────────────────────────────────
  const setSupplyAmps = value => {
    const amps = Number.parseFloat(value);
    if (!Number.isFinite(amps) || amps <= 0) return;
    setStandaloneController(prev => withPowerSupplySettings(prev, { ...readPowerSupplySettings(prev), psuAmps: amps }));
  };
  const setBrightness = value255 => {
    const limit = Math.max(0.05, Math.min(1, Number(value255) / 255));
    setStandaloneController(prev => ({ ...(prev || {}), led: { ...((prev || {}).led || {}), brightnessLimit: limit } }));
  };

  const lastHealth = health?.last;

  return (
    <section className="lw-mod lw-facts" data-testid="card-facts" aria-label="This card">
      <div className="lw-mod-head">
        <span className={`lw-led${outputs.length ? ' is-live' : ''}`} aria-hidden="true" />
        <span className="t">This card</span>
        <span className="m">ESP32-S3{installedBuild ? ` · release ${installedBuild}` : ''}</span>
      </div>
      <div className="lw-facts-grid">
        <div className="lw-facts-col">
          <Row label="Outputs" testId="fact-outputs">
            <Readout dim={!pins.length}>{pins.length ? pins.map(pin => `GPIO ${pin}`).join(' · ') : 'None yet'}</Readout>
            <button type="button" className="btn" onClick={() => go('#screen=layout&mode=wire')}>Change wiring</button>
          </Row>
          <Row
            label={outputs.length === 1 ? 'Lights on output 1' : 'Lights'}
            hint={countEditor?.apply ? 'Set lights the strip to the count' : (count ? 'Counted to the last lit light' : 'Find my strips counts them')}
            testId="fact-lights"
            note={countEditor?.message ? <p role="status" className="hh" data-testid="fact-lights-message">{countEditor.message}</p> : null}
          >
            {countEditor?.apply ? (
              <div className="lw-stepper" data-testid="fact-lights-stepper">
                <button type="button" className="btn lw-stepper-key" aria-label="One fewer light" disabled={!canSetCount} onClick={() => nudge(-1)}>−</button>
                <input
                  className="lw-stepper-input"
                  type="number"
                  inputMode="numeric"
                  min="1"
                  step="1"
                  aria-label="Light count"
                  value={countDraft}
                  disabled={!canSetCount}
                  onChange={event => setCountDraft(event.target.value)}
                  onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); applyCount(); } }}
                />
                <button type="button" className="btn lw-stepper-key" aria-label="One more light" disabled={!canSetCount} onClick={() => nudge(1)}>+</button>
                <button type="button" className={countChanged ? 'btn primary' : 'btn'} data-testid="fact-lights-set" disabled={!canSetCount || !countChanged} onClick={applyCount}>
                  {countEditor.busy ? 'Setting…' : 'Set'}
                </button>
              </div>
            ) : (
              <>
                <Readout dim={!count}>{count || 'Not counted'}</Readout>
                <button type="button" className="btn" onClick={() => go(drawn ? '#screen=layout&mode=draw' : '#screen=discovery')}>Change count</button>
              </>
            )}
          </Row>
          <Row
            label="Color order"
            hint={colorConfirmed ? 'Confirmed on the strip' : 'Not confirmed. Try an order, then Check colors.'}
            hintTone={colorConfirmed ? '' : 'warn'}
            testId="fact-color-order"
            note={colorStatus.text ? <p role="status" className={`hh${colorStatus.kind === 'err' ? ' is-warn' : ''}`} data-testid="fact-color-status">{colorStatus.text}</p> : null}
          >
            <div className="lw-keys" role="group" aria-label="Color order" data-testid="fact-color-keys">
              {COLOR_ORDERS.map(order => (
                <button
                  key={order}
                  type="button"
                  className={`lw-key${(led.colorOrder || 'RGB') === order ? ' on' : ''}`}
                  aria-pressed={(led.colorOrder || 'RGB') === order}
                  onClick={() => setColorOrder(order)}
                >{order}</button>
              ))}
            </div>
            <button type="button" className="btn" onClick={() => go('#screen=card&section=settings&tool=color-order')}>Check colors</button>
          </Row>
          <Row label="Artwork placement" hint="Optional" testId="fact-artwork" last>
            <Readout dim={!drawn}>{drawn ? (strips.length === 1 ? '1 strip' : `${strips.length} strips`) : 'Not drawn'}</Readout>
            <button type="button" className="btn" onClick={() => go('#screen=layout&mode=draw')}>{drawn ? 'Open Layout' : 'Draw'}</button>
          </Row>
        </div>
        <div className="lw-facts-col">
          <Row label="Card release" hint={releaseHint} hintTone={updateRequired ? 'warn' : ''} testId="fact-release">
            <Readout dim={!installedBuild}>{installedBuild || 'Unknown'}</Readout>
            <button
              type="button"
              className="btn"
              data-testid={updateRequired ? 'setup-update-card-required' : updateAvailable ? 'setup-update-card' : 'fact-release-open'}
              onClick={() => go('#screen=card&section=install')}
            >
              {updateAvailable ? 'Update card' : 'Card software'}
            </button>
          </Row>
          <Row label="Power limit" hint="Supply size; the card caps itself at 80% of it" testId="fact-power">
            <label className="lw-inline-field">
              <input
                className="lw-stepper-input"
                type="number"
                inputMode="decimal"
                min="0.5"
                step="0.5"
                aria-label="Power supply amps"
                value={powerSupply.psuAmps}
                onChange={event => setSupplyAmps(event.target.value)}
              />
              <span className="lw-unit">A</span>
            </label>
            <Readout dim={!powerLimit} testId="fact-power-limit">{powerLimit ? `${powerLimit} mA` : 'Not set'}</Readout>
          </Row>
          <Row label="Brightness limit" hint="Max firmware output for sellable pieces" testId="fact-brightness">
            <input
              className="lw-fader"
              type="range"
              min="32"
              max="255"
              step="1"
              aria-label="Brightness limit"
              value={brightness255}
              onChange={event => setBrightness(event.target.value)}
            />
            <Readout>{brightness255}</Readout>
          </Row>
          {health ? (
            <div className="lw-fact is-last lw-fact-health" data-testid="card-checks-recovery">
              <div className="lw-fact-k">
                <span className="kk">Health</span>
                {/* The remembered result stands in for the live message once
                    that has gone; right after a check the live message is
                    the fuller of the two and the memory line yields. */}
                {!health.message && (
                  <span className="hh" data-testid="card-checks-last">
                    {lastHealth?.message
                      ? `${lastHealth.status === 'error' ? 'Failed' : 'Verified'} ${formatWhen(lastHealth.at)} · ${lastHealth.message}`
                      : 'Not checked yet. Reads the card and reports what it says.'}
                  </span>
                )}
                {health.note && <p role="status" className="hh is-warn">{health.note}</p>}
                {health.message && <p role={health.messageRole || 'status'} className="hh" data-testid="card-checks-message">{health.message}</p>}
              </div>
              <div className="lw-fact-v">
                <button type="button" className="btn" disabled={health.busy} onClick={health.verify}>Verify hardware</button>
                {health.recover && <button type="button" className="btn" disabled={health.busy} onClick={health.recover}>Recover lights</button>}
                {health.clear && <button type="button" className="btn" disabled={health.busy} onClick={health.clear}>Clear temporary setup</button>}
              </div>
            </div>
          ) : (
            <Row label="Health" hint="Connect the card to read it" testId="fact-health-offline" last>
              <Readout dim>Not connected</Readout>
            </Row>
          )}
        </div>
      </div>
    </section>
  );
}
