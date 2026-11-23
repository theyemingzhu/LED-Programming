# relative-look-tuning-default-boot: not yet proven on a card

This change was left out of card release 1.2.5. The refusals recorded below were **not** caused by it. They were an older card fault in the client-pattern save door: a save straight after a query GET is refused. My direct test triggered it, and it is present in signed 1.2.4 too. Live Studio 2670 Patterns look saves passed 5 of 5 on signed 1.2.4, because Studio saves through POST /api/config. The change stays parked until it is re-checked on a card through the real save paths.

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

## The cause is older than look tuning (measured 2026-11-23)
Measured on 52e9136e, which has **no** look-tuning code (candidate-blob and drop-stale-rollback-record only):
- `GET /api/client-pattern?patternId=fire` makes the next `POST /api/client-pattern` answer **400 `{"ok":false,"error":"invalid pattern envelope"}`**.
- A `GET /api/status` sent in between clears it, and the next save is accepted.
- The second bench check on that build passed light count, saves, content and restart (4 of 5), but look saves passed 0 of 5.

The client-pattern handler is unchanged since signed 1.2.4. So the fault predates both the slot swap and look tuning, and it is the likely reason look tuning failed here: its save path reads the pattern first, then posts it.

## Reading (unproven)
The `GET`'s query argument (`patternId=fire`) is probably still counted by `server.args()` when the following `POST` is checked. The `doc.size() != 4 || server.args() != 0` gate in `handleClientPatternPost` then refuses a well-formed envelope.

An earlier reading here blamed the shared `controlRequestBody` buffer. That is superseded: the fault reproduces with no `/api/control` call at all.

Start with a host test that sends GET client-pattern?patternId=… → POST client-pattern, and expects 200. Check it against signed 1.2.4 as well.

## Before this change is sent again
1. Land the GET → POST fix (queue entry client-pattern-after-query-get), or at least run the re-check with it applied.
2. Re-check look tuning on a card through Studio's real save path (POST /api/config) and through the phone player (status read before each save). Do not use a bare GET → POST sequence.
3. Repeat: save a tuning, restart, change it, undo it. Each step must be accepted and read back.
