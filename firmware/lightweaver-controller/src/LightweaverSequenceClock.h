#pragma once

#include <stdint.h>

// Which frame of a recorded look is due right now.
//
// The old scheduler set the next frame's time to "the moment this frame was
// drawn + 1000 / fps". Every frame that was drawn a little late pushed all the
// later ones back, and nothing ever caught up: measured on the real card on
// 2026-11-23, a 24 fps recording played at 16 and a 5-second loop took about
// 7.5 seconds. 1000 / 24 also truncates to 41 ms, a second, smaller drift.
//
// This clock keeps no deadline. It adds up the real time that has passed since
// the recording started and asks which frame that time lands on:
//   frame = elapsed milliseconds x fps / 1000
// So a recording always runs at its recorded speed, and a loop of N frames
// always takes N / fps seconds, however unevenly the card's main loop runs.
//
// A frame that is already late is skipped, not drawn late: the card jumps to
// the frame that is due. Playing every frame would keep the picture complete
// and the speed wrong; the recording was made against a clock (and may be set
// to music), so the speed is what has to hold.
//
// Pure arithmetic, no Arduino dependency: tests/sequence-clock.cpp runs it.

struct LwSequenceClock {
  uint64_t elapsedMs = 0;   // real time since frame 0 went on screen
  uint32_t lastNowMs = 0;   // the millis() reading elapsedMs is counted up to
  uint64_t shownFrame = 0;  // frames since the start, counting through loops
};

struct LwSequenceStep {
  bool show = false;        // draw `frameIndex` now
  uint32_t frameIndex = 0;  // position inside the recording
  uint32_t skipped = 0;     // frames passed over because they were already late
};

// Frame 0 is on screen at `nowMs`.
inline void lwSequenceClockStart(LwSequenceClock& clock, uint32_t nowMs) {
  clock.elapsedMs = 0;
  clock.lastNowMs = nowMs;
  clock.shownFrame = 0;
}

// Call on every pass of the main loop. Elapsed time is summed from unsigned
// 32-bit differences into 64 bits, so the 49-day millis() rollover is just
// another small step and a recording can loop for as long as the card is on.
inline LwSequenceStep lwSequenceClockAdvance(LwSequenceClock& clock, uint32_t nowMs,
                                             uint16_t fps, uint32_t frameCount, bool loop) {
  LwSequenceStep step;
  if (fps == 0 || frameCount == 0) return step;
  clock.elapsedMs += uint32_t(nowMs - clock.lastNowMs);
  clock.lastNowMs = nowMs;
  uint64_t due = (clock.elapsedMs * fps) / 1000u;
  // A recording that does not loop ends on its last frame and holds it.
  if (!loop && due > uint64_t(frameCount) - 1u) due = uint64_t(frameCount) - 1u;
  if (due <= clock.shownFrame) return step;
  const uint64_t passedOver = due - clock.shownFrame - 1u;
  step.show = true;
  step.frameIndex = uint32_t(due % frameCount);
  step.skipped = passedOver > UINT32_MAX ? UINT32_MAX : uint32_t(passedOver);
  clock.shownFrame = due;
  return step;
}

// Where a frame starts in the file, after the 64-byte header.
inline uint64_t lwSequenceFrameOffset(uint32_t headerBytes, uint32_t frameIndex, uint32_t frameBytes) {
  return uint64_t(headerBytes) + uint64_t(frameIndex) * frameBytes;
}
