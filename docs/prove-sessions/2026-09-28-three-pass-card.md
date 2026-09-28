# Three-pass unattended card verification — 2026-09-28

## Current status
AUTOMATED AND AVAILABLE HARDWARE PASSES COMPLETE; NOT FULLY PROVEN. Owner: primary manager. Authorized after duration warning by Adrian: loop three times, repair failures, then ship changes. No physical interaction requested.
Initial frozen source: 2f95794cd4b3146c0738715121a41a20e2afaae3. Studio 2250; signed firmware 2160 / 1.1.47 / 8c45aa2a2bf97acdfd73cc318d86d71fc51bb6ac.
Target card: lw-b0fe81f61b44, LAN 192.168.18.70; USB /dev/cu.usbmodem14301 correlated by ROM MAC 44:1b:f6:81:fe:b0 and runtime hello.
Initial boot: boot-9f45f8a4-b0fe81f61b44; project lightweaver-bench-discovery-v1 revision10, fingerprint b27fd495241a9f27f9a885e99c8722dfb27fd495241a9f27f9a885e99c8722df.
GPIO18, 41 WS2812B RGB pixels, 2000mA limit, 5 sections (11/5/10/10/5). Known-good/no probation; command, output and native rendering ready.
Private recovery/evidence directory: /tmp/lightweaver-three-pass, never commit raw credentials/config dumps.

## Required repeated matrix
Each pass: exact identity/readiness; save/load/reload; section separation and independent patterns; signed Wi-Fi update/reconnect/preservation; signed preserving USB transfer/reconnect/preservation; reflash eligibility; reboot/persistence; error/loading inspection. Automated browser fixtures recorded separately from physical card operations. Full launch gate on frozen candidate; targeted lifecycle repetitions three times. On source defect, end frozen attempt, repair with focused red/green, freeze new candidate and retest affected proof.

| Pass | Automated | Real browser | Card playback | Wi-Fi update | USB flash | Persistence | Physical appearance |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | representative lifecycle PASS | see individual findings | PASS | blocked: same signed build | PASS | PASS | unobserved |
| 2 | representative lifecycle PASS | see individual findings | PASS | blocked: same signed build | PASS | PASS | unobserved |
| 3 | representative lifecycle PASS | see individual findings | PASS | blocked: same signed build | PASS | PASS | unobserved |

No physical appearance waiver is inferred. No destructive factory erase is authorized as a fallback. Preserve signed validation and exact card, no account login or physical-button requirement.

## Next action
Ship the repaired Studio candidate through the normal release workflow and durable background live-proof observer. Wi-Fi forward transfer and physical appearance remain unperformed gates, not passes.

## Findings and repaired attempts
- Original frozen attempt closed INCOMPLETE on real Studio installer failure: connected same-build card switched to destructive install after manifest load. Focused regression RED/GREEN; fixed preserving up-to-date screen.
- Real explicit preserving USB reflash then inspected current firmware and incorrectly entered commissioning/setup-AP rather than exposing transfer. Reproduced twice, no write; bounded repair underway.
- Real Use card project reconstructed physical segment bench-18-full as strip-6 while card zone was strip-1; live section control correctly refused mismatched layout. Exact-range reconstruction fix RED/GREEN, 57 focused tests.
- Original browser project and card reconstruction exported through native Save dialog, private mode0600. Split 11-pixel section into3/3/3/2; save/reload retained8sections and41total pixels. Native import restored5sections. No structural card configuration write.
- Browser extension file-chooser upload stalled about7.5hours and required native picker fallback; extension permissions unchanged. Hardware state reconfirmed afterward.
- Baseline USB hello matches LAN exactcard/build/boot; freshInstallEligiblefalse, stationIP present. USB inspection restarts returned saved mixed patterns; initial all-Aurora was transient. Saved project revision10/fingerprint/outputs remained unchanged. Initial snapshots retained separately; persistence baseline refreshed after reboot to sparkle/ripple/sparkle/lava/sparkle, current/startup lightweaver-section-layout. First lifecycle guard correctly refused stale transient baseline with zero writes.
- Wi-Fi OTA rejects same-version/build by design. Signed current target2160 equals installed2160; successful forward Wi-Fi transfer cannot be proven with this artifact. No version/anti-rollback bypass or artificial version bump.
- Automated launch baseline source/cloud73/mapper27/production-job18 PASS; interrupted intentionally before source edit. Remaining comprehensive stages PASS (browser regression/mobile, production68, releaseUI416, unit, build/staging63files, binary freshness); later integrated adoption+installer unit/build PASS. Logs /tmp/lightweaver-three-pass. These are not three hardware passes.

## Completed repetitions and later hardware findings
- Real pattern/persistence passes 1, 2, and 3 PASS. Each exercised three simultaneous patterns, exact selected-zone and unchanged-sibling readback, restored tuning, software reboot, same saved project fingerprint/output configuration and restored saved patterns. Evidence: private real-pass-1.json, real-pass-2.json, real-pass-3.json. These are not complete Wi-Fi/USB flash passes.
- Eighteen representative browser lifecycle cases ran three repetitions: seventeen passed 3/3; playlist sync initially failed because the test counted an in-flight background zones read. Test now proves matching installed zone IDs read after config POST, then passed 3/3. Original failure retained in repeat-matrix.log; repair evidence playlist-harness-retry.log/meta.
- Fresh project reconstruction on the repaired Studio allowed Strip 1 Aurora on the actual card, while siblings remained ripple/sparkle/lava/sparkle. Readback adoption-live-zone-proof.json. A pre-fix browser draft still contained stale IDs; New project followed by clean automatic reconstruction proved the repaired path. No card project was overwritten.
- Preserving USB inspection reached ~640KB/6.25MB then expired at the 25-second exploratory deadline. No firmware written. Error cleared hardware state and fell back to destructive installation wording. Current signed build2160 is absent from historical scanner candidates; bounded signed-current-image verification and sticky preserving intent are being repaired.
- Automatic USB software recovery succeeded using the exact ROM MAC and RTS reset; card returned on LAN with firmware2160 and unchanged project fingerprint. No physical controls or sign-in used.

- Original production browser project restored from private browser-project-backup.lw.json and saved as test (one original strip). Test recovery copies remain available.
- After real section-preview verification, leave the Pattern screen before restoration: its live-preview effect can issue transient commands on reconnection. A reboot with the preview closed restored exact original five-zone values and syncZones=false (adoption-preview-restored.json); saved fingerprint never changed.

## Repaired candidate USB verification
Final integrated build PASS; 70 affected Node tests PASS; repaired USB browser paths each repeated 3x PASS. Current signed image first-chunk match permits bounded 130s complete image authentication, followed by exact partition/OTA authority. Historical-image prefix and full-hash safeguards retain regression coverage.
- USB pass 1: application-only signed write, full SHA readback, automatic restart and USB runtime identity all succeeded. Independent LAN snapshot usb-pass-1-readback.json verifies build2160, boot-a48f68d2, exact saved fingerprint and all five baseline patterns.
- USB pass 2: same complete path succeeded. usb-pass-2-readback.json verifies a new boot-74666acd, same exact card/build, unchanged fingerprint and baseline zones. No sign-in or physical controls.

- USB pass 3: full signed preserving path succeeded; usb-pass-3-readback.json confirms boot-b4380c1f, build2160, exact same card/project and all baseline mixed patterns. Studio independently displayed Reconnected and confirmed the running firmware over USB on all three passes.

## Final disposition
Three available hardware repetitions each passed for independent multi-pattern control, restored tuning, reboot/persistence and signed preserving USB reflash. Eighteen representative browser lifecycle scenarios repeated three times cover loading, division, installation/Wi-Fi handoff fixtures and persistence; final affected USB cases also passed 3x after their repair. Full launch/checkpoint evidence and original failed attempts remain recorded separately. No claim is made that mocked Wi-Fi transfer proves a real forward OTA update.

Final real screen inspection showed all five correct card section identities and differentiated section labels (Aurora live draft, Ripple, Sparkle, Lava Lamp, Sparkle). Hydrating editor patch playback fixed the all-one-pattern label defect; saved pattern banks are unchanged. The preview was closed and the card rebooted to its original saved mix afterward. Original production browser project restored and saved.

Unperformed: successful forward Wi-Fi firmware transfer (no newer signed compatible release exists), physical LED colour/appearance judgement, destructive fresh-card erase/install on this configured card, and physical cabling/power-cycle tests. No button/account workflow or safeguard bypass substituted for these gates. This run cannot be labelled fully PROVEN.

Release scope: Studio source/tests and this evidence only. Firmware artifacts unchanged. Owner-authorized release follows three completed available passes; publication is tracked separately from hardware proof.
