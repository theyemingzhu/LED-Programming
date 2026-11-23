import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const sourceRoot = resolve(import.meta.dirname, '../src');
const ownerHeaderPath = join(sourceRoot, 'LightweaverOwnerCapability.h');
const ownerSourcePath = join(sourceRoot, 'LightweaverOwnerCapability.cpp');
assert.ok(existsSync(ownerHeaderPath) && existsSync(ownerSourcePath),
  'owner-capability firmware module must exist');
const header = readFileSync(ownerHeaderPath, 'utf8');
const source = readFileSync(ownerSourcePath, 'utf8');
const web = readFileSync(join(sourceRoot, 'LightweaverWeb.cpp'), 'utf8');
const runtime = readFileSync(join(sourceRoot, 'LightweaverRuntimeApi.h'), 'utf8');

assert.match(header, /LW_OWNER_CAPABILITY_TTL_MS/);
assert.match(header, /cardId[\s\S]*bootId[\s\S]*allowedOrigin[\s\S]*host[\s\S]*networkIdentity[\s\S]*ownerSessionId[\s\S]*operationGeneration[\s\S]*expectedProjectHead/,
  'capability binds every identity and concurrency boundary');
assert.match(source, /constantTimeTokenEqual/, 'bearer tokens use constant-time comparison');
assert.match(source, /revoke\(\)/, 'mismatch and expiry paths revoke the active capability');
assert.match(source, /\/api\/owner\/capability/, 'firmware exposes an explicit owner-capability issuance endpoint');
// 2026-11-23: nothing on the card requires a physical touch. An installed
// artwork cannot be reached, so a control press authorises nothing. Issuance
// rests on the allowed origin plus the exact card, boot and project head.
assert.match(source, /lightweaverOwnerIssueDecision\(\s*ownerOriginAllowed\(origin, host\), binding\.cardId == runtimeCardId\(\),\s*binding\.bootId == runtimeBootId\(\),\s*expectedHead == lightweaverProjectRepository\(\)\.currentHead\(\)\)/,
  'issuance is decided by origin and the exact card, boot and project head');
assert.match(source, /OriginRefused\)[\s\S]{0,200}send\(403[\s\S]{0,120}origin is not allowed/,
  'a wrong origin is still refused with 403');
assert.match(source, /BindingChanged\)[\s\S]{0,200}send\(409[\s\S]{0,120}card, boot, or project head changed/,
  'a wrong card, boot or project head is still refused with 409');
assert.doesNotMatch(source, /corsOriginAllowed\([^)]*\)[\s\S]{0,120}issue\(/,
  'an allowed origin alone must not issue ownership: the exact binding is checked first');
assert.match(runtime, /runtimeNetworkIdentity\(\)/);
const touchAuthority = /runtimeOwnerPairingAuthorized|touch a card control|physical confirmation|physicalConfirmationNonce/;
const paths = {
  'owner permission': 'LightweaverOwnerCapability.cpp',
  recordings: 'LightweaverMedia.cpp',
  'project store': 'LightweaverProjectRepository.cpp',
  'live streaming': 'LightweaverHttpFrameStream.cpp',
  'firmware update': 'LightweaverFirmwareUpdate.cpp',
  runtime: 'main.cpp',
  'runtime api': 'LightweaverRuntimeApi.h',
  'card page': 'LightweaverWeb.cpp',
};
for (const [name, file] of Object.entries(paths)) {
  assert.doesNotMatch(readFileSync(join(sourceRoot, file), 'utf8'), touchAuthority,
    `${name} must not wait for or ask for a touch on the card`);
}
for (const file of ['LightweaverMedia.cpp', 'LightweaverProjectRepository.cpp',
  'LightweaverHttpFrameStream.cpp', 'LightweaverFirmwareUpdate.cpp']) {
  assert.match(readFileSync(join(sourceRoot, file), 'utf8'),
    /lightweaverOwnerCapability\(\)\.validate\(/,
    `${file} still validates the owner permission against its exact binding`);
}
// The controls still work as controls: a press is recorded and reported.
const mainSource = readFileSync(join(sourceRoot, 'main.cpp'), 'utf8');
assert.match(mainSource, /lastControlEventAt = millis\(\)/);
assert.match(mainSource, /doc\["controls"\]\["lastEventAtMs"\] = lastControlEventAt/);
assert.match(web, /registerLightweaverOwnerCapability/);
assert.match(web, /projectHead/,
  'status exposes the exact editable-project head used to bind owner capabilities');

const tempDir = mkdtempSync(join(tmpdir(), 'lightweaver-owner-capability-'));
try {
  writeFileSync(join(tempDir, 'Arduino.h'), `
#pragma once
#include <cstdint>
#include <string>
class String {
 public:
  String() = default;
  String(const char* value): value_(value ? value : "") {}
  String(const std::string& value): value_(value) {}
  size_t length() const { return value_.length(); }
  const char* c_str() const { return value_.c_str(); }
  bool operator==(const String& other) const { return value_ == other.value_; }
  bool operator!=(const String& other) const { return value_ != other.value_; }
 private: std::string value_;
};
`);
  writeFileSync(join(tempDir, 'test.cpp'), `
#include <cassert>
#include "LightweaverOwnerCapability.h"

static LightweaverOwnerBinding binding() {
  LightweaverOwnerBinding b;
  b.cardId = "lw-card"; b.bootId = "boot-a";
  b.allowedOrigin = "https://led.mandalacodes.com"; b.host = "192.168.1.4";
  b.networkIdentity = "station:192.168.1.4"; b.ownerSessionId = "owner-a";
  b.operationGeneration = 7; b.expectedProjectHead = "head-a";
  return b;
}

// A configured card on a wall: nobody has touched a control since power-on.
// The decision takes no touch input at all, so there is nothing to wait for.
static void issuedWithoutTouch() {
  using D = LightweaverOwnerIssueDecision;
  assert(lightweaverOwnerIssueDecision(true, true, true, true) == D::Issue);
  assert(lightweaverOwnerIssueDecision(false, true, true, true) == D::OriginRefused);
  assert(lightweaverOwnerIssueDecision(false, false, false, false) == D::OriginRefused);
  assert(lightweaverOwnerIssueDecision(true, false, true, true) == D::BindingChanged);
  assert(lightweaverOwnerIssueDecision(true, true, false, true) == D::BindingChanged);
  assert(lightweaverOwnerIssueDecision(true, true, true, false) == D::BindingChanged);
  // Recordings, the project store, live streaming and the firmware update
  // all present this one permission through validate(). Issued with no
  // touch, it is accepted for the exact binding and refused for a wrong
  // origin, card, boot, project head, session or generation.
  {
    LightweaverOwnerCapability permission;
    auto exact = binding();
    assert(permission.issue(exact, "token-path", 1000));
    assert(permission.validate("token-path", exact, 1001) == LightweaverOwnerValidation::Accepted);
    for (int field = 0; field < 6; field++) {
      LightweaverOwnerCapability fresh;
      assert(fresh.issue(exact, "token-path", 1000));
      auto wrong = exact;
      if (field == 0) wrong.allowedOrigin = "https://example.com";
      if (field == 1) wrong.cardId = "lw-other";
      if (field == 2) wrong.bootId = "boot-b";
      if (field == 3) wrong.expectedProjectHead = "head-z";
      if (field == 4) wrong.ownerSessionId = "owner-b";
      if (field == 5) wrong.operationGeneration = 8;
      assert(fresh.validate("token-path", wrong, 1001) == LightweaverOwnerValidation::BindingMismatch);
      // A refused binding also ends the permission.
      assert(fresh.validate("token-path", exact, 1002) == LightweaverOwnerValidation::Missing);
    }
  }
}

int main() {
  issuedWithoutTouch();
  LightweaverOwnerCapability capability;
  auto expected = binding();
  LightweaverOwnerCapability retry;
  assert(retry.issue(expected, "token-a", 1000));
  const auto firstLeaseEpoch = retry.leaseEpoch();
  assert(retry.issue(expected, "token-a2", 1001));
  assert(retry.leaseEpoch() != firstLeaseEpoch);
  assert(retry.validate("token-a", expected, 1001) == LightweaverOwnerValidation::TokenMismatch);
  assert(retry.validate("token-a2", expected, 1001) == LightweaverOwnerValidation::Accepted);
  const auto renewedLeaseEpoch = retry.leaseEpoch();
  assert(retry.validate("token-a2", expected, 1001 + LW_OWNER_CAPABILITY_TTL_MS + 1) == LightweaverOwnerValidation::Expired);
  assert(retry.leaseEpoch() == renewedLeaseEpoch);
  assert(capability.issue(expected, "token-a", 1000));
  assert(capability.validate("token-a", expected, 1001) == LightweaverOwnerValidation::Accepted);
  assert(capability.advanceExpectedProjectHead("token-a", expected, "head-b", 1002));
  expected.expectedProjectHead = "head-b";
  assert(capability.validate("token-a", expected, 1003) == LightweaverOwnerValidation::Accepted);
  auto wrong = expected; wrong.bootId = "boot-b";
  assert(capability.validate("token-a", wrong, 1004) == LightweaverOwnerValidation::BindingMismatch);
  assert(capability.validate("token-a", expected, 1005) == LightweaverOwnerValidation::Missing);
  assert(capability.issue(expected, "token-b", 2000));
  assert(capability.validate("token-b", expected, 2000 + LW_OWNER_CAPABILITY_TTL_MS + 1) == LightweaverOwnerValidation::Expired);
  assert(capability.validate("token-b", expected, 2001) == LightweaverOwnerValidation::Missing);
  assert(capability.issue(expected, "token-c", 3000));
  assert(capability.validate("wrong", expected, 3001) == LightweaverOwnerValidation::TokenMismatch);
  return 0;
}
`);
  const binary = join(tempDir, 'owner-capability');
  execFileSync('c++', ['-std=c++17', '-I', tempDir, '-I', sourceRoot,
    join(sourceRoot, 'LightweaverOwnerCapability.cpp'), join(tempDir, 'test.cpp'), '-o', binary],
  { stdio: 'inherit' });
  execFileSync(binary, [], { stdio: 'inherit' });
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}

console.log('windowless owner capability tests passed');
