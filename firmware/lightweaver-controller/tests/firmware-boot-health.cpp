#include <cassert>

#include "../src/LightweaverFirmwareBootHealth.h"

using lightweaver::FirmwareBootDecision;
using lightweaver::FirmwareBootEvidenceDecision;
using lightweaver::FirmwareBootHealthFacts;
using lightweaver::FirmwareBootHandoffOutcome;
using lightweaver::evaluateFirmwareBootHandoffEvidence;
using lightweaver::evaluateFirmwareBootHealth;

FirmwareBootHealthFacts healthy() {
  FirmwareBootHealthFacts facts{};
  facts.pendingVerification = true;
  facts.compiledIdentityMatches = true;
  facts.nvsReadable = true;
  facts.projectStorageReadable = true;
  facts.savedConfigReadable = true;
  facts.projectHeadReadable = true;
  facts.rendererReady = true;
  facts.controlsReady = true;
  facts.webReady = true;
  facts.watchdogReady = true;
  facts.outputReady = true;
  facts.recoveryReady = true;
  facts.withinDeadline = true;
  return facts;
}

int main() {
  auto facts = healthy();
  facts.routerReachable = false;
  facts.mdnsReady = false;
  facts.browserConnected = false;
  assert(evaluateFirmwareBootHealth(facts).decision == FirmwareBootDecision::MarkValid);

  facts = healthy(); facts.nvsReadable = false;
  assert(evaluateFirmwareBootHealth(facts).decision == FirmwareBootDecision::Rollback);
  facts = healthy(); facts.projectHeadReadable = false;
  assert(evaluateFirmwareBootHealth(facts).decision == FirmwareBootDecision::Rollback);
  facts = healthy(); facts.compiledIdentityMatches = false;
  assert(evaluateFirmwareBootHealth(facts).decision == FirmwareBootDecision::Rollback);
  facts = healthy(); facts.rendererReady = false;
  assert(evaluateFirmwareBootHealth(facts).decision == FirmwareBootDecision::Rollback);
  facts = healthy(); facts.controlsReady = false;
  assert(evaluateFirmwareBootHealth(facts).decision == FirmwareBootDecision::Rollback);
  facts = healthy(); facts.webReady = false;
  assert(evaluateFirmwareBootHealth(facts).decision == FirmwareBootDecision::Rollback);
  facts = healthy(); facts.watchdogReady = false;
  assert(evaluateFirmwareBootHealth(facts).decision == FirmwareBootDecision::Rollback);
  facts = healthy(); facts.outputReady = false;
  assert(evaluateFirmwareBootHealth(facts).decision == FirmwareBootDecision::Rollback);
  facts = healthy(); facts.withinDeadline = false;
  assert(evaluateFirmwareBootHealth(facts).decision == FirmwareBootDecision::Rollback);

  facts = healthy(); facts.pendingVerification = false;
  assert(evaluateFirmwareBootHealth(facts).decision == FirmwareBootDecision::NotPending);

  // A health-check-triggered rollback seals RollbackRequested before reboot.
  // The old slot must surface that record even though it is no longer pending.
  assert(evaluateFirmwareBootHandoffEvidence(
      true, FirmwareBootHandoffOutcome::RollbackRequested, false) ==
      FirmwareBootEvidenceDecision::RolledBack);
  assert(evaluateFirmwareBootHandoffEvidence(
      true, FirmwareBootHandoffOutcome::Armed, false) ==
      FirmwareBootEvidenceDecision::RolledBack);
  assert(evaluateFirmwareBootHandoffEvidence(
      true, FirmwareBootHandoffOutcome::Valid, true) ==
      FirmwareBootEvidenceDecision::Valid);
  assert(evaluateFirmwareBootHandoffEvidence(
      false, FirmwareBootHandoffOutcome::RollbackRequested, false) ==
      FirmwareBootEvidenceDecision::None);

  // A rollback is reported by the build it restored. Zero means not reported.
  using lightweaver::firmwareBuildTag;
  using lightweaver::firmwareRollbackRecordIsStale;
  const uint8_t restored = firmwareBuildTag("1111111111111111111111111111111111111111");
  const uint8_t flashedLater = firmwareBuildTag("56c00ce80e638b779e94653be5bd9700e8339070");
  assert(restored != 0 && flashedLater != 0 && firmwareBuildTag("") != 0 &&
         firmwareBuildTag(nullptr) != 0 && firmwareBuildTag("dev") != 0);
  assert(restored != flashedLater);
  // First boot after the rollback: nothing recorded yet, so it is reported.
  assert(!firmwareRollbackRecordIsStale(0, restored));
  // The same build restarting keeps the diagnosis.
  assert(!firmwareRollbackRecordIsStale(restored, restored));
  // A different image flashed afterwards did not roll back.
  assert(firmwareRollbackRecordIsStale(restored, flashedLater));
  return 0;
}
