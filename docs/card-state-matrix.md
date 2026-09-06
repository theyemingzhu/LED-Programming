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

## What it found on its first run

Two things, and the split between them is the point.

**Nine of twenty-one first-run failures were the fixture, not Studio.** The card
states named pattern ids (`drift`, `ember`) that do not exist in the card's
pattern bank, so Studio correctly refused them. Reported without checking, that
would have been nine invented bugs. The rewrite that made the simulator
faithful to the firmware — every required field, readiness derived rather than
authored — is what separated them.

**One real defect, and it was the one stopping the owner at step one.** Card
Home probes for a matching Studio project by itself on every card read, and
reported "No active Studio project exactly matches the project identity on this
card" as a red alert on the first screen, before the owner touched anything.
That is the ordinary condition of a card whose project this browser has never
held, and the screen already offers the two real answers directly below it.
A probe now says nothing when it finds nothing; a load the owner asked for
still reports its failure in full.

**One open question, marked not deleted.** The `stale-firmware` cells are
`test.fixme` — see the comment above them and the TODO entry. They are the
specification of a fix that is waiting on an owner decision, and they turn
green the moment it lands.

## The simulator's wiring-test lifecycle, and its fault helpers

`tests/harness/cardSimulator.ts` grew a fourth capability beyond state,
refusal, and offline/online: a truthful wiring-test lifecycle, added so
`tests/journey-continuity.spec.ts` could put a card into the one state this
matrix cannot — mid a live light-test probation — and check that every setup
surface agrees about it (docs/plans/2026-09-05-unified-card-journey.md, J13).

**Before this, `/api/wiring/status` kept answering `staged` forever after
`/api/wiring/activate`.** Nothing on the write side had told the read side the
card had rebooted with the candidate live, so no browser test could reach the
firmware's real `testing` / `awaiting-confirmation` state — the state behind
`confirm-visible-lights`, the one task the setup journey and the working-screen
chip most needed to be checked for agreement on.

**`beginWiringTest(options?: { pixels?, pin? })`** puts the card straight into
that state — as if `/api/wiring/activate` had already run: probation begins
(`remainingProbationMs` counts down from `LW_WIRING_PROBATION_MS`), the boot id
changes (a real card reboots to run the candidate), and `/api/wiring/status`
answers `state: 'testing'`, `candidateState: 'awaiting-confirmation'`,
`activationId: 'act-matrix-1'`. Call it before `card.install(page)` or after —
it mutates the simulator's live state object, which every response reads at
request time, not at install time.

**`expireWiringProbation()`** is the other end: the card's own clock elapsing
with nobody confirming or rolling back, exactly what firmware does on its own
when nothing calls `/api/wiring/confirm` before the deadline. It restores the
pre-test pixels/pin, clears the probation flags, and reboots (a new boot id
suffix). A test calls this, then reloads or re-reads the card, to prove a
surface stops asking to confirm a test that has already ended.

The existing `/api/wiring/activate`, `/confirm`, and `/rollback` handlers
already modeled the full write-side lifecycle (staged → testing → confirmed or
rolled back); `beginWiringTest`/`expireWiringProbation` are the two states a
test needs to *start from* without re-driving the whole activate/confirm
dance through HTTP first.

**Fault helpers already in the simulator, worth knowing before reaching for a
raw `page.route` override:**

- **`refuse(path, { status, body?, times? })`** — the request is never applied;
  the card answers with a real firmware refusal (defaults to the HTTP 423
  "runtime not ready" shape, the commonest real one). Use this for "the card
  said no."
- **`respondThenDrop(path, { times? })`** — the opposite failure: the request
  **is** applied for real (the state mutates), but the HTTP reply is withheld
  (`route.abort('connectionrefused')`). This is what makes "a lost reply after
  a successful write" testable at all, and it is the one `journey-continuity.spec.ts`
  uses to check that Studio does not turn that silence into a duplicate
  command.
- **`goOffline()` / `goOnline()`** — every route on every modeled host aborts
  with `connectionrefused` until `goOnline()`. Models a dropped Wi-Fi or a
  pulled plug, not a refusal from a card that is still there.

All four compose with the wiring-test lifecycle and with each other on the
same simulator instance — they are independent knobs on one mutable `state`,
not separate simulator modes.

**`/api/zones` reports `state.zoneIds`, not a hardcoded `'zone-all'`.** Added
for `playlist-storage.spec.ts` (A5): the matrix's abstract fixtures never
declare a project with real zone topology, so `zoneIds` defaults to
`['zone-all']` and nothing here changes. A real project can hold more than
one zone (a default project's separate "outer circle" / "inner circle"
board, for instance), and `syncRuntimePackageToCard`'s save-then-verify
install (`waitForCardZones`) requires every one of those ids to come back
from `/api/zones` before it calls the save confirmed. `/api/config`'s
non-wiring-change apply branch now adopts the *full* id list from the
pushed project's own `config.zones`, so that verification reads back the
zones the card genuinely holds instead of a fixture default no pushed
project ever declared. Ranges are still computed fresh from the current
pixel count on every call, never snapshotted, so a wiring change that
resizes the strip can't leave a stale zone shape behind.
