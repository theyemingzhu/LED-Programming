import React from 'react';
import { requestProjectsPanel } from '../projects/ProjectsPanel.jsx';

// Card Home's facts: the numbers an owner changes at any moment, without
// walking a ladder — outputs, light count, colour order, artwork placement,
// the project on the card, the card release, power and brightness limits.
// Each row reads the value Studio holds and offers ONE door to the editor
// that already owns it (surveyed 2026-09-11):
//   outputs / pins        Layout → Wire        (WirePlanTools, WireDiscovery)
//   light count           Find my strips       (StripDiscoveryPanel) until the
//                         strips are drawn, then Layout → Draw (the LED stepper)
//   colour order          the two-question check (StripColorOrderCheck),
//                         mounted in the Hardware fold behind ?tool=color-order
//   power limit           the Hardware fold (same writer as Layout → Wire,
//                         withPowerSupplySettings); read from led.maxMilliamps
//   brightness limit      the Hardware fold (SettingsScreen mode="card")
//   card release          the update screen (#screen=card&section=install)
//   project on card       the Projects panel, opened directly
// Nothing here writes to the card. The install control stays the one writer.

function Row({ label, hint, children, testId }) {
  return (
    <div className="lw-fact" data-testid={testId}>
      <div className="lw-fact-k"><span className="kk">{label}</span>{hint && <span className="hh">{hint}</span>}</div>
      <div className="lw-fact-v">{children}</div>
    </div>
  );
}

function Readout({ children, dim }) {
  return <span className={`lw-rv${dim ? ' is-dim' : ''}`}>{children}</span>;
}

export function CardFacts({ currentProject, evidence, cardLink, cardState, firmwareStatus, installedLabel, go }) {
  const led = currentProject?.devices?.standaloneController?.led || {};
  const outputs = Array.isArray(evidence?.outputs) ? evidence.outputs : [];
  const pins = outputs.map(output => output.pin).filter(pin => pin !== undefined && pin !== null && pin !== '');
  const count = Number(evidence?.count || 0);
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
  const cardProjectId = cardState?.status?.projectId || cardLink?.readiness?.projectId || '';

  return (
    <div className="lw-facts" data-testid="card-facts">
      <section className="lw-mod" aria-label="Lights">
        <div className="lw-mod-head">
          <span className={`lw-led${outputs.length ? ' is-live' : ''}`} aria-hidden="true" />
          <span className="t">Lights</span>
          <span className="m">{outputs.length === 1 ? '1 output' : `${outputs.length} outputs`}</span>
        </div>
        <Row label="Outputs" hint="Which pin each strip is on" testId="fact-outputs">
          <Readout dim={!pins.length}>{pins.length ? pins.map(pin => `GPIO ${pin}`).join(' · ') : 'None yet'}</Readout>
          <button type="button" className="btn" onClick={() => go('#screen=layout&mode=wire')}>Change wiring</button>
        </Row>
        <Row label={outputs.length === 1 ? 'Lights on output 1' : 'Lights'} hint="Counted to the last lit light" testId="fact-lights">
          <Readout dim={!count}>{count || 'Not counted'}</Readout>
          <button type="button" className="btn" onClick={() => go(drawn ? '#screen=layout&mode=draw' : '#screen=discovery')}>Change count</button>
        </Row>
        <Row label="Color order" hint={colorConfirmed ? 'Confirmed on the strip' : 'Not confirmed yet. Two questions settle it.'} testId="fact-color-order">
          <Readout dim={!colorConfirmed}>{led.colorOrder || 'Not set'}</Readout>
          <button type="button" className="btn" onClick={() => go('#screen=card&section=settings&tool=color-order')}>Check colors</button>
        </Row>
        <Row label="Artwork placement" hint="Optional. Not needed to install or to play patterns." testId="fact-artwork">
          <Readout dim={!drawn}>{drawn ? (strips.length === 1 ? '1 strip' : `${strips.length} strips`) : 'Not drawn'}</Readout>
          <button type="button" className="btn" onClick={() => go('#screen=layout&mode=draw')}>{drawn ? 'Open Layout' : 'Draw'}</button>
        </Row>
      </section>

      <section className="lw-mod" aria-label="Card and hardware">
        <div className="lw-mod-head">
          <span className={`lw-led${cardProjectId ? ' is-live' : ''}`} aria-hidden="true" />
          <span className="t">Card &amp; hardware</span>
          <span className="m">ESP32-S3</span>
        </div>
        <Row label="Project on card" hint={installedLabel} testId="fact-project">
          <button type="button" className="btn" data-testid="fact-project-open" onClick={() => requestProjectsPanel()}>Projects</button>
        </Row>
        <Row
          label="Card release"
          hint={updateAvailable && releaseBuild
            ? `A newer card release is available. Your lights keep working on ${installedBuild || 'this build'}. Update to ${releaseBuild} when convenient.`
            : 'The software the card is running'}
          testId="fact-release"
        >
          <Readout dim={!installedBuild}>{installedBuild || 'Unknown'}</Readout>
          <button type="button" className="btn" data-testid={updateAvailable ? 'setup-update-card' : 'fact-release-open'} onClick={() => go('#screen=card&section=install')}>{updateAvailable ? 'Update card' : 'Card software'}</button>
        </Row>
        <Row label="Power limit" hint="What the supply can give, in milliamps" testId="fact-power">
          <Readout dim={!powerLimit}>{powerLimit ? `${powerLimit} mA` : 'Not set'}</Readout>
          <button type="button" className="btn" onClick={() => go('#screen=card&section=settings')}>{powerLimit ? 'Change' : 'Set a limit'}</button>
        </Row>
        <Row label="Brightness limit" hint="Max firmware output for sellable pieces" testId="fact-brightness">
          <Readout>{brightness255}</Readout>
          <button type="button" className="btn" onClick={() => go('#screen=card&section=settings')}>Change</button>
        </Row>
      </section>
    </div>
  );
}
