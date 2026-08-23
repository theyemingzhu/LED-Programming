# The card state matrix

Why this exists: every setup bug Adrian hit was a state nobody had put the card
in. Hand-walking one path and calling it "the journey works" is how each of them
shipped. This is the standing answer — a matrix that cannot forget.

## The three things it proves

Every cell in the matrix asserts exactly the three outcomes Adrian named, and
nothing else. They are the whole contract.

| | Assertion | Measured as |
|---|---|---|
| **A** | Click connect, the card connects | the shared card link reports `connected` within **15s** |
| **B** | A problem resolves itself | **zero** clicks between entry and connected, and no blocker surface rendered |
| **C** | Click a pattern, it plays | the *card's* playing id changes to the clicked pattern within **5s** |

C is asserted against the card, not the screen. A button that lights up while
the strip stays dark is a fail.

## The axes

**Card state (C)** — what the hardware is actually holding.

| id | The card is… |
|---|---|
| `factory-blank` | flashed, on Wi-Fi, holding no project |
| `provisional` | holding the temporary find-my-strips scaffolding |
| `installed-match` | holding a real project that matches Studio's copy exactly |
| `installed-different` | holding a real project Studio has never seen |
| `installed-legacy-fp` | holding a real project, but reporting revision 0 and an empty fingerprint (Adrian's gallery card) |
| `blackout` | installed, patterns loaded, nothing playing (`currentId: "blackout"`) |
| `playing` | installed and mid-pattern |
| `wiring-open` | holding an unconfirmed staged wiring change |
| `stale-firmware` | on a different build from the one Studio remembers |
| `slow-to-answer` | dropping the first few requests, then answering (the discovery race) |

**Browser state (S)** — what Studio remembers.

`fresh` · `remembers-card` · `other-project-open` (real work that must not be
silently replaced) · `same-project-stale`

**Entry (E)** — where Adrian actually lands.

`/` (bare) · `#screen=card&section=install` · `#screen=card&section=setup` ·
`#screen=card&section=overview` · `#screen=pattern`

**Transport (T)** — the split that hid half of these.

`direct` (http localhost — Studio fetches the card) ·
`bridge` (https led.mandalacodes.com — Studio must go through the card's page)

## What actually runs

The full cross product is 400 cells and most are meaningless. Four tiers:

| Tier | Cells | Covers | Runs |
|---|---|---|---|
| 1 | 30 | 10 card states × {bare, install, pattern} × direct | every PR |
| 2 | 10 | 10 card states × bare × **bridge** | every PR |
| 3 | 12 | 4 browser states × 3 card states | every PR |
| 4 | 6 | the real card at 192.168.18.70 | on demand, bench only |

52 automated, 6 live.

## The simulator is stateful, and that is the point

Existing specs stub the card with a frozen JSON blob, so "click a pattern and it
plays" was never assertable — the stub returned the same answer before and after
the click. `tests/harness/cardSimulator.ts` is a real state machine: writes
mutate it, and reads reflect the mutation. It also refuses to model impossible
cards (a ready card reporting no project), which several current fixtures do.

## Running it

```bash
cd "/Users/adrianrasmussen/Documents/Files/2 Areas/Coding/led/lightweaver" && npm run test:matrix
```

Tier 4, with the card powered and on the LAN:

```bash
cd "/Users/adrianrasmussen/Documents/Files/2 Areas/Coding/led/lightweaver" && npm run test:matrix:live
```

Read a run as passed only on `unexpected: 0` from the JSON reporter — a list
reporter's tail hides failures above the fold.
