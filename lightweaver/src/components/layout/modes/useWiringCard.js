import { useEffect, useReducer, useSyncExternalStore } from 'react';
import { confirmedBoardProfile, selectBoardLedPins } from '../../../lib/boardLedPins.js';
import { BOARD_LIBRARY_CHANGED, BOARD_PROFILE_STORAGE } from '../../../lib/boardProfiles.js';
import { readCardOutputCapabilities } from '../../../lib/cardHardwareContract.js';
import { getCardLinkState, subscribeCardLink } from '../../../lib/cardLink.js';
import { classifyCardReadiness } from '../../../lib/cardReadiness.js';
import { CARD_HARDWARE_CAPABILITIES } from '../../../lib/cardRuntimeContract.js';

export function useWiringCard() {
  const cardLink = useSyncExternalStore(subscribeCardLink, getCardLinkState, getCardLinkState);
  const [, refreshBoard] = useReducer(revision => revision + 1, 0);
  useEffect(() => {
    const onStorage = event => {
      if (event.key === BOARD_PROFILE_STORAGE || event.key === null) refreshBoard();
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener(BOARD_LIBRARY_CHANGED, refreshBoard);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(BOARD_LIBRARY_CHANGED, refreshBoard);
    };
  }, []);
  const observedCard = cardLink.readiness || cardLink.card;
  const state = cardLink.readiness
    ? classifyCardReadiness(cardLink.readiness, { expectedCard: cardLink.expectedCard }).state
    : (cardLink.cardBlank === true ? 'blank' : '');
  const hasLiveCard = Boolean(observedCard && ['connected', 'blank'].includes(state));
  const capacity = readCardOutputCapabilities(observedCard);
  const cardId = hasLiveCard ? (cardLink.readiness?.cardId || cardLink.card?.id) : '';
  const profile = confirmedBoardProfile(cardId);
  const supportedPins = (hasLiveCard && capacity.outputPins) || CARD_HARDWARE_CAPABILITIES.supportedOutputPins;
  return {
    state,
    profile,
    supportedPins,
    availablePins: selectBoardLedPins({ profile, firmwarePins: supportedPins }),
    maxOutputs: hasLiveCard ? capacity.maxOutputs : CARD_HARDWARE_CAPABILITIES.maxOutputs,
    cardId,
    capacity: hasLiveCard ? capacity : null,
  };
}
