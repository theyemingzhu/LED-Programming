# False failures on a slow, healthy card

Branch `claude/false-failures-e2a7fd`. Studio only; nothing under `firmware/`, no `VERSION` bump. Simulator only — nothing was sent to the real card.

Adrian, 2026-11-21: "The places where it reports failed when it actually passes and the unresponsiveness and the delays … will lead to confusion and frustration."

## What the real card does (firmware 1.2.4), and what the simulator now models

| Real behaviour | Source | Simulator option |
|---|---|---|
| Every accepted `POST /api/config` answers `requiresReboot: true` and restarts within 5 s (on `/api/reboot`, or its own fallback) | `LightweaverWeb.cpp handleConfigPost`, `kConfigRestartFallbackMs` | `createCardSimulator(spec, { restartAfterSaveMs: 14000 })` |
| Silent ~14 s, then a new `bootId`, saved project intact | traced saves | same |
| ~1.5 s after it answers: `runtimePhase 'ready'`, `commandReady false`, small `uptimeMs` | `provisioningCommandReady` | same (`bootingUntil`, `bootedAt`) |
| Goes quiet 4–12 s with no restart (Wi-Fi re-associating) | traced saves | `card.silenceFor(ms)` (HTTP and bridge) |
| Replies up to 4 s | traced | `card.answerAfter(path, ms, times)`, `setReplyDelay(ms)` |
| Repeats an old `firmwareUpdate.phase: 'rolled-back'` forever | durability log | `firmwareUpdateOverride` (existing) |
| Live colour-order try changes `led.colorOrder` | `runtimeGetLedColorOrder` | `/api/control {colorOrder}` now modelled |

Existing tests keep the instant card: every option is off unless a test sets it. The bridge relay (`relayBridge`) honours offline/silence; `handleBridge` stays synchronous for `live-card-states.spec.ts`.

## Decisions (made without asking, per brief)

- **D1. A save waits up to 45 s for the restart** (`CARD_RESTART_WAIT_MS`), showing "Restarting the card…" with a spinner, and finishes the moment an answer from a *new* boot verifies the project. Without boot ids an answer counts only after the card went quiet or 6 s passed (past the firmware's 5 s fallback). After 45 s: one line, "The card has not come back after restarting (45 s). Check it has power and is on this Wi-Fi; your work is kept in Studio."
- **D2. An accepted save whose `/api/reboot` request gets no reply is a save, not a failure.** Firmware restarts on its own within 5 s; the read-back is the proof. This changed one unit test (`cardPushClient.test.js`, "explicit config refusal stays a refusal; an accepted save whose reboot request is lost is still a save").
- **D3. A save whose reply is lost is read back before anything is said** (Patterns). The same rule already existed in CardPushControl (`isUncertainCardWriteFailure`).
- **D4. Reads before a save are asked 3 times, 3 s apart** (`withCardReadRetry`), only when the card did not answer. A card that answered — wrong card, old firmware, refusal — is never retried. The button keeps saying "Checking card…".
- **D5. The card link marks a planned restart** (`noteCardRestartPlanned` / `noteCardRestartSettled`): state `revalidating`, reason `card-restarting`, label "Restarting card". Inside the window silence, failed probes and answers from the old boot are ignored. A real verdict (wrong card) still lands.
- **D6. One missed direct keepalive is a slow card.** Two consecutive misses (about 11 s) demote the link, the same rule the bridge already had (F26). Changed the contract in `tests/card-link-state.mjs`.
- **D7. A card that booted less than 20 s ago and is not yet command-ready is "Checking card"**, never "Needs attention", and its stale rollback flag is never "Update rolled back". After 20 s a not-ready card is still "Needs attention".
- **D8. "verifying" says what it is:** "Restarting card" (planned), "Card restarted — verifying" (unplanned), "Checking card" (re-check, no restart). Changed one row in `cardStatusCharacterization.test.js`.
- **D9. F3 (durability log D3 said "F3 stays")**: the tap that was lost during a silence is resent once the card answers (b607b9ac, already on main) and with D6 no disconnect is shown; the spec now pins that the line does not stay. A silence longer than ~11 s still ends in "did not answer in time" with Retry — true by then, and it is resent on the next ready reading.

- **D10. The durability run's d30e8d97 and f1d5133f (branch `claude/overnight-durability-v2`) are not cherry-picked.** This branch already does both, for Patterns, Card Home, Layout and the footer, and waits for a new boot id. Their two specs (`save-survives-slow-restart`, `save-retries-quiet-card`) were run against this branch: 2 of 2 pass. They duplicate `slow-card-save.spec.ts`, so they are not added. Their option name `setRestartSilence(ms)` is kept as the simulator's public name for the restart rule, for the practice-card session.

## Before / after (simulator as slow as the real card)

| Where | Before (main, measured in these specs) | After |
|---|---|---|
| Patterns · Save to card, 14 s restart | Stayed "Sending…" then failed | "Restarting card…" + spinner, then button "Saved", status "Saved to the card." (~16 s) |
| Patterns · Save, card quiet 5 s at the press | "Not saved to the card: it did not answer" while the header said "Installed on card" | "Checking card…", then saved |
| Layout · LED count save | "A Lightweaver card is not connected" the whole time, then "Card restarted — verifying…", a Retry, "Card stopped responding" | "Restarting the card…", hands off to Patterns, "Installed on card" |
| Card Home · Save to card | No restart wording; failed verification | "Restarting the card…", "Installed revision N on card" |
| Card Home idle, replies 4 s | "Card stopped responding" | stays Connected |
| Card Home · colour-order try, 3 s replies | "RGB set in Studio, but the card did not answer." | "RGB is on the strip." |

## Sweep (step 4)

About 790 hits in `src/` read; 49 distinct card-facing messages. Columns: real condition → can a slow but healthy card raise it?

| # | Where | Message | Real condition | Slow-healthy false? |
|---|---|---|---|---|
| 1 | lw-pattern.jsx | Not saved to the card: it did not answer | save reply lost / pre-read timeout | was yes → **fixed** (D3, D4) |
| 2 | lw-card.jsx | A Lightweaver card is not connected | `length-/content-mismatch` fell to default | was yes → **fixed** |
| 3 | cardLifecycle.js | Update rolled back / Needs attention | stale rollback, `commandReady` false after boot | was yes → **fixed** (D7) |
| 4–5 | cardLink.js, lw-card.jsx | Card stopped responding | missed keepalives | was yes after 1 miss → **fixed** (D6); true after ~11 s |
| 6 | cardLink.js | Could not reach the card | 15 s / 45 s timers | no |
| 7 | cardLink.js via useCardStatus | No card found on this network | probes fail | was yes during a restart → **fixed** (S3); 3 × 12 s misses otherwise |
| 8–9 | cardLink, CardFacts | Not connected | link disconnected | no (follows 6–7) |
| 10–11, 15, 46 | cardAction.js, cardLiveControl.js, DrawModePanel | The card did not answer in time (preview) | preview 2.2 s × 3 tries ≈ 11 s | true after ~11 s; resent on next ready reading (D9) |
| 12–13 | cardAction.js | Starting up / busy | HTTP 423 / 409 | no, correct copy |
| 14 | cardAction.js | Preview could not be verified | fallback | maybe; not traced |
| 16 | cardPushClient.js | Stopped before saving … Nothing was sent | identity guard one 1.5 s try | was yes → **fixed** (S1: 3 s, retried) |
| 17–18 | cardPushClient.js | Timed out / did not answer (config POST) | 6 s POST | callers now read back (D3) |
| 19 | cardPushClient.js | Card did not accept / could not confirm (code) | HTTP 4xx/5xx | no |
| 20 | CardPushControl.jsx | Could not verify this install | post-save read-back | was yes → **fixed** (D1) |
| 21 | CardPushControl.jsx | Did not answer after the light test ended | 4 × 750 ms checks | maybe (thin vs a 14 s restart) — follow-up |
| 22–24 | CardPushControl, cardWiringSafety | Wiring test rolled back / timed out | real states, caller timeouts | no / maybe |
| 25 | studioActionStatus.js | The card page did not answer (playlist) | bridge `config` timeout; bridge retries `config` once | maybe; retry can send `/api/config` twice — follow-up |
| 26–27 | cardBridge.js | Card page opened but did not answer / bridge timed out | handshake / 3 s request | maybe on a cold open |
| 28 | lw-pattern.jsx | Not connected to the card, so the lights can't follow | link not connected at tap | was yes via 4 → fixed with D6 |
| 29–30 | lw-pattern, lw-card | LED repair could not reach / did not answer (blackout recovery) | recover-lights 3.2 s, restarts card | maybe — follow-up |
| 31 | lw-card.jsx | Hardware readback failed / did not confirm the clear | 3 s reads | maybe, not traced |
| 32 | CardFacts.jsx | {order} set in Studio, but the card did not answer | 2 s push + 2 s read | was yes → **fixed** (S4) |
| 33–35 | lw-setup.jsx | Count saved here, card did not take it / Recover lights if dark | 3 s reads; recover sent into the restart | was yes → **fixed** (S2) |
| 36 | CardControlDrawer.jsx | Could not read the card controls | 3 × 1.8 s | maybe (> ~7 s silence) |
| 37–38 | lw-show.jsx | Couldn't check your card / lights stopped receiving the show | 2 × 2.5 s pings; stream notice at 3 s | maybe — follow-up (Show screen) |
| 39 | cardFrameStream.js | Could not reach the card / ws | socket closed | true on a real drop |
| 40–42 | lw-flash, app.jsx, lw-setup | Update rolled back / could not verify restarted card | update sessions only | no |
| 43–45 | StripColorOrderCheck, StripDiscovery, WireDiscovery | could not reach / light / start | 2 s-class timeouts | maybe, not traced |
| 47–49 | Connection Center, production, commissioning | take over / link lost / setup unreachable | user-started or long deadlines; workshop only | no |

Fixed in this batch with a test each: 1, 2, 3, 4–5, 7, 16, 20, 28, 32, 33–35.

## Tests

- `tests/slow-card-save.spec.ts` — Patterns: 14 s restart; quiet pre-save read.
- `tests/slow-card-save-card-layout.spec.ts` — Layout count save; Card Home save.
- `tests/slow-card-idle.spec.ts` — 6 s silence on Card Home and Patterns; F4 (4 s replies); F3 (tap during 5 s silence).
- `tests/slow-card-home-facts.spec.ts` — colour-order try on 3 s replies.
- `src/lib/falseFailures.test.js` — link miss rule, planned restart, lifecycle after boot, restart wait, read retry, count retry.
- `tests/harness/falseFailureWatch.ts` — records every moment failure wording appears, and the longest stretch with no sign of work.

All in `ci:browser-smoke` and `test:release-ui`. Each browser spec except the two idle-silence guards was run red against main's `src/` first. The idle-silence guards pass on main too, because the 20 s direct keepalive rarely lands inside a 6 s silence; the deterministic proof is the unit test.

## Follow-ups, second batch (2026-11-21, branch `claude/false-failures-2`)

- **F-B1 Bridge resend.** `config` and `recover-lights` are no longer resent after a bridge timeout (the card may already have stored the save and be restarting; a resend restarted it twice). Only a stale tab reference is retried; a timeout is "delivery unknown" and the caller reads the card back. Patterns and Playlist now treat a lost save reply (`offline`, `timeout`, `bridge-timeout`) as "read back first", waiting through the restart. Test: `slow-card-bridge.spec.ts` "sent once" (a guard: it is green on main too, because the fake bridge never reaches the retry; the change is defensive).
- **F-B2 Recover lights.** It restarts the card on purpose; the wait for the card to come back is 45 s (was 15 s), a lost reboot reply is not a failure, the link says "Restarting card", and Patterns no longer drops the recovery's result when the restart cancels pending previews (own counter). Test: `slow-card-bridge.spec.ts` "Recover lights through an 18 s restart" — red on main ("The card restarted but did not reconnect in time"), green here.
- **F-B3 Wiring-test end.** After the light test expires the card restarts to its working setup; Studio keeps asking for up to 45 s (was 4 quick checks, ~15 s) and says "The light test ended. The card is restarting to its working setup…". No browser test (the expiry flow needs a timed probation); reviewed in code only.
- **F-B4 Show.** A stream that stops reaching the lights shows "Waiting for the lights to answer…" with a spinner after 3 s (was an error), and pauses itself after 20 s (was 15 s). The pre-show card check asks 3 times, 4 s each (was 2 × 2.5 s). No browser test (needs the frame stream); reviewed in code only.

Still open: watch one real Save on the gallery card (Adrian).

## Batch C — a card that answers, slowly (2026-11-21, branch `claude/slow-card-reads`)

Real-card finding on Studio build 2559 (coordinator): with the card answering status in about 3.4 s, Save to card showed "Checking card…", then after 6.8 s "Not saved to the card: it did not answer" and the footer "Card stopped responding", with no write attempted. Every Studio read gave the card 3 s or less, and the keepalive 2.5 s, so a busy card failed every try.

- **D11.** Each card read gets 6 s (`CARD_READ_RETRY.timeoutMs`, and the defaults of `readCardProjectEvidence`, `readCardStatusEnvelope`, `readCardFirmwareInfoEnvelope`, `getCardWiringStatus`). Pre-save checks are asked 3 times, 1 s apart: about 20 s of "Checking card…" before Studio says the card did not answer, and the first answer goes straight on.
- **D12.** The keepalive gets 6 s (`CARD_LINK_PING_TIMEOUT_MS`, was 2.5 s). Two consecutive misses (now about 25 s) still report the card gone.
- **D13.** While a save is checking the card (Patterns, Card Home/Layout install, footer), the link holds "stopped responding" (`noteCardCheckHold`, up to 22 s); the save itself says what happened if the card never answers.

Test: `tests/slow-card-reads.spec.ts` on the Real-timing practice card — direct and bridge, reply delay 3.5 s and a 10 s silence. Direct at 3.5 s was red on the code then live ("Not saved to the card: it did not answer", "Card stopped responding") and is green now; the other three were already green in the simulator and stay as guards. Unit: `falseFailures.test.js` check-hold rule.

## Batch D — stale rollback, false restart timeout, mismatch named (2026-11-21, branch `claude/stale-rollback`)

From the physical card on live build 2559 (coordinator and durability run):

- **F-D1.** A bench/provisional card (never command-ready) repeating an old `firmwareUpdate.phase: 'rolled-back'` was "Update rolled back" and "The last card operation failed" in every fresh browser. A past rollback this browser did not start is now history when the card runs exactly the build the record says it restored (`restoredBuildId` or `restoredBuildNumber`), ready or not. An update this browser ran still stops the owner. Test: `stale-rollback-bench-card.spec.ts` (red before, green now) and `falseFailures.test.js`.
- **F-D2.** "The card has not come back after restarting (45 s)" was shown about a card that never restarted (Layout count change; the one candidate POST went nowhere). The restart wait now runs only when the card's reply said it is restarting. A lost reply is read back as it is; and if the card answered from the same boot all along, Studio says it "did not take this save", never "has not come back". Unit test in `falseFailures.test.js`.
- **F-D3.** A card that answered at once, but with a project/boot/build Studio had not adopted, was reported as "Not saved to the card: it did not answer". "Did not answer" now appears only when no answer came (`cardGaveNoAnswer`); otherwise the reason the card's answer stopped the save is shown. Guard spec in `stale-rollback-bench-card.spec.ts` (green on the old code too; the exact durability case awaits its request records).
- **Open:** Card Home "Light count" Set on the bench card sent only `GET /api/wiring/status` on the real card. The practice card's `provisional` state is not faithful (no fingerprint, outputs not named `bench-18`), so the count write cannot be reproduced yet; a faithful bench state was asked of the practice-card session.
- **F-D4.** The shipper held batch C on a 0.8 s "no sign of work" gap in the Layout spec. Measured under 8-way CPU load (3 of 3 reproduced), it had two parts: (a) real — Layout's "Check and install" opens Card Home's install task, which ran its preflight reads before showing anything; it now shows "Checking card…" with a spinner from the moment the task opens with an install queued, and from the first instant of a press; (b) a measuring artifact after success — arriving on Patterns with the card holding the project. The watch now records the screen at the start of the longest gap and stops counting once the save's success is shown; the 600 ms limit is unchanged. 6 of 6 under the same load after the fix.

## Batch E — the staged wiring the owner could never test (2026-11-21, branch `claude/step3-activate`)

Real card, live 2559 (durability run): moving the bench card (256 lights) to a 5-section 41-light project from Layout's "Check and install" posted the wiring candidate (70 s after the press), the card staged it, and "Start light test" never appeared. Card Home sat at "Step 2 of 3" with step 3 locked, the install banner said "The card has not come back after restarting (45 s)", the footer "Update rolled back", and the staged change expired with the card still at 256.

- **F-E1 (cause).** The candidate's "staged" reply was late or lost. Studio filed the write as "unconfirmed" and waited for a project read-back and a restart, neither of which a staged wiring change ever gives, and never asked the card what it held. Now, after any uncertain write, Studio reads `/api/wiring/status` (up to five looks, 2 s apart, 6 s each); if the card holds this exact staged change it shows "Start light test", exactly as if the reply had arrived. Test: `step3-activate.spec.ts` "the staged reply arrives late" — red on this branch before the fix with the real card's screen (Step 2 of 3, step 3 locked, no light test), green after.
- **The 70 s wait.** On 2559 every read gave the card 3 s or less; a busy card (~3.4 s) failed each try and its retries before the candidate went out. Batch C's 6 s reads fix it: the Real-timing card answering in 3.5 s gets its candidate 18 s after the press (test bound 20 s). The remaining ~18 s is five sequential pre-checks at 3.5 s each.
- The false labels on that screen ("Update rolled back", "has not come back after restarting") were fixed in batch D. "Card is not connected" never appeared in the simulator with this branch.
- Fixtures: the durability run's real-card read-back and the 5-strip project, `tests/fixtures/real-card-bench-2026-11-21/`. Its handover spec (`staged-candidate-activates.spec.ts`, never pressing "Start light test") is superseded by `step3-activate.spec.ts` and not committed.
- **F-E1 correction (shipper, 2026-11-22).** The first F-E1 commit (0455adaf) broke F14 (`journey-count-save.spec.ts`, 3/3 red): after any uncertain write it made up to five 6 s wiring-status reads, and a length-only save restarts the card, so every read failed and "Verifying the exact project…" was held back ~40 s and overwritten. Staging never restarts the card, so the look now stops at the first read that gets no answer, asks an answering card with no candidate only once more (2 s), and no longer replaces the status line. The lost-reply test now uses `respondThenDrop` (stored, reply lost), the real shape; `answerAfter` also delayed storing it. F14 3/3 green; `step3-activate.spec.ts` 4/4; the lost-reply case is red with the look disabled.
