# D10: one press of the blank-card Save to card wrote the project twice (WIP)

Branch claude/one-press-one-write from origin/main e24d8373 (live 2653).
Real-card record: claude/realtiming-reds real-card-2026-11-22 (DEFECTS.md D10).

## Root cause (found)
1. BlankCardFirstInstall called prepareCardDeployment with no card identity,
   so waitForCardDeploymentVerification threw "Exact card identity is
   required before installation." right after a write that had landed.
2. The failure cleared the first-install hold (phase ''), and the panel's
   ordinary CardPushControl, auto-started by next=patterns, installed the same
   project again: the second POST /api/config and second restart.
3. The hold lived in the panel's own state, and Card Home rebuilds the panel
   when the card goes off the air ("STEP 1 OF 3 / Connect to your card").

## Fix (in this branch)
- lib/firstInstallState.js: one shared first-install state for every panel
  and every rebuild (no second hold).
- BlankCardFirstInstall passes the paired card's identity to
  prepareCardDeployment.
- A failed first install keeps the hold (phase 'failed') instead of handing
  the screen to an auto-starting install control.

## Tests
- tests/blank-card-one-write.spec.ts (Real-timing practice card, restart after
  save, panel rebuilt mid-save): RED on main (a second install sent), GREEN here.
- candidate-storage-full.spec.ts green.
- tests/blank-card-first-install.spec.ts green, now on the Real-timing practice
  card (it restarts after a save under a new boot id, as the real card does).
- The last blocker was in the fix, not the harness: the blank install read the
  card back with project evidence only, which carries no readiness, so
  requireReady never passed and a landed install read as failed. It now joins
  the card status, as CardPushControl does. No harness change was needed.
- Neighbours (card-workspace, journey-j01, live-find-my-strips,
  simpler-journeys, strip-discovery, fresh-install-usb-wifi): 171/172; the red
  is card-workspace.spec.ts:2580, flaky on main (3/4 fail there).
DONE. Handed to the shipper.
