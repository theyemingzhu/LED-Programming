# Lightweaver Prove session — 2026-09-23 USB Wi-Fi CI-ready candidate

## Run status

- Outcome: `INCOMPLETE`
- Authorized by: confirmed after the at-least-20-minute duration warning
- Started at (UTC): 2026-09-23 07:23
- Closed at (UTC): 2026-09-23 07:25
- Expected duration stated: at least 20 minutes, longer if hardware observation is required
- Development freeze active: yes until 07:25; a confirmed Card Home navigation defect needs a new source revision

## Frozen target

- Source revision: `a507b905b3559e1abeadf9103ace5fe189310ac3` on `codex/usb-wifi-setup`; includes `origin/main` `a6ab5fe2ca09be0614be9903748f1b79a50339b3`
- Studio build: 2061 (`git rev-list --count HEAD`)
- Firmware target: source `VERSION` 1.1.40, unsigned. Production still serves signed firmware build 1939, version 1.1.39, source `92bfd6ab1e287b2bd818c5ce79062dc4f12f2a2b`.
- Production URL: `https://led.mandalacodes.com` (canonical origin only)
- Deployment/workflow run: manual candidate [Tests run 35831531496](https://github.com/theyemingzhu/LED-Programming/actions/runs/35831531496) on this exact SHA was started; any result is diagnostic after this source became superseded. [Draft PR #315](https://github.com/theyemingzhu/LED-Programming/pull/315) is the review path.
- Card target(s): no authorized blank/spare card. Configured historical card `lw-b0fe81f61b44` is visible at `/dev/cu.usbmodem14301`; no port opening, erase, flash, or physical observation in this run.

## Automated gates

| Gate | Command or method | Target | Started (UTC) | Result | Evidence / notes |
| --- | --- | --- | --- | --- | --- |
| Release gate | `node scripts/lightweaver-dev.mjs release` | `a507b905`, build 2061 | 07:24 | `BLOCKED` | Interrupted at 07:25 before source edits for a confirmed Card Home navigation defect. Exit 130; `/tmp/lw-usb-wifi-prove-ci-ready-gate.log`. Invokes launch gate. |
| Launch gate | `npm run launch:check` via release alias | `a507b905`, build 2061 | 07:24 | `BLOCKED` | Source core passed; project units were still running when interrupted. Browser, build, and freshness checks did not run. |
| Browser and persistence | complete launch Playwright lanes | `a507b905`, build 2061 | — | `NOT RUN` | Earlier focused UI tests passed but final integrated browser suite was not reached. |
| Connection and save/load | complete launch project/connection lanes | `a507b905`, build 2061 | 07:25 | `BLOCKED` | Project unit suite was interrupted after the logged account/migration cases; complete result unavailable. |
| Firmware and contracts | USB dispatcher, ESP32 PlatformIO compile, native suite, CI firmware lane | `a507b905`, build 2061 | 07:24 | `BLOCKED` | Corrected retry regression and version policy passed before freeze; source core contracts passed in this partial gate. Final integrated compile pending. |

## Live proof

| Proof | URL or method | Expected identity | Observed identity | Time (UTC) | Result | Evidence / notes |
| --- | --- | --- | --- | --- | --- | --- |
| Production deployment | protected workflow | integrated candidate and signed successor | none yet | — | `NOT RUN` | Shipping task owns publication. |
| No-store release marker | `/studio-release.json` | final integrated release | previous Studio build 2048, `f039ff8e` | 2026-09-23 07:00 | `BLOCKED` | Cache-bypassed HTTP 200/no-store baseline in `/tmp/lw-usb-wifi-live-marker.{headers,json}`; not candidate proof. |
| Deployed build graph | staged/live SHA-256 comparison | final integrated release | none yet | — | `NOT RUN` | Requires exact signed/deployed revision. |
| Critical live paths | canonical production browser/card | final integrated release | none yet | — | `NOT RUN` | No candidate deployment or authorized blank card. |

## Hardware matrix

| Card / boot ID | Build / project fingerprint | GPIO / pixels / chipset / order | Power and wiring | Machine evidence | Human observation | Result |
| --- | --- | --- | --- | --- | --- | --- |
| Configured `lw-b0fe81f61b44`; boot ID unobserved | historical card state unknown; candidate unsigned | fixture target GPIO 18 / 44 / WS2815 / GRB; actual state unobserved | USB presence only; wiring/power unobserved | no card command sent | none | `BLOCKED` — no authorized blank/spare card or owner light observation |

## Waivers

| Check waived | Accepted by | Time (UTC) | Reason | Confidence removed |
| --- | --- | --- | --- | --- |
| None | — | — | — | — |

## Unresolved risks

| Risk | Evidence gap or failure | Practical consequence | Owner |
| --- | --- | --- | --- |
| Signed/live identity | new firmware and Studio not yet deployed | candidate cannot be reported as shipped | Shipping task |
| Physical installation | no authorized blank card or human output observation | fresh-install and appearance remain physically unproven | Card owner |
| Wiring input entry point | Card Home **Change wiring** opens legacy `#screen=layout&mode=wire`, which canonicalizes to Card install instead of the GPIO/order editor in Specs Layout | A client following the visible action cannot reach the required wiring input | Studio implementation |

The local gate stopped before source edits and port 9253 is clear. The exact-SHA Tests run may finish for diagnostics, but cannot prove a corrected revision.

## Single next step

`Correct the Card Home wiring entry point, confirm all related input/navigation paths, then freeze a new revision and rerun complete gates.`
