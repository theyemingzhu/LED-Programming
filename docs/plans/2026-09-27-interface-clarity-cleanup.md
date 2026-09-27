# Interface clarity and spacing — proposed manager pass

Status: implemented and verified locally after Adrian's “start”. Sprint mode.
Not committed, pushed or deployed.
Manager Playbook v6 / Build a scoped feature v5, adapted to Adrian's request for
a diagnosis and plan before another cleanup. Authoritative status: workboard.

## Diagnosis and evidence

The first three passes are complete locally, not committed or deployed. They
improved shared styling, Card first actions, and Patterns/Lab composition. They
did not establish a detailed acceptance standard for every inspector and state.

Adrian's annotated Layout screenshot is confirmed in the local preview. At a
1280×720 viewport, the sidebar is 320px wide but its chipset select is only
207px. Insets accumulate through the wire wrapper (16px margin + 13px padding),
tools body (14px padding), and chipset row (6px padding), before the select's
own 9px text inset. Adjacent wrapper and tool panel have the same background.
The result spends width on invisible structure while clipping the useful value.

Layout-specific styles also retain 9–10px tracked uppercase labels. The power
warning is a colored paragraph inside a collapsible Wire plan summary, separated
from the relevant settings, with no immediate route to review them. Hiding the
summary can hide the warning. These are information hierarchy and containment
problems as well as contrast problems.

Additional live inspection: Playlist's enabled secondary row actions look muted;
Show puts small descriptive paragraphs inside its narrow control column.
Workshop's entry state was inspected for message categories. Earlier Card and
Patterns/Lab screen evidence remains relevant. This is a targeted assessment,
not a claim that every screen/state/theme has passed an exhaustive audit.

## Agreed direction to propose

Retain the warm charcoal/bronze identity. Give controls, information, headings,
and warnings clearly different roles. Reduce redundant containers, not readable
type size. Keep purposeful whitespace around groups while removing stacked
insets within a group. Fix the owning rules instead of appending more competing
overrides. No feature expansion or changes to hardware authority/persistence.

1. **Control definition and readable text.** Define consistent primary,
   secondary, selected, disabled, hover, and keyboard-focus appearances across
   both themes. Enabled controls must not resemble disabled controls. Separate
   controls from their surroundings with deliberate edges and surface contrast.
   Quiet decorative grids behind forms. Use short readable labels; keep small
   tracked capitals for genuinely secondary metadata only. Measure contrast as
   well as inspecting screenshots. Proposed targets: 4.5:1 ordinary text and
   3:1 essential control boundaries/state indicators against adjacent surfaces.
2. **Flat inspectors and usable width.** Start with Layout: one outer panel and
   flat groups, a shared content edge, one owner of each inset. Align Wire plan,
   Wire tools, Strip schedule, and Build sheet without pushing everything inward.
   Show a compact chipset identity such as “WS2815 · 12V”; place the full strip
   description beneath it. Preserve voltage and backup-data guidance, options,
   and behavior. Essential values and action labels must not depend on ellipsis
   or hover to be understood. Let longer help wrap naturally outside controls.
3. **Messages in the right place.** Keep a concise, persistent warning summary
   visible when a relevant section is collapsed; put details and a review action
   beside the responsible settings. For power, distinguish the full-white
   estimate from the configured supply and link to reviewing power settings;
   do not automatically change limits. Put field errors beside fields, action
   failures beside their action, and global connection status in the shared
   status area. Keep essential explanations visible; move optional reference
   material into clearly named help. Do not rely on warning color alone.

Apply these rules to Card, Layout (including selected strips and expanded
hardware/custom-mapping groups), Patterns, Lab, Playlist, Show, and Workshop,
plus shared project/preferences/import/export dialogs and the footer. This is
coverage for the same classes of defect, not permission to redesign every flow.

## Implementation ownership and model routing after approval

Use the existing manager as sole director and integrator. Reuse existing build
chats where appropriate; no additional frontier director. Freeze exact file
ownership against current dirty changes before dispatch. No worker changes the
workboard or another worker's files. No overlapping shared CSS edits.

| Deliverable | Model / effort | Why and acceptance | Return condition |
| --- | --- | --- | --- |
| Shared control/surface/type rules | GPT-6 Sol / medium | Related CSS cascade and theme work; measured states and representative screens agree | Conflicting shared and local rules require a product decision |
| Layout inspector and message placement | GPT-6 Sol / medium | Bounded component composition with existing behavior; readable 320px inspector and warnings remain findable when folded | A change would alter power, card commands, or data semantics |
| Apply the settled rules to remaining screen-specific surfaces | GPT-6 Sol / medium | Several existing screens need coherent application; no clipped essential text or ambiguous controls in checked states | Scope requires a new flow rather than presentation cleanup |
| Exact isolated residual label/spacing corrections, if any | GPT-6 Luna / low | Concrete edit with a direct screen check; no broad design judgment | Fix crosses component ownership or needs new design reasoning |

Shared rules settle first. Layout and remaining-surface work can then run in
separate chats with disjoint source files. Reserve one browser inspection slot
to avoid conflicting viewport/session changes. More reasoning is used only for
a named unresolved constraint; the existing director decides and returns a
bounded contract to the builder. Actual model/effort must be passed explicitly.

## Acceptance and completion

- Capture the current Layout problem as the before reference; compare the same
  state afterward. Inspect full warning text, chipset identity, action boundaries,
  expanded sections, aligned edges, and reclaimed control width.
- Check dark and daylight at wide desktop, 1280×720 laptop, roughly 750–900px
  split pane, and 390px phone; use actual narrow inspector widths too.
- Include long labels, large counts, offline/disabled states, empty lists,
  warnings, selected controls, open dialogs, keyboard focus and scrolling.
- No essential meaning hidden by truncation, collapsed parents or sticky panels;
  buttons and their focus indicators remain reachable and unobscured.
- Add focused red/green regressions for behavior and reachability changes; use
  screen evidence for cosmetic work rather than tests mirroring CSS declarations.
- One stable preview; one integrated checkpoint after the coherent batch.
  Completion report includes before/after screens and an honest coverage list.
- Preserve all existing work. No firmware, backend, flash, deployment or release
  operations are included in this proposal.

## Completed implementation and evidence

Shared controls now use semantic idle, hover, selected and disabled tokens in
both themes. Representative rendered-color measurements: faint text 4.72:1 dark /
5.88:1 daylight; control edge against panel 3.77:1 /4.56:1; selected text 9.71:1 /
10.98:1; primary text 4.75:1. These are representative measurements, not a claim
that every color pair in every state was measured.

Layout removes the compound insets, gives the chipset a short name/voltage and
full accessible hint below, and keeps power review visible outside the fold.
The review button opens and focuses existing settings without changing them.
The focused test measures 289px selector width at 1280×720, versus the 207px
baseline. The shared selector also works in the new-layout starter on phone.

Screen-specific type/control/help rules updated for Card, Patterns, Lab,
Playlist, Show and Settings. Show's inline tiny text moved to named classes;
its real chip controls consume the shared tokens. Workshop's pale daylight
record warning now uses readable ink. Final manager screenshots caught two
residual defects: dim Add strip and phone project names crowded by actions.
Add strip now uses the shared states; narrow Projects rows show full names
above actions. Delete keeps readable text and a danger edge.

The existing Gallery, Workflow and Creative chats handled disjoint source
ownership on GPT-6 Sol/medium. Exact Add strip and project-row followups used
GPT-6 Luna/low. Additional ownership was explicitly limited to presentation in
lw-show.jsx, the .prod-local-note rule in v3-styles.css after its owner finished,
and project-row rules in v3-screens.css. No additional frontier director or
backend/firmware/persistence changes. Costs were not exposed.

One integrated checkpoint initially failed one existing hover-description
contract for the new power button. Corrected the button, focused contract 3/3
passed, and the checkpoint rerun passed all 2,473 tests plus production build.
Layout focused checks 2/2 and existing Card/creative continuity 5/5 passed.
Final cosmetic fixes were rebuilt; git diff --check passed. Unrelated tracked
diffs match the starting patch saved in /tmp/lightweaver-clarity-20260927.

Actual screen coverage: Layout 1280×720, approximately 800px split pane and 390px
phone in both themes, warning folded/open and hardware/custom mapping expanded;
Patterns desktop/phone both themes; Playlist populated desktop/phone; Show
desktop/phone dark and phone daylight; Card and Settings phone daylight;
Workshop desktop/phone daylight; Projects desktop daylight and manager's final
390px dark screenshot. Phone Projects screenshots exposed and then confirmed
the final name/action fix. This was representative UI coverage, not exhaustive
hardware or authenticated cloud-library proof. No physical light test occurred.

Saved regression screenshots: .claude/ux-screens/interface-clarity/layout-after.png
and phone-starter-after.png. The annotated user screenshot and initial live CUA
capture are the before reference; the saved after screenshots use test fixtures.
Live CUA also confirmed the same original 3000-LED project. Browser theme and
temporary viewport overrides restored. Existing stable preview remains on 4173.

Resumption: Adrian reviews the local preview; shipping requires a separate request.

## Follow-up refinement — 2026-09-27

Adrian requested another, more refined pass. Completed locally with two reused
Sol/medium owners and the existing director. Layout now uses single-layer toolbar
controls, consistent sentence-case headings, quieter separators and full selected
strip detail names. Shared and non-Layout styling removes decorative form grids,
illuminated heading dots and excess bevels; actual visual/measurement grids remain.
Show prose uses the UI font, and the oversized programmatic heading focus ring
was removed without suppressing interactive keyboard focus. The incumbent font
tokens are General Sans and Spline Sans Mono; no font assets or palette changed.

Verification: all 2,473 unit tests and production build passed; seven focused
Layout/Card/creative checks passed. Final style corrections rebuilt successfully.
Actual desktop/phone screens in both themes reviewed in bounded rounds, followed
by manager inspection of live Layout and saved Layout/Patterns screenshots.
Existing control contrast, recovered field width, settings action, and disclosure
behavior preserved. No backend, persistence, firmware or transport edits.

One required design detector scan returned four layout-transition warnings already
present in HEAD: mobile Lab preview/sheet detents, Show's audio meter heights, and
the compact pattern-card label reveal. These existing interaction mechanisms were
not rewritten during cosmetic refinement. The remaining grid advisory concerns
the intentional Lab visual-preview measuring grid. No new flagged pattern was
introduced. Detector output, checkpoint, focused log and initial patch are under
/tmp/lightweaver-refinement-20260927. The older PRODUCT/DESIGN palette/schema records
remain unchanged; current approved implementation was the visual authority.

## Resting control restraint — 2026-09-27

Adrian explicitly rejected the stronger repeated outlines as less classy.
Softened four shared resting/disabled edge tokens in Studio and Daylight while
retaining readable text, fills, selection and keyboard focus. This supersedes
the initial resting-edge contrast target; do not restore bright outlines to
every idle control. Build and diff check passed. Actual desktop Studio and phone
Daylight inspected; original theme and viewport restored. Final screenshot and
baseline are in /tmp/lightweaver-restraint-20260927. Local only.
