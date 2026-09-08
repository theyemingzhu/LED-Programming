#!/usr/bin/env node
// Read-only Lightweaver diagnosis. --host accepts a hostname or hostname:port.
// Exit 0 requires consistent exact-card evidence and reported playback readiness;
// it never certifies physical light behavior.
import { pathToFileURL } from 'node:url';

async function get(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(4000), cache: 'no-store' });
    if (!response.ok) return { error: `HTTP ${response.status}` };
    const data = await response.json();
    if (!data || typeof data !== 'object' || Array.isArray(data)) return { error: 'invalid JSON object' };
    return { data };
  } catch (error) {
    return { error: error.name === 'TimeoutError' ? 'no answer in 4 seconds' : error.message };
  }
}

export async function runBenchCheck(hosts, say = console.log) {
  say('Lightweaver bench check (read-only)');
  let host, status;
  for (const candidate of hosts) {
    const result = await get(`http://${candidate}/api/status`);
    if (result.data) { host = candidate; status = result.data; break; }
    say(`${candidate}: ${result.error}`);
  }
  if (!host) {
    say('Verdict: unreachable or incompatible response. Check the card route and network; firmware state is unknown.');
    return 1;
  }
  say(`Card route: ${host}`);
  const firmware = await get(`http://${host}/api/firmware-info`);
  if (firmware.error) {
    say(`Verdict: firmware evidence unavailable (${firmware.error}); readiness unknown.`);
    return 1;
  }
  for (const key of ['cardId', 'bootId', 'firmwareVersion', 'buildId', 'buildNumber']) {
    if (!status[key] || !firmware.data[key]) {
      say(`Verdict: incomplete identity (${key}); cannot verify this card's readiness.`);
      return 1;
    }
    if (status[key] !== firmware.data[key]) {
      say(`Verdict: identity mismatch (${key}). Rerun after the card has finished restarting.`);
      return 1;
    }
  }
  say(`Card ${status.cardId}; firmware ${status.firmwareVersion}, build ${status.buildNumber}; boot ${status.bootId}`);
  const updateReady = firmware.data.firmwareUpdateReady;
  say(updateReady === true ? 'Wi-Fi update: card reports ready; signed-release and authorization checks still apply.'
    : updateReady === false ? 'Wi-Fi update: card reports not ready.'
      : 'Wi-Fi update: eligibility unreported by this firmware; do not infer it from connectivity.');
  if (!Object.hasOwn(status, 'projectId')) {
    say('Verdict: incompatible project-status response. Inspect firmware compatibility; missing evidence does not prove a flash is needed.');
    return 1;
  }
  if (!status.projectId) {
    say('Verdict: needs setup. The card is reachable but has no installed project. Continue project and wiring setup in Studio.');
    return 1;
  }
  if (typeof status.projectId !== 'string' || status.configValid !== true || status.commandReady !== true || status.playbackReady !== true) {
    say(`Verdict: project installed but not ready (runtime ${status.runtimePhase || 'unknown'}). Resolve setup/recovery before playback.`);
    return 1;
  }
  const lights = await get(`http://${host}/json/state`);
  if (lights.error || typeof lights.data.on !== 'boolean' || !Number.isFinite(lights.data.bri)) {
    say(`Verdict: light API unavailable or incompatible (${lights.error || 'missing power/brightness'}); playback not verified.`);
    return 1;
  }
  say(`Project: ${status.projectId}; power ${lights.data.on ? 'on' : 'off'}, brightness ${lights.data.bri}.`);
  say('Verdict: playback-ready according to the card. Physical lights still require observation.');
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  if (args.length && (args.length !== 2 || args[0] !== '--host' || !/^[a-zA-Z0-9.-]+(?::\d+)?$/.test(args[1]))) {
    console.error('Usage: node scripts/bench-check.mjs [--host lightweaver.local]');
    process.exitCode = 2;
  } else {
    process.exitCode = await runBenchCheck(args.length ? [args[1]] : ['lightweaver.local', '192.168.4.1']);
  }
}
