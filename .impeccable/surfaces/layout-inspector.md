---
surface_brief_version: 1
slug: layout-inspector
primary_target: lightweaver/src/components/layout/modes/DrawModePanel.jsx
related_targets: ["lightweaver/src/components/layout/divide-strip.css"]
mode: Operate
---

# Layout inspector — density-first operator tool

Owner-approved refinement, 2026-09-28. The operator must see several strips and
layers together while editing a selected strip. This is an overview with bounded
selected details, not a large settings card for every strip. Preserve the live
Studio's dark/warm tokens and typography; the older global palette does not
authorize recoloring or retyping this surface.

- Place Add strip and the editable LED total on one compact row when they fit.
- Keep each strip's name, LED count, miniature, and current pattern/action
  scannable together. Reserve usable name space; never squeeze names to a letter.
- Group count, length, reel density, and GPIO/data direction/first-light controls.
  Compact means eliminating redundant rows, not making type smaller everywhere.
- Offer one primary Divide into sections flow, including two sections. Preserve
  connected-section editing and locked-layout reopening. Distinct independent
  strip splitting is a secondary action, clearly named as separate strips.
- Put Flip path, Reflection points, wire-order moves, duplicate, and remove under
  labeled More actions. Keep keyboard focus, Escape, and accessible names.
- Only the selected connected section expands its settings; other sections retain
  concise summaries. Keep Undo, save, count conservation, GPIO/run order, and
  pattern target identity. Local layout edits never write to the card.

Verify with 8 strips/layers and a 41-LED strip divided 11/10/10/10. Measure actual
row and selected-detail heights at a roughly 300px desktop inspector and a
390px phone. Check name readability, overflow, and accessible secondary actions.
Preserve phone touch targets. Keep before/after evidence; tests alone do not
prove information density.

Owner correction: Layout manages geometry and wiring, not color tags or
brightness. Do not revive the old artwork inspector above the strip editor.
Unmapped artwork has a named Create strip action; mapped artwork uses its strip's
single editor. Identify project-wide LED totals, data-wire groupings, the strip
whose settings are open, and each connected section's parent. No detached Update,
Flip, or Remove rows above the strip inventory.

First-pass interaction refinement: the list has one row per physical strip or
connected section, without numeric row prefixes. Each row edits its LED count
directly; Enter and blur commit, Escape discards, and plus/minus change one LED.
Changing a connected count re-slices its parent path and updates the project
total. The selected section alone opens its details, including count-derived
length, shared reel density, GPIO, data direction, first light, split/merge, and
family GPIO. The separate boundary field and repeated section navigation are
gone. A row's pattern action opens a visual gallery inside Layout; selecting a
pattern updates that section target only and returns focus to its trigger.
