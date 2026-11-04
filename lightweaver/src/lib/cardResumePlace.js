// Navigation preference only: never card identity or command authority.
const PREFIX = 'lw_card_resume_place_v1:';
const idKey = cardId => typeof cardId === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9:_-]{0,95}$/.test(cardId) ? `${PREFIX}${cardId}` : '';
const browserStorage = () => { try { return globalThis.localStorage; } catch { return null; } };
function safePlace(hash) {
  if (typeof hash !== 'string' || hash.length > 1024 || !hash.startsWith('#')) return '';
  const input = new URLSearchParams(hash.slice(1));
  const screen = input.get('screen');
  if (!['card', 'pattern', 'layout', 'playlist'].includes(screen) || input.has('task') || input.has('intent')) return '';
  if (screen === 'card' && input.has('section') && input.get('section') !== 'overview') return '';
  if (screen === 'layout' && input.has('mode') && input.get('mode') !== 'draw') return '';
  const result = new URLSearchParams({ screen });
  if (screen === 'card') result.set('section', 'overview');
  if (screen === 'pattern') {
    const target = input.get('target');
    const project = input.get('project');
    const generation = input.get('generation');
    if (target && /^[a-zA-Z0-9][a-zA-Z0-9:_.-]{0,127}$/.test(target)
      && project && /^[a-zA-Z0-9][a-zA-Z0-9:_.-]{0,127}$/.test(project)
      && /^(0|[1-9][0-9]{0,15})$/.test(generation || '') && Number.isSafeInteger(Number(generation))) {
      result.set('target', target);
      result.set('project', project);
      result.set('generation', generation);
    }
  }
  if (screen === 'layout' && input.get('mode') === 'draw') {
    result.set('mode', 'draw');
    if (input.get('panel') === 'specs') result.set('panel', 'specs');
  }
  return `#${result.toString()}`;
}
export function readCardResumePlace(cardId, storage = browserStorage()) {
  const key = idKey(cardId);
  if (!key) return '';
  try { return safePlace(storage?.getItem(key)); } catch { return ''; }
}
export function rememberCardResumePlace(cardId, hash, storage = browserStorage()) {
  const key = idKey(cardId);
  const place = safePlace(hash);
  if (!key || !place || !storage?.setItem) return false;
  try { storage.setItem(key, place); return true; } catch { return false; }
}
export function chooseCardResumePlace({ initialHash, currentHash, entryHash, cardId, storage, identityVerified = false } = {}) {
  if (identityVerified !== true || !['', '#'].includes(initialHash)
    || typeof entryHash !== 'string' || currentHash !== entryHash) return '';
  return readCardResumePlace(cardId, storage);
}
