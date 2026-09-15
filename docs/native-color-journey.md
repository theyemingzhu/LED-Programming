# Standalone Color Journeys v1

Status: implemented in the direction-two checkout; local software verification
and final integration review are complete. No release or real-card proof is
implied by host tests.

## Playback contract

A Color Journey uses 2–8 authored RGB colors. Each color holds for 0–600,000 ms,
then fades for 1,000–600,000 ms. Linear interpolation mixes channels directly;
smooth interpolation uses `p*p*(3-2*p)`. Round mixed channels before applying
movement brightness. A looping journey fades from the final color to the first.
A non-looping journey holds the final color indefinitely (its final fade is not
played). Timing uses literal milliseconds, independently of generic pattern speed.

Selecting a journey starts its first hold at elapsed zero, including when it is
the incoming look of a playlist fade. Power-on also starts at elapsed zero. The
restart policy is explicitly `restart`; no playback cursor is persisted. A RAM-only
64-bit elapsed accumulator uses unsigned 32-bit tick differences, maintaining
continuity through the roughly 50-day device timer wrap. Existing
playlist dwell and visitor selection semantics otherwise remain unchanged.

Movement preserves the authored artwork-coordinate wave:

```
phase = normalizedArtworkX + 0.35 * normalizedArtworkY
brightness = 1 - depth * (0.5 + 0.5 * sin(2π * (phase - elapsed / period)))
```

The compiler stores phase modulo one turn as unsigned Q0.16 values, each encoded
as exactly four hexadecimal characters, in physical output order. Quantization
is bounded to half of 1/65,536 turn; the shared rendered-color acceptance tolerance
is one RGB channel level. There is no conversion to one-dimensional strip motion.
Layouts or recipe features that cannot preserve this mapping must be rejected.

## Wire format

A saved look carries this `nativeRecipe` (example phases are illustrative):

```json
{
  "version": 1,
  "kind": "color-journey",
  "id": "slow-color-drift",
  "journey": {
    "version": 1,
    "stops": [
      { "color": "#ff0000", "holdMs": 1000, "fadeMs": 2000 },
      { "color": "#0000ff", "holdMs": 1000, "fadeMs": 2000 }
    ],
    "easing": "smooth",
    "loop": true,
    "restart": "restart",
    "motionSpeedMs": 18000,
    "depth": 0.25,
    "phase16": "00008000"
  }
}
```

`motionSpeedMs` is 4,000–90,000. Depth corresponds to restrained (0.12), balanced
(0.25), or expressive (0.42). The maximum phase count is 256 pixels and must match
the installed configuration's total physical pixel count. The entire serialized
card configuration, including all other looks and wiring, must fit 3,968 bytes;
256 pixels is an upper bound, never a promise that every project fits.

Cards advertise:

```json
{
  "recipeCapabilities": {
    "colorJourney": {
      "version": 1,
      "maxPixels": 256,
      "phaseEncoding": "q0.16-hex",
      "restart": "restart"
    }
  }
}
```

Studio permits offline project authoring and requires this capability at actual
card installation. Missing capabilities and older
cards do not imply support. Older v1 recipe parsers reject the payload because
it has no legacy palette/layer graph. New parsers reject unknown kinds, versions,
invalid colors/timings/phase encodings, mismatched pixel counts and excess bytes.

## Preservation and integration

Keep the authored Pattern Lab recipe with the saved Studio look, so editing and
readback preserve the source intent. Compile phase from the current installation
layout. Card readback lacks the original artwork coordinates, so it retains exact
native phase and a layout fingerprint. Color/timing edits and Lab resave preserve
that phase; changed readback layouts block installation until the matching layout
is restored. Journeys authored from Studio geometry compile from current geometry.
Whole-piece targeting is required. Scoped source authority, inactive address holes,
partial/duplicate wiring, hidden strips, symmetry, layers and per-strip brightness,
speed or hue modifiers are rejected when they cannot preserve the authored frame.
Reuse the
existing native recipe registry, saved-look serialization, configuration
validation and preserving write transaction. Do not allocate per frame, persist
per frame, or expand boot pixel allocation to a new hardware ceiling.

Direction one (section-aware Pattern Lab) is separate concurrent work. Integration
must retain its selected-section authority: do not enable a global native journey
for a section-only recipe until a matching section compile/render contract exists.
Keep changes to `PatternLabScreen.jsx` limited to journey capability, compilation
and handoff state. Existing built-in and baked sequence behavior must stay intact.

## Evidence and unperformed gates

Shared samples: [color-journey-v1-samples.json](fixtures/color-journey-v1-samples.json).
They derive expected colors from the original Studio timing and artwork wave,
including fade edges, zero holds, loop boundaries, smooth/linear interpolation,
one-shot terminal colors, negative/wrapping artwork phase and long elapsed time.

Software evidence (2026-09-15):

- Final integrated checkpoint: 2,501 unit tests passed and production build passed
  (existing large-chunk warnings only). Final focused browser suite: 18 passed in
  25.9 seconds. No exhaustive release gate was run.

- Shared fixture checks pass in JS and native C++: three journeys, 63 elapsed-time
  samples and seven artwork coordinates each. Samples include two device timer
  wraps. A rollover regression was witnessed red before the RAM accumulator fix.
- PlatformIO native recipe suite: 13 passed, including malformed payload
  preservation, strict bounds, restart and timer wrap.
- ESP32-S3 compile passed: RAM 223,712 / 327,680 bytes (68.3%); flash 2,204,877 /
  6,553,600 bytes (33.6%). `NativeRecipe` is 760 bytes, using shared union storage.
- Existing hash/config install, interrupted wiring promotion, control transaction,
  storage stack safety, boot allocation clamp and playlist contracts passed.
- Native renderer golden checks include physical segment reversal end to end.
- Actual in-app browser inspected at 1280×800 and 390×844: journey timing,
  interpolation, loop, hold/fade inputs and disabled empty-project handoff.
  Automated browsers additionally exercise a mapped, reversed 16-pixel fixture.
- A browser regression reproduced the saved-journey “Save as new” bypass;
  journey editing now returns to Lab without creating an Aurora replacement.

Repeatable verification commands from the repository root:

```sh
node scripts/lightweaver-dev.mjs checkpoint
node scripts/lightweaver-dev.mjs focused tests/color-journey-standalone.spec.ts tests/pattern-lab-creative-flow.spec.ts tests/pattern-lab-handoff.spec.ts tests/pattern-lab-live-preview.spec.ts
pio test -d firmware/lightweaver-controller -e native
node firmware/lightweaver-controller/tests/color-journey-samples.mjs
node firmware/lightweaver-controller/tests/kaleidoscope-render-golden.mjs
pio run -d firmware/lightweaver-controller
```

CI runs the shared JS fixtures in `test:unit`, the native fixtures in `test:core`
and the firmware build job, and the focused browser in `ci:browser-regression`.

Unperformed real-card gates: close Studio and observe uninterrupted playback;
power-cycle and observe restart at the first color; compare RGB hues and artwork
motion on the installed LEDs. No real hardware commands, flashing, version bump,
signing, merge or deployment are authorized for this task.

## Local handoff

Branch: `codex/standalone-color-journeys`. Firmware contract/rendering commit:
`d9fcc031`. The following Studio commit on this branch contains compiler, UI,
capability gates, readback, CI and software evidence. Nothing was pushed.

Direction-one integration should resolve `PatternLabScreen.jsx` deliberately:
retain its selected-target helper and section snapshots; preserve this branch’s
whole-piece native guard, exact prospective-config preflight and install gate.
Next physical proof requires an explicitly authorized Bench/release session.
