# Card-first resume — read-only baseline

State: machine baseline captured; implementation in progress; physical appearance not verified by agent.
Card: lw-b0fe81f61b44 at lightweaver.local.
Boot: boot-b9fe4fab-b0fe81f61b44. Firmware build: 2160.
Observation: GET /api/status on 2026-09-29; no mutation or firmware update.
Installed project: lightweaver-bench-discovery-v1, revision 10.
Fingerprint: b27fd495241a9f27f9a885e99c8722dfb27fd495241a9f27f9a885e99c8722df.
Runtime: ready; commandReady, playbackReady, outputReady and knownGoodProject true.
provisionalSetup: false. Source: internal-flash.
Current pattern: lightweaver-section-layout.
Wiring revision: 0; wiring digest absent.
Output: out1, GPIO18, 41 configured pixels.
Segments: bench-18-full 11; run-strip-2 5; run-strip-3 10; run-strip-4 10; run-strip-5 5; all forward.

Interpretation: do not infer temporary setup solely from the historical project name.
Readiness does not prove visible playback or physically correct counts/colour.
The screenshot reports active lights; fresh physical observation has not been requested.

Next: after candidate browser verification, reread this exact card and confirm
opening/reconnecting the candidate preserves its installed configuration.

## Candidate acceptance

Browser21 distinct cases passed with simulated/injected card evidence. Zero card
mutation on entry/reconnect/adoption inspection is asserted in the regression.
The actual rendered phone/desktop screens were inspected; phone primary action
is above the fold. Last-seen41GPIO18 is retained on disconnect, draft55 preserved.
Integrated3019unit tests and build passed; bounded final regressions and final
build passed after screen/reconnect fixes. Physical light continuity on the new
candidate remains unperformed. No firmware flash or real card command was sent.

Next: when exercising the candidate on hardware, re-correlate exact card and boot,
then verify opening/reconnecting preserves its configuration and visible playback.
