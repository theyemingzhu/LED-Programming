# Owner workflow UI release — 2026-11-17

This release improves Card readiness and resuming unfinished work, SVG/DIY Layout,
complete saved looks and exact playlist Undo, artwork-shaped previews, compact
phone controls, validated separate Voices backup and the customer Player.
It builds on the existing sign-in and portable-project backup work on main.

The native relative-tuning/default-startup implementation is retained in
`firmware-queue/queue.json` and its patch, not compiled into this UI release.
Older multi-section cards keep playback/power/playlist controls and explain
when whole-look tuning needs newer firmware. This release does not flash a card.

The tested flow is open/reconnect → inspect versions and saved progress → resume
Lights/Layout/Looks or use installed A/B/C → preview/review → save/apply/readback.
Optional supported sound is separate. Updating retains recovery context and
requires installation verification. Editing can return to wiring/layout without
pretending previously verified physical behavior remains valid after changes.

Local combined evidence before rebasing onto main: 3,130 model cases, 124 affected
browser cases, 17 Card Facts cases, 22 subsequent mobile refinement cases, full
firmware core suite and Studio/Player builds passed. One HTTPS harness teardown
response-disposal error passed three repeats and remains known intermittency.
Release-candidate checks additionally cover the newer portable backup integration,
existing-card Player behavior and preserved updates against unchanged firmware.
CI and the persisted release observer own exact-revision deployment/live proof.

Hardware acceptance continues separately with multiple sections on the existing
GPIO 18 / 41-LED strip, per Adrian's current scope. Layout is the sole bench
operator. Verify exact restoration before replacing the working installation;
observe recall/restart behavior. Two-GPIO proof is outside this bench pass.
Native standalone sound remains unfinished and does not gate ordinary looks.

Current-main release candidate: all 3,133 model tests, 86 overlap browser cases,
complete core source suite, Studio/Player builds and client artifact verification
passed. No native firmware files changed; queue patch application checked cleanly.
