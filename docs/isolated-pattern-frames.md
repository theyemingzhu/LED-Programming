# Isolated pattern frames: draft implementation, partial migration

This candidate isolates the ordinary, source-driven `src/v3/PatternPreview.jsx`
branch used by the active Studio Patterns preview. It does **not** close the
whole executable-pattern boundary. No firmware, signer, release, transport,
merge, deployment or card flash is included.

## Boundary and behavior

`patternFrameIsolation.js` creates a hidden iframe with `allow-scripts` and no
`allow-same-origin`. Only a fixed, hash-authorized inline bootstrap runs in that
opaque-origin frame. It creates a disposable blob Worker. Pattern source executes
only in that Worker, never in the iframe (which would expose navigation).
The iframe's additional CSP denies network, images, media, frames, objects,
forms and base URLs; worker creation is blob-only. Worker/global constructors
for nested Workers, SharedWorkers and importScripts are removed before source
execution. The existing compiler's token checks remain as compatibility rules;
no regex or shadow-argument security claim remains in its comments.

The parent sends cloned source and explicit per-pixel data over a dedicated
MessageChannel. Source changes replace the complete opaque session. Only the
expected request ID and an exact-size, offset-zero Uint8Array with an exact-size
ArrayBuffer pass both message boundaries. Stale, malformed, oversized and
oversized-backing-buffer replies do not become page frames. One outstanding
request per owner prevents an unbounded page queue. Colors remain controlled by
the authored source; a hostile source can lie about its own colors.

Startup has a 3-second deadline; evaluation/compilation has a 500 ms deadline.
A timeout rejects the frame and removes the iframe/Worker session. Unmount
cancels pending work. The preview displays a stopped/unavailable message and
never falls back to native evaluation after an isolation failure. Changing the
selected pattern resets the visible error and can start a clean session.
The current source protocol limits 64 sources, 64 KiB each, 32,000 samples,
8 MB serialized input and 96,000 output bytes.

Native Workers do not provide strict per-pattern heap/instruction quotas.
A hostile pattern may exhaust renderer/browser memory before termination or
flood its own worker-to-iframe channel. Neither bounded frame buffers nor the
wall-clock deadline prove memory containment. A bounded VM/interpreter remains
necessary if strict heap isolation is an acceptance requirement.

`isolatedFrameEngine.js` collects existing frame-engine pixel arguments without
executing source, evaluates one isolated batch, then replays returned RGB values
through the same geometry/blend/mirror/color implementation. A clone freezes
frame inputs while awaiting the result. This intentionally pays a second
geometry pass rather than maintaining a second color/geometry algorithm.
The synchronous frame-engine API and external compiledFn interface remain.
The preview preserves its previous shared blend-parameter behavior.

The public CSP authorizes the exact fixed bootstrap hash, not arbitrary inline
scripts. The policy unit test requires the source bytes, service policy and
public header to match. The service needs no bootstrap resource request and
works offline in Chromium after its application module is loaded. The tested
WebKit build times out offline (online tests pass); it rejects without a native
fallback and is not an offline-supported target in this draft. An older policy lacking
the hash fails closed; the browser check covers this condition. Full card-local
packaging/physical devices and production-host headers were not exercised.

## Verified evidence

Tests use disposable Playwright contexts, fake page/storage canaries and
intercepted synthetic URLs. No real user profile, secret, network endpoint or
hardware is accessed by probes.

- The reachable canvas regression first returned the page canary `173`; after
  migration it returns zero, keeps page Math unchanged, displays timeout errors
  for a loop and recovers after selecting a good pattern.
- The cross-engine isolation lane passed **30 tests** on desktop Chromium,
  Playwright WebKit and Pixel 5 Chromium emulation. Its WebKit offline test
  explicitly verifies the known unsupported rejection, not successful rendering.
- Browser tests cover computed-constructor global access, storage/DOM absence,
  worker/import API absence, fetch/WebSocket/dynamic-import attempts, timer
  responsiveness during loops, recovery, cancellation, input budgets, stale
  and oversized buffer replies, offline rendering and a rejecting old CSP.
- All **130 bundled patterns** match exact deterministic frame output through
  the isolated adapter with blend, gamma, hue/saturation/brightness and symmetry.
- Existing active-screen animation/color, compact artwork, phone toolbar and
  pattern-selection checks pass. Existing Flow and Pattern Lab callback smoke
  checks pass; their preserved callback execution is not an isolation claim.
- The full unit suite passed **3,027 tests**. The public production build passed.
  A local server of that built output, with its public CSP, rendered the actual
  Patterns screen with an isolated owner and no preview error. External font
  requests were fulfilled with empty synthetic CSS; no external network was
  used. The existing file-protocol fallback inline script is blocked by the
  public CSP, independently of this repair; the app itself renders normally.

Run from `lightweaver/`:

```sh
node --test src/lib/patternIsolationPolicy.test.js
npx playwright test --config tests/pattern-isolation-playwright.config.ts --workers=1
npm run test:unit
npm run build
```

The explicit older `tests/security/pattern-execution-boundary.mjs` probe suite
still tests unmigrated native compilers and remains red by design. It must not
be reported as a global security pass.

### Performance limits

Visible headless Chromium on this Mac, same synthetic Aurora source and geometry,
20 timed frames after bootstrap: 1,024 samples baseline p50/p95 ~1.4/2.5 ms,
isolated ~5.5/6.4 ms; 8,000 pixels baseline ~8.3/10.4 ms, isolated ~39.2/44.8 ms.
Ten RAF-paced isolated frames delivered ~124 and ~26 fps respectively on this
host's headless clock. This measures service throughput, not a promise of those
rates on the physical display; the component retains its existing caller-supplied target (the active Patterns
screen requests 30 fps).
No >50 ms page long tasks were observed during that small measurement. The
Chromium memory API reported quantized 10 MB values before/after; that cannot
establish peak worker memory or absence of leaks.

Playwright WebKit measurements were ~7/8 ms at 1,024 and ~42/44 ms at 8,000,
with ~65/~24 RAF-paced fps. WebKit does not expose the long-task/heap metrics
used here. Mobile Chromium uses device emulation, not physical mobile hardware.
The 8,000-pixel regression is material: this draft does not meet a universal
60-fps full-resolution acceptance bar. Reduce serialization and duplicate
geometry cost before treating it as release-ready. Long bakes and stateful Lab
rendering have not been migrated or benchmarked by this candidate.

## Actual remaining entry paths and next scope

| Surface | Source provenance / current behavior | Next compatible change |
| --- | --- | --- |
| Ordinary active `PatternPreview` without compiledFn/blendCompiledFn | Registry source, including custom/imported/accepted AI source; isolated in this candidate | Optimize full-resolution batching; expand stress/platform proof |
| `SceneExpressionEditor` mounted `PatternPreview` with `createSceneExpressionPreviewRenderer().compiledFn` | The bundled adapter resolves each segment's registry pattern, which may be custom/imported, then executes that source natively | Factor Flow coordinate/index/time remapping into a data-only sample transform; send resolved source strings and remapped sample arguments to this service; preserve existing compiledFn API for trusted callers |
| `PatternLabPreview` mounted `PatternPreview` with `workerColorLookup(frame)` | Bundled callback only looks up already returned RGB arrays; the callback itself executes no pattern source | Keep this trusted data lookup; separately audit/migrate upstream same-origin Lab execution if custom source support is added |
| `patternLabPatternAdapter`, layers / source looks / bake | Main base and layer generators require built-in registry identity; section-mix functions also compile IDs and need a source-provenance audit | Verify every section-mix branch is bundled-source-only, then isolate any custom-source branch; do not label every callback hostile or every Worker safe |
| Layout `useLayoutCanvasInteraction` | Mounted Layout uses registry source via synchronous per-strip/default render | Replace its useMemo render with a coalesced async owner retaining prior valid frames, then reuse existing strip/physical/mirror mapping |
| `sceneExpressionRecording` / Flow bake | Registry sources and optional native Flow callback; batching yields do not interrupt a stuck pixel | Apply the data-only Flow remapping above, then await isolated frame batches with abort/deadline ownership |
| AI draft validation/probes | Narrow separate validator plus native compile/probe/render | Preserve validation and move runtime probes and render through isolated sample/frame jobs; no validator weakening |
| Reachable `?v=3` legacy Studio | Separate native compiler/helpers/evaluator and mounted preview/export/AI paths | Build a dialect-specific isolated runtime preserving legacy helper/RGB semantics, then migrate preview/export owners |
| Mapper app editor/import/thumbnail/run | Separate native compiler/evaluator | Add mapper dialect runtime and async preview/frame owner; retain helper/evaluator differences |
| Mapper controller / deferred Pi compiler | Separate native functions outside active Studio path | Separate runtime audit; no server-execution claim made |

`LiveStrand`, `LivePreviewRow` and `LedStage` in `v3/lw-pattern.jsx` currently have
no mounted consumer in that file. The earlier audit named these definitions as
execution surfaces; they are not evidence of an active entry path. This
candidate leaves those unused helpers unchanged and tests/migrates the real
`PatternPreview` path instead.

Immediate continuation: Flow's data-only sample remapping plus Layout's async
frame owner are the next reachable custom-source paths. The same 8k throughput
limit applies, so optimize the protocol before widening full-resolution use.
Do not merge/deploy this draft as a completed security fix.
