# Expression scene delivery result

Implemented the pure preparation and injected orchestration boundary for delivering an editable expression scene to a Lightweaver card.

## Delivered behavior

- `prepareExpressionSceneDelivery` freezes one project snapshot, records the requested scene as `expressionScenes.playbackSceneId`, leaves `activeSceneId` as editor state, compiles the scene against that snapshot's Layout, and prepares a runtime package whose project fingerprint is the editable source envelope hash.
- `prepareProjectPlaybackDelivery` is the generic Save-to-card preparation path. It honors an existing `playbackSceneId`; a null value retains ordinary standalone-controller playback.
- The editable snapshot retains the legacy saved-look library and playlist. Only the prepared runtime candidate receives the compiled scene steps, with an explicit replacement summary for the caller.
- Preparation requires exact connected-card and build identity, an explicit access classification, ready status, known-good wiring with no pending candidate, compiled-wiring send readiness, commissioning evidence for hardware-affecting installs, and reported capacity when the card supplies it. Its complete source and runtime candidate are deeply frozen.
- `runExpressionSceneDelivery` requires a fresh injected preflight immediately before mutation, saves through the existing owner-capability source path, validates canonical source readback, syncs the runtime, and then requires exact post-save card evidence plus a final exact source read before returning `on-card`.
- Source failure, cancellation, head conflict, source hash mismatch, and wrong-card evidence perform no runtime write. Runtime failure after a verified source commit returns `saved-not-installed` and retains the prior runtime evidence.
- A lost runtime response triggers fresh source and runtime reconciliation. It returns `on-card` only when card identity, source hash, runtime revision/fingerprint, ready state, required looks/zones, and known-good wiring all agree.

## Fidelity correction

The native compiler now rejects a pattern-bearing repeat assignment when one selected area spans multiple strips. The current runtime would otherwise flatten that one repeat instance into independent zone renderers. Explicit leaf-area repeats remain supported, as do grouped color-only patches and the exact empty native movement no-op.

## Verification

Focused regression coverage exercises preparation immutability, explicit playback selection, ordinary-controller fallback, operation ordering, all source-side no-mutation failures, capability/readiness refusal, post-save failure state, strict readback, lost-response reconciliation, cancellation, and grouped repeat fidelity.
