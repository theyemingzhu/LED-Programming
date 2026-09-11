# Lightweaver TODO archive

Finished items moved out of the root `TODO.md`, kept for lineage. Nothing here is deleted; see `todo/plans/archive/` for any plan files that went with an item.

## Done

- [x] **Unify the zone-id vocabulary between section targets and runtime zones.** `deriveSectionTargets` was being called without `wiring`/`compiledWiring` in two places, so section targets carried patch-board ids (`patch-strip-1`) while `cardRuntimeProject.js` builds runtime zones from compiled wiring (`strip-1`); any project with compiled wiring made a section-scoped live preview ask for a zone the card cannot have, forcing `ensureCardSectionsForPreview` to push a full `/api/config`. Found during the 2026-08-12 setup-loop/pattern-click fix. `lw-pattern.jsx`'s call site was fixed in `5568e76b` (2026-08-31), which also fixed per-look pattern taps on the Patterns screen. The remaining call site, `buildSavedLookPlaylistPreviewTargets` in `playlistLivePreview.js` (used by the Playlist screen's per-look preview), was fixed in the PR that added this archive entry: it now forwards `wiring`/`compiledWiring` the same way `lw-pattern.jsx` does, so a per-look playlist preview tap on a wired project asks for the compiled zone ids the card actually has instead of rebooting it on every tap.

- [x] Playlist screen shows two filled primaries at once, "Install playlist on card" and "Pause"; make the transport state read as state, not a second primary _(band: agent-runnable)_ _(effort: quick)_
  Seen in the 390px screenshot from PR #256. One status, one primary action is the locked rule; Play/Pause should look like a toggle with word labels, not compete with Install.
  Done 2026-09-11 (sections-effortless change 7): Play/Pause is a pressed toggle with word labels, Install playlist on card is the one filled action; asserted in tests/playlist-timed.spec.ts, now in ci:browser-smoke.
