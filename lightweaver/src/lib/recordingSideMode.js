// Editing a live look may change how a new bake should render without changing
// the playback validity of a previously frozen recording.
export function recordingSideMode(project) {
  if (!project?.layoutSymmetry) return null;
  return project.sidesMirrored === false ? 'own' : 'mirrored';
}

export function recordingSideModeMatches(bakedMode, project) {
  return bakedMode === recordingSideMode(project);
}


// Optional project metadata only: never written into LWSEQ bytes or sidecars.
export function bakedSideModeFields(value) {
  return value === null || value === 'mirrored' || value === 'own'
    ? { bakedSideMode: value } : {};
}

export function recordingSourceSideMode(asset, project = {}) {
  const symmetry = project.layoutSymmetry ?? project.symmetry;
  const looks = project.standaloneController?.looks ?? project.looks ?? [];
  const owner = looks.find(look => look.id === asset?.id || (asset?.file && look.file === asset.file));
  // Match this recording's owner, never an active/selected unrelated look.
  // Older standalone assets have no owner; their source uses the project choice.
  return recordingSideMode({ layoutSymmetry: symmetry,
    sidesMirrored: owner?.sidesMirrored ?? project.sidesMirrored });
}

export async function recordedSequenceSideMode(asset, project = {}) {
  const sourceMode = recordingSourceSideMode(asset, project);
  let bakedMode = bakedSideModeFields(asset?.bakedSideMode).bakedSideMode;
  if (bakedMode === undefined) {
    // Legacy hashes can identify a mode only while all other bake inputs match.
    // Do not guess or backfill provenance after artwork/render/layout drift.
    try {
      const symmetry = project.layoutSymmetry ?? project.symmetry;
      const modes = symmetry ? ['mirrored', 'own'] : [null];
      const matches = [];
      for (const mode of modes) {
        const context = { ...project, symmetry, sidesMirrored: mode !== 'own', fps: asset.manifest.fps };
        let hash;
        if (asset.manifest.format === 'lightweaver-lwseq-sidecar') {
          const { hashPatternLabBakePhysicalOrder } = await import('./lwseqBake.js');
          hash = await hashPatternLabBakePhysicalOrder({ ...context, recipe: asset.manifest.recipe,
            groups: project.layoutLayerGroups ?? project.groups,
            audioLanes: asset.manifest.recipe?.offlineAudio,
            render: project.render ?? Object.fromEntries(Object.entries({ bpm: project.bpm,
              gammaEnabled: project.gammaEnabled, gammaValue: project.gammaValue,
              symSettings: project.symSettings }).filter(([, value]) => value !== undefined)) });
        } else if (asset.manifest.format === 'lightweaver-flow-lwseq-sidecar') {
          const { hashSceneExpressionFlowLayout } = await import('./sceneExpressionRecording.js');
          hash = await hashSceneExpressionFlowLayout({ ...context, scene: asset.manifest.scene });
        }
        if (hash && hash === asset.manifest.layoutPhysicalOrderSha256) matches.push(mode);
      }
      if (matches.length === 1) [bakedMode] = matches;
    } catch { /* Unavailable/incomplete legacy inputs leave the choice unknown. */ }
  }
  if (bakedMode === undefined) return { state: 'unknown', sourceMode,
    message: 'Recorded side choice unknown.' };
  const label = mode => mode === null ? 'Without sides' : mode === 'own' ? 'Own' : 'Mirrored';
  const state = bakedMode === sourceMode ? 'matches' : 'changed';
  return { state, bakedMode, sourceMode,
    message: state === 'matches' ? `Recorded: ${label(bakedMode)}.`
      : `Recorded: ${label(bakedMode)} · source: ${label(sourceMode)}. Record again to update.` };
}
