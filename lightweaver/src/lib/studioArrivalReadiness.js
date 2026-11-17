import { CONNECTED_CARD_LINK_STATES } from './setupJourney.js';

function lightTask(setupJourney, project) {
  if (!project) return 'unknown';
  // The ladder can mark the entire lights phase done for a healthy install.
  // Its individual discovery checks describe what this project actually saved.
  const checks = setupJourney?.phases?.find(phase => phase.id === 'lights')?.progress;
  if (!checks?.length) return 'unknown';
  if (checks.every(check => check.status === 'done')) return 'verified';
  return checks.some(check => check.status === 'done') ? 'in-progress' : 'not-started';
}

function layoutTask(project) {
  if (!project) return 'unknown';
  const layout = project.layout;
  // A starter can contain default strips. They are not authored artwork.
  if (layout?.starterPending !== false) return 'not-started';
  if (Array.isArray(layout.strips) && layout.strips.length) return 'verified';
  const hasArtwork = Boolean(layout.svgText) || (Array.isArray(layout.layers) && layout.layers.length > 0);
  return hasArtwork ? 'in-progress' : 'not-started';
}

function compatibilityFor({ cardLink, actionCheck, exactPlayback, postUpdateVerificationPending }) {
  if (postUpdateVerificationPending) {
    return { state: 'unverified', reason: 'post-update-verification-pending' };
  }
  // A project/action check is supplied by the owner of that capability. A
  // failed probe, unknown build, or release comparison is not such a check.
  if (['compatible', 'update-required', 'incompatible', 'unverified'].includes(actionCheck?.state)) {
    return { state: actionCheck.state, reason: actionCheck.reason || 'requested-action' };
  }
  if (cardLink?.reason === 'firmware-too-old') {
    return { state: 'update-required', reason: 'firmware-too-old' };
  }
  if (exactPlayback) return { state: 'compatible', reason: 'exact-installed-playback' };
  return { state: 'unverified', reason: cardLink?.reason || 'insufficient-evidence' };
}

/**
 * Arrival advice for the open project and requested action. This projection
 * neither changes the setup route nor grants permission to operate the card.
 *
 * Pass a lifecycle and setup journey assembled from the current link/project.
 * With no actionCheck, compatibility means playback of the exact open project.
 * A supplied actionCheck must be scoped to the requested action and current
 * project/card/boot; only report update-required if an update addresses it.
 * Keep postUpdateVerificationPending set until the current installation has
 * been checked, even after firmware recovery reports a successful reboot.
 * installationVerified requires scoped readback and observed light/look recall.
 * recheckTasks downgrades only named, otherwise verified task evidence.
 */
export function deriveStudioArrivalReadiness({
  cardLink,
  cardLifecycle,
  setupJourney,
  project,
  firmwareStatus,
  actionCheck,
  postUpdateVerificationPending = false,
  installationVerified = false,
  recheckTasks = [],
} = {}) {
  const installedPlaybackReady = !postUpdateVerificationPending
    && CONNECTED_CARD_LINK_STATES.includes(cardLink?.state)
    && cardLifecycle?.installedControlsReady === true;
  const exactPlayback = installedPlaybackReady && cardLifecycle.state === 'ready';
  const compatibility = compatibilityFor({ cardLink, actionCheck, exactPlayback, postUpdateVerificationPending });
  const available = firmwareStatus?.actionable === true;

  const confirmLights = setupJourney?.taskId === 'confirm-visible-lights';
  const tasks = {
    lights: lightTask(setupJourney, project),
    layout: layoutTask(project),
    verify: postUpdateVerificationPending ? 'unknown'
      : confirmLights ? 'in-progress'
      : exactPlayback && installationVerified === true ? 'verified'
      : 'unknown',
  };
  for (const task of ['lights', 'layout', 'verify']) {
    if (recheckTasks.includes(task) && tasks[task] === 'verified') tasks[task] = 'needs-recheck';
  }

  // Offline layout work is independent of the connection/installation action.
  // Keep the existing setup journey available beside this authoring suggestion.
  const resumeLayout = tasks.layout === 'in-progress' || tasks.layout === 'needs-recheck'
    || (tasks.lights === 'verified' && tasks.layout === 'not-started');
  const resumeTask = tasks.lights === 'needs-recheck' ? 'discover-lights'
    : resumeLayout ? 'place-lights' : null;

  return {
    compatibility,
    update: { available, optional: available && compatibility.state === 'compatible' },
    installedPlaybackReady,
    tasks,
    resumeTask,
  };
}
