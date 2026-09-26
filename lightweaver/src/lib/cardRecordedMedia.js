import { sendCardBridgeRequest } from './cardBridge.js';
import { readCardStatusEnvelope, readCardProjectEvidence } from './cardPushClient.js';
import { connectCardTransport, getActiveCardTransportAuthority } from './cardTransport.js';
import { readRecordedMedia } from './recordedSequenceMedia.js';
import { verifyStoredSequenceAsset, MAX_STORED_SEQUENCE_BYTES } from './recordedSequenceAsset.js';
import { canonicalSceneExpressionBakeJson, verifySceneExpressionFlowBake } from './sceneExpressionRecording.js';
import { hashPatternLabBakePhysicalOrder } from './lwseqBake.js';

const CHUNK_BYTES = 2048;
const SHA_FILE = /^\/sequences\/([a-f0-9]{64})\.lwseq$/;

function cancelled(signal) {
  if (!signal?.aborted) return;
  const error = new Error('Recorded media install was canceled before changing the card configuration.');
  error.name = 'AbortError';
  throw error;
}

function assertAssetMatchesConfig(asset, config) {
  const match = SHA_FILE.exec(asset?.file || '');
  if (!match || match[1] !== asset?.manifest?.lwseqSha256
    || asset.byteLength < 64 || asset.byteLength > MAX_STORED_SEQUENCE_BYTES
    || asset.mediaRef?.sha256 !== match[1] || asset.mediaRef?.byteLength !== asset.byteLength) {
    throw new Error(`Recording “${asset?.label || asset?.id || ''}” has invalid or missing media metadata.`);
  }
  const outputLayout = (config?.led?.outputs || []).map(output => ({
    id: output.id, pin: Number(output.pin), pixels: Number(output.pixels),
  }));
  const assetLayout = (asset.outputs || []).map(output => ({
    id: output.id, pin: Number(output.pin), pixels: Number(output.pixels),
  }));
  if (JSON.stringify(assetLayout) !== JSON.stringify(outputLayout)) {
    throw new Error(`Recording “${asset.label}” was made for different physical output wiring. Record it again after confirming this layout.`);
  }
  const look = (config.looks || []).find(item => item.id === asset.id || item.file === asset.file);
  if (!look || look.mode !== 'sequence' || look.file !== asset.file
    || look.bytes !== asset.byteLength || look.sha256 !== match[1] || look.brightness !== 1) {
    throw new Error(`Recording “${asset.label}” does not match the Playlist playback configuration.`);
  }
}

export async function assertRecordedMediaCurrentLayout(asset, project, bytes) {
  if (!project?.compiledWiring?.ok || !project?.wiring) {
    throw new Error('Current verified physical wiring is required before installing a recording.');
  }
  if (asset.manifest?.format === 'lightweaver-flow-lwseq-sidecar') {
    const sidecar = asset.manifest;
    const result = await verifySceneExpressionFlowBake({
      bytes, sidecar, sidecarJson: canonicalSceneExpressionBakeJson(sidecar),
    }, {
      scene: sidecar.scene, strips: project.strips, patchBoard: project.patchBoard,
      wiring: project.wiring, compiledWiring: project.compiledWiring,
      sectionFamilies: project.sectionFamilies, layoutLayerGroups: project.layoutLayerGroups,
      palette: project.palette, hidden: project.hidden, fps: sidecar.fps,
    });
    if (!result.ok) throw new Error(`Recording “${asset.label}” no longer matches this project's artwork or wiring (${result.reason}). Record it again.`);
    return true;
  }
  if (asset.manifest?.format === 'lightweaver-lwseq-sidecar') {
    const physicalHash = await hashPatternLabBakePhysicalOrder({
      recipe: asset.manifest.recipe, strips: project.strips,
      groups: project.layoutLayerGroups, wiring: project.wiring,
      compiledWiring: project.compiledWiring, sectionTargets: project.sectionTargets,
      hidden: project.hidden, fps: asset.manifest.fps,
      render: Object.fromEntries([
        ['bpm', project.bpm], ['gammaEnabled', project.gammaEnabled],
        ['gammaValue', project.gammaValue], ['symSettings', project.symSettings],
      ].filter(([, value]) => value !== undefined)),
      audioLanes: asset.manifest.recipe?.offlineAudio,
    });
    if (physicalHash !== asset.manifest.layoutPhysicalOrderSha256) {
      throw new Error(`Recording “${asset.label}” no longer matches this project's artwork or wiring. Record it again.`);
    }
    return true;
  }
  throw new Error('Recording source format is unsupported.');
}

function assertReceipt(receipt, asset) {
  if (!receipt || receipt.ok === false || receipt.file !== asset.file
    || receipt.bytes !== asset.byteLength || receipt.sha256 !== asset.manifest.lwseqSha256) {
    throw new Error(`The card did not independently confirm recording “${asset.label}”. Playlist configuration was not changed.`);
  }
}

function authBody(identity, capability) {
  return {
    cardId: identity.cardId, bootId: identity.bootId,
    ownerSessionId: identity.ownerSessionId,
    operationGeneration: identity.operationGeneration,
    expectedHead: identity.expectedHead,
    capability,
  };
}

function authHeaders(identity, capability) {
  return {
    'X-Lightweaver-Card-Id': identity.cardId,
    'X-Lightweaver-Boot-Id': identity.bootId,
    'X-Lightweaver-Owner-Session': identity.ownerSessionId,
    'X-Lightweaver-Operation-Generation': String(identity.operationGeneration),
    'X-Lightweaver-Expected-Head': identity.expectedHead,
    'X-Lightweaver-Capability': capability,
  };
}

export async function installRecordedMediaForRuntimePackage(runtimePackage, {
  host, transport, signal, project, confirmPairing = () => true,
  onProgress = () => {},
  readEvidence = readCardProjectEvidence,
  readStatus = readCardStatusEnvelope,
  sendBridge = sendCardBridgeRequest,
  authorityFactory = connectCardTransport,
  activeAuthority = getActiveCardTransportAuthority,
} = {}) {
  const assets = [...new Map((runtimePackage?.mediaAssets || []).map(asset => [asset.file, asset])).values()];
  if (!assets.length) return { installed: 0, verified: [] };
  const config = runtimePackage?.config || runtimePackage;
  for (const asset of assets) {
    assertAssetMatchesConfig(asset, config);
    const bytes = await verifyStoredSequenceAsset(asset);
    await assertRecordedMediaCurrentLayout(asset, project, bytes);
  }
  cancelled(signal);
  const evidence = await readEvidence({ host, transport });
  const mediaCapability = evidence?.capabilities?.sequenceMedia;
  if (mediaCapability?.version !== 1
    || mediaCapability.maxBytes < Math.max(...assets.map(asset => asset.byteLength))
    || mediaCapability.chunkBytes < CHUNK_BYTES) {
    throw new Error('This card cannot store recordings through Studio. Insert a writable microSD card and update its firmware, then retry.');
  }
  if (!await confirmPairing()) {
    cancelled({ aborted: true });
  }
  cancelled(signal);
  const bridge = transport === 'bridge';
  let identity;
  let capability;
  let request;
  if (bridge) {
    const status = await readStatus({ host, transport });
    if (status.cardId !== evidence.cardId || !status.bootId) throw new Error('The card changed before recording upload.');
    identity = {
      cardId: status.cardId, bootId: status.bootId,
      ownerSessionId: globalThis.crypto.randomUUID(), operationGeneration: 1,
      expectedHead: String(status.projectHead || ''),
    };
    const issued = await sendBridge('owner-capability', {
      cardId: identity.cardId, bootId: identity.bootId,
      ownerSessionId: identity.ownerSessionId,
      operationGeneration: identity.operationGeneration,
      expectedProjectHead: identity.expectedHead,
      commissioningProof: 'owner-confirmed-physical-control',
    }, { host, timeoutMs: 6000 });
    capability = issued?.capability;
    request = (verb, body = {}, timeoutMs = 10000) => sendBridge(`media-${verb}`, {
      ...authBody(identity, capability), ...body,
    }, { host, timeoutMs });
  } else {
    const authority = activeAuthority(host) || await authorityFactory({ host, expectedCardId: evidence.cardId });
    if (!authority?.connected || authority.cardId !== evidence.cardId) throw new Error('The exact paired card is unavailable for recording upload.');
    identity = {
      cardId: authority.cardId, bootId: authority.bootId,
      ownerSessionId: authority.ownerSessionId,
      operationGeneration: authority.operationGeneration,
      expectedHead: String(authority.readiness?.projectHead || ''),
    };
    capability = await authority.issueOwnerCapability({
      commissioningProof: 'owner-confirmed-physical-control', expectedProjectHead: identity.expectedHead,
    });
    request = async (verb, body = {}, timeoutMs = 10000) => {
      return authority.request(`/api/media/${verb}`, {
        method: 'POST', headers: authHeaders(identity, capability),
        body: { ...authBody(identity, capability), ...body }, signal,
      });
    };
  }
  if (!capability) throw new Error('The card did not grant short-lived recording install authority. Touch its control and retry.');
  const verified = [];
  const batch = await request('begin', { assets: assets.map(asset => ({
    file: asset.file, bytes: asset.byteLength, sha256: asset.manifest.lwseqSha256,
  })) });
  const batchId = String(batch?.batchId || '');
  if (!batchId || batch?.chunkBytes !== CHUNK_BYTES) {
    throw new Error('The card did not reserve a bounded upload for the exact Playlist recordings.');
  }
  try {
  for (const asset of assets) {
    cancelled(signal);
    const bytes = await readRecordedMedia(asset.mediaRef.sha256);
    const begin = await request('begin', { batchId, file: asset.file, bytes: asset.byteLength,
      sha256: asset.manifest.lwseqSha256 });
    let uploadId = String(begin?.uploadId || '');
    try {
      if (!begin?.alreadyPresent) {
        if (!uploadId || begin?.chunkBytes !== CHUNK_BYTES) throw new Error('The card did not begin a bounded media upload.');
        for (let offset = 0; offset < bytes.byteLength; offset += CHUNK_BYTES) {
          cancelled(signal);
          const slice = bytes.subarray(offset, Math.min(bytes.byteLength, offset + CHUNK_BYTES));
          const data = typeof Buffer !== 'undefined'
            ? Buffer.from(slice).toString('base64')
            : btoa(String.fromCharCode(...slice));
          const reply = await request('chunk', { batchId, uploadId, offset, data });
          if (reply?.received !== offset + slice.byteLength) throw new Error('The card did not confirm the recorded media chunk.');
          onProgress({ file: asset.file, received: reply.received, total: bytes.byteLength });
        }
        assertReceipt(await request('commit', { batchId, uploadId }), asset);
      } else {
        assertReceipt(await request('commit', { batchId, uploadId }), asset);
      }
      cancelled(signal);
      const readback = await request('read', { batchId, file: asset.file, uploadId });
      assertReceipt(readback, asset);
      verified.push(readback);
    } catch (error) {
      if (uploadId) await request('abort', { batchId, uploadId }).catch(() => {});
      throw error;
    }
  }
  const closed = await request('abort', { batchId });
  if (closed?.ok !== true) throw new Error('The card did not release the recorded media upload lease. Playlist configuration was not changed.');
  return { installed: verified.length, verified, cardId: identity.cardId,
    bootId: identity.bootId, projectHead: identity.expectedHead };
  } catch (error) {
    await request('abort', { batchId }).catch(() => {});
    throw error;
  }
}
