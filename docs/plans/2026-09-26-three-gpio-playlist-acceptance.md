# Three-GPIO playlist software acceptance

Status: done for the requested software workflow; three consecutive runs passed.
All six focused simulator compatibility cases have passing evidence. Adrian is remote; physical light
observation is outside this first software-integration step.

## Acceptance path

Connect an exact card, configure three GPIO outputs in Layout, assign a distinct
pattern to each, commit the combined look, add it to Playlist, save/reload and
verify the generated card configuration plus independent readback. Reject
mismatched identity, topology or payload instead of reporting false success.

Target source: `e934c65d13ebff2aeed7ea647285b9300d31d4a4`, Studio build 2161,
signed firmware build 2160. Isolated working branch: `codex/manager-three-gpio`.
Primary owns integration and one browser-test slot; Sol owns app-boundary review,
Luna the exact acceptance regression, Astra the firmware/protocol review.

## Evidence earned

- Existing focused GPIO/wiring/runtime tests: 27/27 passed. Existing card-page,
  anonymous grant and signature helper tests: 58/58 passed; automatic USB reset
  contract passed. These were run earlier in this manager task on clean release.
- App persistence/delivery/adoption/push-client checks: 80/80 passed.
- Firmware mapping/update/preview/recording compatibility checks: 80 passed,
  including executable C++ mapping and allocation tests.
- Focused browser integration: 13/14 initially passed. The composition-contact
  Add to Patterns click timed out at 60 seconds; unchanged traced rerun passed
  in 9 seconds. The first failure remains recorded as intermittent/unresolved.
  Log: `/tmp/lightweaver-manager-software-integration.log`; rerun:
  `/tmp/lightweaver-manager-composition-rerun.log`; trace directory:
  `/tmp/lightweaver-manager-composition-trace`.
- Live Studio: changed draft sections to GPIO 16/17/18, saved, reloaded, and
  observed exact section/pin/count associations on Patterns. Restored original
  four 11-pixel sections on GPIO 16 in original order and saved in browser.
  No project was installed on the real card.
- Layout shows saved playback while Patterns can recover unsaved draft looks.
  Observed Aurora versus Lava Lamp/Ocean labels were consistent with these
  separate states; no data-loss defect was established. The exact new regression
  must verify consistency after Keep commits the look.

## Real-card and production readback

At 2026-09-26 14:51:34 UTC, independent status and firmware-info agree on card
`lw-301bd5a172e0`, firmware build 2088, boot
`boot-6ea75941-301bd5a172e0`, project `lightweaver-bench-discovery-v1`, revision 1,
fingerprint `5f3f8317ec17c6db`. GPIO 15/512 pixels, current limit 2000 mA,
candle playback and idle updater are unchanged; command/playback readiness true.
Production marker returns `Cache-Control: no-store`, exact source above/build2161.
Studio's exact-card pairing and Verify hardware also succeeded earlier.

2088 supports ordinary native multi-output configuration and segment reversal.
Exact physical-order preview frames, safe provisional Bench audition and
topology-bound recording uploads require newer capabilities available in2160;
the audited clients reject incompatible old cards before those writes.

## Limits

Intermittent browser actionability stalls remain recorded below. This is focused
software acceptance, not an exhaustive Prove run or physical-output observation.
No new deployment, firmware release, real-card flash or physical proof is claimed.

## Integrated and live workflow evidence

- Integrated checkpoint: `node scripts/lightweaver-dev.mjs checkpoint` passed
  2,801/2,801 unit tests and the production build. Existing bundle-size warning
  remains. Log: `/tmp/lightweaver-manager-three-gpio-checkpoint.log`.
- Seven focused connection/playlist browser checks passed: bare-IP normalization,
  connect-intent closing, deferrable old firmware, project-mismatch readback,
  unreachable-card handling and desktop/mobile timed playlist installation.
  Log: `/tmp/lightweaver-manager-connection-playlist.log`.
- Created a separate live browser project, **Manager — three GPIO playlist
  acceptance**. Layout contains GPIO16/7 pixels/Fire, GPIO17/11 pixels/Ocean and
  GPIO18/19 pixels/Plasma. Kept **Three GPIO — Fire Ocean Plasma**, added it to
  Playlist, enabled local playlist configuration, saved and reloaded. Layout
  still displays each exact assignment and pattern; Playlist retains the look.
- Copied the generated chip configuration before and after reload through the
  visible UI. Outputs, combo-zone patterns and playlist are identical. Playlist
  has one combo entry, 30-second dwell and 1,500-ms fade. Only the session edit
  revision changes from 14 to 0. Source audit confirms edit revisions intentionally
  reset on reload; installed identity persists separately and the content
  fingerprint excludes revision. This is not evidence of lost saved content.
- Live browser console reported no errors at the final Layout inspection.
- Some pattern taps sent temporary native previews to the connected real card.
  The existing card has one output, so this proves command delivery, not actual
  three-output playback. Restored Candle and brightness166 after checking exact
  card identity, boot and project fingerprint. Independent status readback
  confirmed those restored values and unchanged GPIO15/512-pixel/2-A config.
  No configuration installation, reboot or firmware flash was performed.
- New acceptance fixture initially advertised the entire browser pattern bank
  as installed card looks, exceeding the real control-response size limit, and
  used the connection dialog name for the connected-card panel. These are fixture
  defects corrected before final acceptance; no application fix is claimed from
  those failures. Explicit Save and persistence polling remove autosave races.
- Final `three-gpio-playlist-workflow.spec.ts`: **3/3 consecutive runs passed**
  in 39.7 seconds with one browser worker. Covers exact-card connection, UI GPIO
  edits, three distinct patterns, Keep, saved Layout consistency, explicit Save,
  reload, combo playlist installation and independent supported-endpoint readback.
  No internal edit-authorization shortcut; no page errors, unexpected console
  errors or unhandled simulator requests. Expected signed-out session401s are
  separately modeled because Vite does not host Pages Functions. No sign-in gate
  appears. Log: `/tmp/lightweaver-manager-three-gpio-acceptance-final.log`.
- Registered the new workflow in both `ci:browser-smoke` and `test:release-ui`.
  The simulator now supports complete output topology, installed combo looks,
  zones and playlist readback. Source review corrected length-only wiring
  classification, rollback playback state and incomplete pin-only candidates.
- Compatibility first run: first install, ambiguous activation/rollback and
  desktop/mobile timed playlist saves passed (4 cases). Candidate confirmation
  exposed the incomplete pin-only simulator output, now corrected. Count-change
  timed out before a card write. Diagnostic reruns timed out earlier in UI
  interaction. Both cases pass on untouched e934c65d (18.8 seconds). With the
  corrected simulator, candidate confirmation now passes. Count-change still
  timed out waiting for row-click actionability before any card write. Trace
  analysis found a 56-second wait for
  animation-frame actionability on an ordinary visible row, but cannot prove the
  underlying browser/host cause.
- Final isolation: copied the exact new simulator into the known-passing clean
  release checkout and ran the unchanged count-save spec. **Passed in 10.9s**:
  typed count persisted, reboot/lost-reply recovered through readback, one config
  POST only. Restored the baseline helper and verified a clean checkout afterward.
  SHA256 of the tested and delivered helper matches
  `3effdb55f8a030798ac31740955051b30599a6cfad9ea0644f604cf5ed628adb`.
  Log: `/tmp/lightweaver-manager-helper-isolation.log`.
- All six compatibility cases therefore have passing evidence across runs;
  the initial failures and diagnostic timeouts are retained, not relabeled as
  clean first-run passes. No force-click, arbitrary sleep or timeout increase
  was used. No confirmed product-code defect was found in this acceptance task.
- Final cleanup: no browser-test or Vite process remains from these runs. Live
  Studio is left on the saved acceptance Playlist. No real-card three-output
  installation, physical LED verification, firmware flash or deployment claimed.
