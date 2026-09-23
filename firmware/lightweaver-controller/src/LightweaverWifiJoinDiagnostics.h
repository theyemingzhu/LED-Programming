#pragma once

#include <cstdint>

namespace lightweaver {

// Transient observations only. A driver reason describes what the radio saw;
// it is never proof that a particular password, router, or band is at fault.
struct WifiJoinDiagnostics {
  std::uint32_t generation = 0;
  std::uint16_t driverReason = 0;
  const char* failureStage = "";
  const char* failureReason = "";
  bool active = false;
  bool sawAssociation = false;

  void begin(std::uint32_t nextGeneration) {
    generation = nextGeneration;
    driverReason = 0;
    failureStage = "";
    failureReason = "";
    active = true;
    sawAssociation = false;
  }

  void retry(std::uint32_t expectedGeneration) {
    if (!active || generation != expectedGeneration) return;
    // Keep the last useful failure visible until this retry succeeds or has
    // its own observation. Association evidence is per physical attempt.
    sawAssociation = false;
  }

  void associated(std::uint32_t expectedGeneration) {
    if (active && generation == expectedGeneration) sawAssociation = true;
  }

  void disconnect(std::uint32_t expectedGeneration, std::uint16_t reason) {
    if (!active || generation != expectedGeneration || reason == 0 || reason == 8) return;
    sawAssociation = false;
    driverReason = reason;
    failureStage = "association";
    switch (reason) {
      case 201: failureReason = "no_compatible_access_point"; break;
      case 202: failureReason = "authentication_failed"; break;
      case 15:
      case 204: failureReason = "handshake_incomplete"; break;
      default: failureReason = "connection_failed"; break;
    }
  }

  void timeout(std::uint32_t expectedGeneration) {
    if (!active || generation != expectedGeneration) return;
    if (sawAssociation) {
      driverReason = 0;
      failureStage = "ip";
      failureReason = "no_ip_address";
    } else if (driverReason == 0) {
      failureStage = "association";
      failureReason = "connection_timed_out";
    }
  }

  void stationStartFailed(std::uint32_t expectedGeneration) {
    if (!active || generation != expectedGeneration) return;
    driverReason = 0;
    failureStage = "station";
    failureReason = "station_restart_unconfirmed";
  }

  void linkLost(std::uint32_t expectedGeneration) {
    if (generation != expectedGeneration) return;
    active = true;
    failureStage = "link";
    failureReason = "station_connection_lost";
  }

  void succeed(std::uint32_t expectedGeneration) {
    if (generation != expectedGeneration) return;
    driverReason = 0;
    failureStage = "";
    failureReason = "";
    active = false;
    sawAssociation = false;
  }
};

}  // namespace lightweaver
