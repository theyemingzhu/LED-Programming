#include <array>
#include <cassert>
#include <cstdint>
#include <cstring>

#include "LightweaverSequencePlayback.h"
#include "LightweaverFrameSource.h"

uint32_t hostNow = 0;
uint32_t millis() { return hostNow; }

struct Pixel { uint8_t r = 0, g = 0, b = 0; };
struct Segment { uint16_t count = 0; bool reversed = false; };
struct Output {
  uint16_t pin = 0;
  uint16_t pixels = 0;
  uint16_t start = 0;
  Segment segments[2];
  uint8_t segmentCount = 0;
};

int main() {
  // Independent literal LWSEQ1 v1/LWOP fixture: GPIO 16 has three reversed
  // LEDs, GPIO 18 has an unequal mixed-direction four, and GPIO 21 has two.
  uint8_t header[64] = {};
  std::memcpy(header, "LWSEQ1", 6);
  header[8] = 1;
  header[10] = 3;
  header[12] = 9;
  header[16] = 1;
  header[20] = 24;
  header[22] = 3;
  std::memcpy(header + 24, "LWOP", 4);
  header[28] = 1;
  header[29] = 3;
  header[32] = 16; header[34] = 3;
  header[36] = 18; header[38] = 4;
  header[40] = 21; header[42] = 2;
  const std::array<Output, 3> outputs = {{
    { 16, 3, 0, { { 3, true } }, 1 },
    { 18, 4, 3, { { 2, false }, { 2, true } }, 2 },
    { 21, 2, 7, { { 2, false } }, 1 },
  }};
  assert(sequenceOutputTopologyMatches(header, sizeof(header), outputs.data(), 3));
  auto wrong = outputs;
  wrong[1].pin = 19;
  assert(!sequenceOutputTopologyMatches(header, sizeof(header), wrong.data(), 3));
  wrong[1].pin = 18; wrong[1].pixels = 3;
  assert(!sequenceOutputTopologyMatches(header, sizeof(header), wrong.data(), 3));
  assert(!sequenceOutputTopologyMatches(header, sizeof(header), outputs.data(), 2));
  header[24] = header[25] = header[26] = header[27] = 0;
  assert(!sequenceOutputTopologyMatches(header, sizeof(header), outputs.data(), 3));
  std::memcpy(header + 24, "LWOP", 4);
  header[29] = 2;
  assert(!sequenceOutputTopologySyntax(header, sizeof(header)));
  header[29] = 3;
  header[36] = 16;
  assert(!sequenceOutputTopologySyntax(header, sizeof(header)));
  header[36] = 18;

  uint8_t legacy[64] = {};
  std::memcpy(legacy, "LWSEQ1", 6);
  legacy[10] = 1; legacy[12] = 3;
  assert(sequenceOutputTopologyMatches(legacy, sizeof(legacy), outputs.data(), 1));

  std::array<uint8_t, 27> rgb{};
  for (size_t index = 0; index < 9; index++) {
    rgb[index * 3] = static_cast<uint8_t>(index + 1);
    rgb[index * 3 + 1] = static_cast<uint8_t>(index + 31);
    rgb[index * 3 + 2] = static_cast<uint8_t>(index + 61);
  }
  std::array<Pixel, 9> canvas{}, physical{};
  assert(applySequenceRgbFrame(canvas.data(), 9, rgb.data(), rgb.size()));
  const auto identity = [](const Pixel& pixel) { return pixel; };
  assert(copyCanvasToPhysicalOutputs(physical.data(), canvas.data(), 9, outputs.data(), 3, true, identity));
  for (size_t index = 0; index < 9; index++) {
    assert(physical[index].r == index + 1);
    assert(physical[index].g == index + 31);
  }
  // Each GPIO controller receives its own contiguous, unequal slice.
  assert(physical[outputs[0].start].r == 1);
  assert(physical[outputs[1].start].r == 4);
  assert(physical[outputs[2].start].r == 8);

  // Procedural/external logical frames still honor each segment direction.
  assert(copyCanvasToPhysicalOutputs(physical.data(), canvas.data(), 9, outputs.data(), 3, false, identity));
  const uint8_t expectedLogical[] = { 3, 2, 1, 4, 5, 7, 6, 8, 9 };
  for (size_t index = 0; index < 9; index++) assert(physical[index].r == expectedLogical[index]);
  assert(!applySequenceRgbFrame(canvas.data(), 9, rgb.data(), rgb.size() - 1));

  // A marked Studio frame cannot inherit or leak its physical interpretation
  // into a later unmarked WLED producer. Stop and timeout return to native.
  assert(frameSourceClaim(FRAME_STUDIO_PHYSICAL));
  frameSourceMarkExternal(FRAME_STUDIO_PHYSICAL);
  assert(!frameSourceClaim(FRAME_WLED_REALTIME));
  assert(frameSourceActive() == FRAME_STUDIO_PHYSICAL);
  frameSourceCancelStream();
  assert(frameSourceActive() == FRAME_INTERNAL);
  assert(frameSourceClaim(FRAME_WLED_REALTIME));
  frameSourceMarkExternal(FRAME_WLED_REALTIME);
  assert(!frameSourceClaim(FRAME_HTTP_PHYSICAL));
  hostNow = LW_STREAM_TIMEOUT_MS + 1;
  frameSourceTick();
  assert(frameSourceActive() == FRAME_INTERNAL);
  assert(frameSourceClaim(FRAME_HTTP_PHYSICAL));
  frameSourceMarkExternal(FRAME_HTTP_PHYSICAL);
  frameSourceCancelStream();
  assert(frameSourceActive() == FRAME_INTERNAL);
}
