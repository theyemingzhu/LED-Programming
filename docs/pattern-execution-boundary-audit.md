# Executable pattern boundary: unresolved security regressions

Measured on `d43e7248c912caf33ae233b7f5ca138581046618` (2026-11-05).
This packet changes no product behavior. The architecture/trust decision is
pending; this is not an isolation fix and must not be described as one.

## Reproduce safely

From the repository root:

```sh
node lightweaver/tests/security/pattern-execution-boundary.mjs
node lightweaver/tests/security/pattern-execution-boundary.mjs --characterize
```

The first command asserts containment and currently exits **1: 21 failed, 7
passed**. The second verifies the known unsafe observations and harness controls;
it exits **0: 28 passed**. Characterization passing does not mean security passes.
These explicit unresolved regressions are outside the ordinary unit test glob.

Each probe runs in its own disposable Node child with an empty environment,
64 MB V8 heap limit, fixed synthetic inputs and a 1.2-second external kill limit.
Timeouts must first report that execution entered the pattern evaluator. No
probe makes network requests, uses browser profiles, reads user data files or reads
real storage. Storage is a tiny in-memory stub with the value `173`; the only
realm mutation is a marker on that child's `Math` object. The child process is a
test containment measure, not a proposed browser sandbox. Do not run these
payloads in an owner's real browser or card.

## Measured boundary

`lightweaver/src/lib/patterns.js` shadows named globals and rejects literal
tokens, then creates a non-strict native function and invokes it in the same
realm. Shadowing identifiers does not remove the receiver, ambient globals,
mutable intrinsics, computed properties, or the ability to run indefinitely.
Its comments claiming the page environment is unreachable are false.

The same fixed probes cover the active Studio compiler, mapper compiler,
Studio's real saved-pattern registry lookup, and the reachable legacy compiler.

| Probe | Studio | Mapper | Saved Studio pattern | Legacy Studio |
| --- | --- | --- | --- | --- |
| Ordinary RGB math | correct | correct | correct | correct |
| Named `fetch` unavailable | yes | yes | yes | **no** |
| `this` reads realm canary | **yes** | **yes** | **yes** | **yes** |
| Computed function-constructor reads canary | **yes** | **yes** | **yes** | **yes** |
| `this.localStorage` reads synthetic storage | **yes** | **yes** | **yes** | **yes** |
| Pattern mutates caller `Math` | **yes** | **yes** | **yes** | **yes** |
| Infinite loop stops without external harness kill | **no** | **no** | **no** | **no** |

An exception handler only handles thrown errors; a main-thread timeout callback
cannot interrupt synchronous JavaScript. Strict mode would close the receiver
case but not computed function-constructor access or resource exhaustion.
Additional denylist regexes cannot establish a capability boundary.

## Trust and caller map

The following are source-derived paths. The registry path above is also executed
with synthetic stored code; browser exploitability beyond it was not tested.

| Entry/data flow | Execution surface |
| --- | --- |
| `customPatterns.js` reads committed workspace snapshots or `lw_custom_patterns`; `patternRegistry.js` combines these with built-ins; `frameEngine.js:compilePattern` compiles the stored `code` string | Shared active Studio compilation path; no trust distinction at execution |
| `workspaceAssets.js` accepts custom asset/revision code as strings; `customPatterns.js` save/update also preserve executable source | Persistence/import paths do not universally invoke the AI draft validator |
| `v3/PatternPreview.jsx` | Active, blend and per-strip compilation; synchronous frame rendering in the page |
| `v3/lw-pattern.jsx` (`LiveStrand` and pattern preview), `components/layout/hooks/useLayoutCanvasInteraction.js` | Synchronous color/motion and Layout rendering in the page |
| `lib/sceneExpressionFlow.js`, `lib/sceneExpressionRecording.js` | Compiles referenced patterns for Flow previews/recording; yielding between frame batches does not interrupt a stuck pixel |
| `lib/patternLabPatternAdapter.js`, `lib/lwseqBake.js` | Adapter renders supported built-in recipes synchronously and currently rejects custom registry sources. Baking normally selects a worker when available and there are no audio lanes; fallback remains synchronous |
| `lib/aiPatternDraft.js` | Separate restrictive draft validation precedes its compile/probe/render path. This is a narrower entry contract, not a universal compiler boundary |
| `pattern-lab/patternLab.worker.js`, its preview owner and `lwseqBake.js` | Worker limits page-thread hangs and the owner can terminate it. It still uses same-origin capabilities; it is not a security sandbox. Worker registries cannot read page localStorage, so worker preview availability also differs from page rendering |
| `src/main.jsx` lazy-loads `src-v3/App.jsx` at `?v=3` / `#v3` | Legacy route is reachable, not dead code. Its separate unrestricted compiler feeds legacy `Preview`, `LayoutScreen`, `PatternModes`, `ExportDialog` and AI draft rendering |
| `led-art-mapper/app/src/main.js` | Editor debounce, previews/thumbnails, runs and imported pattern/project code use its separate compiler/evaluator. Imported code can execute when previewed; there is no safe-file boundary |

Other native-function compilers remain in `led-art-mapper/controller` and the
deferred `led-art-mapper/pi-server`; they are not current Studio execution paths
and were not dynamically probed here. No server-side arbitrary code execution
or credential access was tested or asserted.

The public Studio CSP permits `unsafe-eval`, same-origin requests and HTTP/WS
controller connectivity. That is consistent with the implementation and does
not establish isolation. There is no claim here that every possible exfiltration
channel works: the tests deliberately perform no exfiltration or card commands.

## Smallest viable choices (pending owner decision)

### Proper isolation while preserving visible pattern behavior

Introduce one frame-level async execution service, leaving geometry, palettes,
pixel ordering and native-card contracts in the parent. Run user source only in
a disposable worker bootstrapped inside an opaque-origin sandboxed iframe. The
frame has `allow-scripts` without `allow-same-origin`; its own restrictive CSP
must deny network, frames, images, forms and all resource loads except the fixed
bootstrap and its worker. Execute source only in the worker, which has no DOM
navigation surface. Transfer only explicitly cloned geometry, numeric controls,
palettes and source; never pass page objects, callbacks, credentials or storage.
The parent validates job/generation, exact frame dimensions, finite RGB bytes,
reply size and deadlines, and terminates/replaces stalled sessions. Treat all
worker messages as untrusted, including spoofed success/error replies.

This is a design candidate, not a proven sandbox: opaque-origin worker creation,
CSP inheritance, offline behavior and every capability above need browser proof
before acceptance. Reuse Pattern Lab's existing request IDs, generation checks,
allocation budgets and deadline policy where compatible. A plain same-origin
worker only solves page responsiveness and is insufficient for data isolation.
Browser-native workers also provide no strict per-pattern heap limit: checking
frame allocation cannot constrain arbitrary allocations inside authored code.
If strict memory containment is required, use the interpreter/VM alternative
with enforceable limits rather than claiming worker termination guarantees it.

Migrate every executable-source caller in the map, including recording,
thumbnails, fallbacks and the legacy route. Keep trusted built-in fast paths
only when trust comes from bundled source identity, never a user-controlled ID.
Supply custom sources explicitly to the isolated registry instead of relying on
worker localStorage. Keep metadata parsing nonexecuting.

**Real compatibility blocker:** today's public internal contract returns a
native synchronous `fn` consumed by the per-pixel frame engine. It cannot be
made into an interruptible separate-realm callable without changing that
contract. Async frame delivery is consequential work across the caller map.
No such migration is authorized by this audit packet alone.

An alternative is a browser-compatible interpreter/embedded JS VM with isolated
intrinsics, no host capability bridges, memory limits and an instruction budget.
It can retain a synchronous wrapper and stop loops, but introduces a substantial
runtime/dependency and must prove syntax compatibility and per-pixel throughput.
There is no such interpreter in the current execution architecture; selecting
and adding one requires the same pending architecture decision.

### Temporary explicit trust gate

Keep native execution labeled as trusted JavaScript only. Require an explicit,
source-digest-bound trust decision before any custom source is rendered; import,
reload, thumbnails, history and legacy routes must not execute implicitly.
Changed source invalidates consent. Explain page-data access and hang risk.
This is a product/trust behavior change, does not isolate execution and does not
make hostile code safe. It is an alternative only after owner authorization.

## Acceptance for an isolation implementation

- All red regressions become containment passes. Extend them through the actual
  browser execution service: canaries in page storage/cookies/globals remain
  unreadable, parent intrinsics unchanged, no fetch/socket/beacon/import/worker
  escape, and no DOM/navigation channel. Use synthetic canaries and intercepted
  requests only; never real credentials or hardware.
- A looping pattern leaves Studio controls responsive, hits the agreed visible-
  time deadline, and can be replaced by a good pattern without page reload.
  Bound memory allocation and oversized/spoofed/reordered protocol replies too.
- Compare deterministic RGB frames against current fixtures for every built-in,
  known supported custom syntax, RGB arrays/objects, helpers, parameter defaults,
  per-strip/global indexes, reflection/kaleidoscope inputs, color modifiers,
  blending, Flow, recording, and physical pixel order. Explicitly resolve legacy
  helper/evaluator differences; do not silently broaden its API.
- Measure baseline and candidate on the same device, visible tab, 1,024 preview
  samples and 8,000 output pixels, including two-layer/stateful Lab and a long
  bake. Record p50/p95 frame cost, main-thread long tasks, memory and effective
  FPS. Keep the current preview FPS and no new >50 ms page tasks; propose a
  concrete regression budget before changing rendering policy. No performance
  result has been measured by this audit.
- Verify desktop Chromium plus actual mobile Safari/Chrome behavior, offline
  Studio and the retained legacy route. Do not fall back to page execution when
  isolation is unavailable. Protocol/card transport formats remain unchanged.

No mapper consolidation was made: copying the active compiler would retain the
same proven escapes while changing helper/evaluator/error-reporting behavior.
It would not be a robust security repair.
