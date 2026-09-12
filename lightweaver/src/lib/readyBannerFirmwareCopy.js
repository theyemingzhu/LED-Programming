// Card Home's ready banner (setup-card-ready) only ever renders for a card
// that is already connected and already matches the open project — a card
// too old to even report that agreement never reaches this banner: it is
// caught earlier, as the connect phase's own blocker ('firmware'), driven by
// cardLifecycle.state === 'update-required' / cardLink.reason ===
// 'firmware-too-old' (see connectBlockers in setupJourney.js). So every
// firmware-actionable state this banner can see is a healthy, working card
// with a newer signed release sitting on the server — maintenance, not a
// blocker. classifyFooterFirmwareStatus already tells the two apart by name:
// 'update-available' names an exact installed and available build (the
// compatible-but-older case this ticket is about); 'legacy' has no numbered
// build to report yet, so it keeps the original, more insistent wording
// until that class of card is separately audited.
//
// This is intentionally the ONLY place that turns a footer firmware state
// into ready-banner prose. Do not add a second copy of this decision inline
// in a screen component — read this instead.
export function readyBannerFirmwareCopy(firmwareStatus) {
  if (!firmwareStatus || firmwareStatus.actionable !== true) return null;
  if (
    firmwareStatus.state === 'update-available'
    && Number.isSafeInteger(firmwareStatus.installedBuildNumber)
    && Number.isSafeInteger(firmwareStatus.releaseBuildNumber)
  ) {
    return {
      required: false,
      heading: 'A newer card release is available',
      body: `Your lights keep working on ${firmwareStatus.installedBuildNumber}. Update to ${firmwareStatus.releaseBuildNumber} when convenient.`,
    };
  }
  return {
    required: true,
    heading: 'This card’s software is behind',
    body: 'Update the card software before relying on it.',
  };
}
