import { recipeFromPattern, renderPatternLabRecipeFrame } from '/src/lib/patternLabPatternAdapter.js';
import { listBuiltInPatterns } from '/src/lib/patternRegistry.js';
import { compileWiring } from '/src/lib/wiringCompiler.js';
import {
  buildSceneExpressionAreaCatalog,
  resolveSceneExpressionSelection,
} from '/src/lib/sceneExpressionTargets.js';
import { FIXTURES, fixtureStrips } from './fixtures.js';

const STORAGE_KEY = 'lightweaver.expressionPrototype.scenes.v1';
const INSTALL_KEY = 'lightweaver.expressionPrototype.installations.v1';
const PATTERNS = listBuiltInPatterns().filter(pattern => !pattern.id.startsWith('debug')).slice(0, 18);
const PATTERN_NAMES = Object.fromEntries(PATTERNS.map(pattern => [pattern.id, pattern.name]));
const PALETTES = {
  ember: ['#160803', '#8f3216', '#ee8540', '#ffe1a3'],
  violet: ['#140827', '#55217b', '#a653c7', '#efc5ff'],
  tide: ['#001d29', '#00677a', '#15b7b1', '#d4fff4'],
  dawn: ['#23112d', '#7d305d', '#df6b65', '#ffd58c'],
  moss: ['#0a1d12', '#2e6342', '#87a85c', '#f2df9b'],
};
const ICONS = {
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 5 11 7-11 7Z"/></svg>',
  stop: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7h10v10H7z"/></svg>',
  save: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h12l2 2v14H5zM8 4v6h8V4M8 20v-6h8v6"/></svg>',
  bolt: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m13 2-8 12h7l-1 8 8-12h-7z"/></svg>',
  card: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 9h4M7 13h7"/></svg>',
  layers: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5M3 16l9 5 9-5"/></svg>',
  section: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h16M8 6v12M16 6v12"/></svg>',
  layout: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h6v7H4zM14 4h6v4h-6zM14 12h6v8h-6zM4 15h6v5H4z"/></svg>',
  check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>',
  up: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 14 5-5 5 5"/></svg>',
  down: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5"/></svg>',
  copy: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="11" height="11" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/></svg>',
};

const clone = value => JSON.parse(JSON.stringify(value));
const uid = prefix => `${prefix}-${crypto.randomUUID()}`;
const config = (patternId, palette, speed = 1, brightness = 0.82) => ({ patternId, palette: [...palette], speed, brightness });
const behavior = (areaIds, domain, patternId, palette, speed = 1, brightness = 0.82) => ({
  id: uid('behavior'),
  target: { areaIds: [...areaIds], domain },
  ...config(patternId, palette, speed, brightness),
});

function makeInitialScene(fixtureKey = 'strip') {
  const fixture = FIXTURES[fixtureKey];
  const base = {
    schema: 'lightweaver-expression-scene/v1',
    id: uid('scene'),
    revision: 1,
    fixtureId: fixture.id,
    fixtureKey,
    name: fixtureKey === 'strip' ? 'Amber current' : 'Mandala breathing',
    selection: { areaIds: ['all'], domain: 'continuous' },
    selectedStepId: '',
    steps: [],
    updatedAt: new Date().toISOString(),
  };
  if (fixtureKey === 'strip') {
    base.steps = [
      makeStep('Three voices', 7, 1.4, [
        behavior(['strip:ribbon-1'], 'repeat', 'breathe', PALETTES.ember),
        behavior(['strip:ribbon-2'], 'repeat', 'chase', PALETTES.tide),
        behavior(['strip:ribbon-3'], 'repeat', 'sparkle', PALETTES.violet),
      ]),
      makeStep('One current', 9, 2.2, [behavior(['family:gallery-ribbon'], 'continuous', 'plasma', PALETTES.dawn)]),
    ];
  } else {
    base.steps = [
      makeStep('Petals rise', 8, 2, [
        behavior(['strip:center'], 'repeat', 'breathe', PALETTES.ember, 1, 0.34),
        behavior(['group:rings'], 'continuous', 'gradient', PALETTES.violet),
        behavior(['group:petals'], 'continuous', 'ripple', PALETTES.dawn),
      ]),
      makeStep('Rings answer', 10, 2.6, [
        behavior(['strip:center'], 'repeat', 'breathe', PALETTES.moss, 1, 0.22),
        behavior(['group:rings'], 'continuous', 'scanner', PALETTES.tide),
        behavior(['group:petals'], 'repeat', 'gradient', PALETTES.ember),
      ]),
    ];
  }
  base.selectedStepId = base.steps[0].id;
  return base;
}

function makeStep(name, hold, transition, behaviors) {
  return { id: uid('step'), name, hold, transition, behaviors };
}

let scene = makeInitialScene('strip');
let dirty = false;
let demoState = 'changed';
let isPlaying = false;
let playStartedAt = 0;
let playOffset = 0;
let layoutOpen = false;
let toastTimer = 0;
let renderFault = '';

const app = document.querySelector('#app');

function currentFixture() { return FIXTURES[scene.fixtureKey]; }
function currentStep() { return scene.steps.find(step => step.id === scene.selectedStepId) || scene.steps[0]; }
function currentCatalog() {
  const { strips, sectionFamilies, layerGroups, wiring } = currentFixture().layout;
  const compiledWiring = compileWiring({ wiring, strips, groups: layerGroups });
  return buildSceneExpressionAreaCatalog({ strips, sectionFamilies, layerGroups, compiledWiring });
}
function areaById(id) { return currentCatalog().areas.find(area => area.id === id); }
function stripIdsForAreaIds(areaIds) { return [...new Set(areaIds.flatMap(id => areaById(id)?.stripIds || []))]; }
function selectedStripIds() { return stripIdsForAreaIds(scene.selection.areaIds); }
function behaviorStripIds(item) { return stripIdsForAreaIds(item.target.areaIds); }
function overlapsSelection(item) {
  const selected = new Set(selectedStripIds());
  return behaviorStripIds(item).some(id => selected.has(id));
}
function selectedConfigs() { return currentStep().behaviors.filter(overlapsSelection); }
function uniform(key) {
  const values = selectedConfigs().map(item => JSON.stringify(item[key]));
  return values.length && values.every(value => value === values[0]) ? selectedConfigs()[0][key] : null;
}
function stepSummary(step) {
  const ids = [...new Set(step.behaviors.map(item => item.patternId))];
  return ids.length === 1 ? PATTERN_NAMES[ids[0]] : `${ids.length} simultaneous behaviors`;
}
function targetName() {
  if (scene.selection.areaIds.length > 1) return `${scene.selection.areaIds.length} areas`;
  return areaById(scene.selection.areaIds[0])?.name || 'Selection';
}

function render() {
  const fixture = currentFixture();
  const step = currentStep();
  const selected = selectedConfigs();
  const savedScenes = loadScenes();
  const savedLocally = savedScenes.some(item => item.id === scene.id);
  const status = statusModel();
  const patternValue = uniform('patternId') || '';
  const speedValue = uniform('speed');
  const brightnessValue = uniform('brightness');
  const palette = uniform('palette') || selected[0]?.palette || PALETTES.ember;

  app.innerHTML = `
    <main class="app-shell">
      <header class="topbar">
        <div class="brand"><span class="brand-mark"></span>Lightweaver</div>
        <div class="crumb">Studio <span aria-hidden="true">/</span> <strong>${fixture.name}</strong> <span aria-hidden="true">/</span> Expression</div>
        <div class="top-actions">
          <select class="demo-select" id="demo-state" aria-label="Demonstration state">
            ${['disconnected','changed','installing','failed','success'].map(value => `<option value="${value}" ${demoState === value ? 'selected' : ''}>Demo: ${value}</option>`).join('')}
          </select>
          <span class="status-chip ${status.className}">${status.label}</span>
        </div>
      </header>
      <section class="scene-head">
        <div class="scene-identity">
          <input id="scene-name" class="scene-name" value="${escapeHtml(scene.name)}" aria-label="Scene name" />
          <span class="status-chip ${dirty || !savedLocally ? 'changed' : 'success'}">${dirty ? 'Changed' : savedLocally ? 'Saved locally' : 'New scene'}</span>
        </div>
        <div class="head-actions">
          <button class="button save-scene" id="save-scene">${ICONS.save}Save scene</button>
          <button class="button ${isPlaying ? 'live' : ''}" id="try-lights" ${status.canTry ? '' : 'disabled'}>${isPlaying ? ICONS.stop + 'Stop trying' : ICONS.bolt + 'Try on lights'}</button>
          <button class="button primary" id="put-card" ${status.canInstall ? '' : 'disabled'}>${ICONS.card}${status.installLabel}</button>
        </div>
      </section>
      <section class="workspace">
        ${layoutOpen ? layoutTemplate(fixture) : editorTemplate({ fixture, step, selected, savedScenes, patternValue, speedValue, brightnessValue, palette })}
      </section>
    </main>`;
  bindEvents();
  requestAnimationFrame(sizeCanvas);
}

function editorTemplate({ fixture, step, selected, savedScenes, patternValue, speedValue, brightnessValue, palette }) {
  const catalog = currentCatalog();
  const groups = catalog.areas.filter(area => area.kind === 'family' || area.kind === 'group');
  const sections = catalog.areas.filter(area => area.kind === 'strip');
  const resolution = resolveSceneExpressionSelection(catalog, scene.selection);
  return `
    <aside class="panel targets">
      <div class="panel-title"><h2>Artwork areas</h2><span>from Layout</span></div>
      <div class="fixture-switch" role="group" aria-label="Artwork fixture">
        <button data-fixture="strip" class="${scene.fixtureKey === 'strip' ? 'active' : ''}">3 sections</button>
        <button data-fixture="mandala" class="${scene.fixtureKey === 'mandala' ? 'active' : ''}">Mandala</button>
      </div>
      <div class="target-list">
        ${targetRow(catalog.areas.find(area => area.id === 'all'))}
      </div>
      ${groups.length ? `<div class="target-group-label">Groups</div><div class="target-list">${groups.map(targetRow).join('')}</div>` : ''}
      <div class="target-group-label">Sections</div>
      <div class="target-list">${sections.map(targetRow).join('')}</div>
      <button class="button quiet layout-link" id="open-layout">${ICONS.layout}Open Layout</button>
    </aside>
    <section class="preview-panel">
      <div class="preview-toolbar">
        <div class="preview-title"><strong>${escapeHtml(fixture.name)}</strong><span>${escapeHtml(targetName())} · ${escapeHtml(step.name)}</span></div>
        <div class="preview-meta">${fixture.layout.strips.reduce((sum, strip) => sum + strip.pixelCount, 0)} LEDs · simulated hardware</div>
      </div>
      <div class="canvas-wrap">
        <canvas id="artwork" aria-label="Animated artwork preview. Select an area directly on the artwork."></canvas>
        <span class="canvas-hint">Select an area on the artwork</span>
      </div>
      <div class="preview-footer">
        <button class="icon-button" id="play-scene" aria-label="${isPlaying ? 'Stop scene' : 'Play scene'}">${isPlaying ? ICONS.stop : ICONS.play}</button>
        <div class="play-state"><strong>${isPlaying ? 'Playing' : 'Preview'}</strong> · <span id="playing-step">${escapeHtml(step.name)}</span>${renderFault ? ` · ${escapeHtml(renderFault)}` : ''}</div>
        <select class="select" id="saved-scene" aria-label="Saved scene" style="width:150px;min-height:30px">
          <option value="">Open saved…</option>
          ${savedScenes.map(item => `<option value="${item.id}">${escapeHtml(item.name)}</option>`).join('')}
        </select>
      </div>
    </section>
    <aside class="panel controls">
      <div class="panel-title"><h2>${escapeHtml(targetName())}</h2><span>${selectedStripIds().length} area${selectedStripIds().length === 1 ? '' : 's'}</span></div>
      <div class="field">
        <div class="field-head"><label for="pattern">Pattern</label><span class="field-value">${patternValue ? '' : 'Mixed'}</span></div>
        <select id="pattern" class="select">
          ${!patternValue ? '<option value="">Mixed — choose to replace</option>' : ''}
          ${PATTERNS.map(pattern => `<option value="${pattern.id}" ${pattern.id === patternValue ? 'selected' : ''}>${escapeHtml(pattern.name)}</option>`).join('')}
        </select>
      </div>
      <div class="field">
        <div class="field-head"><span>Colors</span><span class="field-value">Editable source</span></div>
        <div class="palette">${palette.slice(0, 4).map((color, index) => `<input type="color" data-palette="${index}" value="${color}" aria-label="Palette color ${index + 1}" />`).join('')}</div>
      </div>
      <div class="field">
        <div class="field-head"><span>Pattern across selection</span><span class="field-value">${scene.selection.domain === 'continuous' ? 'One path' : 'Independent'}</span></div>
        <div class="seg" role="group" aria-label="Spatial pattern mode">
          <button data-spatial="continuous" class="${scene.selection.domain === 'continuous' ? 'active' : ''}">Continuous across</button>
          <button data-spatial="repeat" class="${scene.selection.domain === 'repeat' ? 'active' : ''}">Repeat per area</button>
        </div>
      </div>
      <div class="field">
        <div class="field-head"><label for="speed">Pace</label><span class="field-value">${speedValue == null ? 'Mixed' : `${speedValue.toFixed(2)}×`}</span></div>
        <input id="speed" type="range" min="0.25" max="2" step="0.05" value="${speedValue ?? selected[0]?.speed ?? 1}" />
      </div>
      <div class="field">
        <div class="field-head"><label for="brightness">Brightness</label><span class="field-value">${brightnessValue == null ? 'Mixed' : `${Math.round(brightnessValue * 100)}%`}</span></div>
        <input id="brightness" type="range" min="0.05" max="1" step="0.01" value="${brightnessValue ?? selected[0]?.brightness ?? 0.82}" />
      </div>
      <div class="divider"></div>
      <div class="panel-title"><h2>Step timing</h2><span>${scene.steps.findIndex(item => item.id === step.id) + 1} of ${scene.steps.length}</span></div>
      <div class="field">
        <div class="field-head"><label for="hold">Hold</label><span class="field-value">seconds</span></div>
        <input class="number" id="hold" type="number" min="1" max="120" step="0.5" value="${step.hold}" />
      </div>
      <div class="field">
        <div class="field-head"><label for="transition">Transition preview</label><span class="field-value">seconds</span></div>
        <input class="number" id="transition" type="number" min="0" max="30" step="0.1" value="${step.transition}" />
      </div>
      <div class="mapping-note">${resolution.ok ? ICONS.check : ICONS.section}<span>${resolution.ok ? 'Targets retain Layout IDs' : escapeHtml(resolution.errors[0]?.message || 'Target needs reassignment')}</span></div>
    </aside>
    ${timelineTemplate()}`;
}

function targetRow(item) {
  const active = scene.selection.areaIds.length === 1 && scene.selection.areaIds[0] === item.id;
  const itemStrips = new Set(item.stripIds);
  const patterns = [...new Set(currentStep().behaviors.filter(entry => behaviorStripIds(entry).some(id => itemStrips.has(id))).map(entry => entry.patternId))];
  const label = patterns.length === 1 ? PATTERN_NAMES[patterns[0]] : `${patterns.length} patterns`;
  return `<button class="target-row ${active ? 'active' : ''}" data-target-id="${item.id}">
    <span class="target-icon">${item.kind === 'strip' ? ICONS.section : ICONS.layers}</span>
    <span class="target-name">${escapeHtml(item.name)}</span><span class="target-pattern">${escapeHtml(label)}</span>
  </button>`;
}

function timelineTemplate() {
  return `<section class="timeline">
    <div class="timeline-top"><h2>Scene steps</h2><button class="button" id="duplicate-step">${ICONS.copy}Duplicate</button><span style="margin-left:auto;color:var(--text-low);font:10.5px var(--font-mono)">${scene.steps.reduce((sum, step) => sum + step.hold + step.transition, 0).toFixed(1)} s loop</span></div>
    <div class="timeline-scroll">
      ${scene.steps.map((step, index) => `<button class="step-card ${step.id === scene.selectedStepId ? 'active' : ''}" data-step="${step.id}">
        <span class="step-head"><span class="step-index">${index + 1}</span><span class="step-name">${escapeHtml(step.name)}</span><span class="step-actions">
          <span class="icon-button" role="button" tabindex="0" data-move="up" data-step-id="${step.id}" aria-label="Move step earlier">${ICONS.up}</span>
          <span class="icon-button" role="button" tabindex="0" data-move="down" data-step-id="${step.id}" aria-label="Move step later">${ICONS.down}</span>
        </span></span>
        <span class="step-summary">${escapeHtml(stepSummary(step))} · ${step.hold}s + ${step.transition}s</span>
      </button>`).join('')}
      <button class="add-step" id="add-step">+ Add step</button>
    </div>
  </section>`;
}

function layoutTemplate(fixture) {
  const sections = currentCatalog().areas.filter(area => area.kind === 'strip');
  return `<section class="layout-view">
    <div class="layout-stage"><canvas id="artwork" aria-label="Layout area map"></canvas></div>
    <aside class="layout-side">
      <h2>${escapeHtml(fixture.name)}</h2>
      <p>${escapeHtml(fixture.description)}</p>
      <div class="target-group-label">Mapped areas</div>
      <div class="target-list">${sections.map(section => `<div class="target-row"><span class="target-icon">${ICONS.section}</span><span class="target-name">${escapeHtml(section.name)}</span><span class="target-pattern">${section.sourceRefs[0]?.sourceLeds.length || 0} LEDs</span></div>`).join('')}</div>
      <button class="button primary layout-link" id="close-layout">Back to expression</button>
    </aside>
  </section>`;
}

function bindEvents() {
  document.querySelector('#demo-state')?.addEventListener('change', event => { demoState = event.target.value; if (demoState !== 'success') isPlaying = false; render(); });
  document.querySelector('#scene-name')?.addEventListener('input', event => { scene.name = event.target.value; setDirty(); });
  document.querySelector('#save-scene')?.addEventListener('click', saveScene);
  document.querySelector('#try-lights')?.addEventListener('click', () => { isPlaying = !isPlaying; playStartedAt = performance.now(); playOffset = 0; notify(isPlaying ? 'Live try started — simulated, no card request sent.' : 'Live try stopped.'); render(); });
  document.querySelector('#put-card')?.addEventListener('click', installScene);
  document.querySelectorAll('[data-fixture]').forEach(button => button.addEventListener('click', () => switchFixture(button.dataset.fixture)));
  document.querySelectorAll('[data-target-id]').forEach(button => button.addEventListener('click', () => selectTarget(button.dataset.targetId)));
  document.querySelector('#open-layout')?.addEventListener('click', () => { layoutOpen = true; render(); });
  document.querySelector('#close-layout')?.addEventListener('click', () => { layoutOpen = false; render(); });
  document.querySelector('#saved-scene')?.addEventListener('change', event => { if (event.target.value) openSaved(event.target.value); });
  document.querySelector('#play-scene')?.addEventListener('click', () => { isPlaying = !isPlaying; playStartedAt = performance.now(); playOffset = 0; render(); });
  document.querySelector('#pattern')?.addEventListener('change', event => { if (event.target.value) applyToSelection(item => { item.patternId = event.target.value; }); });
  document.querySelectorAll('[data-palette]').forEach(input => input.addEventListener('input', event => applyToSelection(item => { item.palette[Number(event.target.dataset.palette)] = event.target.value; }, false)));
  document.querySelectorAll('[data-spatial]').forEach(button => button.addEventListener('click', () => {
    scene.selection.domain = button.dataset.spatial;
    applyToSelection(() => {});
  }));
  document.querySelector('#speed')?.addEventListener('input', event => applyToSelection(item => { item.speed = Number(event.target.value); }, false));
  document.querySelector('#brightness')?.addEventListener('input', event => applyToSelection(item => { item.brightness = Number(event.target.value); }, false));
  document.querySelector('#hold')?.addEventListener('change', event => { currentStep().hold = bounded(event.target.value, 1, 120); setDirty(); render(); });
  document.querySelector('#transition')?.addEventListener('change', event => { currentStep().transition = bounded(event.target.value, 0, 30); setDirty(); render(); });
  document.querySelectorAll('[data-step]').forEach(button => button.addEventListener('click', event => { if (event.target.closest('[data-move]')) return; scene.selectedStepId = button.dataset.step; render(); }));
  document.querySelectorAll('[data-move]').forEach(button => {
    const move = () => moveStep(button.dataset.stepId, button.dataset.move === 'up' ? -1 : 1);
    button.addEventListener('click', event => { event.stopPropagation(); move(); });
    button.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); move(); } });
  });
  document.querySelector('#duplicate-step')?.addEventListener('click', duplicateStep);
  document.querySelector('#add-step')?.addEventListener('click', addStep);
  document.querySelector('#artwork')?.addEventListener('click', selectArtworkArea);
}

function switchFixture(key) {
  if (key === scene.fixtureKey) return;
  const next = makeInitialScene(key);
  next.id = scene.id;
  next.revision = scene.revision;
  scene = next;
  isPlaying = false;
  setDirty();
  render();
}

function selectTarget(id) {
  scene.selection = { areaIds: [id], domain: scene.selection.domain };
  render();
}
function applyToSelection(mutator, rerender = true) {
  const step = currentStep();
  const selectedIds = selectedStripIds();
  const selectedSet = new Set(selectedIds);
  const exact = step.behaviors.find(item => (
    item.target.domain === scene.selection.domain
    && JSON.stringify(item.target.areaIds) === JSON.stringify(scene.selection.areaIds)
  ));
  let targetBehavior = exact;
  if (!targetBehavior) {
    const source = selectedConfigs()[0] || config('breathe', PALETTES.ember);
    const retained = [];
    for (const item of step.behaviors) {
      const itemStrips = behaviorStripIds(item);
      if (!itemStrips.some(id => selectedSet.has(id))) { retained.push(item); continue; }
      itemStrips.filter(id => !selectedSet.has(id)).forEach(id => retained.push({
        ...clone(item), id: uid('behavior'), target: { areaIds: [`strip:${id}`], domain: 'repeat' },
      }));
    }
    targetBehavior = {
      id: uid('behavior'),
      target: clone(scene.selection),
      patternId: source.patternId,
      palette: clone(source.palette),
      speed: source.speed,
      brightness: source.brightness,
    };
    step.behaviors = [...retained, targetBehavior];
  }
  mutator(targetBehavior);
  setDirty();
  if (rerender) render();
}
function setDirty() { dirty = true; if (demoState === 'success') demoState = 'changed'; }

function duplicateStep() {
  const source = clone(currentStep());
  source.id = uid('step');
  source.name = `${source.name} copy`;
  const index = scene.steps.findIndex(step => step.id === scene.selectedStepId);
  scene.steps.splice(index + 1, 0, source);
  scene.selectedStepId = source.id;
  setDirty(); render();
}
function addStep() {
  const behaviors = [behavior(['all'], 'continuous', 'breathe', PALETTES.ember)];
  const step = makeStep(`Step ${scene.steps.length + 1}`, 8, 1.5, behaviors);
  scene.steps.push(step); scene.selectedStepId = step.id; setDirty(); render();
}
function moveStep(id, delta) {
  const index = scene.steps.findIndex(step => step.id === id);
  const next = Math.max(0, Math.min(scene.steps.length - 1, index + delta));
  if (index === next) return;
  const [step] = scene.steps.splice(index, 1); scene.steps.splice(next, 0, step); setDirty(); render();
}

function saveScene() {
  const scenes = loadScenes();
  scene.updatedAt = new Date().toISOString();
  scene.revision += dirty ? 1 : 0;
  const clean = clone(scene);
  const index = scenes.findIndex(item => item.id === scene.id);
  if (index >= 0) scenes[index] = clean; else scenes.push(clean);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(scenes));
  dirty = false;
  notify('Scene saved locally with its exact editable source.');
  render();
}
function openSaved(id) {
  const saved = loadScenes().find(item => item.id === id);
  if (!saved) return;
  scene = clone(saved); dirty = false; isPlaying = false; layoutOpen = false;
  notify('Saved scene reopened. Area and step IDs are unchanged.'); render();
}
function loadScenes() {
  try { const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); return Array.isArray(value) ? value : []; }
  catch { return []; }
}
function installScene() {
  if (demoState === 'failed') { notify('Card rejected the simulated package. Your editable scene is unchanged.', true); return; }
  demoState = 'installing'; render();
  setTimeout(() => {
    const installed = loadInstallations();
    installed[scene.id] = { sceneId: scene.id, revision: scene.revision, installedAt: new Date().toISOString(), sceneSource: clone(scene), simulated: true };
    localStorage.setItem(INSTALL_KEY, JSON.stringify(installed));
    demoState = 'success'; dirty = false;
    notify('Simulated install complete. Editable source was included; no card request was sent.'); render();
  }, 900);
}
function loadInstallations() { try { return JSON.parse(localStorage.getItem(INSTALL_KEY) || '{}') || {}; } catch { return {}; } }

function statusModel() {
  const installed = loadInstallations()[scene.id];
  const labels = {
    disconnected: { label: 'Card disconnected', className: '', canTry: false, canInstall: false, installLabel: 'Put on card' },
    changed: { label: installed ? 'Changes not on card' : 'Not on card', className: 'changed', canTry: true, canInstall: true, installLabel: installed ? 'Update card' : 'Put on card' },
    installing: { label: 'Installing…', className: 'installing', canTry: false, canInstall: false, installLabel: 'Installing…' },
    failed: { label: 'Install failed', className: 'failed', canTry: true, canInstall: true, installLabel: 'Try card again' },
    success: { label: 'On card · source included', className: 'success', canTry: true, canInstall: true, installLabel: 'Update card' },
  };
  return labels[demoState];
}

function selectArtworkArea(event) {
  if (layoutOpen) return;
  const canvas = event.currentTarget;
  const rect = canvas.getBoundingClientRect();
  const point = { x: (event.clientX - rect.left) / rect.width, y: (event.clientY - rect.top) / rect.height };
  const transform = canvasTransform(currentFixture(), rect.width, rect.height);
  let nearest = { id: '', distance: Infinity };
  currentFixture().layout.strips.forEach(section => section.pts.forEach(item => {
    const px = (transform.x(item.x) - transform.padX) / transform.drawW;
    const py = (transform.y(item.y) - transform.padY) / transform.drawH;
    const distance = Math.hypot(point.x - px, point.y - py);
    if (distance < nearest.distance) nearest = { id: section.id, distance };
  }));
  if (nearest.id) { scene.selection = { areaIds: [`strip:${nearest.id}`], domain: 'repeat' }; render(); }
}

let canvasObserver;
function sizeCanvas() {
  const canvas = document.querySelector('#artwork');
  if (!canvas) return;
  canvasObserver?.disconnect();
  canvasObserver = new ResizeObserver(() => {
    const rect = canvas.getBoundingClientRect();
    const ratio = Math.min(devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.round(rect.width * ratio));
    const height = Math.max(1, Math.round(rect.height * ratio));
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
  });
  canvasObserver.observe(canvas);
}

function playbackAt(now) {
  if (!isPlaying) return { step: currentStep(), localTime: now / 1000 };
  const total = scene.steps.reduce((sum, step) => sum + step.hold + step.transition, 0);
  const elapsed = ((now - playStartedAt) / 1000 + playOffset) % total;
  let cursor = 0;
  for (const step of scene.steps) {
    const duration = step.hold + step.transition;
    if (elapsed < cursor + duration) return { step, localTime: elapsed - cursor };
    cursor += duration;
  }
  return { step: scene.steps[0], localTime: 0 };
}

function drawFrame(now) {
  const canvas = document.querySelector('#artwork');
  if (canvas) {
    const ctx = canvas.getContext('2d');
    const ratio = Math.min(devicePixelRatio || 1, 2);
    const width = canvas.width / ratio;
    const height = canvas.height / ratio;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    drawArtwork(ctx, width, height, now);
  }
  requestAnimationFrame(drawFrame);
}

function drawArtwork(ctx, width, height, now) {
  const fixture = currentFixture();
  const { step, localTime } = playbackAt(now);
  const transform = canvasTransform(fixture, width, height);
  ctx.fillStyle = 'oklch(12.8% 0.006 72)'; ctx.fillRect(0, 0, width, height);
  drawGuides(ctx, width, height, fixture);
  const colorsById = renderColors(fixture, step, localTime);
  fixture.layout.strips.forEach(section => {
    const colors = colorsById[section.id] || [];
    const selected = selectedStripIds().includes(section.id);
    section.pts.forEach((point, index) => {
      const color = colors[index] || { r: 50, g: 50, b: 50 };
      const x = transform.x(point.x), y = transform.y(point.y);
      const radius = selected ? 3.7 : 2.8;
      const css = `rgb(${color.r} ${color.g} ${color.b})`;
      ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fillStyle = css; ctx.fill();
      if (color.r + color.g + color.b > 160) { ctx.shadowColor = css; ctx.shadowBlur = selected ? 9 : 5; ctx.fill(); ctx.shadowBlur = 0; }
    });
    if (selected) {
      ctx.beginPath();
      section.pts.forEach((point, index) => { const x = transform.x(point.x), y = transform.y(point.y); index ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
      ctx.strokeStyle = 'oklch(72% 0.11 60 / .34)'; ctx.lineWidth = 12; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke();
    }
  });
  const playingLabel = document.querySelector('#playing-step');
  if (playingLabel && playingLabel.textContent !== step.name) playingLabel.textContent = step.name;
  document.querySelectorAll('.step-card').forEach(card => card.classList.toggle('playing', isPlaying && card.dataset.step === step.id));
}

function drawGuides(ctx, width, height, fixture) {
  ctx.save(); ctx.strokeStyle = 'oklch(33% 0.008 75 / .25)'; ctx.lineWidth = 1;
  if (fixture.kind === 'mandala') {
    const size = Math.min(width, height) * 0.72;
    ctx.beginPath(); ctx.arc(width / 2, height / 2, size * 0.44, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(width / 2, height / 2, size * 0.27, 0, Math.PI * 2); ctx.stroke();
  } else {
    ctx.beginPath(); ctx.moveTo(width * 0.08, height * 0.5); ctx.lineTo(width * 0.92, height * 0.5); ctx.stroke();
  }
  ctx.restore();
}

function renderColors(fixture, step, t) {
  const output = Object.fromEntries(fixture.layout.strips.map(strip => [strip.id, strip.pts.map(() => ({ r: 24, g: 22, b: 21 }))]));
  const stripsById = new Map(fixtureStrips(fixture).map(strip => [strip.id, strip]));
  const catalog = currentCatalog();
  renderFault = '';
  step.behaviors.forEach(item => {
    const resolved = resolveSceneExpressionSelection(catalog, item.target);
    if (!resolved.ok) {
      renderFault = resolved.errors[0]?.message || 'Target unresolved';
      return;
    }
    const domains = item.target.domain === 'continuous'
      ? [{
          areaId: item.target.areaIds.join('+'),
          refs: resolved.physicalRefs.map(ref => ({ stripId: ref.stripId, sourceLed: ref.sourceLed })),
        }]
      : resolved.instances.map(instance => ({
          areaId: instance.areaId,
          refs: instance.sourceRefs.flatMap(ref => ref.sourceLeds.map(sourceLed => ({ stripId: ref.stripId, sourceLed }))),
        }));
    domains.forEach(domain => {
      const virtualPoints = domain.refs.map(ref => stripsById.get(ref.stripId)?.pts[ref.sourceLed]).filter(Boolean);
      if (!virtualPoints.length) return;
      const virtualStrip = {
        id: `domain:${item.id}:${domain.areaId}`,
        brightness: 1,
        speed: 1,
        pts: virtualPoints.map((point, index) => ({ ...point, p: virtualPoints.length <= 1 ? 0 : index / (virtualPoints.length - 1), stripProgress: virtualPoints.length <= 1 ? 0 : index / (virtualPoints.length - 1) })),
      };
    try {
      const recipe = recipeFromPattern(item.patternId, { palette: item.palette });
      recipe.playback = { ...recipe.playback, speed: item.speed, brightness: item.brightness };
        const frame = renderPatternLabRecipeFrame(recipe, { strips: [virtualStrip], t: t * item.speed, masterBrightness: item.brightness });
        domain.refs.forEach((ref, index) => { output[ref.stripId][ref.sourceLed] = frame.pixels[index]; });
    } catch (error) {
      renderFault = 'Renderer fallback';
        domain.refs.forEach(ref => { output[ref.stripId][ref.sourceLed] = { r: 143, g: 78, b: 38 }; });
      console.error(error);
    }
    });
  });
  return output;
}

function canvasTransform(fixture, width, height) {
  const all = fixture.layout.strips.flatMap(section => section.pts);
  const minX = Math.min(...all.map(point => point.x)), maxX = Math.max(...all.map(point => point.x));
  const minY = Math.min(...all.map(point => point.y)), maxY = Math.max(...all.map(point => point.y));
  const padding = fixture.kind === 'mandala' ? 34 : 44;
  const rangeX = Math.max(0.01, maxX - minX), rangeY = Math.max(0.01, maxY - minY);
  const scale = Math.min((width - padding * 2) / rangeX, (height - padding * 2) / rangeY);
  const drawW = rangeX * scale, drawH = rangeY * scale;
  const padX = (width - drawW) / 2, padY = (height - drawH) / 2;
  return { x: x => padX + (x - minX) * scale, y: y => padY + (y - minY) * scale, padX, padY, drawW, drawH };
}

function notify(message, error = false) {
  clearTimeout(toastTimer);
  document.querySelector('.toast')?.remove();
  const toast = document.createElement('div'); toast.className = `toast ${error ? 'error' : ''}`; toast.textContent = message; document.body.append(toast);
  toastTimer = setTimeout(() => toast.remove(), 3400);
}
function bounded(value, min, max) { return Math.min(max, Math.max(min, Number(value) || min)); }
function escapeHtml(value) { return String(value).replace(/[&<>'"]/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' })[char]); }

render();
requestAnimationFrame(drawFrame);

window.__LIGHTWEAVER_EXPRESSION_PROTOTYPE__ = {
  getScene: () => clone(scene),
  getInstall: () => clone(loadInstallations()[scene.id] || null),
  storageKey: STORAGE_KEY,
  installKey: INSTALL_KEY,
};
