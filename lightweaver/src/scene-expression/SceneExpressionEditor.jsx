import { useEffect, useMemo, useRef, useState } from 'react';
import { getCardPatternById, CORE_CARD_PATTERN_BANK } from '../lib/cardPatternBank.js';
import { buildPatternPreviewSegments, fitPreviewViewBox } from '../lib/patternPiecePreview.js';
import { getPatternById } from '../lib/patternRegistry.js';
import { normalizeSceneExpression, resolveSceneExpression } from '../lib/sceneExpression.js';
import { compileSceneExpressionNative } from '../lib/sceneExpressionNative.js';
import { buildSceneExpressionAreaCatalog } from '../lib/sceneExpressionTargets.js';
import { inspectExpressionScenes } from '../lib/sceneExpressionProject.js';
import { PatternPreview } from '../v3/PatternPreview.jsx';
import {
  addSceneAssignment, addSceneStep, createSceneExpression, DEFAULT_CARD_COLOR, moveSceneStep,
  patchOrCreateSceneAssignment, patchSceneStep, removeSceneAssignment, removeSceneStep,
  repeatPatternPerSectionAreaIds, repeatSceneAssignmentPerSection, scenePlaybackAt,
  scenePreviewAvailability, selectionDisplayState,
} from './sceneExpressionEditorModel.js';
import './scene-expression.css';

function previewPatternId(id) {
  const card = getCardPatternById(id);
  return card?.previewPatternId || card?.preset || id;
}

function statusCopy(compilation) {
  if (compilation.ok) return { tone: 'ready', title: 'Card compatible', body: 'Every choice has an exact native representation.' };
  const unsupported = compilation.reasons?.[0];
  return { tone: 'preview', title: 'Studio preview only', body: unsupported?.message || 'This scene needs attention before card playback.' };
}

function unsupportedTitle(code) {
  if (code === 'unsupported-expression-scenes-version') return 'This scene source needs a newer Studio';
  if (code === 'derived-expression-data') return 'Compiled scene data cannot be edited';
  return 'Scene source cannot be edited';
}

export default function SceneExpressionEditor({ project, onSaveProject, onInstallScene, installationReceipt, onClose }) {
  const store = project.expressionScenes;
  const storeInspection = inspectExpressionScenes(store);
  const storedScenes = Array.isArray(store?.scenes) ? store.scenes : [];
  const activeStored = storeInspection.editable ? (storedScenes.find(scene => scene.id === store?.activeSceneId) || storedScenes[0]) : null;
  const [scene, setScene] = useState(() => activeStored ? structuredClone(activeStored) : createSceneExpression({ id: `scene-${Date.now()}`, name: 'New scene' }));
  const [sourceProjectId, setSourceProjectId] = useState(project.projectId);
  const [selectedStepId, setSelectedStepId] = useState(scene.steps[0].id);
  const [selectedAssignment, setSelectedAssignment] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [saveState, setSaveState] = useState('idle');
  const [installState, setInstallState] = useState({ status: 'idle', message: '', source: '', reason: '' });
  const playbackFrameRef = useRef(0);
  const sceneRef = useRef(scene);
  const pendingSourceCommitRef = useRef(null);
  const saveProjectRef = useRef(onSaveProject);
  const installSceneRef = useRef(onInstallScene);
  sceneRef.current = scene;
  saveProjectRef.current = onSaveProject;
  installSceneRef.current = onInstallScene;
  const activeStoredSource = activeStored ? JSON.stringify(activeStored) : '';

  useEffect(() => {
    if (project.projectId === sourceProjectId) return;
    const inspection = inspectExpressionScenes(project.expressionScenes);
    const scenes = Array.isArray(project.expressionScenes?.scenes) ? project.expressionScenes.scenes : [];
    const active = inspection.editable
      ? (scenes.find(item => item.id === project.expressionScenes?.activeSceneId) || scenes[0])
      : null;
    const next = active ? structuredClone(active) : createSceneExpression({ id: `scene-${Date.now()}`, name: 'New scene' });
    setSourceProjectId(project.projectId);
    setScene(next);
    setSelectedStepId(next.steps[0].id);
    setSelectedAssignment(0);
    setElapsedMs(0);
    setSaveState('idle');
    setInstallState({ status: 'idle', message: '', source: '', reason: '' });
  }, [project.expressionScenes, project.projectId, sourceProjectId]);

  useEffect(() => {
    if (project.projectId !== sourceProjectId || !activeStoredSource) return;
    if (activeStoredSource === JSON.stringify(sceneRef.current)) return;
    const next = structuredClone(activeStored);
    setScene(next);
    setSelectedStepId(next.steps[0].id);
    setSelectedAssignment(0);
    setElapsedMs(0);
    setSaveState('idle');
    setInstallState({ status: 'idle', message: '', source: '', reason: '' });
  }, [activeStoredSource, project.projectId, sourceProjectId]);

  useEffect(() => {
    const pending = pendingSourceCommitRef.current;
    if (!pending) return;
    const committed = project.expressionScenes?.scenes?.find(item => item.id === pending.sceneId);
    if (!committed || JSON.stringify(committed) !== pending.source) return;
    pendingSourceCommitRef.current = null;
    pending.resolve(true);
  }, [project.expressionScenes]);

  useEffect(() => () => {
    pendingSourceCommitRef.current?.resolve(false);
    pendingSourceCommitRef.current = null;
  }, []);

  useEffect(() => {
    if (!scene.steps.some(step => step.id === selectedStepId)) setSelectedStepId(scene.steps[0].id);
  }, [scene, selectedStepId]);

  const catalog = useMemo(() => buildSceneExpressionAreaCatalog({
    strips: project.strips,
    sectionFamilies: project.sectionFamilies,
    layerGroups: project.layoutLayerGroups,
    compiledWiring: project.compiledWiring,
  }), [project.strips, project.sectionFamilies, project.layoutLayerGroups, project.compiledWiring]);
  const resolved = useMemo(() => resolveSceneExpression(scene, catalog), [scene, catalog]);
  const compilation = useMemo(() => compileSceneExpressionNative(scene, {
    catalog, strips: project.strips, compiledWiring: project.compiledWiring,
    standaloneController: project.standaloneController,
    projectId: project.projectId, projectName: project.projectName,
  }), [scene, catalog, project]);
  const status = statusCopy(compilation);
  const selectedStep = scene.steps.find(step => step.id === selectedStepId) || scene.steps[0];
  const assignment = selectedStep.assignments[selectedAssignment] || selectedStep.assignments[0] || null;
  const resolvedStep = resolved.steps?.find(step => step.id === selectedStep.id);
  const selectionDisplay = useMemo(
    () => selectionDisplayState(resolvedStep, catalog, assignment, scene.defaults),
    [assignment, catalog, resolvedStep, scene.defaults],
  );
  const inheritedState = selectionDisplay.state;
  const hasMixedSelection = Object.values(selectionDisplay.mixed).some(Boolean);
  const repeatPerSectionAreaIds = useMemo(
    () => repeatPatternPerSectionAreaIds(assignment, catalog),
    [assignment, catalog],
  );
  const previewAvailability = useMemo(() => scenePreviewAvailability(scene, resolved, catalog), [scene, resolved, catalog]);
  const playback = useMemo(() => scenePlaybackAt(scene, elapsedMs), [elapsedMs, scene]);
  const effectivePlaying = playing && previewAvailability.ok && !playback.ended;
  const playbackStep = scene.steps[playback.stepIndex];
  const playbackResolvedStep = resolved.steps?.find(step => step.id === playback.stepId);
  const previewTargets = useMemo(() => project.strips.map(strip => {
    const state = playbackResolvedStep?.states?.[strip.id] || scene.defaults;
    return {
      kind: 'section', id: strip.id, zoneId: `patch-${strip.id}`, label: strip.name || strip.id,
      look: {
        patternId: state.pattern.rendererId,
        speed: state.pattern.speed,
        brightness: state.intensity.brightness,
        ...(state.color.kind === 'card-controls' ? state.color : {}),
      },
      palette: state.color.kind === 'palette' ? state.color.colors : null,
    };
  }), [playbackResolvedStep, project.strips, scene.defaults]);
  const previewStrips = useMemo(() => buildPatternPreviewSegments({
    strips: project.strips,
    patchBoard: project.patchBoard,
    targets: previewTargets,
    resolvePatternId: previewPatternId,
    paletteForPattern: patternId => getPatternById(previewPatternId(patternId))?.pal || project.palette,
  }).map(segment => ({
    ...segment,
    palette: previewTargets.find(target => target.id === segment.id)?.palette || segment.palette,
  })), [previewTargets, project.palette, project.patchBoard, project.strips]);
  const previewViewBox = useMemo(
    () => fitPreviewViewBox(previewStrips, project.viewBox),
    [previewStrips, project.viewBox],
  );
  const availableScenes = storedScenes.some(item => item.id === scene.id) ? storedScenes : [...storedScenes, scene];

  useEffect(() => {
    cancelAnimationFrame(playbackFrameRef.current);
    if (!effectivePlaying) return undefined;
    let previous = performance.now();
    const tick = now => {
      const delta = Math.max(0, Math.min(250, now - previous));
      previous = now;
      setElapsedMs(value => value + delta);
      playbackFrameRef.current = requestAnimationFrame(tick);
    };
    playbackFrameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(playbackFrameRef.current);
  }, [effectivePlaying, scene.id]);

  useEffect(() => {
    if (!previewAvailability.ok && playing) setPlaying(false);
    if (playback.ended) {
      if (playing) setPlaying(false);
      if (elapsedMs !== playback.totalMs) setElapsedMs(playback.totalMs);
    }
  }, [elapsedMs, playback.ended, playback.totalMs, playing, previewAvailability.ok]);

  function writeCanonicalSource(nextScene) {
    project.setExpressionScenes(current => ({
      ...current,
      version: 1,
      activeSceneId: nextScene.id,
      scenes: [...current.scenes.filter(item => item.id !== nextScene.id), nextScene],
    }));
  }
  function stageCanonicalSource(nextScene) {
    const source = JSON.stringify(nextScene);
    const committed = project.expressionScenes?.scenes?.find(item => item.id === nextScene.id);
    if (committed && JSON.stringify(committed) === source) return Promise.resolve(true);
    return new Promise(resolve => {
      pendingSourceCommitRef.current?.resolve(false);
      pendingSourceCommitRef.current = { sceneId: nextScene.id, source, resolve };
      writeCanonicalSource(nextScene);
    });
  }
  function update(next) {
    const normalized = normalizeSceneExpression(next);
    setScene(normalized);
    writeCanonicalSource(normalized);
    setSaveState('idle');
  }
  function patchAssignment(patch) { update(patchOrCreateSceneAssignment(scene, selectedStep.id, selectedAssignment, patch)); }
  function openScene(sceneId) {
    const next = storedScenes.find(item => item.id === sceneId);
    if (!next) return;
    setScene(structuredClone(next));
    setSelectedStepId(next.steps[0].id);
    setSelectedAssignment(0);
    setElapsedMs(0);
    project.setExpressionScenes(current => ({ ...current, activeSceneId: sceneId }));
    setSaveState('idle');
  }
  function newScene() {
    const id = `scene-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const next = createSceneExpression({ id, name: 'New scene' });
    setScene(next);
    setSelectedStepId(next.steps[0].id);
    setSelectedAssignment(0);
    setElapsedMs(0);
    writeCanonicalSource(next);
    setSaveState('idle');
  }
  function save() {
    writeCanonicalSource(scene);
    setSaveState('saving');
  }
  async function install() {
    if (!onInstallScene || installState.status === 'installing') return;
    const source = JSON.stringify(scene);
    setInstallState({ status: 'installing', message: 'Saving the current Studio project…', source });
    try {
      const committed = await stageCanonicalSource(scene);
      if (!committed) {
        setInstallState({ status: 'failed', message: 'The scene changed before it could be saved. Review the current draft and try again.', source, reason: 'source-changed' });
        return;
      }
      await new Promise(resolve => requestAnimationFrame(resolve));
      const browserSave = await saveProjectRef.current?.();
      if (!browserSave?.ok) {
        setInstallState({ status: 'failed', message: 'Save this project in Studio before installing the scene.', source, reason: browserSave?.reason || 'browser-save-failed' });
        return;
      }
      await new Promise(resolve => requestAnimationFrame(resolve));
      const result = await installSceneRef.current({
        sceneId: scene.id,
        onProgress: progress => setInstallState({
          status: 'installing', source,
          message: progress === 'pairing' ? 'Confirming the physical card…'
            : progress === 'uploading' ? 'Saving the editable project source…'
              : progress === 'verifying' ? 'Verifying the saved source…'
                : 'Installing the scene playback…',
        }),
      });
      setInstallState({
        status: result?.ok && result.state === 'on-card' ? 'installed' : result?.sourceSaved ? 'source-saved' : 'failed',
        message: result?.message || 'The scene was not installed. Your draft remains in Studio.',
        reason: result?.reason || '',
        currentDraftRetained: result?.currentDraftRetained === true,
        source,
      });
    } catch (error) {
      setInstallState({
        status: 'failed',
        message: error?.message || 'The scene was not installed. Your draft remains in Studio.',
        reason: error?.reason || 'install-failed',
        source,
      });
    }
  }

  useEffect(() => {
    if (saveState !== 'saving') return undefined;
    const persistedSource = project.expressionScenes?.scenes?.find(item => item.id === scene.id);
    if (!persistedSource || JSON.stringify(persistedSource) !== JSON.stringify(scene)) return undefined;
    let active = true;
    Promise.resolve(onSaveProject?.()).then(result => {
      if (active) setSaveState(result?.ok === true ? 'saved' : 'error');
    });
    return () => { active = false; };
  }, [onSaveProject, project.expressionScenes, saveState, scene]);

  if (!storeInspection.editable) return <main className="screen sexp sexp-unsupported" data-testid="scene-expression-editor">
    <section>
      <span className="sexp-kicker">Studio · Lab · Scene</span>
      <h1>{unsupportedTitle(storeInspection.code)}</h1>
      <p>{storeInspection.message}</p>
      <p>The source is still stored exactly as it was. Open this project in a Studio version that supports it before editing scenes.</p>
      <button className="btn" type="button" onClick={onClose}>Back to Lab</button>
    </section>
  </main>;

  const exactOnCard = installationReceipt?.verified === true
    && installationReceipt.playbackSceneId === scene.id;
  const installedSnapshotOnly = installState.status === 'installed' && !exactOnCard;
  const deliveryState = exactOnCard ? 'installed' : installedSnapshotOnly ? 'snapshot' : installState.status;

  return <main className="screen sexp" data-testid="scene-expression-editor">
    <header className="sexp-head">
      <div>
        <span className="sexp-kicker">Studio · Lab · Scene</span>
        <input aria-label="Scene title" className="sexp-title" value={scene.name} onChange={event => update({ ...scene, name: event.target.value })} />
        <p>Give each area its own behavior, then arrange how the scene changes over time.</p>
      </div>
      <div className="sexp-head-actions">
        <select aria-label="Scene" value={scene.id} onChange={event => openScene(event.target.value)}>{availableScenes.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
        <button className="btn" type="button" onClick={newScene}>New scene</button>
        <button className="btn" type="button" onClick={onClose}>Back to Lab</button>
        <button className="btn" type="button" onClick={save} disabled={saveState === 'saving'}>{saveState === 'saving' ? 'Saving…' : 'Save scene'}</button>
        <button className="btn primary" type="button" onClick={install} disabled={!compilation.ok || installState.status === 'installing' || exactOnCard || !onInstallScene}>{installState.status === 'installing' ? 'Putting scene on card…' : exactOnCard ? 'On card' : 'Put scene on card'}</button>
      </div>
    </header>
    <div className={`sexp-status ${status.tone}`} role="status">
      <strong>{status.title}</strong><span>{status.body}</span>
      {saveState === 'saved' && <em>Project saved</em>}
      {saveState === 'error' && <em>Save failed. Your edits remain open.</em>}
    </div>
    <div className="sexp-delivery" data-state={deliveryState} data-reason={installState.reason || undefined} data-current-draft-retained={installState.currentDraftRetained ? 'true' : undefined} data-receipt-verified={installationReceipt?.verified ? 'true' : 'false'}>
      <strong>{scene.steps.length} scene step{scene.steps.length === 1 ? '' : 's'} will replace the card playlist.</strong>
      <span>Your {project.standaloneController?.looks?.length || 0} saved library look{project.standaloneController?.looks?.length === 1 ? '' : 's'} {project.standaloneController?.looks?.length === 1 ? 'remains' : 'remain'} in the editable project source.</span>
      {(installState.message || exactOnCard) && <em>{installedSnapshotOnly ? 'An earlier snapshot is verified on the card. This project has newer edits or a different card is connected.' : installState.message || 'Scene source and playback were verified on the card.'}</em>}
    </div>
    <div className="sexp-grid">
      <section className="sexp-preview" aria-label="Scene preview">
        <div className="sexp-preview-bar"><span>{!previewAvailability.ok ? `Preview unavailable · ${previewAvailability.message}` : `${playback.ended ? 'Finished' : effectivePlaying ? 'Playing' : 'Paused'} ${playback.stepIndex + 1}/${scene.steps.length} · ${playbackStep.label} · ${(playback.localMs / 1000).toFixed(1)}s`}</span><button type="button" disabled={!previewAvailability.ok} onClick={() => { if (playback.ended) { setElapsedMs(0); setPlaying(true); } else setPlaying(value => !value); }}>{playback.ended ? 'Replay scene' : effectivePlaying ? 'Pause' : 'Play scene'}</button></div>
        <div className="sexp-canvas" data-preview-segments={previewStrips.length}>
          {previewStrips.length ? <PatternPreview
            patternId="aurora" playing={effectivePlaying} strips={previewStrips}
            viewBox={previewViewBox} hidden={project.hidden} controlledTime={elapsedMs / 1000}
            ariaLabel={`${scene.name} preview`} testId="scene-expression-preview"
          /> : <div className="sexp-empty"><strong>Draw the artwork in Layout first</strong><span>This scene will use its exact strips and groups.</span></div>}
        </div>
      </section>

      <section className="sexp-timeline" aria-label="Scene steps">
        <div className="sexp-section-head"><div><span>ORDERED STEPS</span><h2>How the scene changes</h2></div><button type="button" onClick={() => { const next = addSceneStep(scene); update(next); setSelectedStepId(next.steps.at(-1).id); setSelectedAssignment(0); }}>+ Add step</button></div>
        <div className="sexp-step-list">{scene.steps.map((step, index) => <article key={step.id} className={step.id === selectedStep.id ? 'active' : ''} data-playing={effectivePlaying && step.id === playback.stepId ? 'true' : undefined}>
          <button className="sexp-step-main" type="button" onClick={() => { setSelectedStepId(step.id); setSelectedAssignment(0); }}><b>{String(index + 1).padStart(2, '0')}</b><span>{step.label}<small>{Math.round(step.holdMs / 1000)} sec · {step.transitionFromPrevious.mode === 'cut' ? 'Cut' : 'Transition unavailable'}{effectivePlaying && step.id === playback.stepId ? ' · Playing' : ''}</small></span></button>
          <div className="sexp-step-move"><button aria-label={`Move ${step.label} earlier`} disabled={!index} onClick={() => update(moveSceneStep(scene, step.id, -1))}>↑</button><button aria-label={`Move ${step.label} later`} disabled={index === scene.steps.length - 1} onClick={() => update(moveSceneStep(scene, step.id, 1))}>↓</button></div>
        </article>)}</div>
      </section>

      <aside className="sexp-inspector" aria-label="Scene controls">
        <label><span>Step name</span><input value={selectedStep.label} onChange={event => update(patchSceneStep(scene, selectedStep.id, { label: event.target.value }))} /></label>
        <div className="sexp-inline"><label><span>Hold</span><select value={selectedStep.holdMs} onChange={event => update(patchSceneStep(scene, selectedStep.id, { holdMs: Number(event.target.value) }))}><option value="10000">10 sec</option><option value="30000">30 sec</option><option value="60000">1 min</option><option value="120000">2 min</option></select></label><label><span>Transition</span><select value={selectedStep.transitionFromPrevious.mode} onChange={event => update(patchSceneStep(scene, selectedStep.id, { transitionFromPrevious: { mode: event.target.value, durationMs: 0 } }))}><option value="cut">Cut · card ready</option>{selectedStep.transitionFromPrevious.mode !== 'cut' && <option value={selectedStep.transitionFromPrevious.mode}>Saved source · preview unavailable</option>}</select></label></div>
        <div className="sexp-divider" />
        <div className="sexp-section-head"><div><span>SIMULTANEOUS AREAS</span><h2>What plays together</h2></div><button type="button" onClick={() => { update(addSceneAssignment(scene, selectedStep.id, catalog.areas.find(area => area.kind === 'strip')?.id || 'all')); setSelectedAssignment(selectedStep.assignments.length); }}>+ Area</button></div>
        <div className="sexp-assignment-tabs">{selectedStep.assignments.length ? selectedStep.assignments.map((item, index) => <button key={`${item.selection.areaIds.join('-')}-${index}`} className={index === selectedAssignment ? 'active' : ''} onClick={() => setSelectedAssignment(index)}>{catalog.areas.find(area => area.id === item.selection.areaIds[0])?.name || 'Missing area'}</button>) : <button className="active">Inherited</button>}</div>
        {hasMixedSelection && <p className="sexp-mixed">Mixed values across these areas. Changing a control applies that value to the selection.</p>}
        {repeatPerSectionAreaIds.length > 0 && <div className="sexp-repeat-choice"><p>This pattern treats the selected parent as one shared domain, which this preview cannot render.</p><button type="button" onClick={() => update(repeatSceneAssignmentPerSection(scene, selectedStep.id, selectedAssignment, catalog))}>Repeat per section</button></div>}
        <fieldset><legend>Where</legend><div className="sexp-targets">{catalog.areas.map(area => <label key={area.id} className={area.kind !== 'strip' ? 'parent' : ''}><input type="checkbox" checked={(assignment?.selection.areaIds || ['all']).includes(area.id)} onChange={() => {
          const current = assignment?.selection.areaIds || ['all'];
          const areaIds = area.kind === 'strip'
            ? (current.includes(area.id)
                ? current.filter(id => id !== area.id)
                : [...current.filter(id => catalog.areas.find(candidate => candidate.id === id)?.kind === 'strip'), area.id])
            : [area.id];
          if (areaIds.length) patchAssignment({ selection: { areaIds, domain: 'repeat' } });
        }} /><span>{area.name}</span></label>)}</div></fieldset>
        <label><span>Pattern</span><select aria-label="Scene pattern" value={assignment?.pattern?.rendererId || inheritedState.pattern.rendererId} onChange={event => patchAssignment({ pattern: { rendererId: event.target.value } })}>{CORE_CARD_PATTERN_BANK.map(pattern => <option key={pattern.id} value={pattern.id}>{pattern.label}</option>)}</select></label>
        <label><span>Color model</span><select aria-label="Color model" value={assignment?.color?.kind || inheritedState.color.kind} onChange={event => patchAssignment({ color: event.target.value === 'palette' ? { kind: 'palette', colors: getPatternById(previewPatternId(assignment?.pattern?.rendererId || inheritedState.pattern.rendererId))?.pal || project.palette } : { ...DEFAULT_CARD_COLOR, kind: 'card-controls' } })}><option value="card-controls">Card color · exact</option><option value="palette">Palette · Studio preview</option></select></label>
        {(assignment?.color?.kind || inheritedState.color.kind) === 'palette' ? <label><span>Palette</span><div className="sexp-palette">{(assignment?.color?.colors || inheritedState.color.colors || []).map((color, index, colors) => <input key={index} type="text" aria-label={`Palette color ${index + 1}`} value={color} onChange={event => patchAssignment({ color: { kind: 'palette', colors: colors.map((item, itemIndex) => itemIndex === index ? event.target.value : item) } })} />)}</div><small>Rendered here and saved exactly; current card playback does not support full palettes.</small></label> : <label><span>Color</span><input type="range" aria-label="Color" min="0" max="255" value={assignment?.color?.customHue ?? inheritedState.color.customHue} onChange={event => patchAssignment({ color: { customHue: Number(event.target.value) } })} /><small>Firmware hue, saturation, breathe, drift, and shift are rendered through the card preview pipeline.</small></label>}
        <label><span>Speed</span><input type="range" aria-label="Speed" min="0.1" max="3" step="0.1" value={assignment?.pattern?.speed ?? inheritedState.pattern.speed} onChange={event => patchAssignment({ pattern: { speed: Number(event.target.value) } })} /></label>
        <label><span>Brightness</span><input type="range" aria-label="Brightness" min="0" max="1" step="0.05" value={assignment?.intensity?.brightness ?? inheritedState.intensity.brightness} onChange={event => patchAssignment({ intensity: { brightness: Number(event.target.value) } })} /></label>
        <div className="sexp-danger"><button type="button" disabled={selectedStep.assignments.length <= 1} onClick={() => { update(removeSceneAssignment(scene, selectedStep.id, selectedAssignment)); setSelectedAssignment(0); }}>Remove area</button><button type="button" disabled={scene.steps.length === 1} onClick={() => update(removeSceneStep(scene, selectedStep.id))}>Remove step</button></div>
        {!resolved.ok && <div className="sexp-issues"><strong>Needs attention</strong>{resolved.reasons.slice(0, 3).map((reason, index) => <p key={`${reason.code}-${index}`}>{reason.message}</p>)}</div>}
      </aside>
    </div>
  </main>;
}
