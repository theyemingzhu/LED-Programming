import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../src');
const sourcePath = resolve(root, 'LightweaverFirmwareUpdate.cpp');
assert.ok(existsSync(sourcePath), 'firmware updater web module must exist');
const updater = readFileSync(sourcePath, 'utf8');
const grant = readFileSync(resolve(root, 'LightweaverFirmwareUpdateGrant.cpp'), 'utf8');
const web = readFileSync(resolve(root, 'LightweaverWeb.cpp'), 'utf8');
const main = readFileSync(resolve(root, 'main.cpp'), 'utf8');
const runtime = readFileSync(resolve(root, 'LightweaverRuntimeApi.h'), 'utf8');

for (const route of ['/api/update/preflight', '/api/update/begin', '/api/update/chunk',
  '/api/update/commit', '/api/update/cancel', '/api/update/status', '/api/update/challenge']) {
  assert.match(updater, new RegExp(route.replaceAll('/', '\\/')), `${route} is registered`);
}
assert.match(updater, /RAW_START[\s\S]*clientContentLength\(\)[\s\S]*LW_FIRMWARE_UPDATE_HTTP_MAX_BODY_BYTES/,
  'raw requests are rejected by declared size before buffering');
assert.match(updater, /RAW_ABORTED[\s\S]*(?:abort|cancel)/i,
  'interrupted requests abandon the inactive update');
assert.match(updater, /LightweaverOwnerValidation::Accepted/);
// 2026-11-23: no touch on the card authorises or blocks an update. What keeps
// an unsigned or tampered image off the card is unchanged and does not depend
// on which authority the request used.
assert.doesNotMatch(updater, /runtimeOwnerPairingAuthorized|physicalConfirmationNonce|fresh physical confirmation/,
  'no update step waits for a touch on the card');
assert.match(updater, /releaseBuildId[\s\S]*ticketSha256/,
  'release evidence is carried in the mutation envelope');
const between = (from, to) => {
  const start = updater.indexOf(from);
  const end = updater.indexOf(to, start);
  assert.ok(start >= 0 && end > start, `${from} .. ${to} present`);
  return updater.slice(start, end);
};
const verify = between('bool parseAndVerifyTicket(', 'FirmwareUpdateBinding updateBinding(');
assert.match(verify, /binding\.ticketSha256 != hexDigest\(digest\)[\s\S]{0,120}return false/,
  'a ticket that is not the one the request names is refused');
assert.match(verify, /!verifyPublisherSignature\(bytes, length, signature\)[\s\S]{0,120}return false/,
  'an unsigned or wrongly signed ticket is refused');
assert.match(verify, /compareSemver\(ticket\.firmwareVersion, LW_FIRMWARE_VERSION\) <= 0/,
  'a downgrade or same-version ticket is refused');
const preflight = between('void handlePreflight()', 'void handleBegin()');
const verifiedAt = preflight.indexOf('parseAndVerifyTicket(');
const refusedAt = preflight.indexOf('if (!verified) {');
const acceptedAt = preflight.indexOf('g_transfer.preflight(');
assert.ok(verifiedAt > 0 && refusedAt > verifiedAt && acceptedAt > refusedAt,
  'preflight verifies the signed ticket and refuses before any transfer is accepted');
assert.doesNotMatch(preflight.slice(0, refusedAt), /g_ticket\s*=/,
  'no ticket is adopted before it is verified');
const begin = between('void handleBegin()', 'void handleChunk()');
assert.match(begin, /g_transfer\.phase\(\) != FirmwareUpdatePhase::Preflighted[\s\S]{0,120}return/,
  'nothing is written to the spare slot without a verified preflight');
const commitStart = updater.indexOf('void handleCommit()');
assert.ok(commitStart > 0, 'commit handler present');
const commit = updater.slice(commitStart);
const digestAt = commit.indexOf('hexDigest(digest) != g_ticket.imageSha256');
const readbackAt = commit.indexOf('readbackDigest != g_ticket.imageSha256');
const bootAt = commit.indexOf('esp_ota_set_boot_partition(');
assert.ok(digestAt > 0 && readbackAt > digestAt && bootAt > readbackAt,
  'a tampered image is refused by digest, then by read-back, before the card may boot it');
const physicalAuth = between('bool authorizePhysicalUpdate(', 'bool authorizeActiveUpdateCapability(');
assert.match(physicalAuth, /validate\(capability, owner, millis\(\)\) !=\s*LightweaverOwnerValidation::Accepted \|\|\s*!exactLiveUpdateBinding\(update\)/,
  'the owner path still demands the owner permission and the exact card, boot and project head');
assert.match(updater, /Access-Control-Allow-Headers[\s\S]*X-Lightweaver-Capability/);
assert.match(updater,
  /Access-Control-Allow-Headers[\s\S]*X-Lightweaver-Release-Build[\s\S]*X-Lightweaver-Ticket-Sha256/,
  'public Studio preflight may send the release and ticket binding headers');
assert.match(updater, /Cache-Control[\s\S]*no-store/);
assert.match(updater, /consumeSignedGrant/,
  'preflight may consume one exact signed software grant');
assert.match(updater, /validateCapability/,
  'begin, chunk, commit, and cancel may use only the update-scoped capability');
assert.match(updater, /revokeCapability/,
  'terminal and abort paths revoke update-only authority');
assert.match(grant, /LW_UPDATE_GRANT_TTL_MS/);
assert.doesNotMatch(grant, /runtimeOwnerPairingAuthorized|lightweaverOwnerCapability/,
  'software grants neither require nor create general physical owner authority');
assert.match(updater, /authorizePhysicalUpdate[\s\S]*exactLiveUpdateBinding/,
  'the owner-permission path remains independently present');
assert.match(updater, /method\s*==\s*HTTP_POST[\s\S]*\/api\/update\/challenge/,
  'the challenge endpoint consumes the bounded POST body used by Studio');
assert.match(updater, /handleChallenge[\s\S]*cardId[\s\S]*bootId[\s\S]*studioOrigin[\s\S]*expectedProjectHead[\s\S]*releaseBuildId[\s\S]*ticketSha256/,
  'the card checks every caller-supplied challenge binding before emitting signed bytes');
assert.match(web, /registerLightweaverFirmwareUpdate\(server\)/);
assert.match(web, /handleLightweaverFirmwareUpdate\(\)/);
assert.match(runtime, /runtimeFirmwareUpdateStatusJson\(\)/);
assert.match(main, /"firmwareUpdate"[\s\S]*"network"/,
  'status and firmware-info advertise preserving network update capability');
assert.match(main, /"firmwareUpdate"[\s\S]*"softwareGrant"/,
  'status and firmware-info advertise secure software update grants separately');
assert.match(main, /runtimeFirmwareUpdateStatusJson\(\)/,
  'status and firmware-info include current transfer/rollback evidence');
for (const field of ['restoredFirmwareVersion', 'restoredBuildId', 'restoredBuildNumber']) {
  assert.match(updater, new RegExp(`doc\\["${field}"\\]`),
    `rollback status publishes ${field}`);
}

// F38: a healthy card can still be refused an update because the project
// repository's storage partition failed to mount (F37). Both 409 refusal
// paths — the challenge and the preflight — must carry the repository's own
// message in `detail` when that is the actual cause, so the refusal is
// distinguishable from "someone else is mid-update" instead of a bare
// generic string.
assert.match(updater,
  /runtimeFirmwareUpdateReady\(\) \|\| lightweaverFirmwareUpdateActive\(\)\)[\s\S]{0,600}lightweaverProjectRepository\(\)\.available\(\)[\s\S]{0,300}lightweaverProjectRepository\(\)\.lastMessage\(\)[\s\S]{0,300}sendChallengeError\(409,/,
  'handleChallenge names the project-repository message when storage is the reason the card refuses');
assert.match(updater,
  /stagingActive\(\) \|\| !runtimeFirmwareUpdateReady\(\)\)[\s\S]{0,600}lightweaverProjectRepository\(\)\.available\(\)[\s\S]{0,300}lightweaverProjectRepository\(\)\.lastMessage\(\)[\s\S]{0,300}sendUpdateError\(409, FirmwareUpdateResult::ConcurrentMutation, detail\)/,
  'handlePreflight names the project-repository message when storage is the reason the card refuses');

console.log('firmware update web contract tests passed');
