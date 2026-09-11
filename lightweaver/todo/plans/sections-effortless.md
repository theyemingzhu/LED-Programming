# Sections without effort

Survey 2026-09-11 (four Sonnet surveys, Fable synthesis). Successor to [multi-pattern-control.md](multi-pattern-control.md), which shipped sections end to end on 2026-09-09. This plan makes them effortless from a phone.

## Decision

Sections already work end to end. What makes them hard is that the owner meets three different section lists on three screens, cannot reorder or re-pin anything from a phone (drag-and-drop is the only way), and cannot tell which physical part "Ring 3" is. The plan ships seven Studio-only changes in 10-minute cycles and zero firmware changes: every firmware item in the draft is either already on the card or redundant with a shipped Studio control. The single biggest lever is one section list, derived once in ProjectContext and shown the same way on Layout, Patterns and Playlist, with the card's own list (GET /api/zones) sitting beside it so the "card has no such section" notice becomes a fact.

## What the surveys changed about the 15-item draft

Cut:
- Join adjacent sections: exists ("Combine into one strip", mergeSelectedStrips).
- Per-section reverse: exists at run level; the "Data" toggle compiles to outputs[].segments[].direction, honoured by the firmware. A ZoneConfig.reversed field would cost about 13 bytes times 12 zones for nothing.
- Card reports its sections: exists. GET /api/zones (LightweaverWeb.cpp:3197, runtimeZonesJson main.cpp:3777) returns id, label, patternId, ranges; Studio polls it in cardSectionSync.js waitForCardZones. Only the comparison display is missing.
- Undo: exists (ProjectContext.jsx:449 history, LayoutScreen.jsx:363 Undo). The button is an icon, a separate one-line convention fix.
- Divide from Patterns: collides with "Layout owns physical structure". Replaced by a word link to Layout from Patterns.
- Visitor next/previous per section: next/previous cycle the whole-piece playlist by the 2026-09-09 decision; a per-section cycle is a sequencer by another name.
- Names by position: geometry heuristics break on rings; "Ring 1..N" from nextSplitNames already reads well.
- Section presets: a new saved-look kind that eats the byte budget; wait for a real ask.

Merged: cut points into "uneven divide" without the drag (typed counts); reorder and output lanes into one "order and outputs in words" change; the budget meter into a room line that reuses prepareCardStoragePayload, which already measures bytes and throws CardConfigCapacityError.

Added: the "card limit 10" label at lw-pattern.jsx:2677 is stale against LW_MAX_ZONES 12; layout-divide.spec.ts and layout-strip-split.spec.ts run in no CI lane; the Playlist two-primaries defect (TODO.md:118) is on this journey's third screen. Correction to the survey: 3697 bytes is the live-look record on its own NVS key (LightweaverStorage.h:58), not the project config; the config has its own 3968-byte budget, rejected at LightweaverStorage.cpp:1898, and the measured 16-entry playlist project is 2653 bytes.

## The plan (all Studio lane, no VERSION bump)

| # | Change | Owner can now | Files | Test and lane | Size | State |
|---|---|---|---|---|---|---|
| 1 | One section list | Same sections, order, names on Layout, Patterns, Settings, Playlist; "card limit 12" from the contract | sectionLookModel.js (sectionTargetsForProject), state/ProjectContext.jsx (memoise beside compiledWiring), lw-pattern.jsx:860 and :1635, lw-settings.jsx:242, playlistLivePreview.js:27 | tests/section-targets.mjs in ci:pr-lane-node-specs | moderate | |
| 2 | Sections read as a row on Patterns | Each chip shows its pattern name; one status line "Card holds Ring 1, Ring 2, Ring 3" or "Card holds one section; Install to send yours" from GET /api/zones; single-section pieces get a "Divide in Layout" word link | lw-pattern.jsx (chips 2676 to 2686, notice 1215), cardSectionSync.js (cardSectionDifference) | tests/card-section-sync.mjs extended (pr-lane); tests/patterns-section-row.spec.ts in ci:browser-smoke. Settles TODO.md:55: the notice is correct, the workflow.spec.ts:403 fixture models sections the mock never installed | moderate | |
| 3 | Order and outputs in words | "Move up" / "Move down" per section row on Layout edits output.runIds with a thumb; GPIO select lists 16, 17, 18, 21 first, the other eleven under "More pins"; drag stays as an extra | DrawModePanel.jsx (moveStripsInGpioOrder 536, gpio select 1548), wiringModel.js (pure moveRunsInOutputOrder) | tests/wiring-order.mjs (pr-lane); tests/layout-section-order.spec.ts at 390px in ci:browser-smoke | moderate | |
| 4 | Show me which one | Tapping a section chip while connected makes that section stand out on the piece for one second (others dim to 20 percent, never black), then restores what the card reported | cardLiveControl.js (flashSectionOnCard), lw-pattern.jsx selectTarget 1560 | tests/section-flash.mjs asserting request sequence and restore values (pr-lane) | moderate | |
| 5 | Uneven divide | After "Divide into 3", three number fields that must sum to the strip (equal defaults, plus and minus, typed) so 41 becomes 10, 21, 10 | stripSplit.js (explicit counts), useLayoutStrips.js:356, DrawModePanel.jsx divide block 1565 | stripSplit.test.js extended and added to pr-lane; tests/layout-divide.spec.ts added to ci:browser-smoke (runs nowhere today) | moderate | |
| 6 | Use this look on every section | One word button "Use on every section" copies the selected section's pattern and tuning to all sections | sectionLookModel.js (copyLookToAllSections), lw-pattern.jsx | tests/section-look-copy.mjs (pr-lane) | quick | |
| 7 | Room on the card, one primary on Playlist | Settings shows "Room on card: 2,653 of 3,968 bytes, about 6 more sections" from the Install measurement; Playlist Play/Pause is a toggle and "Install playlist on card" the only filled action (TODO.md:118) | cardStoragePayload.js (cardStorageRoom), lw-settings.jsx, lw-playlist.jsx:958 | tests/card-storage-room.mjs (pr-lane); Playlist primary count in patterns-section-row.spec.ts | quick | |

Firmware release: none. 1.1.37 stays. The only firmware-lane action is Adrian's bench verification of the four-sections build (TODO.md:116). If change 4 shows the debounce persisting a dimmed brightness across a power cycle, that is the first item of a future release.

## Slop tests

- Does it edit physical structure anywhere but Layout? Then it is a second editor; drop it.
- Does the card already answer this over /api/zones, /api/status or /api/control? Then it is not a firmware item.
- Can a thumb at 390px do it with a word button, no drag, no long-press? If not, it is not done.
- Does it add a per-zone field? Multiply the bytes by 12 and name the budget it lands in before writing code.
- Does it add a second filled action or a second status line to a screen? Then it replaces one, or it waits.

## Adrian may overrule

- Section names stay "Ring 1..3", not Left / Middle / Right (rings and spirals have no left).
- Divide stays on Layout; Patterns gets a word link. If that trip is friction on the phone, change 2 grows a bounded Divide.
- The flash dims the other sections to 20 percent rather than blacking them out.

## Resume point

Read the State column. Land one change per PR; the Tests workflow runs only on push to main, so watch it after each merge and prove the live Studio build number.
