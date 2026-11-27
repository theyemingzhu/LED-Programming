// The card is where browsers meet. A browser holding only the untouched
// starter picks up the card's project by itself, on any screen.
import { adoptedProjectName } from './cardProjectAdoption.js';
import { lifecycleLabel } from './projectLifecycle.js';
import { createDefaultProject } from './projectModel.js';

const FINGERPRINT = /^[a-f0-9]{16,64}$/;

/**
 * Whether this browser may open the connected card's project by itself.
 * Only when it holds no owner work (an untouched starter that has not been
 * renamed or edited) and the card proves exactly what it holds. Returns the
 * once-per-boot key, or '' when it must not.
 */
export function cardPickupKey({ project, projectLifecycle, connected, readiness = {}, cardId = '' }) {
  if (!connected || !readiness) return '';
  if (project?.layout?.starterPending !== true) return '';
  if (lifecycleLabel(projectLifecycle || {}) !== 'New project') return '';
  if (readiness.knownGoodProject !== true || readiness.provisionalSetup || readiness.safeMode) return '';
  if (readiness.commandReady === false) return '';
  if (!FINGERPRINT.test(String(readiness.projectFingerprint || '').toLowerCase())) return '';
  if (String(readiness.productionJobId || '')) return '';
  if (!String(readiness.projectId || '')) return '';
  const id = cardId || readiness.cardId || '';
  if (!id || !readiness.bootId) return '';
  return `${id}:${readiness.bootId}`;
}

/** The standalone controller the open project gets from the card's parts. */
export function controllerFromCardParts(currentProject, parts) {
  const nextOutputs = Array.isArray(parts?.outputs) ? parts.outputs : null;
  const installedController = parts?.devices?.standaloneController || parts?.standaloneController || {};
  const base = currentProject?.devices?.standaloneController || {};
  return {
    ...base,
    ...installedController,
    ...(installedController.controls ? {
      controls: {
        ...(base.controls || {}),
        ...installedController.controls,
        encoder: { ...(base.controls?.encoder || {}), ...(installedController.controls.encoder || {}) },
      },
    } : {}),
    ...(nextOutputs ? { outputs: nextOutputs } : {}),
    led: {
      ...(base.led || {}),
      ...(installedController.led || {}),
      ...(parts?.led || {}),
      // A card read reports its configured byte order, not a human color
      // observation. Keep any earlier proof only if it still matches.
      ...(parts?.colorOrder ? { colorOrder: parts.colorOrder } : {}),
      ...(nextOutputs ? {
        outputs: nextOutputs,
        pixels: nextOutputs.reduce((sum, output) => sum + Number(output.pixels || 0), 0),
      } : {}),
    },
  };
}

/** The whole project rebuilt from the card's parts, ready for replaceProject. */
export function projectFromCardParts(currentProject, parts, status = null) {
  return {
    ...currentProject,
    ...(status?.projectId ? { id: status.projectId } : {}),
    name: adoptedProjectName(currentProject?.name, status),
    ...(parts?.origin ? { origin: parts.origin } : {}),
    ...(Array.isArray(parts?.portRoles) ? { portRoles: parts.portRoles } : {}),
    layout: {
      ...(currentProject?.layout || {}),
      strips: parts.strips,
      starterPending: false,
      patchBoard: parts.patchBoard,
      wiring: parts.wiring,
    },
    devices: {
      ...(currentProject?.devices || {}),
      standaloneController: controllerFromCardParts(currentProject, parts),
    },
    // What the card is playing, not this window's last pick. Without this a
    // window that opens the card's version keeps showing its own look.
    ...(status?.currentPatternId && status.currentPatternId !== 'blackout' ? {
      pattern: patternFromCard(currentProject?.pattern, status.currentPatternId),
    } : {}),
  };
}

/** Recover only card-backed content, with empty Studio-only artwork and assets. */
export function recoveredProjectFromCardParts(parts, status) {
  return projectFromCardParts(createDefaultProject(), parts, status);
}

function patternFromCard(previous = {}, patternId) {
  if (previous?.activePatternId === patternId) return previous;
  // The palette belonged to the previous pick; the pattern's own default applies.
  const { palette, ...rest } = previous || {};
  return { ...rest, activePatternId: patternId };
}
