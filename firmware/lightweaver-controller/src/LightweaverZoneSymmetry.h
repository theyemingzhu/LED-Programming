#pragma once

#include <cstdint>

// Symmetry sides: the card half of the runtime-config contract in
// lightweaver/todo/plans/symmetry-sides.md ("Card runtime config").
//
//   zones[].continuous: true   the zone's ranges form ONE pattern run in range
//                              order: the pattern sees a single index space of
//                              sum(range.count) pixels and each range receives
//                              its slice of it.
//   zones[].mirrorOf: "<id>"   after the source zone has rendered, this zone
//   zones[].mirrorFlip: bool   copies the source's logical pixels (source range
//                              order), stretched to its own length, reversed
//                              when mirrorFlip. It renders no pattern of its own.
//
// Both also appear on looks[].zones[] entries (mirrorOf/mirrorFlip only).
// Mirroring is internal rendering only: Art-Net, WLED realtime and HTTP frame
// streams write leds[] directly and never pass through the mirror copy.
//
// Arduino-free and header-only so the index math, the copy and the validation
// rules are unit tested natively (tests/zone-symmetry.cpp) against the exact
// functions production calls.

// Reported as /api/firmware-info and /api/status capabilities.symmetrySides.
// Studio refuses to install a config using continuous or mirrorOf on a card
// that does not report it.
constexpr uint8_t LW_SYMMETRY_SIDES_VERSION = 1;

// Stored as a zone INDEX plus flag bits, never as strings: ZoneConfig and
// LookZoneConfig live inside RuntimeConfig, which is copied several times.
constexpr uint8_t LW_ZONE_NO_MIRROR = 0xFF;
// Parse-time marker for a mirrorOf that named no zone. Never reaches the
// renderer: strict validation rejects it and the lenient parser clears it.
constexpr uint8_t LW_ZONE_UNKNOWN_MIRROR = 0xFE;
constexpr uint8_t LW_ZONE_FLAG_CONTINUOUS = 0x01;
constexpr uint8_t LW_ZONE_FLAG_MIRROR_FLIP = 0x02;

// Target index i of n reads stretched source index round(i*(m-1)/(n-1)) of m.
// With mirrorFlip the stretched run is reversed (stretch first, then reverse),
// so i reads the stretched index n-1-i. A one-pixel target reads source 0.
// Rounding is half-up, which is Math.round() for these non-negative values, so
// Studio's preview lands on the same source pixel.
inline uint16_t lwMirrorSourceIndex(uint32_t targetIndex, uint32_t targetLength,
                                    uint32_t sourceLength, bool flip) {
  if (targetLength == 0 || sourceLength == 0) return 0;
  if (targetIndex >= targetLength) targetIndex = targetLength - 1;
  if (targetLength == 1) return 0;
  const uint64_t k = flip ? (targetLength - 1 - targetIndex) : targetIndex;
  const uint64_t span = targetLength - 1;
  const uint64_t numerator = 2ULL * k * (sourceLength - 1) + span;
  return static_cast<uint16_t>(numerator / (2ULL * span));
}

template <typename Range>
inline bool lwZoneRangeUsable(const Range& range, uint32_t totalPixels) {
  return range.count > 0 &&
         static_cast<uint32_t>(range.start) + static_cast<uint32_t>(range.count) <= totalPixels;
}

// Number of logical pixels a zone holds, across every usable range in order.
// The same ranges renderZone() skips (empty or past the canvas) count for
// nothing here, so a continuous run and a mirror agree on the length.
template <typename Range>
inline uint32_t lwZoneLogicalLength(const Range* ranges, uint8_t rangeCount,
                                    uint32_t totalPixels) {
  uint32_t length = 0;
  for (uint8_t r = 0; r < rangeCount; r++) {
    if (lwZoneRangeUsable(ranges[r], totalPixels)) length += ranges[r].count;
  }
  return length;
}

template <typename Range>
inline bool lwZoneLogicalToPhysical(const Range* ranges, uint8_t rangeCount,
                                    uint32_t totalPixels, uint32_t logical,
                                    uint32_t& physical) {
  for (uint8_t r = 0; r < rangeCount; r++) {
    const Range& range = ranges[r];
    if (!lwZoneRangeUsable(range, totalPixels)) continue;
    if (logical < range.count) {
      physical = static_cast<uint32_t>(range.start) + logical;
      return true;
    }
    logical -= range.count;
  }
  return false;
}

// Copies the source zone's logical pixels onto the target zone, stretched to
// the target's length and reversed when flip. Returns the number of target
// pixels written (0 when either zone holds nothing). Source and target ranges
// must not overlap; strict validation guarantees it.
template <typename Pixel, typename Range>
inline uint32_t lwCopyMirroredZone(Pixel* leds, uint32_t totalPixels,
                                   const Range* sourceRanges, uint8_t sourceRangeCount,
                                   const Range* targetRanges, uint8_t targetRangeCount,
                                   bool flip) {
  if (!leds) return 0;
  const uint32_t sourceLength =
      lwZoneLogicalLength(sourceRanges, sourceRangeCount, totalPixels);
  const uint32_t targetLength =
      lwZoneLogicalLength(targetRanges, targetRangeCount, totalPixels);
  if (sourceLength == 0 || targetLength == 0) return 0;
  uint32_t written = 0;
  for (uint8_t r = 0; r < targetRangeCount; r++) {
    const Range& range = targetRanges[r];
    if (!lwZoneRangeUsable(range, totalPixels)) continue;
    for (uint32_t offset = 0; offset < range.count; offset++, written++) {
      const uint32_t sourceLogical =
          lwMirrorSourceIndex(written, targetLength, sourceLength, flip);
      uint32_t sourcePhysical = 0;
      if (!lwZoneLogicalToPhysical(sourceRanges, sourceRangeCount, totalPixels,
                                   sourceLogical, sourcePhysical)) {
        continue;
      }
      leds[static_cast<uint32_t>(range.start) + offset] = leds[sourcePhysical];
    }
  }
  return written;
}

template <typename Zone>
inline bool lwZonesOverlap(const Zone& left, const Zone& right) {
  for (uint8_t a = 0; a < left.rangeCount; a++) {
    const uint32_t aStart = left.ranges[a].start;
    const uint32_t aEnd = aStart + left.ranges[a].count;
    for (uint8_t b = 0; b < right.rangeCount; b++) {
      const uint32_t bStart = right.ranges[b].start;
      const uint32_t bEnd = bStart + right.ranges[b].count;
      if (aStart < bEnd && bStart < aEnd) return true;
    }
  }
  return false;
}

enum class LwZoneMirrorError : uint8_t {
  None = 0,
  UnknownSource,   // mirrorOf names no zone in this config
  SelfSource,      // a zone mirrors itself
  ChainedSource,   // the source itself mirrors another zone
  OverlapsSource,  // the mirror copy would write into the source's own pixels
};

// Validates one complete mirror assignment: mirrorSource[z] is
// LW_ZONE_NO_MIRROR, LW_ZONE_UNKNOWN_MIRROR, or the source zone's index.
// A source may feed several mirrors, but may not itself mirror: that is what
// lets the renderer draw every source in one pass and copy in the next.
// On failure, badZone is the offending mirroring zone.
template <typename Zone>
inline LwZoneMirrorError lwValidateZoneMirrors(const Zone* zones, uint8_t zoneCount,
                                               const uint8_t* mirrorSource,
                                               uint8_t& badZone) {
  for (uint8_t z = 0; z < zoneCount; z++) {
    const uint8_t source = mirrorSource[z];
    if (source == LW_ZONE_NO_MIRROR) continue;
    badZone = z;
    if (source == LW_ZONE_UNKNOWN_MIRROR || source >= zoneCount) {
      return LwZoneMirrorError::UnknownSource;
    }
    if (source == z) return LwZoneMirrorError::SelfSource;
    if (mirrorSource[source] != LW_ZONE_NO_MIRROR) return LwZoneMirrorError::ChainedSource;
    if (lwZonesOverlap(zones[z], zones[source])) return LwZoneMirrorError::OverlapsSource;
  }
  badZone = 0;
  return LwZoneMirrorError::None;
}

inline const char* lwZoneMirrorErrorText(LwZoneMirrorError error) {
  switch (error) {
    case LwZoneMirrorError::UnknownSource: return "mirrors an unknown zone";
    case LwZoneMirrorError::SelfSource: return "cannot mirror itself";
    case LwZoneMirrorError::ChainedSource: return "mirrors a zone that itself mirrors another zone";
    case LwZoneMirrorError::OverlapsSource: return "shares pixels with the zone it mirrors";
    default: return "is valid";
  }
}
