# Lightweaver Prove session — 2026-09-23 USB Wi-Fi release candidate

## Run status

- Outcome: `INCOMPLETE`
- Authorized by: confirmed after the at-least-20-minute duration warning
- Started at (UTC): 2026-09-23 06:54
- Closed at (UTC): 2026-09-23 06:55
- Expected duration stated: at least 20 minutes, longer if hardware observation is required
- Development freeze active: yes, for `d6e79db7ccc55fa7dc99f06c8cd7b6f16e014e2a` until this run closed; release preparation now proceeds on a new source revision

## Frozen target

- Source revision: `d6e79db7ccc55fa7dc99f06c8cd7b6f16e014e2a` on `codex/usb-wifi-setup` (clean at entry)
- Studio build: 2052 (`git rev-list --count HEAD`)
- Firmware build: published signed artifact remains 1939, firmware `1.1.39`, source `92bfd6ab1e287b2bd818c5ce79062dc4f12f2a2b`; this is not a build of the frozen Studio source
- Production URL: `https://led.mandalacodes.com`
- Deployment/workflow run: none for this candidate; draft PR #315 had no checks reported at entry
- Card target(s): no authorized blank card. Later USB inventory identified a configured historical card at `/dev/cu.usbmodem14301`, USB MAC `44:1B:F6:81:FE:B0`, card ID `lw-b0fe81f61b44`; this is not an authorized erase/flash target.

## Automated gates

| Gate | Command or method | Target | Started (UTC) | Result | Evidence / notes |
| --- | --- | --- | --- | --- | --- |
| Release gate | `node scripts/lightweaver-dev.mjs release` | frozen source | — | `NOT RUN` | Paused before start when required source correction was identified. Prior checkpoint logs in `/tmp/lw-usb-wifi-*.log` are earlier Sprint evidence, not Prove results. |
| Launch gate | `npm run launch:check` | frozen source | — | `NOT RUN` | Paused before start. No pass is claimed. |
| Browser and persistence | Release/launch Playwright lanes | frozen source | — | `NOT RUN` | Studio audit found a required reconnect correction; new revision must be tested. |
| Connection and save/load | Release/launch Playwright and contract lanes | frozen source | — | `NOT RUN` | When USB Wi-Fi provisioning succeeds but the response/status is lost or the page reloads, the in-memory attempt ID is lost; a reconnect offers a fresh provision, while the joined card rejects it as `fresh_install_only`. |
| Firmware and contracts | Release/launch firmware lanes | frozen source | — | `NOT RUN` | `VERSION` still reads `1.1.39`, equal to the signed public manifest. Firmware-sensitive CI and protected signing require a new version. |

## Live proof

| Proof | URL or method | Expected identity | Observed identity | Time (UTC) | Result | Evidence / notes |
| --- | --- | --- | --- | --- | --- | --- |
| Production deployment | GitHub workflow | frozen source/build 2052 | no candidate deployment | 2026-09-23 06:55 | `NOT RUN` | PR has not merged; this run did not authorize publication. |
| No-store release marker | `/studio-release.json` | frozen source/build 2052 | not fetched | — | `NOT RUN` | Live production cannot prove an undeployed candidate. |
| Deployed build graph | strict staged/live digest comparison | frozen source | not checked | — | `NOT RUN` | Requires exact integrated and deployed revision. |
| Critical live paths | production browser/card | frozen source | not checked | — | `NOT RUN` | No deployed candidate or physical card. |

## Hardware matrix

| Card / boot ID | Build / project fingerprint | GPIO / pixels / chipset / order | Power and wiring | Machine evidence | Human observation | Result |
| --- | --- | --- | --- | --- | --- | --- |
| Configured `lw-b0fe81f61b44`; boot ID unobserved | candidate firmware not signed; project fingerprint unobserved | bench fixture target: GPIO 18 / 44 / WS2815 / GRB; actual connection unobserved | USB serial device present; wiring/power unobserved | USB inventory only; no port opened or card commands sent | none | `BLOCKED` — no authorized spare/blank card and no human light observation |

## Waivers

| Check waived | Accepted by | Time (UTC) | Reason | Confidence removed |
| --- | --- | --- | --- | --- |
| None | — | — | — | — |

## Unresolved risks

| Risk | Evidence gap or failure | Practical consequence | Owner |
| --- | --- | --- | --- |
| USB Wi-Fi handoff recovery | Lost in-memory attempt after successful card join has no resume path | Joined card may be stranded before installer completion | Studio implementation |
| Firmware release identity | Source `VERSION` equals already signed `1.1.39` | Exact-main firmware-sensitive gate/signer refuses the release | Release preparation |
| Physical and live proof | No card and no candidate deployment | This run cannot claim a client-ready, shipped installation | Release owner |

## Post-close production baseline check

At 2026-09-23 07:00 UTC, cache-bypassed `curl` requests to the canonical origin returned HTTP 200 and `Cache-Control: no-store`: `/studio-release.json` reported Studio build 2048 at `f039ff8eb9014df19bb7287d2e2ca85d4f2bcbb4`, and `/firmware/release-manifest.json` reported signed firmware build 1939, version `1.1.39`, source `92bfd6ab1e287b2bd818c5ce79062dc4f12f2a2b`. Headers and bodies are in `/tmp/lw-usb-wifi-live-{marker,firmware}.{headers,json}`. This is a baseline observation of the *previous* production release, not a pass for frozen candidate build 2052.

## Single next step

`Fix the USB Wi-Fi handoff recovery and bump firmware VERSION on a new source revision, then start a new Prove record and run the complete gates.`
