# Lightweaver Prove session — 2026-09-23 USB Wi-Fi and wiring-ready candidate

## Run status

- Outcome: `INCOMPLETE` — final release UI exposed a desktop/mobile React console warning; source correction required before a new frozen candidate
- Authorized by: confirmed after the at-least-20-minute duration warning
- Started at (UTC): 2026-09-23 07:34
- Closed at (UTC): 2026-09-23 08:05
- Expected duration stated: at least 20 minutes, longer if hardware observation is required
- Development freeze active: ended after the failed release UI check; this source revision is superseded for release evidence. Evidence-only records remain uncommitted while the product branch is repaired.

## Frozen target

- Source revision: `951fe3511efa478ef9f517815e9ae76769d31556` on pushed `codex/usb-wifi-setup`; includes `origin/main` `a6ab5fe2ca09be0614be9903748f1b79a50339b3`
- Studio build: 2062 (`git rev-list --count HEAD`)
- Firmware target: source `VERSION` 1.1.40, unsigned. Production still serves signed firmware build 1939, version 1.1.39, source `92bfd6ab1e287b2bd818c5ce79062dc4f12f2a2b`.
- Production URL: `https://led.mandalacodes.com` (canonical origin only)
- Deployment/workflow run: [candidate Tests run 35832378077](https://github.com/theyemingzhu/LED-Programming/actions/runs/35832378077) dispatched for this branch SHA; [draft PR #315](https://github.com/theyemingzhu/LED-Programming/pull/315) is the review path. Separate shipping task owns merge, signer, deploy, and live proof.
- Card target(s): no authorized blank/spare card. Configured historical card `lw-b0fe81f61b44` is listed at `/dev/cu.usbmodem14301`; no port opening, erase, flash, or physical observation in this run.

## Automated gates

| Gate | Command or method | Target | Started (UTC) | Result | Evidence / notes |
| --- | --- | --- | --- | --- | --- |
| Release gate first attempt | `node scripts/lightweaver-dev.mjs release` | `951fe351`, build 2062 | 07:34 | `FAILED — LOCAL DEPENDENCY` | Source/core and 149/149 Studio units passed; cloud project browser 73/73 passed. Mapper then failed because pinned `playwright` was absent from this checkout's mapper `node_modules` (`ERR_MODULE_NOT_FOUND`), not because of source behavior. Full log: `/tmp/lw-usb-wifi-prove-951fe351-gate.log`. |
| Mapper retry | `npm ci --prefix led-art-mapper/app` then `npm run test:mapper` | `951fe351`, build 2062 | 07:39 | `PASS` | Installed pinned mapper deps without tracked changes; mapper 27/27 passed and built. Logs: `/tmp/lw-usb-wifi-mapper-npm-ci.log`, `/tmp/lw-usb-wifi-prove-mapper-retry.log`. |
| Launch gate continuation | remaining `launch:source` commands after mapper, then `npm run firmware:check-bin` | `951fe351`, build 2062 | 07:40 | `FAILED — SOURCE UI WARNING` | Executes original package-script commands in order without repeating already-passed source/cloud lanes. Policy, build graph, browser regression, production 68/68, and units 2656/2656 passed. Release UI failed 2 cases; build/stage/verify/freshness were not reached. Log and machine summary: `/tmp/lw-usb-wifi-prove-951fe351-resume.{log,json}`. |
| Browser and persistence | complete launch Playwright lanes | `951fe351`, build 2062 | 07:40 | `FAILED 2/384` | 382 release UI cases passed. Desktop and mobile main-screens smoke cases caught React warning: unsupported `defaultOpen` prop on DOM `<details>` in WirePlanTools after opening Wire. No overflow issue was reported. Focused USB, card handoff, and wiring entrypoint checks had passed before freeze. |
| Connection and save/load | complete launch project/connection lanes | `951fe351`, build 2062 | 07:34 | `PASS` | Cloud project library browser 73/73 passed in first gate; mapper 27/27 passed after dependency repair; relevant integrated release UI cases passed. |
| Firmware and contracts | USB dispatcher, ESP32 PlatformIO compile, native suite, exact-source CI firmware lane | `951fe351`, build 2062 | 07:34 | `SOURCE PASS; ARTIFACT PENDING` | USB retry dispatcher test and version policy passed; exact-source CI firmware lane green in successful run 35832378077. Local PlatformIO compile/native had passed before final source change; exact-source CI lane is the final firmware compile evidence. Signed published binary still targets 1.1.39/build 1939. |
| Exact-source CI | `Tests` workflow `workflow_dispatch` on `codex/usb-wifi-setup` | `951fe351`, build 2062 | 07:34 | `PASS` | [Run 35832378077](https://github.com/theyemingzhu/LED-Programming/actions/runs/35832378077): classify/source/cloud/production/firmware/browser smoke all green; artifact job intentionally skipped before protected signing. |

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
| Desktop/mobile console warning | release UI 2/384 main-screens tests fail on unsupported `defaultOpen` DOM prop | source must be corrected and candidate refrozen before release gate | Studio owner |

## Single next step

`Correct the Wire disclosure React prop, run the two focused failed cases, then freeze a new source revision for the final release gate.`
