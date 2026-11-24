# Give the card more room for the project it is sent

Design only. Nothing here is built, and every option below needs a signed
firmware release (a VERSION bump and a flash or Wi-Fi update).

## What is wrong today

Save to card sends the whole project as one JSON body to `POST /api/config`,
and the card refuses anything over 3968 bytes. Adrian's real card project
(6 looks, 41 pixels, 5 strips) is already 3895 to 3923 bytes. Changing one
strip's look makes it about 4444 and is refused.

The number 3968 is not one limit. It is the same constant in four places that
a build-time assert keeps equal:

- `LW_CARD_HARDWARE_CONFIG_CAPACITY_BYTES` (`LightweaverHardwareContract.h`).
  Studio reads this too (`cardHardwareContract`).
- `LW_MAX_RUNTIME_REQUEST_BODY_BYTES` and `LW_WEB_CONFIG_MAX_BODY_BYTES` in
  `LightweaverWeb.cpp`. The request body is held in one static buffer, so the
  body cap is also a RAM cap.
- `LW_RECIPE_MAX_CONFIG_BYTES` in `LightweaverRecipe.h`.
- `NVS_STRING_LIMIT` in `LightweaverStorage.cpp`. It still gates the save
  (line ~2466) even though the project itself is now stored as a blob (see
  `LightweaverProjectStore.h`), so the NVS single-string ceiling is no longer
  what actually binds.

## Option A. Raise the one cap (smallest change)

The project is already a blob, which NVS splits across pages, so the string
ceiling does not apply to it. What is left is the request buffer and the NVS
partition, which is only 0x5000 bytes (five 4 KB pages, one always kept free).

- Raise the cap to about 6 KB and enlarge `runtimeRequestBody` to match.
  Cost is about 2 KB more static RAM. Measure free heap on the real card first;
  the JSON parse also builds a document in heap that is a few times the body
  size, so the real cost is the parse, not the buffer.
- Raise `NVS_STRING_LIMIT` and `LW_RECIPE_MAX_CONFIG_BYTES` together, and keep
  the asserts so they cannot drift.
- NVS is the hard stop. A 6 KB blob is about 200 of the roughly 500 entries
  the partition holds, and the slot swap keeps two project copies. Check
  `projectRoomBytes` against a real card before promising a number.
- Rough size: a few lines in four files, plus Studio's contract constant, plus
  the host NVS room test. Needs a signed release. Cards on older firmware keep
  the old cap, so Studio has to read the cap from the card, not assume it.

## Option B. Several NVS keys

Split the config into parts (hardware, zones, one key per look) and write them
as a set.

- Gains: each key stays small, and one look can change without rewriting the
  rest.
- Costs: a multi-key write is not atomic. The slot swap that makes a save
  power-loss safe today would have to cover all the keys together (an index
  key written last). The wiring digest, the config digest and the known-good
  and candidate flow all assume one document.
- Rough size: large. New index record, a changed load path, migration from the
  single blob, and a rewrite of the candidate/known-good tests. Needs a signed
  release. Not recommended unless Option A hits the NVS wall.

## Option C. Store the config as a file (best long-term)

The card already has a file project store: `LightweaverProjectRepository`
keeps projects as hash-named files under `/lw-projects` on LittleFS, uploaded
in 2 KB chunks through `/api/projects/begin`, `chunk` and `commit`, up to
768 KB each, with a staged head and a known-good head (the repository exists
today and is used for project history).

- Gains: no practical size limit for a project, chunked upload so no big RAM
  buffer, an atomic head pointer, and room for per-look detail that Studio
  currently cannot send.
- Costs: the runtime still has to load the config from that file at boot and
  parse it. The parse needs a heap budget or a streaming parser, so the
  document-in-RAM limit simply moves. The wiring-test candidate flow, the
  recovery path and the SD path all read `knownGoodConfig` today and would
  need to read the file head instead, with the NVS blob kept as a fallback for
  a card whose LittleFS fails.
- Rough size: medium to large. The upload half exists. The work is the boot
  loader, the candidate/known-good flow on file heads, Studio switching to
  chunked upload, and a capability flag so Studio only uses it on a card that
  reports it. Needs a signed release.

## Order

1. Studio-only trimming first (no release): drop fields the card treats as
   defaults. About 21 percent saved on the real project, enough to fit the
   4444-byte change with about 300 bytes to spare. Where it comes from: look
   section labels that repeat the card's own section labels (540 bytes), the
   control pins and output colour values that equal the firmware defaults
   (about 250), and `mode: "website-flash"` (25). The look labels are only
   read back, never used by the card to play anything.
2. Option A when the next real firmware change is already going out.
3. Option C only if looks keep growing past what A allows.
