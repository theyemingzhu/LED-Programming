# Show -> card playback research

Date: 2026-09-22  
Scope: repository audit only; no card calls or product-code changes.

## Outcome

There is no integrated **Show -> standalone card** path today. Show is a browser performance surface: it computes sound-reactive frames in the tab and sends them to the card only while **Play on the lights** is active. Its Voices composition and mode tuning survive in browser `localStorage`, but neither enters the project document nor the runtime package written by **Save to card**. Closing or background-throttling the tab ends or interrupts the stream; firmware then returns to its already installed local look.

Pattern Lab has two real standalone paths:

1. A card-compatible static built-in look, or a Color Journey that compiles to the firmware's native recipe, is added to Patterns, added to the Playlist if desired, and installed through the normal project **Save to card** path. It then runs from internal flash across browser close and reboot.
2. A bake-compatible evolving/layered recipe can generate `.lwseq` plus a sidecar and a one-look controller package. The package must currently be unpacked onto a FAT32 microSD card outside the Studio, then inserted and rebooted. It runs after browser close and reboot because the firmware mounts and prefers an exact-card SD project at boot.

These paths are not integrated with each other. A baked `sequenceAsset` stored in the Studio project is ignored by the normal runtime-package builder and is not available in the Playlist UI. The downloaded package contains only that one sequence look. Native looks and recordings can coexist in firmware playlists in principle, but Studio does not currently build or install that combined SD package.

## What the screens actually do

### Show

Visible controls and their effects:

| UI control | Actual behavior | Persistence / standalone result |
| --- | --- | --- |
| **Microphone**, **Song file**, **Quiet**, built-in music | Selects the browser audio source and feeds the analyser/engine. Song files are object URLs owned by the open tab. | No audio or analysis is copied to the card. [lw-show.jsx:699-815](../../lightweaver/src/v3/lw-show.jsx#L699) |
| **Modes** / **Voices** | Switches between the nine whole-piece browser modes and a per-area composition without replacing the audio graph or card stream. | Engine choice itself is React state; it is not persisted. [lw-show.jsx:340-467](../../lightweaver/src/v3/lw-show.jsx#L340) |
| Voice character/band/depth/spread/direction and Ground | Mutates the browser composition; held-chip audition and Solo are temporary overlays. The screen says **Everything saves itself**. [ShowVoices.jsx:338-377](../../lightweaver/src/v3/ShowVoices.jsx#L338) | The authored composition is debounced into `lw.show.compositions.v1`, keyed by project ID, in browser `localStorage`; it is explicitly kept outside the project file. Solo/audition are not saved. [lw-show.jsx:407-467](../../lightweaver/src/v3/lw-show.jsx#L407), [showComposition.js:267-307](../../lightweaver/src/lib/showComposition.js#L267) |
| **Tune {mode}**, **Save as default**, **Export file** | Adjusts mode parameters. Save writes `lw.show.modeParams.v1` to this browser; Export downloads `lightweaver-mode-defaults.json`. [lw-show.jsx:47-64](../../lightweaver/src/v3/lw-show.jsx#L47), [lw-show.jsx:367-395](../../lightweaver/src/v3/lw-show.jsx#L367), [lw-show.jsx:1307-1348](../../lightweaver/src/v3/lw-show.jsx#L1307) | The JSON is portable authoring data only. There is no import button here, no project handoff, no card recipe, and no sequence bake from Show. |
| **Mandala** / **Connected layout**; **Whole design** / a named strip | Chooses preview/stream geometry and can compact one authored strip onto the connected bench strip. [lw-show.jsx:1031-1062](../../lightweaver/src/v3/lw-show.jsx#L1031), [lw-show.jsx:1098-1139](../../lightweaver/src/v3/lw-show.jsx#L1098) | Explicitly preview-only; nothing is installed or scaled into a durable card asset. |
| **Play on the lights** / **Stop playing on the lights** | Starts/stops the card frame stream after project/bridge authority checks. Frames are rendered in the browser and pushed at about 18 fps. [lw-show.jsx:501-605](../../lightweaver/src/v3/lw-show.jsx#L501), [lw-show.jsx:878-987](../../lightweaver/src/v3/lw-show.jsx#L878), [lw-show.jsx:999-1018](../../lightweaver/src/v3/lw-show.jsx#L999) | Live only. Unmount stops the stream and closes audio; a backgrounded tab can miss the card's 2 s watchdog. [lw-show.jsx:607-647](../../lightweaver/src/v3/lw-show.jsx#L607) |

The shared footer's **Save to card** therefore does not save the Show that says “Everything saves itself.” It saves the project/runtime configuration, while the Show composition deliberately remains a sibling `localStorage` record. This is a material UI ambiguity.

### Pattern Lab and Patterns

| UI control | Actual behavior | Standalone result |
| --- | --- | --- |
| **Save private draft** / **Save new private draft** | Saves the editable recipe to Pattern Lab browser storage. Existing work defaults to a new copy rather than overwrite. [PatternLabScreen.jsx:1540-1595](../../lightweaver/src/pattern-lab/PatternLabScreen.jsx#L1540), [PatternLabScreen.jsx:2316-2334](../../lightweaver/src/pattern-lab/PatternLabScreen.jsx#L2316) | Browser-local editing state only; it is not a card install. |
| **Export recipe** / **Import recipe** | Downloads or opens `.lwrecipe.json`. [PatternLabScreen.jsx:1648-1659](../../lightweaver/src/pattern-lab/PatternLabScreen.jsx#L1648), [PatternLabScreen.jsx:2342-2348](../../lightweaver/src/pattern-lab/PatternLabScreen.jsx#L2342) | Portable editable source, not firmware playback. |
| **Add to Patterns** / **Update in Patterns** | For `live-on-card`, creates/updates a saved look in the project. For other classifications, the primary action stores a `projectOnly` look excluded from card installs. [PatternLabScreen.jsx:119-132](../../lightweaver/src/pattern-lab/PatternLabScreen.jsx#L119), [PatternLabScreen.jsx:1684-1764](../../lightweaver/src/pattern-lab/PatternLabScreen.jsx#L1684), [patternLabHandoff.js:479-556](../../lightweaver/src/lib/patternLabHandoff.js#L479) | A native-capable item still must be put in the Playlist and installed with project **Save to card**. A `projectOnly` item stays editable but cannot reach firmware. |
| **Bake** in **Card compatibility & diagnostics** | Deterministically renders the recipe, downloads `<project>.lwseq` and `<project>.lwseq.json`, and retains the bake result in the current component state. [PatternLabExport.jsx:152-180](../../lightweaver/src/pattern-lab/PatternLabExport.jsx#L152), [PatternLabScreen.jsx:2170-2199](../../lightweaver/src/pattern-lab/PatternLabScreen.jsx#L2170) | Files exist on the computer only. Reloading/changing the recipe clears the completed bake result. |
| **Review Use in Project** -> **Add to project** after bake | Verifies the exact bake and adds bounded `sequenceAsset` metadata to the project; also downloads `<asset>.lightweaver-controller.json`. [PatternLabExport.jsx:301-333](../../lightweaver/src/pattern-lab/PatternLabExport.jsx#L301), [PatternLabScreen.jsx:1692-1742](../../lightweaver/src/pattern-lab/PatternLabScreen.jsx#L1692) | Does not write the sequence to the card. The controller package embeds `/lightweaver.json`, the base64 sequence, and its sidecar. [patternLabHandoff.js:389-445](../../lightweaver/src/lib/patternLabHandoff.js#L389) |
| Playlist star in Patterns | Adds a built-in pattern or saved combo/native look to the project playlist. [lw-pattern.jsx:2013-2054](../../lightweaver/src/v3/lw-pattern.jsx#L2013), [lw-pattern.jsx:2709-2741](../../lightweaver/src/v3/lw-pattern.jsx#L2709) | Normal project install compiles enabled playlist items to firmware looks. `sequenceAssets` have no Playlist UI representation. |

## Exact standalone paths

### Native recipe / procedural path

1. Author in Pattern Lab.
2. Use **Add to Patterns**. A simple built-in pattern becomes a saved native look. Color Journey is the only Pattern Lab recipe currently compiled into `look.nativeRecipe`; layered/evolving non-journey recipes are rejected from this path. [patternLabHandoff.js:514-556](../../lightweaver/src/lib/patternLabHandoff.js#L514)
3. In Patterns, star the saved look into the Playlist.
4. Use the project's **Save to card** action. The builder filters out `projectOnly` looks, normalizes the playlist, compiles Color Journey native data, and emits the runtime config. [cardRuntimeProject.js:66-127](../../lightweaver/src/lib/cardRuntimeProject.js#L66), [cardRuntimeProject.js:248-299](../../lightweaver/src/lib/cardRuntimeProject.js#L248)
5. Studio posts only the compact JSON configuration to `/api/config`, directly or through the card-page bridge. [cardPushClient.js:128-156](../../lightweaver/src/lib/cardPushClient.js#L128), [cardPushClient.js:370-516](../../lightweaver/src/lib/cardPushClient.js#L370)
6. Firmware stores/boots that known-good config and starts the selected startup look locally. [main.cpp:393-505](../../firmware/lightweaver-controller/src/main.cpp#L393)

Native Color Journey installation is capability-gated. Studio checks the connected card's advertised `recipeCapabilities` version against the compiled recipe; v1 supports 256 phase values, while v2/v3 support up to 65,535 pixels through at most 64 affine spans. [colorJourneyNative.js:300-318](../../lightweaver/src/lib/colorJourneyNative.js#L300), [LightweaverRecipe.h:23-30](../../firmware/lightweaver-controller/src/LightweaverRecipe.h#L23), [cardPushClient.js:102-111](../../lightweaver/src/lib/cardPushClient.js#L102)

### Recorded `.lwseq` / microSD path

1. Author a whole-piece Pattern Lab recipe classified `bake-to-card`. Section-scoped recipes cannot be baked from Lab. [PatternLabScreen.jsx:1662-1681](../../lightweaver/src/pattern-lab/PatternLabScreen.jsx#L1662)
2. Open **Card compatibility & diagnostics**, press the offered **Bake** action, then **Review Use in Project** and **Add to project**. Keep the downloaded `*.lightweaver-controller.json`; the loose `.lwseq` and sidecar are useful evidence, but the package is the install input.
3. Format the card FAT32, mount it on the computer, and run:

   ```bash
   cd lightweaver
   npm run standalone:unpack -- ~/Downloads/<asset>.lightweaver-controller.json /Volumes/LIGHTWEAVER
   ```

   This validates declared bytes/hashes, rewrites the sequence to a content-addressed `/sequences/.lw/<sha256>.lwseq`, and writes `/lightweaver.json` atomically. [unpack-standalone-package.mjs:6-82](../../lightweaver/scripts/unpack-standalone-package.mjs#L6), [unpack-standalone-package.mjs:151-220](../../lightweaver/scripts/unpack-standalone-package.mjs#L151), [firmware README:42-63](../../firmware/lightweaver-controller/README.md#L42)
4. Insert the microSD and reboot. After higher-priority wiring-candidate handling, firmware loads a valid exact-card SD project before the internal-flash project and keeps SD mounted for playback. [LightweaverStorage.cpp:1670-1680](../../firmware/lightweaver-controller/src/LightweaverStorage.cpp#L1670), [LightweaverStorage.cpp:1839-1848](../../firmware/lightweaver-controller/src/LightweaverStorage.cpp#L1839)
5. The generated profile selects its one sequence as `startupLook`. Firmware verifies full file size, SHA-256, header version/channels, exact pixel count, frame count and fps before opening, then loops RGB frames from SD. [patternLabHandoff.js:411-445](../../lightweaver/src/lib/patternLabHandoff.js#L411), [main.cpp:1431-1542](../../firmware/lightweaver-controller/src/main.cpp#L1431), [main.cpp:1814-1845](../../firmware/lightweaver-controller/src/main.cpp#L1814)

The downloaded package is exact-card bound. A package made without the intended card identity, or for different output/pixel geometry, will not be a reliable drop-in install; the firmware rejects nonmatching sequence metadata and the SD loader accepts only an exact-card project.

## What survives

| State | Browser close | Card reboot | Another browser/device |
| --- | --- | --- | --- |
| Show live stream, audio source, selected engine, live Solo/audition | Stops/lost | Card resumes its existing local runtime | No |
| Show Voices composition | Survives in same browser/profile | Irrelevant to card | No built-in transfer/export UI |
| Show mode defaults | Survives in same browser/profile; JSON can be manually exported | Irrelevant to card | Exported JSON has no corresponding Show import control |
| Pattern Lab private draft | Survives in same browser storage | Irrelevant until added/installed | Recipe file can transfer it |
| `projectOnly` Pattern Lab look | Survives with Studio project | Excluded from install | Yes with project, but still Studio-only |
| Native saved look in installed playlist | Yes | Yes, from internal flash (unless an authoritative exact-card SD project overrides it) | Card-local |
| Baked sequence in downloaded package only | Yes on computer | No | Package is portable but not installed |
| Baked sequence unpacked to microSD | Yes | Yes; selected at startup | Card-local while SD remains inserted |

## Five integration gaps

1. **Show's autosave wording collides with card-save wording.** “Everything saves itself” refers only to browser-local composition storage, while the shared **Save to card** action packages the project and never reads `lw.show.compositions.v1`. Show's persistence is explicitly outside the project to avoid changing the live-control fingerprint. [ShowVoices.jsx:375-377](../../lightweaver/src/v3/ShowVoices.jsx#L375), [lw-show.jsx:407-467](../../lightweaver/src/v3/lw-show.jsx#L407), [showComposition.js:267-307](../../lightweaver/src/lib/showComposition.js#L267)

2. **Show cannot export a playable artifact.** Its only export is mode-default JSON; there is no composition export button, Pattern Lab handoff, recorder, `.lwseq` bake, playlist entry, or native firmware recipe. “Play on the lights” is only a browser frame stream and teardown explicitly stops it. [lw-show.jsx:384-395](../../lightweaver/src/v3/lw-show.jsx#L384), [lw-show.jsx:607-622](../../lightweaver/src/v3/lw-show.jsx#L607), [lw-show.jsx:923-987](../../lightweaver/src/v3/lw-show.jsx#L923)

3. **Baked sequence metadata enters the project but not the normal card package or Playlist.** `applyPatternLabHandoff` writes `activeSequenceAssetId`/`sequenceAssets`, but `buildCardRuntimePackageFromProject` builds looks solely from Playlist items and saved looks; it never reads sequence assets. [patternLabHandoff.js:641-667](../../lightweaver/src/lib/patternLabHandoff.js#L641), [cardRuntimeProject.js:66-127](../../lightweaver/src/lib/cardRuntimeProject.js#L66), [cardRuntimeProject.js:248-335](../../lightweaver/src/lib/cardRuntimeProject.js#L248)

4. **There is no browser-to-SD/card sequence upload.** The card web server exposes config/control/status endpoints but no sequence-file upload endpoint, and `/api/config` carries compact JSON only. The supported install is a CLI unpack to a mounted microSD. [LightweaverWeb.cpp:3185-3229](../../firmware/lightweaver-controller/src/LightweaverWeb.cpp#L3185), [cardPushClient.js:128-156](../../lightweaver/src/lib/cardPushClient.js#L128), [firmware README:42-58](../../firmware/lightweaver-controller/README.md#L42)

5. **The bake fallback does not cover large installations or all Lab recipes.** Bake rejects Color Journeys, requires known send-ready wiring and a positive 1-900 s evolution, and hard-stops above `finalSamples = 1024` source pixels even though native/card contracts can describe larger pieces. This blocks a blanket “record whatever I made” fallback for the stated 4096-pixel installation. [lwseqBake.js:303-355](../../lightweaver/src/lib/lwseqBake.js#L303), [patternLabWorkerProtocol.js:16-27](../../lightweaver/src/lib/patternLabWorkerProtocol.js#L16)

## Native/recorded playlist reality

Firmware can play a timed playlist whose entries resolve to installed look IDs, including a sequence look: before switching it validates and stages the sequence, and the same playlist advance logic then starts it. [main.cpp:3301-3364](../../firmware/lightweaver-controller/src/main.cpp#L3301) The firmware renderer gives a selected sequence the whole LED canvas; sequence looks are not zone-targetable. [main.cpp:1614-1631](../../firmware/lightweaver-controller/src/main.cpp#L1614), [main.cpp:1792-1798](../../firmware/lightweaver-controller/src/main.cpp#L1792)

The missing part is Studio authoring/install: the Pattern Lab package generator emits one sequence look and no combined playlist; normal project packaging emits native/procedural playlist looks and ignores `sequenceAssets`. Mixing recorded and native looks therefore requires a new combined SD-package builder/UI (or carefully hand-authored package), not an existing button sequence.

## Evidence status

### Source-established

- All UI labels, persistence keys, package shapes, endpoint availability, boot priority, integrity checks, and renderer/playlist behavior above were traced from current source.
- The repository itself documents the FAT32 + `standalone:unpack` installation workflow. [firmware README:133-144](../../firmware/lightweaver-controller/README.md#L133)

### Machine-tested in this audit

- `node --test src/lib/showComposition.test.js src/lib/patternLabHandoff.test.js`: 34/34 passing, including browser-local Show composition round-trip, native Color Journey handoff, complete sequence package generation, tamper/stale-recipe rejection, and bounded project metadata.
- `node ../firmware/lightweaver-controller/tests/recipe-capabilities.mjs`: passing.
- `node ../firmware/lightweaver-controller/tests/playlist-combo-looks.mjs`: passing.

### Observed but not proven here

- The current Show screen was visually observed to contain **Everything saves itself** while the shared shell exposed **Save to card**. This audit did not mutate the UI or run a card.

### Unknown / requires Bench evidence

- Whether a controller package made in the present production build successfully boots and loops on Adrian's exact physical card/SD combination.
- SD filesystem/card compatibility, sustained read reliability, restart behavior under power loss, and physical next/previous selection.
- Whether the currently connected card advertises the Color Journey capability version needed by a specific compiled native journey.
- Exact visual parity between Pattern Lab preview and physical native/recorded playback after color order, gamma, current limiting, and installation wiring are applied.

## Practical product implication

For tangible standalone adjustment now, the least-fragmented supported flow is: create a card-compatible Pattern Lab look, **Add to Patterns**, star it into the Playlist, **Save to card**, then reopen the linked design in Lab for edits and reinstall. Use `.lwseq` only when the design genuinely needs evolution/layers and fits the 1024-source-pixel and storage bounds; expect a manual microSD step and a one-look SD project. Show itself remains a live rehearsal/performance tool until it gains an explicit “record this performance/recipe” handoff and a combined playlist-aware installer.
