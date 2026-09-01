#!/usr/bin/env node
// Lightweaver — the bench check.
//
// Four of eight recorded bug reports on this project were setup failures at
// the bench, and each one was diagnosed from scratch: is the card even
// reachable, is it running the firmware you think, why is the handoff looping.
// This asks those questions once, in order, and prints a verdict.
//
// It exists because of one specific incident (2026-08-07): a card flashed
// before the firmware started reporting its installed project made the
// card-to-patterns handoff fail permanently, and the symptom was a spinner —
// ~45 resolutions/second behind a disabled "Verifying project…" button. The
// cause was one missing field in one response. Check 3 below looks straight
// at that field, because a spinner is not a diagnosis.
//
//   node scripts/bench-check.mjs
//   node scripts/bench-check.mjs --host 192.168.4.1
//
// Exit code is 0 when the card is usable, 1 when it is not.

const argHost = (() => {
  const i = process.argv.indexOf('--host');
  return i > -1 ? process.argv[i + 1] : null;
})();

// The card answers on its mDNS name on a normal LAN and on its own access
// point address when it is serving its own network. Try both unless told.
const HOSTS = argHost ? [argHost] : ['lightweaver.local', '192.168.4.1'];
const TIMEOUT_MS = 4000;

const dim = (s) => `[2m${s}[0m`;
const ok = (s) => `[32m${s}[0m`;
const bad = (s) => `[31m${s}[0m`;
const warn = (s) => `[33m${s}[0m`;

async function get(url) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctl.signal });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* not json, keep the text */ }
    return { ok: res.ok, status: res.status, json, text };
  } catch (e) {
    return { ok: false, error: e.name === 'AbortError' ? `no answer in ${TIMEOUT_MS}ms` : e.message };
  } finally {
    clearTimeout(t);
  }
}

const lines = [];
const say = (s) => { lines.push(s); console.log(s); };
let fatal = false;

say('Lightweaver bench check');
say(dim(`trying ${HOSTS.join(' then ')}`));
say('');

// 1 — is anything there at all
let host = null;
for (const h of HOSTS) {
  const r = await get(`http://${h}/api/status`);
  if (r.ok || r.status) { host = h; break; }
}

if (!host) {
  say(`${bad('1  card')}        unreachable on ${HOSTS.join(' and ')}`);
  say('');
  say('   The card is not answering. In order, the usual causes:');
  say('   - it is not powered, or the USB cable is charge-only');
  say('   - you are on a different network than the card');
  say('   - it is serving its own access point: join that network, then');
  say('     re-run with --host 192.168.4.1');
  process.exit(1);
}
say(`${ok('1  card')}        answering at ${host}`);

// 2 — what firmware is on it
const fw = await get(`http://${host}/api/firmware-info`);
if (!fw.ok) {
  say(`${warn('2  firmware')}    /api/firmware-info did not answer (${fw.error ?? fw.status})`);
} else {
  const v = fw.json?.version ?? fw.json?.build ?? 'unreported';
  const piece = fw.json?.piece?.id ?? null;
  say(`${ok('2  firmware')}    ${v}${piece ? dim(`  piece ${piece}`) : ''}`);
}

// 3 — the field whose absence caused the loop
const st = await get(`http://${host}/api/status`);
if (!st.ok) {
  say(`${bad('3  handoff')}     /api/status did not answer (${st.error ?? st.status})`);
  fatal = true;
} else if (!st.json) {
  say(`${bad('3  handoff')}     /api/status answered but not with JSON`);
  fatal = true;
} else if (!st.json.projectId) {
  fatal = true;
  say(`${bad('3  handoff')}     /api/status carries no projectId`);
  say('');
  say('   This is the 2026-08-07 failure exactly. A card that cannot report');
  say('   its installed project cannot hand off to Patterns, and older builds');
  say('   never sent this field. The card needs reflashing with a build from');
  say('   2026-08-04 or later. Nothing about the Studio will fix it.');
} else {
  say(`${ok('3  handoff')}     projectId ${dim(st.json.projectId)}`);
}

// 4 — the light-driving API itself
const wled = await get(`http://${host}/json/state`);
if (!wled.ok) {
  say(`${warn('4  lights')}      /json/state did not answer (${wled.error ?? wled.status})`);
} else {
  const on = wled.json?.on;
  const bri = wled.json?.bri;
  say(`${ok('4  lights')}      responding${on === undefined ? '' : dim(`  power ${on ? 'on' : 'off'}, brightness ${bri ?? '?'}`)}`);
}

// 5 — is the Studio running locally
const studio = await get('http://127.0.0.1:9999/');
say(studio.ok
  ? `${ok('5  studio')}      running on 9999`
  : `${dim('5  studio')}      not running locally (only needed to design patterns)`);

say('');
say(fatal
  ? bad('Verdict: the card is reachable but cannot be worked with. See check 3.')
  : ok('Verdict: usable. Start from here, not from the symptom.'));

process.exit(fatal ? 1 : 0);
