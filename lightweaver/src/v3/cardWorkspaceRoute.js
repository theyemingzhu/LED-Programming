// The route vocabulary itself lives in ../lib/studioRoute.js, with the rest of
// the routing rules and tests.
export {
  cardRouteFromHash,
  DEFAULT_CARD_SECTION,
  FIRST_RUN_CARD_SECTION,
  isCardSection,
} from '../lib/studioRoute.js';

// In-app card navigation intent: set by the shell when the user actively
// navigates to a Card section, consumed once by CardScreen so it can focus
// the section heading on arrival WITHOUT stealing focus on a direct page
// load (the difference between a11y and a race).
let pendingSectionFocus = false;
export function markCardSectionNavigation() { pendingSectionFocus = true; }
export function consumeCardSectionNavigation() {
  const value = pendingSectionFocus;
  pendingSectionFocus = false;
  return value;
}
