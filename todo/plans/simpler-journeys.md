# Simpler journeys — measured presses and code-proven cuts

Measured 2026-11-21 on the card simulator (`tests/harness/cardSimulator.ts`) at 1280 px and 390 px. Page with before/after strips: https://claude.ai/artifact/MLSTjcKs785q9zFF82hZcJ

**Status:** proposal only. Nothing in `lightweaver/src` was changed. Adrian picks cuts from the page; building them is a later task.

**Totals:** 52 presses on a phone across 12 journeys → 41 after the nine cuts (desktop 51 → 41). No capability is removed.

**How it was measured.** `tests/ux/journeyRecorder.ts` wraps every owner press. Before each press it records the screen, the visible word count, the visible primary buttons and the visible choices, and saves a screenshot. A notice covering a button costs a counted press to close. Re-measure after building a cut with:

```bash
cd lightweaver && LW_UX_OUT=$PWD/../.claude/ux-journeys npx playwright test tests/ux --workers=1
```

Each spec calls `guardRealCard()` first, so no request can reach the real card at 192.168.18.70. Chromium has to run outside the Claude sandbox.

## Cuts, ranked by presses saved

### C1 — Counting ends with "Save to card", not "Continue to Layout" (saves 2)

- **Journeys:** first-setup
- **Now:** After counting, the light check’s only primary is "Continue to Layout". The owner then has to find Card again and press "Save to card".
- **Why the code allows it:** Layout gates nothing. setupJourney.js:304-312 marks the layout phase "optional" and never current. Discovery already places the strip (journey-j01.spec.ts records starterPending:false before Layout opens). StripDiscoveryPanel.jsx:1823-1842 still says "place the lights in the artwork before the final test", with Layout as its only button.
- **Kept:** Layout stays one press away: a secondary "Place on artwork" on the same screen, and the Layout door on Card Home.

### C2 — The light test starts on its own after the owner presses Save (saves 2)

- **Journeys:** first-setup, change-count
- **Now:** Save stages the new wiring. The owner then presses "Start light test", then "The lights look correct".
- **Why the code allows it:** CardPushControl.jsx:817 shows "Start light test" as a separate press. Nothing between staging and that press needs the owner. The card keeps its last working setup and restores it unless a person confirms (comment at CardPushControl.jsx:806-812).
- **Kept:** The confirm stays a deliberate press. "No, restore working setup" and the card’s own timed restore are unchanged.

### C3 — The LED count is edited in its own row on Card Home (saves 1)

- **Journeys:** change-count
- **Now:** On an installed card, "Change count" sends the owner to Layout, a detour through a second screen.
- **Why the code allows it:** The row stepper already exists but is withheld for an installed, matching card (CardFacts.jsx:203, lw-setup.jsx:762). The install reads only the count and pin (THINKING 2026-09-11).
- **Kept:** Layout’s count editors stay. The row writes the same value through the same Save to card.

### C4 — Studio’s own temporary setup is not treated as "a different project" (saves 1)

- **Journeys:** first-setup
- **Now:** After counting, Save shows "This card holds a different project" and asks for a second Save.
- **Why the code allows it:** CardInstallAction.jsx:129-130 sets differentProjectOnCard whenever the card’s project id differs. The temporary setup Studio itself put on the card carries the bench id (lib/benchConfig.js), so the check catches it.
- **Kept:** A real other project on the card still gets the replace question.

### C5 — The "Found — pair" chip pairs when pressed (saves 1)

- **Journeys:** fresh-browser-pickup
- **Now:** On Patterns in a fresh browser, the chip opens a dialog. The owner then presses "Connect".
- **Why the code allows it:** The chip only opens the dialog (app.jsx:1592-1614, CardStatusControl.jsx:41). findAndConnectCard already pairs a found card in one step (cardFind.js:100-106). Card Home’s "Pair this card" uses it (lw-setup.jsx:824).
- **Kept:** The connection dialog stays one press away from the chip once it is connected.

### C6 — "Start secure Wi-Fi update" is the first button on the update screen (saves 1)

- **Journeys:** card-update
- **Now:** "Update over Wi-Fi" only reveals one sentence and the real start button.
- **Why the code allows it:** It runs setConfirming(true) and nothing else (lw-flash.jsx:1000-1006). start() never reads `confirming` (lw-flash.jsx:771-774). It needs only the release and the update grant.
- **Kept:** The sentence about binding the update to this card shows above the button. Grant checks are unchanged.

### C7 — The project name is editable on an installed card’s Card Home (saves 1)

- **Journeys:** rename
- **Now:** The name is read-only. The owner presses "Review checks" first, only to make it editable.
- **Why the code allows it:** lw-setup.jsx:1208 renders a plain <strong> while installedHome is true. The rename input and setProjectName exist one branch below.
- **Kept:** The top-bar name on Layout still renames. Save to card still carries the name to the card.

### C8 — "Yes, that is the last one" saves when there is one strip (saves 1)

- **Journeys:** first-setup
- **Now:** "Yes, that is the last one", then a second screen whose primary is "Save what we found".
- **Why the code allows it:** The record screen (StripDiscoveryPanel.jsx:1729-1745) exists to offer "Add another strip". With one strip found, it repeats a count the owner has just confirmed.
- **Kept:** "Add another strip" moves to the end-marker step as a secondary button.

### C9 — Notices never sit on top of the step’s own button on a phone (saves 1, phone only)

- **Journeys:** first-setup
- **Now:** At 390 px, the 2000 mA notice covers "Check the last LED", so the owner has to close it first.
- **Why the code allows it:** Measured: the press was intercepted (first-setup, 390, step 10). The notice layer (components/NoticeLayer.jsx, styles/lw-notice.css) stacks over the overlay body.
- **Kept:** Same message, placed above the overlay footer or folded into the step’s text.

## On every screen

- **Every screen has two primaries, because "Save project" is one.** The top-bar Save project renders as a primary on every screen (app.jsx:472). It is a browser save, and autosave already covers it (lw-playlist.jsx:355-363). Every journey counted it. Kept: It stays in the top bar as a plain button.
- **Back leaves Studio.** Every screen change replaces the history entry instead of adding one (app.jsx:1050-1052 → studioRoute.js:187). On a phone, the system Back gesture exits to the previous site, and the owner reconnects on return. Kept: Push for screen changes, keep replace for section and parameter changes. The URL stays the single source of the current screen (THINKING 2026-08-07).

## Two controls for one thing (no press saved, one fewer wrong choice)

- Three doors to the same update screen: Card Home "1432 → 2407" (lw-setup.jsx:1186), "Update card" in the facts row (CardFacts.jsx:243), and the footer firmware chip (app.jsx:547).
- Seven editors for one LED count: Card Home row (CardFacts.jsx:181), the typed-count form (lw-setup.jsx:778), Layout Project LEDs (DrawModePanel.jsx:1383), per-strip LEDs (:1428), new-strip LEDs (:995), layer LEDs (:1351), and discovery (StripDiscoveryPanel.jsx:1695).
- Five "save to card" buttons that do not share one function: Layout (LayoutScreen.jsx:575), Patterns (lw-pattern.jsx:2120), Playlist (lw-playlist.jsx:707), Card Home (CardInstallAction.jsx:225), and Preferences (lw-settings.jsx:415).
- Two connect actions in one place: the "Found — pair" chip and the dialog’s "Connect", which both end in pairDiscoveredCard (CardConnectionCenter.jsx:368-380).
- Two renames: the Card Home name (lw-setup.jsx:1224) and the top-bar crumb (app.jsx:454). Both call setProjectName; showProject decides which one appears (app.jsx:2404).

## Journeys

| Journey | Presses now (desktop / phone) | After | Cuts |
|---|---|---|---|
| First setup from a blank card | 15 / 16 | 10 / 10 | C1, C2, C4, C8, C9 |
| Change the LED count | 4 / 4 | 2 / 2 | C3, C2 |
| A fresh browser picks up the card | 3 / 3 | 2 / 2 | C5 |
| Update the card | 3 / 3 | 2 / 2 | C6 |
| Rename the project | 4 / 4 | 3 / 3 | C7 |
| Wi-Fi setup over USB (blank card) | 6 / 6 | 6 / 6 | — Every press guards something: the browser’s own USB picker, an erase consent, the card tab the bridge needs, and the restore that THINKING 2026-08-31 keeps manual. One clarity fix, which saves no press: a Card Home with no card answering has no primary pointing at USB setup, so "Card software" is a guess. |
| Connect a remembered card | 0 / 0 | 0 / 0 | — It connects by itself in about 3.5 s. |
| A card comes back after falling off Wi-Fi | 0 / 0 | 0 / 0 | — It reconnects by itself (useCardStatus.js:108-129 retries on a timer, when the browser comes back online, and when the tab regains focus). Not modelled: a card that has moved to its setup network. The simulator answers on one host only. |
| Pick a look | 2 / 2 | 2 / 2 | — Patterns tab, then tile. The tile plays on the card within 300 ms. |
| Save a look to the card | 2 / 2 | 2 / 2 | — Patterns tab, change it, Install on card. On a matching card no light test is needed. |
| Change and delete a saved look | 6 / 6 | 6 / 6 | — Patterns → Project stacks → Edit → change → Save changes → More actions → Delete. Each press is the owner’s own decision. The only soft spot is the Project stacks tab, which hides saved looks one level down. |
| Build and reorder a playlist | 6 / 6 | 6 / 6 | — Playlist tab, three adds, one drag, then install. One press per decision. |

## Decisions logged

- **Colour check stays at two answers.** `todo/plans/color-order-two-tap.md` already proves two answers fully determine the order. A single 6-swatch pick would need the card to show three colours at once, which is a firmware change.
- **USB Wi-Fi setup keeps all its presses.** Each guards something real: the browser's own USB picker, the erase consent, the card tab the bridge needs, and the manual restore THINKING 2026-08-31 decided to keep.
- **First setup is measured via Layout**, because that is the only primary the light-check screen offers. The "Install and open Patterns" button behind the overlay is covered by it, so a first-time owner cannot press it.
- **Known friction not reproduced here:** "0 of 3 done" on a connected card, and the five buttons on the temporary-setup Card Home. The measured paths did not land on those states. Re-check them with `cardState('provisional')`.
- **Wi-Fi recovery modelled as card offline → back online** on the same host. A card that has moved to its setup network (192.168.4.1) is not modelled, because the simulator answers on one host.
