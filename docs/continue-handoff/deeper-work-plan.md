# Deeper work plan — four repos

Written 2026-09-22 for a higher-model pass (Fable or Astra). This is a sequencing plan, not permission to merge. Nothing here is on `main` yet.

## Already in draft pull requests — do not redo

- Teajia: [Freight, currency, and test fixes](https://github.com/storyoftheleaf/teajia/pull/295). Freight child-table test, long-read wait, alt sandbox admin, cost-refusal wording tests, Tea Compass yuan default not stamped as stated, wholesale null price refused, dead `payment_status` annotated, two Save buttons named apart.
- Art site: [Registry docs, desk red, rebuild paging](https://github.com/adroart/Adrian-Website/pull/137). Letter-schedule test was already correct. Lying `todo/README.md` deleted. Registry guide covers Piece Records. Delete controls use the existing quiet red. Bulk rebuild pages at 25.
- Mandala Codes: [Cast-content, atlas tests, status docs](https://github.com/adroart/mandalacodes/pull/231). Cast-content points at each card's moving lines. Two Atlas tests mock `/api/atlas`. Stewardship field uses paper. Status buttons wrap. Status docs re-measured. Card 64 nature names were already fixed.
- Lightweaver: [Studio refusal, meters, and fixture fixes](https://github.com/theyemingzhu/LED-Programming/pull/308). Card refusal reads `detail`. Abandoned firmware-release branch is named, with the one delete command. Band meters decay to zero when listening stops. Section test uses compiled zone ids. That pull request did edit `package.json`, the site deployed, and the signer did not run. A lone `package.json` edit is not a signed release. A lone `.github/workflows/test.yml` edit is.

## Started after this plan was written

A normal implementer is doing these. A higher-model pass should not restart them. It should check the resulting drafts and then take the hard list below.

- Teajia: invoice `customer_id` must belong to the writing account; lease the invoice save/split race the way fulfill and void already do; stop showing the obsolete offer-led review queue; fix or honestly update the product-page amount control that renders `50g0.19/g`.
- Art site: search the registry by who holds the piece, and a door to the permanent record on the collector path. Do not also pin Node or fix the expired invitation date in that same branch. The unit suite's 356 failures are Node v22.14 `node:sqlite` binding. On v22.22.2 the only real failure is an invitation dated 2026-09-18.
- Mandala Codes: make the red mobile CI lane visible. Do not turn every merge red if the failures are the hidden recorder / progress rail, which is a product call. Do not delete those tests.
- Lightweaver: the five stranded notice sites only. The contract-gate workflow edit was stopped. A lone `.github/workflows/test.yml` edit fires the signed firmware release, and there is no pull-request CI to add those gates to. The three gates already run on push to main.

## Hard agent work — this is the pass to sequence

Do these only after the drafts above. Order inside each repo is a proposal. Change it if the code disagrees.

### Teajia

Verified by the leftovers pass on 2026-09-22. Constraints: nothing entered is NULL; a typed 0 is real; yuan is Adrian's stated shelf currency but must not become a schema DEFAULT; a migration that changes rows must be shown to him before it is pushed; do not change nav or tab labels. Do not start another Teajia branch until the invoice batch and PR 295 are merged or explicitly stacked. Four items are already in that invoice batch: cross-account `customer_id`, the save lease, the offer-led queue, and the `50g0.19/g` amount control.

1. Put the `src` unit tests on a CI lane. None of the 136 files under `src/` run in CI. About 1794 assertions, 127 of 132 files already green. Two root causes for the rest: `localStorage is not defined` via `getToken()` in `src/lib/api.ts`, and one assertion on pay-sheet copy removed by the creator-profiles rework. Re-point that assertion. Do not delete it to go green. Do this after PR 295 merges so the lane covers those guards. This slice is not in TODO.md.
2. Ratchet the worker typecheck, then drain it. The backlog is 38 errors, not 35, in the same seven files, and it grew because nothing gates it. Add the CI step now, with the current 38 listed the way `KNOWN_FAILING_E2E` is listed, so a 39th fails the build. Do not clear the list with casts. Sixteen errors sit in the Curate import path that writes cost, currency, and freight, including a `FinalizeReceiptLine` missing `transportMode` on the only trustworthy record of what was paid. Drain per file afterwards, each read as a bug report.
3. Register products / product_listings drift. Build one database from the ledger and one from `schema.sql`, diff `PRAGMA table_info`, and record each disagreement (`year`, `updated_at`, `account_id`, `catalog_visible`). This changes no row. Correcting the live database afterwards is a separate data-moving migration and needs a page shown to Adrian before any push.
4. Hoist the three helpers copied out of `index.ts` (`EVENT_STATUS_BY_LIFECYCLE`, `slugify`, `articleToApi`). Move `cascadeWaitlist` in the same pass so RSVP deny, waitlist, and cancel are not a second copy of a promotion rule.
5. Drop `curate_import_batches.shipping_rate_per_kg`. This is not a table rewrite. Migration 0018 already used `ALTER TABLE ... DROP COLUMN` on D1. A bare drop has no `UPDATE`, `DELETE`, or `INSERT`. Confirm nothing reads `shippingRatePerKg` off the finalize payload first. It is irreversible.
6. Publish gate, as a design pass with a written result and no ship. The fourteen `/read` pieces are hand-written React components with the prose inline as JSX. Ten are drafts. Nothing passes through an API. Withholding the text means either refusing a draft's JS chunk from Pages middleware (which needs named `manualChunks`, because Vite hashes them) or moving draft prose out of those components. The forged-token half is the same move. Do not hand this to an implementer as "add a server read."

Stale, leave unchecked only if the line is already wrong: the stock-page currency select was fixed in `684ed78e` and its title is already out of `KNOWN_FAILING_E2E`. The empty-rates bug that printed yuan as dollars looks addressed by `initialDataUpdatedAt: 0` in `03b21269`. Confirm, then check them off. `formatMoney` does not throw on `'Yuan'`. `worker/src/index.ts` wraps `Intl` in try/catch. Customer-facing yuan and NT display is still a decision, not a crash.

Do not rebuild tables for the remaining schema defaults. `products.cost_amount DEFAULT 0` is unreachable through every code door. A database-level refusal of a missing `account_id` cannot use the 0018 drop-column trick: SQLite cannot add `NOT NULL` to a populated table without a default, and a rebuild risks the `articles` cascade. The guard test may be the permanent answer. That is Adrian's call.

### Art site

Verified by the leftovers pass on 2026-09-22 against `origin/main` at `be723b6`. Constraints: do not flip launch flags; do not touch Stripe secrets or production D1; collector wording in `todo/plans/collector-screen-wording.md` is locked. Search-by-holder and the permanent-record door are already in progress. Do not start a second art-site branch until that draft exists.

The suite baseline outranks the feature list. `npm run test:unit` is 1213 tests with 356 failures on Node v22.14.0 and 1 failure on v22.22.2. The 356 are `node:sqlite` parameter binding. The repo has no `.nvmrc` and no `engines` field, so nothing says which Node the harness needs. The one real failure is a date: `tests/add-to-piece.test.ts` posts `expiresAt: '2026-09-18'`, and the invitation API refuses any expiry at or before now. The suite went red on the calendar, not on a code change.

1. Make that invitation expiry relative to now, and pin the Node version the harness needs. Prove it by that test going red, then green, on the pinned Node. Until this is done, a green claim against the 356 is meaningless.
2. Check off the pending-sale viewer. It is already built: `/admin/atlas-sales`, `components/admin/AtlasPendingSales.tsx`, `functions/api/admin/atlas-sales.js`, two passing tests, shipped in PR #133. `TODO.md` still says nothing reads the queue and tells you to query production D1. Delete that recipe. Do not build a second viewer.
3. Find a piece by who holds it. One whitelisted param plus a join from `keeper_pieces.keeper_user_id` to the Better Auth user. Indexes exist. No migration. The detail endpoint already returns a steward email. A searchable list of holders is a new shape, so the list projection needs a privacy review. Proof is the existing registry maintenance tests.
4. Permanent-record door on the collector arrival, before any plate-URL move. `components/collector/api.ts` defines the record path and nothing imports it, so a scan routes past the only door once the flag flips. The label is unwritten. Use `placeholder()` in `copy.ts`. Do not touch a locked line.
5. Plate URL, first slice only. A plate stays `/qr/{code}` to `/works/{piece}?instance=AR-…&ref=qr`. With `livingLegacy` on and a verified identity, `WorksPage` already hands off to `WiredCollectorArrival`, but in an ad-hoc column instead of `CollectorDisplay`. Put that existing branch in the shell's full frame. Do not retire the legacy stack or make it the default. That end needs Adrian, including whether `/collector` stays publicly routed.
6. Configurator: test the live wizard, then fix the step 1 to 2 scroll. The edition-closed gate is already correct on the live path. Both named bugs live in `components/PieceConfigurator.tsx`, which is imported nowhere. The live wizard is inline in `PiecePage.tsx` and has no tests. Do not consolidate onto the orphan. The shop launch it serves is still blocked on Adrian.

Not next, but next in line after these: rerun the browser smoke gate with network, and the collector copy drift (111 inline `ph()` strings, and `copy.ts` still carrying the retired reissued-plate body).

### Mandala Codes

Verified by the leftovers pass on 2026-09-22. Constraints: go-live ops are ON HOLD (2026-08-09). Do not apply D1 migrations, set webhook secrets, or claim light number one. Oracle prose is Adrian's voice. Do not edit `.github/workflows/test.yml` while the mobile-visibility pass is still open. `gh` cannot read this repo's CI logs from a cloud session.

1. TODO truth pass. 27 of 109 open lines are exact duplicates. Five more are already done and should be checked off, not rebuilt: Card 57's empty nature names, Card 64 KEYS names, the kinship-arc cap, `components/AdminPieces.tsx` (not on main), and admin outreach status. Outreach is built (`functions/api/atlas/stewards/outreach.ts`, the select in `AdminAtlas.tsx`, unit test) but sits behind the 410 boundary, so it is unreachable, not missing. The 384 changing lines exist as six written lines per card and are not placeholders. Fix the status claim. Leave the voice pass you-required. Do not mark it agent-done.
2. Teach `oracle-tells.mjs` to count subsection openers, including RELATIONS. The TODO's KEYS sweep is stale. "The inward face of the Shadow" now appears zero times. Phase 1 already ran on all 64 cards. What is there now: Repressive opens "This person …" on 41 of 64, Reactive opens "Here …" on 26 of 64, and "stands above" is 49 of 64 inside RELATIONS, which the counter skips. The count is agent work. Another rewrite of those openings is Adrian's, and it is time-sensitive because the formula will print into the workbook.
3. After the visibility pass: one untruncated mobile count is already measured on clean main at `b9da484`: **41 failed, 80 passed, 10 skipped of 131, in 11.6 minutes**. Draft [PR #232](https://github.com/adroart/mandalacodes/pull/232) makes the count visible in the run summary and keeps the artifact on cancel. The job still says success because of `continue-on-error: true`. Making it block merges is branch protection, which only Adrian can flip. Do not raise timeouts or skip specs to buy green. Do not turn main red over the recorder, progress rail, or "Your codes" tile. **Nothing in that PR takes effect until GitHub billing is restored** — every CI run since 18 Sep fails at the gate in three seconds with a payment/spending-limit annotation, so `test` and `test-mobile` are both skipped. Separately, `npm run typecheck` fails on clean main with six errors in `workers/media.ts` that landed during that outage; the existing `functions/` Cloudflare-types pattern extends to `workers/` in a two-file change.
4. Triage only the mobile failures the 2026-09-08 audit never attributed, after the count. Each fix must go red when reverted.
5. Close the last two honest-boundary call sites (`PiecePage`, `lib/atlas/catalog`). The boundary plan itself has landed. Do not re-plan it.
6. Typist loop, but not as the TODO specifies it. The plan addresses marks by margin numbers (`U1`, `I14`). The workbook script records Adrian's 2026-09-16 settlement: no numbers, no marks, no strip. Build it anchored on the quoted sentence, refusing an ambiguous match by name. Putting numbers back would change the workbook, which is his call. The handwriting itself stays his.

### Lightweaver

Verified by the leftovers pass on 2026-09-22. VERSION on main is 1.1.39. Do not bump it for a Studio-only change. Do not edit firmware C++ unless the slice is parked on the firmware queue.

The package.json rule in the old TODO is backwards on current main. A lone `lightweaver/package.json` edit does not bump VERSION. PR 308 did exactly that (`6212c958`), the site deployed, and the signer skipped because `firmwareBundleOnly()` is true. What does force a bump is editing `.github/workflows/test.yml` alone. The release-path classifier strips `test.yml` out, the changed-path list goes empty, and `firmwareBundleOnly` becomes false, which is the answer that runs the signer. Do not "fix" that by pairing in a package.json edit unless Adrian asks. There is no pre-merge CI. No workflow has a `pull_request` trigger. The last 60 `test.yml` runs were push or manual. Every "put this in the merge gate" line is describing a post-merge gate on main. The three contract gates already run in those lanes.

1. Retire stale TODO entries. No bump. F33b is already merged (`87fd8271`, 2026-09-09). The https recover test is unskipped and in `ci:browser-smoke`. Three of the eight red-spec descriptions are outdated: `layout-hardening` `>= 300` was moved to 180–240, kaleidoscope glyph keys became word labels, and the universal-install `details` count was scoped. Replace the package.json deferral paragraph with the measured rule above. Do this first so later slices are not aimed at work that is gone.
2. Pre-merge CI is a decision, not a patch. `test.yml`'s header records a deliberate choice to prove pull requests locally. Preparing a paired diff is possible. Merging it is Adrian's, because a solo `test.yml` edit lands a spurious signed release.
3. Measure the eight browser specs once, then split stale from real. Expect `wiring-workspace` to need one layout-specs click. Treat `layout-primitives`, the two flash-copy tests, and quiet preview as the unknowns until a run says otherwise. One spec at a time. Do not delete a spec to go green.
4. Re-measure `connection-center-quality` before fixing isolation. The recorded cause is weak: one `beforeEach` clears storage, tests are not serial, and each test gets a fresh context. It still fails alone at a different assertion than in CI. Fix only what a fresh run shows.
5. Transport sweep, together with the `canPushDirectlyToCard` audit gate. All four claims are still live, and the F36 guard never scanned `src/lib/**`. This decides which transport a real card write takes on https, so it is not a casual edit. Studio-only source can land now and reaches a card only at the next signed release. Do not bump VERSION to ship it.
6. Notice layer. Five stranded action sites, then 15 field wrappers, not ~30. The multi-action API already exists. Leave the setup-journey chip where it is. That move has no target UI yet.

Pattern Lab join cannot be staffed as written. The plan locks Phases 2–5 to `cursor-grok-4.5-high-fast`, and 4.5 is not available here. Only Grok 4.6 may amend that plan, and 4.6 must not implement it. Patterns at 390px is owned by that plan, so it waits too.

Firmware leftovers stay parked: `colorOrder` on the playback gate, config/wiring/Wi-Fi with no readiness gate, `/api/status` omitting `wifi.proven`. Reliable Chip Closure needs a bench. Do not burn a VERSION bump for any of them alone.

## Needs Adrian — do not start

### Art site

- Where each piece ships from, and how long it takes. The shop stays off until this is a conversation, not a cart. A ship-from and lead-time field per piece is the one shop step that opens no cart, and it still needs his yes.
- Detail photos (31 of 173 pieces have one) and the 72 pieces that share four descriptions.
- Six dark launch flags: `furniture`, `installations`, `spaces`, `aboutMeaning`, `pricingExplorer`, `livingLegacy`. No agent flips one. Whether `/collector` stays publicly routed is part of this. It is routed unconditionally, and the checklist still calls it dev-only.
- Approve passing by email before any of that backend: read the address back, a verified account on that exact email, 30-day expiry, the sender can cancel, nothing moves until acceptance.
- Pick the "already held" claimant screen. The silence machinery already works. The last placeholder is the choice.
- Plate permanence in the admin, not only on the screen. The screen promises one number forever, and `replace_plate` still mints a new public code.
- Write the shipping policy. The page is agent work the moment the words exist.
- Collector click-through and remaining wording. Registry handover: handbook lines, custody envelope, catalog snapshot backfill, plate design, canary. Drive sync, `STRIPE_WEBHOOK_SECRET`, and the proof-before-engraving gate.
- Keep or strip Bali in the bio. SEO watch is a month of Search Console, not a code change.
- Enter historical verified sales. Finish materials, maker, and wording per artwork.

### Teajia

- Home page direction. Tea-master editing boards. Invitation-only tea-master onboarding.
- Cost currency per vendor. Most of the shelf was not stated. His rule is yuan, but applying it moves shelf prices. Preview before confirm. Needs the MCP session.
- Connections page (people and suppliers, not the spaces page it still opens).
- What an event charges, per seat or per tea. Product form for the 117 products with an empty `form`. Which teas belong in the starter sets (every set currently lists "Unavailable item" and the buy button adds nothing).
- Consent line before a customer tasting can be published.
- Whether a saved inventory view gets its delete control back, and whether 10px Curate labels should be 12px.

### Mandala Codes

- Go-live ops, all of them, until the ownership record move is finished. Claiming light number one is not reversible.
- Where intention is anchored. The three atlas cuts. Sign-in headline "Keep your chart". Keep or drop the five waiting registry rows.
- Rewrite the 64 opening readings. Hand pass in the printed workbook. Pilot five cards. Invocations for cards 2–64. Card 39's copied Root paragraph. Re-lock cards 1 and 2.
- Whether the hidden recorder, reading progress rail, and "Your codes" tile should come back.
- Offline promise: say it out loud or not, what a reader sees when something needs a connection, gallery iPad, offline reflections.
- Piece stories, studio photos for the making strip, flip finished pieces to the take-it-home door.

### Lightweaver

- Keep `led.mandalacodes.com` or move. A new origin has to ship in firmware and be taken by cards in the field before the site can move. The allowlist is exact, on purpose.
- Render watchdog 1.2s give-up on a phone. Three pattern-lab tests are skipped against this decision.
- Trust the card Studio just updated. The safe correlator exists and is not called. It touches the firmware-update path.
- Bench: section flash, four-sections build, wiring signoff, Wi-Fi recovery, security fixes, ten-minute Pattern Lab evolution, Voices aesthetic rules, Swell reach.
- Card OTA self-update vs Studio-initiated only. AI endpoint auth if the Pi is ever exposed. Private cloud library provisioning.
- Whether pull requests should run CI. The workflow header says they are proved locally on purpose. Turning that on is not a one-line patch.
- Amend the Pattern Lab join plan. Phases 2–5 name a model that is not available. Only Grok 4.6 may rewrite that contract, and it must not implement the join.

## Do not do

- Revive the art-site to Mandala Codes sale webhook. The receiver answers 410. The sale now writes into the art site database.
- Set `SALE_WEBHOOK_SECRET` as if that chain were alive.
- Bump Lightweaver VERSION to land a Studio-only change. A lone `package.json` edit does not require one. A lone `.github/workflows/test.yml` edit does, and fires the signer.
- Re-do F33b. It merged on 2026-09-09.
- Implement the Pattern Lab join on Grok 4.6, or staff Phases 2–5 with Grok 4.5. 4.5 is not available, and 4.6 may only amend the plan.
- Mark the 384 changing-line texts done just because the files contain six lines per card. They do. The remaining work is voice.
- Rewrite Mandala Codes KEYS openings from the old "inward face of the Shadow" stem. That stem is already gone.
- Build the typist loop against margin sentence numbers. The workbook no longer prints numbers.
- Delete mobile tests to make a red lane green.
- Clear the Teajia worker type backlog before the check exists. Gate the current 38 first, or the count keeps growing.
- Treat the import-batch freight column drop as a table rewrite. It is a `DROP COLUMN`.
- Treat `formatMoney('Yuan')` as a throw. It already falls back.
- Open the shop, flip `livingLegacy`, or run collector go-live from this plan.
- Build a second pending-sale viewer. `/admin/atlas-sales` already exists. Do not query production D1 as the workaround.
- Chase the art-site screenshot sandbox from a cloud session. There is no sandbox config in the repo. Do not weaken a sandbox to make screenshots work.
- Retire the legacy certificate stack, or make the collector body the default plate page, before the flag decision.
- Touch the "What shows" lamps. That screen was deferred in Adrian's own words.
