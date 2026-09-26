# Recorded composition delivery — implementation evidence

Status: Sprint complete locally, implementation and checkpoint verified. This document does not
claim a deployed Studio, updated card, or observed physical playback.

## Owned outcomes

- Flow: record the actual ordered Scene Expression renderer into LWSEQ, scatter
  into compiled physical output order, preserve the editable scene, and reject
  stale source/layout identity before saving.
- Mixed sections: retain distinct section patterns, parameters, color, speed and
  brightness beneath Lab overlays. Direct preview, worker preview and recording
  must agree; the final master adjustment is applied once.
- Delivery: persist verified recording bytes outside localStorage, preserve
  portable project data, reference recordings explicitly in Playlist, and upload
  verified media before activating the runtime configuration.

## Integration acceptance

| Boundary | Required evidence | Current result |
| --- | --- | --- |
| Ordered Flow → recording | Unequal/reversed/disjoint physical outputs and cut-step parity | Worker focused suite 11/11; real browser record/save/reload and Edit scene pass |
| Mixed section base → overlays | Different pattern parameters and brightness; direct/worker/bake parity | 32 focused renderer/layer checks pass; browser capture/reopen retains exact section settings |
| Recording → saved project | Reload retains exact source and binary hash; missing media fails clearly | Real Flow recording retains source and SHA-verified IndexedDB bytes after reload |
| Portable project round trip | Binary/source identities survive export/import | Focused delivery tests pass, including legacy source-only assets and verified portable bytes |
| Recording → Playlist | Recorded and procedural entries retain separate runtime identities | Real Flow recording added as explicit sequence entry in existing Playlist UI |
| Studio → card media | Capability check, bounded upload, separate readback, activation only after verification | Mock-card tests pass for upload/readback/config ordering, card/boot/head changes and transfers beyond the general owner TTL; actual card remains unobserved |
| Failed/interrupted upload | Active configuration and immutable media remain intact | Client cancellation/hash/stale-layout tests pass; firmware has immutable paths and bounded staging; physical interruption/recovery pending |
| Old firmware / absent SD | Useful failure before configuration mutation | Old-firmware client rejection passes; firmware SD checks compile and source contract passes; physical missing-SD check pending |
| Existing interface | Flow action and recorded Playlist entries in current styling, phone screen inspection | Phone Flow/Playlist and section-mix screens inspected; Flow copy/action corrected; layer controls pass at 320/390px |
| Integrated checkpoint | Library suite and production build | 2791/2791 unit tests and production build pass; 29 distinct browser cases pass (28 in combined run, final fixture corrected and passed separately) |
| Firmware boundary | Focused contracts and ESP32-S3 compilation | Eight focused source/bridge contracts pass; final ESP32-S3 compile passes (70.4% RAM, 2320597B flash); host C++ behavioral harness unavailable |

The browser regression first failed at the disabled Record Flow action while
the parent callback was still absent. It now covers saving the exact ordered
scene and reading the recording bytes from IndexedDB after a page reload. It
passes through adding the recording to Playlist and reopening its editable scene.
The mixed-section fixture now seeds the current patch board as well as saved-look
metadata, matching the existing native fixture. Its exact Fire, color, speed and
brightness assertions pass unchanged. Existing desktop/phone layer cases pass.

The first checkpoint exposed 29 native production-job failures caused by adding
an empty media field to strict runtime packages. Native-only packages now omit
that field, preserving their existing format; the repaired checkpoint passes.
Focused media/compatibility tests pass 60/60 and source-specific scene reopening
passes 4/4. Native host C++ behavior tests were not run because `c++` is unavailable.

## Implemented delivery decisions

Recordings use SHA-256-addressed immutable files so updating a named recording
cannot replace bytes referenced by the running or rollback configuration.
Browser project JSON retains source and media references; IndexedDB retains
the bytes. Explicit portable exports include the bytes and imports verify them.

The existing owner permission expires after 60 seconds, shorter than a large
media transfer. A separately bounded media lease must therefore authorize only
the exact declared batch of immutable files (16 files/48 MiB, fixed 30 minutes;
each file transfer has a fixed 10-minute lease). It does not authorize
configuration changes. Card identity, boot, origin, network, project head and owner generation
remain bound; fresh owner authorization or explicit revocation invalidates the lease.
Ordinary owner TTL expiry preserves the bounded media lease. Successful transfers
close the batch, and fresh authorization permits recovery from an abandoned batch. The
readback request uses a JSON body so bridge requests retain the same origin
binding and the media token stays out of URL query logs. Target compilation and
source contracts, mocked client behavior tests and integrated checkpoint pass.
Actual firmware lease expiry, SD readback and recovery still require Bench evidence.

## Intended user path

1. Define the actual artwork sections and physical GPIO wiring in Layout. These
   can be arbitrary paths; effect order does not change the wire order.
2. Give sections the same or different patterns in Patterns. Open the complete
   look in Lab to add targeted overlays while retaining the underlying mix.
3. In a scene, choose Flow and arrange/reverse its sections. Record Flow saves
   a complete loop with its editable source. Recorded designs appear in Playlist.
4. Arrange native looks and recordings in Playlist, then use the existing Install
   action. Studio verifies every media file before saving the playback setup.
   Card install and Save to card use the same media verification boundary.

Recordings require compatible firmware and writable microSD storage. Source-only
legacy recordings remain editable but need to be recorded again before their
bytes can be uploaded. Hardware playback remains a separate Bench acceptance
step; a passing browser or compiler check does not establish physical output.

## Bench follow-up

Physical gates remain unobserved: unequal strips on multiple GPIOs, the same
pattern on separate sections, different patterns per section, an ordered effect
crossing section boundaries, mixed native/recorded Playlist playback, restart
without Studio, and recovery after an interrupted upload. A compatible firmware
update and SD storage are required before exercising the new media endpoints.
This Sprint does not authorize flashing or a release.
