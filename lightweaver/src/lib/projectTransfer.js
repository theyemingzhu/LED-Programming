// THE project file export/import implementation — every Studio surface that
// downloads a portable project file or opens one from disk goes through here.
//
// Export: canonical `<project-name>.lw.json` naming (lib/projectFiles.js) over
// the shared download mechanics (lib/downloadFile.js). The payload is the raw
// serialized project — the format the top-bar export has always produced. A
// site with extra fields to fold in (Layout's geometry re-spread) passes
// `buildPayload`; only the naming and download mechanics are unified, never
// the payload shape.
//
// Import: wraps the Phase 2 file mechanics (lib/projectImportFile.js), accepts
// BOTH a bare project document and a `{ envelopeVersion, …, project }`
// repository envelope (lib/projectRepository.js createProjectEnvelope shape —
// detected and unwrapped, with the inner project handed to replaceProject,
// which owns migration and validation), and runs ONE association-cleanup
// sequence after a committed replacement. The cleanup ORDER and completeness
// live here — callers only supply the functions:
//   1. clearBrowserAssociation — detach the browser-library record
//      (lw_project_active_record_v1) and any in-memory association snapshot.
//   2. detachCloudProject      — detach the cloud record
//      (lw_cloud_active_project_v1).
//   3. clearSaveBlock          — lift the save block; the imported file is a
//      fresh, unassociated workspace with a safe destination again.
// This is the top-bar import's historical behavior, now everyone's behavior.
import { canonicalProjectFileName } from './projectFiles.js';
import { downloadJsonFile } from './downloadFile.js';
import { importProjectFromFile } from './projectImportFile.js';
import { storeRecordedMedia } from './recordedSequenceMedia.js';
import { verifySequenceAssetBytes, verifyStoredSequenceAsset } from './recordedSequenceAsset.js';
import { migrateProject, PROJECT_VERSION } from './projectModel.js';
import { PROJECT_ENVELOPE_SCHEMA_VERSION } from './projectRepository.js';

function base64(bytes) {
  if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64');
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

function fromBase64(value) {
  if (typeof value !== 'string' || !value.length || value.length % 4) throw new Error('Portable recording bytes are invalid.');
  const bytes = typeof Buffer !== 'undefined'
    ? new Uint8Array(Buffer.from(value, 'base64'))
    : Uint8Array.from(atob(value), character => character.charCodeAt(0));
  if (base64(bytes) !== value) throw new Error('Portable recording bytes are invalid.');
  return bytes;
}

export async function makePortableProject(project) {
  const portable = structuredClone(project);
  const assets = portable?.devices?.standaloneController?.sequenceAssets || [];
  for (const asset of assets) {
    // Older project files retained the exact recipe and hash but never saved
    // binary media. Preserve their editable source during backup and restore;
    // the Playlist/install gate still refuses playback until re-recorded.
    if (!asset.mediaRef) continue;
    if (!asset.mediaRef.sha256 || asset.mediaRef.byteLength !== asset.byteLength)
      throw new Error(`Recording “${asset.label || asset.id}” has invalid saved media metadata.`);
    // Historical multi-output LWSEQ files did not bind GPIO topology in the
    // reserved header. Keep their exact bytes and editable source portable;
    // install still requires a newly recorded, topology-bound file.
    const bytes = await verifyStoredSequenceAsset(asset, { allowLegacyMultiOutput: true });
    if (bytes.byteLength !== asset.byteLength) throw new Error(`Recording “${asset.label || asset.id}” has an incomplete media file.`);
    asset.portableMedia = { encoding: 'base64', bytes: bytes.byteLength,
      sha256: asset.mediaRef.sha256, data: base64(bytes) };
  }
  return portable;
}

export async function importPortableProjectMedia(project, { onMissingLegacyMedia } = {}) {
  const copy = structuredClone(project);
  const assets = copy?.devices?.standaloneController?.sequenceAssets || [];
  const verifiedMedia = [];
  for (const asset of assets) {
    if (!asset.portableMedia) {
      if (asset.mediaRef) {
        try {
          await verifyStoredSequenceAsset(asset, { allowLegacyMultiOutput: true });
        } catch (error) {
          if (error?.code !== 'recorded_media_missing' || !onMissingLegacyMedia) throw error;
          onMissingLegacyMedia(asset);
        }
      }
      continue;
    }
    const media = asset.portableMedia;
    if (media.encoding !== 'base64' || media.bytes !== asset.byteLength
      || media.sha256 !== asset.manifest?.lwseqSha256) throw new Error('Portable recording metadata does not match the project.');
    const bytes = fromBase64(media.data);
    if (bytes.byteLength !== media.bytes) throw new Error('Portable recording is incomplete.');
    const mediaRef = { sha256: media.sha256, byteLength: bytes.byteLength };
    await verifySequenceAssetBytes({ ...asset, mediaRef }, bytes, { allowLegacyMultiOutput: true });
    verifiedMedia.push({ asset, bytes, sha256: media.sha256 });
  }
  // Verify the whole portable bundle before committing any recording bytes.
  for (const { asset, bytes, sha256 } of verifiedMedia) {
    asset.mediaRef = await storeRecordedMedia(bytes, sha256);
    delete asset.portableMedia;
  }
  return copy;
}

/**
 * A repository envelope is `{ envelopeVersion, …, project: {…} }`. Anything
 * else — including a bare project document — passes through untouched. The
 * envelope metadata (content hash, revision) is transport provenance, not
 * project content, so it is dropped rather than validated here: the inner
 * project still goes through replaceProject's own migration and validation,
 * and a hand-edited envelope should not strand a perfectly loadable project.
 */
export function unwrapProjectFileDocument(data) {
  if (
    data && typeof data === 'object' && !Array.isArray(data)
    && data.envelopeVersion !== undefined
    && data.project && typeof data.project === 'object' && !Array.isArray(data.project)
  ) {
    return data.project;
  }
  return data;
}

/**
 * Download the current project as a portable `.lw.json` file.
 *
 * @returns true when the download started (the project is then marked as
 *   persisted to 'file'), false when it did not (picker dismissed, download
 *   blocked) — the caller owns the failure UI.
 */
export async function exportProjectToFile({
  serializeProject,
  projectName,
  markPersisted,
  buildPayload = null,
  download = downloadJsonFile,
} = {}) {
  const payload = await makePortableProject(buildPayload ? buildPayload() : serializeProject());
  const ok = await download(canonicalProjectFileName(projectName), payload);
  if (ok) markPersisted?.('file');
  return ok === true;
}

/**
 * Open a picked project File in the workspace.
 *
 * Resolves with replaceProject's result (`{ ok, reason, … }`); after a
 * committed replacement (`ok: true`) the full cleanup sequence runs, in
 * order. Rejects on unreadable files, invalid JSON, or a throwing
 * replaceProject — callers keep one catch for all three, and no cleanup runs
 * on any failure path.
 */
export async function importProjectFromPickedFile(file, {
  replaceProject,
  clearBrowserAssociation,
  detachCloudProject,
  clearSaveBlock,
  readProjectFile = importProjectFromFile,
} = {}) {
  let missingLegacyRecording = false;
  const result = await readProjectFile(file, async data => {
    const document = unwrapProjectFileDocument(data);
    if (Number(data?.envelopeVersion) > PROJECT_ENVELOPE_SCHEMA_VERSION || Number(document?.version) > PROJECT_VERSION) {
      throw new Error('This project was saved by a newer Lightweaver Studio. Open it in a newer version.');
    }
    if (data?.envelopeVersion !== undefined
      && (data === document || Number(data.envelopeVersion) !== PROJECT_ENVELOPE_SCHEMA_VERSION)) {
      return { ok: false, reason: 'invalid' };
    }
    // Real flat exports and nested Studio backups always declare their strip
    // list, including an empty one. Boot recovery separately tolerates sparse
    // local snapshots so they can be completed by older layout data.
    const strips = document?.version === PROJECT_VERSION ? document.layout?.strips : document?.strips;
    if (!Array.isArray(strips)) return { ok: false, reason: 'invalid' };
    let valid;
    try { valid = migrateProject(document); } catch { valid = null; }
    if (!valid) return { ok: false, reason: 'invalid' };
    const project = await importPortableProjectMedia(document, {
      onMissingLegacyMedia: () => { missingLegacyRecording = true; },
    });
    return replaceProject(project);
  });
  if (result?.ok) {
    clearBrowserAssociation?.();
    detachCloudProject?.();
    clearSaveBlock?.();
  }
  if (result?.ok && missingLegacyRecording) {
    return {
      ...result,
      missingRecordingNotice: 'Recording missing from this backup. You can edit the project. Import the original backup or record the sequence again to restore playback.',
    };
  }
  return result;
}
