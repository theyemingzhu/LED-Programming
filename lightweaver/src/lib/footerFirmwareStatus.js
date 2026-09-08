const BUILD_ID = /^[0-9a-f]{40}$/;

function validBuildNumber(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function validRelease(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  if (!validBuildNumber(value.buildNumber) || typeof value.buildId !== 'string' || !BUILD_ID.test(value.buildId)) return null;
  return { buildNumber: value.buildNumber, buildId: value.buildId };
}

function installedName(card) {
  return card.buildId === 'dev' ? 'dev' : (card.buildNumber === null ? 'legacy' : String(card.buildNumber));
}

function validInstalledCard(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  if (typeof value.buildId !== 'string') return null;
  // Bench USB flashes compile buildId "dev" / buildNumber 0 on purpose so they
  // can never be mistaken for a signed release. That is a known identity, not
  // a malformed one — Find Connected Card already prints it as "Build dev".
  if (/^dev$/i.test(value.buildId.trim())) {
    return { buildNumber: null, buildId: 'dev' };
  }
  if (!BUILD_ID.test(value.buildId)) return null;
  if (value.buildNumber === undefined || value.buildNumber === null || value.buildNumber === 0) {
    return { buildNumber: null, buildId: value.buildId };
  }
  if (!validBuildNumber(value.buildNumber)) return null;
  return { buildNumber: value.buildNumber, buildId: value.buildId };
}

function result(state, installedBuildNumber, releaseBuildNumber, label, actionable) {
  return { state, installedBuildNumber, releaseBuildNumber, label, actionable };
}

// This only accepts identities that can prove an exact revision. The footer
// must never turn a loosely formatted card response into a firmware action.
export function classifyFooterFirmwareStatus(installed, verifiedRelease, { checking = false } = {}) {
  const release = validRelease(verifiedRelease);
  if (installed?.verification === 'reconnect-needed') {
    return result('reconnect-needed', null, release?.buildNumber ?? null, 'Reconnect card to verify firmware', false);
  }
  if (installed === null || installed === undefined) {
    // A card that is mid-restart has not stopped being known — it is simply not
    // answering this second. Saying "Card firmware unknown" through every reboot
    // (which the light test performs on purpose) reads as something going wrong
    // at exactly the moment the owner is watching their strip.
    if (checking) {
      return release
        ? result('checking', null, release.buildNumber, `Checking card firmware · latest ${release.buildNumber}`, false)
        : result('checking', null, null, 'Checking card firmware', false);
    }
    return release
      ? result('disconnected', null, release.buildNumber, `Card firmware unknown · latest ${release.buildNumber}`, false)
      : result('disconnected', null, null, 'Card firmware unknown · latest unknown', false);
  }

  const card = validInstalledCard(installed);
  if (!card) {
    return result('release-unknown', null, release?.buildNumber ?? null, `Card firmware unknown · latest ${release?.buildNumber ?? 'unknown'}`, false);
  }

  if (!release) {
    return result(
      'release-unknown',
      card.buildNumber,
      null,
      `Card firmware ${installedName(card)} · latest unknown`,
      false,
    );
  }

  // USB can recover the exact signed revision from the application image even
  // when that older image predates the embedded numeric build. Revision
  // equality is still exact release evidence; use the release's known number
  // for the owner-facing label without claiming USB read that number.
  if (card.buildNumber === null && card.buildId === release.buildId) {
    return result('current', card.buildNumber, release.buildNumber, `Card firmware ${release.buildNumber} ✓`, false);
  }

  if (card.buildNumber === null) {
    return result('legacy', null, release.buildNumber, `Card firmware ${installedName(card)} → ${release.buildNumber}`, true);
  }
  if (card.buildNumber > release.buildNumber) {
    return result('development-build', card.buildNumber, release.buildNumber, `Card firmware ${card.buildNumber} · latest ${release.buildNumber}`, false);
  }
  if (card.buildNumber < release.buildNumber || card.buildId !== release.buildId) {
    return result('update-available', card.buildNumber, release.buildNumber, `Card firmware ${card.buildNumber} → ${release.buildNumber}`, true);
  }
  return result('current', card.buildNumber, release.buildNumber, `Card firmware ${card.buildNumber} ✓`, false);
}

// Wi-Fi transport is the live answer. USB Find Card is the answer when that
// transport is down — the install panel already knows this identity, and the
// footer must not call it unknown.
export function resolveFooterFirmwareInstalled({
  transportConnected = false,
  connectedCard = null,
  usbInspectedFirmware = null,
} = {}) {
  if (usbInspectedFirmware?.verification === 'reconnect-needed') return usbInspectedFirmware;
  if (usbInspectedFirmware?.verification === 'restarting') {
    if (!transportConnected || !connectedCard) return null;
    const expectedCardId = String(usbInspectedFirmware.cardId || '').trim().toLowerCase();
    const connectedCardId = String(connectedCard.id || connectedCard.cardId || '').trim().toLowerCase();
    const expectedBuildId = String(usbInspectedFirmware.expectedBuildId || '').trim();
    const connectedBuildId = String(connectedCard.buildId || '').trim();
    if (expectedCardId && connectedCardId === expectedCardId && connectedBuildId !== expectedBuildId) return null;
  }
  if (transportConnected) return connectedCard || null;
  if (usbInspectedFirmware?.verification === 'restarting') return null;
  return usbInspectedFirmware || null;
}
