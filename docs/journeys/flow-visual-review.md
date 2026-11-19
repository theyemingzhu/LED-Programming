# Lightweaver flow review

November 17, 2026 · proposal for visual approval

[Open the visual review board](/Users/adrianrasmussen/.codex/visualizations/2026/11/17/01a1e864-9412-7360-93ca-ad629c269b55/flow-review/index.html) · [Open the navigation mockup](/Users/adrianrasmussen/.codex/visualizations/2026/11/17/01a1e864-9412-7360-93ca-ad629c269b55/flow-review/proposal.html)

**Recommendation:** use four labeled Studio destinations, Card, Layout, Looks and Install, with a labeled Projects entry. Give permanent card writes one review destination. Keep the complete artwork visible while assigning a look. Put the customer’s three whole-look choices first.

## Preview refinement and first build

The first local increment keeps the piece preview and save controls in the same 390px editing view. Section rows show labeled palette samples. Animated strip preview, catalogue tiles, saved-look thumbnails and Lab handoff remain available. At 320px the artwork and named assignments wrap within the viewport and Save changes is reachable by vertical scrolling. [Rendered implementation comparisons](/Users/adrianrasmussen/.codex/visualizations/2026/11/17/01a1e864-9412-7360-93ca-ad629c269b55/flow-review/preview-refinement/index.html)

## Evidence

- **Approved UI baseline:** Studio and public Player built locally from `121a09c2be48b34458b2c15a390350722d3e0cd8` (build 2415), the UI source that went into PR #422. At inspection, local `origin/main` was `0ad69f53ab5c39e9e46afc645bd8e8c94b209c50` (build 2421). The diff from the UI baseline through that ref held five browser-test files and zero product files. The shared manager snapshot mixes that UI with separate queued native work. [Integration review](integration-2026-11-17/README.md) · [Workboard](../../LIGHTWEAVER_WORKBOARD.md)
- **Public Studio snapshot:** the no-store release response returned build 2414, `ceed326a9c1f7c051160239cb36a15eb624e1e3c`, when sampled. I rendered public Card and Patterns with the same browser fixture. The public Patterns phone capture reported a 401px CSS viewport in a configured 390px mobile screen. The approved baseline and proposal each reported 390px in their matched comparisons. This snapshot was a visual check. [Public release response](https://led.mandalacodes.com/studio-release.json) · [Capture record](/Users/adrianrasmussen/.codex/visualizations/2026/11/17/01a1e864-9412-7360-93ca-ad629c269b55/flow-review/capture-evidence.json)
- **Fixture:** Moon Garden · North Gallery, two rings with 27 and 17 LEDs, one GPIO 16 chain, three saves, Amber Tides, Velvet Dusk and Stillwater. Studio is offline with a browser draft and untested wiring. The network calls for the separate Player screenshot return fixtures for a connected card with the three installed choices. Captures use identical content and configured viewports. The current Looks view is the viewport the existing Edit action lands on. The proposed canvas is an illustrative rendering of the same ring counts. The mockup takes its warm Studio and olive Player styling from the rendered source. The older palette and WLED/Pi references in the design context were outside this review’s scope.
- **Verification scope:** 390×844 matched phone screenshots for five tasks and 1440×1000 for desktop Layout. The mockup was also checked at 320×760 with the long section name and at 1440×1000 for Looks. Browser evidence covers navigation, sizing and display. It includes no physical LED, card write, flash, signed firmware, or release verification. [Mockup checks](/Users/adrianrasmussen/.codex/visualizations/2026/11/17/01a1e864-9412-7360-93ca-ad629c269b55/flow-review/proposal-verification.json)

## Current and proposed flow

| Current route and handoff | Proposed route and handoff |
| --- | --- |
| Card → Find my card, Lights, setup / update → move to Layout or resume a suggested task | **Card** → identify current card/build and saved copies → play an existing install, resume the affected task or continue a new setup. Keep browser work available offline. |
| Layout → Import SVG / Draw / Shapes; inspect LEDs and open Wiring details or Specs | **Layout** → SVG or DIY → geometry, count and density → selected path linked to named section and GPIO/range → Connections or Build specs. Return to Lights for physical checks. |
| Patterns → Patterns & Looks → Project stacks, select/preview/edit → Lab or Show from the global rail | **Looks** → Saved looks → whole-piece preview → select a section and assign a Pattern, Tune, Mirror or open Lab. Sound remains optional and linked to the current project. |
| Playlist and separate Install on card controls on Layout/Patterns → card save/readback → open card/player from Card or tools | **Install** → Review or Playlist → compare saved draft and card copy → back up → deliberate apply by existing supported operation → same-card readback → Open Player / Copy Player link and local card access. |
| Player → looks, lights off, brightness and playlist; card-local controls have their own entry | **Player** → three whole-look choices, identified selected/playing state, then brightness/power and optional playlist/tuning. Card-local fallback remains available. |

Card, Layout and Looks can be visited in any order. Installation-specific checks apply when preparing the requested write. Layout and Looks keep their selected item when you return from Connections or Lab. A finished installation opens its Player directly. Editing an unfinished browser draft leaves the installed revision separately identified.

### Arrival and return

| State | Action and evidence |
| --- | --- |
| Blank or unknown card | Identify the expected card. Offer existing USB first-install or Wi‑Fi handoff as supported. Unknown compatibility stays visible as **Check compatibility**. Resume the browser draft on return. |
| Compatible install and an optional update | Keep **Open Player** primary. **View update** describes what changes. Existing playback and unfinished authoring stay available. |
| A feature needs an update | Name the feature and requirement. Prepare recoverable project/settings/media and show any known gaps before using the supported USB or Wi‑Fi path. Reconnect and verify the same identity, build and installed revision, then check affected playback. |
| Card and browser disagree | Show both with source and revision, preserve both, and offer **Open card copy** or **Continue browser copy**. Card reconstruction and recovery describe any missing originals or media. |
| Lights connected, layout unfinished | **Resume layout** opens at the selected path. Already verified lights remain marked verified. If a strip was just added, identify its pending physical checks. |
| GPIO, count, direction or physical chain changed | Preserve stable IDs and the recoverable prior revision. Recheck power/capacity, strip endpoints, counts, direction, section ranges, affected looks, preview and media. Require existing safe physical test/promotion before applying where applicable. |
| SVG replaced, section split/deleted, visual flow or symmetry changed | Keep earlier recoverable work. Identify changed and orphaned targets before installation. Review dependent assignments, mirror sides and recording freshness. Display order, physical chain order, animation flow and playlist order each have their own label. |
| Install interrupted, readback differs, or connection drops | Keep the saved draft and earlier recoverable copy. Show **Verification pending** or the observed mismatch. Offer **Check card**, **Retry verification** or a supported recovery from Support. When recovered, retrieve and verify the exact intended revision before offering handoff. |

## Names, actions and state

| Context | Name and primary action | Status and navigation rule |
| --- | --- | --- |
| Card / Lights | **Find my card**, **Resume layout**, or **Open Player**, chosen by known readiness | Show connected identity, compatibility, and the next unfinished task as separate facts. Settings, firmware/Wi‑Fi and Support have labeled destinations. |
| Layout / Connections | **Import SVG**, **Draw**, **Shapes**; **Edit connections** for physical mapping | **Needs test** describes wiring evidence. The layout remains a draft; **Install** leads to review. |
| Looks / Patterns / Lab | **Look** is the complete arrangement, **Pattern** is one effect, **Save look** saves the complete section assignment and supported tuning into the project | **Studio preview** is browser output. **Test on lights** is a temporary card operation with **Stop test** or restore. **Save look** is scoped to the look. Preserve target and return path through Lab. |
| Projects | **Save in this browser**, **Save to online library**, **Download project backup**, **Open project** | Report the destination after success. Recorded media coverage and the separate Voices backup need visible descriptions. Compare copies before switching or restoring. |
| Install / Playlist | **Install on card** for the named package; **Install playlist** remains a specific operation where applicable | Show source revision, target identity, included scope and required checks. **Installing**, **Verification pending**, and **Installed · read back** describe distinct outcomes. Remote storage and current playback can differ. |
| Customer Player | **A Amber Tides**, **B Velvet Dusk**, **C Stillwater**, or the installed look names alone | **Playing** follows card status. Lights off and disconnected have their own states. **Save adjustments** applies only when supported and confirmed for that look; transient edits clear on selection/reconnection. Keep **Playlist** separate from direct look selection. |

## Function-by-function consolidation

| Existing function | Proposed home |
| --- | --- |
| Card identity, remembered card, onboarding, USB installer, Wi‑Fi setup, optional/required preserving update | **Card → Connection** and context-sensitive Card arrival. Keep exact card/build checks, supported update path, backup preconditions and verification. |
| Strip discovery, GPIO, count, chipset/color order, first/last, brightness and power limits, physical test/recovery | **Card → Lights** for hardware facts and tests; **Layout → Connections** for routing/selection. Display current card and project values individually. |
| SVG import, DIY path/drawing, shape tools, transform, layers/visibility/order, scale/density, undo/redo | **Layout** creation toolbar, canvas and selected path editor. Keep replacement confirmation, parsed geometry check and verified undo boundaries. |
| Sections, GPIO/ranges/cuts/jumps, chain order, direction and path annotations | **Layout → Connections**. Keep visible selected route and linked canvas. Preserve focused split, count and wiring edits and staged confirmation. |
| LEDs / Light / Heat / glow, zoom, fit, canvas preview, short-strip calibration | **Layout → Preview** offers the visualization modes and placement settings. Keep Undo/Redo, sizing and fit near the canvas; preview calibration and theme remain available from Preferences. |
| Layout symmetry and look-specific mirror/kaleidoscope | **Layout → Symmetry** for geometry/sides; **Looks → Mirror** for a supported per-look treatment. Show scope, target and compatibility. |
| Specs/build sheet and fabrication information | **Layout → Build specs**, a labeled destination with count, density, sizing, wiring and power information. |
| Mapper and transfer | **Layout → Mapper**. Keep standalone authoring; label geometry-only transfer into Studio. |
| Pattern catalogue, filters, assignments, individual/whole-piece targets, tuning, advanced color and audition | **Looks → Patterns / Tune** for the selected target. Keep catalogue, scope, effects and local or temporary physical audition with an explicit stop. |
| Saved Project stacks, create/copy/name/delete, preview, edit, look section details, add to playlist | **Looks → Saved looks** for management; **Looks** for selected look; **Install → Playlist** for ordering. Keep existing IDs, compatibility and selection/preview semantics. |
| Lab custom pattern editing, layers, private drafts, evolution, recordings and execution diagnostics | **Looks → Lab**. Keep authoring, recorded alternatives, verdict and focused diagnostics, with return to the current look/target. |
| Show microphone/song/demo modes, voices, live streaming, scenes, composition, recordings | **Looks → Sound** with labeled Live sound, Scenes and recorded motion routes. Maintain separate Voices import/export; expose browser-active requirement and scene/media compatibility. |
| Playlist picker, patterns and complete looks, dial/timed order, durations, fade, manual play/reset, capacity, recording checks and install | **Install → Playlist** with existing preview, run/reset, legacy patterns, recordings, install rules and source selection. **Review** summarizes the installed payload and configured startup behavior. |
| Project creation, local/online library, project save, import/export, legacy restore and portable assets | One global **Projects** entry. Install links to backup and compare. Layout keeps SVG import. Preferences remains reachable with a labeled link from Projects and Support as appropriate. |
| Customer pairing/link, on-card Player, offline local fallback, direct looks, power, playback and tuning | **Install → Open Player / Copy Player link** after verified readback; **Card → Open card page** for local access. Preserve separate Player tuning and playlist; keep safe older-card affordances. |
| Diagnostics, chip JSON/config, installer repair, project recovery, card/build information, batch production / Workshop | **Card → Support** and a labeled Workshop link. Keep existing recovery and technician functions available from the relevant error path and Tools. |

## Playback, recovery and approval boundaries

Use ordinary native lighting as the default path. Live sound requires the browser foreground and an explicit stop/return to ordinary playback. A recording plays fixed motion with compatible installed media. Standalone listening remains unfinished. Voices backup is a separate portable artifact. Claims about media restoration require a clean restore check.

The approved product policy is relative brightness/speed and hue offset across the whole look while retaining authored differences; configured default startup restores its saved settings. The firmware patch sits in the waiting queue. Until a supported card reports the required capability, keep its existing safe control behavior and explain unavailable adjustments. Whole-look recall, restart and physical output need bench proof. The startup value in the board illustrates the authored configuration to verify; derive it from the actual package.

The A/B/C letters in the proposal are a display choice for this three-look installation. Use an existing explicit choice order where supported. If current formats cannot safely retain a meaningful direct-choice order independently of timed entries, use names only and discuss any independent slot contract separately.

## Approval requested

1. **Studio navigation:** approve Card / Layout / Looks / Install with Projects always labeled, plus focused specialist destinations.
2. **Making and installation:** approve the selected-path Connections view, whole-piece Looks editor and one Install review with a distinct Playlist tab. Preserve fast deep links to review from the authoring screens.
3. **Customer screen:** approve choices above controls and stable A/B/C labels where supported. Named choices alone are the compatible fallback.

The preview refinement is built locally. The wider navigation and install concepts remain in the visual review. The [owner workflow](owner-workflow.md) and [workflow audit](2026-11-17-owner-workflow-audit.md) contain the underlying product and recovery acceptance paths.
