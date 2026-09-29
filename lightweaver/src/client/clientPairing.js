import { isLocalCardHost, normalizeCardHost } from '../lib/cardConnection.js';

export const CLIENT_PAIRING_KEY = 'lw_client_pairing_v1';
const CARD_ID = /^lw-[A-Za-z0-9][A-Za-z0-9._:-]{0,60}$/;

export function normalizeClientPairing(value) {
  const host = normalizeCardHost(value?.host || '');
  const cardId = String(value?.cardId || '');
  if (!host || !isLocalCardHost(host) || !CARD_ID.test(cardId)) throw new Error('This player link is incomplete. Ask the installation owner for a new link.');
  return { host, cardId, name: String(value?.name || '').trim().slice(0, 96) };
}

export function buildClientPlayerLink(pairing) {
  const target = normalizeClientPairing(pairing);
  const fragment = new URLSearchParams({ host: target.host, cardId: target.cardId });
  if (target.name) fragment.set('name', target.name);
  return `https://light.mandalacodes.com/#${fragment}`;
}

export function parseClientPlayerLink(url) {
  const fragment = new URLSearchParams(new URL(url, 'https://light.mandalacodes.com').hash.slice(1));
  if (!fragment.has('host') && !fragment.has('cardId')) return null;
  return normalizeClientPairing({ host: fragment.get('host'), cardId: fragment.get('cardId'), name: fragment.get('name') });
}

export function readClientTarget(url, storage) {
  const shared = parseClientPlayerLink(url);
  if (shared) return { ...shared, source: 'shared' };
  try {
    const saved = JSON.parse(storage?.getItem(CLIENT_PAIRING_KEY) || 'null');
    if (saved) return { ...normalizeClientPairing(saved), source: 'saved' };
  } catch { /* Invalid saved state cannot authorize an unexpected target. */ }
  return { host: 'lightweaver.local', cardId: '', name: '', source: 'discovery' };
}

export function saveClientPairing(pairing, storage) {
  const target = normalizeClientPairing(pairing);
  try { storage?.setItem(CLIENT_PAIRING_KEY, JSON.stringify(target)); } catch { /* Playback works with restricted browser storage. */ }
  return target;
}
