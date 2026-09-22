# Expression compiler P0 result

Status: implemented and focused verification complete.
Scope: pure source normalization/resolution and native lowering only. No project schema, UI, firmware, wiring compiler, runtime packager, deploy, or hardware changes.

## Public API

`lightweaver/src/lib/sceneExpression.js` exports:

- `SCENE_EXPRESSION_FORMAT` and `SCENE_EXPRESSION_VERSION`;
- `normalizeSceneExpression(source)`, which returns an immutable JSON-safe normalized copy while retaining unresolved Layout IDs, palettes, Movement, and other safe authored fields;
- `resolveSceneExpression(source, catalog)`, which consumes the accepted `sceneExpressionTargets.js` catalog, resolves independent leaf fields with `all -> family/group -> strip` precedence, inherits complete resolved state in step order, and reports adapter or ambiguity reasons without changing source.

`lightweaver/src/lib/sceneExpressionNative.js` exports:

- `compileSceneExpressionNative(source, options)`, where `options` supplies the accepted catalog, strips, compiled wiring, optional standalone controller, and project identity;
- a successful result containing normalized `source`, resolved states, deterministic `savedLooks`, normalized combo `playlist`, `controller`, the existing `runtimePackage`, and a checked compact `storage` payload;
- a failed result containing the full normalized `source` and explicit `reasons`, with no runtime package or partial approximation.

The native color model is explicit: `kind: "card-controls"` plus the existing hue, saturation, Breathe, Drift, speed, and brightness fields within their current card ranges. Full palettes, unsupported Movement, continuous domains, nonzero transitions, fractional holds, unknown visual fields, and values that would otherwise be clamped all fail closed.

## Fixtures and proof

The focused fixtures cover:

- a real three-child `sectionFamilies` divided strip and explicit mandala-style groups;
- missing and changed Layout IDs with source round-trip preservation;
- source immutability, stable step IDs after reorder, independent leaf inheritance, and separate within-selection versus across-assignment conflicts;
- repeat-domain native lowering and explicit continuous-domain rejection;
- zero-duration cuts, whole-second holds, repeat-only looping, saved-look capacity, and compact storage capacity;
- deterministic derived IDs through `normalizeSavedLooks()` and `normalizeCardPlaylist()`;
- the derived controller through `buildCardRuntimePackageFromProject()` and `prepareCardStoragePayload()`;
- 4,096 physical pixels split 1,365 / 1,365 / 1,366 across the three child zones;
- the established Studio `comet` ID lowering to firmware runtime ID `meteor`.

Red was witnessed with:

```text
node --test src/lib/sceneExpression.test.js src/lib/sceneExpressionNative.test.js
```

Both test modules failed with `ERR_MODULE_NOT_FOUND` before the implementation existed. The final focused run passed all 10 tests.

## Current limits

- The native output uses one existing saved combo look per step. `normalizeSavedLooks()` currently caps this path at 12 steps, even though the firmware timed playlist supports 16 entries. The compiler reports `saved-look-capacity` rather than dropping steps.
- P0 supports only repeat-domain assignments, repeat loops, zero-duration cuts, and whole-second holds from 1 through 3,600 seconds.
- A compiled card zone must map to one or more strips with identical resolved native state. Different states inside one existing zone report `zone-state-conflict`.
- The current 3,968-byte compact config ceiling remains authoritative and can become the limiting factor before pixel count. The 4,096-pixel fixture passes because ranges describe pixels compactly.
- Capability negotiation with a connected physical card remains P1 work. This compiler targets the current checked-in card/runtime contract and performs no card I/O.
