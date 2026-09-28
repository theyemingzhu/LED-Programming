# Project pattern stacks — proposal

Status: approved by Adrian on 2026-09-28; Studio implementation authorized.
Execution: `2026-09-28-project-pattern-stacks-build.md`. No release authorized.
Owner: primary manager, chat 01a0e6bf. Initial source inspection: `8bbf965f`.
Implementation reconciled against main `6dbffe67` (Studio 2228) in the managed
`codex/project-pattern-stacks` checkout. Verified build evidence is recorded in
the implementation plan. Hardware appearance and a ten-stack card installation
are not claimed.

## Recommended product model

A **stack** is one named arrangement of the entire project's lighting sections.
Its sections play simultaneously, each with its own pattern and supported
settings. A playlist plays these complete arrangements in sequence.

Use **Project stacks** consistently for the collection, **Save stack** for
creation, and **Stack** for the playlist badge. For example, “Ember garden”
contains Outer ring: Fire, Inner ring: Ocean, Centre: Plasma, and Border: Off.
Saving another stack produces a separate arrangement using the same sections.
Ten stacks means ten selectable arrangements, not ten physical outputs.

Use a dedicated Project stacks collection backed by the existing project saved
looks. A filter inside the mixed generic bank would be cheaper but leave the
ownership unclear. A new global stack library would add copying and mapping
work that this project-specific request does not need.

## Exact creation and editing flow

1. Continue using the existing section rows to choose and tune each section.
   Keep the other sections' choices visible. Changing one section preserves its
   siblings. Show a compact whole-arrangement summary near the save controls.
2. Keep a save bar outside the Tune-only controls: name, **Save stack**, and
   **Save & add to playlist**. Explain once: “Saves every section's pattern and
   settings.” It captures all section drafts, including sections not selected.
3. A new save starts with a suggested unique name such as “Stack 01”. Name and
   identity are separate; repeated names cannot overwrite an existing stack.
4. After successful persistence, show “Saved in [project name]” and the new
   Project stacks item. A failed write retains the draft and shows Retry;
   changing in-memory state alone cannot produce a Saved message.
5. Opening a saved stack restores its whole arrangement into an editing draft.
   The bar shows **Update stack**, **Save as new**, and **Revert changes**.
   Unsaved changes remain visibly marked. Preserve a recoverable draft through
   navigation/reload, scoped to its project and stack, without silently saving
   changes over the named stack. Returning restores that draft; switching to a
   different stack cannot silently discard it.
6. **Duplicate** makes a separately identified variation, e.g. “Ember garden 2”,
   and opens it for editing. This is the fast route to ten related arrangements.
7. Provide **Copy settings to sections…** using explicit selected destinations.
   Copy supported appearance settings only; never wiring or pixel counts.
   Preserve existing all-section editing. Add a focused undo for a bulk copy.

All current supported section appearance values travel with the stack: pattern,
speed, brightness, hue/color, saturation, breathing, drift, and supported Off
state. Geometry, output routing and card safety limits remain project settings.
The feature groups simultaneous playback; it does not add beat synchronization,
phase locking, or a continuous moving image across disjoint strips.

## Project stacks collection

- Put **Patterns | Project stacks (10)** at the library level in Patterns.
  Generic category filters remain inside Patterns. Project stacks contains only
  this project's saved arrangements; existing compound looks appear here with
  their identities and playlist links intact.
- Each item shows its name, a small preview made from all sections, section
  count, and “In playlist” when used. Details expand to section → pattern rows.
  Do not use only the default pattern as the thumbnail for a multi-pattern stack.
- Keep an ordered, searchable list with Rename, Duplicate, Edit, and Delete.
  Saving an edit should not unexpectedly reorder the collection. Ten items
  should be easy to scan without introducing folders or nested stacks.
- Reuse the existing Lab compatibility distinctions. An item that cannot run
  on the card gets a clear status and route to its existing preparation flow;
  it must not silently become a different built-in pattern.

## Playlist manager

- Use the same source tabs: **Project stacks (10) | Patterns**. Default to
  Project stacks when it contains items; keep the chosen source while working.
- Add a stack as **one playlist row**. Show its name, Stack badge, section count,
  existing Length control, and existing live/playback actions. Expand to inspect
  its section assignments. Timing belongs to the playlist occurrence.
- **Save & add to playlist** creates or updates the stack and adds it once.
  Build both changes from the same resulting controller snapshot so the playlist
  cannot reference stale pre-save state. Confirm persistence before reporting success.
  If already present, show “In playlist” and offer to reveal its row. Use the
  playlist's existing Duplicate action to repeat it deliberately at another time.
- Allow selecting several stacks and **Add selected**, preserving visible order
  and skipping already-present stacks. Preflight available playlist slots; never
  silently add only a subset. If the playlist is full during Save & add, retain
  the saved stack and clearly report that it was not added.
- Playlist rows reference the saved stack ID. Explicit **Update stack** updates
  every occurrence and shows “Used in N playlist entries” before the action.
  Draft edits do not change the saved playlist. Save as new creates independent
  content. Rename changes the label everywhere without changing its identity.
- Removing a playlist row leaves its stack in the project. Deleting a stack
  that is used reports the affected row count and requires an explicit “Delete
  stack and remove N playlist entries” action, with Undo.
- Saving and arranging work without a connected card. Keep durable project
  save, temporary live preview, and installation status distinct. An existing
  installed playlist changes only through the explicit installation workflow.

## Durability, mapping and limits

Use `devices.standaloneController.looks` as the single saved source. Each stack
is a snapshot of `defaultLook` plus patch-ID-keyed `sectionLooks`; playlist combo
entries reference `lookId`. Reuse the exporter that maps patch IDs to runtime
zones. Do not create a second stack store or set `projectOnly: true`: that
existing flag means card-ineligible, not merely project-owned.

Preserve stacks through project save/reopen, project switching, duplicate,
download/import, and existing backup/transfer routes. Copies must not share
mutable state across projects. Verify the saved revision before clearing dirty
state; saving during a project switch must never target the next project.

Renaming/reordering sections preserves assignments by stable identity. Reuse
existing split migration. New, deleted, merged or otherwise changed sections
show **Review sections** with affected stacks and an explicit repair/inheritance
choice. Installation must not silently ignore missing assignments or apply a
fallback while claiming to install the original arrangement. Ordinary geometry
changes that retain section identity can reuse the current wiring compiler.

Current source limits are 12 saved looks shared with other saved designs, 16
timed playlist entries, 32 installed looks, and 12 hardware zones. Ten ordinary
stacks fit the item counts. Implementation testing measured a complete ten-stack,
four-section config at 7,243 bytes against the current 3,968-byte card limit.
All ten can be saved in Studio, but installation must refuse an oversized selection.
Show capacity before the limit, refuse excess without losing existing data,
and fix silent truncation at relevant import/normalization boundaries. Retain
these limits for the first scoped implementation. Increasing capacity requires
separate evidence and approval if it crosses into firmware/storage architecture.

## Implementation assignments and order

1. **Manager:** reconcile current main and concurrent Patterns work; freeze the
   labels, snapshot/update/reference behavior, migration rules and test fixture.
   Own coordination, integration, actual-screen acceptance and final report.
2. **Persistence owner (Astra medium):** own saved-look model, identity,
   persistence/transfer and layout reconciliation helpers with focused tests.
   Prove complete snapshots, no aliasing, durable status and no silent loss.
3. **Patterns owner (Sol medium):** own `lw-pattern.jsx`, narrowly scoped styles
   and its browser tests. Build the save bar, whole-stack editing, project shelf,
   duplicate/bulk-copy flow. Depend on the agreed model interface; do not edit
   persistence owner's files.
4. **Playlist owner (Sol medium):** own `lw-playlist.jsx`, narrowly scoped styles
   and its browser tests. Build the separated picker, multi-add, linked update
   feedback and row details. Reuse existing combo/install contracts.

These are at most three workers plus the manager. Shared components and style
files get one named owner before dispatch. Model work and isolated UI work can
proceed independently once interfaces are agreed; final integration is serial.
No worker starts another preview. Existing runtime contracts suggest no firmware
change is needed for supported card-native patterns; raise a demonstrated gap
to the manager before expanding scope.

## Acceptance and delivery boundary

- Create ten differently named stacks across four sections, with distinguishable
  patterns, settings and Off state; reopen each and recover its exact arrangement.
- Repeat after reload, project switch, project copy and export/import. Simulate
  failed storage and capacity overflow: no lost stack or false Saved message.
- Add all ten to Playlist. Verify each is one row, preserves independent length,
  and produces the expected complete zone appearances in the install package.
- Verify Update, Save as new, Duplicate, Rename, repeated playlist occurrences,
  Delete/Undo, missing sections, split migration, and unsupported-pattern refusal.
- Check browser previews and the final rendered desktop/phone screens, including
  ten-item browsing, keyboard operation, visible save state and no clipped actions.
- Run focused regressions while building, then one integrated checkpoint and
  relevant browser journey. Hardware observation is separate from simulated
  proof. No full Prove, release, signing, deployment or flashing is implied.

Key source evidence: `sectionLookModel.js`, `cardVisualLook.js`, `projectModel.js`,
`ProjectContext.jsx`, `cardPlaylist.js`, `cardRuntimeProject.js`,
`sectionRunConversion.js`, `lw-pattern.jsx`, and `lw-playlist.jsx` under
`lightweaver/src/`. Existing `three-gpio-playlist-workflow.spec.ts` covers a
three-section saved composition; extend it to the ten-stack journey rather
than inventing a parallel testing path.
