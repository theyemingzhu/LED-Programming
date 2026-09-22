# Expression editor prototype result

## Run

From `lightweaver/`:

```sh
npm run dev -- --host 127.0.0.1
```

Open the explicit prototype file at the URL Vite prints, for example:

`http://127.0.0.1:9998/scene-expression-prototype/index.html`

The configured port may differ. Keep `/index.html`; the directory URL is owned
by Studio's normal SPA fallback.

The prototype is intentionally served by Vite because its preview imports the existing browser renderer through `/src/lib/patternLabPatternAdapter.js`. It is a design prototype, not a static card page and not evidence of firmware parity.

## Interaction decisions

- The artwork remains central. Layout-linked targets stay on its left, the selected target's controls stay on its right, and time stays in one ordered row below.
- Direct artwork selection and matching target rows persist the accepted `{ areaIds, domain }` contract with `strip:`, `family:`, `group:` and `all` identities.
- The fixtures are current Layout-shaped data (`strips`, `sectionFamilies`, `layerGroups`, and `wiring`). The prototype builds the area catalog and compiled physical order through the accepted production helpers.
- A time step owns simultaneous per-area behaviors. Whole/group edits update the selected domain together; section edits create local overrides.
- `Continuous across` resolves one compiled physical-order stream. `Repeat per area` preserves one instance for each explicitly selected catalog area, so a selected group remains one domain while separately selected sections remain independent.
- Section rows are touch toggles. Multiple leaf sections can be selected without selecting their family; parent and group rows remain one exclusive domain.
- Field edits patch only that field across the selected areas. Changing a palette keeps each area's pattern, pace and brightness; changing a pattern keeps distinct per-area palettes.
- Hold time renders the current step unchanged, then Transition preview blends its rendered frame into the next step before the next hold begins.
- Scene, step and area identities survive local save/reopen. The simulated installed record includes the exact editable `sceneSource`, revision and stable IDs.
- `Try on lights` is a reversible simulated live state beside the preview. `Put on card` is a separate deliberate action beside Save. No network or card request exists in the prototype.
- The demonstration selector exposes disconnected, changed, installing, failed and success states without hidden setup.
- Opening Layout and returning preserves the selected area, step and all edits.

## Production integration decisions

1. Make the scene document the shared source object and keep Layout section IDs as references. Missing IDs must block delivery until reassigned.
2. Reuse `renderPatternLabRecipeFrame` for Studio preview, but call card parity only after a runtime contract represents the same per-area steps and spatial modes.
3. Store editable source beside the delivered revision. A card acknowledgement must identify the installed scene ID and revision independently from browser-local save state.
4. Keep live streaming authority separate from installed project authority. Stopping `Try on lights` must leave the installed revision unchanged.
5. Integrate one native-compatible scene lifecycle before extending recorded delivery. The prototype deliberately simulates card writes because current production cannot promise arbitrary per-area multi-step standalone playback.

## Limits

- All hardware states and card delivery are simulated. No fetch, Web Serial, firmware change, or card write occurs.
- The animation uses the production browser renderer, but nonzero transition previews, full palette evolution and continuous motion across separate zones do not yet have matching native runtime support. The current native transition is a uniform cut/dip/rise behavior; no card parity is claimed here.
- Browser-local persistence is scoped to this prototype's storage keys.

## Verification

- `node --test src/lib/sceneExpressionTargets.test.js`: 7/7 passing.
- `node --test public/scene-expression-prototype/model.test.mjs`: 6/6 passing. It covers mixed-pattern palette edits, distinct-palette pattern edits, partial group overrides, transition timing/frame blending and nonadjacent leaf selection.
- Focused browser journey passed in Chromium: mandala group edit, local save,
  fixture switch, reopen with the same scene/step/area IDs, Layout round-trip,
  duplicate step, playback highlight, disconnected controls, installing state,
  success acknowledgement, and installed editable-source snapshot.
- One batched desktop/phone inspection covered both fixtures, followed by one
  correction pass for the phone header. A second bounded manager-requested correction moved the phone step strip directly below playback and added visible leaf-selection toggles. The Impeccable detector returned no
  findings for the final HTML, CSS and JavaScript.
