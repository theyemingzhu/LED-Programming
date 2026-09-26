# Flow and layer composition integration

Status: integrated and verified locally after `cdb69fbf`; not deployed or flashed.

This Sprint implements the next pieces of the refined section workflow. Physical
GPIO wiring, logical flow order, effect layer order and temporal step order have
separate authorities. No ring-shaped artwork is assumed.

## Ownership

| Work | Owner | Reasoning | Boundary |
| --- | --- | --- | --- |
| Ordered flow and preview | Sol | High | Scene Expression resolver, renderer, editor and tests |
| Layer authoring and persistence | Sol | High | Lab controls, recipe, compositor adapter and tests |
| Composition delivery | Existing Sol worker | Inherited | Compatibility, handoff, bake and exact source retention |
| Integration and verification | Primary manager | Cross-boundary decisions | Contracts, review, browser coordination and checkpoint |

High effort is used for identity, rendering and persistent data contracts. The
existing delivery worker retains its settings. A small acceptance review can use
Luna after a worker slot becomes available.

## Acceptance ledger

- Ordered flow: unequal section lengths; reverse independently of wiring; real
  source addresses across GPIO boundaries; missing references fail visibly.
- Layers: base plus bounded overlays; pattern, target, blend, opacity, mute and
  accessible order; noncommutative pixel oracle; output brightness applied once.
- Persistence: draft Undo, Keep, reload, reopen, update, save-as-new and recipe
  import/export retain the complete source and stable references.
- Delivery: exact recipe and geometry/wiring match the completed recording;
  full source survives sidecar/project backup; unsupported native paths remain
  unavailable.
- Screens: existing Lab/Patterns/Show conventions; phone and desktop inspection;
  no duplicate composer and no false ring geometry.

Physical appearance,
power-cycle playback, restore and novice usability require observed hardware or
human acceptance and are not claimed by browser/unit tests.

## Integration findings

The existing recorded-sequence sidecar already stores the full recipe. Its
runtime look is a sequence reference, while ordinary saved looks are native
visual settings. These must not be coerced into each other. General recorded
assets therefore use the existing standalone package path; native Playlist
support requires a separate media contract.

Layer rendering exists in both the direct adapter and the background worker.
Both must skip muted layers and resolve the same canonical section membership.
Canonical section IDs are not physical strip IDs. The new target snapshot must
match current section membership before a recording or project handoff.

Recording validation previously checked exact source and bytes but not the
current artwork/wiring projection. The new boundary compares the completed
recording with current physical layout and render settings.

Flow sampling uses logical progress independently of the artwork's drawing
coordinates. Integration review checks the actual pattern function signature,
per-strip renderer overrides, sparse temporal inheritance and physical frame
scattering, rather than relying only on route metadata tests.

Baseline cross-screen acceptance: `composition-contact.spec.ts` passes for a
two-layer source through import, Patterns, reload, Lab and rename/update. Exact
layer content, physical wiring and two Playlist reference identities survive;
the source remains honestly project-only and no card mutations occur.

## Completed verification

- One integrated checkpoint: **2774/2774 unit tests** and production build pass.
- **20 distinct browser cases** pass across the new composition contacts,
  complete UI recording, Flow, Lab layer authoring, saved recording reopen,
  existing Lab look round trips and Scene Expression lifecycle. The two layer
  cases were rerun with added real phone delete/Undo and blend interaction.
- The complete recording test clicks the real Lab controls, records **7200
  frames / 5 LEDs / GPIO 16 and 17**, downloads the controller package and
  checks its output sizes, complete recipe, section mask and persisted sidecar.
- Flow has real Chase and Plasma equivalence tests against a single logical
  chain, reversed unequal areas, inactive gap scattering, shared time, sparse
  temporal inheritance, full Repeat reset and explicit partial-overlap errors.
- The direct layer renderer and actual worker agree on canonical section masks,
  mute and noncommutative order. Both reject an unsupported mixed section base.
- Recording source SHA-256 is verified before legacy layer-ID migration; source
  and output fingerprints are checked again before recording replacement.
- Existing CI contract tests: 18/18 pass. New browser cases are registered in
  `ci:browser-regression`; new unit files are covered by the existing glob.
- Desktop Flow/recording and phone 320/390 screenshots inspected. Phone tests
  interact with controls below the fold, including Delete and Undo.

Early failures were corrected test timing/normalization assumptions (autosave
settling and wiring migration metadata). One lifecycle run during concurrent
hot reload returned to Lab; the complete lifecycle suite passed after source
changes settled. The legacy screenshot paths now use portable test output paths.
The build retains its existing large-chunk warning.

## Exact remaining scope

1. **Standalone Flow delivery:** preview and temporary connected-light mapping
   are implemented; no complete Flow recording/native compiler is delivered.
2. **Recorded Playlist integration:** recordings export verified standalone
   controller packages and reopen in Lab. They are not procedural Playlist
   targets. A media upload/install/readback contract is still needed for a
   unified card Playlist, alongside storage budgets and recovery behavior.
3. **Mixed section bases under overlays:** independently targeted overlays are
   supported over a uniform base. A pre-existing mix with distinct section
   patterns or colors cannot yet become the base of another layer stack. It is
   preserved and blocked explicitly instead of being flattened.
4. **Hardware acceptance:** physical mapping/appearance, offline restart,
   restoration and novice usability remain unobserved. No firmware release,
   signing, card flash, deployment or exhaustive Prove run occurred.

The primary integrated three Sol workstreams, with high reasoning for Flow and
layer identity/rendering, the existing Sol delivery worker, and a bounded Luna
audit/styling task. The audit's suggested mutation defect was retracted after
checking the input clone and passing legacy-recording regression.
