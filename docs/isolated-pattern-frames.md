# Isolated pattern frames: combined source candidate

This candidate combines the ordinary Patterns preview, modern Layout, and reachable
`?v=3` legacy Layout/preview isolation repairs. Flow preview and recording require
actual bundled source before their trusted native adapter runs. It includes the
packed frame protocol and recovery fixes. No firmware, signer, release, transport,
deployment or card flash is included. Mapper remains a separate source candidate.

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
The current source protocol limits 64 sources,
65,536 JavaScript string code units each, 32,000 samples,
8 million serialized JSON code units and 96,000 output bytes.

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

### Performance evidence and limits

The packed protocol deduplicates source strings and uses typed sample buffers.
The public `service.render({sources, samples})` interface is unchanged. A pinned
same-page Chromium comparison at 8,000 samples improved p50/p95 from 34.9/39.4 ms
to 11.7/14.9 ms; headless RAF throughput improved from 28 to 81.7 fps. These are
synthetic service measurements, not physical display or Safari guarantees.
Strict heap containment, physical/offline WebKit and card-local packaging remain
open. The original browser compatibility and resource limits above still apply.

## Current mounted paths and remaining scope

| Surface | Source authority and current behavior |
| --- | --- |
| Ordinary Patterns preview | Custom/imported/accepted registry source runs in the isolated service; changed source clears a stopped owner while unchanged hostile source stays stopped. |
| Modern Layout | Data-only frame mapping feeds a coalesced async isolated owner; stale/cancelled replies cannot replace the last valid frame. Source/import events recover the owner. |
| Flow preview and recording | Native bundled adapter rejects IDs without actual bundled source. Static card metadata alone is insufficient: `warm-white` previously reached saved custom source. The guard covers actual Flow and recording preparation; explicit trusted dependency injection remains. |
| Pattern Lab preview/bake/layers | Mounted prepare paths validate actual bundled source, including section mix; worker cannot read saved registry storage. Existing callback reads RGB only. No isolation migration or custom-source support is claimed. |
| Reachable `?v=3` legacy Layout/preview | Fixed legacy dialect uses the same isolated service, retaining legacy helper and argument semantics. Actual imported and saved custom-source regressions are covered. |
| Standalone mapper | Separate PR399; not included in this combined candidate. |
| Unmounted AI/export/compatibility helpers | Not evidence of a currently mounted execution path. Native APIs remain for trusted/dead compatibility; a future mount needs a fresh provenance check. |
| Pi/operator runtime | Explicitly deferred by project instructions; not part of this work. |

Combined unit verification passed **3,044 tests** and the public production build.
Combined browser results are recorded with the integration receipt rather than
inferred from the individual PRs. Earlier 3,027-unit and first-pass performance
figures above describe the original PR392 checkpoint only. Source proof does not
establish production headers, installed bytes, physical hardware acceptance or
complete executable-pattern security closure.
