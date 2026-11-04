import { deriveCardLifecycle } from './cardLifecycle.js';
import { sanitizeProjectId } from './projectIdentity.js';

// A presentation of existing evidence, never a new transport or write gate.
export function deriveCardSessionView({ link = {}, project = null, lifecycle = null, status = null } = {}) {
  const life = lifecycle || deriveCardLifecycle({ link, project });
  const r = link.readiness || {};
  const current = ['connected-direct', 'connected-bridge'].includes(link.state)
    && Boolean(r.bootId) && life.exactCard && (!link.validatedBootId || link.validatedBootId === r.bootId);
  const freshness = current ? 'current' : r.bootId ? 'stale' : 'checking';
  const installedControl = current && life.commandReady && !r.safeMode
    && ['ready','project-mismatch','length-mismatch','content-mismatch'].includes(life.state);
  const id = sanitizeProjectId(project?.id || project?.projectId);
  const cardId = sanitizeProjectId(r.projectId);
  const fp = String(project?.fingerprint || project?.projectFingerprint || '').toLowerCase();
  const cardFp = String(r.projectFingerprint || '').toLowerCase();
  let relationship = !project ? 'none' : 'unknown';
  if (life.exactProject) relationship = 'matches';
  else if (id && cardId && id !== cardId || fp && cardFp && fp !== cardFp
    || ['length-mismatch','content-mismatch'].includes(life.state)) relationship = 'differs';
  const changedDomains = life.state === 'length-mismatch' ? ['wiring'] : [];
  const installationState = r.safeMode ? 'recovery' : r.provisionalSetup ? 'provisional'
    : link.cardBlank === true ? 'empty' : r.knownGoodProject === true ? 'installed' : 'unknown';
  const freshStatus = status?.cardId === (r.cardId || link.card?.id) && status?.bootId === r.bootId ? status : null;
  const playlist = r.playlist || freshStatus?.playlist;
  const source = r.outputSourceClass || freshStatus?.lwOutput?.sourceClass || '';
  const playbackState = r.safeMode ? 'fault' : ['artnet','e131','external'].includes(source) ? 'externally-driven'
    : playlist?.playing === true ? 'playing' : playlist?.configured === true && playlist?.playing === false ? 'paused' : 'unknown';
  const summaryCode = life.state === 'wrong-card' ? 'WRONG_CARD' : !current ? (freshness === 'stale' ? 'DISCONNECTED' : 'CHECKING')
    : installationState === 'recovery' ? 'RECOVERY_REQUIRED' : installationState === 'empty' ? 'EMPTY'
    : installationState === 'provisional' ? 'SETUP_IN_PROGRESS' : installedControl ? 'INSTALLED_READY' : 'UNSUPPORTED';
  return {
    schemaVersion: 1,
    identity: { cardId: r.cardId || link.card?.id || '', bootId: r.bootId || '' },
    observation: { freshness, observedAt: link.acknowledgedAt || null },
    connection: { state: current ? 'Connected' : freshness === 'stale' ? 'Reconnecting · last seen' : life.connectionLabel, reason: life.reason },
    installation: { state: installationState, projectId: cardId, name: r.projectName || freshStatus?.projectName || freshStatus?.piece?.name || link.card?.name || 'Installed project', outputs: r.outputs || freshStatus?.outputs || [], revision: r.projectRevision, fingerprint: cardFp, wiringDigest: r.wiringDigest || '' },
    playback: { state: playbackState, patternId: playlist?.patternId || r.currentPatternId || freshStatus?.currentPatternId || '', source },
    draft: { relationship, changedDomains },
    checks: { count: 'unknown', colour: 'unknown', direction: 'unknown', source: 'No card-bound physical confirmation reported' },
    capabilities: { installedControl, draftEdit: installedControl && life.exactProject, projectReadback: current },
    summaryCode,
    primaryAction: installedControl ? 'Control installed project' : life.label,
    differenceCopy: relationship === 'matches' ? 'Your draft matches the installed project.' : relationship === 'differs'
      ? changedDomains.includes('wiring') ? 'Your draft has a different configured pixel count.' : 'Your draft differs from the installed project.'
      : 'The installed project and your draft have not been fully compared.',
  };
}
