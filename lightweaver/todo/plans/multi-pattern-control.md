# Four sections on one strip: multi-pattern control

Survey: [Four Sections, One Strip](https://claude.ai/code/artifact/129b9bf9-75d8-4bb3-9781-a9cd1103142a) (2026-09-09).

## What was already true

- The card renders every zone every frame with its own pattern and speed clock, up to 12 zones (`main.cpp` renderCurrentLook, ZoneAnimationClock; `LW_MAX_ZONES`).
- The Patterns screen stores a per-section look (pattern, speed, brightness, hue, saturation, breathe, drift) inside the patch's playback and saves up to 12 compound looks (`sectionLookModel.js`, `MAX_SAVED_LOOKS`).
- "Playlist" is the rotary dial's cycle list (`controls.encoder.patternCycleIds`), whole piece, no dwell, no transition, no auto-advance. No sequencer exists on the card.
- Live control changes (`POST /api/control`) mutate memory only; only `/api/config` persists, as one JSON string under a 3968-byte NVS cap, and it reboots the card.
- The card's visitor page controls the whole piece only.

## Decisions (defaults taken 2026-09-09, Adrian may overrule)

1. One timed playlist for the whole piece; each entry is a compound look so per-section variety lives inside the entry.
2. After a power-cycle the card resumes the last live tweak, not the installed look.
3. Visitors on the card's WiFi see a Section selector, default whole piece.
4. The unwired Studio timeline model (showClips, showTransitions, showCues, autoLanes) is deleted; the dial's default cycle comes from the owner's playlist.

## The five changes and their lanes

| # | Change | Lane | Files | State |
|---|---|---|---|---|
| 1 | Playlist previews stop pushing config (and rebooting) on wired projects; zone-identity node specs join the PR lane | S1, Studio | playlistLivePreview.js, lw-playlist.jsx, playlist-live-preview.mjs, test.yml, package.json | Shipped 2026-09-09, PR #248, Studio build 1708 |
| 2 | "Divide into N" on Layout (41 into 4 gives 11, 10, 10, 10), cap 12 | S1b, Studio | stripSplit.js, DrawModePanel.jsx, useLayoutStrips.js, layout-divide.spec.ts | Shipped 2026-09-09, PR #251, Studio build 1714 |
| 3 | Live tweaks survive a power-cycle via a separate small NVS record; `/api/status` reports it | F1, firmware | LightweaverStorage, LightweaverWeb, main.cpp, VERSION | Shipped 2026-09-09, PR #252, firmware 1.1.33 build 1724 (carries the parked card-page change); hardware behaviour unverified until a card takes the update |
| 5 | Section selector on the card's visitor page | F1, firmware (same VERSION bump as 3) | LightweaverWeb.cpp handleRoot | Shipped with 1.1.33, screenshots checked at 390px; unverified on a real phone |
| S2 | Timeline model deleted; dial default cycle from playlist | S2, Studio | ProjectContext, ProjectDefaults, projectModel, rotaryPatternCycle, usbRotaryInput | Merged 2026-09-09, PR #250 (114 net lines removed) |
| 4 | On-card timed playlist: dwell per entry, one cross-fade, over saved compound looks; Studio adds dwell and fade to entries | F2 then S3 | LightweaverTypes.h, main.cpp, LightweaverWeb.cpp, cardPlaylist.js, cardRuntimeContract.js, lw-playlist.jsx | F2 (firmware, 1.1.34) and S3 (Studio) dispatched 2026-09-09 in parallel against the contract below |

Constraint for 3 and 4: the 3968-byte NVS budget. F1 measures a real 4-zone project's byte size and reports it in its PR.

## The timed-playlist contract (fixed 2026-09-09, both lanes build to it)

Project config sent by Install (`/api/config`): `"playlist": { "enabled", "fadeMs" 0..10000 default 1500, "entries": [ { "patternId", "dwellSeconds" 1..3600 } ] }`. `patternId` is the same identifier `/api/control` accepts today (an installed look id, or a built-in id). At most 16 entries reach the card (`LW_MAX_PLAYLIST_ENTRIES`, also `maxPlaylistEntries` in the hardware contract); the dial list keeps its 32. Absent or disabled means today's behaviour.

Runtime control: `POST /api/control { "playlist": "play" | "pause" | "next" | "previous" }`. Any manual look change (tile tap, dial, patternId/next/previous) pauses the playlist: the owner's hand wins.

Status: `GET /api/status` gains `"playlist": { "configured", "playing", "entryIndex", "entryCount", "patternId", "remainingSeconds" }`.

Persistence: the definition lives in the project and reaches the card only through Install; play state and entry index ride inside the `liveLook` NVS record from 1.1.33, so a power-cycle resumes a playing playlist. Cross-fade uses the card's existing fade path with `fadeMs`; the strip is never black between entries.

## Every brief carries

Exact files owned and no other file touched; the defect's citation; the locked UI conventions (word labels, one status and one primary action, sliders in reach, phone first, never fully black, no em-dashes); for firmware the byte cap and the measured config size; the acceptance test to add, with red-then-green evidence and verbatim counts; a VERSION bump for any firmware change.

## Resume point

Read the table's State column, then `gh pr list --state all --search "multi-pattern OR divide OR power-cycle OR timeline"`. Land one lane at a time; watch the Tests run on main after each merge (the Tests workflow runs only on push to main, never on PRs).
