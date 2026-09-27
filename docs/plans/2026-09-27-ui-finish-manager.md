# Lightweaver UI finish — manager contract

Approved 2026-09-27: Gallery polish, Effortless workflow, then a focused Creative
instrument pass for Patterns and Lab. Manager Playbook v6; Build a scoped feature
recipe v5. The authoritative status/routing record is LIGHTWEAVER_WORKBOARD.md.

## Shared direction

Keep Lightweaver's warm charcoal/bronze identity, existing DM Sans / Spline Mono,
routes and runtime contracts. Improve hierarchy through readable supporting text,
clear spacing, restrained surfaces and a clear primary action. Preserve daylight
theme, keyboard focus, reduced motion and mobile use. No decorative feature work,
new design libraries, firmware, backend, persistence migrations, commits, release,
deployment, hardware connection or flashing in this batch. Do not change real
card state to test UI. Existing local work is intentional and must survive.

Use actual local screens, not the live site, for implementation acceptance: the
live Studio 2165 differs from the unfinished local Card and creative workflows.
The existing first-action ledger and tests define Card invariants. Patterns/Lab
already have color journeys, Keep/reopen and native-look handoff; reuse them.

## Ownership and sequence

The two initial chats are roles within the lightweaver-app ownership boundary.
Neither edits the workboard, shared manager brief, Git state or another role's
files. If another file is needed, return the exact need to the manager.

1. **Gallery polish** owns `lightweaver/src/v3/v3-styles.css`,
   `lightweaver/src/styles/v3-console-shared.css`,
   `lightweaver/src/styles/v3-pm-console.css`, and a new focused visual regression
   `lightweaver/tests/gallery-polish.spec.ts` if useful. Change real foundations
   and shared presentation, not a growing catch-all override file. Card and
   Patterns layout restructuring belongs to later owners. Inspect key screens
   at 1440px and 390px, dark/daylight, with visible keyboard focus. This role has
   the first CUA viewport/screen slot; no Playwright for cosmetic-only changes.
2. **Effortless workflow** owns `lightweaver/src/v3/lw-setup.jsx`,
   `lightweaver/src/v3/lw-setup.css`,
   `lightweaver/src/styles/v3-card-console.css`, and the new focused regression
   `lightweaver/tests/effortless-card-workflow.spec.ts`. Start with inspection and
   implementation independent of Gallery. Preserve current journey derivation,
   connection, detection, authority, and hardware action logic. Put the next
   meaningful action first; reduce redundant information; earlier completed
   steps, LED count and color remain reachable. Existing tests can be run but
   not weakened. This role owns the initial automated Playwright slot; CUA
   viewport changes wait for Gallery to release its screen slot.
3. **Creative instrument** starts after 1 and 2. Owns
   `lightweaver/src/v3/lw-pattern.jsx`,
   `lightweaver/src/styles/v3-patterns-extra.css`,
   `lightweaver/src/styles/v3-patterns-console.css`,
   `lightweaver/src/pattern-lab/PatternLabScreen.jsx`,
   `lightweaver/src/pattern-lab/pattern-lab.css`, and
   `lightweaver/tests/creative-workspace.spec.ts`. Keep preview visible during
   browsing/tuning, compact section targeting, make Preview/Keep/Install meanings
   explicit, and smooth the existing Lab handoff. No new pattern engine or
   state/persistence model. Bound work to this workspace; do not rebuild Layout,
   Playlist or Show. Recheck exact ownership before dispatch.
   Final review follow-up also owns only the desktop toolbar test in
   `lightweaver/tests/patterns-v3.spec.ts`: its former single-row height contract
   must reflect the now-approved readable two-row narrow inspector, with
   positive label-width and control-reachability assertions retained/added.

## Verification and coordination

Use the one manager-owned preview at 127.0.0.1:4173. Set LIGHTWEAVER_TEST_PORT=4173
for focused browser checks (confirmed by tests/testPort.mjs). Never start another
Vite server. Browser checks run serially to avoid shared report/preview conflicts.
For changed behavior: focused failing regression, fix, green. For cosmetic
changes: focused real-screen proof; do not test CSS declarations mechanically.
Manager runs one final checkpoint (unit suite + production build) after all three
passes and reviews integrated screens. Workers do not run the checkpoint or
release gate individually. Return concrete working behavior, exact files, tests,
screenshots, limitations and any specific integration decision. Limit each pass
to a useful 15–25 minute slice; report early if it will exceed that.

Selected routing is explicit in the workboard. Each build chat receives its
model/effort before work. Do not spawn additional workers or directors. Bring a
named unresolved difficult decision back to this manager; do not silently raise
models, broaden scope or repeat failed work unchanged.

## Completed evidence

All three passes are implemented locally. No commit, push, deploy, firmware or
hardware operation was performed. The existing unfinished changes remain intact.

- Gallery: shared text/focus tokens and Patterns/Playlist hierarchy; desktop and
  390px phone in both themes, plus desktop Layout inspected with CUA.
- Card: first-action presentation and completed-step access; regression witnessed
  red before the fix. Final focused + first-action + J01 run 10/10; different-card
  project protection also passed. Card inspected on desktop/phone in both themes.
- Creative: preview/section context together, phone bank before tuning, Lab
  return and truthful Preview/Keep/Install guidance. Existing handoff and edit
  continuity 5/5, creative/mobile/target checks 4/4. Final focused suite 3/3,
  plus the two named toolbar tests. No playback or persistence changes.
- Manager review caught a 38px desktop selector and a short-laptop overlap.
  Added readable-width and actual control hit-testing regressions. Narrow
  inspectors use two toolbar rows; short desktop viewports scroll the full
  inspector without shrinking panels. Taller desktops retain the pinned preview.
- One integrated checkpoint passed all 2,473 unit tests and the production build.
  Production CSS rebuilt successfully after the final responsive corrections.
  Whitespace check passed; pre-existing tracked changes outside the owned files
  match the starting snapshot. Manager inspected the final source and screenshots
  and directly checked scrolling/tuning at 1280x720 with CUA.

Screenshots are in `.claude/ux-screens/creative-workspace/`: `desktop-patterns.png`,
`desktop-tuning.png`, `phone-patterns.png`, `phone-lab.png`, and
`compact-desktop-tuning.png`. Card fixture screenshots remain under
`.claude/ux-screens/first-action/`. These are browser/fixture evidence, not
physical-light proof. Local preview remains at http://127.0.0.1:4173/.

Routing: Gallery Sol/medium, Card Sol/high for journey constraints then
Sol/medium for handoff; two exact typography declarations Luna/low; Creative
Sol/medium including bounded review corrections. Explicit tool model overrides
were accepted before build assignments. Costs were not exposed and are unknown.
No extra frontier worker was needed. Next step is Adrian's visual review;
shipping remains a separate authorization.
