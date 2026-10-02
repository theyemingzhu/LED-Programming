# Lightweaver client player — proposed plan

Requested address: https://light.mandalacodes.com
Status: approved for implementation on 2026-09-29. App, firmware and hosting
lanes have non-overlapping ownership. Primary owns integration and screen proof.

## Recommended product

A dedicated, phone-first player entry in the existing Lightweaver codebase,
sharing the installed-pattern models, card identity checks and control transport.
The existing led.mandalacodes.com remains the Studio. The client page contains:

- Installation name, connection status and currently playing pattern.
- Pattern tiles populated only from the connected card's installed patterns.
- A playlist with add/remove, reorder and a duration for each entry.
- Two explicit playback choices: Repeat playlist and Stay on this pattern.
- Existing brightness slider; reuse speed and hue controls where supported.
- Card-confirmed feedback, clear disconnected state and a simple reconnect action.

Stay on this pattern stops automatic advancement while the pattern keeps animating.
Playlist timing runs on the ESP32, so closing the phone does not stop playback.
Saved playlist settings belong to the card and survive reconnect/restart. No
project editor, wiring tools or firmware tools appear in the client interface.
This is local installation control; the public address does not imply remote
internet access to the card. Use the existing local card-page bridge.

## Reuse and verified gaps

- `lightweaver/src/components/card/CardControlDrawer.jsx` and
  `lightweaver/src/lib/cardCustomerControls.js` already provide installed-pattern
  selection and customer controls. Extract/reuse the necessary controls rather
  than embedding the Studio navigation.
- `lightweaver/src/lib/cardPlaylist.js` already models playlist order/durations.
  Current timed limits are 16 entries, each 1–3600 seconds. Confirm against the
  shared hardware contract when implementing; retain existing fade behavior.
- Firmware already executes playlists and accepts play/pause/next/previous.
  Client playlist editing needs a narrow read/write API for installed pattern
  references, order and durations, without replacing the full project or wiring.
- Firmware bridge/CORS and browser bridge allowlists currently exclude the new
  domain. Add the exact origin with appropriate playback/playlist permissions;
  do not grant the client broad Studio editing capabilities by default.
- Existing slider dispatch includes patternId, which pauses playlist playback.
  Client slider changes must send only the changed control and confirm readback.
- DNS, Cloudflare account access, existing records and custom-domain availability
  have not been checked externally. They are implementation prerequisites.

## Alternatives

1. Recommended: dedicated client entry sharing existing code and release chain.
   Keeps the interface focused and avoids maintaining a second playback engine.
2. A separate copied app: independent packaging, but duplicates card behavior and
   increases drift. Not justified for this scope.
3. A domain that hands off to the existing Studio/card page: smallest initial
   hosting change, but does not deliver the requested dedicated client experience.

## Implementation workstreams

The primary integrates and owns the workboard, final screen review and delivery.

1. App owner — dedicated client shell and reusable playback controls, mobile
   layout, playlist editor and focused browser tests. Own client UI files within
   `lightweaver/src/` and corresponding tests. Build against an agreed API fixture
   until the firmware contract is available. Preserve unrelated current changes.
2. Firmware owner — narrow installed-playlist read/write contract, validation,
   persistence and exact client-origin access. Own firmware source and firmware
   tests. Reject unknown IDs and invalid values before mutation; preserve project,
   Wi-Fi, wiring and exact-card targeting. No account or physical-button workflow.
3. Hosting/CI owner — inspect Cloudflare records, create a separate Pages project
   and client build output using shared source, attach the exact custom domain/TLS,
   and extend staged-artifact and live-byte proof
   to the client surface. Own hosting/build/CI files. Publish the reviewed client
   entry only when ready; preserve the existing Studio address and release chain.
   Use client-specific routing/headers and a no-store client release manifest with
   the same repository commit-count build number. Current deployment hardcodes
   the Studio Pages project; add a target rather than repointing it. No cloud
   database, account service or cloud-to-card command relay is needed.

Agree the playlist contract first, then let these bounded lanes proceed in
parallel. Primary resolves shared contracts and integration; no overlapping edits.

## Acceptance and delivery

- Pattern list and now-playing state match the actual connected card.
- Add/remove/reorder/duration edits round-trip through the card; invalid and stale
  requests cannot corrupt configuration or target another card.
- Repeat cycles in order; stay-on-one keeps that pattern animating. Slider changes
  do not pause cycling. Browser disconnect does not own or interrupt timing.
- Reload/reconnect and card restart recover the saved playlist correctly.
- Disconnected/unsupported cards show truthful state; no fake successful writes.
- Verify phone and desktop screens, focused UI/API regressions, one integrated
  checkpoint and firmware checks appropriate to the changed contract.
- Real card persistence/playback/connection requires Bench evidence. Never report
  physical LED appearance as passed from a browser fixture.
- At publication, run the release gate once, hand the immutable revision to the
  durable runner and verify it starts. Report publishing in background until
  independent exact-artifact proof confirms both domain behavior and build identity.
- Any required firmware update uses signed, configuration-preserving software
  update; never a destructive factory image or a physical-button/login fallback.

## Execution checklist

- [ ] Firmware owner agrees playlist read/write envelope with app owner, writes
  rejection/persistence regressions, implements minimal API/bridge and compiles.
- [ ] App owner writes player behavior regressions, implements client entry and
  patch-only controls, and verifies tests against the agreed card fixture.
- [ ] Hosting owner builds the separate static output, verifies its artifact
  identity, provisions the exact requested domain and reports real access limits.
- [ ] Primary reviews combined changes, runs one integrated checkpoint, inspects
  phone and desktop screens, and records machine/physical proof separately.
- [ ] Publish only the reviewed immutable candidate through the existing release
  gates; persist background status and report the exact reached delivery boundary.

Next action: finish the three lanes and integrate their proof.
