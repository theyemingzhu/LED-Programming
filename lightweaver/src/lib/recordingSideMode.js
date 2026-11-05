// Editing a live look may change how a new bake should render without changing
// the playback validity of a previously frozen recording.
export function recordingSideMode(project) {
  if (!project?.layoutSymmetry) return null;
  return project.sidesMirrored === false ? 'own' : 'mirrored';
}

export function recordingSideModeMatches(bakedMode, project) {
  return bakedMode === recordingSideMode(project);
}
