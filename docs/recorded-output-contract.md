# Recorded output order

Studio records complete frames in compiled physical output order. Each output
contributes its contiguous pixel slice, in configured output order. Run reversal
is already applied when rendering these bytes; firmware must not apply it again.
The normal output color/current pipeline still applies.

## LWSEQ1 GPIO binding

The existing 64-byte LWSEQ1 header and RGB payload remain in use. Integers are
little-endian. New recordings fill reserved bytes with this extension:

| Byte offset | Size | Meaning |
| --- | --- | --- |
| 24 | 4 | ASCII `LWOP` |
| 28 | 1 | Extension version, currently 1 |
| 29 | 1 | Number of outputs, equal to the existing count at offset 10 |
| 30 | 2 | Zero |
| 32 + 4 × i | 2 | GPIO pin for output i |
| 34 + 4 × i | 2 | Pixel count for output i |

There are four slots. Unused slots are zero. Active pins are distinct, counts
are positive, and their sum equals the total at offset 12. Playback compares
the active ordered pins/counts with the current firmware configuration before
opening the sequence. Matching only the total is insufficient.

This binding describes output boundaries, not every artwork/source identity.
Studio separately verifies the recording source and full current layout before
installation. A wiring or geometry edit may require recording again even when
GPIO counts have not changed.

Firmware capability `sequenceMedia.version = 2` identifies physical-order
playback and this header validation. Studio requires that capability for its
verified upload path. A firmware version string alone is insufficient.

## Older projects

An old multi-output file without GPIO binding is retained for project recovery,
but requires recording/export again before installation. The error must say so.
Portable import/export preserves valid source and hash-verified old bytes;
integrity verification is separate from playback eligibility.

An all-zero legacy extension remains accepted for single-output playback when
its output count and total length match. Such a file does not bind a GPIO pin.
Malformed extensions are rejected rather than treated as legacy files.

## Live Studio frames

Live Studio frames use the same physical order and carry `lwPhysical: 1` on
each transport chunk. Firmware advertises `physicalFrameOrder.version = 1`;
the card-page bridge uses protocol 8 to preserve the marker. Marked Studio
frames have their own frame-source identity, keeping the existing ownership,
Stop and timeout rules. Unmarked WLED, Art-Net and HTTP frames retain logical
segment-direction mapping.

## Evidence

The shared JavaScript encoder and C++ playback helper have independent literal
header fixtures. Executable C++ tests cover unequal output slices, reversed
segments, unchanged physical sequence frames, native logical mapping, and
rejection of mismatched output boundaries. See the
[completion evidence](plans/2026-09-25-multi-gpio-completion-evidence.md) for the
exact verification results and physical checks still pending.
