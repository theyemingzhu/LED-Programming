#!/usr/bin/env node
// Write an LED count onto the connected card without opening Layout.
// Agents use this instead of asking Adrian to type the number.
//
//   node src/lib/applyLedCountToCard.cli.mjs --host 192.168.18.70 --pixels 41
//   node src/lib/applyLedCountToCard.cli.mjs --host 192.168.18.70 --pixels 41 --pin 18

import { applyLedCountOnCard } from './applyLedCountToCard.js';
import { readCardStatusEnvelope } from './cardPushClient.js';

function arg(name) {
  const at = process.argv.indexOf(`--${name}`);
  if (at < 0 || at === process.argv.length - 1) return undefined;
  return process.argv[at + 1];
}

const host = arg('host');
const pixels = Number(arg('pixels'));
const pinArg = arg('pin');
if (!host || !Number.isSafeInteger(pixels) || pixels < 1) {
  console.error('Usage: node src/lib/applyLedCountToCard.cli.mjs --host 192.168.18.70 --pixels 41 [--pin 18]');
  process.exit(2);
}

const result = await applyLedCountOnCard({
  host,
  pixels,
  ...(pinArg == null ? {} : { pin: Number(pinArg) }),
});
console.log(JSON.stringify({ applied: result.applied, reason: result.reason || '', saved: result.result?.saved === true }, null, 2));
if (!result.applied) {
  if (result.reason === 'not-a-length-change') {
    const status = await readCardStatusEnvelope({ host, transport: 'direct', timeoutMs: 2000 });
    const outputs = Array.isArray(status?.outputs) ? status.outputs : [];
    const match = pinArg == null
      ? outputs[0]
      : outputs.find(output => Number(output.pin ?? output.gpio) === Number(pinArg));
    if (Math.trunc(Number(match?.pixels) || 0) === pixels) {
      console.log(JSON.stringify({
        readback: true,
        already: true,
        cardId: status.cardId,
        pin: match.pin ?? match.gpio,
        pixels: match.pixels,
      }));
      process.exit(0);
    }
  }
  process.exit(1);
}

const deadline = Date.now() + 25000;
let last = null;
while (Date.now() < deadline) {
  try {
    last = await readCardStatusEnvelope({ host, transport: 'direct', timeoutMs: 2000 });
    const outputs = Array.isArray(last?.outputs) ? last.outputs : [];
    const match = pinArg == null
      ? outputs[0]
      : outputs.find(output => Number(output.pin ?? output.gpio) === Number(pinArg));
    if (Math.trunc(Number(match?.pixels) || 0) === pixels) {
      console.log(JSON.stringify({
        readback: true,
        cardId: last.cardId,
        pin: match.pin ?? match.gpio,
        pixels: match.pixels,
        bootId: last.bootId,
      }));
      process.exit(0);
    }
  } catch {
    last = null;
  }
  await new Promise(resolve => setTimeout(resolve, 1000));
}
console.error('Wrote the count but the card did not read back that length within 25s.');
if (last?.outputs) console.error(JSON.stringify(last.outputs));
process.exit(1);
