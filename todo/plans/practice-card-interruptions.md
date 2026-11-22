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
| 2 | `interruption-reload-during-restart.spec.ts` | ✗ (D2) |

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
