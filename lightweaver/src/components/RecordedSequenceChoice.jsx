import { useEffect, useMemo, useRef, useState } from 'react';
import { useProject } from '../state/ProjectContext.jsx';
import { recordedSequenceSideMode } from '../lib/recordingSideMode.js';
import './RecordedSequenceChoice.css';
import { recordedSequenceFreshness, rebakeRecordedSequence } from '../lib/recordingFreshness.js';
import { readPatternLabDrafts, savePatternLabDraft, WORKSPACE_ASSETS_EVENT } from '../lib/patternLabStorage.js';

// Choice freshness is separate from the validity of immutable recorded playback.
export function RecordedSequenceChoice({ asset, allowRebake = false }) {
  const project = useProject();
  const [drafts, setDrafts] = useState(readPatternLabDrafts);
  const [updateState, setUpdateState] = useState('');
  const [updating, setUpdating] = useState(false);
  const abortRef = useRef(null);
  const latestRef = useRef(null);
  useEffect(() => {
    const refresh = () => setDrafts(readPatternLabDrafts());
    window.addEventListener(WORKSPACE_ASSETS_EVENT, refresh);
    return () => { window.removeEventListener(WORKSPACE_ASSETS_EVENT, refresh); abortRef.current?.abort(); };
  }, []);
  const context = useMemo(() => ({
    strips: project.strips, patchBoard: project.patchBoard, wiring: project.wiring,
    compiledWiring: project.compiledWiring, sectionFamilies: project.sectionFamilies,
    layoutLayerGroups: project.layoutLayerGroups, layoutSymmetry: project.layoutSymmetry,
    sidesMirrored: project.sidesMirrored, looks: project.standaloneController?.looks,
    palette: project.palette, hidden: project.hidden, sectionTargets: project.sectionTargets,
    bpm: project.bpm, gammaEnabled: project.gammaEnabled, gammaValue: project.gammaValue,
    symSettings: project.symSettings, standaloneController: project.standaloneController,
    expressionScenes: project.expressionScenes, patternLabDrafts: drafts,
  }), [project.strips, project.patchBoard, project.wiring, project.compiledWiring,
    project.sectionFamilies, project.layoutLayerGroups, project.layoutSymmetry,
    project.sidesMirrored, project.standaloneController?.looks, project.palette,
    project.hidden, project.sectionTargets, project.bpm, project.gammaEnabled,
    project.gammaValue, project.symSettings, project.expressionScenes, project.standaloneController, drafts]);
  latestRef.current = { context, projectId: project.projectId };
  const [result, setResult] = useState(null);
  useEffect(() => {
    let active = true;
    void Promise.all([recordedSequenceSideMode(asset, context), recordedSequenceFreshness(asset, context)]).then(([choice, freshness]) => {
      if (active) setResult({ asset, context, choice, freshness });
    });
    return () => { active = false; };
  }, [asset, context]);
  // Never show a previous asset/owner's answer while legacy hashes are resolving.
  const choice = result?.asset === asset && result.context === context ? result.choice : null;
  const freshness = result?.asset === asset && result.context === context ? result.freshness : null;
  const description = [choice?.message, freshness?.message].filter(Boolean).join(' ');
  async function recordAgain() {
    if (abortRef.current) return;
    const controller = new AbortController();
    abortRef.current = controller;
    const snapshot = latestRef.current;
    setUpdating(true);
    setUpdateState('Recording again… Original retained until success.');
    try {
      const next = await rebakeRecordedSequence(asset, context, { signal: controller.signal });
      if (controller.signal.aborted || latestRef.current.context !== snapshot.context
        || latestRef.current.projectId !== snapshot.projectId) throw new Error('Source or project changed. Original recording retained; record again.');
      const saved = project.setStandaloneController(next);
      if (saved?.ok === false) throw new Error('Project could not accept the new recording. Original retained.');
      const updated = next.sequenceAssets.find(item => item.id === asset.id);
      for (const draft of drafts.filter(item => item.sourceSequenceAssetId === asset.id
        && item.sourceSequenceAssetSha256 === asset.manifest.lwseqSha256)) {
        try { savePatternLabDraft({ ...draft, sourceSequenceAssetSha256: updated.manifest.lwseqSha256 }); }
        catch { /* The verified recording is saved; draft lineage can be reopened. */ }
      }
      setUpdateState('Recording updated. Card playback changes only after installation.');
    } catch (error) { if (!controller.signal.aborted) setUpdateState(`${error.message} Original recording retained.`); }
    finally { if (abortRef.current === controller) abortRef.current = null; setUpdating(false); }
  }
  const label = mode => mode === null ? 'No sides' : mode === 'own' ? 'Own' : 'Mirrored';
  return <small className="recorded-sequence-choice" data-testid="recorded-sequence-choice"
    data-choice-state={choice?.state || 'unknown'} data-freshness-state={freshness?.state || 'unknown'} role="note" aria-label={description} title={description}>
    <span className="recording-freshness">{freshness?.state === 'current' ? 'Source current' : freshness?.state === 'stale' ? 'Source changed · record again' : 'Freshness unknown'}</span>
    {choice?.bakedMode === undefined
      ? <span aria-hidden="true">{choice ? 'Choice unknown' : 'Checking side choice…'}</span>
      : <>
        <span aria-hidden="true">Baked: {label(choice.bakedMode)}</span>
        {choice.state !== 'matches' && <span aria-hidden="true">Source: {choice.sourceMode === undefined ? 'Unknown' : label(choice.sourceMode)}</span>}
      </>}
    {allowRebake && <button type="button" className="btn recording-rebake" disabled={updating || !freshness?.canRebake} onClick={() => void recordAgain()}>Record again</button>}
    {updateState && <span role="status" className="recording-update-status">{updateState}</span>}
  </small>;
}
