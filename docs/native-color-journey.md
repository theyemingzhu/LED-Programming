# Standalone Color Journeys

Status: v1 is integrated in release-cleanup; v2 lossless phase compression is
implemented and software-verified on `codex/scale-color-journeys`. The required
installation count is 4,096 physical pixels. No release or real-card proof is
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
(0.25), or expressive (0.42). For v1, the maximum phase count is 256 pixels and must match
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

## Larger journeys: lossless v2 phase spans

The outer `nativeRecipe.version` stays 1. Its `journey.version` is 2 and
`phases` replaces `phase16`. Each span is `[count, start, delta]`: count is a
positive integer, start is an unsigned Q0.16 phase, and delta is the signed,
unwrapped Q0.16 difference between the first and last phase. For local index i:

```
phase = round(start + delta * i / (count - 1)) modulo 65536
```

Rounding at a half goes toward positive infinity. A singleton has delta zero.
Count and start fit uint16; delta is within ±(count−1)×32768. Firmware uses a
64-bit intermediate, including for negative deltas. Counts sum exactly to the
installed physical count. Mixed v1/v2 fields, malformed spans, unknown versions,
overflow, and count mismatches are rejected before replacing configuration.

Studio derives the same per-pixel Q0.16 values as v1, unwraps neighboring phases,
and finds the longest exact span from each boundary until each encoded span
reproduces **every original value exactly**. It rejects layouts needing more than
64 spans; it never
changes the artwork, reduces pixel count, or approximates phases to make them fit.
The compiler uses legacy v1 for journeys of 256 pixels or fewer. Card readback
retains the native phase and existing layout fingerprint through timing/color
edits and resave, including reversed physical segments.

The representation accepts the existing hardware count range up to 65,535,
subject to the 64-span limit and the unchanged 3,968-byte **whole configuration**
limit. Studio also retains its conservative 250,000 estimated operations/frame
gate: the journey estimate is 32 operations/pixel, matching firmware, so the
default live handoff budget ends at 7,812 pixels. This estimate is not measured
card throughput; counts beyond it remain outside the current Studio live gate.
This is not a guarantee that arbitrary artwork or every saved-look bank fits.
The accepted 4,096-pixel browser fixture is a real SVG-sampled straight path in
reversed physical order. A representative 4,096-pixel cubic SVG exceeds the
64-span exact encoding and is rejected. Complex curves and irregular pixels may
therefore exhaust spans even at lower counts. Supporting those projects requires
a separately approved storage change. Physical output throughput, allocation and
frame rate remain dependent on the card and wiring; host tests cannot establish
practical maximum FPS.

New firmware additionally advertises:

```json
{
  "colorJourneyV2": {
    "version": 2,
    "maxPixels": 65535,
    "maxPhaseSpans": 64,
    "phaseEncoding": "q0.16-affine",
    "restart": "restart"
  }
}
```

This lives under `recipeCapabilities`, alongside the unchanged v1 capability.
A v2 installation requires this explicit capability from the exact card; a v1
capability alone cannot authorize it. Old firmware rejects journey version 2.
Existing NVS configuration, known-good/candidate transaction, HTTP byte limit,
playback timing, brightness and restart semantics are unchanged. The 64 spans
share the existing 512-byte phase union, avoiding per-pixel RAM multiplication
across saved looks. v2 phases remain in physical order; rendering translates
logical indices through the existing output segments before sampling.

Shared integer reference vectors:
[color-journey-v2-phases.json](fixtures/color-journey-v2-phases.json), including
negative half-rounding, wrap, reversed phases, mixed spans and extreme products.

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

Larger-journey evidence (2026-09-16):

- Integrated checkpoint: 2,528 unit tests passed and the production Vite build
  passed, with the existing large-chunk warning only.
- Focused browser suite: 10 passed. At 4,096 pixels it exercises real SVG
  sampling, reversed physical wiring, save, exact v2 capability rejection on an
  older card, one supported bridge config write, card readback, byte-budget
  preflight and exact sampled-color parity. The 1,024 path repeats the same
  install/readback contract. A 7,813-pixel fixture proves the operations gate.
- The representative 4,096-pixel cubic SVG is intentionally rejected because
  preserving every Q0.16 phase exactly needs more than 64 spans.
- PlatformIO native recipe suite: 15 passed. Shared parity covers the original
  three journey fixtures plus five v2 integer/rounding fixtures. The 1,024-pixel
  native renderer golden covers multiple outputs and reversed segments.
- ESP32-S3 compile passed: RAM 223,712 / 327,680 bytes (68.3%); flash 2,207,365 /
  6,553,600 bytes (33.7%). `NativeRecipe` remains 760 bytes.
- The actual desktop and 390×844 phone screens were inspected for the 4,096
  fixture. Both show the standalone handoff without horizontal overflow.

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

Branch: `codex/scale-color-journeys`, based on the integrated release-cleanup
branch. The commits on this branch contain the firmware renderer/parser contract,
Studio codec and capability gates, browser install/readback regression, shared
fixtures and this evidence. Nothing was pushed by this task.

Next physical proof requires the release/Bench session: close Studio and observe
continued playback, power-cycle and observe restart, then compare hues and motion
on the installed 4,096-pixel piece. That session must also establish practical
frame rate and power/output behavior for the actual wiring.
