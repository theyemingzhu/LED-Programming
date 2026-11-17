import { sideOfStrip } from '../../../lib/pieceSymmetry.js';

export function runSeparationMappingIssue(strip, symmetry) {
  if (!strip) return '';
  if (sideOfStrip(symmetry, strip.id)) {
    return 'Move this strip out of its symmetry side before separating runs.';
  }
  if (strip.kaleidoscope?.enabled === true) {
    return 'Turn off Kaleidoscope for this strip before separating runs.';
  }
  return '';
}

// Splitting assigns one section to each existing run. Compare those ranges
// with the current zone, which may have joined adjacent runs on the same GPIO.
export function separationChangesPatternRanges(stripId, compiledWiring) {
  if (!compiledWiring?.ok) return false;
  const zone = compiledWiring.zones.find(item => item.id === stripId);
  if (!zone) return false;
  const runs = compiledWiring.runs.filter(run => run.type === 'strip' && run.source?.stripId === stripId);
  return runs.length !== zone.ranges.length || zone.ranges.some((range, index) =>
    range.start !== runs[index].start || range.count !== runs[index].count);
}
