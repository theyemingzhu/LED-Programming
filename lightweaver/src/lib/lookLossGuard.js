// A save must not quietly wipe looks off the card.
//
// Live Studio 2738 on the real card (bench 1.2.6, 2026-11-23): after "Open
// installed project", a light count change sent a project holding only Fire,
// and five of the card's six looks were gone (todo/plans/practice-card-
// interruptions.md, L1). Whatever made the draft short — a stale browser
// draft, a card that read back short — the save is where it becomes loss.
//
// So before any project save, Studio compares the looks the card holds with
// the looks the save would send. Both lists use the card's own runtime ids, so
// no id mapping is needed. If the save would drop looks the owner did not
// remove themselves in this tab, the save stops (nothing is sent) and the
// owner chooses: keep the card's looks (re-read and merge), or replace anyway.
// An owner who deliberately deleted looks is never walled: each deliberate
// removal in this tab is counted and allowed.

const REMOVED_KEY = 'lw_looks_removed_by_owner_v1';
// Card entries that are not looks the owner made.
const NOT_LOOKS = new Set(['blackout', '']);

function sessionStore(storage) {
  if (storage) return storage;
  try { return globalThis.sessionStorage || null; } catch { return null; }
}

/** The owner removed `count` looks on purpose (Patterns delete, playlist removal). */
export function noteLooksRemovedByOwner(count = 1, { storage } = {}) {
  const store = sessionStore(storage);
  if (!store || !(Number(count) > 0)) return;
  try { store.setItem(REMOVED_KEY, String(looksRemovedByOwner({ storage: store }) + Math.trunc(Number(count)))); } catch { /* storage refused */ }
}

export function looksRemovedByOwner({ storage } = {}) {
  const store = sessionStore(storage);
  try { return Math.max(0, Math.trunc(Number(store?.getItem(REMOVED_KEY)) || 0)); } catch { return 0; }
}

export function clearLooksRemovedByOwner({ storage } = {}) {
  try { sessionStore(storage)?.removeItem(REMOVED_KEY); } catch { /* storage refused */ }
}

function ids(list) {
  return [...new Set((Array.isArray(list) ? list : [])
    .map(item => String(item?.id || '').trim())
    .filter(id => !NOT_LOOKS.has(id)))];
}

// A stock pattern on the card (its id is the pattern itself, e.g. Studio's
// automatic default look "aurora" before the owner saves any looks) is
// recreated by picking that pattern. Replacing it with the owner's first
// playlist is ordinary. The guard protects looks the owner made: combos,
// recordings, journeys, and anything saved under its own id.
const STOCK_MODES = new Set(['procedural', 'preset']);
function isStockCardPattern(pattern) {
  const id = String(pattern?.id || '').trim();
  return STOCK_MODES.has(String(pattern?.mode || '')) && id !== '' && id === String(pattern?.runtimePatternId || '').trim();
}

/**
 * What a save would drop. `cardPatterns` is the card's /api/patterns payload;
 * `runtimePackage` the package about to be sent.
 */
export function looksDroppedBySave(cardPatterns, runtimePackage) {
  const config = runtimePackage?.config || runtimePackage || {};
  const cardList = Array.isArray(cardPatterns?.patterns) ? cardPatterns.patterns : [];
  const cardIds = ids(cardList);
  const stock = new Set(cardList.filter(isStockCardPattern).map(pattern => String(pattern.id).trim()));
  const sentIds = ids(config.looks);
  const sent = new Set(sentIds);
  return { cardIds, sentIds, missing: cardIds.filter(id => !sent.has(id) && !stock.has(id)) };
}

/** True when the save must stop and ask. */
export function saveWouldLoseLooks(dropped, { removedByOwner = 0 } = {}) {
  return Boolean(dropped && dropped.missing.length > 0 && dropped.missing.length > removedByOwner);
}

export function lookLossMessage(dropped) {
  const have = dropped.cardIds.length;
  const send = dropped.sentIds.length;
  const lose = dropped.missing.length;
  return `Not saved: the card holds ${have} look${have === 1 ? '' : 's'}, and this save would send ${send}. `
    + `${lose} look${lose === 1 ? '' : 's'} would be removed from the card. Nothing was sent.`;
}

/**
 * Keep the card's looks: the looks (and their playlist entries) the card has
 * and the draft does not, added to the draft's controller. Everything the
 * owner changed in the draft stays. `cardController` is the controller
 * reconstructInstalledCardState builds from the card's own read-back.
 */
export function mergeCardLooksIntoController(controller = {}, cardController = {}) {
  const looks = Array.isArray(controller.looks) ? controller.looks : [];
  const playlist = Array.isArray(controller.playlist) ? controller.playlist : [];
  const haveLook = new Set(looks.map(look => String(look?.id || '')));
  const havePlaylist = new Set(playlist.map(entry => String(entry?.id || '')));
  const addedLooks = (Array.isArray(cardController.looks) ? cardController.looks : [])
    .filter(look => look?.id && !haveLook.has(String(look.id)));
  const addedPlaylist = (Array.isArray(cardController.playlist) ? cardController.playlist : [])
    .filter(entry => entry?.id && !havePlaylist.has(String(entry.id)));
  return {
    ...controller,
    looks: [...looks, ...addedLooks],
    playlist: [...playlist, ...addedPlaylist],
  };
}

/**
 * Read the card's looks and rebuild them as a Studio controller, using the
 * open project's own strips and sections as the skeleton. For "Keep the
 * card's looks".
 */
export async function readCardLooksController({ host, cardId = '', transport, skeleton = {}, readers = {} } = {}) {
  const live = readers.patterns && readers.zones ? null : await import('./cardLiveControl.js');
  const { reconstructInstalledCardState } = readers.reconstruct ? { reconstructInstalledCardState: readers.reconstruct } : await import('./cardProjectAdoption.js');
  const readPatterns = readers.patterns || (options => live.readCardPatternsFromCard(options));
  const readZones = readers.zones || (options => live.readCardZonesFromCard(options));
  const options = { host, expectedCardId: cardId, transport, timeoutMs: 6000 };
  const [patterns, zones] = await Promise.all([readPatterns(options), readZones(options).catch(() => null)]);
  const rebuilt = reconstructInstalledCardState({ skeleton, patterns, zones, cardId });
  return rebuilt?.devices?.standaloneController || {};
}
