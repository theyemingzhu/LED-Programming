# Project stacks refinement

Adrian requested another round of thought about finesse and functional ordering.
His standing instruction is to proceed from planning into implementation without
another confirmation. Sprint refinement of local build91de724b; no release,
firmware capacity expansion or hardware commands.

## Findings and direction

Independent Patterns and Playlist reviews plus actual browser inspection found
three connected problems: the save panel pushes Tune down the screen, repeated
management buttons slow library scanning, and the relationship between library
order and playback order is implicit. The static detector returned no findings;
that does not establish usable hierarchy. Existing warm/dark visual identity and
compact preview remain authoritative over the older palette in DESIGN.md.

The chosen flow is **compose sections → save a stack → arrange playback**.
A cosmetic-only spacing pass leaves action hierarchy unclear. A new unified
sequencer or another folder/grouping system adds a second ordering model. This
pass instead makes the existing editing and playlist responsibilities explicit.

- Sections within one stack play together; their display order never rewires LEDs.
- Saved-stack library order is stable creation order. An update retains its slot.
- Batch-selected stacks append in displayed library order, stated before adding.
- Playlist rows alone determine playback order. Each repeat has its own Length.
- Updating a saved stack changes all linked playlist occurrences in the project;
  card output changes only after the existing explicit install/live actions.

## Changes

Patterns: compact name/save/status panel with a secondary Save & add action;
expandable stack summary; contextual management actions; visible errors/review
and Undo; clear Save as new stack route without new draft-mode machinery. Tune
remains visible. Shelf retains section previews but shows Edit/Add first and
management under More. No duplicate summary disguised as extra settings.

Playlist: visible ordering guidance; compact source rows; explicit append order
with selected-stack summary; source items show actual playlist positions; combo
row duplicate is called Repeat this stack and respects applicable capacity.
Existing drag/keyboard ordering, independent Length, identity and save behavior
are preserved. No new schema, library sorting or nested groups.

## Ownership and verification

Patterns owner: stack_picker_proposal, app/editor/style and relevant tests.
Playlist owner: stack_playlist_build, playlist/style and relevant tests.
Primary owns integration, workboard, tests, actual screen inspection and commit.
Static assessment: stack_storage_proposal, read-only; report
`/tmp/stacks-refinement-detector.json` is an empty findings array.

Run focused regressions red before changes, then the stack feature suites and
relevant order/compact tests. Run one proportional integrated checkpoint, inspect
desktop and phone together, make at most one bounded visual repair pass, commit
locally. Preserve the owner's original project and separate4173 surface.

## Implemented result and review

The save panel now keeps name, Save/Update and the next playlist action visible.
Tune remains in the first desktop viewport. Save as new stack stays discoverable;
More actions and Stack details disclose occasional controls. Shelf items show
Edit/Add first; Duplicate/Rename/Delete remain keyboard accessible, with focus
restored after choosing a management action. The redundant repeated summary and
decorative mini-strip glow were removed.

Playlist source items show section artwork, count and actual playlist positions.
Batch selection previews the exact append order. Repeat this stack preserves a
separate row identity and Length, with truthful 16-timed/32-manual capacity refusal.
Manual banks do not display a timed-playback warning. At 390px, Add stacks and
Back to order jump directly between the two work areas and move keyboard focus.
Long stack names wrap in the selected-order preview.

Verification on 2026-09-28:

- Two new missing-disclosure/order-preview failures witnessed before product
  edits: `/tmp/stacks-finesse-red.log`.
- Editor, draft, continuity and density cohort: 17/17 PASS in
  `/tmp/stacks-finesse-editor-green.log`; final focus checks 2/2 PASS in
  `/tmp/stacks-finesse-focus-final.log`.
- Playlist storage/order, touch/keyboard, timed transport and stacks: 37/37 PASS
  in `/tmp/stacks-finesse-playlist-green.log`; final timing/phone repair cohort
  18/18 PASS in `/tmp/stacks-finesse-playlist-final.log`. 55 distinct browser
  checks are represented across these runs.
- Integrated checkpoint: 2,869/2,869 unit tests and production build PASS,
  `/tmp/stacks-finesse-checkpoint.log`.
- Independent design reviews by the Patterns and Playlist owners; isolated
  mechanical scan by storage owner, with no findings. Post-edit scan also
  returned no findings (`/tmp/stacks-refinement-detector-final.json`). Native
  browser tools expose read-only evaluation, so no detector overlay was injected.
- Actual desktop1280x800 and phone390x844 inspected in a separate review tab.
  The demo's ten four-section stacks remained intact. The existing card gate
  blocked the demo's Edit-preview attempt; no card mutation occurred.
  Images: `/tmp/lightweaver-stack-finesse-desktop.png` and
  `/tmp/lightweaver-stack-finesse-phone.png`. Temporary viewport reset afterward.

Scope remains Studio-only. Card capacity, firmware, physical LED proof and
production deployment remain unchanged.

Final consistency check: an already-used stack offers **Arrange playlist** beside
Update; only new/unused stacks offer Save & add. This avoids implying a repeat
when the add helper correctly deduplicates. Three final tests PASS in
`/tmp/stacks-finesse-arrange-final.log`, including the new used-stack navigation
case. Total relevant browser coverage is now **56 distinct passing checks**.
The final production build also passes (`/tmp/stacks-finesse-build-final.log`).
Review tab closed; original preview tab retained and temporary viewport reset.

Delivery boundary: completed, verified local implementation; not deployed.
