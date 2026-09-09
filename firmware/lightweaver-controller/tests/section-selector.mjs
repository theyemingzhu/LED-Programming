// Visitor page "Section" selector — visitors on the card's own WiFi may pick
// a single zone (word-labelled buttons: "Whole piece" + one per zone) so
// subsequent pattern taps and slider moves target only that zone
// (zone:<id>, syncZones:false) instead of broadcasting. See LightweaverWeb.cpp
// (handleRoot) and the LW_SECTION_SELECTOR_START/END extraction markers there.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const sourcePath = path.resolve(import.meta.dirname, '../src/LightweaverWeb.cpp');
const source = fs.readFileSync(sourcePath, 'utf8');

// --- Structural checks: markup, CSS, and every control's POST body -------

assert.match(
  source,
  /<div class='section-row' id='section-row'><\/div>/,
  'visitor page should render an (initially empty) section row above the pattern grid',
);
assert.match(
  source,
  /\.section-row\{display:none/,
  'section row must stay hidden by default — single-zone cards never see it',
);
assert.match(
  source,
  /\.section-row\.on\{display:flex\}/,
  'section row must only appear once renderSections() toggles the .on class',
);

for (const [name, pattern] of [
  ['makeSender (brightness/speed/hueShift/hue/saturation sliders)',
    /await post\('\/api\/control',\{\[key\]:v,\.\.\.zoneField\(\)\}\)/],
  ['brightnessControl', /controlPost\(\{brightness:value,\.\.\.zoneField\(\)\}\)/],
  ['blackoutControl', /controlPost\(\{blackout:value,\.\.\.zoneField\(\)\}\)/],
  ['breathe toggle', /post\('\/api\/control',\{breathe:customBreathe,\.\.\.zoneField\(\)\}\)/],
  ['drift toggle', /post\('\/api\/control',\{drift:customDrift,\.\.\.zoneField\(\)\}\)/],
  ['drift palette buttons', /driftMin:lo,driftMax:hi,\.\.\.zoneField\(\)/],
  ['sendZonePattern (zone-targeted scene taps)', /controlPost\(\{patternId:id,\.\.\.zoneField\(\)\}\)/],
]) {
  assert.match(
    source,
    pattern,
    `${name} must route through zoneField() so a selected section posts zone + syncZones:false`,
  );
}
assert.match(
  source,
  /if\(sectionTarget\)\{sendZonePattern\(p\.id\)\}else\{sceneControl\.request\(p\.id\)\}/,
  'a pattern tap must route to sendZonePattern only while a specific section is selected, and to the unchanged whole-piece sceneControl otherwise',
);
assert.match(
  source,
  /send:async value=>\{const payload=await controlPost\(\{patternId:value,syncZones:true\}\);if\(payload\.appliedPatternId!==value\)throw new Error/,
  'the whole-piece scene path (sceneControl) must stay byte-for-byte the pre-existing broadcast behaviour',
);

// --- Executable checks: run the actual extracted section-selector module --

const startMarker = '/*LW_SECTION_SELECTOR_START*/';
const endMarker = '/*LW_SECTION_SELECTOR_END*/';
const start = source.indexOf(startMarker);
const end = source.indexOf(endMarker);
assert.notEqual(start, -1, 'section-selector module should have an extraction start marker');
assert.notEqual(end, -1, 'section-selector module should have an extraction end marker');

const cxxFragment = source.slice(start + startMarker.length, end);
const stringParts = [...cxxFragment.matchAll(/"((?:\\.|[^"\\])*)"/g)].map(([, body]) =>
  JSON.parse(`"${body.replace(/\\x([0-9a-fA-F]{2})/g, '\\u00$1')}"`),
);
assert.ok(stringParts.length > 0, 'extraction markers should surround at least one C++ string literal');
const embeddedJs = stringParts.join('');

function makeClassList() {
  const set = new Set();
  return {
    add: c => set.add(c),
    remove: c => set.delete(c),
    contains: c => set.has(c),
  };
}

function makeElement() {
  let html = '';
  const el = {
    classList: makeClassList(),
    children: [],
    className: '',
    type: '',
    textContent: '',
    onclick: null,
    appendChild(child) {
      el.children.push(child);
      return child;
    },
    get innerHTML() {
      return html;
    },
    set innerHTML(v) {
      html = v;
      el.children = [];
    },
  };
  return el;
}

const elements = new Map();
const getById = id => {
  if (!elements.has(id)) elements.set(id, makeElement());
  return elements.get(id);
};

const context = {
  document: { getElementById: getById, createElement: () => makeElement() },
  $: id => getById(id),
};
vm.createContext(context);

const bridge = `
;globalThis.renderSections = renderSections;
globalThis.zoneField = zoneField;
globalThis.currentZone = currentZone;
globalThis.activeIdNow = activeIdNow;
globalThis.getSectionTarget = () => sectionTarget;
globalThis.setSectionTarget = v => { sectionTarget = v; };
globalThis.setZones = v => { zones = v; };
globalThis.getZoneCurrentId = () => zoneCurrentId;
globalThis.setApplySectionState = fn => { applySectionState = fn; };
`;
vm.runInContext(embeddedJs + bridge, context);

// 1. Absent with a single zone.
context.setZones([{ id: 'all', label: 'All', patternId: 'aurora' }]);
context.renderSections();
const row = getById('section-row');
assert.equal(row.classList.contains('on'), false, 'section row must stay hidden for a single-zone card');
assert.equal(row.children.length, 0, 'section row must render no pills for a single-zone card');

// 2. Appears with 4 zones: Whole piece + one pill per zone, in order.
context.setSectionTarget('');
const fourZones = [
  { id: 'outer-ring', label: 'Outer Ring', patternId: 'aurora' },
  { id: 'inner-disc', label: 'Inner Disc', patternId: 'ocean' },
  { id: 'base-glow', label: 'Base Glow', patternId: 'custom-color' },
  { id: 'accent-strip', label: 'Accent Strip', patternId: 'aurora' },
];
context.setZones(fourZones);
context.renderSections();
assert.equal(row.classList.contains('on'), true, 'section row must appear for a 4-zone card');
assert.equal(row.children.length, 5, 'section row must render Whole piece + one pill per zone');
assert.equal(row.children[0].textContent, 'Whole piece', 'the first pill must read Whole piece');
assert.deepEqual(
  row.children.slice(1).map(b => b.textContent),
  fourZones.map(z => z.label),
  'the remaining pills must be word-labelled with each zone\'s own label, in order',
);

// 3. Selecting a section updates sectionTarget, re-renders, and re-derives
// the controls from that zone.
let applyCount = 0;
context.setApplySectionState(() => {
  applyCount++;
});
row.children[2].onclick(); // "Inner Disc"
assert.equal(
  context.getSectionTarget(),
  'inner-disc',
  'clicking a section pill must set sectionTarget to that zone id',
);
assert.equal(applyCount, 1, 'selecting a section must re-derive the controls from the newly selected zone');
const reRow = getById('section-row');
// The pill's active state is carried on className ('section-pill on'), the
// same way the real page marks it — not classList, which this stub only
// wires up for the row's own show/hide toggle (see renderSections() above).
assert.match(
  reRow.children.find(b => b.textContent === 'Inner Disc').className,
  /(^| )on(?: |$)/,
  'the selected section pill must be marked active after re-render',
);
assert.equal(context.currentZone().id, 'inner-disc', 'currentZone() must resolve to the selected section');

// 4. A section tap posts the zone key — zoneField() is the single source
// every zone-targeted control body spreads into its POST.
// Spread into a plain outer-realm object first — the vm context has its own
// Object.prototype, and deepStrictEqual treats that prototype difference as
// inequality even when every own property matches.
assert.deepEqual(
  { ...context.zoneField() },
  { zone: 'inner-disc', syncZones: false },
  'with a section selected, zoneField() must post zone + syncZones:false',
);
context.setSectionTarget('');
assert.deepEqual(
  { ...context.zoneField() },
  {},
  'Whole piece must add no zone field to the request body (broadcast, syncZones:true is set explicitly at each call site)',
);

console.log('section-selector tests passed');
