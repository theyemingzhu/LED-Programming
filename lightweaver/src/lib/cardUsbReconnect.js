import { rememberVerifiedPairedCardHost } from './cardConnection.js';
import { usableCardStationIp } from './cardPostFlashNetwork.js';
import { openUsbWifiSession } from './usbWifiProvisioning.js';

// A previously installed card can reveal its current DHCP address over the
// already authenticated USB hello. This never sends Wi-Fi credentials or a
// firmware command. The caller opens the card page in a separate user click.
export async function findPairedCardUsbAddress({ port, pairedCard, openSession = openUsbWifiSession } = {}) {
  if (!pairedCard?.id || !pairedCard.firmwareVersion || !pairedCard.buildId
    || !Number.isSafeInteger(pairedCard.buildNumber) || pairedCard.buildNumber <= 0) {
    throw new Error('This browser has no exact installed-card record. Inspect the card over USB first.');
  }
  const session = await openSession({ port, expected: {
    cardId: pairedCard.id,
    firmwareVersion: pairedCard.firmwareVersion,
    buildId: pairedCard.buildId,
    buildNumber: pairedCard.buildNumber,
  }, helloReadyTimeoutMs: 6_000 });
  try {
    const identity = session.identity;
    const address = identity?.stationIp || '';
    if (identity?.cardId !== pairedCard.id || identity?.firmwareVersion !== pairedCard.firmwareVersion
      || identity?.buildId !== pairedCard.buildId || identity?.buildNumber !== pairedCard.buildNumber) {
      throw new Error('USB answered from a different card or firmware build.');
    }
    if (!usableCardStationIp(address)) {
      throw new Error('The exact card answered over USB but has no home Wi-Fi address yet. Check its Wi-Fi connection and try again.');
    }
    if (!rememberVerifiedPairedCardHost(address, identity.cardId)) {
      throw new Error('The saved card changed while USB was connecting. Select the exact card again.');
    }
    return address;
  } finally {
    await session.close();
  }
}
