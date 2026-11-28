import { CardPushError, cardConfigStructuralWiringChangedFromInfo, pushConfigToCard, readCardStatusEnvelope } from './cardPushClient.js';
import { cardZoneRangesMatch, readCardZonesFromCard } from './cardLiveControl.js';
import { prepareCardDeployment, verifyCardPostSaveState, waitForCardRestart } from './cardDeployment.js';
import { getCardLinkState, noteCardRestartPlanned, noteCardRestartSettled } from './cardLink.js';
import { installRecordedMediaForRuntimePackage } from './cardRecordedMedia.js';

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const previewSectionSyncs = new Map();

function uniqueZoneIds(zoneIds = []) {
  return [...new Set(zoneIds.map(String).filter(Boolean))];
}

function previewSectionSyncKey(host, runtimePackage) {
  const config = runtimePackage?.config || runtimePackage || {};
  const topology = {
    piece: {
      id: String(config?.piece?.id || ''),
      name: String(config?.piece?.name || ''),
    },
    led: {
      pixels: Number(config?.led?.pixels) || 0,
      outputs: Array.isArray(config?.led?.outputs) ? config.led.outputs : [],
    },
    zones: Array.isArray(config?.zones) ? config.zones : [],
  };
  return `${String(host || '').trim().toLowerCase()}|${JSON.stringify(topology)}`;
}

export function missingCardZoneIds(zonesPayload = {}, requiredZoneIds = []) {
  const required = uniqueZoneIds(requiredZoneIds);
  if (!Array.isArray(zonesPayload?.zones)) return required;
  const available = new Set(
    zonesPayload.zones
      .map(zone => String(zone?.id || ''))
      .filter(Boolean),
  );
  return required.filter(zoneId => !available.has(zoneId));
}

export function runtimeZoneIds(runtimePackage = {}) {
  const zones = (runtimePackage.config || runtimePackage)?.zones;
  return Array.isArray(zones)
    ? zones.map(zone => String(zone?.id || '')).filter(Boolean)
    : [];
}

export async function waitForCardZones({
  host,
  transport,
  requiredZoneIds = [],
  readZones = readCardZonesFromCard,
  sleep = delay,
  attempts = 20,
  intervalMs = 600,
} = {}) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (attempt > 0) await sleep(intervalMs);
    try {
      const payload = await readZones({ host, transport, timeoutMs: 900 });
      if (
        Array.isArray(payload?.zones) &&
        missingCardZoneIds(payload, requiredZoneIds).length === 0
      ) {
        return payload;
      }
    } catch {
      // The card and its page bridge may both disappear briefly during reboot.
    }
  }
  throw new CardPushError(
    'zones-missing',
    'Lightweaver saved the setup, but the card did not expose the required sections after reconnecting.',
  );
}

export async function syncRuntimePackageToCard({
  host,
  transport,
  runtimePackage,
  requiredZoneIds = runtimeZoneIds(runtimePackage),
  pushConfig = pushConfigToCard,
  readZones = readCardZonesFromCard,
  sleep = delay,
  expectedCardId = '',
  verifyPostSave = verifyCardPostSaveState,
  installMedia = installRecordedMediaForRuntimePackage,
  readMediaStatus = readCardStatusEnvelope,
  allowLayoutChange = false,
  allowProjectChange = false,
  mediaInstall = null,
  awaitRestart = waitForCardRestart,
} = {}) {
  let mediaReceipt = null;
  const bootBeforeSave = (() => { try { return getCardLinkState().validatedBootId || ''; } catch { return ''; } })();
  if (runtimePackage?.mediaAssets?.length) {
    if (!mediaInstall) throw new CardPushError(
      'recording-media-required',
      'This Playlist contains recordings. Install it from Playlist so Studio can verify and send the exact media first.',
    );
    mediaReceipt = await installMedia(runtimePackage, {
      host, transport, ...mediaInstall,
    });
    if (mediaInstall.signal?.aborted) throw new CardPushError('cancelled', 'Recording install was canceled before configuration changed.');
    const fresh = await readMediaStatus({ host, transport });
    if (fresh.cardId !== mediaReceipt.cardId || fresh.bootId !== mediaReceipt.bootId
      || String(fresh.projectHead || '') !== mediaReceipt.projectHead) {
      throw new CardPushError('card-changed', 'The card or installed project changed after media upload. Playlist configuration was not sent.');
    }
  }
  const response = await pushConfig(runtimePackage, {
    host,
    transport,
    timeoutMs: 6000,
    reboot: 'if-needed',
    allowLayoutChange,
    allowProjectChange,
    mediaVerified: Boolean(mediaReceipt),
  });
  if (response?.state === 'staged') {
    throw new CardPushError(
      'wiring-test-required',
      'The card kept this wiring change staged and did not install it. Open Test & Install, run the physical light check, and confirm the wiring there.',
    );
  }
  if (response?.rebooting && awaitRestart) {
    // Every accepted save restarts the card (about 14 s on the real card).
    // Reading it back before it returns failed the save that had landed.
    noteCardRestartPlanned();
    try {
      await awaitRestart({ readStatus: () => readMediaStatus({ host, transport }), fromBootId: bootBeforeSave });
    } finally {
      noteCardRestartSettled();
    }
  }
  let verifiedZones = null;
  if (requiredZoneIds.length) {
    const exactCardId = String(expectedCardId || response?.cardId || '').trim();
    if (exactCardId && verifyPostSave) {
      const config = runtimePackage?.config || runtimePackage || {};
      const prepared = prepareCardDeployment({
        ...config,
        projectId: config?.piece?.id || config?.projectId,
        projectName: config?.piece?.name || config?.projectName,
        projectRevision: config?.projectRevision,
        projectFingerprint: config?.projectFingerprint,
        standaloneController: config,
      }, { cardId: exactCardId });
      const verified = await verifyPostSave({
        prepared,
        host,
        expectedCardId: exactCardId,
        requiredPatternIds: (config.looks || config.patterns || []).map(item => item?.id).filter(Boolean),
        requiredZoneIds,
      });
      verifiedZones = verified.zones;
    } else {
      verifiedZones = await waitForCardZones({ host, transport, requiredZoneIds, readZones, sleep });
    }
  }
  return {
    ...(response && typeof response === 'object' ? response : { ok: true }),
    verifiedZones,
  };
}

export async function ensureCardSectionsForPreview({
  host,
  transport,
  requiredZoneIds = [],
  runtimePackage,
  pushConfig = pushConfigToCard,
  readZones = readCardZonesFromCard,
  verifyInstalledWiring = false,
  readWiring = readCardStatusEnvelope,
  sleep = delay,
  // Both default false so the normal preview auto-sync (reconciling zones the
  // real design already declares) never silently pushes past the wiring/
  // project guard. Test-strip mode is the deliberate exception — it passes
  // these true because it always changes the output layout on purpose.
  allowLayoutChange = false,
  allowProjectChange = false,
} = {}) {
  if (!requiredZoneIds.length) return { synced: false, zones: null };
  const outputs = (runtimePackage?.config || runtimePackage)?.led?.outputs;
  if (verifyInstalledWiring && outputs?.some(output => output.segments?.length > 1)) {
    // Zone IDs can survive a direction edit. Compare the applied wiring
    // before sending either a temporary pattern or a configuration write.
    const wiring = await readWiring({ host, transport, timeoutMs: 1200 });
    if (cardConfigStructuralWiringChangedFromInfo(wiring, runtimePackage)) {
      throw new CardPushError('section-layout-mismatch',
        'Test & Install the updated strip wiring before previewing this mix on the card.');
    }
  }
  const zones = await readZones({ host, transport, timeoutMs: 900 });
  const missing = missingCardZoneIds(zones, requiredZoneIds);
  if (!missing.length) return { synced: false, zones };

  const syncKey = previewSectionSyncKey(host, runtimePackage);
  let pendingSync = previewSectionSyncs.get(syncKey);
  if (!pendingSync) {
    pendingSync = syncRuntimePackageToCard({
      host,
      transport,
      runtimePackage,
      requiredZoneIds: runtimeZoneIds(runtimePackage),
      pushConfig,
      readZones,
      sleep,
      allowLayoutChange,
      allowProjectChange,
    });
    previewSectionSyncs.set(syncKey, pendingSync);
    void pendingSync.finally(() => {
      if (previewSectionSyncs.get(syncKey) === pendingSync) previewSectionSyncs.delete(syncKey);
    }).catch(() => {});
  }
  const response = await pendingSync;
  return { synced: true, zones: response.verifiedZones, response };
}

// What the card holds against what the project has. The Patterns screen prints
// this as its one status line about sections, so the owner reads a fact ("Card
// holds Ring 1, Ring 2") instead of guessing why a section preview played on
// the whole piece. `sectionTargets` is the project's list (deriveSectionTargets)
// and `zonesPayload` is the card's own GET /api/zones snapshot; null means the
// card has not been read yet, and the summary says nothing rather than a guess.
export function cardSectionDifference(sectionTargets = [], zonesPayload = null) {
  const sections = (Array.isArray(sectionTargets) ? sectionTargets : [])
    .filter(target => target?.kind === 'section')
    .map(target => ({ zoneId: String(target.zoneId || ''), label: String(target.label || target.zoneId || ''), ...(target.ranges ? { ranges: target.ranges } : {}) }))
    .filter(section => section.zoneId);
  if (!Array.isArray(zonesPayload?.zones)) {
    return { known: false, held: [], missing: sections, extra: [] };
  }
  const cardZones = zonesPayload.zones
    .map(zone => ({ zoneId: String(zone?.id || ''), label: String(zone?.label || zone?.id || ''), ranges: zone?.ranges }))
    .filter(zone => zone.zoneId);
  const cardById = new Map(cardZones.map(zone => [zone.zoneId, zone]));
  const projectIds = new Set(sections.map(section => section.zoneId));
  const matches = section => cardById.has(section.zoneId)
    && (!section.ranges || cardZoneRangesMatch(section.ranges, cardById.get(section.zoneId).ranges));
  return {
    known: true,
    held: sections.filter(matches),
    missing: sections.filter(section => !matches(section)),
    extra: cardZones.filter(zone => !projectIds.has(zone.zoneId)),
  };
}

export function cardSectionSummary(sectionTargets = [], zonesPayload = null) {
  const difference = cardSectionDifference(sectionTargets, zonesPayload);
  if (!difference.known || (!difference.missing.length && !difference.extra.length)) return '';
  if (!difference.missing.length) {
    return difference.extra.length === 1
      ? 'Card has one extra section; Save to card to send yours'
      : `Card has ${difference.extra.length} extra sections; Save to card to send yours`;
  }
  const heldNames = difference.held.map(section => section.label);
  const heldText = heldNames.length
    ? heldNames.join(', ')
    : (zonesPayload.zones.length === 1 ? 'one section' : `${zonesPayload.zones.length} sections`);
  return `Card holds ${heldText}; Save to card to send yours`;
}
