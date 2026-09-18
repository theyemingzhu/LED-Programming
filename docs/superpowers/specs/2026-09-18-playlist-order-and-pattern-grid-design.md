# Playlist Order and Pattern Grid Design

## Goal

Make Playlist read like one deliberate operator instrument: a consistent ordered sequence on the left and a stable pattern library on the right. Replace the implementation-facing word **Dwell** with **Length**, accept decimal minutes, and preserve the existing integer-second project and card contract.

## Chosen direction

Use a compact **instrument table plus ordered tile grid**.

Playlist rows share one geometry: reorder, ordinal/state, pattern preview, identity, Length, and actions. The circular sequence badge and mixed control heights go away. Pattern Pool renders the complete canonical pattern bank in a fixed row-major grid of equal tiles, including patterns already in the playlist, so adding one pattern does not reshuffle the library. An added tile has a selected state rather than disappearing.

This direction was chosen over:

- a denser spreadsheet, which would scan quickly but make touch use and pattern identity too weak;
- a larger storyboard of visual cards, which would be expressive but waste the professional tool's working area and compete with the artwork.

## Playlist semantics and data contract

- Each look continuously loops for its **Length**, then fades into the next enabled look. The sequence wraps from the last look to the first.
- The screen explains that behavior once near the playlist timing controls rather than repeating it in every row.
- The UI displays Length in decimal minutes. `0.5` means 30 seconds; `1.5` means 90 seconds.
- On commit, minutes are multiplied by 60 and rounded to the nearest whole second. Existing `dwellSeconds` persistence, normalization, installation payloads, and card firmware contract remain unchanged.
- Existing values are formatted in minutes with no unnecessary trailing zeros and enough precision to represent uncommon legacy second values without implying that stored data changed. Merely opening the screen must not rewrite a value.
- The existing 1–3600 second bounds remain authoritative, expressed to the user as approximately 0.02–60 minutes.
- Decimal entry uses an editable draft so values such as `1.` and `1.25` can be typed naturally. Empty or invalid drafts do not overwrite the last valid stored value; blur/Enter commits a valid value and Escape restores the persisted value.

## Playlist row system

Desktop rows use aligned columns:

`reorder | 01 / startup | preview | name and description | Length (min) | Live | more`

- All interactive controls use the same 36px height, 5px corner radius, border weight, and focus treatment.
- The reorder handle and overflow trigger are equal square controls. The ordinal is plain tabular type, not a circular badge.
- **Live** stays directly visible because it is the row's primary immediate action.
- **Duplicate** and **Remove** move into a row overflow menu. This preserves both actions while reducing repeated visual noise. Remove remains destructive, explicitly named, and never becomes the menu's default action.
- The full row keeps current drag-and-drop, touch drag, and Arrow Up/Down/Home/End behavior with the existing live announcement.
- A confirmed live row uses the existing functional accent and does not introduce a second decorative color.

At 640px and below, identity occupies the first line and Length plus actions occupy a deliberate second line. Touch targets become at least 44px. Controls must not clip, overlap, or require horizontal page scrolling at 390px.

## Pattern Pool grid

- Render every pattern from `DEFAULT_CARD_PATTERN_BANK` in canonical order; use CSS Grid with equal-height, equal-width tiles and row-major flow. No masonry and no content-sized pills.
- Use two columns in the current desktop aside. Collapse or expand responsively from the available width; retain at least two columns at the 390px full-width phone layout when labels fit without horizontal overflow.
- The whole tile is the add target. At rest it shows the palette sample and pattern name. Hover and keyboard focus reveal an **Add** cue through border/background/text treatment; no repeated visible plus icons.
- A tile already present in the playlist stays in place with `aria-pressed="true"`, a restrained selected treatment, and a visible **Added** state. Activating it previews that pattern with the existing live-preview path instead of adding a duplicate.
- Header copy reports the stable library total and how many patterns are in the playlist. Short helper copy makes the whole-card add behavior discoverable for touch users who have no hover.
- Duplicate/repeat remains the Playlist row action, so the library's selected state never ambiguously creates a second entry.

## Accessibility and interaction contracts

- Every Length field is labeled with pattern identity and minute units; validation/error copy is programmatically associated.
- Live remains a pressed toggle with the existing accessible name.
- The overflow trigger names its row, returns focus after selection or dismissal, closes on Escape/outside click, and exposes Duplicate and Remove as keyboard-operable menu items.
- Pattern tiles retain an explicit accessible action name (`Add …` or `Preview …; already in playlist`) and visible `:focus-visible` treatment.
- Selected, disabled, loading, drag, drop-target, card-connected, and recovery-pending states retain truthful feedback.

## Scope and file boundaries

Expected implementation files:

- `lightweaver/src/v3/lw-playlist.jsx`
- `lightweaver/src/styles/v3-playlist-console.css`
- `lightweaver/src/styles/v3-playlist-extra.css`
- focused Playlist browser tests under `lightweaver/tests/`
- a small browser-side duration helper and unit test only if natural decimal draft/commit behavior is clearer outside the component

No firmware source, card wire schema, `dwellSeconds` storage field, deployment workflow, or release artifact changes are in scope.

## Acceptance criteria

1. A persisted 30-second entry displays `0.5` minutes; entering `1.5` persists and installs exactly `90` seconds.
2. Decimal typing is natural, invalid or blank drafts cannot corrupt persistence, and legacy integer-second values survive untouched until explicitly edited.
3. The screen states that each look loops for its Length, fades to the next look, and wraps in order.
4. Every Playlist row uses aligned columns and one consistent control geometry. Desktop controls are 36px high; coarse/phone controls are at least 44px.
5. Live remains directly available. Duplicate and Remove remain keyboard/touch accessible through one consistently sized overflow control.
6. Mouse drag, touch drag, and Arrow/Home/End reorder behavior and announcements still pass.
7. Pattern Pool is an equal-card CSS grid in canonical pattern order. Adding a pattern leaves every tile in place and changes that tile to an Added state.
8. Pattern tiles have no always-visible repeated plus icon. Full-tile hover/focus and helper copy make Add discoverable; selected tiles expose Preview behavior.
9. Install still sends the exact integer-second playlist block; Play/Pause/Previous/Next, manual Live pause, card limits, saved looks, and status panels remain intact.
10. At 1280px and 390px, the Playlist remains before add-on panels, no row/action overlaps, no horizontal page overflow, and the pattern grid remains legible.
11. Focus indicators, accessible names, pressed/selected state, overflow dismissal, and minimum touch targets are verified.
12. Focused tests, one proportional checkpoint, production build, and actual desktop/phone screen inspection pass. No deploy or hardware operation occurs.
