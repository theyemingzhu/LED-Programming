// Runs the shipped LightweaverSequenceClock.h on a host. The card's main loop
// is modelled as a list of the moments it reaches the playback step; the
// clock has to turn any such list into the recorded speed.

#include <cassert>
#include <cstdint>
#include <cstdio>
#include <vector>

#include "LightweaverSequenceClock.h"

namespace {

struct Run {
  std::vector<uint32_t> shown;  // frame index of every frame drawn, in order
  uint64_t skipped = 0;
  uint32_t lastShownAtMs = 0;
};

// Loop passes `passMs` apart for `durationMs`, starting at `startMs`.
Run play(uint32_t startMs, uint32_t durationMs, uint32_t passMs, uint16_t fps,
         uint32_t frameCount, bool loop) {
  LwSequenceClock clock;
  lwSequenceClockStart(clock, startMs);
  Run run;
  run.shown.push_back(0);
  for (uint32_t elapsed = passMs; elapsed <= durationMs; elapsed += passMs) {
    const uint32_t now = startMs + elapsed;  // wraps like millis()
    const LwSequenceStep step = lwSequenceClockAdvance(clock, now, fps, frameCount, loop);
    if (!step.show) continue;
    assert(step.frameIndex < frameCount);
    run.shown.push_back(step.frameIndex);
    run.skipped += step.skipped;
    run.lastShownAtMs = elapsed;
  }
  return run;
}

void onTime() {
  // A fast loop (1 ms passes) shows every frame of a 5-second, 24 fps
  // recording exactly once, in order, and none is skipped.
  const Run run = play(1000, 4999, 1, 24, 120, true);
  assert(run.shown.size() == 120);
  for (uint32_t index = 0; index < 120; index++) assert(run.shown[index] == index);
  assert(run.skipped == 0);
  // Not early: nothing is drawn until a whole frame time has passed.
  LwSequenceClock clock;
  lwSequenceClockStart(clock, 50);
  assert(!lwSequenceClockAdvance(clock, 50, 24, 120, true).show);
  assert(!lwSequenceClockAdvance(clock, 91, 24, 120, true).show);
  const LwSequenceStep first = lwSequenceClockAdvance(clock, 92, 24, 120, true);
  assert(first.show && first.frameIndex == 1 && first.skipped == 0);
  // No drift from 1000 / 24 truncating to 41 ms: frame 24 is due at exactly
  // one second, not at 984 ms.
  LwSequenceClock exact;
  lwSequenceClockStart(exact, 0);
  assert(lwSequenceClockAdvance(exact, 999, 24, 120, true).frameIndex == 23);
  assert(lwSequenceClockAdvance(exact, 1000, 24, 120, true).frameIndex == 24);
}

void measuredCard() {
  // The real card on 2026-11-23: a main-loop pass of about 21 ms turned a
  // 24 fps recording into 16. With the same passes the clock now holds 24
  // frames a second on average and a 5-second loop takes 5 seconds.
  const Run run = play(0, 20000, 21, 24, 120, true);
  // 20 seconds is four loops: 480 frames. A frame is drawn on a pass, so at
  // most one frame's worth is still pending at the end.
  assert(run.shown.size() + run.skipped >= 479 && run.shown.size() + run.skipped <= 481);
  assert(run.shown.size() >= 470);  // 23.5 frames a second or better, drawn
  // Every loop starts where it should: frame 0 comes round at 5, 10, 15 s.
  LwSequenceClock clock;
  lwSequenceClockStart(clock, 0);
  uint32_t wrapsSeenAtMs[3] = {};
  uint32_t wraps = 0, previous = 0;
  for (uint32_t now = 21; now <= 16000; now += 21) {
    const LwSequenceStep step = lwSequenceClockAdvance(clock, now, 24, 120, true);
    if (!step.show) continue;
    if (step.frameIndex < previous && wraps < 3) wrapsSeenAtMs[wraps++] = now;
    previous = step.frameIndex;
  }
  assert(wraps == 3);
  for (uint32_t loop = 0; loop < 3; loop++) {
    const uint32_t expected = (loop + 1) * 5000;
    assert(wrapsSeenAtMs[loop] >= expected && wrapsSeenAtMs[loop] < expected + 21 + 42);
  }
}

void oneLateFrame() {
  LwSequenceClock clock;
  lwSequenceClockStart(clock, 0);
  assert(lwSequenceClockAdvance(clock, 42, 24, 120, true).frameIndex == 1);
  // The next pass arrives 100 ms late (a web request, say). Frames 2 and 3
  // were due in that gap; the card draws frame 4, the one due now.
  const LwSequenceStep late = lwSequenceClockAdvance(clock, 42 + 142, 24, 120, true);
  assert(late.show && late.frameIndex == 4 && late.skipped == 2);
  // And then carries on at the recorded speed: frame 5 is due at 209 ms.
  assert(!lwSequenceClockAdvance(clock, 208, 24, 120, true).show);
  const LwSequenceStep next = lwSequenceClockAdvance(clock, 209, 24, 120, true);
  assert(next.show && next.frameIndex == 5 && next.skipped == 0);
}

void longStall() {
  // A 12.5-second stall in a 5-second loop: two and a half loops go by. The
  // card resumes half way through the loop, where the music would be.
  LwSequenceClock clock;
  lwSequenceClockStart(clock, 0);
  const LwSequenceStep step = lwSequenceClockAdvance(clock, 12500, 24, 120, true);
  assert(step.show && step.frameIndex == 60 && step.skipped == 299);
  // A recording that does not loop jumps to its last frame and holds it.
  LwSequenceClock once;
  lwSequenceClockStart(once, 0);
  const LwSequenceStep end = lwSequenceClockAdvance(once, 12500, 24, 120, false);
  assert(end.show && end.frameIndex == 119);
  assert(!lwSequenceClockAdvance(once, 60000, 24, 120, false).show);
  assert(!lwSequenceClockAdvance(once, 4000000000u, 24, 120, false).show);
}

void loopWrap() {
  // The last frame, then frame 0 again, with no gap and no repeat.
  const Run run = play(0, 10100, 5, 24, 120, true);
  assert(run.shown.size() == 243 && run.skipped == 0);
  assert(run.shown[119] == 119 && run.shown[120] == 0 && run.shown[239] == 119 && run.shown[240] == 0);
  // A one-frame recording is drawn once and never again asked for a seek.
  const Run single = play(0, 5000, 10, 24, 1, true);
  for (uint32_t frame : single.shown) assert(frame == 0);
  // Playing across the 49-day millis() rollover changes nothing.
  const Run rollover = play(0xFFFFFFFFu - 2500u, 4999, 1, 24, 120, true);
  assert(rollover.shown.size() == 120 && rollover.skipped == 0);
  for (uint32_t index = 0; index < 120; index++) assert(rollover.shown[index] == index);
  // Nor does looping for a hundred days: the frame is still the right one.
  LwSequenceClock days;
  lwSequenceClockStart(days, 0);
  uint32_t now = 0;
  for (uint32_t step = 0; step < 8640; step++) {  // 8,640 steps of 1,000,000 ms
    now += 1000000u;
    lwSequenceClockAdvance(days, now, 24, 120, true);
  }
  assert(days.elapsedMs == 8640000000ull);
  assert(days.shownFrame == 8640000000ull * 24u / 1000u);
}

void slowAndFast() {
  // 1 frame a second: one frame per second, on the second.
  const Run slow = play(0, 10010, 7, 1, 10, true);
  assert(slow.shown.size() == 11 && slow.skipped == 0);
  assert(slow.shown[9] == 9 && slow.shown[10] == 0);
  LwSequenceClock clock;
  lwSequenceClockStart(clock, 0);
  assert(!lwSequenceClockAdvance(clock, 999, 1, 10, true).show);
  assert(lwSequenceClockAdvance(clock, 1000, 1, 10, true).frameIndex == 1);
  // 60 frames a second on a 1 ms loop: all 60 frames of each second.
  const Run fast = play(0, 999, 1, 60, 60, true);
  assert(fast.shown.size() == 60 && fast.skipped == 0);
  // 60 frames a second on the card's 21 ms loop cannot draw every frame; it
  // skips, and one second of recording still takes one second.
  const Run strained = play(0, 10000, 21, 60, 600, true);
  assert(strained.skipped > 0);
  assert(strained.shown.size() + strained.skipped >= 598 && strained.shown.size() + strained.skipped <= 601);
  // Nothing to play: never asks for a frame, never divides by zero.
  LwSequenceClock empty;
  lwSequenceClockStart(empty, 0);
  assert(!lwSequenceClockAdvance(empty, 5000, 0, 120, true).show);
  assert(!lwSequenceClockAdvance(empty, 5000, 24, 0, true).show);
  assert(lwSequenceFrameOffset(64, 0, 123) == 64u);
  assert(lwSequenceFrameOffset(64, 119, 2025) == 64u + 119u * 2025u);
}

}  // namespace

int main() {
  onTime();
  measuredCard();
  oneLateFrame();
  longStall();
  loopWrap();
  slowAndFast();
  std::puts("sequence clock: 6 groups passed");
  return 0;
}
