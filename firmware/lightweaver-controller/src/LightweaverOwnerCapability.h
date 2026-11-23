#pragma once

#include <Arduino.h>

class WebServer;

static constexpr uint32_t LW_OWNER_CAPABILITY_TTL_MS = 60000;
static constexpr size_t LW_OWNER_CAPABILITY_MAX_BODY_BYTES = 1024;
// Reported as /api/firmware-info and /api/status capabilities.ownerNoTouch.
// Present (1) means this card issues the owner permission, and accepts a
// firmware update, with no press on a card control. A card that does not
// report it still answers 403 "touch a card control to pair".
static constexpr uint8_t LW_OWNER_NO_TOUCH_VERSION = 1;

struct LightweaverOwnerBinding {
  String cardId;
  String bootId;
  String allowedOrigin;
  String host;
  String networkIdentity;
  String ownerSessionId;
  uint32_t operationGeneration = 0;
  String expectedProjectHead;
};

enum class LightweaverOwnerValidation : uint8_t {
  Accepted,
  Missing,
  Expired,
  TokenMismatch,
  BindingMismatch,
};

class LightweaverOwnerCapability {
 public:
  bool issue(const LightweaverOwnerBinding& binding, const String& token,
             uint32_t nowMs);
  LightweaverOwnerValidation validate(const String& token,
                                      const LightweaverOwnerBinding& binding,
                                      uint32_t nowMs);
  bool advanceExpectedProjectHead(const String& token,
                                  const LightweaverOwnerBinding& binding,
                                  const String& nextHead,
                                  uint32_t nowMs);
  void revoke(bool invalidateLeases = true);
  bool active(uint32_t nowMs);
  uint32_t leaseEpoch() const { return leaseEpoch_; }
  uint32_t expiresAtMs() const { return expiresAtMs_; }

 private:
  LightweaverOwnerBinding binding_;
  String token_;
  uint32_t expiresAtMs_ = 0;
  bool issued_ = false;
  uint32_t leaseEpoch_ = 0;
};

// Whether the card hands out an owner permission. No physical touch is part
// of this: an installed artwork cannot be reached, so a control press never
// authorises anything (Adrian, 2026-11-23). What still has to hold is the
// exact identity of the request: an allowed page origin, this card, this
// boot, and the project the caller believes the card is running.
enum class LightweaverOwnerIssueDecision : uint8_t { Issue, OriginRefused, BindingChanged };

inline LightweaverOwnerIssueDecision lightweaverOwnerIssueDecision(
    bool originAllowed, bool cardMatches, bool bootMatches, bool projectHeadMatches) {
  if (!originAllowed) return LightweaverOwnerIssueDecision::OriginRefused;
  if (!cardMatches || !bootMatches || !projectHeadMatches)
    return LightweaverOwnerIssueDecision::BindingChanged;
  return LightweaverOwnerIssueDecision::Issue;
}

bool constantTimeTokenEqual(const String& left, const String& right);
LightweaverOwnerCapability& lightweaverOwnerCapability();
void registerLightweaverOwnerCapability(WebServer& server);
