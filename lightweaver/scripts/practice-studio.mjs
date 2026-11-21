#!/usr/bin/env node
// Open Studio in its own window, connected to one practice card.
//
//   node scripts/practice-studio.mjs --port 7101 [--studio http://localhost:9999]
//
// Why a window of its own: Studio keeps only the hostname of a card address
// and talks to it on port 80 (src/lib/cardIdentity.js normalizeHost), and
// port 80 on this Mac belongs to the i64os Caddy proxy. So in this window
// every card address Studio might try — the practice name, lightweaver.local,
// 192.168.4.1 and the physical test card's 192.168.18.70 — is routed to the
// practice card on 127.0.0.1:<port>. That also means this window can never
// reach the physical card by accident.
import { chromium } from '@playwright/test';
import { pathToFileURL } from 'node:url';

const CARD_ADDRESSES = ['lightweaver.local', '192.168.4.1', '192.168.18.70'];

/** Open a browser whose card addresses all lead to the practice card on `port`. */
export async function openPracticeStudio({ port = 7101, studio = 'http://localhost:9999', headless = false } = {}) {
  const name = `practice-${port}.local`;
  const target = `http://127.0.0.1:${port}`;
  const browser = await chromium.launch({ headless, args: ['--window-size=1320,900'] });
  const context = await browser.newContext(headless ? { viewport: { width: 1320, height: 900 } } : { viewport: null });

  async function forward(route) {
    const request = route.request();
    const url = new URL(request.url());
    const headers = { ...request.headers() };
    delete headers.host;
    try {
      const response = await fetch(`${target}${url.pathname}${url.search}`, {
        method: request.method(),
        headers,
        body: ['GET', 'HEAD'].includes(request.method()) ? undefined : request.postDataBuffer() ?? undefined,
      });
      const body = Buffer.from(await response.arrayBuffer());
      await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body });
    } catch {
      // The practice card dropped the connection (off Wi-Fi), or Studio gave up.
      await route.abort('connectionrefused').catch(() => {});
    }
  }

  for (const host of [name, ...CARD_ADDRESSES]) {
    await context.route(`http://${host}/**`, forward);
    // The frame stream opens ws://<host>:81/ws; accept it so the stream is not a fault.
    await context.routeWebSocket(`ws://${host}:81/ws`, () => {});
  }
  const page = await context.newPage();
  await page.goto(`${studio}/?cardHost=${name}#screen=card`);
  return { browser, context, page, name };
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const args = process.argv.slice(2);
  const opt = (flag, fallback) => {
    const i = args.indexOf(`--${flag}`);
    return i >= 0 ? args[i + 1] : fallback;
  };
  const port = Number(opt('port', '7101'));
  const studio = opt('studio', process.env.LW_STUDIO_URL || 'http://localhost:9999');
  const { browser, name } = await openPracticeStudio({ port, studio });
  console.log(`✓ Studio window on practice card ${port} (${name}); close the window to stop`);
  browser.on('disconnected', () => process.exit(0));
}
