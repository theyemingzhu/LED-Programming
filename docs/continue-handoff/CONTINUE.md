# Continue here

Single handoff for the next agent. Do not restart the closed batches. Read this, then [Deeper work plan](https://github.com/theyemingzhu/LED-Programming/blob/cursor/continue-handoff-4b0a/docs/continue-handoff/deeper-work-plan.md) for the full sequencing and constraints. This file is the pointer; that file is the detail.

Owner: Adrian. Coordinator already ran two implementation waves plus the first deeper wave. All of it was opened as **draft PRs**. Teajia and Lightweaver are already on `main`. Art-site and Mandala were still landing when this file was last updated (2026-09-22). **Re-check each PR before you redo it.** If it is merged, skip. If it is still open, finish the merge rather than re-implementing.

## Do not redo

| Repo | PRs | What landed |
|---|---|---|
| Teajia `storyoftheleaf/teajia` | [#295](https://github.com/storyoftheleaf/teajia/pull/295), [#297](https://github.com/storyoftheleaf/teajia/pull/297), [#300](https://github.com/storyoftheleaf/teajia/pull/300) **merged** | Freight/currency tests, Compass yuan default, wholesale null-price refuse, two Saves named apart, invoice account check + edit lease, product dock grams vs dollar total, offer-led review queue removed, `src` tests in CI, worker `tsc` ratcheted at **38** known errors |
| Art site `adroart/adrian-website` | [#137](https://github.com/adroart/Adrian-Website/pull/137), [#138](https://github.com/adroart/Adrian-Website/pull/138), [#139](https://github.com/adroart/Adrian-Website/pull/139) | Letter-schedule test, lying todo README gone, registry Piece Records docs, quiet delete red, rebuild paging at 25, holder search, collector record door (placeholder copy), Node **22.22.2** pin, invitation expiry relative |
| Mandala Codes `adroart/mandalacodes` | [#231](https://github.com/adroart/mandalacodes/pull/231), [#232](https://github.com/adroart/mandalacodes/pull/232), [#233](https://github.com/adroart/mandalacodes/pull/233) | Cast-content pointer, atlas mocks, stewardship paper token, status-button wrap, status docs, mobile lane summary (still `continue-on-error`), TODO duplicates removed (109→76), opener counts, `workers/media.ts` typecheck |
| Lightweaver `theyemingzhu/LED-Programming` | [#308](https://github.com/theyemingzhu/LED-Programming/pull/308), [#310](https://github.com/theyemingzhu/LED-Programming/pull/310), [#311](https://github.com/theyemingzhu/LED-Programming/pull/311) **merged** | Firmware refusal reads `detail`, abandoned release message, band meters decay, section-zone fixture, five stranded notices, eight long-red specs measured (seven already green; wiring-workspace fixture fixed). **No VERSION bump.** |

## Blockers before Mandala CI is real

1. **Make [adroart/mandalacodes](https://github.com/adroart/mandalacodes/settings) public.** Danger Zone → Change repository visibility → Public. Cloud agents got **403** trying to flip it. Private Actions are why every run since 18 Sep dies at the gate in ~3s (payment / spending limit). Public-repo minutes are the intended fix. Secrets stay in GitHub Secrets.
2. After it is public, re-run workflows on `main`. Until then, assume Mandala CI has not typechecked or tested for days.
3. Mobile lane stays **non-blocking** until Adrian decides whether the hidden recorder, progress rail, Safari handoff, and “Your codes” tile come back. Do not skip those tests to go green. Do not make `test-mobile` required.

## Next agent-runnable slices (order inside each repo)

Do not start a second branch in a repo until that repo’s drafts above are merged, unless you explicitly stack.

### Teajia

Constraints: nothing entered is NULL; a typed 0 is real; no schema DEFAULT for yuan; no nav-label changes; a row-changing migration must be shown to Adrian as a page before push.

1. Register `products` / `product_listings` drift: one DB from the ledger, one from `schema.sql`, diff `PRAGMA table_info`. No row changes.
2. Hoist copied MCP helpers out of `index.ts` (`EVENT_STATUS_BY_LIFECYCLE`, `slugify`, `articleToApi`) and move `cascadeWaitlist` with them.
3. Drop `curate_import_batches.shipping_rate_per_kg` (`DROP COLUMN`, not a table rewrite). Confirm nothing reads `shippingRatePerKg` off finalize first.
4. **Do not** drain the 38 worker type errors with casts. Drain per file later; sixteen sit in Curate import money code.
5. Publish gate is a **design pass**, not “add a server read.” Draft `/read` prose is inline JSX in page components. Write a design, do not ship a fake API.

### Art site

Constraints: do not flip launch flags; no Stripe secrets; no production D1; collector wording in `todo/plans/collector-screen-wording.md` is locked. Use `placeholder()` for unwritten labels.

1. Configurator: test the **live** wizard in `PiecePage.tsx`, then fix step 1→2 scroll. `PieceConfigurator.tsx` is imported nowhere. Do not consolidate onto the orphan.
2. Pending-sale viewer is **already built** at `/admin/atlas-sales` (PR #133). Do not build a second one. Check the TODO off if still open.
3. Plate URL, first slice only: keep `/qr/{code}` → `/works/{piece}?instance=AR-…&ref=qr`. With `livingLegacy` on, put the existing `WiredCollectorArrival` in `CollectorDisplay`’s full frame. Do not retire the legacy stack.
4. Do not chase the screenshot sandbox from a cloud session. There is no sandbox config in the repo.

### Mandala Codes

Constraints: go-live ON HOLD. No D1 migrations, no claim light #1, no oracle voice rewrite.

1. After billing/visibility: one untruncated mobile count is already **41 failed / 80 passed / 10 skipped of 131**. Triage only failures the 2026-09-08 audit never attributed. Each fix must go red when reverted.
2. Close last two honest-boundary call sites: `PiecePage`, `lib/atlas/catalog`.
3. Typist loop: anchor on **quoted sentence**, refuse ambiguous matches. Workbook no longer prints margin numbers (`U1`, `I14`). Do not put numbers back.
4. 384 changing lines exist (6 per card). Voice pass stays you-required. Do not mark agent-done.
5. Do not rewrite KEYS from “inward face of the Shadow.” That stem is 0/64. New formulas: Repressive “This person …” 41/64, Reactive “Here …” 26/64, Immortals “stands above” 49/64 in RELATIONS.

### Lightweaver

Constraints: **do not bump** `firmware/lightweaver-controller/VERSION`. Do not edit firmware C++ unless parked on the firmware queue. **A lone `.github/workflows/test.yml` edit fires the signed signer.** A lone `lightweaver/package.json` edit does **not**. There is **no pull_request CI**; “merge gate” means post-merge on `main`. F33b is already merged. Pattern Lab join plan names Grok 4.5, which is not available; only Grok 4.6 may amend that plan, and 4.6 must not implement the join.

1. Re-measure `connection-center-quality` isolation before “fixing” the recorded cause.
2. Transport sweep + `canPushDirectlyToCard` together. Studio source can land now; it reaches cards only at the next signed release. Not a casual edit.
3. Notice layer: 15 field wrappers next. Leave the setup-journey chip. Five action sites already in PR #310.
4. Do not implement Pattern Lab join or Patterns-at-390px until the plan is amended.

## Needs Adrian — do not start

Shop logistics and photos, six launch flags, collector wording/click-through, tea-master onboarding, home-page direction, cost currency per vendor (preview before confirm; moves shelf prices), event seat price, starter-set contents, tasting-note consent, oracle hand pass and invocations, intention entrance, Lightweaver public address, render-watchdog timing, any signed firmware release, bench checks on a real card.

## Hard rule leftovers

- Do not revive the art-site → Mandala sale webhook (410). Sales write into the art site D1.
- Do not set `SALE_WEBHOOK_SECRET` as if that chain were alive.
- Do not open the shop or flip `livingLegacy` from this handoff.
- Sonnet usage hit a monthly cap on 2026-09-22 (reset 2026-09-24). Prefer Composer or another available model until then unless Adrian raises a spend limit.
