import React from 'react';
import { isUncountedHeadroomCount } from '../../lib/discoveryCommit.js';

// Card Home's facts: the numbers an owner changes at any moment, without
// walking a ladder — outputs, light count, colour order, artwork placement,
// the card release, power and brightness limits, and the card's health.
// One module, two columns. Each row reads the value Studio holds and offers
// ONE door to the editor that already owns it (surveyed 2026-09-11):
//   outputs / pins        Layout → Wire        (WirePlanTools, WireDiscovery)
//   light count           Find my strips       (StripDiscoveryPanel) until the
//                         strips are drawn, then Layout → Draw (the LED stepper)
//   colour order          the two-question check (StripColorOrderCheck),
//                         mounted in the Hardware fold behind ?tool=color-order
//   power limit           the Hardware fold (same writer as Layout → Wire,
//                         withPowerSupplySettings); read from led.maxMilliamps
//   brightness limit      the Hardware fold (SettingsScreen mode="card")
//   card release          the update screen (#screen=card&section=install)
//   health                Verify hardware / Recover lights, handlers from
//                         CardHomePanels (they read the card and report back;
//                         nothing is recorded as passing until the owner says
//                         they saw it)
// The project on the card is the status row's Project cell. Nothing here
// writes a project to the card; the install control stays the one writer.

function discoveryEvidence(project) {
  const outputs = (Array.isArray(project?.portRoles) ? project.portRoles : [])
    .filter(output => output?.role === 'strip' && Number(output.pixelCount) > 0);
  return {
    outputs,
    count: outputs.reduce((sum, output) => sum + Number(output.pixelCount || 0), 0),
    counted: outputs.length > 0 && !outputs.every(output => isUncountedHeadroomCount(output.pixelCount)),
  };
}

function Row({ label, hint, hintTone, children, testId, last }) {
  return (
    <div className={`lw-fact${last ? ' is-last' : ''}`} data-testid={testId}>
      <div className="lw-fact-k"><span className="kk">{label}</span>{hint && <span className={`hh${hintTone ? ` is-${hintTone}` : ''}`}>{hint}</span>}</div>
      <div className="lw-fact-v">{children}</div>
    </div>
  );
}

function Readout({ children, dim }) {
  return <span className={`lw-rv${dim ? ' is-dim' : ''}`}>{children}</span>;
}

export function CardFacts({ currentProject, cardLink, firmwareStatus, go, health = null }) {
  const led = currentProject?.devices?.standaloneController?.led || {};
  const evidence = discoveryEvidence(currentProject);
  const outputs = evidence.outputs;
  const pins = outputs.map(output => output.pin).filter(pin => pin !== undefined && pin !== null && pin !== '');
  const count = evidence.counted ? Number(evidence.count || 0) : 0;
  const colorConfirmed = led.colorOrderConfirmed === true && Boolean(led.colorOrder);
  const strips = Array.isArray(currentProject?.layout?.strips) ? currentProject.layout.strips : [];
  const drawn = currentProject?.layout?.starterPending === false && strips.length > 0;
  const powerLimit = Number.isFinite(Number(led.maxMilliamps)) && Number(led.maxMilliamps) > 0 ? Math.round(Number(led.maxMilliamps)) : 0;
  const brightness255 = Math.round((Number.isFinite(Number(led.brightnessLimit)) ? Number(led.brightnessLimit) : 0.45) * 255);
  const installedBuild = Number.isSafeInteger(firmwareStatus?.installedBuildNumber)
    ? firmwareStatus.installedBuildNumber
    : (Number.isSafeInteger(cardLink?.readiness?.buildNumber) ? cardLink.readiness.buildNumber : null);
  const releaseBuild = Number.isSafeInteger(firmwareStatus?.releaseBuildNumber) ? firmwareStatus.releaseBuildNumber : null;
  const updateAvailable = firmwareStatus?.actionable === true;
  // A merely newer release is optional; a card whose software cannot run the
  // installed project is a blocker and says so.
  const updateRequired = updateAvailable && firmwareStatus?.state !== 'update-available';
  const releaseHint = updateRequired
    ? 'This card’s software is behind. Update the card software before relying on it.'
    : updateAvailable && releaseBuild
      ? `A newer card release is available. Your lights keep working on ${installedBuild || 'this build'}. Update to ${releaseBuild} when convenient.`
      : 'The software the card is running';

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
          <Row label={outputs.length === 1 ? 'Lights on output 1' : 'Lights'} testId="fact-lights">
            <Readout dim={!count}>{count || 'Not counted'}</Readout>
            <button type="button" className="btn" onClick={() => go(drawn ? '#screen=layout&mode=draw' : '#screen=discovery')}>Change count</button>
          </Row>
          <Row label="Color order" hint={colorConfirmed ? 'Confirmed on the strip' : 'Not confirmed'} hintTone={colorConfirmed ? '' : 'warn'} testId="fact-color-order">
            <Readout dim={!colorConfirmed}>{led.colorOrder ? (colorConfirmed ? led.colorOrder : `${led.colorOrder}?`) : 'Not set'}</Readout>
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
          <Row label="Power limit" hint="80% of the supply" testId="fact-power">
            <Readout dim={!powerLimit}>{powerLimit ? `${powerLimit} mA` : 'Not set'}</Readout>
            <button type="button" className="btn" onClick={() => go('#screen=card&section=settings')}>{powerLimit ? 'Change' : 'Set a limit'}</button>
          </Row>
          <Row label="Brightness limit" testId="fact-brightness">
            <Readout>{brightness255}</Readout>
            <button type="button" className="btn" onClick={() => go('#screen=card&section=settings')}>Change</button>
          </Row>
          {health ? (
            <div className="lw-fact is-last lw-fact-health" data-testid="card-checks-recovery">
              <div className="lw-fact-k">
                <span className="kk">Health</span>
                <span className="hh">Reads the card and reports what it says</span>
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
