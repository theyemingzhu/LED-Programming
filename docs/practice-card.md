# Which card to test against

Lightweaver has three things to test against. Each answers a different
question. Pick by the question, not by convenience.

| Tool | Answers | Speed |
|---|---|---|
| **Practice card, Fast** | "Is the logic right?" | Instant replies |
| **Practice card, Real-timing** | "Does it survive how a real card behaves in time?" | Replies, restarts and silences at measured real-card speeds |
| **Physical test card** | "Does it work on the hardware?" | Real |

The practice card is the simulated card in `lightweaver/tests/harness/`
(`cardSimulator.ts`, `cardStates.ts`, `bridgeTransport.ts`). Fast and
Real-timing are two timing profiles of the same simulator, chosen per
simulator instance, so both can run at once in different tests or tabs.

## How to use it

**In a Playwright spec** — one switch per simulator instance:

```ts
import { createPracticeCard } from './harness/practiceTiming.js';
const { card, timing } = createPracticeCard(cardState('playing'), { timing: 'real' });
await card.install(page);            // same simulator, Real-timing in front of it
timing.restart(); timing.wifiDrop();  // or let Studio's own reboot trigger it
```

`timing` defaults to `LW_PRACTICE_TIMING` (`real`), else `fast`. Two
instances with different profiles run side by side in one test or two tabs
(`tests/practice-card.spec.ts` proves it). `overrides` turns single behaviours
off for a focused test, e.g. `{ spontaneousSilence: null }`. Existing specs
that call `createCardSimulator` directly are Fast.

**On screen** — `lw practice` (or `npm run practice` in `lightweaver/`) starts
a Fast card on port 7101 and a Real-timing card on 7102 and opens
`http://127.0.0.1:7101/practice/`: the card's lights drawn as the strip, its
state, the request log, and controls to switch Fast / Real-timing, take it
off Wi-Fi, blip Wi-Fi, restart it, blank it, and pick any state from
`cardStates.ts`. More cards: `--card 7103:real:blackout`.

**Studio on a practice card** — the page's "Open Studio on this card" button
(or `npm run practice:studio -- --port 7102`) opens Studio in its own window.
Studio keeps only the hostname of a card address and talks to it on port 80
(`src/lib/cardIdentity.js` `normalizeHost`), and port 80 on this Mac is the
i64os Caddy proxy, so a normal browser tab cannot reach a card on 7101. In
that window every card address — `practice-<port>.local`, `lightweaver.local`,
`192.168.4.1`, `192.168.18.70` — leads to the practice card, so it can never
reach the physical card by accident. Studio pairs, connects and reports the
card exactly as with a real one; on Real-timing a restart reads "Card
restarted — verifying", then "Card stopped responding", then "Connected"
after about 20 s, as on the real card.

**Files** — `tests/harness/practiceTiming.ts` (profiles, timing controller,
Playwright layer), `tests/harness/practiceServer.ts` (the simulator as a local
HTTP card), `tests/harness/practice/index.html` (the page),
`scripts/practice-card.mjs`, `scripts/practice-studio.mjs`,
`scripts/practice-contract.mjs`, traces in `tests/harness/traces/`.

## Practice card, Fast

**Use it for:** unit-speed and bulk browser tests, state logic (what Studio
shows for each card state), the card-state matrix, anything run on every
change, anything in the PR lane.

**Do not use it for:** any question about time. It answers in under a
millisecond, never restarts on its own and never goes quiet. A real card does
all three.

## Practice card, Real-timing

**Use it for:**

- waits, restarts and reconnects (after a project save the real card restarts
  on purpose and is unreachable for about 14 s);
- slow or silent replies (the real card sometimes goes silent to a page for
  4–12 s, and status replies take about 0.06–0.1 s);
- Wi-Fi reconnect gaps;
- progress wording and failure wording ("Sending…", "did not answer",
  "Card restarted — verifying");
- **any fix for a fault first seen on the real card.**

**Do not use it for:** bulk runs on every change (it is slow on purpose), or as
final proof of a hardware fix.

The numbers in the `real` profile come from traces recorded on the physical
test card; each number names its trace (see
`lightweaver/tests/harness/practiceTiming.ts` and
`lightweaver/tests/harness/traces/`).

## Physical test card

`lw-b0fe81f61b44`, `http://192.168.18.70` on the bench Wi-Fi, USB
`/dev/cu.usbmodem1101`. It is Adrian's test card, not a customer's.

**Use it for:** final proof of a fix, Wi-Fi behaviour, flashing, and real
lights.

**Rules:**

1. **One session at a time.** Say in the session, in plain words, "I hold the
   physical test card" when you start and "I released it" when you stop.
   `lw clean` shows who has a connection open to it and who holds the USB port.
2. **It may be reset and flashed** (`lw flash`, `scripts/firmware-dev.sh`).
3. **Never raise brightness or the power cap while the strip runs from the
   Mac's USB port.** The USB port cannot supply a full strip.
4. **Save a full copy of the card's project before writing anything, and
   restore it after.** Read-back first (status, firmware-info, zones, wiring,
   patterns, playlist), keep it in your scratchpad, restore it and read back
   again to prove the card is as you found it.
5. The contract check (`npm run practice:contract` in `lightweaver/`) only
   sends GET requests. It is safe to run while another session holds the card
   for writing.

## Two rules that are not optional

- **A green Fast run is not evidence about timing.** It proves logic only. If
  the question involves a wait, a restart, a reconnect or a slow reply, the
  evidence is a Real-timing run or the physical card.
- **A fix for a fault first seen on the real card is not done until
  Real-timing reproduces the fault red, and then passes.** If Real-timing
  cannot reproduce it, the practice card is missing a behaviour: add it to the
  `real` profile (with its trace), then write the red test.

## Keeping the practice card honest

The Real-timing profile is only as good as its numbers. When the physical
card's behaviour changes (a firmware release, a new Wi-Fi setup), run the
contract check: it replays one fixed read-only request script against both the
physical card and the Real-timing practice card and prints where shapes or
timings drift beyond tolerance (timing: more than 40 ms AND 50% apart on the
median). It runs on demand, never in CI:

```
cd lightweaver && npm run practice:contract            # card at 192.168.18.70
npm run practice:contract -- --card lightweaver.local --json report.json
```

A drift line is either the practice card being wrong (fix the simulator or the
profile, citing a trace) or the real card having changed (record a new trace,
then update the profile).
