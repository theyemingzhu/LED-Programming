# Lightweaver Prove session — 2026-09-23 USB Wi-Fi console-ready candidate

## Run status

- Outcome: `INCOMPLETE` — exact-source CI and focused correction passed; published firmware freshness, full terminal release, live, and physical gates remain open
- Authorized by: confirmed after the at-least-20-minute duration warning
- Started at (UTC): 2026-09-23 08:05
- Closed at (UTC): 2026-09-23 08:17
- Expected duration stated: at least 20 minutes, with additional time reported as late source failures were repaired
- Development freeze active: yes, on committed/pushed source below; dated evidence records remain untracked and do not change the candidate

## Frozen target

- Source revision: `4c1c50a38e0c6f27d1d4239671e0c731676561a4` on pushed `codex/usb-wifi-setup`; includes `origin/main` `a6ab5fe2ca09be0614be9903748f1b79a50339b3`
- Studio build: 2063 (`git rev-list --count HEAD`), confirmed in staged `/studio-release.json`
- Firmware target: source `VERSION` 1.1.40, unsigned. Production still serves signed firmware build 1939, version 1.1.39, source `92bfd6ab1e287b2bd818c5ce79062dc4f12f2a2b`.
- Production URL: `https://led.mandalacodes.com` (canonical origin only)
- Deployment/workflow run: [candidate Tests run 35835336821](https://github.com/theyemingzhu/LED-Programming/actions/runs/35835336821) dispatched for this exact SHA; [draft PR #315](https://github.com/theyemingzhu/LED-Programming/pull/315) is the review path. Separate shipping task owns merge, signer, deploy, and live proof.
- Card target(s): no authorized blank/spare card. Configured historical card `lw-b0fe81f61b44` is listed at `/dev/cu.usbmodem14301`; no port opening, erase, flash, or physical observation in this run.

## Automated gates

| Gate | Command or method | Target | Started (UTC) | Result | Evidence / notes |
| --- | --- | --- | --- | --- | --- |
| Full premerge release gate | `node scripts/lightweaver-dev.mjs release` | `4c1c50a3`, build 2063 | — | `NOT RUN` | Prior 951fe351 run proved source/core, cloud browser, mapper, policy, regression browser, 68/68 production, 2656/2656 units, and 382/384 release UI. Its two screen-smoke failures prompted this one-line DOM-prop fix; full post-signer launch gate remains required on terminal `origin/main`. See [prior 951fe351 run](2026-09-23-usb-wifi-wiring-ready.md). |
| Focused desktop/mobile UI | two screen-smoke and two Change wiring Playwright cases (exact command below) | `4c1c50a3`, build 2063 | 08:05 | `PASS 4/4` | Studio owner witnessed both screen-smoke cases red on 951fe351 (`/tmp/lw-usb-wifi-prove-951fe351-resume.log`) and reproduced them independently, then green after removing unsupported `defaultOpen` from DOM `<details>`; existing ref effect retains auto-open behavior. Focused command passed in 5.3s (owner tool transcript). Earlier route/layout screenshots `/tmp/lightweaver-change-wiring-1440.png` and `-390.png` were captured before this prop-only fix and do not represent final warning-free proof. |
| Exact-source CI | `Tests` workflow `workflow_dispatch` on `codex/usb-wifi-setup` | `4c1c50a3`, build 2063 | 08:07 | `PASS` | [Run 35835336821](https://github.com/theyemingzhu/LED-Programming/actions/runs/35835336821) completed successfully: classify, source, production, cloud, firmware, and browser smoke passed on the exact SHA. Artifact lane intentionally skipped before protected signing. |
| Studio production build | `node scripts/ensure-rollup-native.mjs`; `npm run build` | `4c1c50a3`, build 2063 | 08:07 | `PASS AFTER SANDBOX RETRY` | Native Rollup present. First build failed EPERM writing Vite temporary config in shared `node_modules` outside sandbox; identical command passed with filesystem escalation. Log `/tmp/lw-usb-wifi-prove-4c1c50a-build.log`. |
| Staged Pages artifact | `npm run stage:pages`; `npm run verify:pages` | `4c1c50a3`, build 2063 | 08:08 | `PASS AFTER SANDBOX RETRY` | First stage exited 0 but Wrangler logged EPERM writing its user log directory. Identical escalated stage ran without warning, compiled Worker and 63-file Studio build graph; staging verification passed. Staged release marker has exact SHA/build 2063. Logs `/tmp/lw-usb-wifi-prove-4c1c50a-stage.log`, `-stage-escalated.log`, `-verify.log`. |
| Firmware binary freshness | `npm run firmware:check-bin` | `4c1c50a3`, build 2063 | 08:08 | `FAIL — EXPECTED PRE-SIGNER` | Factory binary last built at `9b6975c`; new firmware commits `1845ec97` and `9e248e23` make it stale. Published signed firmware 1.1.39/build 1939 cannot provide the new USB recovery behavior. Protected signer must rebuild/sign after merge. Log `/tmp/lw-usb-wifi-prove-4c1c50a-freshness.log`. |

Focused green command from `lightweaver/` (output in Studio owner tool transcript):

```sh
npx playwright test tests/screen-smoke.spec.ts tests/card-home-facts.spec.ts -g 'main screens load without overflow or console errors|Change wiring opens' --reporter=line
```

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
| Signed/live identity | new firmware and Studio not yet merged, signed, or deployed | candidate cannot be reported as shipped | Shipping task |
| Full terminal launch gate | premerge full gate stopped at a UI warning on predecessor, and only affected cases plus exact-source CI rerun after fix | terminal merged/signed source still needs the documented full gate | Shipping task |
| Physical installation | no authorized blank card or human output observation | fresh-install and appearance remain physically unproven | Card owner |

## Single next step

`Hand the pushed PR branch and exact-source green CI to the shipping task for merge, protected signing, full terminal launch gate, and strict live proof; schedule a separate blank-card Bench observation when an authorized spare is available.`

## Post-close merge reconciliation

By 2026-09-23 08:24 UTC, read-only `git fetch origin main` showed PR #315 merged as `04acfee711bb0ad457cfe3a2042286250342f713` (main build 2064). Its parents are prior main `a6ab5fe2ca09be0614be9903748f1b79a50339b3` and this session's candidate `4c1c50a38e0c6f27d1d4239671e0c731676561a4`. `git merge-base --is-ancestor` confirmed the candidate is contained in main, and the merge commit and candidate share tree `f1744ed4aaf45839a7309da5b85ea1569462d7d5`; no source file changed during integration. This does not alter this candidate's `INCOMPLETE` outcome or substitute for terminal signed/live/physical proof.
