# Round 2 UX critique — Patterns & Playlist (ticket U2)

Method: `critique` + `distill` applied as analytical lenses (deletion test, one-status-one-vocabulary, hierarchy) against the built screens, not their own default report templates — the deliverable shape below is the one the ticket asked for. Studio was driven against the card simulator through Playwright (`tests/u2-screens.spec.ts`, deleted before this ticket closes), never `npm run dev`. Read in full: `src/v3/lw-pattern.jsx`, `src/v3/lw-playlist.jsx`, `src/lib/cardAction.js`, `src/lib/footerFirmwareStatus.js`, `src/components/card/CardStatusControl.jsx`, `src/components/SetupJourneyChip.jsx`, `src/v3/v3-screens.css`.

**Screenshot caveat, stated once here rather than on every row:** this Mac is running a deliberate CPU-load harvest (load average 26-34 throughout this pass). Studio's card-link state machine depends on real `setTimeout`-scheduled pings landing in order to confirm a connection, and under this load it did not settle to `connected-*` inside a 4+ minute budget in several runs -- the footer sat on "Card restarted -- verifying" or "Not connected" the whole time. Screenshots were still captured (the ticket's own instruction: "screenshots are fine, timing measurements are not"), and in two cases that unsettled state is itself the finding (#1 and #7 below), not a test artifact -- it is a live reproduction of the bench's W1-1. Where a screenshot shows a state I did not intend to capture (bridge transport never reached `connected-bridge`; the card-blacked-out and playlist-playing screens did not render in the time available), it is named honestly below rather than mislabeled. Full-page capture also only reaches the app's own inner `.screen-scroll` container to roughly one viewport past the fold (Playwright's `fullPage` measures document height, and this app scrolls an inner div) -- so every screenshot shows the top of the screen, not necessarily its full length; finding #2 below is confirmed independently from source, not from the cut-off screenshot alone.

Screenshots referenced below live alongside this file in `$TMPDIR/u2/`.

---

## Ranked proposals

### 1. The same fact -- "has this reached the card yet" -- is said in three different vocabularies on the two screens Adrian is confused by

**Screen and state:** Patterns idle, and Playlist idle (both connecting/verifying).
**What the owner sees now (verbatim copy):**
- Pattern bank playbar: **"Previewing in Studio"** (amber pill) -> becomes "Sending to Lightweaver" -> "Applied by Lightweaver runtime" (`cardActionStatusLabel`, `src/lib/cardAction.js:169-173`, rendered at `src/v3/lw-pattern.jsx:2489`).
- The Design target card, four lines below the same screen: **"Selected in Studio"** -> "Sending to card" -> **"On the card now"** for the identical underlying state (`src/v3/lw-pattern.jsx:2596-2601`).
- Playlist's card-address row: the SAME `cardActionStatusLabel` again -- "Previewing in Studio" (`src/v3/lw-playlist.jsx:869`).
- Playlist's own "On the card now" panel, "Playing" stat: **"no live look sent"** / **"live preview confirmed"** (`src/v3/lw-playlist.jsx:971-973`) -- a THIRD vocabulary for the same three-state idea.
**The confusion it causes:** this is very likely the mechanism behind the bench note "'Previewing in Studio' vs 'On my piece'" -- those two phrases are not actually opposites (one is send-status, the other is which physical LEDs are shown), but they sit inches apart using overlapping words ("Studio", "piece", "card"), and the send-status idea alone has three different names depending which panel you're looking at.
**The change, one sentence:** adopt `cardActionStatusLabel`'s three words everywhere this fact is shown -- replace the Design target card's "Selected in Studio / Sending to card / On the card now" and Playlist's "no live look sent / live preview confirmed" with "Previewing in Studio / Sending to Lightweaver / Applied by Lightweaver runtime".
**Deletion test:** does the second and third vocabulary make Adrian move faster -- no, it costs him a re-read each time the words change. Would anything break if it vanished -- no, the single shared label already exists and is already imported into both files. Will he understand why there are three phrasings in six months -- no.
**Tag:** SAFE (copy consolidation onto an existing shared function; no surface, flow, or control changes).
**Files:** `src/lib/cardAction.js:169-173`; `src/v3/lw-pattern.jsx:2489`, `2596-2601`; `src/v3/lw-playlist.jsx:869`, `971-973`.
**Screenshots:** `patterns-idle-desktop.png` (both Patterns vocabularies visible at once -- amber "Previewing in Studio" pill top-left of the bank, "SELECTED IN STUDIO" in the Design target card, right of center), `playlist-idle-desktop.png` ("Previewing in Studio" in the Card address row, "no live look sent" in the On the card now panel).

### 2. A mobile CSS rule written for Patterns' preview also fires on Playlist, burying the actual playlist under two add-ons

**Screen and state:** Playlist, phone width (390px), idle.
**What the owner sees now:** header, toolbar, then **Saved looks** and **Pattern pool** immediately -- the reorderable **Playlist order** list and the **On the card now** status panel (installed/playing/slots-left) do not appear in the same screen's worth of content.
**The confusion or tax it causes:** on a phone, "what's the dial going to do right now" (Playlist order + On the card now) is the entire reason to open this screen, and it is not what appears first -- two utility panels for ADDING more things to the playlist are shown before the playlist itself.
**Root cause, confirmed in source:** `src/v3/v3-screens.css:930-931` -- `.pm-aside > .card.pm-pane { order: -1; }` / `.pm-main { order: 0; }` inside the narrow-viewport media query. `.pm-aside`, `.pm-main` and `.card.pm-pane` are the SHARED layout classes for both screens (`src/v3/v3-screens.css:730,800`). On Patterns, this correctly floats the live LED preview above the pattern bank on a phone -- a sensible read-this-first call. On Playlist, the identical selector matches its OWN two aside cards (Saved looks, Pattern pool) and floats them above Playlist's main column for the same structural reason, with no awareness that Playlist's aside holds secondary "add" tools, not the thing to look at first.
**The change, one sentence:** scope the `order: -1` rule to the pane that's actually meant to float (e.g. a `.pm-preview-pane` class already used at `lw-pattern.jsx:2617`) instead of every `.card.pm-pane` inside `.pm-aside`, so Playlist's aside stays in document order on a phone.
**Deletion test:** does floating Saved looks/Pattern pool above the playlist make Adrian move faster -- no, it adds a scroll past two panels he didn't come for. Would anything break if the rule stopped applying to Playlist -- no, Patterns keeps its own (deliberate) behavior. Will he understand why the order flips in six months -- no, nothing marks this as Patterns-only.
**Tag:** SAFE (CSS selector scoping; no surface, flow, or control change).
**Files:** `src/v3/v3-screens.css:918-931` (the rule), `src/v3/lw-playlist.jsx` (`.pm-aside` panels at ~940-976), `src/v3/lw-pattern.jsx:2617` (`.pm-preview-pane`, the class the rule should probably target).
**Screenshots:** `playlist-idle-phone.png` (Saved looks + Pattern pool, no playlist rows in view) vs `playlist-idle-desktop.png` (correct order: Playlist order -> On the card now, aside on the right) for comparison.

### 3. The pattern bank's own header count can read as broken ("shown" exceeding "chip-ready") -- bench already caught this exact failure

**Screen and state:** Patterns, idle, "All" category.
**What the owner sees now:** `132 shown of 132 chip-ready . 0 mixes . 0 in playlist` -- matches in this fixture because it holds no saved looks or custom patterns, but the bench report recorded `134 shown of 132 chip-ready` (shown EXCEEDING the total) on Adrian's real project, which does hold extras.
**Why, confirmed in source:** the header's `filtered.length` (`src/v3/lw-pattern.jsx:2473`) counts across `ALL = [...realMixes, ...customPatterns, ...REAL_PATTERNS]` when the "All" chip is selected, but it's divided against `REAL_PATTERNS.length` alone -- any saved look or custom pattern present pushes "shown" above "chip-ready" the moment they exist. Twenty-one lines later, a SECOND, correctly-scoped count sits directly underneath it: `{Math.min(visibleCount, filtered.length)} of {filtered.length} shown` (`src/v3/lw-pattern.jsx:2494`, the `pt-count` span next to the category chips) -- two "N of M shown" sentences, a few pixels apart, counting different things.
**The change, one sentence:** either count `filtered.length` against `ALL.length` in the header (so "shown" can never exceed its own total) or drop the header's redundant count entirely and keep only the category-row's `pt-count`, which already does this job correctly.
**Deletion test:** does the header count, as currently computed, make Adrian move faster -- no, it's actively misleading when non-zero mixes exist. Would anything real break if it was removed -- no, the identical fact (filtered vs. shown) is already stated correctly one module down. Will he understand the discrepancy in six months -- this is the literal bug from the bench notes, so evidently not.
**Tag:** SAFE (arithmetic/redundancy fix, no surface or flow change).
**Files:** `src/v3/lw-pattern.jsx:2473` (bugged header count), `:2494` (the correct duplicate directly below it).
**Screenshots:** `patterns-idle-desktop.png` ("132 shown of 132 chip-ready" header, "24 of 132 shown" pt-count visible a few lines down in the same panel).

### 4. The "not ready" refusal toast floats over -- and hides part of -- the Design target card underneath it

**Screen and state:** Patterns, a chip tapped while the card is not confirmed-ready (F20's exact refusal, reproduced live here because the host's load kept the simulated card from settling).
**What the owner sees now (verbatim copy):** "That tap was not sent to the card. This card is not ready for pattern commands. Recover and verify it before sending lights." -- rendered as a floating card that overlaps the Design target panel beneath it, covering the **Pixels driven** figure and most of the **Layer mix** row (name field + Save look button visible only at the far edge).
**The confusion it causes:** the owner is trying to read "what is this section actually driving" (Pixels driven) or trying to save the mix they were just building, and a refusal about a DIFFERENT action (the tap that failed) sits on top of it, blocking both until dismissed.
**The change, one sentence:** give `pattern-gate-notice` its own reserved space above the Design target card (push content down) instead of an absolutely-positioned overlay, matching how the recovery-confirmation box already reserves in-flow space a few lines above it in the same file.
**Deletion test:** does the overlay make Adrian move faster -- no, it hides the row he needs to finish the "Save look" errand he was already mid-way through. Would anything break if it stopped overlapping -- no, the notice's content and single action stay identical. Will he understand why a repair message is sitting on top of an unrelated pixel count in six months -- no.
**Tag:** SAFE (layout/positioning fix; the notice's content, tone and single action are untouched).
**Files:** notice publish at `src/v3/lw-pattern.jsx:2299-2312` (`pattern-gate-notice`); the panel it covers, `src/v3/lw-pattern.jsx:2560-2600` (`.pm-target` / `.pm-targetcard`).
**Screenshots:** `patterns-chip-selected-desktop.png`, `patterns-tune-advanced-desktop.png`, `patterns-chip-tune-phone.png` (all show the same overlap; the phone shot shows it re-covering content again after a scroll).

### 5. "Recover lights" and "Repair LED" are the same function under two names, one prominent and one three clicks deep

**Screen and state:** Patterns toolbar (any state) vs. the "Card tools" menu.
**What the owner sees now:** the toolbar's **Recover lights** button (styled primary the moment the card is blacked out) and, inside "... Card tools", a menu item that reads **Repair LED** -- both call the identical `repairLed()` handler (`src/v3/lw-pattern.jsx:1969`).
**The confusion or tax it causes:** ties directly to the bench note "Recover lights hidden" -- the button is conditionally rendered only `{connected && ...}` (`lw-pattern.jsx:2359`), so in exactly the states where the connection is uncertain (the state captured in every screenshot in this pass), the prominent button disappears and the only remaining path to the same repair is a differently-named item buried in a "..." menu.
**The change, one sentence:** delete "Repair LED" from the Card tools menu -- Recover lights already owns this job, and a second name for an identical action is confusion, not redundancy-as-safety-net.
**Deletion test:** does having it twice, under two names, make Adrian move faster -- no, it makes him wonder if they do different things. Would anything real break if "Repair LED" vanished from the menu -- no, the toolbar button (and Card Home's own Recover lights, per THINKING.md 2026-08-31) already cover it. Will he understand why the menu has a differently-named repair action in six months -- no.
**Tag:** SAFE (removes a duplicate control; the surviving control and its behavior are unchanged).
**Files:** `src/v3/lw-pattern.jsx:2360` (Recover lights, toolbar), `:2417` (Repair LED, Card tools menu), `:1969` (shared `repairLed` handler).
**Screenshots:** `patterns-idle-desktop.png` (toolbar has no Recover lights button in this not-yet-connected state -- visible gap between "Shift colors" and "Open card page" where it would sit once connected -- and "Card tools" is the only surviving repair path on screen).

### 6. "On the card now" names two different things depending which screen you're on

**Screen and state:** Patterns' Design target card vs. Playlist's dedicated panel.
**What the owner sees now:** on Patterns, "On the card now" is a live, per-tap status VALUE that appears only once a preview is confirmed (`lw-pattern.jsx:2597-2599`). On Playlist, "On the card now" is a static PANEL TITLE for a group of three durable stats (looks installed, playing, slots left) that stays on screen regardless of any single tap (`lw-playlist.jsx:952-954`).
**The confusion it causes:** the identical three words mean "this one tap just landed" in one place and "this panel is about durable card state" in another -- a phrase that should be a stable landmark (a panel title) is also being used as a transient status value elsewhere.
**The change, one sentence:** rename the Patterns per-tap confirmed-state label (currently reusing "On the card now") to something that reads as momentary, e.g. "Confirmed on card", and reserve "On the card now" for Playlist's panel title.
**Deletion test:** does reusing the phrase help Adrian move faster -- no, it costs a re-orientation every time he switches screens. Would anything break if the wording diverged -- no, they're already two separate literals in two separate files. Will he remember which meaning applies where in six months -- unlikely, given they're spelled identically.
**Tag:** SAFE (copy-only).
**Files:** `src/v3/lw-pattern.jsx:2597-2599`; `src/v3/lw-playlist.jsx:952-954`.
**Screenshots:** `patterns-idle-desktop.png` (Design target card, right-hand stat), `playlist-idle-desktop.png` ("ON THE CARD NOW" panel heading).

### 7. The footer can sit on "Card restarted -- verifying" indefinitely while the rest of the screen already looks fully live and clickable

**Screen and state:** Patterns idle -- footer identity chip vs. the pattern bank and Design target card.
**What the owner sees now:** footer reads "Lightweaver . Card restarted -- verifying" (amber dot) for the entire session, while at the same moment the pattern bank is fully populated (132 patterns), Aurora is already highlighted as selected, sliders show live values, and every tile looks tappable.
**The confusion it causes:** this is W1-1 -- Studio's own verifying/reconnecting language does not visibly gate the rest of the screen, so the screen invites exactly the tap that F20's refusal toast then rejects ("That tap was not sent to the card"). The mismatch between "footer says not ready" and "everything else says ready" is the setup for that surprise, not a one-off.
**The change, one sentence:** while the footer reads anything other than "Connected", visibly soften the pattern tiles and Install/Recover buttons (not full disable -- a dimmed, clearly-pending state) so the screen's own confidence matches the footer's.
**Deletion test:** N/A -- this doesn't remove an element, it's a state that needs a genuine product decision (how long "verifying" is allowed to last before the UI should stop pretending to be ready, and what the pending visual should look like) rather than a copy or reflow fix.
**Tag:** NEEDS-ADRIAN (changes how a whole screen behaves during a connection state, not a copy or layout tweak).
**Files:** `src/components/card/CardStatusControl.jsx` (footer label source), `src/v3/lw-pattern.jsx` (pattern bank/tiles render unconditionally on connection state).
**Screenshots:** `patterns-idle-desktop.png`, `patterns-idle-phone.png` (footer chip vs. fully-rendered bank in the same frame).

### 8. Playlist's "Copy chip config" sits inside a `pm-menu` wrapper with no menu -- leftover markup from Patterns' real dropdown

**Screen and state:** Playlist toolbar.
**What the owner sees now:** a single plain button ("Copy chip config") wrapped in `<div className="pm-menu">` (`lw-playlist.jsx:832-834`) -- the exact class Patterns uses for its real "Card tools" dropdown (`lw-pattern.jsx:2408-2422`), but here it wraps one button with no `aria-haspopup`, no chevron, no popover state.
**The confusion or tax it causes:** none visibly today (it renders as an ordinary button), but it's dead/misleading structure that the next person to add a second Playlist tool will either duplicate blindly or trip over, and any shared `.pm-menu` styling change made for Patterns' real dropdown risks silently reshaping this orphaned wrapper.
**The change, one sentence:** drop the `pm-menu` div and render "Copy chip config" as a plain toolbar button like "Download" and "Open card page" beside it.
**Deletion test:** does the wrapper make Adrian move faster -- no, it's invisible to him either way. Would anything break if removed -- no, the button's behavior is unchanged. Will a future edit misread this as a real menu -- plausible, which is the actual cost.
**Tag:** SAFE (dead markup cleanup, zero visible change).
**Files:** `src/v3/lw-playlist.jsx:832-834`.
**Screenshots:** `playlist-idle-desktop.png` ("Copy chip config" in the toolbar, indistinguishable from an ordinary button -- the issue is only visible in source).

---

## What must stay

- **SetupJourneyChip's self-removal.** It renders nothing once the owner's setup is actually finished, and nothing at all until the exact card is connected -- no nagging a disconnected browser with setup language it can't verify (`src/components/SetupJourneyChip.jsx:26-32`).
- **The notice layer's single-message discipline.** Multiple effects deliberately stand down rather than stack a second box repeating the same fact (documented inline at `lw-pattern.jsx:2225-2231`) -- the pattern is right even where its ONE instance needs repositioning (#4 above).
- **"Every tap sends" -- the removed preview-toggle checkbox.** The code comment at `lw-pattern.jsx:2483-2486` records a genuine deletion-test pass already applied: an "off" state that only ever produced taps that looked broken was removed rather than kept as a hedge. Don't re-add it.
- **Card-blackout notice tone.** Deliberately `info`, not `error`, with no second action competing with the toolbar's own Recover lights button (`lw-pattern.jsx:2320-2334`) -- restraint already correctly applied; keep it when fixing #5.
- **Category chips + search on the pattern bank.** Text-only, no icons, immediately actionable -- matches the visual-taste rules as built.

---

## Contradictions

- **Same fact, three vocabularies** (see #1): "Previewing in Studio / Sending to Lightweaver / Applied by Lightweaver runtime" vs. "Selected in Studio / Sending to card / On the card now" vs. "no live look sent / live preview confirmed" -- one underlying three-state fact, three sets of words, two screens.
- **Same three words, two meanings** (see #6): "On the card now" is a live per-tap value on Patterns and a static panel title on Playlist.
- **Same job, two controls, two names** (see #5): Recover lights (toolbar, prominent) and Repair LED (Card tools menu, buried) both call `repairLed()`.
- **Same sentence shape, two counts, adjacent** (see #3): "132 shown of 132 chip-ready" (header, can exceed its own total) and "24 of 132 shown" (pt-count, correct) a few pixels apart in the same panel.
- **Minor, not ranked:** the preview-target prev/next stepper and the native `<select>` both drive the same "which physical target am I previewing" state (`lw-pattern.jsx:2612-2657`). Defensible as complementary (step vs. jump), but worth a second look if #1-#3 open a broader pass on this panel.
