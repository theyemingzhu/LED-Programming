# LED / Lightweaver session closeout — 2026-09-27

This audit consolidates the active LED development chats into the current
connection-recovery chat. Archived chats remain recoverable. Archiving a chat
does not certify physical-card acceptance or erase its checkout.

## Verified starting point

- Local `main` and `origin/main`: `661351327f5db46991e8dea5c9233e5cca990d4f`.
- Studio build **2165**, signed firmware **1.1.47 / build 2160**.
- Tests run `36257408033` and launch run `36257425726`: passed.
- Credentialed production deployment `36258103832`: passed, including live
  verification. An independent check during this audit matched the strict
  no-store release marker and all **63 Studio / 8 firmware** files against the
  existing build of that exact revision.
- The local preview now uses the current root checkout, not the old build 1793
  working copy. Only one preview is retained on port 4173.

## Accounted-for chats

| Chat | Software disposition | Remaining acceptance |
| --- | --- | --- |
| Clarify Wi-Fi setup guidance | Integrated; archived | None specific to this chat |
| Clarify firmware status messaging | Integrated; archived | None specific to this chat |
| Lightweaver — scene playback contract | Patch-equivalent changes on main; archived | Physical playback remains in the central Bench backlog |
| Lightweaver — Layout targeting bridge | Patch-equivalent changes on main; archived | Physical mapping remains in the central Bench backlog |
| Lightweaver — expression editor prototype | Superseded by integrated expression editor; archived | No independent implementation pending |
| Fix layout, GPIO, and patterns | Released changes on main; final local shipment note pushed; archived | Real three-output observation transferred to the central Bench backlog |
| Build USB Wi-Fi setup for Lightweaver | Released USB setup and recovery changes on main; local notes pushed; archived | Gallery artwork/output/count and physical playback transferred to the central Bench backlog |
| Lightweaver Interface Manager | Compact setup/action and recovery changes represented on main; local snapshot pushed; archived | Old local mapper-retirement edits are preserved but not integrated; they conflict with current project scope |
| Propose three UI improvement paths | Snapshot pushed; four refinements restored in PR352; archived | Release tracked centrally in PR352 |
| Lightweaver — Gallery polish | Shared neutral control-edge refinements restored and verified; archived | Included in PR352 |
| Lightweaver — Effortless workflow | Layout outline/type-label refinements restored and verified; archived | Included in PR352 |
| Lightweaver — Creative workspace | Narrow-screen project identity/action refinements restored and verified; archived | Included in PR352 |
| Fix Find my card detection | Current coordinating chat; stays open | Local card connection remains unresolved |

## Restored visual refinements

The current-code port restores subdued neutral control edges in both themes,
flat single-outline Layout toolbar groups, short chipset/voltage selections with
an accessible full description, and wrapped project names above actions on
narrow screens. Primary orange actions retain dark text and their original hover.
The regression first failed against main because the project name was forced to
one line and overflowed. The repaired regression and existing chipset scenarios
pass **5/5**. Screenshots were inspected at desktop and phone sizes; the primary
also inspected the real in-app Layout preview.

Evidence: [phone Projects](../.claude/ux-screens/session-closeout-20260927/projects-390.png),
[desktop Layout](../.claude/ux-screens/session-closeout-20260927/layout-1440.png),
[phone Layout](../.claude/ux-screens/session-closeout-20260927/layout-390.png).
The broader software release gate and deployment are tracked in
[PR352](https://github.com/theyemingzhu/LED-Programming/pull/352). Archiving the
completed worker chats transfers release coordination here; it does not claim
physical-card acceptance.

## Preservation and superseded work

The old root working copy is committed and pushed as
`codex/preserved-local-before-main-20260927` at `8ead342b`. It is a historical
backup, not a release candidate. Its 157-file snapshot must not be merged over
current main. Only the confirmed missing visual refinements are carried forward.

Four additional audited dirty checkouts are now committed and pushed:

| Recovery branch | Snapshot |
| --- | --- |
| `codex/preserved-interface-manager-20260927` | `f43d18ed` |
| `codex/preserved-usb-notes-20260927` | `57e7665c` |
| `codex/preserved-start-actions-20260927` | `ead9782c` |
| `codex/preserved-first-action-captures-20260927` | `43993bb1` |

These include old UI/CI edits, bench notes, and captures; they are preservation,
not claims of correctness or release readiness. Textual credential-pattern scans
found no matches. The old compact install-action auto-lock guard is preserved
as an unverified candidate: current normal matching-project routes hide that
compact action, and the broad guard would disable auto-lock for every compact
install task. No reproduced defect justified integrating it during closeout.

`codex/layout-gpio-pattern-fixes`, `codex/v3-compact-actions`, and
`codex/wifi-resume-navigation` were also pushed as recoverable session history,
then preserved in the archive tags described below before their branch names
were removed.
The compact actions, Wi-Fi password visibility/help, and exact-card preserving
update resume behavior are already represented on main despite differing patch
identities. Older test fixtures and workboards must not replace current versions.

Draft PR [312](https://github.com/theyemingzhu/LED-Programming/pull/312) is a
separate cross-repository Cursor handoff containing documentation only. It is
outside the Lightweaver feature closeout and remains open. General worktree
cleanup and health-research chats sharing this directory are also outside scope.

## Completed librarian and branch cleanup

**12 historical development chats archived.** The current connection-recovery
chat is the single continuation for release coordination and the open Bench
checks below. Unrelated chats were not archived.

**68 old local branch names and 11 remote branches removed.** Of the local
branches, 37 were fully contained in main. The other 31 exact commit tips were
first tagged under `archive/led-closeout-20260927/<original-branch>` and verified
on GitHub before their branch references were removed with exact-tip checks.
Four clean, idle checkouts were detached at the same commits; their files were
preserved. No force push, file deletion, or history rewrite was used.

The [machine-readable recovery map](branch-closeout-2026-09-27.json) records every
removed name, original commit, and archival tag. Main, five explicit recovery
branches, and the active PR352 branch remain locally. The remote also retains
the unrelated open draft PR312. The PR352 branch can be removed normally after
its integration; the five preservation branches intentionally remain recoverable.

## Central unresolved Bench work

- **Local Mac card** `lw-b0fe81f61b44`: read-only app0 bytes identify firmware
  1.1.39/build 1939; this alone does not establish the active OTA slot. Serial
  boot showed its setup AP and no saved Wi-Fi/project. A preserving USB update
  requires fresh exact-card/partition/active-slot checks. Browser USB selection
  was blocked; no flash, erase, or successful connection is claimed.
- **Gallery card** `lw-301bd5a172e0`: historical September 24 evidence recorded
  firmware 2088 and successful station connection after correcting a credential
  mismatch. This is a different card, not evidence that the local Mac card is
  connected. Artwork, GPIO/output/count, installed project, and observed physical
  playback remain to be established for that setup.
- Physical mapping, three-output playback, rehearsal restoration, offline
  power-cycle behavior, and novice acceptance remain unobserved. Automated
  browser simulation does not satisfy these gates.
- Keep the Mac on its existing internet connection. Do not join the card AP.
  Continue through USB or the existing LAN using current preserving workflows.
  No login or BOOT/RESET-button requirement may be substituted for recovery.

Next Bench step: resolve normal browser USB selection, inspect the exact local
card with the current signed preserving updater, and report the verified
compatibility result before any write. No exhaustive Prove run is authorized by
this session-closeout request.
