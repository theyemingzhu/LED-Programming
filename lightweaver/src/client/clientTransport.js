import { normalizeClientPattern } from './clientPattern.js';
import { connectCardTransport } from '../lib/cardTransport.js';
import { acquireCardBridgeFromGesture, adoptDiscoveredCardBridgeIdentity, getCardBridgeState, sendCardBridgeRequest, cardBridgeFeatureGap } from '../lib/cardBridge.js';
import { normalizeCardCustomerControls } from '../lib/cardCustomerControls.js';
import { normalizeClientPlaylist, validateClientStatus } from './clientModel.js';

const bridgeTypes = { '/api/status': 'status', '/api/zones': 'zones', '/api/patterns': 'patterns', '/api/control': 'control' };

export async function connectClient(host, { bridge = false, expectedCardId = '' } = {}) {
  let request;
  if (bridge) {
    const acquisition = acquireCardBridgeFromGesture(host, { acceptDiscovered: true });
    await acquisition.ready;
    const discovered = getCardBridgeState();
    const discoveredId = discovered.card?.id || discovered.discoveredCard?.id;
    if (expectedCardId && discoveredId !== expectedCardId) throw new Error('A different card answered. Your paired lights have not been changed.');
    if (!discovered.identityVerified) await adoptDiscoveredCardBridgeIdentity(host);
    request = (path, options = {}) => {
      if (path.startsWith('/api/client-pattern')) {
        const patternId = new URL(path, 'http://lightweaver.local').searchParams.get('patternId');
        return sendCardBridgeRequest('client-pattern', { method: options.method || 'GET', ...(options.body ? { body: options.body } : { patternId }) }, { host });
      }
      if (path === '/api/client-playlist') {
        const gap = cardBridgeFeatureGap('client-playlist');
        if (gap) throw new Error('Your lights need an update before playlists can be edited here.');
        return sendCardBridgeRequest('client-playlist', { method: options.method || 'GET', ...(options.body ? { body: options.body } : {}) }, { host });
      }
      const type = bridgeTypes[path];
      if (!type) throw new Error('Unsupported player request.');
      return sendCardBridgeRequest(type, options.body || {}, { host });
    };
  } else {
    const authority = await connectCardTransport({ host, expectedCardId });
    if (!authority.connected) {
      throw new Error(authority.reason === 'wrong-card'
        ? 'A different card answered. Your paired lights have not been changed.'
        : 'Your lights could not be reached. Join their Wi-Fi and try again.');
    }
    request = (path, options) => authority.request(path, { signal: AbortSignal.timeout(5000), ...options });
  }
  const status = validateClientStatus(await request('/api/status'), { cardId: expectedCardId });
  const identity = { cardId: status.cardId, bootId: status.bootId };
  const session = { host, identity, request, mode: bridge ? 'Card page' : 'Local network', status };
  session.read = async () => {
    const nextStatus = validateClientStatus(await request('/api/status'), identity);
    const [zones, patterns] = await Promise.all([request('/api/zones'), request('/api/patterns')]);
    const controls = normalizeCardCustomerControls(zones, patterns);
    const reportedId = patterns.currentId || zones.zones?.[0]?.patternId || '';
    controls.activePatternId = reportedId;
    return { status: nextStatus, controls };
  };
  session.readPattern = async patternId => normalizeClientPattern(await request(`/api/client-pattern?patternId=${encodeURIComponent(patternId)}`), identity.cardId, patternId);
  session.readPlaylist = async patterns => normalizeClientPlaylist(await request('/api/client-playlist'), patterns, identity.cardId);
  session.write = async (path, body) => {
    // Every mutation is bound to this exact live card and boot, including bridge requests.
    validateClientStatus(await request('/api/status'), identity);
    const result = await request(path, { method: 'POST', body });
    if (result?.ok !== true || result.cardId !== identity.cardId) throw new Error(result?.error || 'The card did not confirm that change.');
    return result;
  };
  return session;
}
