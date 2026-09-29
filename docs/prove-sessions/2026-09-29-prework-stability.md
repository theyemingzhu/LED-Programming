# Additional pre-work stability hour — 2026-09-29

Owner: primary manager. Adrian authorized one additional hour; Sprint scope continued the existing repair-and-release authorization. Started 02:19 UTC, target 03:19 UTC. Base 78b1d7f3 (Studio2266, including mirror-strip changes). Prior Studio2254/firmware 2160 release independently proven live by the durable observer at the start.

## Reproduced defects and bounded repairs

- On the live Card screen, the browser draft and card shared a project ID but had unresolved revisions. “Setup complete” contradicted “Same project, not yet verified” and the project-resolution actions. A focused browser regression reproduced the contradiction before repair. Setup now treats lifecycle `project-mismatch` as unresolved even with the same ID. The current draft remains editable; adoption and Save to card remain explicit. Ordinary content/LED-count edits retain the existing save route.
- After reloading an interrupted USB installation, rapid Resume with USB clicks opened two serial selections. The failing test observed two requests instead of one. A synchronous in-flight guard and disabled button now serialize that handler. Cancellation releases the guard; retry reconciles the accepted attempt without a second credential write. Exact-card and signed-release validation are unchanged.

## Focused evidence

- Project/import/reload/section-pattern persistence selection: 18/18 across three repetitions.
- Setup readiness phone regression: 3/3; focused journey tests pass, including normal content and LED-count edit paths.
- USB resume/cancel/retry, lost-response reload and timeout recovery: 9/9 across three repetitions.
- Primary reviewed the repaired 390×844 screen; both project choices and Open Layout remain available. Private screenshot: /tmp/lightweaver-extra-hour/project-readiness-after.png.
- Live Studio2254 configured-card installer reloaded three times and retained the preserving “up to date” state. Phone view inspected. No hardware writes or firmware rebuilds in this hour.

## Integrated evidence and limits

Read-only hardware sample: 61/61 successful observations over 15 minutes, zero errors, no boot changes, all readiness/configuration flags true, unchanged project fingerprint. Free heap first53568/last53576/min53532/max54260 bytes. No downward drift across this bounded window; no long-duration claim. Raw sample and summary are private under /tmp/lightweaver-extra-hour. Integrated release check result is added at completion. Logs retain failures rather than overwriting them. Machine results do not prove physical LED appearance. Successful forward Wi-Fi flashing still requires a newer signed target; the installed/current signed firmware remains2160. Existing three real preserving USB passes are documented in 2026-09-28-three-pass-card.md.

## Integrated attempt and bounded test repair

The release gate passed source contracts, 73 cloud browser cases, mapper/release checks and successive browser groups (39,11,3,6,55,123 cases). The next group passed137/138: its geometry case timed out looking for the retired `Mirror` button. The current interface calls that same geometry control `Fold` after the inherited mirror-strip update. The minimal test repair retains the original `mirror-hv` result assertion. Original failure context is preserved privately; completed gate stages are reused and the remaining stages continue after focused proof. No product-source change was required for this timeout.

The primary also connected the integrated Studio to the real card and inspected its preserving up-to-date screen. Subsequent exact card/build/boot/project readback remained unchanged and all readiness flags true (`after-browser-card-proof.json`).

The stale geometry selector repair passed three repetitions with the original symmetry assertion intact. The integrated checkpoint passed all 2,934 unit tests and the production build. Pages staging verification passed for the 63-file build graph; signed firmware freshness passed without changing firmware 2160. Remaining gate stages passed: mobile 42/42, production 68/68 and release UI 418/418. Together with the completed stages and focused 3/3 selector repair, all required local release checks are covered. No passing suite was restarted for the test-only repair. Logs: release-gate.log (retained original timeout), checkpoint.log and release-remaining.log under the private evidence directory.
