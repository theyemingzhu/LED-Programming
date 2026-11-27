import type { Page } from '@playwright/test';
import { cardState, MATRIX_PROJECT_ID } from './cardStates';
import { createPracticeCard } from './practiceTiming';
import { guardRealCard } from '../ux/journeyRecorder';
import { prepareCardDeployment } from '../../src/lib/cardDeployment.js';
import { DEFAULT_CARD_CONTROLS } from '../../src/lib/cardRuntimeContract.js';
import { defaultStandaloneController, migrateProject } from '../../src/lib/projectModel.js';
import { LEGACY_REPLACEMENT_BUILD_ID } from '../../src/lib/stripReplacement.js';
import { normalizePatchBoard } from '../../src/lib/patchBoard.js';

export const oldPins = [15, 16, 38, 41];
export const newPins = [15, 16, 17, 18];
export const counts = [21, 32, 43, 54];
const strips = counts.map((pixelCount, i) => ({
  id: `strip-${i + 1}`, name: `Artwork strip ${i + 1}`, pixelCount, color: '#f0a',
  pathData: `M 10 ${20 + i * 35} L 220 ${20 + i * 35}`, x: 0, y: 0,
}));
const runs = strips.map((strip, i) => ({
  id: `run-${i + 1}`, type: 'strip',
  source: { stripId: strip.id, from: 0, to: strip.pixelCount - 1 }, verified: false,
}));
const wiring = {
  version: 1, locked: false, verified: false, runs,
  outputs: newPins.map((pin, i) => ({ id: `out${i + 1}`, name: strips[i].name, pin, runIds: [runs[i].id] })),
};
const roles = [15, 16, 17, 18, 21, 38, 40, 41].map(pin => ({
  pin, role: oldPins.includes(pin) ? 'strip' : 'unused', pixelCount: counts[oldPins.indexOf(pin)] || 0, controlKind: '',
}));
export const project = {
  version: 3, id: MATRIX_PROJECT_ID, name: 'Matrix piece', portRoles: roles,
  layout: { strips, wiring, starterPending: false, svgText: '', viewBox: '0 0 400 400' },
  devices: { standaloneController: { playlist: ['aurora', 'plasma', 'fire'] } },
};
const initialOutputs = oldPins.map((pin, i) => ({
  id: `out${i + 1}`, pin, pixels: counts[i],
  segments: [{ id: runs[i].id, count: counts[i], direction: 'forward' }],
}));

export async function installReplacementFixture(page: Page, {
  timing = 'fast', alternate = false, capabilities = true, legacy = false,
}: { timing?: 'fast' | 'real'; alternate?: boolean; capabilities?: boolean; legacy?: boolean } = {}) {
  await guardRealCard(page);
  const pins = alternate ? [41, 16, 38, 15] : oldPins;
  const planned = alternate ? [21, 16, 40, 15] : newPins;
  const projectFixture = {
    ...project, portRoles: roles.map(entry => ({
      ...entry, role: pins.includes(entry.pin) ? 'strip' : 'unused', pixelCount: entry.pin === 15 ? 11 : counts[pins.indexOf(entry.pin)] || 0,
    })),
    layout: { ...project.layout, wiring: { ...wiring, outputs: wiring.outputs.map((output, index) => ({ ...output, pin: planned[index] })) } },
  };
  const restored = migrateProject(projectFixture);
  const previousWiring = { ...restored.layout.wiring, outputs: restored.layout.wiring.outputs.map((output, index) => ({ ...output, pin: pins[index] })) };
  const deployed = prepareCardDeployment({
    projectId: projectFixture.id, projectName: projectFixture.name, projectRevision: 4,
    strips: restored.layout.strips, patchBoard: normalizePatchBoard(restored.layout.patchBoard, restored.layout.strips),
    wiring: previousWiring, symSettings: restored.pattern.symSettings,
    standaloneController: defaultStandaloneController(restored.devices.standaloneController),
  }).config;
  const { card } = createPracticeCard({
    ...cardState('installed-match'),
    ...(legacy && { firmwareVersion: '1.2.8', buildId: LEGACY_REPLACEMENT_BUILD_ID, buildNumber: 2925 }),
    projectFingerprint: deployed.projectFingerprint,
    patterns: deployed.patterns || [{ id: 'aurora', label: 'Aurora' }],
    pixels: counts.reduce((total, count) => total + count, 0),
  }, {
    timing, seed: 11,
    ...(timing === 'real' && { overrides: { spontaneousSilence: null, unsettledAfterRestart: null } }),
    initialOutputs: initialOutputs.map((output, index) => ({ ...output, pin: pins[index] })),
    ...(capabilities && { outputTopology: { maxOutputs: 4, outputPins: legacy ? [4, 5, 6, 7, 15, 16, 17, 18, 21, 38, 39, 40, 41, 42, 47, 48] : [15, 16, 17, 18, 21, 38, 40, 41], sequenceVersion: 1, experimental: false } }),
  });
  (card.state as { firmwareControls?: unknown }).firmwareControls = DEFAULT_CARD_CONTROLS;
  card.state.omitOutputTopology = legacy;
  card.state.minimalWiringCandidateAck = true;
  await card.install(page);
  await page.addInitScript(({ project, roles }) => {
    if (localStorage.getItem('replacement-fixture')) return;
    localStorage.setItem('replacement-fixture', 'true');
    localStorage.setItem('lw_autosave_v3', JSON.stringify(project));
    localStorage.setItem('lw_port_roles_v1', JSON.stringify(roles));
  }, { project: projectFixture, roles: projectFixture.portRoles });
  return { card, project: projectFixture, pins, planned, counts };
}

export async function openReplacementDiscovery(page: Page) {
  await page.goto('/#screen=card&section=setup', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Connect this card', exact: true }).click();
  await page.getByTestId('setup-identity-lights').click();
  await page.getByTestId('setup-lights-action').click();
  await page.getByTestId('discovery-plan').waitFor();
}
