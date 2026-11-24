// Does this card want a touch? The ONE place that decides.
//
// Firmware 1.2.6 and later removes the touch and reports
// `capabilities.ownerNoTouch` (a version number, 1) in /api/firmware-info and
// /api/status. A card that reports it is never asked to be touched and Studio
// never says to. A card that does not report it (1.2.5 and older, or a report
// we could not read) behaves and reads exactly as before, so an old card still
// gets the instruction and still works.
//
// `card` can be any of what Studio holds for a card: the firmware-info
// evidence (`{ capabilities }`), the status readiness (`{ capabilities }` or
// `{ ownerNoTouch }`), a card link (`{ readiness }`), or an authority that
// carries one of those. Anything else, or nothing, counts as "needs a touch".

/** What to say when a card unexpectedly answers 403 "touch a card control to pair". */
export const OLD_CARD_TOUCH_SENTENCE =
  "This card's software is older and needs one press of a card control before it accepts this. Press any control on the card, then try again, or update the card.";

const reported = value => {
  const number = Number(value === true ? 1 : value);
  return Number.isFinite(number) && number >= 1;
};

export function cardReportsNoTouch(card) {
  if (!card || typeof card !== 'object') return false;
  return [
    card.ownerNoTouch,
    card.capabilities?.ownerNoTouch,
    card.readiness?.ownerNoTouch,
    card.readiness?.capabilities?.ownerNoTouch,
    card.evidence?.capabilities?.ownerNoTouch,
    card.cardEvidence?.capabilities?.ownerNoTouch,
  ].some(reported);
}

export const cardNeedsTouch = card => !cardReportsNoTouch(card);
