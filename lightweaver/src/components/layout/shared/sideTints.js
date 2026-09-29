// One quiet tint per symmetry side, shared by the inspector's side groups
// and the bands under each side's strips on the artwork, so a side reads as
// the same thing in both places. Low chroma: they mark membership, they are
// not strip identity colours. Kept clear of the warm amber that default strip
// colours and the accent use, so a band still shows around an amber strip.
const SIDE_TINTS = [
  'oklch(0.72 0.08 245)', // side 1: steel blue
  'oklch(0.76 0.08 170)', // side 2: sea green
  'oklch(0.80 0.07 100)', // side 3: pale olive
  'oklch(0.72 0.08 345)', // side 4: dusty rose
];

export function sideTint(index) {
  return SIDE_TINTS[((Number(index) || 0) % SIDE_TINTS.length + SIDE_TINTS.length) % SIDE_TINTS.length];
}
