import { useEffect, useMemo, useState } from 'react';
import { useProject } from '../state/ProjectContext.jsx';
import { recordedSequenceSideMode } from '../lib/recordingSideMode.js';
import './RecordedSequenceChoice.css';

// Choice freshness is separate from the validity of immutable recorded playback.
export function RecordedSequenceChoice({ asset }) {
  const project = useProject();
  const context = useMemo(() => ({
    strips: project.strips, patchBoard: project.patchBoard, wiring: project.wiring,
    compiledWiring: project.compiledWiring, sectionFamilies: project.sectionFamilies,
    layoutLayerGroups: project.layoutLayerGroups, layoutSymmetry: project.layoutSymmetry,
    sidesMirrored: project.sidesMirrored, looks: project.standaloneController?.looks,
    palette: project.palette, hidden: project.hidden, sectionTargets: project.sectionTargets,
    bpm: project.bpm, gammaEnabled: project.gammaEnabled, gammaValue: project.gammaValue,
    symSettings: project.symSettings,
  }), [project.strips, project.patchBoard, project.wiring, project.compiledWiring,
    project.sectionFamilies, project.layoutLayerGroups, project.layoutSymmetry,
    project.sidesMirrored, project.standaloneController?.looks, project.palette,
    project.hidden, project.sectionTargets, project.bpm, project.gammaEnabled,
    project.gammaValue, project.symSettings]);
  const [result, setResult] = useState(null);
  useEffect(() => {
    let active = true;
    void recordedSequenceSideMode(asset, context).then(choice => {
      if (active) setResult({ asset, context, choice });
    });
    return () => { active = false; };
  }, [asset, context]);
  // Never show a previous asset/owner's answer while legacy hashes are resolving.
  const choice = result?.asset === asset && result.context === context ? result.choice : null;
  return <small className="recorded-sequence-choice" data-testid="recorded-sequence-choice"
    data-choice-state={choice?.state || 'unknown'}>{choice?.message || 'Checking recorded side choice…'}</small>;
}
