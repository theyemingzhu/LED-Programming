import { createDefaultCircleLayout } from '../../src/lib/defaultCircleLayout.js';
import { createDefaultPatchBoard } from '../../src/lib/patchBoard.js';
import { createDefaultProject } from '../../src/lib/projectModel.js';
import { makeDefaultWiring } from '../../src/lib/wiringModel.js';

export const lookId = 'after-dark';
export const lookName = 'After dark';
export const cueId = 'playlist-after-dark';
export const removedSectionId = 'patch-removed-trim';
export const sectionNames = [
  'Outer strip along the eastern frame',
  'Inner strip around the centre',
  'Lower left detail',
  'Upper right detail',
  'New strip across the top edge',
];

export function savedLookSectionChanges({ mixed = false, gpioConflict = false } = {}) {
  const project = createDefaultProject();
  project.id = 'patterns-five-strip-section-changes';
  project.name = 'Five strip installation';
  const strips = createDefaultCircleLayout({ sectionPixelCounts: [24, 20, 19, 18, 16] }).map((strip, index) => ({
    ...strip,
    name: sectionNames[index],
  }));
  const patchBoard = createDefaultPatchBoard(strips);
  const sectionIds = patchBoard.patches.map(patch => patch.id);
  const patterns = mixed ? ['fire', 'ocean', 'plasma', 'fire', 'aurora'] : Array(5).fill('fire');
  const savedBrightness = 0.46;
  const defaultBrightness = 0.68;
  const currentNewSectionBrightness = 0.27;
  patchBoard.patches.forEach((patch, index) => {
    patch.playback.patternId = patterns[index];
    patch.playback.brightness = index === 4 ? currentNewSectionBrightness : savedBrightness;
  });
  Object.assign(project.layout, { starterPending: false, strips, patchBoard, wiring: makeDefaultWiring(strips) });
  project.devices.standaloneController = {
    ...project.devices.standaloneController,
    led: { ...project.devices.standaloneController.led, type: 'WS2812B', colorOrder: 'GRB', maxMilliamps: 2000 },
    activeLookId: lookId,
    defaultLook: { patternId: 'plasma', brightness: 0.32 },
    looks: [{
      id: lookId,
      label: lookName,
      sectionSnapshotVersion: 1,
      defaultLook: { patternId: patterns[4], brightness: defaultBrightness },
      sectionLooks: {
        ...Object.fromEntries(sectionIds.slice(0, 4).map((id, index) => [id, { patternId: patterns[index], brightness: savedBrightness }])),
        [removedSectionId]: { patternId: 'ocean', brightness: 0.55 },
      },
    }],
    playlist: [{ id: cueId, type: 'combo', lookId, label: lookName, dwellSeconds: 71, enabled: true, createdAt: 1 }],
  };
  if (gpioConflict) project.devices.standaloneController.controls.encoder.a = 5;
  return { project, sectionIds, patterns, savedBrightness, defaultBrightness, currentNewSectionBrightness };
}

export async function seedSavedLookSectionChanges(page, options) {
  const fixture = savedLookSectionChanges(options);
  await page.addInitScript(project => {
    if (window !== window.top || sessionStorage.getItem('five-strip-fixture-seeded')) return;
    localStorage.setItem('lw_autosave_v3', JSON.stringify(project));
    sessionStorage.setItem('five-strip-fixture-seeded', 'true');
  }, fixture.project);
  return fixture;
}
