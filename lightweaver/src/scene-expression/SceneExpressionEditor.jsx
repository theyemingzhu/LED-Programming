import { useEffect, useMemo, useState } from 'react';
import { getCardPatternById, CORE_CARD_PATTERN_BANK } from '../lib/cardPatternBank.js';
import { normalizeSceneExpression, resolveSceneExpression } from '../lib/sceneExpression.js';
import { compileSceneExpressionNative } from '../lib/sceneExpressionNative.js';
import { buildSceneExpressionAreaCatalog } from '../lib/sceneExpressionTargets.js';
import { inspectExpressionScenes } from '../lib/sceneExpressionProject.js';
import { PatternPreview } from '../v3/PatternPreview.jsx';
import {
  addSceneAssignment, addSceneStep, createSceneExpression, DEFAULT_CARD_COLOR, moveSceneStep,
  patchSceneAssignment, patchSceneStep, removeSceneAssignment, removeSceneStep,
} from './sceneExpressionEditorModel.js';
import './scene-expression.css';

function previewPatternId(id) {
  const card = getCardPatternById(id);
  return card?.previewPatternId || card?.preset || id;
}

function huePalette(color = {}) {
  if (color.kind === 'palette' && Array.isArray(color.colors) && color.colors.length) return color.colors;
  const hue = Math.round(((Number(color.customHue) || 0) / 255) * 360);
  const saturation = Math.round(((Number(color.customSaturation) || 0) / 255) * 84);
  return [`hsl(${hue} ${saturation}% 12%)`, `hsl(${hue} ${saturation}% 48%)`, `hsl(${(hue + 34) % 360} ${saturation}% 72%)`];
}

function statusCopy(compilation) {
  if (compilation.ok) return { tone: 'ready', title: 'Ready for the card', body: 'Every choice has an exact native representation.' };
  const unsupported = compilation.reasons?.[0];
  return { tone: 'preview', title: 'Saved for Studio preview', body: unsupported?.message || 'This scene needs attention before card playback.' };
}

export default function SceneExpressionEditor({ project, onSaveProject, onClose }) {
  const store = project.expressionScenes;
  const storeInspection = inspectExpressionScenes(store);
  const storedScenes = Array.isArray(store?.scenes) ? store.scenes : [];
  const activeStored = storeInspection.editable ? (storedScenes.find(scene => scene.id === store?.activeSceneId) || storedScenes[0]) : null;
  const [scene, setScene] = useState(() => activeStored ? structuredClone(activeStored) : createSceneExpression({ id: `scene-${Date.now()}`, name: 'New scene' }));
  const [sourceProjectId, setSourceProjectId] = useState(project.projectId);
  const [selectedStepId, setSelectedStepId] = useState(scene.steps[0].id);
  const [selectedAssignment, setSelectedAssignment] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [saveState, setSaveState] = useState('idle');

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
    setSaveState('idle');
  }, [project.expressionScenes, project.projectId, sourceProjectId]);

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
  const assignment = selectedStep.assignments[selectedAssignment] || selectedStep.assignments[0];
  const resolvedStep = resolved.steps?.find(step => step.id === selectedStep.id);
  const previewStrips = project.strips.map(strip => {
    const state = resolvedStep?.states?.[strip.id] || scene.defaults;
    return {
      ...strip,
      patternId: previewPatternId(state.pattern.rendererId),
      speed: state.pattern.speed,
      brightness: state.intensity.brightness,
      palette: huePalette(state.color),
    };
  });

  function writeCanonicalSource(nextScene) {
    project.setExpressionScenes(current => ({
      ...current,
      version: 1,
      activeSceneId: nextScene.id,
      scenes: [...current.scenes.filter(item => item.id !== nextScene.id), nextScene],
    }));
  }
  function update(next) {
    const normalized = normalizeSceneExpression(next);
    setScene(normalized);
    writeCanonicalSource(normalized);
    setSaveState('idle');
  }
  function patchAssignment(patch) { update(patchSceneAssignment(scene, selectedStep.id, selectedAssignment, patch)); }
  function save() {
    writeCanonicalSource(scene);
    setSaveState('saving');
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
      <h1>This scene source needs a newer Studio</h1>
      <p>{storeInspection.message}</p>
      <p>The source is still stored exactly as it was. Open this project in a Studio version that supports it before editing scenes.</p>
      <button className="btn" type="button" onClick={onClose}>Back to Lab</button>
    </section>
  </main>;

  return <main className="screen sexp" data-testid="scene-expression-editor">
    <header className="sexp-head">
      <div>
        <span className="sexp-kicker">Studio · Lab · Scene</span>
        <input aria-label="Scene title" className="sexp-title" value={scene.name} onChange={event => update({ ...scene, name: event.target.value })} />
        <p>Give each area its own behavior, then arrange how the scene changes over time.</p>
      </div>
      <div className="sexp-head-actions">
        <button className="btn" type="button" onClick={onClose}>Back to Lab</button>
        <button className="btn primary" type="button" onClick={save} disabled={saveState === 'saving'}>{saveState === 'saving' ? 'Saving…' : 'Save scene'}</button>
      </div>
    </header>
    <div className={`sexp-status ${status.tone}`} role="status">
      <strong>{status.title}</strong><span>{status.body}</span>
      {saveState === 'saved' && <em>Project saved</em>}
      {saveState === 'error' && <em>Save failed. Your edits remain open.</em>}
    </div>
    <div className="sexp-grid">
      <section className="sexp-preview" aria-label="Scene preview">
        <div className="sexp-preview-bar"><span>Current artwork · {selectedStep.label}</span><button type="button" onClick={() => setPlaying(value => !value)}>{playing ? 'Pause' : 'Play'}</button></div>
        <div className="sexp-canvas">
          {project.strips.length ? <PatternPreview
            patternId="aurora" playing={playing} strips={previewStrips}
            viewBox={project.viewBox} svgText={project.svgText} hidden={project.hidden}
            palette={project.palette} ariaLabel={`${scene.name} preview`} testId="scene-expression-preview"
          /> : <div className="sexp-empty"><strong>Draw the artwork in Layout first</strong><span>This scene will use its exact strips and groups.</span></div>}
        </div>
      </section>

      <section className="sexp-timeline" aria-label="Scene steps">
        <div className="sexp-section-head"><div><span>ORDERED STEPS</span><h2>How the scene changes</h2></div><button type="button" onClick={() => { const next = addSceneStep(scene); update(next); setSelectedStepId(next.steps.at(-1).id); setSelectedAssignment(0); }}>+ Add step</button></div>
        <div className="sexp-step-list">{scene.steps.map((step, index) => <article key={step.id} className={step.id === selectedStep.id ? 'active' : ''}>
          <button className="sexp-step-main" type="button" onClick={() => { setSelectedStepId(step.id); setSelectedAssignment(0); }}><b>{String(index + 1).padStart(2, '0')}</b><span>{step.label}<small>{Math.round(step.holdMs / 1000)} sec · {step.transitionFromPrevious.mode === 'cut' ? 'Cut' : 'Preview blend'}</small></span></button>
          <div className="sexp-step-move"><button aria-label={`Move ${step.label} earlier`} disabled={!index} onClick={() => update(moveSceneStep(scene, step.id, -1))}>↑</button><button aria-label={`Move ${step.label} later`} disabled={index === scene.steps.length - 1} onClick={() => update(moveSceneStep(scene, step.id, 1))}>↓</button></div>
        </article>)}</div>
      </section>

      <aside className="sexp-inspector" aria-label="Scene controls">
        <label><span>Step name</span><input value={selectedStep.label} onChange={event => update(patchSceneStep(scene, selectedStep.id, { label: event.target.value }))} /></label>
        <div className="sexp-inline"><label><span>Hold</span><select value={selectedStep.holdMs} onChange={event => update(patchSceneStep(scene, selectedStep.id, { holdMs: Number(event.target.value) }))}><option value="10000">10 sec</option><option value="30000">30 sec</option><option value="60000">1 min</option><option value="120000">2 min</option></select></label><label><span>Transition</span><select value={selectedStep.transitionFromPrevious.mode} onChange={event => update(patchSceneStep(scene, selectedStep.id, { transitionFromPrevious: { mode: event.target.value, durationMs: 0 } }))}><option value="cut">Cut · card ready</option>{selectedStep.transitionFromPrevious.mode !== 'cut' && <option value={selectedStep.transitionFromPrevious.mode}>Saved source · preview unavailable</option>}</select></label></div>
        <div className="sexp-divider" />
        <div className="sexp-section-head"><div><span>SIMULTANEOUS AREAS</span><h2>What plays together</h2></div><button type="button" onClick={() => { update(addSceneAssignment(scene, selectedStep.id, catalog.areas.find(area => area.kind === 'strip')?.id || 'all')); setSelectedAssignment(selectedStep.assignments.length); }}>+ Area</button></div>
        <div className="sexp-assignment-tabs">{selectedStep.assignments.map((item, index) => <button key={`${item.selection.areaIds.join('-')}-${index}`} className={index === selectedAssignment ? 'active' : ''} onClick={() => setSelectedAssignment(index)}>{catalog.areas.find(area => area.id === item.selection.areaIds[0])?.name || 'Missing area'}</button>)}</div>
        <fieldset><legend>Where</legend><div className="sexp-targets">{catalog.areas.map(area => <label key={area.id} className={area.kind !== 'strip' ? 'parent' : ''}><input type="checkbox" checked={assignment.selection.areaIds.includes(area.id)} onChange={() => {
          const current = assignment.selection.areaIds;
          const areaIds = area.kind === 'strip'
            ? (current.includes(area.id)
                ? current.filter(id => id !== area.id)
                : [...current.filter(id => catalog.areas.find(candidate => candidate.id === id)?.kind === 'strip'), area.id])
            : [area.id];
          if (areaIds.length) patchAssignment({ selection: { areaIds, domain: 'repeat' } });
        }} /><span>{area.name}</span></label>)}</div></fieldset>
        <label><span>Pattern</span><select aria-label="Scene pattern" value={assignment.pattern?.rendererId || scene.defaults.pattern.rendererId} onChange={event => patchAssignment({ pattern: { rendererId: event.target.value } })}>{CORE_CARD_PATTERN_BANK.map(pattern => <option key={pattern.id} value={pattern.id}>{pattern.label}</option>)}</select></label>
        <label><span>Color model</span><select aria-label="Color model" value={assignment.color?.kind || scene.defaults.color.kind} onChange={event => patchAssignment({ color: event.target.value === 'palette' ? { kind: 'palette', colors: huePalette(assignment.color) } : { ...DEFAULT_CARD_COLOR, kind: 'card-controls' } })}><option value="card-controls">Card color · exact</option><option value="palette">Palette · Studio preview</option></select></label>
        {(assignment.color?.kind || scene.defaults.color.kind) === 'palette' ? <label><span>Palette</span><div className="sexp-palette">{huePalette(assignment.color).slice(0, 3).map((color, index, colors) => <input key={index} type="color" aria-label={`Palette color ${index + 1}`} value={color.startsWith('#') ? color : '#b47d56'} onChange={event => patchAssignment({ color: { kind: 'palette', colors: colors.map((item, itemIndex) => itemIndex === index ? event.target.value : item) } })} />)}</div><small>Rendered here and saved exactly; current card playback does not support full palettes.</small></label> : <label><span>Color</span><input type="range" aria-label="Color" min="0" max="255" value={assignment.color?.customHue ?? scene.defaults.color.customHue} onChange={event => patchAssignment({ color: { kind: 'card-controls', customHue: Number(event.target.value) } })} /><small>Card color · exact native control</small></label>}
        <label><span>Speed</span><input type="range" aria-label="Speed" min="0.1" max="3" step="0.1" value={assignment.pattern?.speed ?? scene.defaults.pattern.speed} onChange={event => patchAssignment({ pattern: { speed: Number(event.target.value) } })} /></label>
        <label><span>Brightness</span><input type="range" aria-label="Brightness" min="0" max="1" step="0.05" value={assignment.intensity?.brightness ?? scene.defaults.intensity.brightness} onChange={event => patchAssignment({ intensity: { brightness: Number(event.target.value) } })} /></label>
        <div className="sexp-danger"><button type="button" disabled={selectedStep.assignments.length === 1} onClick={() => { update(removeSceneAssignment(scene, selectedStep.id, selectedAssignment)); setSelectedAssignment(0); }}>Remove area</button><button type="button" disabled={scene.steps.length === 1} onClick={() => update(removeSceneStep(scene, selectedStep.id))}>Remove step</button></div>
        {!resolved.ok && <div className="sexp-issues"><strong>Needs attention</strong>{resolved.reasons.slice(0, 3).map((reason, index) => <p key={`${reason.code}-${index}`}>{reason.message}</p>)}</div>}
      </aside>
    </div>
  </main>;
}
