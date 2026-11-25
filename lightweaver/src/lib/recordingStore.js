// Where a recording plays from on the connected card, in the owner's words.
// Firmware 1.2.x reports it as capabilities.recordedMediaStore on /api/status:
// 'sd' (a microSD card), 'flash' (the card's own memory, LightweaverMedia.cpp)
// or 'none'. Older firmware and no card say nothing, and neither does this:
// naming a store the card does not have is worse than naming none.
export function recordingStoreWords(cardStatus) {
  const store = cardStatus?.capabilities?.recordedMediaStore;
  if (store === 'sd') return 'microSD';
  if (store === 'flash') return 'card memory';
  if (store === 'none') return 'no recording room on this card';
  return '';
}
