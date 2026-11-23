# Look engine

Pure code that turns a **look** (a small saved record) into a colour for every
LED. No DOM, no randomness of its own, nothing that reads strips while
rendering: `renderLook(look, pieceMap, colours, t)` reads the look and the
piece map only. The piece map is exactly what a future card update receives.

Flow: `deriveAreas(strips)` -> `buildPieceMap` -> `renderLook`. Edits are in
`edits.js`, starting points in `variations.js`. Per LED the steps run in the
fixed order written at the top of `modifiers.js`.

## The split (decided with Adrian)
The pattern is the light; the look only adds how that light moves across an
area's copies and when the area begins. An area's `source` is one of Studio's
patterns (`patternLight.js`) or a colour journey, and its motion is a brightness
mask over it ("The whole pattern" is no mask). Areas will replace sections on
the Patterns screen later.

## Add a motion
1. In `motions.js`, add one object to `MOTIONS`: `{ id, label, params, level }`.
2. In `motions.test.js` nothing needs listing (the contract test reads the
   registry); add one case for what is special about it.
The "It plays" choices on screen read the registry, so it appears by itself.

## Add a modifier
1. Write a small pure `applyX` in `modifiers.js` and put it in the order list at the top.
2. Add its key and range to `normalizeArea` in `schema.js`.
3. Call it at the right step in `render.js`.
4. Add its tests in `modifiers.test.js` and a case to "each modifier changes the picture" in `render.test.js`.
5. Add its control to `components/layout/modes/LookDesignerControl.jsx`.

## Add a travel direction
1. Add the id to `DIRECTIONS` in `modifiers.js` and a branch in `applyDirection`.
2. Add its label to `DIRECTION_CHOICES` in `LookDesignerControl.jsx`.
3. Add a case to `modifiers.test.js`.

## Add a starting point
1. In `variations.js`, add an order to `ORDERS` if it needs a new begin pattern.
2. Add one entry to `startingLooks` (id, label, look).
3. Update the label list in `variations.test.js`.

## Limits worth knowing
- A piece map holds 8 areas and 31 copies of an area (`pieceMap.js` has the byte layout).
- Areas come from turning the piece about its centre. If strips do not match,
  each is its own area; `deriveAreas(..., { together })` is the hand-made path.
- The colour journey drifts with seconds, not breaths, so a look repeats
  exactly every breath only with a one-colour journey.
