import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../src');
const media = readFileSync(resolve(root, 'LightweaverMedia.cpp'), 'utf8');
const header = readFileSync(resolve(root, 'LightweaverMedia.h'), 'utf8');
const owner = readFileSync(resolve(root, 'LightweaverOwnerCapability.cpp'), 'utf8');
const web = readFileSync(resolve(root, 'LightweaverWeb.cpp'), 'utf8');

assert.match(header, /LW_SEQUENCE_MEDIA_MAX_BYTES = 16777216/);
assert.match(header, /LW_SEQUENCE_MEDIA_VERSION = 2/);
assert.match(header, /LW_SEQUENCE_MEDIA_CHUNK_BYTES = 2048/);
assert.match(media, /LW_MEDIA_BATCH_MS = 30U \* 60U \* 1000U/);
assert.match(media, /LW_MEDIA_LEASE_MS = 10U \* 60U \* 1000U/);
assert.match(media, /LW_MEDIA_BATCH_MAX_BYTES = 48U \* 1024U \* 1024U/);
assert.match(media, /%08lx%08lx%08lx%08lx/, 'upload and batch IDs need 128 random bits');
assert.match(media, /validFile\(file, hash\)/);
assert.match(media, /sequenceOutputTopologySyntax\(header, sizeof\(header\)\)/,
  'uploads must reject missing or malformed multi-output header identity');
assert.match(readFileSync(resolve(root, 'main.cpp'), 'utf8'),
  /sequenceOutputTopologyMatches\(header, sizeof\(header\), outputs, outputCount\)/,
  'sequence playback must match the saved ordered GPIO and length map');
assert.match(media, /file == String\("\/sequences\/"\) \+ hash \+ "\.lwseq"/);
assert.match(media, /batchAsset\(file, hash, bytes\)/, 'later uploads need to match declared batch assets');
assert.match(media, /sendResult\(200, true, "bounded media batch authorized", nullptr, true\)/,
  'initial batch begin must return the batch ID and chunk size');
assert.match(media, /if \(ok && includeBatch\) \{\s*response\["batchId"\] = g_batch\.id;\s*response\["chunkBytes"\] = LW_SEQUENCE_MEDIA_CHUNK_BYTES;/,
  'initial batch response must include the agreed chunk size');
assert.match(media, /uri == "\/api\/media\/abort"\) \{\s*if \(!authorizeBatch\(/,
  'batch abort must work without an active file transfer');
assert.match(media, /if \(uri == "\/api\/media\/abort"\) \{[^}]*clearTransfer\(\);\s*g_batch = Batch\{\};\s*sendResult\(200, true, "media batch closed"\)/s,
  'abort must release both active staging and the batch, without removing immutable files');
assert.match(media, /owner\.cardId != runtimeCardId\(\).*owner\.bootId != runtimeBootId\(\)/s);
assert.match(media, /owner\.expectedProjectHead != lightweaverProjectRepository\(\)\.currentHead\(\)/);
assert.match(media, /ownerEpoch != lightweaverOwnerCapability\(\)\.leaseEpoch\(\)/);
assert.match(owner, /revoke\(false\)/, 'normal 60-second expiration must not extend or revoke a scoped upload');
assert.match(owner, /leaseEpoch_\+\+/, 'explicit revoke or superseding owner must invalidate the upload');
assert.match(owner, /bool LightweaverOwnerCapability::issue[\s\S]*?leaseEpoch_\+\+;[\s\S]*?binding_ = binding;/,
  'every fresh owner issue must supersede a stranded batch, even with the same binding');
assert.match(owner, /revoke\(false\)/, 'ordinary token expiry must preserve the bounded media lease epoch');
assert.match(media, /received != g_transfer\.bytes/, 'partial transfer cannot commit');
assert.match(media, /actualHash != g_transfer\.hash \|\| !validSequenceHeader/, 'commit verifies full staged bytes');
assert.match(media, /SD\.rename\(g_transfer\.temp\.c_str\(\), g_transfer\.file\.c_str\(\)\)/);
assert.match(media, /hashFile\(g_transfer\.file, readBytes, readHash\)/, 'promoted file must be read back');
assert.match(media, /LW_MEDIA_STAGING_PATH = "\/sequences\/\.upload-staging\.tmp"/, 'reboot leaves one bounded staging path');
assert.match(media, /SD\.exists\(LW_MEDIA_STAGING_PATH\) && !SD\.remove\(LW_MEDIA_STAGING_PATH\)/);
assert.match(media, /if \(written != decodedSize\) \{\s*clearTransfer\(\)/);
assert.match(media, /g_batch\.assets\[i\]\.file == file && g_batch\.assets\[i\]\.committed/,
  'batch readback is restricted to completed declared assets');
assert.match(media, /receiptAuthorized && file != g_receipt\.file/,
  'post-commit receipt may read only its own exact file');
assert.match(media, /uri == "\/api\/media\/read"\) handleReadPost/);
assert.match(web, /m\.type==='media-read'\)\{response=await post\('\/api\/media\/read'/,
  'bridge readback keeps upload ID in POST body and preserves Origin');
assert.match(web, /m\.type==='owner-capability'/);
assert.match(web, /registerLightweaverMedia\(server\)/);
assert.match(web, /capabilitiesInfo\["capabilities"\]\["sequenceMedia"\]\["version"\]/);
console.log('sequence media contract passed');
