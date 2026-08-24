// The https lane.
//
// On http://localhost Studio fetches the card directly. On
// https://led.mandalacodes.com it cannot — mixed content — so it must open the
// card's own page in another tab and talk to it over postMessage. Different
// code, and until now nothing tested it: every walkthrough drove localhost,
// which is how bridge-only faults reached Adrian's phone.
//
// Two pieces, and both are needed:
//
//  1. Serve the real app at the real production origin, by fulfilling
//     https://led.mandalacodes.com/** from the local Vite server. Playwright
//     intercepts before TLS so no certificate is involved, and
//     canPushDirectlyToCard() becomes false HONESTLY — every one of its ~30
//     call sites takes the production branch, including the subtractive ones
//     that simply switch polling off. Stubbing the predicate would miss those.
//
//  2. A fake card tab, backed by the SAME simulator as the direct lane. One
//     card, two transports; the alternative is two fixtures that drift apart,
//     which is the drift that hid these faults in the first place.
import type { Page } from '@playwright/test';
import type { CardSimulator } from './cardSimulator';

export const STUDIO_ORIGIN = 'https://led.mandalacodes.com';

/** Serve the real app at the real production origin. */
export async function installHttpsStudio(page: Page, localBaseURL: string) {
  await page.route(`${STUDIO_ORIGIN}/**`, async route => {
    const requested = new URL(route.request().url());
    // page.request.fetch bypasses routing, so there is no loop. The hash never
    // reaches the server, so only pathname + search are forwarded.
    const upstream = await page.request.fetch(
      `${localBaseURL}${requested.pathname}${requested.search}`,
      { method: route.request().method(), headers: route.request().headers() },
    );
    await route.fulfill({ response: upstream });
  });
}

/**
 * Replace window.open with a card tab that answers from `card`.
 *
 * Every detail here is load-bearing (cardBridge.js handleBridgeMessage):
 * the reply must be asynchronous or it lands before the request is registered;
 * event.source must be the identical object window.open returned; event.origin
 * must be exactly http://<host>; and bridgeVersion 6 is what unlocks the full
 * relay set. Answering `ready` alone is not enough — only a `status` reply sets
 * runtimeCommandReady, without which every privileged command is refused.
 */
export async function installFakeCardBridge(page: Page, card: CardSimulator, host = 'lightweaver.local') {
  await page.exposeFunction('__lwBridgeRequest', (type: string, payload: unknown) => card.handleBridge(type, payload));

  await page.addInitScript(({ cardHost, bridgeVersion }) => {
    const origin = `http://${cardHost}`;
    const tab: Record<string, unknown> = {
      closed: false,
      focus() {},
      close() { (tab as { closed: boolean }).closed = true; },
      location: { href: origin, host: cardHost },
    };

    // MessageEvent's constructor refuses a non-Window source, so the event is
    // built by hand. This is the same shape card-workspace.spec.ts uses.
    const emit = (data: unknown) => {
      const event = new Event('message');
      Object.defineProperties(event, {
        data: { value: data },
        origin: { value: origin },
        source: { value: tab },
      });
      window.dispatchEvent(event);
    };

    (tab as Record<string, unknown>).postMessage = (message: Record<string, unknown>) => {
      if (!message || message.app !== 'LightweaverStudioBridge') return;
      const request = (window as unknown as {
        __lwBridgeRequest: (type: string, payload: unknown) => Promise<Record<string, unknown>>;
      }).__lwBridgeRequest;
      void Promise.resolve(request(String(message.type), message.payload)).then(answer => {
        emit({
          app: 'LightweaverCardBridge',
          version: bridgeVersion,
          id: message.id,
          type: message.type,
          host: cardHost,
          ...answer,
        });
      });
    };

    (window as unknown as { open: unknown }).open = () => {
      // The handshake, once the opener has had a tick to start listening.
      setTimeout(() => emit({
        app: 'LightweaverCardBridge',
        type: 'ready',
        version: bridgeVersion,
        href: `${origin}/#studioBridge=1`,
        host: cardHost,
      }), 0);
      return tab;
    };
  }, { cardHost: host, bridgeVersion: 6 });
}
