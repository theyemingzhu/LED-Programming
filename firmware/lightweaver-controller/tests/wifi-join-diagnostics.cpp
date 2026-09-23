#include <cassert>
#include <cstring>
#include "../src/LightweaverWifiJoinDiagnostics.h"

int main() {
  lightweaver::WifiJoinDiagnostics d;
  d.begin(7);
  d.disconnect(7, 202);
  d.timeout(7);
  assert(std::strcmp(d.failureStage, "association") == 0);
  assert(std::strcmp(d.failureReason, "authentication_failed") == 0);
  assert(d.driverReason == 202);
  d.retry(7);
  assert(d.driverReason == 202); // useful failure survives a retry in progress
  d.disconnect(7, 8);
  assert(d.driverReason == 202); // deliberate leave is not evidence
  d.disconnect(6, 201);
  assert(d.driverReason == 202); // previous generation is not authoritative
  d.begin(8);
  assert(d.driverReason == 0 && d.failureReason[0] == 0);
  d.associated(8);
  d.timeout(8);
  assert(std::strcmp(d.failureStage, "ip") == 0);
  assert(std::strcmp(d.failureReason, "no_ip_address") == 0);
  d.retry(8);
  d.succeed(8);
  assert(d.driverReason == 0 && d.failureStage[0] == 0 && d.failureReason[0] == 0);
  d.disconnect(8, 201);
  assert(d.driverReason == 0); // retired successful attempt
}
