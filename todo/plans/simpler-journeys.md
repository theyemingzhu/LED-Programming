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

## Build log (branch `claude/simpler-journeys-build`, on top of `claude/false-failures`)

Adrian: "build all nine cuts" (relayed 2026-11-21). One commit per cut, each
with an exact press-count assertion at 390 and 1280 px in
`lightweaver/tests/simpler-journeys.spec.ts` (now in `ci:browser-smoke` and
`test:release-ui`) and a "still reachable" test.

| Cut | Commit | Journey presses (phone / desktop) | Kept, and how it is proven |
|---|---|---|---|
| C1 Save to card ends the light check | e7ad2c0e | first setup 15 → 13 | "Place on artwork" opens Layout and writes nothing |
| C2 light test starts itself | 9c0d9585 | first setup 13 → 12; change count part of 4 → 2 | "No, restore working setup" restores; unconfirmed, the card puts its setup back; Real-timing 14 s restart into the test |
| C3 count saved from its row | 06f27939 | change count 3 → 2 | Layout's count editors unchanged; typing writes nothing |
| C4 temporary setup is not "a different project" | 2cc4e11d | first setup 12 → 11 | a real other project still asks, nothing written first |
| C5 "Found — pair" pairs | 224436e4 (+1a1df82c) | fresh browser 3 → 2 | once paired the chip opens the connection dialog |
| C6 Wi-Fi update opens on its start button | 5356f435 | card update 3 → 2 | binding sentence, grant checks and USB door shown; nothing starts unpressed |
| C7 rename in place | 3f9df51f | rename + save 4 → 3 | top-bar rename works; a rename writes nothing by itself |
| C8 last confirm saves | 5a88135c | first setup 11 → 10 | "Yes, and add another strip" keeps the first strip; counts move to the done screen |
| C9 no notice covers a button | 6285f806 | phone first setup: the cover press was already gone (58a29e0c) | every journey asserts no "close notice" press |
| Save project is a plain button | 9f524837 | — | still in the top bar, enabled |
| Back stays in Studio | 23212ae3 | — | Back from Playlist → Patterns → Card, never leaves |

### Decisions taken while building

- **C2 Real-timing.** `cardSimulator` gains `restartAfterActivateMs`: the card answers the activation, then is silent for it (real ~14 s) while it boots the candidate. Studio's 18 s wait for the test state covers it (passed 3/3). A first attempt silenced the card before it answered the activation; that is not how a real card behaves and was a test error, not a product one.
- **C2 "Cancel change" before the test.** It is no longer offered before the lights change, because the test starts on the owner's own Save. The same protection is "No, restore working setup" during the test, plus the card's own timed restore. A candidate resumed after a reload still waits for "Start light test".
- **C3 how the count is applied.** Card Home must not re-implement how a total is spread across drawn strips. The row hands the total to Layout's own setter (`lib/ledCountHandoff.js`, one-shot, stale after 15 s), which applies it, waits until Layout stops re-rendering, then opens the same Save to card. Without the wait the install cancelled itself ("The project changed after this card attempt was prepared"). The owner presses nothing on Layout; it passes through.
- **C3 lands on Patterns.** The install route every Save to card uses ends on Patterns after the confirm (`next=patterns`); a count change uses the same route rather than a second one.
- **C8 what the second confirm protected.** Nothing the first did not: each strip is confirmed at its own end marker, and Save there writes nothing to the card. Its counts list moved to the done screen; its "Add another strip" moved beside the last confirm.
- **C9 already fixed upstream.** 58a29e0c (another session) moved the power note and colour question into the page. C9 became a guard so it cannot return.
- **C5 failure path.** If pairing from the chip fails, the dialog opens and explains it; it does not fail silently.

### Specs red on the base branch (not caused by this batch)

Measured on `742ee685` in a clean worktree: `card-home-compact` U1a/U1b/U1d/U1e, `studio-hardening` 574/612/867, `setup-led-count` 145, `connect-simple` 90/135, `connection-center-quality` 221/266/283/336/364/384, `first-action-walk` 212/327/347, `patterns-playlist-compact` 154, `patterns-v3` 764, `multiple-output-journey` (fails at line 67 on base; this branch gets past it to line 120), `journey-count-save` F14 (fails under parallel load on base too), and `test:core:source` (`tests/card-bridge-handoff.mjs`, identical assertion on base).

## Mobile UI/UX

Branch `claude/mobile-ux` (on top of `claude/simpler-journeys-build`). One stylesheet, `lightweaver/src/styles/lw-phone.css`, loaded only by public Studio (`main.jsx`), so the signed card bundle is untouched. Desktop is unchanged; `tests/phone-shell.spec.ts` checks 390 px and 1280 px.

**Measured before (390×844, practice card, `tests/ux/phone-shell.measure.spec.ts`):** the rail took 58 px (15%) of every screen's width; top bar plus footer took 116–136 px of height, so screens got ~70% of the phone. During counting, a warning notice covered "Stop lights" inside the setup sheet. The footer's "Connected" repeated Card Home's status row, and its boxed "Card firmware 1432 → 2464" was a third door to the update.

**Approved by Adrian (2026-11-21), as one direction for the phone:**
1. The left rail becomes a bottom tab bar (Card, Layout, Patterns, Lab, Playlist, Show). Screens get the full 390 px.
2. The footer becomes one plain status line under the top bar: connection, card firmware, Studio build. No boxes, so it reads as status. Both build numbers stay visible.
3. Notices dock above the tab bar, and the screen (and the setup sheet) end where the stack begins. Screens are top-anchored, so only the bottom edge rises; nothing under the finger moves. `NoticeLayer.jsx` publishes `--lw-notice-stack-h` / `--lw-notice-reserve`.
4. The card setup sheet fills the phone; its safety footer is one row (was 150 px, now ~80).
5. Added by Adrian mid-build ("far too big … I'm not blind"): one smaller scale on every phone screen. Titles 17/15, panel padding 10–12, block gaps 8–10, button side-padding 12, no primary glow, no focus box around a focused title. The update screen now fits on one screen above the tab bar.

**Decisions:**
- Buttons keep the 44 px tap height. About 38 existing checks across 18 specs enforce it, and it is the phone tap minimum. Going lower (36 px) is Adrian's call, not done.
- Not on the phone: Workshop (Batch production needs USB, which phone browsers lack) and "Preview short strip" (a bench tool with its own row of controls).

**Rejected:**
- Hiding the footer on the phone entirely. `footer-build-status` protects both build numbers being visible on a phone, and Adrian reads them to check freshness.
- Moving notices into page flow. That was the original defect (the page shoved down under the finger); reserving ground at the bottom edge gets the same "never covers" result without moving anything.
- A hamburger menu for navigation. It hides where you are; tabs show it.

### Mobile UI/UX — resume note (held overnight, 2026-11-21)

**State:** branch `claude/mobile-ux`, pushed, tip `c422ef9e`, 7 commits on `claude/simpler-journeys-build` @ `74178281`. No PR. Not merged, not shipped. The audit session was told it is ready, to ship after the simpler-journeys batch. Held by the coordinator: no browser test runs or Studio-wide builds until it says so.

**Exactly what Adrian approved, in this session:**
1. "Yes, build it". This was his answer to the four-point direction shown as before/after phone screenshots: bottom tab bar instead of the rail; footer → one plain status line under the top bar with both build numbers visible; notices above the tabs with the screen ending where they begin; the light-check sheet edge to edge with a one-row Stop lights footer. Desktop unchanged; Workshop and "Preview short strip" not on the phone.
2. His correction mid-build: "some of the boxes and icons are far too big, and buttons far too big, and fonts … We're trying to get as much vertical room and horizontal room as possible … Look at update the card." He then said "go" to the read-back: one smaller scale on every phone screen, buttons kept at 44px, update screen to fit one screen.
3. "Why does the number 41 take up half the screen? … things that are very out of scale and alignment." Fixed with the one-scale pass and a test that guards it.

**Still open (Adrian's call):** shrinking buttons below the 44px tap height (38 checks enforce 44px). Asked, not answered.

**Last verified (before the hold):** `tests/phone-shell.spec.ts` 8/8; 22 related specs compared with base, no regressions; mobile config has the same 2 reds as base (pattern-lab-isolation:239, setup-phone:75).

**Resume point:** if the simpler-journeys branch has moved, rebase onto it. Then re-run `tests/phone-shell.spec.ts`, `notice-layer`, `playlist-timed`, `strip-discovery:407` and the mobile config. Then open the PR, or let the audit session ship it.

## Measured on Studio build 2623 (live), 2026-11-22

Re-measured on `origin/main` 7565de7b (nine cuts merged as #458; the mobile batch as #467, reverted in #469 and re-landed as #471), practice card Fast, `--workers=1`, alone on the lane. Phone 390 and desktop 1280 gave the same counts for every journey.

| Journey | Before | Predicted | Measured |
|---|---|---|---|
| First setup from a blank card | 16 / 15 | 10 | **10** |
| Change the LED count | 4 | 2 | **2** |
| Fresh browser picks up the card | 3 | 2 | **2** |
| Update the card | 3 | 2 | **2** |
| Rename and save | 4 | 3 | **3** |
| USB Wi-Fi setup (blank card) | 6 | 6 | 6 |
| Connect a remembered card | 0 | 0 | 0 |
| Card back after Wi-Fi drop | 0 | 0 | 0 |
| Pick a look | 2 | 2 | 2 |
| Save a look | 2 | 2 | 2 |
| Change and delete a look | 6 | 6 | 6 |
| Build and reorder a playlist | 6 | 6 | 6 |
| **All twelve** | **52 / 51** | **41** | **41 phone, 41 desktop** |

No measured count missed its target. One driver needed a fix on main: "Save a look" pressed "Install on card", which main now calls "Save to card" (glossary); the press count is unchanged.

Page: https://claude.ai/artifact/MLSTjcKs785q9zFF82hZcJ (real after-screenshots from build 2623).
