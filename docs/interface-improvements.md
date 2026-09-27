# Lightweaver interface improvements

This queue records issues observed in the public Studio customer journey. A shorter screen may move controls, but every working capability, keyboard and pointer path, and accessible action must remain available. Layout drawing, cutting, and management tools are already tuned and are outside this queue.

## Current batch — source in review, not released

| Priority | Observed issue | Intended change | Capability that must remain available | Proof still needed |
| --- | --- | --- | --- | --- |
| P1 | Card Home **Update card** opens saved Wi-Fi Step 3 instead of the signed preserving update. | Explicit Card Home update intent selects Install Step 2 for that visit. | Generic Install resumes the unfinished commissioning stage; exact-card authority, preserving Wi-Fi and USB paths, and all update guards remain intact. | Focused route/browser proof and desktop/390 px screen inspection. |
| P2 | A paired card on its setup AP says **Connected**, while Still to do says **Connect to your card**. | Name the remaining action **Set up card Wi-Fi** when the exact card is already connected. | Disconnected and unpaired cards still get connection guidance; Wi-Fi setup remains reachable. | Connected-AP and disconnected regressions; inspect the setup screen. |
| P2 | A verified factory blank card with no project shows fault-colored Health and **Recover lights** before there is a project to drive. | Use ordinary setup wording and **Continue setup** for that specific state. | Configured, provisional bench, blackout, wiring-test, rollback, and other recovery states retain valid Verify/Recover/Clear actions; prior health feedback remains understandable. | Assert exceptional-state parity and inspect desktop/390 px. Do not ship if a valid recovery action is hidden. |

The builder owns product source and focused regressions. The primary agent owns the workboard and integration; the release owner owns checkpoint and shipment. This document is triage only.

## Follow-up investigation — no implementation authorized by this queue

| Priority | Finding | Next evidence or decision | Preserve |
| --- | --- | --- | --- |
| P1 | Remote public-site update reaches a BOOT/physical confirmation or owner sign-in gate, while the owner has no physical card access. | Establish the real meaning of the existing confirmation and supported owner authorization before proposing UI or behavior changes. | Exact-card safety, signed preserving update, and truthful physical confirmation. |
| P1 | USB scanner reports the exact signed build 2070 image as Unknown. Source review found version/build ordering and marker-distance mismatches; its positive mapping covers only older builds 1198/1223. | Engineering should validate against authoritative signed artifacts and add an exact-image regression before considering recognition changes. | Never treat Unknown as permission for erase or an identity bypass. |
| P2 | USB Wi-Fi is currently part of destructive-install commissioning rather than a general existing-card Wi-Fi route. | Determine the supported existing-card path after signed update and exact-card pairing; use a real customer journey before scoping new controls. | Existing commissioning and configured-card data. |

## Evidence boundaries

- Public-site customer testing on the remote Interstellar computer uses only normal browser UI and device prompts. Source, tests, builds, and diagnostics run locally.
- The temporary Wi-Fi radio-off event is operator state, not a confirmed product defect. The draft Untitled Project has no layout, strips, or SVG; preview counts do not establish physical wiring.
- No remote hardware press, physical light result, gallery password, owner login, card write, or firmware update has been observed or inferred from this queue.
