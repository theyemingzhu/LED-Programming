# Local Mac card USB connection — 2026-09-27

- Mode: Bench; bounded connection recovery, no exhaustive Prove authorization.
- Outcome: blocked; normal browser USB selection not completed.
- Card: `lw-b0fe81f61b44`; USB `/dev/cu.usbmodem14301`.
- Fresh USB serial descriptor and ROM MAC: `44:1b:f6:81:fe:b0`.
- Chip: ESP32-S3 QFN56 v0.2; embedded PSRAM 8 MB.
- Running firmware/boot ID: not yet reported through a supported runtime API.
- Stored app0 prior evidence: 1.1.39/build1939; fresh OTA evidence selects app0.
- Project identity/revision/fingerprint: unknown via API; boot reports defaults
  and missing known-good/candidate configuration, Wi-Fi and piece name.
- Wiring: unknown; boot reports zero pixels. No LED observation requested.

## Machine evidence

At approximately 10:44–10:50 UTC (18:44–18:50 WITA):

1. Local main/origin main `d2d98264`, clean before these notes. Existing preview
   PID 5310 has cwd root `lightweaver/`, listens only on 127.0.0.1:4173; reused.
2. USB descriptor `303A:1001`, serial `44:1B:F6:81:FE:B0`. No competing serial
   owner reported. Passive serial opening returned boot logs with USB reset
   reason, compiled defaults, no saved Wi-Fi/piece, AP `Lightweaver-1B44`,
   `192.168.4.1`, zero pixels. No physical button was used.
3. Read-only ROM flash inspection reconfirmed MAC and read boot metadata.
   No flash write/erase. Temporary artifact
   `/tmp/lightweaver-bench-20260927-boot-evidence.bin` includes the boot metadata
   range and NVS; do not publish its raw contents.
4. Repository `parseUsbOtaSelection` returns app0 `0x10000`, sequence 1,
   state `0xffffffff`. OTA SHA-256:
   `f94c5d786a7a8fab06ac5d10e33bf37711a6697636dc037559ea19cc410a17f0`.
   Partition SHA-256:
   `9af3af2b74e944337ba85f2b0027ee80df160579a1ab746ba0f95853f618cd60`.
   Layout app0 `0x10000`, app1 `0x650000`, slots `0x640000`; matches signed ticket.
   A future write must reread selector and identity; these notes are no write grant.
5. Existing installer-core verifier authenticated the committed current manifest,
   update ticket/signature and app image: 1.1.47/build2160, app 2,358,896 bytes,
   SHA-256 `0d52bc73be5014be90534f231d4b25ffbc9ebcd293c86ebb6ba42ac4e4de3811`.
   Ticket excludes data partitions. No update has been performed.
6. Actual in-app browser at local Card > Install shows Studio2169, remembered
   card unreachable, last-known1939, signed2160 ready. Find connected card was
   clicked through accessibility and semantic button targeting. Neither gave a
   visible chooser, finding state or error. No chooser completion is claimed.
   Asked Adrian whether an external chooser appeared and to select the device
   if present. Prior native Chrome control denial was respected.
7. Public Studio HTTPS check returned HTTP200 at 10:49:52 UTC. Mac network was
   never changed. AP setup was not used.
8. At approximately 10:52 UTC, fresh full physical app0 read (2,232,992 bytes)
   matched the signed1939 application SHA-256 exactly:
   `714bf301851a7d1e64da19edf8efe1528b59f47de9881eaf20c980fdb047178c`.
   Artifact `/tmp/lightweaver-bench-20260927-app0.bin`; read log alongside it.
   Together with fresh OTA/layout evidence, this proves the selected installed
   image is 1.1.39/build1939. It is not a runtime API/boot-ID response.
9. Historical1939 update ticket canonical bytes, pinned-key P-256 signature and
   image hash authenticate successfully. The current reader returns null for
   this exact signed artifact because it lacks both the old string envelope
   and a pinned exact-image candidate. A focused recognition fix is underway;
   existing full-image/layout/OTA checks remain mandatory.
10. Regression witnessed red against the exact signed1939 image. Narrow Studio
    fix adds that pinned candidate to the existing full-image verification path.
    All20 reader tests pass, including existing2070 behavior, corrupted1939
    refusal and app1 informational-only identity. The updated reader also
    identifies the fresh physical application/boot-metadata dumps as1939/app0.
    This exercises real hardware bytes through software, not the browser serial
    transport, and does not establish a working LAN connection.
11. Integrated checkpoint passes all2,803 unit tests and production Vite build.
    Earlier checkpoint overlapped an intermediate edit and exposed2070
    candidate-selection failures; these were fixed, then the complete
    checkpoint reran green. No known failing check was suppressed.

## Diagnosis and preservation

Firmware1939 predates the USB Wi-Fi protocol added in commit1845ec97. USB
identity selection alone cannot give this unconfigured card a LAN address.
Normal intended route is verified preserving update, then exact runtime USB
Wi-Fi setup, then same-card LAN status/connection proof. Historical1939 image
recognition in Studio is being checked; do not weaken identity/OTA/signature
guards. No config recovery backup has been completed; require a recovery path
before any write. Credentials must not be recorded in Git or chat.

## Human observations

USB chooser appearance/selection: pending. LED behavior: unobserved.

## Software delivery status

Recognition fix is committed/pushed as `813092cf` in draft PR353. It is not
PR-ready, merged, deployed or shipped. Hosted Tests36314178855 passed source,
cloud and production, but failed the firmware version step. Workflow dispatch
provides no base SHA, selecting conservative all-path behavior and
`firmwareBundleOnly:false`. Running the unchanged classifier on actual
`d2d98264..813092cf` reports `firmwareBundleOnly:true`, so this browser reader
change does not call for a new firmware release. No version bump or gate bypass
was performed. Browser smoke and launch36314177126 remain running as of this
handoff; inspect their final results before any release continuation. Current
production remains the previously verified Studio2169/signed firmware2160.

Actual Studio USB chooser, runtime firmware/boot identity, Wi-Fi provisioning,
HTTP status readback and disconnect/reconnect lifecycle remain unverified.
No card data backup has been made and no flash write is authorized by this
record alone; reread fresh exact-card safety evidence before a preserving write.

## Earlier next step — superseded by the owner’s completed update

The initial USB selection and update were completed by Adrian; follow the
post-install record below.

## Post-install follow-up — 2026-09-27 around 19:15 WITA

Adrian reports completing the installation, then waiting on the same page with
no next step until an error appears. His screenshot and actual browser agree:
`Not verified after USB transfer`, target1.1.47/build2160 and the generic
`USB transfer ended without a verified result` recovery warning. This means
the earlier no-write state above is historical: Adrian has now performed the
update. This manager has not repeated the firmware write.

Fresh read-only USB hello from the idle exact port reports:

- card `lw-b0fe81f61b44`
- boot `boot-5deda35f-b0fe81f61b44`
- firmware1.1.47/build2160, source `8c45aa2a2bf97acdfd73cc318d86d71fc51bb6ac`
- `usbWifiProvisioning:true`, `freshInstallEligible:true`
- `setup-ap`, empty station IP, no pending network transition or join failure.

Thus the requested firmware is running and ready for USB Wi-Fi setup. The
browser remains in unknown-result recovery. Clicking its read-only check through
the automation surface did not visibly change the page; user chooser response
is pending. No Mac network change or credential write.

Source trace: unknown-result catch drops loader/transport and omits the existing
automatic USB Wi-Fi handoff. The manual helper also discards a supplied port in
unknown-result mode and demands a fresh chooser. The lower exception retains
its cause, but the panel hides that detail. Original transfer/readback/reset
failure is not yet established; do not call the firmware corrupt or reflash.

The separate `Integrate idle UI elements` chat finished its installer layout
changes locally. Those rendering/style changes and their checks are preserved
while this manager integrates the isolated connection-logic fix.

## Local recovery fix and verification

The post-transfer catch now retains the selected USB device and attempts the
existing exact-MAC software restart/runtime verification once. The helper
accepts that exact device without a second chooser. A matching target and new
boot opens Wi-Fi setup on the same page; configured cards receive a card-page
next step without credential writes. Failed recovery preserves the unknown
result and bounded original/recovery reasons. No second update is issued.

The new regression first failed because `usb-wifi-setup` never appeared, then
passed after integration. Full preserving-update browser suite: 45 passed;
additional configured-card automatic recovery: 1 passed. Checkpoint: 2,803
units and production build passed; flash-connection checks passed. These are
software fixtures, not browser transport proof on the physical card.

Actual root preview refreshed and inspected on the same install route. Both
normal and semantic clicks on “Check running firmware over USB” produced no
visible chooser or page-state change through automation. No permission bypass
was attempted. The earlier independent serial hello proves running firmware
2160, but actual Studio USB completion and LAN setup remain pending.
Source changes are local/uncommitted and preserve the completed design changes;
no firmware rebuild, signing, flash, merge or deployment occurred.

## Follow-through check — 2026-09-27

Owner requested additional targeted tests from install through setup. A fresh
read-only physical USB session verified the same card on firmware 1.1.47/build
2160, boot `boot-c66bae43-b0fe81f61b44`, still fresh-install eligible and in
`setup-ap` with no station address. On that same open port/boot, the scan
completed in 7.1 seconds and returned two networks. Only counts were recorded;
no network names, credentials or configuration writes. Earlier shorter scan
attempts were inconclusive; a newly opened port reported a new boot, so do not
combine scan results across those sessions.

All 23 browser setup-ladder, LED-count and journey-continuity checks passed.
The continuous J01 simulated blank-card journey also passed: connect, discover
a strip, save wiring, confirm the light test, and play a pattern. These tests
simulate observations and do not count as physical light proof.

The targeted follow-through batch fixed three further browser gaps: an
unbounded native USB open, blocked automatic card-page opening after preserving
USB Wi-Fi join, and a blank updated card being sent to Patterns instead of
Setup. Each changed behavior has a focused regression. Final software proof:
62 installer cases +23 setup/continuity cases +1 continuous saved-playback case,
all2,805 library units, and the final production build passed. New card-page
retry and blank-card setup action inspected visually. Configured-card return
routes and exact identity checks remain enforced. The fresh-install fallback
still keeps USB available; no firmware/card configuration changes were made.

Actual browser USB selection, real credential provision/LAN verification and
physical light output are still unperformed. This packet is software proof plus
read-only hardware identity/scan evidence, not end-to-end physical completion.
Local fixes remain uncommitted/not deployed.

## Single next step — waiting for physical observation

When observation is available, open the saved GPIO18—41lights three-section draft
and run its normal staged installation. Verify visible colors and playback before
permanent confirmation. Do not ask questions while the owner is unavailable. No
unchanged workers, repeated tests, reinstalls, or broad audits are warranted.

Final machine state: cardlw-b0fe81f61b44, firmware1.1.47/build2160,
boot-7333ccda-b0fe81f61b44, known-good/no candidate, GPIO18/41, revision1,
fingerprint f2f955192b08ce67e1eef2ed9482bedff2f955192b08ce67e1eef2ed9482bedf.
Command readiness and native rendering are true; Aurora is current and intended
Wi-Fi is retained. The saved Aurora30 still has zone brightness0.3. Studio4173
shows Setup complete / Connected / Installed project matches. Its browser-only
name inherited the test copy on explicit card adoption; the actual configuration
is the original41, independently reread unchanged afterward. All saved drafts
and the single-strip backup remain available.

Corrected candidate6bcc4f32d2569bc9, boot-ece19b81, ran14/14/13 Fire/Ocean/Plasma.
All three named arrangements were stored correctly. Explicit rollback restored
original state. Two-output candidate020b363a106aa928, boot93555ff9, initialized
GPIO18/28 plus unconnectedGPIO21/13 with native rendering,83FPS and three armed
zones. Timed rollback restored the original configuration. Its first browser
reload exposed an identity conflict, which was fixed before repeating the test.

Final repeat1744ccbfdf7a08a5, wiringRevision1, digest
35009cc3c2fc1090824e2ddeb718ec474966f7729adfad2ab3a8e706d1bf9505,
resumed the exact pending test after a real browser reload without resending.
No physical confirmation was given. Its90-second expiry restored boot7333ccda,
original fingerprint and no candidate; Studio correctly reported expiry/recovery.
This is machine proof for the unconnected output, not observed light onGPIO21.
Earlier unactivated candidate51d5479c6662badc was discarded once after a strict
conflict; no activation is claimed. Recovery evidence is preserved.

Import/re-export of actual saved card data twice preserved pattern IDs and30%
zone brightness. The saved layout survives real Card Home and browser reload.
The old look in the three-section draft was explicitly updated and saved at30%,
then verified through UI reload/reselection; stale blocked clipboard content was
not accepted as evidence. A mocked download regression also passed.

Final software checkpoint:2851 units, build, and nine combined browser journeys
passed (/tmp/lightweaver-probation-final-*.log). Two additional saved-look checks
passed. Full physical passes remain0; the only positive owner observation is the
earlier four-white beacon. There are no pending questions or fabricated visual
checks. Local Studio2171 plus uncommitted fixes, firmware2160; not deployed or
shipped. The existing heartbeat is hourly while this visual gate is unavailable,
with compact quiet checks and no repeated worker/test runs.

Earlier count/recovery notes below are historical, superseded by this success.

Latest real playback proof: boot57d443ef, known-good bench output18/256 and no
candidate. Selected saved bench-warm onbench-full, brightness0.12/blackoutfalse,
then armed the existing provisional native zone. Both responses ok; independent
status reports nativeRenderingtrue, nativeRenderArmedtrue, internal frameSource,
streamingfalse, affectedoutputbench-18, measuredFps28. Zones readback confirms
bench-warm/brightness0.12/blackoutfalse. This is real device/control evidence,
not observed illumination or final41-count proof. No firmware flash/release.

Actual owner observation during GPIO18 beacon: "the first four lights are flashing
white". Based on this real response, parent activated Yes, count this strip.
Studio shows Setting the card up and one temporary-setup restart. This observation
does not prove all41 lights, calibrated colors or saved pattern playback.

Post-rollback routing repair is physically verified: reload reached
`#screen=discovery` after exact factory/no-candidate checks cleared the old inspect
claim. An activation-bearing old claim now resolves only with that fresh evidence;
staged/wrong-card refusals remain. The earlier Card stopped responding display
resolved after the final source reload; independent source review found no
install-mount disconnect path, so no speculative transport change was made.

Overnight recovery completed: exact fresh identity/build and staged activation
were checked before one rollback POST. Result ok/rolled-back/rebooting; same
card/build2160 returned automatically at192.168.18.70, new boot
boot-0c4f263d-b0fe81f61b44, factory/defaults, candidate none/hasCandidatefalse.
No known-good existed; none was erased. Browser project remains Saved in browser.
The earlier incorrect Put your project back ladder is replaced by Finish checking
this card for inspect-card recovery. That issue is resolved locally.
Owner confirms only GPIO18 has a physical strip, 41lights. Other GPIOs can be
software tested without claiming physical illumination. Later optional loop:
three sections on this strip and three different per-section pattern arrangements.

Latest physical evidence supersedes earlier pending Wi-Fi notes: normal Studio
setup joined the intended network. Both live LAN APIs at192.168.18.70 agree on
lw-b0fe81f61b44, firmware1.1.47/build2160, source
8c45aa2a2bf97acdfd73cc318d86d71fc51bb6ac and boot-b848da07-b0fe81f61b44.
Credentials were used only for setup and are not recorded here. Mac Wi-Fi is
unchanged. Active status is factory/default, no active project/outputs, readiness
false. A mistakenly offered Restore saved project action DID stage a candidate:
activationId40e3e20e2a31ef15, hasKnownGood:false, hasCandidate:true,
bootedCandidate:false, GPIO16/3000/WS2815, wiringRevision0, wiringDigest empty.
It was not activated. Active status alone cannot establish absence of writes.
No physical LED output is verified yet; confirmation of multiple wired outputs
is pending. The consolidated goal and three-state repeat criteria are on the
workboard. Completed physical journey passes:0.

The earlier chooser blocker was overcome by reusing exactly one USB port
already authorized for this origin. Ordinary pointer/semantic clicks did not
act on even a details disclosure, but keyboard Return on Find connected card
worked. Browser inspection physically identified lw-b0fe81f61b44, ESP32-S3,
16 MB, without a chooser. Its subsequent firmware scan reached 640 KB/10%
before invalidating the inspection with a read-error notice; nothing was
written. App work is replacing that current-build path with bounded exact
runtime verification after confirmed ROM reset/release.

The real-card retry with the repaired runtime path succeeded: the existing
Studio tab reached Connect to Wi-Fi, stated that the exact card already runs
official firmware, and showed Card firmware 2160 / USB verified against source
8c45aa2a2bf97acdfd73cc318d86d71fc51bb6ac. Project persistence also completed
(Saved in browser). No firmware or Wi-Fi write occurred. The new inspect-card
flow's attempt persistence/resume is still under focused test before credentials.

Adrian explicitly reports a powered LED strip is connected and visible, and
that this is a blank card for a new setup. These are readiness observations,
not a passing light test. Intended Wi-Fi network is requested; passwords must
stay in the normal Studio form. Mac AC settings show sleep disabled. A thread
heartbeat, `finish-lightweaver-installation`, is active every 15 minutes to
continue independent work overnight and notify only for meaningful changes.

## Managed repair loop — software continuation

The requested active goal now tracks repair and retest through working lights.
Further reproduced fixes cover stuck ROM connect/reset/release, shared ownership
of a USB port during late cleanup, project-envelope hash verification, stale
Installed text, missing exact-card pairing after USB Wi-Fi, and a bridge dead
end replacing the temporary discovery config with the real project. Pairing
rechecks current card/build on retries and before persistence; the config
exception stays limited to one healthy paired temporary setup on its current
boot/lifecycle. Unsafe/recovery evidence and duplicate writes remain refused.

A single simulated HTTPS session reaches USB recovery, Wi-Fi join, pairing,
beacon/color/count discovery, final project installation and Aurora playback,
with an installed-project and connected UI. This is not physical LED proof.
Final full units (2,822), production build and all 89 combined browser checks
passed. The integrated run also exposed and repaired a race in which passive
recovery replaced a specific manual wrong-card error with a generic timeout.
Manual checks now invalidate older callbacks; successful checks start a fresh
recovery attempt. Three focused checks and the full rerun passed. The first
run's dynamic test imports read a separate disconnected singleton while the UI
was connected; both affected checks passed unchanged after restarting the same
preview. No native USB selection,
credential entry, hardware configuration write, firmware flash or Mac network
change was performed during this loop. Current local preview reports Studio
2171 from the branch base; the changes are uncommitted and not deployed.

## Morning current-state correction — 2026-09-28

Card reread remains original known-good GPIO18/41, Aurora, firmware2160,
boot7333ccda, revision1/fingerprint unchanged, commandReady/nativeRendering true,
no candidate. Preview had stopped; restarted saved dist on4173 (session55910)
and inspected actual Card overview: connected/setup complete/project matches,
Studio2171, color order pending. No hardware write. Source tree now contains
368 status entries including143 `(conflicted)` filenames; origin unknown.
Previous checkpoint applies to previously tested source, not automatically to
current files. Next independent step: preserve/reconcile source variants against
tested work before rebuilding; physical appearance also remains unverified.

## Morning Divide verification and runtime discrepancy

 in actual screen: locked installed41LED project -> four sections
11/10/10/10, one Undo restored41, Redo restored4, Saved in browser, reload retained4.
Browser project remains named Bench multi-output — GPIO21 unconnected; this is a
browser-only draft name, all4sections remainGPIO18. No hardware install performed.
Screenshot /tmp/lightweaver-divide-four-sections-20260928.png.

New independent diagnostic chat01a0e50d-55bf-7342-9936-57c24e58f3c2 owns
"Investigate card revision after restart". Fresh card runtime now boot0cf24239,
revision0/fingerprint8571df60f89580823cf16efc4bf68b6a repeated, same projectId,
known-good/no candidate,GPIO18/41, Aurora,ready/rendering true,errorCode0.
Uptime775187ms/resetReason3 places restart before current browser Divide test;
parent performed no card writes. Cause unestablished; do not claim physical card
identity metadata unchanged or attribute restart to division. Worker must use
source/history; parent alone supplies fresh hardware reads. Current runtime remains
usable by software reports; visible appearance is still unverified.


## Controlled morning software restart


Controlled restart follow-up: exact-card before/after captured under
/tmp/lightweaver-restart-{before,after}-20260928.json. Parent POST/api/reboot once;
boot0cf24239→80f262e4; automatic LAN reconnection ready/rendering byuptime6273ms.
Revision0/fingerprint8571... repeated, saved pattern list, startupAurora andGPIO18/41
outputs unchanged; known-good/no candidate. Current stained live pattern returned
to saved Aurora as expected. No config/firmware writes. This restart did not
reproduce package loss; earlier replacement source remains unknown. Do not repeat
restart without new evidence. Runtime diagnostic manager received result.

## Studio2178 four-section acceptance

identitylw-b0fe81f61b44, firmware2160, precheckknown-good/no candidate.
Normal Install→Start light test staged/booted4sections; ranges0/11,11/10,21/10,31/10,
syncZonesfalse, matching patterns, nativeRenderingtrue/error0. commandReadyfalse
while probation is expected; do not bypass it to claim post-confirm control proof.
No visual confirmation supplied; primary used No,restore working setup. Verified
known-good/candidate absent, old8571...fingerprint restored, GPIO18/41Aurora,
boot4e8b06f1,commandReadytrue/nativeRenderingtrue/error0. Exact snapshots:
/tmp/lightweaver-2178-{preinstall,trial,restored}.json. Four-section draft remains
saved; firmware/Wi-Fi untouched. Physical acceptance and permanent4zone operation
remain pending. Do not repeat this trial without new actionable evidence.

