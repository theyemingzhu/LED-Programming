#!/usr/bin/env node
// Start one or more practice cards on this Mac. Local only, never deployed.
//
//   node scripts/practice-card.mjs                    Fast on 7101 + Real-timing on 7102
//   node scripts/practice-card.mjs --card 7101:real   one card, Real-timing, port 7101
//   node scripts/practice-card.mjs --card 7103:fast:blackout --studio http://localhost:9999
//
// Each card: page at http://127.0.0.1:<port>/practice/, card API at
// http://127.0.0.1:<port>/api/*. Studio connects to it in its own window:
// scripts/practice-studio.mjs (the page's "Open Studio" button runs it).
// See docs/practice-card.md.
import { loadPracticeHarness } from './practice-bundle.mjs';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

const args = process.argv.slice(2);
const cards = [];
let studioUrl = process.env.LW_STUDIO_URL || 'http://localhost:9999';
let seed = 1;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--card') cards.push(args[++i]);
  else if (args[i] === '--studio') studioUrl = args[++i];
  else if (args[i] === '--seed') seed = Number(args[++i]) || 1;
  else if (args[i] === '--help' || args[i] === '-h') {
    console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1, 9).join('\n'));
    process.exit(0);
  } else { console.error(`Unknown option ${args[i]}`); process.exit(2); }
}
if (!cards.length) cards.push('7101:fast', '7102:real');

const { startPracticeServer } = await loadPracticeHarness();

const pagePath = path.join(root, 'tests', 'harness', 'practice', 'index.html');
const studioScript = path.join(here, 'practice-studio.mjs');
for (const spec of cards) {
  const [portText, modeText = 'fast', stateId = 'installed-match'] = spec.split(':');
  const port = Number(portText);
  const mode = modeText === 'real' ? 'real' : 'fast';
  if (!Number.isInteger(port) || port < 1024) { console.error(`Bad port in --card ${spec}`); process.exit(2); }
  const { server, cardId } = startPracticeServer({ port, mode, stateId, seed, pagePath, studioUrl, studioScript });
  server.on('error', error => {
    console.error(`✗ port ${port}: ${error.code === 'EADDRINUSE' ? 'already in use (a practice card may already be running there)' : error.message}`);
    process.exit(1);
  });
  server.on('listening', () => {
    console.log(`✓ ${mode === 'real' ? 'Real-timing' : 'Fast'} practice card ${cardId}`);
    console.log(`    page   http://127.0.0.1:${port}/practice/`);
    console.log(`    Studio node scripts/practice-studio.mjs --port ${port}   (or the page's Open Studio button)`);
  });
}
