import { normalizeClientSections, normalizeClientLibrary, buildClientLibraryInstallRequest, verifyClientLibraryReadback } from './clientLibraryInstall.js';
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
      if (path === '/api/client-library') {
        const gap = cardBridgeFeatureGap('client-library');
        if (gap) throw new Error('Your lights need an update before Library patterns can be added.');
        return sendCardBridgeRequest('client-library', { method: options.method || 'GET', ...(options.body ? { body: options.body } : {}) }, { host });
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
    let sections = []; let sectionsError = "";
    try { sections = normalizeClientSections(zones); } catch (error) { sectionsError = error.message; }
    let library = null; let libraryError = '';
    if (nextStatus.capabilities?.clientLibrary?.version === 1) {
      try { library = await session.readLibrary(); } catch (error) { libraryError = error.message; }
    }
    return { status: nextStatus, controls, sections, sectionsError, library, libraryError, layout: library?.layout || null,
      libraryInstallAvailable: !sectionsError && Boolean(library?.canInstall) && library.remaining > 0 };
  };
  session.readLibrary = async () => normalizeClientLibrary(await request('/api/client-library'), identity);
  session.installLibraryLook = async draft => {
    const currentStatus = validateClientStatus(await request('/api/status'), identity);
    if (currentStatus.capabilities?.clientLibrary?.version !== 1) throw new Error('Your lights need an update before Library patterns can be added.');
    const library = await session.readLibrary();
    if (!draft.layoutRevision || draft.layoutRevision !== library.layoutRevision) throw new Error('The artwork map changed. Refresh Library before saving.');
    if (!library.canInstall || library.remaining < 1) throw new Error(library.remaining < 1 ? 'The card is full.' : 'This current look cannot safely accept Library changes.');
    const body = buildClientLibraryInstallRequest({ ...draft, status: { ...currentStatus,
      capabilities: { ...currentStatus.capabilities, clientLibrary: { version: 1, supportedPresetIds: library.supportedPresetIds } } },
      currentLookId: library.currentLookId, libraryRevision: library.revision, sections: library.sections });
    let receipt;
    try { receipt = await session.write('/api/client-library', body); }
    catch (error) { error.delivery = 'unknown'; error.layoutRevision = draft.layoutRevision; throw error; }
    try {
      const [readback, patterns] = await Promise.all([session.readLibrary(), request('/api/patterns')]);
      return verifyClientLibraryReadback(receipt, readback, patterns, identity, draft);
    } catch (error) {
      error.savedPatternId = receipt.installedPatternId; error.savedCardId = identity.cardId; error.cardId = identity.cardId;
      error.layoutRevision = receipt.layoutRevision; error.delivery = 'saved-unverified';
      throw error;
    }
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
