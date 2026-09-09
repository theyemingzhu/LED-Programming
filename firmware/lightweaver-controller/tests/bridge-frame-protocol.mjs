// Locks the versioned card page bridge (currently v7; the open-studio relay
// shipped after the v6 explicit passive-utility release):
//
// 1. VERSIONING — the card→Studio 'ready' postMessages and every relay reply
//    carry `version:N` spliced from the single C++ constant LW_BRIDGE_VERSION
//    (no hand-synced numeric literals in the JS strings), and
//    /api/firmware-info reports `bridgeVersion`, so Studio can feature-detect
//    the frame relay and show "card firmware needs an update — open Flash"
//    against older cards instead of failing silently.
//
// 2. FRAME RELAY — Studio posts {type:'frame', payload:{pixels:['RRGGBB',...],
//    seg?, start?}} and the card page forwards it into ONE persistent
//    same-origin WebSocket ws://<own-host>:81/ws as {seg:[{i,id?,start?}]} — the firmware's
//    WLED JSON frame path (TEXT frames; binary WS is ignored by the firmware,
//    which is why the earlier binary push attempt was a silent no-op — see
//    led-art-mapper/app/src/main.js "C2: WLED live push"). The relay must be
//    latest-frame-wins under congestion (single pending slot, bufferedAmount
//    check), never a growing queue of stale frames. The 'frame' reply is
//    HONEST: {ok:true, relayed:<bool>, wsOpen:<bool>} — wsOpen is true iff
//    the relay socket readyState===1 at reply time, relayed is true only when
//    the frame was actually handed to an OPEN socket. Studio reads
//    wsOpen===false as "not delivered".
//
// 3. RECONNECT — every reconnect attempt funnels through ONE backoff-gated
//    retry helper (single pending attempt, doubling wait capped at 4s). A
//    burst of incoming frames while the socket is down must not open a
//    socket per frame (reconnect storm).
//
// 4. STOP — streaming stops through the EXISTING 'control' bridge type with
//    {cancelStream:true}. No bespoke stop/cancel message type may appear.
//    cancelStream ALSO drops any undelivered pending frame and cancels the
//    scheduled reconnect, so a stale frame can't land after stop.
//
// 5. CHUNKING (v3) — the card drops any WebSocket payload over 4096 bytes
//    SILENTLY, which caps a single message at roughly 450 hex pixels. v3
//    forwards the payload's `start` write offset so Studio can split one
//    logical frame into card-sized chunks. `start` is omitted when absent or
//    zero, so a single-chunk frame stays byte-identical to a v2 payload and
//    nothing changes for cards below the cap.
//
// 6. OPEN-STUDIO (v7, F23b) — "Edit in Studio" / "Open Lightweaver Studio"
//    used to reload the opener tab (`opener.location.href=url`), discarding
//    whatever Studio had in memory. When the card page was bridge-launched
//    (`lwBridgeLaunch` truthy) and a live `window.opener` exists, lwOpenStudio
//    now POSTS `{app:'LightweaverCardBridge', type:'open-studio', version:N,
//    href, editLook, editPattern}` to the opener with
//    `targetOrigin=lwBridgeLaunch.get('studioOrigin')` (the value already
//    validated by lwBridgeAllowed — never `'*'`), then focuses the opener
//    instead of reloading it. Only when there is no live opener or no bridge
//    launch does it fall back to today's `window.open(url,'lightweaver-studio')`.

import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const web = readFileSync(resolve(here, '../src/LightweaverWeb.cpp'), 'utf8');

// ── versioning ────────────────────────────────────────────────────────────
// v3 added the per-segment `start` passthrough that lets Studio chunk a frame
// past the card's payload cap. v4 added the blank-card port probe relay.
// Studio feature-detects on this number, so bumping the card without teaching
// Studio the new floor -- or the reverse -- silently disables the feature rather
// than failing loudly. Both directions are pinned here.
const bridgeVersionMatch = web.match(/constexpr int LW_BRIDGE_VERSION = (\d+);/);
assert.ok(bridgeVersionMatch, 'LightweaverWeb.cpp must pin the bridge protocol version constant');
const bridgeVersion = Number(bridgeVersionMatch[1]);
assert.equal(bridgeVersion, 7, 'the bridge protocol version should be 7 (adds the open-studio relay, F23b)');

// Every relay type Studio can send must actually exist in the card's router,
// or the request round-trips into an 'invalid-payload' throw the owner reads as
// a broken card. This is the seam that a version bump alone does not protect.
for (const relayType of ['beacon-ports', 'beacon-port', 'release-bridge']) {
  assert.match(web, new RegExp(`m\\.type==='${relayType}'`),
    `the bridge relay must route '${relayType}' or Studio's probe reaches nothing`);
}

// Studio's own floors, read from source rather than restated, so the two cannot
// drift apart in a way that only shows up on real hardware.
const studioDir = resolve(import.meta.dirname, '../../../lightweaver/src/lib');
const beaconProbe = readFileSync(resolve(studioDir, 'beaconProbe.js'), 'utf8');
const probeFloors = [...beaconProbe.matchAll(/bridgeVersion\s*<\s*(\d+)/g)].map(m => Number(m[1]));
assert.ok(probeFloors.length > 0, 'beaconProbe.js must feature-detect on the bridge version');
for (const floor of probeFloors) {
  assert.ok(floor <= bridgeVersion,
    `beaconProbe.js requires bridge v${floor} but the card only speaks v${bridgeVersion}`);
}

// The version in every JS script string is spliced from the C++ constant —
// never a hand-synced numeric literal.
assert.doesNotMatch(
  web,
  /version:\d/,
  'no hand-synced `version:<digit>` literal may appear in the source — splice String(LW_BRIDGE_VERSION) instead',
);
const readyMessages = web.match(
  /postMessage\(\{app:'LightweaverCardBridge',type:'ready',version:"\);\s*script \+= (?:bridgeVersion|String\(LW_BRIDGE_VERSION\));/g,
) || [];
assert.ok(readyMessages.length >= 1,
  'the card→Studio opener ready handshake exists and splices the version from LW_BRIDGE_VERSION');
assert.doesNotMatch(
  web,
  /contentWindow\.postMessage\(\{app:'LightweaverCardBridge',type:'ready'/,
  'new firmware must not add an iframe-specific ready handshake',
);

assert.match(
  web,
  /const String bridgeVersion = String\(LW_BRIDGE_VERSION\);/,
  'studioBridgeScript() derives the spliced version string from the pinned constant',
);
assert.match(
  web,
  /Object\.assign\(\{app:'LightweaverCardBridge',version:"\);\s*script \+= bridgeVersion;/,
  'every bridge relay reply is stamped with the constant-derived version (covers compatibility flows where ready can be missed)',
);

// firmware-info carries bridgeVersion so Studio can gate before any handshake
const fwInfoStart = web.indexOf('void handleFirmwareInfo()');
assert.notEqual(fwInfoStart, -1, 'LightweaverWeb.cpp should define handleFirmwareInfo()');
const fwInfoEnd = web.indexOf('\n}', fwInfoStart);
const fwInfo = web.slice(fwInfoStart, fwInfoEnd);
assert.match(fwInfo, /\\"bridgeVersion\\":/, 'firmware-info JSON gains a bridgeVersion field');
assert.match(fwInfo, /LW_BRIDGE_VERSION/, 'bridgeVersion is derived from the pinned constant');
// The splice locates the top-level '{' by skipping leading whitespace/BOM —
// not a bare indexOf('{') that trusts the payload shape.
assert.doesNotMatch(fwInfo, /indexOf\('\{'\)/,
  'firmware-info splice must not rely on a bare indexOf(\'{\')');
assert.match(fwInfo, /info\[brace\] == '\{'/,
  'firmware-info splice verifies the first non-whitespace char is the opening brace');

// ── F23b: open-studio hands the tab back instead of reloading it ──────────
// lwOpenStudio lives in studioOpenScript(), a separate function from
// studioBridgeScript() (spliced into the page earlier, but lwBridgeLaunch and
// LW_STUDIO_ORIGINS are const at script scope so they exist by the time a
// click actually invokes lwOpenStudio).
const openFnStart = web.indexOf('String studioOpenScript()');
assert.notEqual(openFnStart, -1, 'LightweaverWeb.cpp should define studioOpenScript()');
const openFnEnd = web.indexOf('return script;', openFnStart);
assert.notEqual(openFnEnd, -1, 'studioOpenScript() should return its assembled script');
const openScriptSource = web.slice(openFnStart, openFnEnd);

assert.match(
  openScriptSource,
  /const String bridgeVersion = String\(LW_BRIDGE_VERSION\);/,
  'studioOpenScript() derives its own spliced version string from the pinned constant',
);
assert.doesNotMatch(
  openScriptSource,
  /opener\.location\.href=url/,
  'lwOpenStudio must no longer reload the opener — that discards Studio\'s in-memory state',
);
assert.match(
  openScriptSource,
  /if\(opener\)\{/,
  'lwOpenStudio still branches on a live, bridge-launched opener',
);
assert.match(
  openScriptSource,
  /opener\.postMessage\(\{app:'LightweaverCardBridge',type:'open-studio',version:"\);\s*script \+= bridgeVersion;\s*script \+= F\("[^"]*,href:url,editLook:editLook,editPattern:editPattern\},lwBridgeLaunch\.get\('studioOrigin'\)\)/,
  "the open-studio message is posted to the opener with the constant-derived version and the validated studioOrigin as targetOrigin (never '*')",
);
assert.doesNotMatch(
  openScriptSource,
  /postMessage\([^)]*,'\*'\)/,
  'the open-studio postMessage must never target \'*\'',
);
assert.match(
  openScriptSource,
  /const opened=window\.open\(url,'lightweaver-studio'\);/,
  'lwOpenStudio keeps window.open as the fallback for no live opener / no bridge launch',
);

// Dynamically run the real lwOpenStudio against a fake opener to prove the
// behaviour, not just the presence of the code pattern.
{
  // studioOpenScript() builds its script as ONE F("...") call spanning many
  // adjacent (C++-concatenated) string literals, interrupted once by
  // `script += bridgeVersion;` to splice the constant-derived version. Split
  // on that splice marker and, within each side, join every quoted literal
  // in order — the same reconstruction visitor-control-rollback.mjs uses for
  // a single unbroken fragment, extended to handle the splice in the middle.
  const bridgeVersionLiteral = String(bridgeVersion);
  const spliceMarker = 'script += bridgeVersion;';
  const openParts = openScriptSource.split(spliceMarker);
  assert.ok(openParts.length >= 2,
    'studioOpenScript() should splice bridgeVersion into the open-studio message via script += bridgeVersion;');
  let openStudioJs = openParts
    .map(part => [...part.matchAll(/"((?:\\.|[^"\\])*)"/g)]
      .map(([, body]) => JSON.parse(`"${body.replace(/\\x([0-9a-fA-F]{2})/g, '\\u00$1')}"`))
      .join(''))
    .join(bridgeVersionLiteral);
  assert.match(openStudioJs, /function lwOpenStudio\(event,url\)/,
    'the rebuilt open script should contain lwOpenStudio');

  const posts = [];
  const focusCalls = [];
  const opens = [];
  const fakeOpener = {
    closed: false,
    postMessage(message, targetOrigin) { posts.push({ message, targetOrigin }); },
    focus() { focusCalls.push('opener'); },
  };
  const bridgeContext = {
    URL,
    location: { host: 'lw-b0fe81f61b44.local', hash: '' },
    window: {},
    lwBridgeLaunch: { get: key => (key === 'studioOrigin' ? 'https://led.mandalacodes.com' : null) },
    alert() {},
  };
  bridgeContext.window.opener = fakeOpener;
  vm.createContext(bridgeContext);
  vm.runInContext(openStudioJs, bridgeContext);

  const result = vm.runInContext(
    "lwOpenStudio(null,'https://led.mandalacodes.com/?editPattern=ocean#screen=card&section=overview')",
    bridgeContext,
  );
  assert.equal(result, false, 'lwOpenStudio should return false (its onclick contract)');
  assert.equal(posts.length, 1, 'a live bridge-launched opener should receive exactly one postMessage');
  assert.equal(posts[0].targetOrigin, 'https://led.mandalacodes.com',
    'the message must target the validated studioOrigin, never \'*\'');
  assert.equal(posts[0].message.app, 'LightweaverCardBridge');
  assert.equal(posts[0].message.type, 'open-studio');
  assert.equal(posts[0].message.version, bridgeVersion, 'the posted version must match LW_BRIDGE_VERSION');
  assert.equal(posts[0].message.editPattern, 'ocean');
  assert.equal(posts[0].message.editLook, '');
  assert.match(posts[0].message.href, /^https:\/\/led\.mandalacodes\.com\/\?cardBridge=1&cardHost=/,
    'the posted href should still be the computed, cardBridge-qualified Studio URL');
  assert.deepEqual(focusCalls, ['opener'], 'a bridge-launched opener should be focused, never reloaded');

  // Fallback: no live opener (no bridge launch / opener closed) still opens a
  // new tab exactly as before.
  const fallbackOpens = [];
  const fallbackContext = {
    URL,
    location: { host: 'lw-b0fe81f61b44.local', hash: '' },
    window: { open: (...args) => { fallbackOpens.push(args); return { focus() {} }; } },
    lwBridgeLaunch: null,
    alert() {},
  };
  vm.createContext(fallbackContext);
  vm.runInContext(openStudioJs, fallbackContext);
  vm.runInContext("lwOpenStudio(null,'https://led.mandalacodes.com/#screen=card&section=overview')", fallbackContext);
  assert.equal(fallbackOpens.length, 1, 'no bridge launch should fall back to window.open, unchanged');
  assert.equal(fallbackOpens[0][1], 'lightweaver-studio');
}

// ── scope the rest to the card-page bridge script ─────────────────────────
const fnStart = web.indexOf('String studioBridgeScript()');
assert.notEqual(fnStart, -1, 'LightweaverWeb.cpp should define studioBridgeScript()');
const fnEnd = web.indexOf('return script;', fnStart);
assert.notEqual(fnEnd, -1, 'studioBridgeScript() should return its assembled script');
const script = web.slice(fnStart, fnEnd);

// ── frame relay ───────────────────────────────────────────────────────────
assert.match(
  script,
  /m\.type===['"]frame['"]/,
  'bridge script should handle the Studio frame message',
);
assert.match(
  script,
  /new WebSocket\('ws:\/\/'\+location\.hostname\+':81\/ws'\)/,
  'the relay opens ONE same-origin WebSocket to the card\'s own :81/ws frame path',
);
assert.match(
  script,
  /JSON\.stringify\(\{seg:\[s\]\}\)/,
  'frames are forwarded as the WLED JSON {seg:[{i:pixels}]} shape (text, never binary)',
);
assert.match(
  script,
  /\{i:p\.pixels\}/,
  'the segment carries the raw pixels array as seg.i',
);

// ── chunking: `start` passthrough (bridge v3) ─────────────────────────────
assert.match(
  script,
  /if\(Number\.isInteger\(p\.start\)&&p\.start>0\)s\.start=p\.start;/,
  'the relay forwards a positive integer start offset so Studio can chunk a frame past the 4096-byte card cap',
);
// Omitted when absent or 0: a single-chunk frame must serialize exactly as it
// did on v2, so nothing changes for the cards and pieces already below the cap.
assert.doesNotMatch(
  script,
  /s\.start=p\.start\|\|0/,
  'start must be omitted when absent or zero, not written as an explicit 0',
);
assert.match(
  script,
  /const lwFrameSend=p=>\{if\(!p\|\|!Array\.isArray\(p\.pixels\)\)throw lwBridgeError\('invalid-payload'/,
  'the payload contract is still {pixels:[...]} — start is optional and never required to relay',
);

// latest-frame-wins: exactly one pending slot, replaced on every send —
// congestion (bufferedAmount) defers the flush rather than queueing frames.
assert.match(
  script,
  /lwFrameNext=p;/,
  'an incoming frame REPLACES the pending slot (latest-frame-wins)',
);
assert.match(
  script,
  /bufferedAmount>\d+/,
  'the relay checks bufferedAmount and defers when the socket is congested',
);
assert.doesNotMatch(
  script,
  /lwFrame\w*\.push\(/,
  'frames must never accumulate in an array queue — stale frames are dropped, not delivered late',
);

// ── reconnect: ONE backoff-gated retry path (no reconnect storm) ──────────
const backoffs = script.match(/Math\.min\(4000,lwFrameWait\*2\)/g) || [];
assert.equal(backoffs.length, 1,
  'the doubling backoff (capped at 4s) lives in exactly ONE retry helper — no duplicated snippets');
assert.match(
  script,
  /const lwFrameRetryLater=\(\)=>\{if\(lwFrameRetry\)return;/,
  'the retry helper is a single gate: a pending retry suppresses further attempts',
);
const directConnects = script.match(/lwFrameConnect\(\)/g) || [];
assert.equal(directConnects.length, 1,
  'lwFrameConnect() is invoked from exactly one place — inside the backoff-gated retry helper');
assert.match(
  script,
  /if\(!lwFrameWs\|\|lwFrameWs\.readyState>1\)\{lwFrameLastResult=\{relayed:false,reason:'relay-not-open'\};lwFrameRetryLater\(\);return lwFrameLastResult;\}/,
  'a flush against a down socket schedules a backoff-gated reconnect instead of connecting directly',
);

// ── honest frame acks ─────────────────────────────────────────────────────
assert.match(
  script,
  /response=\{ok:true,relayed:sent\.relayed,wsOpen:!!\(lwFrameWs&&lwFrameWs\.readyState===1\),reason:sent\.reason\}/,
  "the 'frame' reply includes an honest relayed flag and typed send-failure reason",
);
assert.match(
  script,
  /try\{lwFrameWs\.send\(JSON\.stringify\(\{seg:\[s\]\}\)\);return lwFrameLastResult=\{relayed:true,reason:''\}\}catch\(_\)\{lwFrameNext=p;lwFrameLastResult=\{relayed:false,reason:'relay-send-failed'\}/,
  'lwFrameFlush must convert a WebSocket.send throw into an explicit relay-send-failed result',
);
assert.match(
  script,
  /const lwFrameSend=p=>\{[^}]*return lwFrameFlush\(\)\}/,
  'lwFrameSend returns the flush result instead of inferring success only from readyState',
);
assert.doesNotMatch(
  script,
  /response=\{ok:true,relayed:true/,
  'no hardcoded relayed:true — delivery claims must reflect the socket state',
);
assert.match(script, /const lwBridgeError=\(reason,message\)=>Object\.assign\(new Error\(message\),\{reason\}\)/,
  'bridge errors carry a typed reason while retaining their message');
assert.match(script, /reason:e&&e\.reason\|\|\(\/\^HTTP /,
  'all bridge error replies include a reason, classifying bare HTTP failures');

// ── stop stays on the existing control path ───────────────────────────────
assert.match(
  script,
  /m\.type===['"]control['"]/,
  'the existing control relay is still present',
);
assert.match(
  script,
  /post\('\/api\/control'/,
  'control payloads (including cancelStream) still POST to /api/control',
);
assert.doesNotMatch(
  script,
  /m\.type===['"](cancel|cancel-stream|frame-stop|stop)['"]/,
  'no bespoke stream-stop message type — stopping uses control {cancelStream:true}',
);

// cancelStream clears the pending frame slot AND the scheduled reconnect so a
// stale frame cannot arrive after stop and re-claim the canvas.
assert.match(
  script,
  /if\(c\.cancelStream\)lwFrameCancel\(\);/,
  'a control message with cancelStream also cancels the frame relay',
);
assert.match(
  script,
  /const lwFrameCancel=\(\)=>\{lwFrameNext=null;if\(lwFrameRetry\)\{clearTimeout\(lwFrameRetry\);lwFrameRetry=null\}\};/,
  'lwFrameCancel drops the pending frame and cancels any scheduled reconnect',
);

console.log('bridge-frame-protocol tests passed');
