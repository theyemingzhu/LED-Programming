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
| 1 | `interruption-save-drop.spec.ts` | 20 s ✓, 45 s ✓, never ✓, back at 75 s ✗ (D1) |
| 2 | `interruption-reload-during-restart.spec.ts` | reload ✗ (D2), reopen 30 s later ✗ (D2b) |
| 3 | `interruption-self-restart.spec.ts` | idle Card Home ✓, editing a look ✓ |
| 4 | `interruption-wifi-drop.spec.ts` | quick-path look ✓, count Set ✗ (D3) |

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
