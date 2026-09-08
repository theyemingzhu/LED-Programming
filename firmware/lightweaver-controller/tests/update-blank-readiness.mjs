import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
const src = resolve(import.meta.dirname, '../src');
const read = name => readFileSync(join(src, name), 'utf8');
assert.match(read('LightweaverFirmwareUpdate.cpp'), /runtimeFirmwareUpdateReady\(\)/,
  'blank network cards need update eligibility independent from playback');
const temp = mkdtempSync(join(tmpdir(), 'lw-update-blank-'));
try {
  writeFileSync(join(temp, 'test.cpp'), `
#include <cassert>
#include "${join(src, 'LightweaverProvisioningPolicy.h')}"
#include "${join(src, 'LightweaverFirmwareBootHealth.h')}"
int main() {
  FirmwareUpdateReadinessInputs f;
  f.webServing = f.storageReadable = f.storageKnownBlank = true;
  f.outputDriverReady = true;
  assert(firmwareUpdateReady(f)); // healthy factory card, no playable project
  f.storageKnownBlank = false; assert(!firmwareUpdateReady(f)); // unknown != blank
  f.configValid = f.knownGoodProject = true; f.phase = ProvisioningPhase::Ready;
  f.projectOutputReady = true; assert(firmwareUpdateReady(f));
  f.safeMode = true; assert(!firmwareUpdateReady(f)); f.safeMode = false;
  f.storageReadable = false; assert(!firmwareUpdateReady(f)); f.storageReadable = true;
  f.transitionPending = true; assert(!firmwareUpdateReady(f)); f.transitionPending = false;
  f.projectOutputReady = false; assert(!firmwareUpdateReady(f));
  f = FirmwareUpdateReadinessInputs{}; f.webServing = f.storageReadable = f.storageKnownBlank = f.outputDriverReady = true;
  f.projectHeadPresent = true; assert(!firmwareUpdateReady(f));
  f.projectHeadPresent = false;
  lightweaver::FirmwareBootHealthFacts health;
  health.pendingVerification = health.compiledIdentityMatches = true;
  health.nvsReadable = health.projectStorageReadable = health.projectHeadReadable = true;
  health.rendererReady = health.controlsReady = health.webReady = true;
  health.watchdogReady = health.outputReady = health.recoveryReady = health.withinDeadline = true;
  health.savedConfigReadable = firmwareUpdateSavedConfigHealthy(f);
  assert(lightweaver::evaluateFirmwareBootHealth(health).decision == lightweaver::FirmwareBootDecision::MarkValid);
  f.safeMode = true;
  health.savedConfigReadable = firmwareUpdateSavedConfigHealthy(f);
  assert(lightweaver::evaluateFirmwareBootHealth(health).decision == lightweaver::FirmwareBootDecision::Rollback);
  f.safeMode = false; f.storageKnownBlank = false;
  health.savedConfigReadable = firmwareUpdateSavedConfigHealthy(f);
  assert(lightweaver::evaluateFirmwareBootHealth(health).decision == lightweaver::FirmwareBootDecision::Rollback);
  f.phase = ProvisioningPhase::Recovering; assert(!firmwareUpdateReady(f));
}
`);
  execFileSync('c++', ['-std=c++17', '-Wall', '-Wextra', '-Werror', join(temp, 'test.cpp'), '-o', join(temp, 'test')]);
  execFileSync(join(temp, 'test'));
} finally { rmSync(temp, {recursive:true, force:true}); }
for (const name of ['main.cpp', 'LightweaverStorage.cpp']) {
  assert.match(read(name), /doc\["firmwareUpdateReady"\] = runtimeFirmwareUpdateReady\(\)/,
    `${name} publishes the same independent update readiness`);
}
assert.match(read('LightweaverStorage.cpp'), /result\.storageKnownBlank = true/);
assert.match(read('main.cpp'), /loadResult\.storageKnownBlank/);
assert.match(read('main.cpp'), /savedConfigHealthy/);
console.log('blank firmware update readiness tests passed');
