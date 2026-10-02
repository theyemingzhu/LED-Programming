# LED library audit — 2026-09-29

Inventory of chats, GitHub PRs, local worktrees and persisted release evidence. Follow-up authorization: Adrian explicitly approved finishing, shipping and closing outstanding work, overnight if needed. The five proposed chats below are now archived; obsolete PR312 is closed with its branch/documents retained. The three unfinished owning chats have resumed. No product deployment, flash or worktree deletion was performed by this audit chat. This is a point-in-time record.

## Repository and release reality

Keep the canonical repository: https://github.com/theyemingzhu/LED-Programming.
The 18 registered worktrees (17 existing) are working copies of this repository, not separate products. Studio, client player, mapper and firmware belong to Lightweaver. Pi runtime remains deferred.

GitHub main was f1c16292e5619f02957e0ed0a3fe752f7ea7db46, PR381 merged. Its Tests run 36586337052 was in progress. Public no-store request returned Studio build2312 at 9f920a047fcdbee39fe0cf15a4cfee56a890ad16; firmware manifest advertised1.2.1/build2311. These metadata reads are NOT independent full live-byte shipment proof. Last inspected persisted complete proof: Studio2276/firmware2160, revision ba9c1886. The physical card was last reported2160 in the client chat; no new hardware read was performed.

## Keep open / finish

| Work | Owning chat | Verified state | Next action |
| --- | --- | --- | --- |
| Card-state resume | Investigate card state detection | PR379 draft, ac3901d0; candidate2319 blocked on release step12 (notice-layer/layout-led-chipset/strip-discovery/install-update-plan). Chat active. | Existing owner diagnoses failed case and resumes exact candidate. |
| Release reliability | Investigate card state detection | PR380 open,3517fad0;98 tests reported; installed locally; stacked on PR379. | Integrate after PR379, retarget to main; account for latest parent test fixes. |
| Mobile Patterns navigation | Fix mobile pattern navigation | PR374 draft,9c15c2a9; candidate2303 blocked on ci:browser-regression, not running. | Diagnose failed gate and update against current main before publication. |
| Client player | Plan Light client app | PR375 and portability PR377 merged; deployment failed; repair PR381 merged with Tests in progress. | Finish release proof, then card connection and compatible firmware acceptance. |
| Symmetry / Layout play and flip | Existing symmetry working copy | PR372/373/376 merged; part of newer release beyond last inspected complete shipment proof. | Include in exact release proof and retain physical acceptance separately. |

## Completed chat archives (owner approved)

| Exact chat title | Reason / retained obligation |
| --- | --- |
| Integrate idle UI elements |4c2240a9 included in main; workboard records shipment in Studio2246/firmware2160. |
| Fix selected pattern playback | Integrated3b320482; persisted shipment proof Studio2250/firmware2160. Physical LED appearance remains a Bench obligation. |
| Compact Layout strip controls | Workboard records count regression resolved by50d1da18/207d383b and passing cases in stack release. Preserve historical handoff. |
| Prove Lightweaver end to end | Owner stopped repair loop; implemented fixes have persisted shipment proof Studio2276/firmware2160. Archive means stopped/completed software batch, NOT exhaustive physical proof passed. |
| Review and archive finished projects | Prior archival task complete; current inventory is here. |

Keep Fix Find my card detection until its historical physical-connection obligation is explicitly consolidated with the current client/card-state owners. Do not discard it based solely on old software shipment.

PR312 is an old cross-project documentation handoff, not unfinished Lightweaver product code. Recommend closing after retaining its linked documents; do not merge its outdated operational guidance.

## Working copies

Clean, integrated or patch-equivalent candidates for later worktree archival after process/attachment checks:6e8d,a59c,bcf5,connection-restore,interrupted-usb-scan,layout-pattern-playback,led-known-station-wifi,agent-a8d5dee4cc64eb8aa. The symmetry checkout is integrated but should remain until its current release ownership ends. No checkout was removed.

Keep card-first-resume,release-reliability,mobile-pattern-navigation and client-player while delivery/acceptance is unfinished. Client-player has a modified workboard. Three-pass-card-proof has modified notes and two screenshots to preserve before archival.

The root checkout is on codex/launch-recovery-confirmation at8bbf965f,92 commits behind inspected main, with modified documents, plans and build backups. Its source/test diff is patch-identical to mobile PR374; it is not a fourth feature. Never reset this dirty checkout to clean up the sidebar.

Historical preservation branches from September27 remain recovery snapshots, not wholesale merge candidates; see docs/session-closeout-2026-09-27.md. Branch claude/unblock-main-375 at23d6dc55 contains an unapplied two-file test repair: check its current need before treating it as finished. Missing /private/tmp/lightweaver-pattern-details-pass is a stale worktree registration with integrated code.

## Recommended order

1. Let existing PR381 CI finish and obtain exact deployment/live proof for the client/symmetry batch.
2. Existing active owner finishes PR379, then PR380.
3. Resolve PR374 separately; do not duplicate the root patch.
4. Resume client card connection/firmware acceptance in its owning chat.
5. Archive the five completed chats above, then retire eligible worktrees with recoverable snapshots.

Owner approved the presented archive plan and shipment of outstanding work. Card-state owner owns379 then380; mobile owner owns374 after380; client owner owns381 release proof and remaining card acceptance. Each was instructed to verify persistent runners, fix concrete failures only, preserve configuration and exact revision proof, and archive only on true completion. Exhaustive Prove remains stopped.
