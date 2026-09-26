# Historical layer, split and GPIO forensics

Date: 2026-09-25. Current comparison revision: `b53df14d`.
Investigators: Sol Layout/mapper, Sol runtime, Luna evidence inventory; primary
manager integration and independent source/ancestry checks. No historical checkout,
hardware write, firmware flash or deployment. Concurrent working-tree firmware
edits are outside this investigation and remain untouched.

## Finding

Adrian's recollection has substantial support in the source history. Layer-based
pattern editing existed in April, native independent zone patterns in May, and
explicit multi-GPIO wiring/split-run controls in July. An executable reproduction
confirms that the July 13 wiring compiler integration broke section identity and
pattern saving. The August repair restored that particular behavior; a separate
package/startup flattening path required the September 25 repair.

There is no single revision established here as physically proven for every
multi-output scenario. Historical browser tests, source capability, deployment
records and actual observed light behavior are different evidence. In particular,
the May browser test named "physically" routes requests to a fake card.

## Timeline and candidate reference versions

Dates below use each commit's authored calendar date. Local Git history is not
shallow and starts April 14. Available local branches and remote-tracking refs
were searched; no remote fetch or unavailable branch recovery was performed.

| Date / revision | What the source actually did | Evidence and limitation |
| --- | --- | --- |
| Apr 18, `e3145c7b` | Mapper logical groups and per-strip pattern overrides; layers, Undo/Redo and visual preview | `led-art-mapper/app/src/main.js`; export emitted indexed WLED coordinates, not GPIO assignments |
| May 24, `92626faa` | Patch mapping in Studio Layout, ordered ranges and off blocks | `LayoutScreen.jsx`, `patchBoard.js`; one main chain alone does not prove independent physical outputs |
| May 28, `02d68862` | Native zone-specific patterns, controls and pixel ranges; shared global pixel buffer delivered to configured output pins | Firmware `ZoneConfig`, parser and `renderZone`; initial renderer used only the first range of a zone |
| May 29, `555afcee` | Select Outer and Inner, assign different patterns, explicitly apply their split configuration, then preview either section | Patterns component and browser test assert Ocean/Sparkle config and targeted Fire request; mocked card |
| May 31, `ce1f7d8a` | Preserve explicit output routing when counts match, derive outputs from strips otherwise | `cardRuntimeProject.js`; fixes unwanted collapse to fallback output |
| Jun 2, `3048c045` | Compact numbered layer targets with name, count, range, current pattern thumbnail; named "Layer mixes" | Historical `PatternsScreen.jsx`; useful UI reference |
| Jun 11, `66c97e3e` | Render every declared range, rather than leaving later pieces dark | Direct `main.cpp` diff replaces first-range-only rendering with a range loop; each range starts pattern position at zero |
| Jul 13, `8b1fe864` | Introduce canonical compiler for outputs/runs/geometry; incorrectly substitute runtime zone identity for editing identity | Executably reproduced regression below |
| Jul 19, `53be4dea`, `390c367d` | Explicit 1–4 wire inventory, GPIO lanes, physical run cuts and Draw rows grouped by GPIO | Wire/Draw source and browser test source; wiring capability does not establish correct pattern saving |
| Aug 31, `5568e76b` | Restore patch identity and its saved look while keeping separate runtime zone identity | Source diff plus executable reproduction; commit records 56/56 Patterns tests and 2204 units |
| Sep 18, `52718052` | Connected sections: parent/children, boundary editing, adding/merging sections, persistent identity and GPIO moves | Workboard records PR297 delivery, seven final browser checks and 2546 units; physical split rendering remains unobserved |
| Sep 25, `20a6298e`, `b53df14d` | Translate patch playback into compiled zones, generate a combined startup look, integrate Bench arming/restore/install and lossless run separation | Current focused runtime tests 6/6; integration evidence linked below; not released to an existing card |

Best references to compare are **June 11** for the older pattern/zone flow and
multi-range renderer, **July 19** for physical wiring UX, and **September 18** for
connected-section editing. None should be treated as an all-purpose rollback.
The exact immediate pre-regression parent is `3a8bc052` (`8b1fe864^`).

## Reproduced regression

The same fixture has a four-LED strip `piece`, editing patch `patch-piece` with
Fire saved, runtime zone `piece`, and Aurora as the global default. Select its
section and choose Ocean. Historical modules and their local dependencies are
extracted from Git into temporary directories and executed unchanged.

| Historical revision | Selected editing ID | Runtime zone ID | Initially displayed | Saved after choosing Ocean |
| --- | --- | --- | --- | --- |
| Before July compiler, `8b1fe864^` | `patch-piece` | `patch-piece` | Fire | Ocean |
| July compiler, `8b1fe864` | `piece` | `piece` | Aurora | Fire — write missed its patch |
| August repair, `5568e76b` | `patch-piece` | `piece` | Fire | Ocean |

Reproduce from the repository root:

```text
node scripts/forensics-section-identity.mjs
```

The script asserts all three results, creates only temporary extracted sources,
and makes no card requests. It proves this editing/saving regression, not the
entire historical browser, output driver or cold-boot path.

The code cause is precise: July `sectionLookModel.js` lines 20–41 assigned both
IDs from `zone.id` and every look from `fallbackLook`. The existing save path,
lines 82–99, still matched `patch.id`. Compilation changed the address model
without preserving the separate editing identity. The August fix recovered the
patch through compiled pixels/strip identity and kept `zoneId` for card commands.

A second path remained: package generation looked up patch playback by runtime
zone ID, and a plain startup look could overwrite all zones on boot. September
`20a6298e` explicitly maps these identities and builds a startup combination when
needed. This explains why fixing visible section saving did not by itself prove
distinct patterns survived install and restart.

## Historical traps resolved during the investigation

- A June 18 TODO says later pieces are still dark and proposes salvaging an old
  `tender-dirac` branch. However, June 11's range-loop fix is an ancestor, and the
  June 18 tree already contains it. That TODO is stale evidence of a missing fix.
  Its deletion on July 13 is not the implementation date. The named stale branch
  is not among available local refs; it was not merged or recovered.
- WLED compatibility was not equivalent to native per-zone control: May's JSON
  API reported native zones as segments, but segment effect writes selected a
  global pattern while segment brightness could target a zone. The native
  `/api/control` zone path is the relevant independent-pattern mechanism.
- The June 17 reorganization moved the old Patterns component into `src-v3/`.
  It remains useful historical source; current Studio enters through
  `src/main.jsx` and uses `src/v3/lw-pattern.jsx`. Finding an old control in the
  archived component does not mean it is visible today.
- The September 5 Bench log records one GPIO18/41-LED card and pattern/status
  interaction. It does not prove simultaneous different patterns on two outputs.

## UI/UX and coding lessons worth carrying forward

| Precedent | Current situation | Recommended action and owner |
| --- | --- | --- |
| July explicit wire count plus pin/count lanes | Output capacity remains, but ordinary inventory is less explicit | App: show a compact inventory of connected/measured outputs before assigning patterns |
| May patch board's source ranges and physical addresses in one view | Advanced mapping retains the tools; overview is harder to reach | App: read-only per-GPIO summary with section, LED count, address span and direction, with one edit link |
| April inline pattern picker; June name/count/range/thumbnail beside each layer | Current Patterns chips already show names/patterns/GPIO; selected family has a picker | App: preserve current overview, add a clear selected-row action to choose/change its pattern; avoid making users hunt across screens |
| June named layer mixes and per-target thumbnail/drop affordances | Historical source supports pattern dropping; live target chips use tap selection | App: evaluate named reusable combinations and richer per-section previews; keep tap/keyboard complete so drag is optional |
| May explicit split-config action before scoped live taps | Current Keep/install path has stronger identity/readback and recovery | Bench: explain whether the card holds the proposed sections and make the necessary install/update the next action; retain verified readback |
| Separate source patch, compiled zone and physical output identities | Their accidental collapse caused the proven July failure | App/runtime: maintain explicit mapping; preserve regression fixtures whose IDs deliberately differ |
| Full path from edit to stored config to startup | UI-saving fix alone left package/startup problems | Firmware/QA: retain same→different→edit-one→Keep→install→restart contracts with independent expected maps |

Prioritize the output/section/pattern summary and clear per-row action before
reviving an entire older screen. The old apply handler posted full configuration
and swallowed a follow-up preview failure; current authority, candidate recovery
and truthful readback should be preserved. Handler counts and screenshots alone
are inadequate proof that a visual redesign kept every interaction working.

## Result and follow-up

The investigation delivered a reproducible historical regression and specific
design references. It made no production source changes. The next useful build
would be a bounded App/Bench usability pass on the existing implementation, with
the source/runtime identity tests retained. Physical multi-output playback,
restoration and offline restart still need an observed Bench session.

Related records:
- [Current integration evidence](2026-09-25-gpio-integration-evidence.md).
- [Complete GPIO integration plan](2026-09-25-gpio-pattern-integration-plan.md).
- [Single-output Bench evidence](../bench-sessions/2026-09-05-step-four-to-patterns.md).

Historical source can be inspected without changing the checkout with
`git show <revision>:<path>`; commit details are available through
`git show <revision>`. The reproduction uses that same mechanism.
