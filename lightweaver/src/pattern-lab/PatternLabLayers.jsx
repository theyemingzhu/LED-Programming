import { useEffect, useState } from 'react';
import { PATTERN_LAB_BLEND_MODES } from '../lib/patternLabCompositor.js';
import { PATTERN_LAB_MAX_LAYERS } from '../lib/patternLabRecipe.js';
import { patternLabLayerTarget } from '../lib/patternLabLayers.js';
import { parseParamsFromCode } from '../lib/patternParams.js';
import { isBuiltInPattern } from '../lib/patternRegistry.js';
import PatternKnobPanel from './PatternKnobPanel.jsx';
import './pattern-lab-layers.css';

export default function PatternLabLayers({ recipe, patterns, areas, scoped = false, baseScope = 'Whole piece', targetValidation, onAdd, onChange, onRemove, onMove }) {
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const layers = recipe?.layers || [];
  const selected = layers.find(layer => layer.id === selectedId) || null;
  const builtIns = patterns.filter(pattern => isBuiltInPattern(pattern.id));

  useEffect(() => {
    if (selectedId && !layers.some(layer => layer.id === selectedId)) setSelectedId(null);
  }, [layers, selectedId]);

  function add() {
    const id = onAdd?.();
    if (id) setSelectedId(id);
    setOpen(true);
  }

  function changePattern(patternId) {
    const pattern = builtIns.find(item => item.id === patternId);
    if (!pattern || !selected) return;
    onChange(selected.id, {
      name: pattern.name,
      generator: {
        kind: 'lightweaver-pattern', patternId,
        params: Object.fromEntries(parseParamsFromCode(pattern.code).map(param => [param.name, param.value])),
      },
    });
  }

  return (
    <section className="plab-layers" aria-label="Pattern layers" data-testid="pattern-lab-layers">
      <div className="plab-layers-heading">
        <button type="button" className="plab-layers-toggle" aria-expanded={open} onClick={() => setOpen(value => !value)}>
          <span>Layers</span><small>Base + {layers.length} of {PATTERN_LAB_MAX_LAYERS}</small><span aria-hidden="true">{open ? '−' : '+'}</span>
        </button>
        <button type="button" className="btn" disabled={!recipe || layers.length >= PATTERN_LAB_MAX_LAYERS} onClick={add}>{scoped ? 'Edit whole look to add layer' : 'Add layer'}</button>
      </div>
      {!open && !targetValidation?.valid && <p className="plab-layer-error" role="alert">{targetValidation.message} Open Layers to repair it.</p>}
      {open && <div className="plab-layers-body">
        <p className="plab-layers-hint">Top layers cover lower layers. The base plays underneath.</p>
        {[...layers].reverse().map((layer, visualIndex) => {
          const index = layers.length - visualIndex - 1;
          const target = layer.target;
          const area = areas.find(item => item.kind === 'section' && item.id === target?.id);
          const issue = targetValidation?.issues.find(item => item.layerId === layer.id);
          const targetName = target?.kind === 'section' ? area?.label || `${target.id} (missing)` : 'Whole piece';
          return <div key={layer.id} className="plab-layer-entry" data-invalid={issue ? 'true' : undefined}>
            <div className="plab-layer-row">
              <button type="button" className="plab-layer-select" aria-expanded={selectedId === layer.id} aria-label={`Edit ${layer.name || 'layer'}`} onClick={() => setSelectedId(selectedId === layer.id ? null : layer.id)}>
                <strong>{index + 1}. {layer.name || 'Layer'}</strong><span>{targetName}</span>
              </button>
              <label className="plab-layer-enabled"><input type="checkbox" checked={layer.enabled !== false} onChange={event => onChange(layer.id, { enabled: event.target.checked })} /><span>On</span></label>
            </div>
            {issue && <p className="plab-layer-error" role="alert">{issue.message}</p>}
            {selectedId === layer.id && <div className="plab-layer-inspector">
              <label>Pattern<select aria-label="Layer pattern" value={layer.generator?.patternId || ''} onChange={event => changePattern(event.target.value)}>
                {!builtIns.some(pattern => pattern.id === layer.generator?.patternId) && <option value="">Unknown pattern</option>}
                {builtIns.map(pattern => <option key={pattern.id} value={pattern.id}>{pattern.name}</option>)}
              </select></label>
              <label>Target<select aria-label="Layer target" value={target?.kind === 'section' ? target.id : 'all'} onChange={event => {
                const next = areas.find(item => item.id === event.target.value);
                if (next) onChange(layer.id, { target: patternLabLayerTarget(next) });
              }}>
                {target?.kind === 'section' && !area && <option value={target.id}>{target.id} (missing)</option>}
                {areas.map(item => <option key={item.id} value={item.id} disabled={item.kind === 'section' && !item.stripIds.length}>{item.label}</option>)}
              </select></label>
              <label>Blend<select aria-label="Layer blend" value={layer.blendMode || 'normal'} onChange={event => onChange(layer.id, { blendMode: event.target.value })}>
                {PATTERN_LAB_BLEND_MODES.map(mode => <option key={mode} value={mode}>{mode}</option>)}
              </select></label>
              <label className="plab-layer-opacity">Opacity <output>{Math.round((layer.opacity ?? 1) * 100)}%</output><input type="range" aria-label="Layer opacity" min="0" max="100" value={Math.round((layer.opacity ?? 1) * 100)} onChange={event => onChange(layer.id, { opacity: Number(event.target.value) / 100 })} /></label>
              {builtIns.some(pattern => pattern.id === layer.generator?.patternId) && <PatternKnobPanel
                patternId={layer.generator.patternId}
                code={builtIns.find(pattern => pattern.id === layer.generator.patternId).code}
                params={layer.generator.params || {}}
                onParamChange={(name, value) => onChange(layer.id, { generator: { ...layer.generator, params: { ...layer.generator.params, [name]: value } } })}
              />}
              <div className="plab-layer-actions">
                <button type="button" className="btn" disabled={index === layers.length - 1} onClick={() => onMove(layer.id, 1)}>Move above</button>
                <button type="button" className="btn" disabled={index === 0} onClick={() => onMove(layer.id, -1)}>Move below</button>
                <button type="button" className="btn" onClick={() => onRemove(layer.id)}>Delete layer</button>
              </div>
            </div>}
          </div>;
        })}
        <div className="plab-layer-row plab-layer-base"><strong>Base</strong><span>{recipe?.base?.sectionMix ? 'Section mix' : patterns.find(pattern => pattern.id === recipe?.base?.patternId)?.name || 'Starting pattern'}</span><span>{baseScope}</span></div>
        {recipe?.base?.sectionMix && <p className="plab-layers-hint">Each section keeps its pattern, color, speed, and brightness beneath these layers.</p>}
      </div>}
    </section>
  );
}
