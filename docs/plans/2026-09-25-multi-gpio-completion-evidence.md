# Multi-GPIO completion and push

This is the completion batch after `92866e92`, requested before pushing the
multi-output branch. It is not a physical-light observation or production release.

## Concrete remaining defects

Recorded frames are already in physical GPIO output order. Firmware previously
applied the logical segment reversal again at the final output copy, reversing
recordings twice on reversed runs. The fix preserves recorded physical order
while retaining the correct mapping for native patterns.

LWSEQ originally described the total pixel count without binding individual
GPIO boundaries. An equal-total wiring change could therefore leave a sequence
eligible for the wrong outputs at restart. The shared encoder and firmware now
use a compact `LWOP` extension in the reserved header space: ordered GPIO pins
and counts, with exact comparison before playback. This keeps the existing
LWSEQ1 payload and 64-byte header. Media capability version 2 identifies support.
Unbound legacy multi-output files require recording/export again; legacy
single-output files retain their limited compatibility.

The same reversal problem also affected Studio physical preview frames. The
transport fix marks those frames explicitly and firmware bypasses logical
reversal only for marked Studio frames. Unmarked WLED and Art-Net retain their
existing logical mapping. Compatibility negotiation prevents older firmware
from silently ignoring the marker and displaying the wrong order.

## Ownership

- Sol high: firmware mapping, sequence activation/header checks, executable C++
  regressions and target compilation.
- Sol high: shared recording encoder, client capability checks, portable media
  and mixed native/recorded runtime package verification.
- Sol high: Layout/Patterns/Bench cross-screen regression and visual inspection.
- Manager: integration, user guide, checkpoint, evidence and branch push.

## Evidence

UI checks pass 2/2: a 27/17-LED two-GPIO Layout miniature → Patterns journey
with same → separate patterns and reload; and a 30/20-LED Bench journey through
same → separate → Keep and exact measured install package. The existing UI
needed no additional controls. Layout and phone screenshots were inspected.

Media checks pass across Flow/Lab encoding, mixed native/recorded Playlist
packages, unequal/reversed outputs, compact metadata, and portable restore.
The final focused Flow/Lab/delivery suite passes 31/31. Tests explicitly retain
SHA-valid old multi-output source/bytes during portable recovery, while blocking
installation before any card request; malformed extensions, duplicate/zero GPIOs
and incompatible firmware are rejected.

Transport checks passed 75/75 Node cases plus the frame-stream and bridge-handoff
suites. Direct WebSocket and HTTP negotiate physical-frame capability; bridge
requires protocol 8. The shared socket-open race cannot bypass capability checks.

Executable firmware checks passed under WSL: physical multi-GPIO frame mapping
and marked-source arbitration, allocation bounds, color order, output policy,
and owner capability. Direction, bridge, HTTP stream and media source contracts
also pass. The final ESP32-S3 compile succeeded with 230680 bytes RAM and 2321825
bytes flash. This closes the earlier unavailable-host-compiler limitation; WSL
has the required C++ compiler. The executable mapping test is registered in the
source gate. Log: `firmware/lightweaver-controller/.pio/multi-gpio-final-compile-20260925.log`.

Integrated checkpoint: 2798/2798 unit tests and production build pass. Nine
distinct browser cases pass: the two Layout/Patterns/Bench journeys above,
verified scene install, three wiring-drift refusals, exact marked 5/17/27-LED
three-GPIO rehearsal, navigation restoration, and Show restoration.
The rehearsal fixtures now establish an explicit connection and import the
app's actually loaded transport module; after HMR, an unversioned dynamic import
had created a second authority singleton. Owner and mapping checks were not
weakened. The final fixture-only repair required no product changes or repeat
of the passing checkpoint.

Checkpoint log: `%TEMP%/lightweaver-multi-gpio-completion-checkpoint.log`.
Implementation commit `55c607de` was pushed successfully to
`origin/codex/multi-output-pattern-workflow`. No merge, deployment,
signing or card flash is part of this push. Pre-existing firmware thumbnail
changes and release fixtures remain outside the commits; target compilation
used the working tree, including those pre-existing thumbnail changes.

The updated user guide covers the complete
same/different, stacked, Flow recording and Playlist path using current labels.

## Remaining physical and release gates

Actual unequal strips on multiple GPIOs, reversed-strip appearance, microSD
playback, mixed native/recorded transitions, offline restart and interrupted
upload recovery need Bench observation. Machine tests cannot mark those passed.
Pushing the branch does not update the public Studio or a connected card.
