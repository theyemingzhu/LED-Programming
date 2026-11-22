# Blank card → project: direct first install (Studio-only)

NEXT STEP: wait for the real-card soak (claude/realtiming-reds) to finish, then
write tests/blank-card-first-install.spec.ts (failing first), then the fix.

Branch claude/blank-card-direct-save, cut from origin/main e9c649e2.
Owner: durability session. Diagnosis: claude/realtiming-reds
real-card-2026-11-22/DIAGNOSIS-blank-card-dead-end.md.

## The dead end (real card, Studio 2623)
Blank card offers only Find my strips → temporary setup on the card → every
project install is a wiring change → staged as a candidate NVS string → the
card has no page for it ("candidate storage failed") → Studio's way out
"Clear temporary setup" makes the card blank → only Find my strips again.

## Why a Studio-only fix is safe
- Firmware applies a blank card's first wiring directly, no candidate
  (LightweaverStorage.cpp:2880-2890: "a card that has never held a layout has
  nothing to protect").
- pushConfigToCard already has a `factoryBlank` branch that proves the exact
  card and fresh blank authority, then posts /api/config
  (lib/cardPushClient.js ~660-702). Batch production uses it
  (v3/lw-production.jsx:885-896).

## Change
1. lib/cardInstallGate.js: a blank card with a complete draft (wiringSendReady)
   is allowed as a first install; the commissioning proof is not demanded
   because the card cannot play frames until it holds a project.
2. components/card/CardInstallAction.jsx (blank branch): primary "Save to
   card" = pushConfigToCard(package, {factoryBlank:true, allowLayoutChange,
   allowProjectChange, reboot:'if-needed'}), wait for the restart, read back;
   Find my strips stays as the secondary action. Light test runs after.
3. Studio's "clear that setup, then save again" then works as written.

## Test (practice card, harness unchanged)
tests/blank-card-first-install.spec.ts: bench card refuses /api/wiring/candidate
with "candidate storage failed"; Clear temporary setup → blank; Save to card →
POST /api/config 200 → card holds the 41-px, 5-section project. Red before the
fix (only Find my strips offered).

## Real-card proof (after spec green)
clear-project (CLEAR, Wi-Fi kept) → blank → Find my strips → save through
Studio → read back → diff against base. Then hand to the shipper; do not merge.
