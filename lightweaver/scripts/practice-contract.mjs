#!/usr/bin/env node
// Keep the practice card honest: replay one fixed, READ-ONLY request script
// against the physical test card and against a Real-timing practice card, and
// print where reply shapes or timings drift beyond tolerance.
//
//   npm run practice:contract                      physical card at 192.168.18.70
//   npm run practice:contract -- --card lightweaver.local --json report.json
//
// On demand only, never in CI (it needs the physical card on this Wi-Fi).
// It sends GET requests and nothing else: the script below is the whole list,
// and `send` refuses any other method. Safe while another session holds the
// card for writing, because it writes nothing. See docs/practice-card.md.
import fs from 'node:fs';
import path from 'node:path';
import { loadPracticeHarness, lightweaverRoot } from './practice-bundle.mjs';

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const cardHost = opt('card', '192.168.18.70');
const jsonOut = opt('json', '');
const practicePort = Number(opt('port', '7199'));
// Which practice state to compare against: the one the physical card holds.
// It has held the factory bench-discovery project since 2026-11-21.
const stateId = opt('state', 'bench-discovery');
const TIMEOUT_MS = 4_000;
const SPACING_MS = 700;

// The fixed script. Read-only paths only. Each is asked several times so a
// single slow reply does not decide the median.
const SCRIPT = [
  ...Array(6).fill('/api/status'),
  ...Array(3).fill('/api/firmware-info'),
  ...Array(2).fill('/api/patterns'),
  ...Array(2).fill('/api/zones'),
  ...Array(3).fill('/api/wiring/status'),
];

// Values that must match exactly, not just in shape: the card's fixed
// hardware facts. Live fields (pressed flags, event counts, aLow) are left out.
const VALUE_CHECKS = {
  '/api/firmware-info': [
    'ledType', 'outputColor',
    'controls.encoder.a', 'controls.encoder.b', 'controls.encoder.press',
    'controls.encoder.configuredAlternatePress', 'controls.encoder.effectiveAlternatePress',
    'controls.encoder.rotateDirection', 'controls.encoder.brightnessStep',
    'controls.previous', 'controls.next', 'controls.blackout', 'controls.statusLed',
    'controls.brightnessAnalog',
  ],
};
const at = (o, dotted) => dotted.split('.').reduce((v, k) => (v == null ? v : v[k]), o);

// A timing is drift when it differs by more than BOTH of these.
const TOLERANCE = { ratio: 0.5, ms: 40 };

async function send(base, method, p) {
  if (method !== 'GET') throw new Error(`contract check is read-only; refused ${method} ${p}`);
  const t0 = performance.now();
  try {
    const response = await fetch(`${base}${p}`, { method, signal: AbortSignal.timeout(TIMEOUT_MS), cache: 'no-store' });
    const text = await response.text();
    let body = null;
    try { body = JSON.parse(text); } catch { /* not JSON */ }
    return { status: response.status, ms: performance.now() - t0, body };
  } catch (error) {
    return { status: 'no answer', ms: performance.now() - t0, body: null, error: String(error?.name || error) };
  }
}

async function replay(base) {
  const results = [];
  for (const p of SCRIPT) {
    results.push({ path: p, ...(await send(base, 'GET', p)) });
    await new Promise(r => setTimeout(r, SPACING_MS));
  }
  return results;
}

/** Flatten a reply into "a.b[].c" → type, so shapes compare without values. */
function shape(value, prefix = '', out = new Map()) {
  const type = Array.isArray(value) ? 'array' : value === null ? 'null' : typeof value;
  if (prefix) out.set(prefix, type);
  if (type === 'array') value.slice(0, 3).forEach(item => shape(item, `${prefix}[]`, out));
  else if (type === 'object') for (const [k, v] of Object.entries(value)) shape(v, prefix ? `${prefix}.${k}` : k, out);
  return out;
}

function median(list) {
  const s = [...list].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : NaN;
}

function compare(real, practice) {
  const paths = [...new Set(SCRIPT)];
  return paths.map(p => {
    const r = real.filter(x => x.path === p);
    const q = practice.filter(x => x.path === p);
    const rOk = r.filter(x => x.status === 200);
    const qOk = q.filter(x => x.status === 200);
    const realShape = new Map(); rOk.forEach(x => shape(x.body, '', realShape));
    const practiceShape = new Map(); qOk.forEach(x => shape(x.body, '', practiceShape));
    const missing = [...realShape.keys()].filter(k => !practiceShape.has(k));
    const extra = [...practiceShape.keys()].filter(k => !realShape.has(k));
    const typeDiff = [...realShape.keys()].filter(k => practiceShape.has(k) && practiceShape.get(k) !== realShape.get(k)
      && realShape.get(k) !== 'null' && practiceShape.get(k) !== 'null')
      .map(k => `${k}: card ${realShape.get(k)}, practice ${practiceShape.get(k)}`);
    const realMs = median(rOk.map(x => x.ms));
    const practiceMs = median(qOk.map(x => x.ms));
    const diff = Math.abs(realMs - practiceMs);
    const timingDrift = Number.isFinite(diff) && diff > TOLERANCE.ms && diff > TOLERANCE.ratio * realMs;
    const valueDiff = (VALUE_CHECKS[p] || []).flatMap(k => {
      const a = JSON.stringify(at(rOk[0]?.body, k));
      const b = JSON.stringify(at(qOk[0]?.body, k));
      return rOk.length && qOk.length && a !== b ? [`${k}: card ${a}, practice ${b}`] : [];
    });
    return {
      path: p,
      real: { answered: rOk.length, asked: r.length, medianMs: Math.round(realMs), statuses: [...new Set(r.map(x => x.status))] },
      practice: { answered: qOk.length, asked: q.length, medianMs: Math.round(practiceMs), statuses: [...new Set(q.map(x => x.status))] },
      timingDrift, missing, extra, typeDiff, valueDiff,
      statusDrift: String(r.map(x => x.status).sort()) !== String(q.map(x => x.status).sort()),
    };
  });
}

const harness = await loadPracticeHarness();
const server = harness.startPracticeServer({
  port: practicePort, mode: 'real', stateId,
  // Spontaneous silences are random; a contract run compares ordinary replies.
  overrides: { spontaneousSilence: null },
  pagePath: path.join(lightweaverRoot, 'tests', 'harness', 'practice', 'index.html'),
  studioUrl: 'http://localhost:9999',
});
await new Promise(r => server.server.on('listening', r));

console.log(`Replaying ${SCRIPT.length} read-only requests against the physical card (${cardHost}) and the Real-timing practice card (${stateId})…`);
const [real, practice] = await Promise.all([replay(`http://${cardHost}`), replay(`http://127.0.0.1:${practicePort}`)]);
server.server.close();

const rows = compare(real, practice);
const realAnswered = real.filter(x => x.status === 200).length;
if (!realAnswered) {
  console.log(`\n✗ The physical card did not answer any request at ${cardHost}. Is it powered and on this Wi-Fi? No drift report.`);
  process.exit(1);
}

let drift = 0;
console.log(`\nTolerance: timing drifts when it differs by more than ${TOLERANCE.ms} ms AND ${TOLERANCE.ratio * 100}%.\n`);
for (const row of rows) {
  const flags = [];
  if (row.timingDrift) flags.push(`timing: card ${row.real.medianMs} ms, practice ${row.practice.medianMs} ms`);
  if (row.statusDrift) flags.push(`answers: card ${row.real.statuses.join('/')}, practice ${row.practice.statuses.join('/')}`);
  if (row.missing.length) flags.push(`practice lacks ${row.missing.length} field(s): ${row.missing.slice(0, 8).join(', ')}${row.missing.length > 8 ? ', …' : ''}`);
  if (row.extra.length) flags.push(`practice adds ${row.extra.length} field(s): ${row.extra.slice(0, 8).join(', ')}${row.extra.length > 8 ? ', …' : ''}`);
  if (row.valueDiff.length) flags.push(`value differs: ${row.valueDiff.join('; ')}`);
  if (row.typeDiff.length) flags.push(`type differs: ${row.typeDiff.slice(0, 5).join('; ')}`);
  drift += flags.length;
  const head = `${flags.length ? '✗' : '✓'} ${row.path.padEnd(20)} card ${String(row.real.medianMs).padStart(5)} ms (${row.real.answered}/${row.real.asked})   practice ${String(row.practice.medianMs).padStart(5)} ms (${row.practice.answered}/${row.practice.asked})`;
  console.log(head);
  for (const f of flags) console.log(`    ${f}`);
}
const silences = real.filter(x => x.status !== 200).length;
console.log(`\n${drift ? `${drift} drift item(s).` : 'No drift.'} The physical card left ${silences} of ${real.length} requests unanswered during this run${silences ? ' (the Real-timing profile models this as silences; they are random, so not compared)' : ''}.`);

if (jsonOut) {
  fs.writeFileSync(jsonOut, JSON.stringify({ at: new Date().toISOString(), cardHost, tolerance: TOLERANCE, rows, real, practice }, null, 2));
  console.log(`Full report: ${jsonOut}`);
}
