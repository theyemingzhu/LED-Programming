import { expect, test } from '@playwright/test';

test('card reconstruction preserves installed playlist and startup look', async ({ page }) => {
  await page.goto('/#screen=card&section=setup', { waitUntil: 'domcontentloaded' });

  const reconstructed = await page.evaluate(async () => {
    const setup = await import('/src/v3/lw-setup.jsx');
    return setup.reconstructInstalledCardState({
      skeleton: {
        outputs: [{ id: 'out1', name: 'Output 1', pin: 18, pixels: 41 }],
        led: { type: 'WS2815', colorOrder: 'RGB' },
        strips: [{ id: 'strip-1', name: 'Output 1', pixelCount: 41 }],
        portRoles: [{ portId: '18', role: 'strip', pixelCount: 41 }],
      },
      patterns: {
        currentId: 'fire',
        currentIndex: 1,
        patterns: [
          { id: 'aurora', label: 'Aurora', mode: 'procedural', zones: [{ id: 'strip-1', label: 'Output 1', patternId: 'aurora' }] },
          { id: 'fire', label: 'Fire', mode: 'procedural', zones: [{ id: 'strip-1', label: 'Output 1', patternId: 'fire' }] },
          { id: 'ocean', label: 'Ocean', mode: 'procedural', zones: [{ id: 'strip-1', label: 'Output 1', patternId: 'ocean' }] },
        ],
      },
      zones: {
        startupPatternId: 'aurora',
        zones: [{
          id: 'strip-1', label: 'Output 1', patternId: 'aurora',
          brightness: 0.72, speed: 1.15, hueShift: 12,
          customHue: 34, customSaturation: 210,
          customBreathe: true, breatheLowerPct: 30,
          breatheUpperPct: 90, breatheCycleSeconds: 6,
          customDrift: false,
        }],
      },
      cardId: 'lw-recon-fixture',
    });
  });

  expect(reconstructed.devices.standaloneController.looks).toHaveLength(3);
  expect(reconstructed.devices.standaloneController.looks).toEqual([
    expect.objectContaining({ id: 'aurora', label: 'Aurora', defaultLook: expect.objectContaining({ patternId: 'aurora' }) }),
    expect.objectContaining({ id: 'fire', label: 'Fire', defaultLook: expect.objectContaining({ patternId: 'fire' }) }),
    expect.objectContaining({ id: 'ocean', label: 'Ocean', defaultLook: expect.objectContaining({ patternId: 'ocean' }) }),
  ]);
  expect(reconstructed.devices.standaloneController.playlist).toEqual([
    expect.objectContaining({ id: 'aurora', type: 'combo', lookId: 'aurora', label: 'Aurora', enabled: true }),
    expect.objectContaining({ id: 'fire', type: 'combo', lookId: 'fire', label: 'Fire', enabled: true }),
    expect.objectContaining({ id: 'ocean', type: 'combo', lookId: 'ocean', label: 'Ocean', enabled: true }),
  ]);
  expect(reconstructed.devices.standaloneController.defaultLook).toEqual(expect.objectContaining({
    patternId: 'aurora', brightness: 0.72, speed: 1.15, hueShift: 12,
    customHue: 34, customSaturation: 210, customBreathe: true,
    breatheLowerPct: 30, breatheUpperPct: 90, breatheCycleSeconds: 6,
    customDrift: false,
  }));
  expect(reconstructed.devices.standaloneController.activeLookId).toBe('fire');

  // Defect C1b: the reconstruction marks itself so it is never described as
  // a complete editable backup — see projectCopyLabel.js's projectCopyKind,
  // the one place `origin` is read back into a display label.
  expect(reconstructed.origin.kind).toBe('card-partial');
  expect(reconstructed.origin.cardId).toBe('lw-recon-fixture');
  expect(typeof reconstructed.origin.at).toBe('number');
});

// ── the label a reconstruction gets in Projects (defect C1b) ───────────────
//
// A browser-level test seeding `lw_autosave_v3` with an `origin` field and
// then opening Projects (the way tests/project-recovery-fixtures.spec.ts
// seeds fixtures) was tried here and DELETED after it proved nothing: even
// though migrateProject preserves `origin` (see src/lib/projectModel.test.js),
// ProjectContext.jsx's `applyProject` reads a migrated project into a large
// set of individually-tracked React state variables — an explicit allow-list
// with no slot for `origin` — and `serializeProject` (what ProjectsPanel
// reads to build the association label) reconstructs the live project from
// those same state variables. `origin` is dropped the instant it passes
// through `applyProject`, from ANY source, seeded or real. Confirmed live:
// the seeded test above returned "Not saved yet", never the partial label,
// regardless of the labeling logic under test.
//
// The same gap blocks the real "Use this card's project" flow: lw-setup.jsx's
// `applyCardParts` (owned by another fixer, out of scope for this ticket)
// builds its replacement project from its own explicit allow-list off
// `parts` — strips, portRoles, patchBoard, wiring, devices.standaloneController
// — and does not thread `parts.origin` through either.
//
// So today, no browser test can show the partial label, however it is
// produced. What IS fully wired and covered:
//   - reconstructInstalledCardState attaches `origin` — asserted above, and
//     in src/lib/cardProjectAdoption.test.js's reconstruct-strategy tests.
//   - migrateProject preserves `origin` across a save/reload round trip —
//     src/lib/projectModel.test.js.
//   - projectCopyKind/projectCopyLabel/ProjectsPanel.describeAssociation
//     turn `origin` into the partial label and keep it stable across every
//     other destination signal, and stop applying once real artwork exists —
//     src/lib/projectCopyLabel.test.js.
// Wiring `origin` into ProjectContext.jsx's tracked state (so it survives
// `applyProject`/`serializeProject`) and into `applyCardParts` is the
// follow-up integration work needed before this label can appear live.
