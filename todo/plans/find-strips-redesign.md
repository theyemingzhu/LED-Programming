# Find my strips — redesign, three directions (design only)

**Status:** design, not built. Adrian picks a direction; building it is a later task.
**Comparison page:** https://claude.ai/artifact/RYq3ii4NvNyYiyhMhDXowq (today's real screens beside the three directions, phone and desktop).
**Owner of the code this would change:** lightweaver-app agent (`lightweaver/src/**`). Nothing under `lightweaver/src` was edited for this plan.
**Coordinate with:** "Simpler journeys" (PR #458) is cutting presses in first setup and edits `StripDiscoveryPanel.jsx`. Build after it lands, on top of it.

Adrian's brief (2026-11-22): too much writing; no list of GPIO buttons; use the card drawing to select where the lights are.

## 1. What exists (surveyed in source)

### Where the flow lives
- Dialog shell: `lightweaver/src/components/card/CardSetupOverlay.jsx` — title "Count your lights" (:190), subtitle "Find the strip. Read the markers. Save the count." (:191), Minimize (:194), Stop lights (:230), "Your card stays connected when you close this." (:241), Disconnect card (:250).
- Steps: `lightweaver/src/components/card/StripDiscoveryPanel.jsx` (1908 lines), phases `idle → bench-install → probe (colour check) → decade (count) → end-marker → record → done`.
- Card drawing: `lightweaver/src/components/card/CardPinMap.jsx` (68 lines, display only, no taps) + `lightweaver/src/lib/cardPinout.js` (both 22-pin rows in board order, antenna left, USB right).
- Port light-up on a blank card: `lightweaver/src/lib/beaconProbe.js` → firmware `POST /api/beacon/port`.

### What firmware already does by itself (no owner input needed)
| Fact | Where | Consequence for design |
|---|---|---|
| A blank card **already sweeps every usable port by itself**, 1.5 s each, double blink, ~16 s round | `firmware/.../src/main.cpp:1215-1257`, `LightweaverProvisioningPolicy.h:29` | Direction B needs no new firmware: the card is already "finding them"; Studio just has to drive the sweep so it knows which port is lit |
| Pinning a port holds it 20 s, then the card returns to sweeping | `LightweaverProvisioningPolicy.h:39`, `LightweaverWeb.cpp:2680-2712` | Studio can step through ports itself by pinning each in turn |
| Beacon lights only 8 LEDs, brightness 24/255, under a 100 mA cap | `LightweaverProvisioningPolicy.h:12-13`, `beaconProbe.js:20-25` | "Dim and capped" is automatic — the owner never needs to read it |
| `GET /api/beacon/port` lists exactly the ports this card can light | `LightweaverWeb.cpp:2661-2670` | The drawing can show only those pins as tappable. 36/37 (PSRAM) and control pins are simply not tappable — the PSRAM sentence goes |
| Pin refused (card already configured, beacon off) answers 409 | `LightweaverWeb.cpp:2700-2703` | The red "not set up to drive GPIO N" banner (`StripDiscoveryPanel.jsx:538`) becomes a pin drawn dim on the picture |
| Counting setup ("bench") provisions 256 LEDs per port, capped 2000 mA | `lib/benchConfig.js:60`, `:44` | Count can be done by lighting live from Studio (frame stream), no typed number required |
| Count markers: every 5 orange, 10 red, 50 pink; end marker purple at count | `lib/stripDiscovery.js:33,96`; panel :1679, :1717 | Kept in A; replaced by live lighting in B and C |
| Colour order: two Red/Green/Blue answers fully determine it | panel :1489-1503; `todo/plans/color-order-two-tap.md` | One tap is enough if three LEDs show R, G, B at once |

### Every sentence and control on today's screens, and whether the code needs it
"Needs" = the code cannot proceed without the owner reading or pressing it.

| # | Text / control | File:line | Needs owner? |
|---|---|---|---|
| 1 | Title "Count your lights" | Overlay :190 | No (label) |
| 2 | "Find the strip. Read the markers. Save the count." | Overlay :191 | No |
| 3 | Minimize | Overlay :194 | No |
| 4 | Power notice "The card currently limits LED output to 100 mA. Starting counting installs a temporary dim setup capped at 2000 mA. Set your supply rating before installing your project." | Panel :1405-1417 | No — cap is automatic; supply rating belongs to Card Home facts |
| 5 | Details fold "lightweaver.local · Ports use the GPIO labels…", "Up to 4 strip outputs…" | Panel :1519-1527 | No |
| 6 | "Find your strip" / "Tap a port to light its first few LEDs." | Panel :1552-1553 | Press yes (a port), sentence no |
| 7 | 11 port buttons "GPIO 15 … 48", notes "Lighting…", "Lit — turn off", "lights here" | Panel :1563-1584 | One press needed; the list is not — the drawing can carry it |
| 8 | "GPIO 36 and 37 are used by this card's PSRAM… GPIO 39 appears when…" | Panel :1585-1587 | No |
| 9 | "Did your strip light up?" | Panel :1589 | Yes (decision) |
| 10 | "Counting saves a temporary setup on the card, kept after restart until you install your project." | Panel :1590 | No |
| 11 | "Yes, count this strip" / "Try another port" | Panel :1592-1593 | Yes / alternative |
| 12 | Pin drawing "Where this port is on the card" + "GPIO 18: 11th pin from the antenna end, on the 3V3 row." + "Outlined: the four main LED pins. G: join your LED supply's ground here." | Panel :1598-1604, CardPinMap :52-62 | No — the picture alone answers where |
| 13 | Red notice "This card is not set up to drive GPIO 18 yet…tick it below and carry on." (no tick exists on screen) | Panel :538-540 | No — and it points at a control that is not there |
| 14 | Output limit, no-outputs, resume, stream notices | Panel :1371-1483 | Edge cases only |
| 15 | "Setting the card up" / "Keep the card powered. It restarts once…" | Panel :1648-1649 | No (wait) |
| 16 | "What color are the lights?" / "GPIO 18 · Two quick checks make the counting colors accurate." + notice "Look at the strip and choose its color." Red/Green/Blue, "And now?" Red/Green/Blue, "I can't tell — skip this" | Panel :1655-1672, :1485-1503 | Yes, two presses |
| 17 | "Read the count off the strip", marker legend (3 items), "Count the markers, then the yellow lights at the end. Enter your total.", number field, "Strip goes past 256? Light more", "Check the last LED" | Panel :1675-1710 | Yes: type count, press |
| 18 | "GPIO 18 — is that the last LED?" "One purple LED is lit at position N. It should be the very last light on this strip." "Yes, that is the last one" / "Adjust my count" | Panel :1713-1728 | Yes (safety) |
| 19 | "N LEDs found", "GPIO 18 · N LEDs", "Add another strip", "Save what we found" | Panel :1731-1745 | Yes, one press |
| 20 | "Measured strips… Try a native card pattern…", search, two selects, Keep/Stop preview, Open Patterns editor | Panel :1750-1819 | No (optional) |
| 21 | "One more step" / "Your answers are saved, but the card is still running the temporary test setup… Put your real setup on it to finish." / "Put this setup on the card" / "Go to Layout" | Panel :1858-1877 | Yes, one press |
| 22 | Footer "Stop lights", "Your card stays connected when you close this.", "Disconnect card" | Overlay :226-251 | No |

Today, measured on the simulated blank card (screenshots on the comparison page): **724 words to read, 8 presses plus typing the count, 7 decisions** from Card Home to saved, and the owner reads GPIO names, PSRAM, milliamps and "temporary setup".

## 2. Rules applied to all three directions
1. The card drawing is the selector. No pin-name buttons anywhere.
2. No sentence longer than one short line; technical facts (PSRAM, milliamps, temporary setup, GPIO numbers) live behind one "Why?" link or in Card Home's facts.
3. One primary button per screen.
4. No separate "not set up to drive this pin" banner: pins the card cannot light are drawn dim and are not tappable.
5. Safety facts kept, as pictures not paragraphs:
   - **Dim and capped** — automatic (beacon 8 LEDs at 24/255 under 100 mA; counting 2000 mA). Shown only under "Why?".
   - **Count confirmed + the light after the last one is dark** — always a question with a strip picture: last LED purple, next LED drawn dark.
   - **Colour order by eye** — one tap: the strip shows red, green, blue on LEDs 1-3; owner taps the matching row of swatches (six small swatch rows, no words).
   - **Supply rating** — no longer on this path; Card Home's facts row (supply amps) owns it, and the final install stays at the counting cap until it is set.
6. Studio colours and type only (dark: `--bg-app` oklch .165, panel .205, `--accent` oklch .553/.109/56, amber `--layer-1`; General Sans, Spline Sans Mono). No pill buttons, cream backgrounds, gradient heroes, emoji markers or extra banners.

## 3. The three directions

### A — "Tap the card"
The drawing is the screen. Usable pins glow; the rest are dim.

| Screen | Words on screen | Primary |
|---|---|---|
| A1 Tap where your strip plugs in. *(drawing, glowing pins)* · Why? | 7 | — (tapping a pin is the action) |
| A2 *(tapped pin lit on drawing)* Did your strip light up? · Yes · Try another pin | 9 | Yes |
| A3 Which colours do you see? *(six swatch rows)* | 4 | tap a row |
| A4 Read the markers. How many lights? *(marker key as three coloured dots: 5 · 10 · 50; number field; strip picture)* · Next | 7 | Next |
| A5 Is the purple light the last? *(strip picture: purple, then dark)* · Yes · Change count | 9 | Yes |
| A6 41 lights on this pin. · Save to card | 7 | Save to card |

- **Words:** 45 vs 724. **Presses:** 7 (open, pin, yes, colour, next after typing, yes, save) vs 8. **Decisions:** 6 vs 7.
- **Strip does not light:** "Try another pin" returns to A1 with the tried pin marked with a small cross on the drawing; after three crosses, A1 shows one line "Check the strip's power and ground." with the G pins outlined on the drawing.
- **Studio changes:** `CardPinMap` becomes interactive (pins as buttons, available set from `GET /api/beacon/port`, refused pins dim); remove the port grid, PSRAM line, power notice, start note; merge colour proof into one six-row question; record + install collapse into one "Save to card" (record then install). **Firmware:** none.

### B — "It finds them"
Studio lights each usable port in turn by itself. The owner watches the strip, not the screen.

| Screen | Words on screen | Primary |
|---|---|---|
| B1 Watch your strip. *(drawing: the pin being lit pulses, moving along the rows)* · That's mine · Why? | 5 | That's mine |
| B2 *(found pin lit on drawing)* Which colours do you see? *(six swatch rows)* | 4 | tap a row |
| B3 Press Stop when the light reaches the end. *(strip filling from LED 1, live count)* · Stop | 9 | Stop |
| B4 Is the next light dark? *(strip picture: last lit purple, next dark; − / + nudges)* · Yes | 6 | Yes |
| B5 41 lights. · Save to card | 4 | Save to card |

- **Words:** 31 vs 724. **Presses:** 6 (open, That's mine, colour, Stop, Yes, Save; the run starts when the dialog opens). **Decisions:** 5 vs 7.
- **Strip does not light:** after two full rounds (~32 s) with no press, B1 swaps to "Nothing lit? Check power and ground." with the G pins outlined, and a secondary "Pick the pin" opens A1 as the fallback.
- **Stop overshoot:** fill runs slowly (about 10 LEDs/s, faster after 50) and B4's − / + nudges fix any overshoot; the purple-then-dark check is the safety confirmation.
- **Studio changes:** a stepper that pins each port from `GET /api/beacon/port` for ~2 s in turn (re-pinning inside the 20 s hold) and draws that pin on the drawing; "That's mine" pins it and starts the counting setup; a live fill frame for B3 on the existing frame stream; nudges for B4. **Firmware:** none required. Optional nicety: `GET /api/beacon/port` reporting the sweep's current pin would let Studio follow the card's own sweep instead of driving it.
- **Risk:** two strips on two ports — the owner presses "That's mine" twice; B5 adds "Find another" as a secondary.

### C — "One thing at a time"
Full-screen steps, one large picture, one short line, at most two buttons. Counting is done by looking.

| Screen | Words on screen | Primary |
|---|---|---|
| C1 *(large drawing)* Tap your strip's pin. | 4 | tap |
| C2 *(large strip picture, first 8 lit)* Lit? · Yes · No | 3 | Yes |
| C3 *(three big swatches lit on the strip)* Tap what you see. *(six rows)* | 4 | tap |
| C4 *(strip lit live up to the slider; last one purple)* Slide until purple is the last light. · Done | 9 | Done |
| C5 *(big number)* 41 · Save to card | 4 | Save to card |

- **Words:** 23 vs 724. **Presses:** 6 (open, pin, yes, colour, Done after one drag, save). **Decisions:** 5 vs 7.
- **Strip does not light:** "No" on C2 returns to C1 with the pin crossed; after three, C1 says "Check power and ground." and outlines G.
- **Safety:** the slider is the end-check — the purple light must sit on the last LED with the next dark; Done is the confirmation.
- **Studio changes:** new full-screen step container (replaces the dialog on phones, centered column on desktop); interactive `CardPinMap`; live slider pushing frames throttled to the stream rate; colour rows. **Firmware:** none.

## 4. Decisions logged (made without asking, per the task)
- Colour order becomes one tap in all three: LEDs 1-3 show R, G, B; six swatch rows cover the six orders. Two-answer proof stays as the code path if one-tap needs a fallback.
- Record and install merge into one "Save to card" press in all three. The "Measured strips / pattern audition" block leaves this flow (Patterns owns it).
- Supply rating leaves the discovery path for Card Home's facts row; the card stays at the counting cap until it is set. That keeps the safety fact and drops the paragraph.
- "Light more" past 256 LEDs is automatic in B and C (the fill or slider passing 256 extends the counting setup), and a field limit in A.
- Footer reduces to "Stop lights" only; Disconnect moves to Card Home.
- Word counts exclude the persistent app chrome (rail, footer beacon) in every column, including today's.

## 5. Recommendation
Build **B, with A1 as its fallback**: the owner never has to know which pin they used, and six presses with five decisions is the shortest path that keeps every safety check. Test it first with a non-technical person holding a blank card with one strip on a pin they do not know, no instructions: time to "Save to card", and whether their Stop lands within two LEDs of the end before the nudge.

## 6. Combined flow (Adrian, 2026-11-22: "a combination of many would work")

Each part was judged against Adrian's three asks: far less writing, no pin numbers when the card knows them, and the picture as the selector.

| Part | A · Tap the card | B · It finds them | C · One thing at a time |
|---|---|---|---|
| Find the pin | Fallback: the owner must know where the wire goes | **Use**: the card lights each pin in turn, so no number is shown | Drop: same as A, no way back |
| Did it light? | Fallback only | **Use**: "That's mine" already says it | Drop |
| Colour order | Drop: nothing says which lights to look at | Use part: the desktop picture of where it was found | **Use**: lights 1-3 drawn above the six rows |
| Count | Drop: colour key plus typing | **Use**: a running light and one Stop press | Drop: a 256-step slider is fiddly on a phone |
| Check the end | Drop: asks the wrong question | **Use**: "Is the next light dark?" with − / + | Drop: folded into the slider |
| Save | Same | Same | **Use**: the big number reads fastest |
| Every screen | Use part: one "Why?" link | Use part: step 1 runs on open | **Use**: one line, big type, one main button |

**Main path, five screens:** 1 Watch your strip (B, runs on open, pin drawn with no number) → 2 Tap what you see (C's strip plus swatches; desktop also shows where it was found) → 3 Press Stop at the end (B) → 4 Is the next light dark? with − / + (B) → 5 the number 41 and Save to card (C).
Totals are 28 words, 5 presses (plus any nudges) and 5 decisions, against today's 724 words, 8 presses and 7 decisions.

**Way back:**
- F1 appears after two quiet rounds and says "Nothing lit? Check power and ground." It offers Watch again or Pick the pin.
- A card that already has a project answers the pin call with 409, so it never sweeps and opens on F2 instead.
- F2 is A's tap-the-card screen and F3 asks whether it lit. Yes on F3 rejoins the main path at step 2.
- This path costs 38 words, 6 presses and 6 decisions.

**Other failures:**
- Pressed a beat late: "Not lit" on step 2 steps back one pin.
- Stop lands off: − and + fix it.
- No colour row matches: falls back to today's two-question check.

**Firmware: none.** Studio drives the sweep with the existing `POST /api/beacon/port`, about 2 s per pin inside the 20 s hold. `GET` lists the pins the card can light, and 409 marks a card that already has a project. Counting and Save reuse calls today's flow already makes.

Page: https://claude.ai/artifact/RYq3ii4NvNyYiyhMhDXowq (version 2).

## 7. Two ways in (real-card finding, 2026-11-22)

Evidence: `real-card-2026-11-22/DIAGNOSIS-blank-card-dead-end.md` on `claude/realtiming-reds`.
- On a blank card, finding first leaves the temporary setup `bench-18`.
- After that, every project save is a staged candidate, and on the real card it fails with "candidate storage failed".
- A blank card does take its first whole project directly.

- **Way in 1: Studio knows the wiring.**
  - Screens: K1 Save to card (the whole project, as one save) → restart → K2 colour check → K3 "Is the light after each purple dark?" on all strips at once.
  - "One isn't" lets the owner tap that strip in the picture, then − and + fix it.
  - It skips 1 Watch and 3 Stop, because the pin and count are already known. 2 and 4 become checks that run after the save, and 5 Save moves first.
  - Totals are 24 words, 3 presses and 3 decisions.
- **Way in 2: no known wiring.**
  - The five-screen main path runs as drawn: 28 words and 5 decisions.
  - Step 5 Save clears the temporary setup and then sends one whole save, so the blank-card exemption applies.
  - **To prove on the real card** before building: does clear-then-save land without a candidate?
- **Open, to verify:** whether a − / + count fix after way in 1 counts as a wiring change, which would stage a candidate again. The diagnosis lists output id and segment count as wiring changes, not segment length.
- Firmware: still none for either way in. The card-side cure (store the candidate as a blob) is separate and optional.

## 8. Build log (2026-11-23, branch claude/find-strips-redesign-0a2efe)

Decisions taken while building, without asking:
- **Way in 2 keeps the existing Save path.** After finding, Save to card still runs the protected light test (candidate, probation, confirm), which tests C2 cover. Clear-then-whole-save was never proved on a real card and would have dropped that protection. Small discovered projects fit the candidate.
- **Way in 1 runs on Card Home's lights step and its verify step**, using one rule (`useFirstSaveApplies`): the card is blank, and the open project's wiring is complete with no starter placeholder and no uncounted headroom. When the page's install slot (`next=patterns`) already owns Save, the lights step stands down, so there is one Save per page.
- **The way-in-1 check is one app-level sheet** (`FirstInstallCheckSheet`). Card Home rebuilds itself when the card gets a project, so a check inside the panel vanished with it.
- **"Is purple the last light on every strip?" in way in 1, and "Is the next light dark?" in way in 2.** After a first save the card drives exactly the saved count, so nothing past it can light. During finding, the counting setup has headroom, so the light after the count really is lit when the strip is longer.
- **Phone sizes follow Studio's one type scale** (titles 17px, text 15px). The big numbers from the mockup are desktop only.
- **"Not lit" on the colour step takes the counting setup off and sweeps again**, instead of stepping back one pin. A card holding the counting setup cannot light other pins.

Defects found and fixed on the way:
- Studio's light stream asked `/api/status` for `physicalFrameOrder`. The firmware reports it only on `/api/firmware-info`, so every physical-order frame over a direct connection was refused. The practice card copied this, so discovery tests never really lit anything. Both are fixed, with unit tests.
- Finding a second strip walked the first strip again. Strips counted earlier in a setup now keep their counts (engine `bench-installed` `focusPin`).

Open: see the two Find my strips entries under Follow-ups in TODO.md.
