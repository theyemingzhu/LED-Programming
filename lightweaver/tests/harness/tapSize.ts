// The smallest control Studio ships. Phones (≤640px) set --lw-tap to 36px
// (src/styles/lw-phone.css, Adrian 2026-11-23); everywhere else it is 44px.
// tests/phone-shell.spec.ts pins both sides exactly; other specs only need
// "no smaller than the smallest".
export const MIN_TAP = 36;
export const DESKTOP_TAP = 44;
