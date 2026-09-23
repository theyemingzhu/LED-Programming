# Lightweaver Prove session — 2026-09-23 integrated USB Wi-Fi candidate

## Run status

- Outcome: `INCOMPLETE`
- Authorized by: confirmed after the at-least-20-minute duration warning
- Started at (UTC): 2026-09-23 07:09
- Closed at (UTC): 2026-09-23 07:14
- Expected duration stated: at least 20 minutes, longer if hardware observation is required
- Development freeze active: yes until 07:14; a newly confirmed firmware source defect requires correction on a new revision

## Frozen target

- Source revision: `b7f255eb5daecb99cf42c9cd5414441d238a836d` on `codex/usb-wifi-setup`, including current `origin/main` `a6ab5fe2ca09be0614be9903748f1b79a50339b3`
- Studio build: 2059 (`git rev-list --count HEAD`)
- Firmware target: source `VERSION` 1.1.40 on this revision; no signed build of it exists yet. Currently published firmware remains build 1939, version 1.1.39, source `92bfd6ab1e287b2bd818c5ce79062dc4f12f2a2b`.
- Production URL: `https://led.mandalacodes.com` (canonical origin only)
- Deployment/workflow run: manual Tests run [35830546369](https://github.com/theyemingzhu/LED-Programming/actions/runs/35830546369) on exact SHA was cancelled when this source was superseded; draft PR #315 is the review path
- Card target(s): no authorized blank/spare card. Configured historical card `lw-b0fe81f61b44` is visible as `/dev/cu.usbmodem14301`; no port access, erase, flash, or physical observation is authorized for this audit.

## Automated gates

| Gate | Command or method | Target | Started (UTC) | Result | Evidence / notes |
| --- | --- | --- | --- | --- | --- |
| Release gate | `node scripts/lightweaver-dev.mjs release` | `b7f255eb`, build 2059 | 07:09 | `BLOCKED` | Interrupted at 07:14 before completion when firmware defect required a source change. Exit 130; `/tmp/lw-usb-wifi-prove-full-gate.log`. This invokes `npm run launch:check`. |
| Launch gate | `npm run launch:check` via release alias | `b7f255eb`, build 2059 | 07:09 | `BLOCKED` | Source core and project unit gates passed. Cloud project browser had 63/73 passing when interrupted; later browser/build and expected factory freshness checks never ran. The partial run is not a pass. |
| Browser and persistence | Release/launch browser lanes; focused Studio checks | `b7f255eb`, build 2059 | 07:09 | `BLOCKED` | Focused pre-merge Studio 71/71 units, USB 11/11 browser plus timeout 1/1; post-merge card form/handoff 2/2. Full cloud browser was interrupted at 63/73; remaining suites unrun. |
| Connection and save/load | Release/launch connection and project lanes | `b7f255eb`, build 2059 | 07:09 | `BLOCKED` | Project unit suite passed 149/149 and first 63 cloud browser cases passed, including save/replay/conflict cases. Complete integrated suite remains unproved. |
| Firmware and contracts | `pio run -e esp32-s3-n16r8`, `pio test -e native`, USB dispatcher, launch source contracts | `b7f255eb` source | 07:09 | `BLOCKED` | Pre-merge compile and 18/18 native tests passed; source core passed in partial gate. Late association after a USB join timeout can leave `usbWifiJoinFailed` stale despite a successful retry; source correction required. |

## Live proof

| Proof | URL or method | Expected identity | Observed identity | Time (UTC) | Result | Evidence / notes |
| --- | --- | --- | --- | --- | --- | --- |
| Production deployment | protected deploy workflow | integrated candidate/signed successor | none | — | `NOT RUN` | Shipping task owns merge, signer and deployment. |
| No-store release marker | `/studio-release.json` | candidate build 2059 | previous Studio build 2048, `f039ff8e` | 2026-09-23 07:00 | `BLOCKED` | HTTP 200/no-store baseline, not candidate. `/tmp/lw-usb-wifi-live-marker.{headers,json}`. |
| Deployed build graph | staged/live digest comparison | candidate | not available | — | `NOT RUN` | Requires deployment of exact final revision. |
| Critical live paths | canonical production browser/card | candidate | not available | — | `NOT RUN` | No candidate deployment or authorized blank card. |

## Hardware matrix

| Card / boot ID | Build / project fingerprint | GPIO / pixels / chipset / order | Power and wiring | Machine evidence | Human observation | Result |
| --- | --- | --- | --- | --- | --- | --- |
| Configured `lw-b0fe81f61b44`; boot ID unobserved | historical card state unknown; new firmware unsigned | fixture target GPIO 18 / 44 / WS2815 / GRB; actual state unobserved | USB device listed; wiring/power unobserved | no card command sent | none | `BLOCKED` — no authorized blank/spare card or owner light observation |

## Waivers

| Check waived | Accepted by | Time (UTC) | Reason | Confidence removed |
| --- | --- | --- | --- | --- |
| None | — | — | — | — |

## Unresolved risks

| Risk | Evidence gap or failure | Practical consequence | Owner |
| --- | --- | --- | --- |
| Signed/live identity | New firmware and Studio are not yet deployed | Candidate cannot be called deployed or shipped | Separate shipping task |
| Physical setup | No authorized blank card or human light observation | Fresh-install experience and output are not physically proven | Card owner |
| Timed-out USB join recovery | A late station association after an automatic retry leaves `usbWifiJoinFailed` set | Studio may reject a valid joined card as failed even when IP/handoff status is ready | Firmware implementation |

The GitHub Tests run above was started against exactly `b7f255eb` and cancelled before completion. The local gate was stopped before source edits, and its Vite server on port 9253 was stopped. No result from either run applies to the forthcoming corrected revision.

## Single next step

`Clear stale USB join-failure state on successful retry association, commit a new frozen source revision, then run a fresh complete gate and Tests workflow.`
