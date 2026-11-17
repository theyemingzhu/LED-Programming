import { importPortableProjectMedia, makePortableProject } from './projectTransfer.js';

const controller = project => project?.devices?.standaloneController;
const recordings = project => controller(project)?.sequenceAssets || [];

function requirePlaylistRecordings(project, available) {
  const assets = new Map(recordings(project).map(asset => [asset.id, asset]));
  for (const item of controller(project)?.playlist || []) {
    if (item?.enabled === false || (item?.type !== 'sequence' && !item?.sequenceAssetId)) continue;
    if (!available(assets.get(item.sequenceAssetId || item.id))) {
      throw new Error(`Playlist recording “${item.label || item.sequenceAssetId || item.id}” is missing its media. Import its original backup or record it again.`);
    }
  }
}

// The online revision validator already preserves the embedded recording
// field "media". The local file format calls the same payload "portableMedia".
// Restore through the shared importer so bytes are SHA-verified before editing.
export async function restoreOnlineProjectMedia(document, { onMissingLegacyMedia } = {}) {
  const hasInlineMedia = recordings(document).some(asset => asset.media);
  const portable = hasInlineMedia ? structuredClone(document) : document;
  if (hasInlineMedia) {
    for (const asset of recordings(portable)) {
      if (asset.media && !asset.portableMedia) asset.portableMedia = asset.media;
      delete asset.media;
    }
  }
  const project = recordings(portable).length
    ? await importPortableProjectMedia(portable, { onMissingLegacyMedia })
    : portable;
  requirePlaylistRecordings(project, asset => Boolean(asset?.mediaRef));
  return project;
}

export async function prepareOnlineProjectMedia(project) {
  const assets = recordings(project);
  if (!assets.length) {
    requirePlaylistRecordings(project, () => false);
    return project;
  }
  const hasInlineMedia = assets.some(asset => asset.media || asset.portableMedia);
  const portable = await makePortableProject(hasInlineMedia ? await restoreOnlineProjectMedia(project) : project);
  requirePlaylistRecordings(portable, asset => Boolean(asset?.portableMedia));
  for (const asset of recordings(portable)) {
    if (asset.portableMedia) {
      asset.media = asset.portableMedia;
      delete asset.portableMedia;
    }
  }
  return portable;
}
