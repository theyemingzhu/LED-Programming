# Handoff — stability push to feature work, 2026-11-23

The stability push is finishing. From here a separate features coordinator
plans and integrates new work while the stability sessions land their last
three jobs. This file is the one place that says what is live, what is still
moving, what to keep your hands off, and the rules.

Every fact is labelled **measured** (re-checked by the features coordinator on
2026-11-23 against git, GitHub and the live site) or **reported** (stated by
the stability coordinator, not re-checked). Re-measure before relying on
either: this file goes stale the moment the next merge lands.

## What is live

| Fact | Value | Source |
| --- | --- | --- |
| Studio on `led.mandalacodes.com` | build 2670, revision `7943564a` | measured, `/studio-release.json` |
| `origin/main` | build 2673, revision `85205fcf` | measured, `git rev-list --count` |
| Signed card software | 1.2.4, build 2464 | measured, `/firmware/release-manifest.json` |
| `VERSION` on main | 1.2.4 | measured |

Main is three commits ahead of the live Studio (`3d7c9e0c`, `84a436d9`,
`85205fcf`). All three are waiting-list paperwork with no Studio change, so the
live site is not behind in anything an owner can see. The last `Tests`,
`Deploy site` and `Build firmware binary` runs on main were green at
`7943564a` (measured).

Proven on the real test card overnight (reported, not re-measured, and not
re-measurable by this session): save 30 of 30, look change 6 of 6, a blank card
takes a whole project in one write and one restart 3 of 3, a second browser is
stopped before it overwrites.

## In flight — none merged

| Job | Where | Owner | State |
| --- | --- | --- | --- |
| Card update 1.2.5 (light-count fix by slot swap, stale rollback record fix) | PR #483, branch `firmware-release/1.2.5` | durability session bench-checks, shipper merges | Open, mergeable, `VERSION` 1.2.5 on the branch (measured). Waits on a real-card bench check (reported). After merge the signer takes about 30 minutes; nothing else merges in that window. |
| A save that landed is recognised when its reply was lost | PR #482, branch `claude/fix-landed-save` | practice card session | Open, mergeable (measured). Contains every file of #481, so it is stacked on it. Five smaller fixes remain (reported). |
| Interruption tests, 8 cases in Real-timing | PR #481, branch `claude/bench-firmware-controls` | practice card session | Open, mergeable (measured). |
| Combined Find my strips flow | branch `claude/find-strips-redesign-0a2efe`, no PR | Find my strips session | 27 commits ahead of main (measured). |
| Smaller phone buttons (36px on phones, 44px on desktop) | branch `claude/phone-36px`, no PR | queued behind the card update | 1 commit (measured). |

Also open and not in the stability hand-over: PR #460 (practice card plan,
resume note, one file).

## Open proposals waiting on Adrian

- PR #450, simpler journeys: measured presses and proposed cuts. It now
  **conflicts with main** (measured) and needs a rebase before it can land.
- Draft PR #465, test every pull request on GitHub's machines before merge.
  One of its seven checks is failing (measured).

## Off limits until those jobs land

Feature work does not edit these. If a feature needs one, queue it or ask the
owning session through the app's session messaging.

**Practice card session (PR #481, #482 and the five fixes after them):**
`lw-pattern.jsx`, `lw-card.jsx`, `projectLifecycle.js`, `cardDeployment.js`,
`cardPairing.js`, `cardLink.js`, `benchInstall.js` (reported), plus
`projectModel.js`, `pendingCardSave.js` and `tests/harness/interruptions.ts`
(measured from the PR #482 file list).

**Find my strips session:** `lw-setup.jsx`, `CardPushControl.jsx`,
`StripDiscoveryPanel.jsx`, `beaconProbe.js`, `cardPushClient.js` (reported).
The branch also changes these, measured from its diff against main:
`app.jsx`, `CardInstallAction.jsx`, `CardPinPicker.jsx`,
`CardSetupOverlay.jsx`, `FirstInstallCheckSheet.jsx`,
`FirstInstallLightCheck.jsx`, `FirstSaveOrFind.jsx`, `cardFrameStream.js`,
`stripDiscovery.js`, `firstInstallCheck.js`, `firstInstallState.js`,
`strip-discovery.css`, `lw-pinpicker.css` and
`tests/harness/cardSimulator.ts`.

**Smaller phone buttons:** the branch edits 31 stylesheets, which is nearly
every stylesheet in Studio, and 20 browser specs (measured). Until it lands,
any feature that changes button, row or control sizing in CSS will collide
with it. Add new rules in a new stylesheet, or wait.

**Screens, in plain terms:** stay off Patterns (looks), Card Home, first setup
and Find my strips, and save-to-card. Layout, Playlist, Show, Pattern Lab and
the Projects panel are free, apart from the stylesheet caveat above.

## Parked — do not send

`relative-look-tuning-default-boot` in `firmware-queue/queue.json`. It failed
on the real card on 23 November: after one tuned save, every later look save
was refused with 400 "invalid pattern envelope" (reported). It stays in the
waiting list and must not ride 1.2.5.

The waiting list on main holds three entries (measured): that parked one,
`drop-stale-rollback-record` and `candidate-blob`. The last two are what #483
carries.

## Known open defects, not yet assigned (all reported)

- The colour, count and boundary checks never tick after the count.
- "Saved" shows before the lights are confirmed.
- A second browser's slider previews onto the card.
- Look ids gain a "combo-" prefix after a re-import (`cardPlaylist.js:84-88`).
- An out-of-date draft is refused with no hint why.
- Power loss during a wiring change is unproven.
- Wi-Fi setup on real phones and in Safari is untested.

None of these is a feature. They go to the stability coordinator, or to a
feature only when the feature already owns that file.

## Who is running

| Session | Role |
| --- | --- |
| Shipper | The only session that merges. One change at a time. |
| Card durability | The only session that touches the real card `lw-b0fe81f61b44`. |
| Practice card | Interruption defects, PR #481 and #482. |
| Find my strips | The combined flow on its own branch. |
| Stability coordinator | Closes the stability work down. |
| Features coordinator | Plans, builds and integrates new features. Does not merge, does not touch the real card. |

## Rules that carry over

1. Everything merges through the shipper, one change at a time. `Tests` runs
   only on main after a merge, and a push to main cancels the run in progress,
   so nothing merges during a signed card release.
2. A register-only merge on top of a Studio merge strands the deploy until the
   next real merge. Do not stack paperwork on a Studio change.
3. Every new test spec goes into a `lightweaver/package.json` lane
   (`ci:browser-smoke` or `test:release-ui`) in the same pull request, or it
   never runs.
4. "Shipped" means merged, deployed and proven live by the `/studio-release.json`
   build number. Every report names the Studio and firmware build numbers.
5. Firmware goes only onto the one bench card, and only the durability session
   puts it there. No `VERSION` bump and no signed card release without Adrian.
6. Never print a secret or the Wi-Fi password. Never call `/api/reset-wifi` or
   `/api/factory-reset`. Never raise brightness above 0.91 or the power cap
   above 2000 mA while the strip runs from USB.
7. Test Studio work on the practice card: Fast for logic, Real-timing for
   anything about waits, restarts and wording. See `docs/practice-card.md`.
8. Run browser suites on an idle Mac. Several sessions testing at once invent
   failures; re-run alone before believing a red.
9. Fewer side sessions. Split work by files, one writer per file set.
10. `THINKING.md` lists rejected paths (accounts, Stripe, a cloud catalog, a
    setup ladder on Card Home, card self-update). Do not re-propose one unless
    its named trigger has fired.

## How a feature moves from here

1. Adrian names the feature. The coordinator does not invent a roadmap.
2. Survey the existing code first (the workspace rule), then show Adrian the
   design rendered before anything is built.
3. Build on a branch, with tests in a lane, keeping off the files above.
4. Prove it on the practice card, Fast and Real-timing.
5. Hand a ready pull request to the shipper. The coordinator does not merge.

## When this file is finished

Delete the "Off limits" and "In flight" sections' entries as each job goes
live, and retire the file once PR #483, #482, #481, Find my strips and the
phone buttons are all shipped.
