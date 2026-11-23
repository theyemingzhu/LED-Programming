# relative-look-tuning-default-boot: bench failure on 2026-11-23

This change was pulled from card release 1.2.5 after the bench check. It stays parked until this failure is fixed.

## Where it ran
- Card lw-b0fe81f61b44 (ESP32-S3), USB bench flash (`scripts/firmware-dev.sh`), buildId `dev`.
- Release branch `firmware-release/1.2.5` @ 4e254c3b: candidate-blob, this patch, and drop-stale-rollback-record.
- Project: the Nov 19 restore. 5 Fire sections at 0.91 (11/5/10/10/5 lights), 6 looks.

## What worked
1. `POST /api/control`
   `{"lookTuning":{"patternId":"fire","expectedCardId":…,"expectedBootId":…,"session":1,"changes":{"brightnessScale":0.8}}}` → 200, live `brightnessScale` 0.8.
2. `GET /api/client-pattern?patternId=fire`, then `POST /api/client-pattern`
   `{"expectedCardId":…,"expectedRevision":<tuning.revision>,"patternId":"fire","tuning":{"expectedBootId":…,"session":1,"values":{"brightnessScale":0.8,"speedScale":1,"hueOffset":0}}}` → 200.
3. After `POST /api/reboot` the card came back on Fire with live 0.8. The output brightness byte went from 115 to 92. Every section still read Fire 0.91, so the differences between sections were kept.

## What failed
Every later save failed: 6 of 6 tries, including the first save after a fresh reboot.
- A `POST /api/control` with the same envelope (values 1.0 or 0.9) → 200.
- The `POST /api/client-pattern` that follows it (same shape as above, 272 bytes) → **400 `{"ok":false,"error":"invalid pattern envelope"}`**.
- Once, the well-formed `/api/control` tuning patch for 1.0, sent right after a failed save, → **400 `{"ok":false,"error":"send the tuning patch on its own"}`**.

As a result a saved tuning can never be changed or undone. It disappears only when a wiring confirm changes the install id.

## Reading (unproven)
Each error matches the handler seeing a different request's body.
- "Send the tuning patch on its own" means the control handler saw extra keys. Those are the keys of the client-pattern save that came just before it.
- "Invalid pattern envelope" comes from the `doc.size() != 4 || server.args() != 0` gate in `handleClientPatternPost`.

Suspect the shared `controlRequestBody` / `controlRequestBodyReady` buffer. It may be filled or consumed out of order between `/api/control` and `/api/client-pattern`, or `server.args()` may count the body as an argument after the first save.

Start with a host test that sends control → save → control → save in that order.

## Not caused by the slot swap
The same card on candidate-blob alone is to be re-checked. Five look saves through Patterns in a row must each be accepted and match on read-back.
