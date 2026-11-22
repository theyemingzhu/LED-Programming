# Count row stuck on "Saving…" after a refused count (WIP)

NEXT STEP: make tests/count-row-release.spec.ts reproduce with a MULTI-SECTION
installed project. With the one-strip `installed-match` practice card, a count
change goes out as plain POST /api/config (no candidate), so the refusal never
happens. On the real card (5 sections on GPIO 18) Studio staged the change as
POST /api/wiring/candidate → 400 "candidate storage failed".

Branch claude/count-row-release from origin/main e9c649e2.
Real-card record: claude/realtiming-reds real-card-2026-11-22/NOTES.md
(Part 2, light count) and DEFECTS.md D4.

What is known: busy lives only in lw-setup.jsx `ledCountState` (line 186), so
a reload clears it; each stuck "Setting…" is a NEW press whose
applyLedCount never settles and sends nothing. After the refusal the draft
holds 42 and the card 41, so `cardTakesCount` is true (!installationMatch) and
the press goes down the direct path: `await applyCardParts(...)` →
`replaceProject(..., { confirmDiscard: () => true })` (lw-setup.jsx:245-255),
the first await, is the suspect; applyLedCountOnCard always returns.

## 2026-11-22 later: not reproduced on the practice card
- One-strip installed-match card with POST /api/config refused (400): the row
  releases — the spec passes on main. So the hang is specific to the staged
  (candidate) path on a multi-section project.
- Five-section card via bench + import + Layout light test: "Start light test"
  never appeared on the bench practice card (setup steps first), so the
  installed five-section state could not be built in reasonable time.
NEXT STEP: seed a five-section installed card directly (createCardSimulator
with explicit outputs/segments matching a 5-strip draft), refuse
/api/wiring/candidate, Card Home count +1 → Set, then press Set again.
The card-side fix (candidate stored as a blob) removes the refusal that leads
here; this Studio defect still matters for any other refused staged write.
