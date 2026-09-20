# First-action manager

Studio auto-detects which arrival this browser and this card are in, then
shows **that** flow. The next step is always the first thing on the screen.
Earlier steps stay reachable — count, colour order, LED management — so the
owner can go back and forward without losing the next step.

This is not another journey blueprint. J01–J14 prove click paths. This
ledger proves the first-meeting screen and that completed work is still a
door, never a dead end.

## The rule

1. **Detect.** The card and browser state pick the flow. The owner does not.
2. **Skip what is already done.** A ready card does not replay connect, Wi-Fi,
   or blank-chip discovery. Effortless means start at the unfinished step.
3. **One next action.** Exactly one primary in the first viewport, named for
   what this arrival does next.
4. **It is first.** The first heading after the title, and the first button
   in the main column, are that same action. Optional firmware, Layout, and
   Hardware never sit above it.
5. **Back and forward.** Finished steps stay open. A loaded project can
   still open LED count, colour order, and strip management. Those doors
   are secondary. They never steal the next-step primary.

## Every arrival (first paint)

Detect from the card and this browser. Do not ask the owner to choose a
lane.

| ID | What is true | First action |
| --- | --- | --- |
| FA-unplugged | No card answering | **Plug in and find card** |
| FA-plugged-blank | Card answering, no project | **Find and count the lights** — not Find my card |
| FA-plugged-loaded | Card answering, already holds a project | **Use this card’s project** / **Open Patterns** — not setup, not Update |
| FA-outdated | Card firmware is too old to continue | **Update the card** |
| FA-post-update-wifi | Just updated; not on home Wi-Fi yet | **Join the Lightweaver-XXXX network** |
| FA-wifi-saved | Home Wi-Fi is saved; owner is lost | The next unfinished step (find lights, or play). Studio finds the card. Not “join Wi-Fi” again. |
| FA-blackout | Installed card, lights off | **Recover lights** — not Open Patterns, not Update |
| FA-provisional | Temporary find-my-strips still on the card | **Finish placement / test** — not “project installed” |
| FA-other-project | Card holds a different project than the one open here | **Use this card’s project** — do not erase open work |
| FA-wiring-changed | Same project; count, colour, or wiring drifted | **Review lights / save the new count** — not full setup |
| FA-wrong-card | A different card answered | **Connect the expected card** |
| FA-booting | Card is answering but not ready | **Wait — card is starting** |
| FA-usb-held | USB install is holding Wi-Fi off | **Continue the update** or **Restart for Wi-Fi** |
| FA-https | Public Studio cannot see the LAN | **Open the card’s own page** |
| FA-confirm-test | Mid light-test | **Yes, the lights look right** / restore |

A remembered complete install is FA-plugged-loaded. Optional newer firmware
is a sentence under the first action, never the first action. Patterns,
Playlist, and Lab are destinations after the card is known, not arrivals.

## After the first paint — still one next step

| Step | First action | Still reachable (secondary) |
| --- | --- | --- |
| Pick the port | the port that lit | Find my card |
| Confirm the strip | Yes, count this strip | try another port |
| Colour | the colour the strip is showing | skip only as a last resort |
| Count | Use this count | review the connected lights |
| End marker | Yes, that is the last light | count again |
| Record | Save what I counted | add another strip |
| Test | Open Patterns / confirm the lights | Layout, count, colour |
| Playing | the next look | Card Home → lights, count, colour, wiring |

Loading a project must not hide LED management. Completing setup must not
hide count or colour order. Those are how you go back.

## How the primary walks

```bash
node scripts/lightweaver-dev.mjs focused tests/first-action-walk.spec.ts
```

A fresh browser on every test. Each arrival writes a first-action report
and a first-viewport screenshot under `.claude/ux-screens/first-action/`.
The primary reads those screens as a stranger, then files FA-* tickets.
Studio source stays on the lightweaver-app boundary.

Do not mark a row done from a remembered-browser fixture or an old
screenshot. Re-walk the named arrival.

## Status

Opened 2026-09-20. Re-walk 2026-09-20: **7/7** + J01 green.
Screens: `.claude/ux-screens/first-action/`.

Measured first paints (this walk, not borrowed):

| Arrival | Detected? | What is actually first | Gap |
| --- | --- | --- | --- |
| Unplugged | yes | Find my card | Phase title still sits above the action |
| Plugged-in blank | yes | Find and count the lights — no Find my card | — |
| Plugged-in loaded | yes | Use this card’s project, then Open Patterns on **Matrix piece** | Phase title still first heading |
| Outdated | yes | Install or update firmware | — |
| Post-update Wi-Fi | yes | Continue Wi-Fi setup | Copy is Continue, not Join Lightweaver-XXXX |
| Wi-Fi saved | yes | Open Patterns | — |
| Back to lights after a loaded project | yes | Review the connected lights stays a door; Open Patterns remains the only primary | — |
