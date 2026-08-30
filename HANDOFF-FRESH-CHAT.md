# Handoff to fresh chat — compress Card Home after one-action IA

Open a new Claude chat in the LED / Lightweaver workspace and paste the block below. The copy button on the code fence grabs it cleanly.

```
Resume Lightweaver on branch card-one-action. Do not start from main and do not rebuild the one-action Card plan from scratch.

A previous Cursor chat already implemented Tasks 1-7 of the plan. The doors are done: Layout is Wire only, check and install live on Card Home, Hardware has no second Install, the footer shows the status word only, and old #screen=layout&mode=wire bookmarks open Card. Head is a5bb834a. Checkpoint on that revision: 2201 unit tests pass and the production build succeeded.

Before touching code, read in this order:
1. docs/superpowers/plans/2026-08-30-card-one-action.md — start at the 2026-08-30 audit deltas at the top
2. TODO.md Follow-ups item about compressing Card Home
3. LIGHTWEAVER_WORKBOARD.md CARD-IA-001 and CARD-IA-VIS-001

You do not need to re-survey how Test & Install, ModeSwitch, or the Hardware Install row used to work — verified 2026-08-30 evening. CardInstallAction already exists and is the only project-write UI. CardPushControl stays the only writer.

Sprint mode. Next bounded pass only: compress Card Home so connected / project-name is not repeated across the setup header, the up-to-date banner, Detected state, and the matching-project panel. One status, one primary action. Hardware and Advanced stay closed folds. Keep color-order try-on and the card-address recovery field. Do not re-add tabs. Do not bump VERSION, flash a card, or ship.

Verify with a focused Playwright if you change Home copy or structure, then node scripts/lightweaver-dev.mjs checkpoint from the repo root. Browser-verify at http://127.0.0.1:4173/#screen=card and http://127.0.0.1:4173/#screen=layout. Send those clickable URLs when ready.

Hard rails:
- Stay on card-one-action
- Do not merge Wire into Card
- Do not invent a second install writer
- Preferences stay in the top bar
- No firmware release, no launch:check unless Adrian asks to ship
- After this Home compression lands, stop and report. Do not start follow-ups or open a PR unless he asks.
```

---

## Context for after (Adrian's reference only, not for the fresh chat)

The IA is on `card-one-action`, not pushed, not shipped. After Home is quieter, the next human call is push / PR / look at the live Card. Preview: http://127.0.0.1:4173/#screen=card
