# Card Home: status, not steps

Synthesis of four read-only code surveys, 2026-09-11. Step 1 (the pure cut) shipped as PR #272, Studio build 1822. Steps 2-7 below are the remaining work; each is its own PR. Decisions taken by Adrian 2026-09-11: an older-but-working card is "ready" (Update stays secondary); pattern preview on unplaced lights is advertised from Card Home; the two-question colour solver is the one colour-order UI; artwork placement is the last, optional facts row. Visual of the decided model: the "Round 4" page of the Lightweaver Card Home canvas.

## 1. The diagnosis

Placing lights in the artwork is a prerequisite of nothing. The install control never reads `project.layout` (survey 1, `CardInstallAction.jsx:95-107`, grep confirmed), the install payload carries no layout (survey 1, `CardPushControl.jsx:219-221`), and a pattern preview needs only a connected, non-blank card (survey 1, `cardAccess.js:56-72`). The ladder claims a fixed order connect → lights → place → test-and-save; the code enforces only connect → lights → install, and even that order is bypassed by three early returns (`setupJourney.js:298-337`) and overridden wholesale when the card already matches (`phasesFor(..., true)`). The consequence for the owner: on a half-set-up card the screen tells him he is "on phase 3" and hides phase 4 as upcoming while he is, legitimately, tuning patterns on unplaced lights; and it can only show the six editable facts once he reaches the last rung, one of which (power) it reads from a path nothing writes.

## 2. What is actually required, and in what order

Read as "X requires Y". Everything cites `setupJourney.js`, `cardAccess.js`, `cardLiveControl.js`, `CardInstallAction.jsx` via survey 1.

**Talking to the card requires** a link in `connected-direct` or `connected-bridge`, an observed card id that equals the expected id when one is set, a host other than `192.168.4.1`, no `firmware-too-old` or `install-safely` stage, no pending Wi-Fi step, no `operation-uncertain` or `failed` link (`connectBlockers`, lines 85-139). Nothing else.

**Previewing a pattern on the card requires** talking to the card and `playbackAccess !== 'blank'` (`derivePlaybackAccess`, lines 56-72; `lw-pattern.jsx:681-693`). It does not require the open Studio project to match, counted lights, confirmed colour, or a layout.

**Keeping a look on the card (persisted control) requires** an exact installed match: card id, project id, fingerprint, revision (`decideLiveControlProjectAuthority`, lines 96-121). Legacy empty-fingerprint cards satisfy this only through the recorded stand-in (anti-list).

**Installing a project requires** `compiledWiring.ok`, every strip mapped to a wire run, and `commissioningVerified` (`evaluateCardInstallGate`). Compiled wiring is outputs with a pin and a counted pixel count. Colour order rides in the payload but is not a gate; an unconfirmed colour order installs fine and simply looks wrong. Power limit likewise.

**Counting lights requires** an output to exist (`lightProgress`: `output` → `color` → `count`, lines 191-225). `boundary` is an alias of `count` (line 198), not a fourth fact.

**Placing lights in the artwork requires nothing, and nothing requires it.** `lw-layout.jsx` has zero references to the setup journey; `layoutProgress` reads only `layout.starterPending` and `layout.strips` (lines 227-239); the payload never carries it. It is a Studio-side design fact, not a card fact.

**Firmware** gates only through `firmware-too-old` inside connect. A merely older-than-published card is fully usable (`stale-firmware` harness state plays patterns; survey 2).

So the real graph is a fork, not a ladder: connect → (count and confirm lights) → install; and, hanging off connect alone, preview. Phase 3 is decorative. That means the ladder is not a sequence the owner must climb; it is four status predicates, three of which matter, and the screen should render them as status, not as steps.

## 3. The model of the screen

The four-phase ladder is replaced by a **status row, a facts grid, and a missing list**, all derived from the predicates that already exist in `setupJourney.js`. No new state store: the URL stays the only record of where the owner is (anti-list), and the predicates stay where they are.

**Heading** (one line, 20px): the card's name, `exactCardName(cardLink, cardHost)`, or "Lightweaver card" when none has ever been seen. The kicker "Lightweaver hardware" and the 34px "Your Lightweaver" (`lw-card.jsx:1110-1123`) go. The card's name is the only heading that answers (a) "what is this card".

**Status row** — keep `setup-identity-row` (`lw-setup.jsx:1134-1139`, Card / Connection / Project / Installed) and make each cell a button: Connection opens the connect panel (`lw-open-connect-panel`), Project opens the Projects panel (`requestProjectsPanel`, today only reachable from Preferences, survey 4), Installed opens the install control. This row answers (a) and (b): what is on the card versus what is open here is exactly its Project + Installed cells (`installRelationship` copy: "Installed project matches", "A different project", "Temporary setup — not installed"; survey 2).

**Facts grid** — six rows, always rendered, each a value plus its one-click editor. It absorbs the ladder's `dl` summary (`lw-setup.jsx:1084-1098`), which today appears only on the last rung.

| Row | Value from | Editor, one click |
|---|---|---|
| Outputs (pins) | `stripOutputs(project)` | `#screen=layout&mode=wire` (`WirePlanTools` / `WireDiscovery`, survey 4 §4). Link only; do not rebuild. |
| Lights (count) | `evidence.count` | `#screen=discovery` (`StripDiscoveryPanel`) when no strips are drawn; once drawn, the `DrawModePanel` stepper needs a selected strip, so the row carries its own per-output count field writing `strip.pixelCount` through `setStripLedCount`. Browser project only; the card is still written only by `CardInstallAction`. |
| Colour order | `led.colorOrder` + confirmed flag | `#screen=card&section=settings&tool=color-order` → `StripColorOrderCheck` (exists: `lw-card.jsx:764`). |
| Power limit | `led.maxMilliamps` (not `power.*`) | Re-mount the `persistPowerSettings` fields beside Brightness limit in `SettingsScreen mode="card"` (Hardware fold), so it is one click like colour order. Today only in Layout → Wire (survey 4 §3). |
| Project on card | `cardState.status.projectId` vs open project | Projects panel; the Resolve banner's three options fold under it as alternatives. |
| Firmware | card build vs published | `#screen=card&section=install` → `AutomaticInstallScreen` (exists). Row reads the two build numbers. |

A seventh, last row, "Artwork placement · optional", value drawn/not drawn, opens `#screen=layout&mode=draw`. It is the honest home for phase 3.

**Missing list** — answers (c). Rendered only when non-empty: one line per unmet predicate in dependency order, taken from `journey.blockers` and the `lightProgress` items that are not `done`, plus `commissioningVerified`. Layout is never in it. Each line is the same button the ladder's `renderActiveTask` already renders for that task id (`setup-connect-card`, `setup-lights-action`, the install slot), so no task copy is lost, only the four headers, the numbering, and "Phase N of 4".

**One primary** — answers (d). The first line of the missing list, or, when the list is empty, the ready banner's `setup-open-patterns` (keep, `lw-setup.jsx:1196`). Everything below yields, as today (`yieldPrimary`, blueprint H3). Patterns is a door whenever the card talks and is not blank, styled secondary until installed.

Justification: the shortcut branches already treat the ladder as status (they stamp all four done without reading sub-items); the missing list is that same truth without the fiction of order.

## 4. Per-entry-state behaviour

State ids from survey 2 (`cardStates.ts`).

- **factory-blank** — status row: Installed "Nothing installed". Primary: "Save this project to the card" → `task=install-project` (keep `setupTaskId`); the write still waits for the owner inside `CardInstallAction` (anti-list). Missing list: outputs/count if unmet. Folded: Hardware, Advanced.
- **provisional** — Installed "Temporary setup — not installed" (keep). Primary: first unmet of count/colour, else "Install on card" (`la-card-push-btn`). Folded: Checks & recovery open with "Clear temporary setup" (keep, `lw-card.jsx:762`). Keep the rule that this never reads "complete" (`setupJourney.js:398-407`).
- **installed-match** — Installed "Installed project matches" (keep). Primary: `setup-open-patterns` (keep). Missing list absent; grid only. Proven by matrix [T6].
- **installed-different** — Project on card row: "Someone else's piece"; open here: the Studio name. Primary: the connect task's single recommendation "Use this card's project" with alternatives folded (keep `lw-setup.jsx:906-922`). Grid shows the open project's values.
- **installed-legacy-fp** — no separate UI (keep). Before adoption reads "Same project, not yet verified"; primary "Use this card's project". After adoption, identical to installed-match via `legacyFingerprintBinding`.
- **blackout** — top line adds "lights off". Primary: `recover-lights` in `card-blackout-notice` (keep, `lw-card.jsx:1012`); Patterns door demotes to secondary (keep, `lw-setup.jsx:1188-1195`).
- **playing** — as installed-match; status row Connection cell names the running pattern.
- **wiring-open** — Installed "Light test open on card". Primary: `CardPushControl`'s confirm/restore pair (keep). Ready banner stands down (keep `wiringTestActive` guard). Missing list hidden.
- **stale-firmware** — as installed-match; Firmware row reads "build N · release M" with "Update card" (keep `setup-update-card`, now on the row, secondary). Cell stays `test.fixme` until the trust decision (§8).
- **not-ready** — Connection "Answering, runtime starting". Primary: "Verify hardware" / "Recover lights" in Checks & recovery, force-open (keep, `lw-card.jsx:727-742`, spec [T5]). Card-touching editors disabled; browser facts stay editable.
- **slow-to-answer** — Connection "Connecting…" until the first answer; primary disabled meanwhile (keep, [T1]/[T5] resolution).
- **real-card-as-found** — bench project id claiming `provisionalSetup:false`, wiring open. wiring-open behaviour wins: primary is "Discard old test and retry"; Installed reads "Temporary setup" by project id, not by the flag.
- **unreachable / disconnected** — heading: last known card name. Connection "Not connected". Primary: `setup-connect-card` "Find my card" (keep; card-workspace 'disconnected Card Home names the state…' line 1555). Grid shows the open project's facts, editable; card-touching routes disabled. Everything else folded.

## 5. Cut list

Fails the deletion test → absorbed by:

- Second "Open Patterns", `setup-verify-action` (`lw-setup.jsx:1109`) → `setup-open-patterns` (`:1196`). Survey 3 §3 confirms identical click target.
- The lede above it (`:1105`) → the install control's own copy.
- Four phase headers, numbering, "Phase N of 4" (`lw-setup.jsx:1235-1262`, `setup-progress`) → missing list + grid. Predicates stay in `setupJourney.js`.
- Ladder `dl` summary (`:1084-1098`) → facts grid. Its Power row (`:1097`) reads an unwritten path.
- `presentation.primary/secondary/tertiary` and the `go` prop into `CardHomePanels` (`lw-card.jsx:115`, `:1055`; never called, survey 4) → delete fields.
- "Detected state" panel (`card-detected-state`) → the status row's Connection/Installed cells; it already hides when `redundant`, and its remaining messages restate the row.
- Kicker + 34px h1 (`lw-card.jsx:1117-1123`) → card name.
- `lww-install-ready` status paragraph above a button whose sub-label already says "Ready to install" (survey 3 §3) → the button.
- Always-rendered `card-batch-link` (`lw-card.jsx`, survey 3) → the same button in the Advanced fold.

**Must not be cut:** `setup-identity-row` (becomes the status row); `setup-card-ready` doors; `card-blackout-notice`; Checks & recovery with its talk-gated open rule; the Resolve banner's three options (folded, not removed); `CardInstallAction`/`CardPushControl` (the only writer); Hardware and Advanced folds; the card-state matrix and harness (anti-list).

## 6. Defects found along the way

- `lw-setup.jsx:1097` reads `devices.standaloneController.power.maxMilliamps`; the writer is `led.maxMilliamps` (`powerSupplySettings.js` via `WirePlanTools.jsx:442-464`). The row always shows the fallback.
- `CardHomePanels` `go` prop (`lw-card.jsx:115`, passed at `:1055`) is never called; `presentations.*.primary` actions are dead (survey 4).
- `verification` completion path (`setupJourney.js:241-265`, branch `:395-397`) has no production caller; documented dead in its own comment.
- `boundary` sub-item is aliased to `countDone` (`setupJourney.js:198`), rendering a fourth item that can never differ from count.
- `not-ready` (`cardStates.ts:156-162`) and `real-card-as-found` are in the harness but absent from `card-state-matrix.md`'s table (survey 2 §5).
- `setup-verify-action` is `disabled={!exactTransport}` while `setup-open-patterns` never is (`lw-setup.jsx:1109` vs `:1196`).

## 7. Build order

1. **Pure cut.** Remove `setup-verify-action` + lede, always-rendered `card-batch-link`, `lww-install-ready` paragraph, dead presentation actions and `go` prop. Files: `lw-setup.jsx`, `lw-card.jsx`, `CardInstallAction.jsx`. Proof: matrix [T6]; card-workspace 'Card overview delegates resumable install…' (`:803`); add to [T6] an assertion of exactly one button named "Open Patterns".
2. **Power path + heading.** Read `led.maxMilliamps`; h1 → card name, drop kicker. Files: `lw-setup.jsx:1097`, `lw-card.jsx:1110-1123`. Proof: new `tests/card-home-facts.spec.ts` seeds `led.maxMilliamps` and asserts the mA value.
3. **Facts grid** replacing the `dl`, linking only to existing editors. Files: new `src/components/card/CardFacts.jsx`, `lw-setup.jsx`. Proof: card-home-facts asserts each row's target hash for installed-match and factory-blank.
4. **Missing list** replacing the ladder; `layout` leaves the predicate chain. Files: `setupJourney.js` (add a `missing()` selector; keep `phases` exported), `lw-setup.jsx:1235-1262`. Proof: matrix [T1]/[T6], card-workspace `:1555`, card-home-facts for provisional.
5. **Power editor** re-mounted in the Hardware fold. Files: `lw-settings.jsx`. Proof: card-home-facts.
6. **Project row** opens the Projects panel from Card Home. Files: `lw-card.jsx`, `app.jsx`. Proof: card-workspace 'Hardware loads the verified production project…' (`:1169`).
7. **Doc.** Add `not-ready` and `real-card-as-found` rows to `card-state-matrix.md`.

## 8. Needs Adrian

- **Firmware trust:** is an older-but-working card "ready"? Recommend yes — Update stays a secondary action on the Firmware row, never the primary, never automatic; that flips the `stale-firmware` fixme to a real test.
- **Advertise preview on unplaced lights:** recommend yes — the Patterns door opens as soon as the card talks and is not blank, labelled "preview only until installed".
- **Colour-order shape:** recommend the two-question solver everywhere; the Patterns "Shift colors" quick mode mounts the same component, so one shape, no six-chip shifter.
- **Artwork placement on Card Home at all:** recommend the last, optional row; it is a Studio fact, not a card fact.
