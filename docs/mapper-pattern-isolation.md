# Standalone mapper pattern boundary

Candidate stacks on PR397 (`06b946d7298cff9980c1e09f05682d33b2c587eb`). No deployment or firmware change.

## Mounted path and deployment evidence

`led-art-mapper/app/index.html` mounts `src/main.js` directly. Its project Load action restores JSON `patterns` and per-section assignments, `_rebuildNorm()` starts the preview, and `_compileAndRun()` compiles the selected/global/section/group sources. The effect-file importer and mounted CodeMirror editor reach the same cache. Previously `_tick()` called mapper `evalPixel()` on these callbacks in the page, and `_frozenColorFn` retained an executing callback for stopped repaints.

The package runs a standalone Vite app (development port 9999, build `app/dist`); GUIDE describes running it locally. Repository test/exhaustive workflows install/build/test it. No mapper public deployment or response-header route was found. Studio's public headers do not establish this app's policy. This candidate needs no new outer header: the existing shared service's fixed hash-authorized bootstrap creates its own opaque-origin iframe and CSP-restricted Worker. A future host that blocks that bootstrap fails closed and needs a separately reviewed exact policy, never a native fallback.

## Candidate

The mounted renderer now sends ordered source/argument samples through the existing `createPatternFrameService().render({sources,samples})` packed API with an optional fixed `mapper` dialect. The default modern and legacy-v3 dialects retain their compiler, argument and source budgets. Mapper reuses its own compiler/helpers/evaluator verbatim, privately scoped in the Worker. Its source functions receive exactly 12 native arguments, including chain-root timing/index/count but leaf strip identity/progress. Arrays remain black, scalar `mix` remains scalar, thrown errors remain dim red. The page still performs the existing hue, brightness, saturation, gamma and physical-address mapping in their original order.

Mapper compile remains a page-side syntax check and source registration; the mounted page never invokes its returned authored function. Completed colors are cached for frozen repaint; no authored code is retained in the repaint callback. Stop, pagehide/HMR, geometry replacement, routing/assignment changes and editor updates cancel the pending generation and destroy its Worker. Editor debounce suspends new frames until compilation completes. A deadline/failure stops animation and displays an error; unchanged failed source is not retried by the animation loop. New project load clears old compiled callbacks, including reused IDs. No execution fallback exists.

The RGB byte API cannot directly retain NaN channels, which the original mapper evaluator lets reach its later color transforms. Private query samples return three 3-bit NaN masks per RGB triplet and a fixed 312-byte diagnostic block. They read already evaluated data and **do not invoke authored functions**. Native error messages remain bounded and escaped in the existing inspector; toast/error sinks use `textContent`. Stack traces are not transported (the inspector never displayed them).

Budget formula for N real evaluated pixels: `N + ceil(N / 3) +104` samples. At public capacity 16,384 LEDs: `16384 +5462 +104 =21950`, below 32,000. Mapper supports 256 distinct section sources using all Uint8 source indices 0..255; the 255 error sentinel remains exclusive to the modern dialect. Existing 8MB packed transport and 64KiB/source budgets still apply; extreme source volume can fail closed even when LED geometry fits. No public LED capacity is reduced.

## Evidence

- Real project-import red sentinel: imported `Math.__mapperMutation=172` mutated page Math before the patch. The isolated real import, including a computed Function-constructor escape, leaves the page untouched and paints `{r:0,g:255,b:0}` instead of reading the page's172 canary.
- Mounted project/effect-file/editor input, looping-source stop, good same-ID replacement, rapid edit cancellation, stopped frozen repaint, pagehide/disposal and displayed errors pass in visible Chromium.
- Actual project picker loads 256 sections with 256 distinct sources and 16,384 LEDs and reaches a rendered frame. Adapter max-capacity and oversize rejection also pass.
- Stateful three-pixel proof: calls 1,2(NaN),3(throw); next frame 4,5,6; error count stays 1. Masks/diagnostics cause no extra evaluations. NaN channels survive the byte boundary.
- All 29 mapper library patterns plus five call/helper/object/NaN/error fixtures match native mapper evaluation exactly across 306 deterministic samples. Chain/leaf/native argument ordering has a separate focused test.
- Actual editor error `<img src="data:," onerror="Math.__mapperInspectorCanary=172">` displays literally, creates zero images and leaves the page canary unset. Inspector escaping remains necessary: diagnostics are untrusted.
- Mapper full suite 34 passed at the implementation checkpoint; latest six focused browser cases (including final capacity/metadata/inert-error proofs) pass. Eleven focused codec/mapper adapter unit tests pass. Modern 30 and legacy 12 Chromium/WebKit/mobile regression cases pass. Mapper and Studio production builds pass (existing large-chunk warnings).
- Desktop 1440×960 and mobile 390×844 rendered screenshots inspected. Desktop preview/editor/inspector work. The pre-existing mobile fixed-width sidebar and crowded toolbar overlap much of the artwork; this security patch does not redesign it. Screenshots are local evidence, not a mobile-layout quality claim.

## Limits and next scope

This closes authored-source invocation in the standalone `led-art-mapper/app` mounted preview paths. It does not establish global boundary closure or deployed protection. Separate `led-art-mapper/pi-server` mounts an operator CodeMirror editor, imports `compile/evalScene/runBeforeRender`, and has a different stateful scene API: trace/migrate that actual operator-editor runtime separately. `led-art-mapper/controller` currently imports bundled `SCENES`/`evalPixel`; source provenance needs its own trace before changing it. Unmounted legacy/editor modules from earlier receipts remain outside this candidate. Browser isolation deliberately removes page-global mutation and external capabilities; no parity promise covers those side effects. Existing browser/OS memory limits remain the ultimate defense against allocations inside a hostile Worker.
