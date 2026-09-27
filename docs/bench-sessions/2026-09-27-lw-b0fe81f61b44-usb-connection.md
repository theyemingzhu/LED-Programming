# Local Mac card USB connection — 2026-09-27

- Mode: Bench; bounded connection recovery, no exhaustive Prove authorization.
- Outcome: in progress; normal browser USB selection not completed.
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

## Single next step

Complete the normal browser USB chooser for the Espressif device with serial
`44:1B:F6:81:FE:B0`, then inspect Studio's exact identity/compatibility result.
