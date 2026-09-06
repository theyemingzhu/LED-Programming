// The one place a "where is this project actually saved" label is composed
// from a copy-status `kind`. Extracted from `ProjectsPanel`'s inline
// `describeAssociation` (defect C-1 / blueprint row E11 — "Card storage,
// browser save and cloud save remain distinct states even when their buttons
// are consolidated") so the mapping is a pure, independently testable
// contract instead of JSX-local string logic.
//
// `kind` is a normalized discriminant, not a raw persistence/association
// value — callers translate their own state into one of these before calling
// in. Keeping the translation at the call site (not here) is what lets this
// function stay a pure lookup with no knowledge of ProjectContext shapes.
export const PROJECT_COPY_KINDS = Object.freeze([
  'cloud',
  'browser',
  'file',
  'card',
  'card-partial',
  'none',
]);

// A project rebuilt from a card's own `/api/status` + pattern/zone readback
// (Setup's "Use this card's project") is real evidence of what the card is
// currently playing, but it is NOT an editable copy of the artwork that
// produced it — the card never reports the original SVG/path data, only
// straight-line geometry and per-zone pattern parameters reconstructed into
// looks. The blueprint's preservation matrix is explicit: do not label a
// reconstructed card configuration as a complete editable backup unless it
// actually contains the complete project. Calling that state "Saved" or
// "Backup" (the way `browser`/`cloud`/`card` all read) would tell the owner
// their original design is safely archived when only a partial
// reconstruction exists — this kind exists so that claim is never made.
const LABELS = Object.freeze({
  cloud: detail => `Saved online as ${detail}`,
  browser: detail => `Saved in this browser as ${detail}`,
  file: () => 'Exported as a project file',
  card: () => 'Saved on the card',
  'card-partial': () => 'Card copy (partial — no artwork)',
  none: () => 'Not saved yet',
});

export function projectCopyLabel(kind, detail = '') {
  const build = LABELS[kind] || LABELS.none;
  return build(detail);
}
