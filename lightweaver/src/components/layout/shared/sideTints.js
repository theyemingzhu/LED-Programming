// One quiet tint per symmetry side, shared by the inspector's side groups
// and the bands under each side's strips on the artwork, so a side reads as
// the same thing in both places. Low chroma: they mark membership, they are
// not strip identity colours.
const SIDE_TINTS = [
  'oklch(0.72 0.075 245)', // side 1: steel blue
  'oklch(0.76 0.085 65)',  // side 2: amber
  'oklch(0.74 0.07 160)',  // side 3: sage
  'oklch(0.72 0.075 340)', // side 4: rose
];

export function sideTint(index) {
  return SIDE_TINTS[((Number(index) || 0) % SIDE_TINTS.length + SIDE_TINTS.length) % SIDE_TINTS.length];
}
