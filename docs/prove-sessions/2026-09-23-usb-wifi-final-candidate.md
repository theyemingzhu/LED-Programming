# Lightweaver Prove session — 2026-09-23 USB Wi-Fi final candidate

## Run status

- Outcome: `INCOMPLETE`
- Authorized by: confirmed after the at-least-20-minute duration warning
- Started at (UTC): 2026-09-23 07:16
- Closed at (UTC): 2026-09-23 07:22
- Expected duration stated: at least 20 minutes, longer if hardware observation is required
- Development freeze active: yes until 07:22; a required CI policy assertion correction now creates a new revision

## Frozen target

- Source revision: `9e248e2339cda63cd720014a5d6e5e85d415c3c9` on `codex/usb-wifi-setup`, merged with `origin/main` `a6ab5fe2ca09be0614be9903748f1b79a50339b3`
- Studio build: 2060 (`git rev-list --count HEAD`)
- Firmware target: source `VERSION` 1.1.40, unsigned. Currently published signed firmware: build 1939, version 1.1.39, source `92bfd6ab1e287b2bd818c5ce79062dc4f12f2a2b`.
- Production URL: `https://led.mandalacodes.com` (canonical origin only)
- Deployment/workflow run: manual candidate [Tests run 35830933011](https://github.com/theyemingzhu/LED-Programming/actions/runs/35830933011) on exact SHA failed its firmware job and was cancelled before other lanes completed; draft PR #315 is the review path
- Card target(s): no authorized blank/spare card. Configured historical card `lw-b0fe81f61b44` is listed at `/dev/cu.usbmodem14301` but is not an erase/flash target in this run.

## Automated gates

| Gate | Command or method | Target | Started (UTC) | Result | Evidence / notes |
| --- | --- | --- | --- | --- | --- |
| Release gate | `node scripts/lightweaver-dev.mjs release` | `9e248e23`, build 2060 | 07:16 | `BLOCKED` | Interrupted at 07:19 after the exact-SHA CI firmware job failed a stale policy assertion. Exit 130; `/tmp/lw-usb-wifi-prove-final-gate.log`. Invokes launch gate. |
| Launch gate | `npm run launch:check` via release alias | `9e248e23`, build 2060 | 07:16 | `BLOCKED` | Source core and project units passed; cloud project browser had 10/73 passing when interrupted. Remaining suites and expected public factory freshness check did not run. |
| Browser and persistence | complete launch browser lanes | `9e248e23`, build 2060 | 07:18 | `BLOCKED` | First 10 cloud project cases passed. Complete final browser/persistence suite not obtained. |
| Connection and save/load | complete launch connection/project lanes | `9e248e23`, build 2060 | 07:18 | `BLOCKED` | Project units passed 149/149; first 10 browser cases included Load and safe Save behavior. Full suite unproved. |
| Firmware and contracts | PlatformIO and launch contracts | `9e248e23`, build 2060 | 07:16 | `BLOCKED` | Focused USB dispatcher retry regression passed; final CI firmware job failed `scripts/production-job-consistency.test.mjs` case 14 before compile because it required the core smoke command at position zero, while the USB smoke spec now runs first. CI log: `/tmp/lw-usb-wifi-ci-firmware-fail.log`. |

## Live proof

| Proof | URL or method | Expected identity | Observed identity | Time (UTC) | Result | Evidence / notes |
| --- | --- | --- | --- | --- | --- | --- |
| Production deployment | protected deploy workflow | candidate/signed successor | none yet | — | `NOT RUN` | Shipping task owns deployment. |
| No-store release marker | `/studio-release.json` | final integrated release | previous Studio build 2048, `f039ff8e` | 2026-09-23 07:00 | `BLOCKED` | Cache-bypassed HTTP 200/no-store baseline in `/tmp/lw-usb-wifi-live-marker.{headers,json}`; not candidate proof. |
| Deployed build graph | staged/live SHA-256 comparison | final integrated release | none yet | — | `NOT RUN` | Requires signed/deployed exact revision. |
| Critical live paths | production browser/card | final integrated release | none yet | — | `NOT RUN` | No candidate deployment or authorized blank card. |

## Hardware matrix

| Card / boot ID | Build / project fingerprint | GPIO / pixels / chipset / order | Power and wiring | Machine evidence | Human observation | Result |
| --- | --- | --- | --- | --- | --- | --- |
| Configured `lw-b0fe81f61b44`; boot ID unobserved | historical card state unknown; candidate firmware unsigned | fixture target GPIO 18 / 44 / WS2815 / GRB; actual state unobserved | USB presence only; wiring/power unobserved | no card command sent | none | `BLOCKED` — no authorized blank/spare card or owner light observation |

## Waivers

| Check waived | Accepted by | Time (UTC) | Reason | Confidence removed |
| --- | --- | --- | --- | --- |
| None | — | — | — | — |

## Unresolved risks

| Risk | Evidence gap or failure | Practical consequence | Owner |
| --- | --- | --- | --- |
| Signed/live identity | new firmware and Studio not yet deployed | candidate cannot be reported as shipped | Shipping task |
| Physical installation | no authorized blank card or human output observation | fresh-install and appearance remain physically unproven | Card owner |
| CI policy assertion | firmware lane case 14 pinned the start of `ci:browser-smoke` to an older command order | exact-revision Tests cannot pass until the assertion accepts USB-first smoke while requiring both USB and core checks | Release preparation |

The exact-SHA Tests run failed its firmware lane and was cancelled before other lanes completed. The local gate was stopped before the test change, and its Vite server on port 9253 was stopped. Neither run is final release proof. A narrow preflight after the correction passed 61/61 CI policy and release tests, plus firmware version and USB dispatcher tests; those results belong to the forthcoming revision.

## Single next step

`Commit the narrow smoke-policy assertion correction, freeze its new revision, then rerun the complete gate and exact-revision Tests workflow.`
