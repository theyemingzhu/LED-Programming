#pragma once
#include <cstring>

inline bool effectiveLookRequiresSequenceMetadata(bool explicitModePresent,
                                                  bool explicitModeSequence,
                                                  bool inheritedSequence,
                                                  bool hasNativeRecipe) {
  if (hasNativeRecipe) return false;
  return explicitModePresent ? explicitModeSequence : inheritedSequence;
}

// Shared by runtime selection/playlist admission and native contract tests.
inline bool loadedLookZoneShapePlayable(const char* mode, bool zoneTargeted,
                                         bool hasZoneLooks, unsigned zoneCount) {
  const bool combo = mode && !strcmp(mode, "combo");
  return combo ? !zoneTargeted && hasZoneLooks && zoneCount > 0 : !hasZoneLooks;
}
