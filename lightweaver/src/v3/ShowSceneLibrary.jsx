import { inspectExpressionScenes } from '../lib/sceneExpressionProject.js';
import './show-scene-library.css';

function stepCue(scene) {
  const steps = Array.isArray(scene?.steps) ? scene.steps : [];
  if (!steps.length) return 'No steps';
  const first = steps[0];
  return `${steps.length} step${steps.length === 1 ? '' : 's'} · starts with ${first.label || 'Untitled step'}`;
}

export default function ShowSceneLibrary({ expressionScenes, onSelectScene, onOpenScene, busy = false }) {
  const inspection = inspectExpressionScenes(expressionScenes);
  if (!inspection.editable) {
    return <section className="sh-mod sh-scene-library sh-scene-library-unsupported" aria-label="Saved scenes">
      <div className="sec-h"><span className="t">Scenes</span><span className="line" /></div>
      <strong>Saved scenes need a newer Studio</strong>
      <p>{inspection.message} The stored source has been left unchanged.</p>
      <button type="button" className="btn" disabled={busy} onClick={() => onOpenScene?.(null)}>View saved source</button>
    </section>;
  }

  const scenes = Array.isArray(expressionScenes?.scenes) ? expressionScenes.scenes : [];
  const activeId = expressionScenes?.activeSceneId;
  if (!scenes.length) {
    return <section className="sh-mod sh-scene-library sh-scene-library-empty" aria-label="Saved scenes">
      <div className="sec-h"><span className="t">Scenes</span><span className="line" /></div>
      <strong>No saved scenes yet</strong>
      <p>Build a scene from this project’s real sections, then rehearse or install that same source.</p>
      <button type="button" className="btn" disabled={busy} onClick={() => onOpenScene?.(null)}>Create a scene</button>
    </section>;
  }

  return <section className="sh-mod sh-scene-library" aria-label="Saved scenes">
    <div className="sec-h"><span className="t">Scenes</span><span className="line" /></div>
    <p className="sh-scene-intro">Saved with this project. Selecting a scene changes the editor focus only.</p>
    <div className="sh-scene-list">
      {scenes.map(scene => {
        const selected = scene.id === activeId;
        return <article key={scene.id} className={selected ? 'selected' : ''} data-scene-id={scene.id}>
          <button
            type="button"
            className="sh-scene-choice"
            aria-label={`Select ${scene.name}`}
            aria-pressed={selected}
            onClick={() => onSelectScene?.(scene.id)}
          >
            <strong>{scene.name}</strong>
            <span>{stepCue(scene)}</span>
          </button>
          <button type="button" className="btn" disabled={busy} onClick={() => onOpenScene?.(scene.id)}>
            {selected ? 'Edit scene' : 'Open scene'}
          </button>
        </article>;
      })}
    </div>
  </section>;
}
