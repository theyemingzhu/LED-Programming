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

// Whether `project` currently carries real artwork — the SVG/path data a
// card reconstruction never has (see `reconstructInstalledCardState` in
// cardProjectAdoption.js, which builds strips from straight-line geometry
// only). `layout.svgText` is the one field every real Import-SVG path writes
// and a card readback never touches, so its presence is what actually
// completes a reconstruction — not a save, not a rename.
function hasRealArtwork(project) {
  return typeof project?.layout?.svgText === 'string' && project.layout.svgText.trim().length > 0;
}

// THE kind-selection rule (defect C1b / blueprint preservation matrix): "do
// not label reconstructed card configuration as a complete editable backup
// unless it contains the complete project." `association` is the caller's
// translated destination signals (cloud/browser/file/card), exactly what
// `ProjectsPanel`'s old inline `describeAssociation` computed. The partial
// check runs FIRST and overrides every destination, because the claim it
// guards against is about completeness, not location — saving a still
// artwork-less reconstruction to the browser, or exporting it to a file,
// does not make it a complete backup, so it must keep reading "partial"
// until real artwork exists. Once `hasRealArtwork` is true the marker simply
// stops applying; nothing has to go back and edit `project.origin`.
export function projectCopyKind(project, association = {}) {
  if (project?.origin?.kind === 'card-partial' && !hasRealArtwork(project)) {
    return 'card-partial';
  }
  const { activeRemoteProject, browserRecord, persistedDestination } = association;
  if (activeRemoteProject) return 'cloud';
  if (browserRecord) return 'browser';
  if (persistedDestination === 'file') return 'file';
  if (persistedDestination === 'card') return 'card';
  return 'none';
}
