import { normalizeSavedLooks } from './sectionLookModel.js';
import { derivePlaylistLookIds, makePatternPlaylistItem, normalizeCardPlaylist } from './cardPlaylist.js';

// Put one pattern first in the card's playlist (and encoder cycle), which
// makes it the look the card starts on. Patterns' Save to card always did this
// with the look on screen; Layout's install did not, so a project whose
// playlist begins with a saved look (Sparkle) started every section on that
// look at full brightness instead of the project's own Fire at 0.91 (real card
// lw-b0fe81f61b44, 2026-11-22). One function, so both doors build the same body.
export function promotePatternFirst(controller, patternId) {
  if (!patternId) return controller;
  const controllerLooks = normalizeSavedLooks(controller?.looks);
  const currentPlaylist = normalizeCardPlaylist(controller?.playlist, {
    savedLooks: controllerLooks,
    fallbackPatternIds: [
      patternId,
      ...(Array.isArray(controller?.controls?.encoder?.patternCycleIds) ? controller.controls.encoder.patternCycleIds : []),
    ],
  });
  const item = makePatternPlaylistItem(patternId);
  const nextPlaylist = normalizeCardPlaylist([
    item,
    ...currentPlaylist.filter(entry => !(entry.type === 'pattern' && entry.patternId === patternId)),
  ].filter(Boolean), { savedLooks: controllerLooks, fallbackPatternIds: [patternId] });
  return {
    ...(controller || {}),
    playlist: nextPlaylist,
    controls: {
      ...(controller?.controls || {}),
      encoder: { ...(controller?.controls?.encoder || {}), patternCycleIds: derivePlaylistLookIds(nextPlaylist) },
    },
  };
}

// The controller Layout installs: the project's controller with the compiled
// outputs, and the project's own default look first — as Patterns sends it.
export function layoutInstallController(standaloneController = {}, compiledOutputs = []) {
  const withOutputs = {
    ...standaloneController,
    outputs: compiledOutputs.map(output => ({
      id: output.id,
      name: output.name,
      pin: output.pin,
      pixels: output.count,
      direction: output.direction,
      segments: output.segments,
    })),
  };
  return promotePatternFirst(withOutputs, standaloneController?.defaultLook?.patternId || '');
}
