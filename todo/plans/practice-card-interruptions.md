# Practice card — interruptions (2026-11-22/23, overnight)

Brief (coordinator, Lightweaver owner journey audit): Studio must never say
"failed" when the card took a change, say success when it did not, or sit
silent. Eight interruption cases, one spec each, on the **Real-timing practice
card only** (network guard on). Each asserts: what Studio says, what the card
holds afterwards, and no wait silent for more than 3 s.

Harness: `lightweaver/tests/harness/interruptions.ts` — Real-timing card with
the real save-restart rule (14 s), fixed seed, spontaneous silences off;
`dropOffAir`, `rollBackNextSave`, `restartByItself`; a words log (every
card-related line Studio showed, with time), a quiet watch (longest stretch
with no busy control and no working wording), a not-taken watch.

Rule kept: a red spec is a finding. Studio source untouched.

## Results

| # | Spec | Result |
|---|---|---|
| 1 | `interruption-save-drop.spec.ts` | 20 s ✓, 45 s ✓ then ✗ (D1c), never ✓, back at 75 s ✗ (D1) |
| 2 | `interruption-reload-during-restart.spec.ts` | reload ✗ (D2), reopen 30 s later ✗ (D2b) |
| 3 | `interruption-self-restart.spec.ts` | idle Card Home ✓, editing a look ✓ |
| 4 | `interruption-wifi-drop.spec.ts` | quick-path look ✓, count Set ✗ (D3) |
| 5 | `interruption-double-save.spec.ts` | double press ✓, Save during restart wait ✓ (side finding D4) |
| 6 | `interruption-slow-first-setup.spec.ts` | pairing at 5 s ✗ (D5), walk at 5 s ✗ (D6, D7) |
| 7 | `interruption-no-room.spec.ts` | Patterns ✓, install over temporary setup ✗ (D8) |
| 8 | `interruption-rolled-back.spec.ts` | Patterns ✓, Card Home ✓ |

## Findings (Studio defects unless marked)

- **D1** Card silent after the save's write, back at 75 s (after Studio's 45 s
  limit) holding exactly the save. Studio keeps "Try saving again",
  "On the card · Draft kept separately", and "Open Hardware and verify that
  this exact Studio project is still installed on this card before sending
  lights." Nothing re-checks the save once the card answers again.
  `src/v3/lw-pattern.jsx:2529` (restart-timeout branch returns, no later
  reconcile). Card held fingerprint = sent fingerprint.
- **D1b (soft)** Same run before the card returns: "Try saving again" + header
  "Unsaved changes" while the card already holds the save. The message itself
  ("has not come back after restarting (45 s)…") is honest.
- **D2** Reload 4 s into the restart after Save. Card holds exactly the save.
  After reload Studio shows "Previously installed" and "On the card · Draft
  kept separately", never "Installed on card". The installation record is
  written only by the in-page verification (`markProjectInstalled`,
  `src/v3/lw-pattern.jsx` ~2493); `src/lib/projectLifecycle.js:242` /
  `src/lib/cardSessionView.js:25` then have no record to match.
- **D2b** Tab closed during the restart, Studio reopened 30 s later, card
  answering and holding exactly the save: "Previously installed",
  "On the card · Draft kept separately". Same cause as D2. (First version of
  this test was a wrong test — the card was routed on the closed tab only;
  now installed on the browser context.)
- **D3** Card Home light count Set on the bench card, Wi-Fi drops 10 s after
  the write. The card holds 41 and Studio ends "Lights counted" (29 s, no
  silent wait). But during the planned restart the health row says "This card
  is answering but is not reporting a ready runtime. Recover lights is the
  check to run first — the card accepts it in this state." — sending the owner
  to recovery during a normal restart. `src/v3/lw-card.jsx:805` (no
  restart-pending case). Also shown in the same window: "Project not
  installed" (true — Studio's draft; not a finding).
- Observation (spec 3, idle): during an unplanned 14 s restart Card Home kept
  "Connected" the whole time; it then said "Card restarted — verifying…". Not
  a lie, but nothing tells the owner the card was briefly gone.
- **D4** During a Patterns save's normal restart wait, tapping a look shows
  "That tap was not sent to the card. This card is not ready for pattern
  commands. Recover and verify it before sending lights." + "Recover and
  verify card". Sends the owner to recovery during a normal restart.
  `src/v3/lw-pattern.jsx:400`, `:3844`. (The second Save press during the
  wait is ignored with no word; the header correctly keeps "Unsaved changes".)
- **D5** Pair a factory-blank card answering in 5 s: "Pairing this card…",
  then back to "Pair this Lightweaver card … Connect" with no reason; pressing
  Connect leaves "signal is aborted without reason" under "Pair this card".
  Never pairs. `src/lib/cardFind.js:103` → `src/lib/cardPairing.js` →
  `adoptDiscoveredDirectCard` (`src/lib/cardLink.js` ~1921); raw error text
  reaches the screen.
- **D6** Find my strips, card answering in 5 s: "Could not light GPIO 18:
  signal is aborted without reason. You can still tick it below…". Fixed 4 s
  timeout, no retry, raw abort text. `src/lib/beaconProbe.js:40`,
  `src/components/card/StripDiscoveryPanel.jsx:546`.
- **D7** Same walk, "Yes, count this strip": "The card could not be set up —
  The local card page is not connected. Open it once, then try again." Studio
  was local http (no card page); the card received no write. Wrong cause.
  `src/lib/benchInstall.js:125` (bridge-path message on a direct Studio).
- **D8** Install the discovered project over the temporary setup; the card
  refuses with the real no-room error (400 `nvs write failed; previous project
  remains intact…`, as lw-b0fe81f61b44 did on 2026-11-19). Studio never says
  "no room". It says "Sending revision 1…", then "The exact card is on its
  setup network. Finish Wi-Fi, then return here." (`src/v3/lw-setup.jsx:973`),
  then "Studio could not verify this install (read-back-mismatch). Retry reads
  the card again without sending the project." No "Clear temporary setup" door
  on that screen. Card kept the temporary setup. Likely cause: the refusal is
  handled as an uncertain write and sent to read-back
  (`src/components/layout/shared/CardPushControl.jsx:431`,
  `isUncertainCardWriteFailure`) — not confirmed by stepping through.
  Patterns' own no-room path is correct (spec 7a green).
- Observation (spec 8, Patterns): card back holding the old project at 15 s;
  Studio shows "Card restarted — verifying" until 48 s, then "Not saved to the
  card: The card did not verify the exact installed project." Honest, but
  33 s later than it could know.

## Ranked by how badly each would mislead an owner

1. **D8** — the real card's actual failure mode; wrong cause (Wi-Fi), a
   retry that cannot succeed, no way out offered.
2. **D2 / D2b** — reload or reopen after a save that landed: "Previously
   installed", "Draft kept separately". Common (phone reload, laptop lid);
   invites a resave that restarts the card again.
3. **D1** — card back after Studio's 45 s limit: "Try saving again", "Open
   Hardware and verify…" about a save the card holds.
4. **D5** — a slow card cannot be paired; raw "signal is aborted without
   reason".
5. **D7** — slow card: setup write "failed" with a wrong cause (card page).
6. **D6** — slow card: probe "failed", raw abort text.
7. **D4** — look tap during a save restart sends the owner to recovery.
8. **D3** — count Set restart: "Recover lights is the check to run first".

## Process note

One run (spec 8, first pass) overlapped another session's Playwright run in
worktree strange-elgamal: my pre-run check found it but did not wait. Both
spec 8 tests were green; the final full run below waited for an idle Mac.

## Final full run (2026-11-23, Mac idle, one worker)

18 tests in 8 spec files: **10 passed, 8 failed, 20.1 min.** The 8 reds are
the findings above: D1, D1c, D2, D2b, D3, D5, D6+D7 (one test), D8.

- **D1c** (new in the full run) The 45 s case passed in its first run and
  failed in the full run: the card answered at 45.9 s ("Draft kept
  separately", "Open Hardware and verify…"), then at 47.7 s Studio said "The
  card has not come back after restarting (45 s)" — after it had answered.
  It sits on Studio's 45 s limit (`CARD_RESTART_WAIT_MS`,
  `src/lib/cardDeployment.js:312`, counted from the start of verification),
  so it goes either way by a second. Same family as D1.
