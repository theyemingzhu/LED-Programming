#pragma once

#include <stddef.h>
#include <stdint.h>

// LWSEQ1 reserves bytes 24..47 for an ordered physical-output identity. Older
// single-output files can still play; a multi-output file without this identity
// cannot safely name the GPIO boundaries and must be recorded again.
inline uint16_t sequenceHeaderU16(const uint8_t* header, size_t offset) {
  return uint16_t(header[offset]) | (uint16_t(header[offset + 1]) << 8);
}

inline bool sequenceOutputTopologySyntax(const uint8_t* header, size_t headerBytes) {
  if (header == nullptr || headerBytes < 48) return false;
  const uint16_t count = sequenceHeaderU16(header, 10);
  if (count < 1 || count > 4) return false;
  const bool marked = header[24] == 'L' && header[25] == 'W' &&
      header[26] == 'O' && header[27] == 'P';
  if (!marked) {
    for (size_t offset = 24; offset < 48; offset++) {
      if (header[offset] != 0) return false;
    }
    return count == 1;
  }
  if (header[28] != 1 || header[29] != count || header[30] != 0 || header[31] != 0) return false;
  uint32_t pixels = 0;
  for (uint16_t index = 0; index < 4; index++) {
    const size_t offset = 32 + size_t(index) * 4;
    const uint16_t pin = sequenceHeaderU16(header, offset);
    const uint16_t length = sequenceHeaderU16(header, offset + 2);
    if (index < count) {
      if (pin == 0 || length == 0) return false;
      for (uint16_t earlier = 0; earlier < index; earlier++) {
        if (pin == sequenceHeaderU16(header, 32 + size_t(earlier) * 4)) return false;
      }
      pixels += length;
    } else if (pin != 0 || length != 0) return false;
  }
  const uint32_t declaredPixels = uint32_t(header[12]) | (uint32_t(header[13]) << 8) |
      (uint32_t(header[14]) << 16) | (uint32_t(header[15]) << 24);
  return pixels == declaredPixels;
}

template <typename Output>
inline bool sequenceOutputTopologyMatches(const uint8_t* header, size_t headerBytes,
                                          const Output* outputs, uint8_t outputCount) {
  if (!sequenceOutputTopologySyntax(header, headerBytes) || outputs == nullptr ||
      sequenceHeaderU16(header, 10) != outputCount) return false;
  if (header[24] == 0) return outputCount == 1 &&
      outputs[0].pixels == (uint32_t(header[12]) | (uint32_t(header[13]) << 8) |
                            (uint32_t(header[14]) << 16) | (uint32_t(header[15]) << 24));
  for (uint8_t index = 0; index < outputCount; index++) {
    const size_t offset = 32 + size_t(index) * 4;
    if (sequenceHeaderU16(header, offset) != outputs[index].pin ||
        sequenceHeaderU16(header, offset + 2) != outputs[index].pixels) return false;
  }
  return true;
}

// Apply one validated .lwseq RGB frame to the logical LED canvas. Sequence
// bytes are already rendered pixels, so this seam intentionally performs no
// procedural coordinate mapping (including Kaleidoscope folding).
template <typename Pixel>
inline bool applySequenceRgbFrame(Pixel* leds,
                                  uint16_t totalPixels,
                                  const uint8_t* rgb,
                                  size_t frameBytes) {
  const size_t requiredBytes = size_t(totalPixels) * 3U;
  if (leds == nullptr || rgb == nullptr || frameBytes != requiredBytes) {
    return false;
  }
  for (uint16_t index = 0; index < totalPixels; index++) {
    leds[index].r = *rgb++;
    leds[index].g = *rgb++;
    leds[index].b = *rgb++;
  }
  return true;
}

// LWSEQ frames are serialized in compiled physical output order. Procedural
// and external frames still use logical segment order and need the configured
// per-segment direction mapping. Keep this shared with the host runtime test.
template <typename Pixel, typename Output, typename Transform>
inline bool copyCanvasToPhysicalOutputs(Pixel* physical, const Pixel* canvas,
                                        uint16_t limit, const Output* outputs,
                                        uint8_t outputCount, bool canvasIsPhysical,
                                        Transform transform) {
  if (physical == nullptr || canvas == nullptr || outputs == nullptr) return false;
  if (canvasIsPhysical) {
    for (uint16_t index = 0; index < limit; index++) {
      physical[index] = transform(canvas[index]);
    }
    return true;
  }
  for (uint8_t outputIndex = 0; outputIndex < outputCount; outputIndex++) {
    const Output& output = outputs[outputIndex];
    size_t segmentStart = output.start;
    for (uint8_t segmentIndex = 0; segmentIndex < output.segmentCount; segmentIndex++) {
      const auto& segment = output.segments[segmentIndex];
      for (uint16_t offset = 0; offset < segment.count && segmentStart + offset < limit; offset++) {
        const size_t logicalIndex = segmentStart + offset;
        const size_t physicalIndex = segment.reversed
            ? segmentStart + segment.count - 1U - offset : logicalIndex;
        if (physicalIndex < limit) physical[physicalIndex] = transform(canvas[logicalIndex]);
      }
      segmentStart += segment.count;
    }
  }
  return true;
}
