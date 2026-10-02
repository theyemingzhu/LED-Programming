# Connection path audit — 2026-10-01

Scope: read-only product audit of footer versus Card setup, including Wi-Fi scan.
Source: origin/main f1c16292 plus isolated Find-my-card candidate c6eb000f (PR382).
This records source behavior, not observed permission/card/network outcomes.

## Findings

1. **Two entrances do not use one routing decision.** Footer CardStatusControl
   calls app.jsx openCardControl (line1564 in candidate), selecting controls,
   save, Setup or Connection Center from lifecycle and commissioning state.
   Card Setup opens app.jsx openConnectionCenter directly, or uses findMyCard
   (lw-setup.jsx line914). The direct callback resets connectPanelIntent; the
   footer path does not use that callback or the common intent resolver.
   Public Find-my-card before PR382 also bypassed the panel for a legacy popup.

2. **Wi-Fi setup is split across three visible surfaces.** CardConnectionCenter
   handles connecting to an already configured card or joining its setup hotspot;
   it has no nearby-network scanner. lw-flash.jsx owns the USB Wi-Fi form and
   scanWifiUsb (line2009 in candidate). CardCommissioningPanel opens the card
   page /?wifiSetup=1 for hotspot provisioning. Firmware LightweaverWeb.cpp
   supplies that page's scanner through /api/wifi/scan.

3. **Wi-Fi routing depends on saved workflow state.** cardFlowEntry.js
   resolveCardIntent('configure-wifi') sends resumable commissioning or an
   exact-card preserving USB update to Card Install. Otherwise it opens
   Connection Center with setup-network intent. The latter shows join steps,
   not the USB Wi-Fi form. Consequently similar connection actions can reveal
   different controls depending on remembered identity, host and setup state.

4. **USB inspection is coupled to Install navigation.** Inspect card over USB
   closes the connection panel and sets #screen=flash&mode=install. On a card
   verified to run the current signed release, the running-app USB handshake
   can enter Wi-Fi setup without rewriting firmware (lw-flash.jsx around1695).
   Scan nearby networks appears only during wifi-setup with a live verified USB
   session. This explains why the owner's successful USB path can offer scanning
   while the other connection screen does not. It does not prove the owner's
   card matched this exact branch; that would require session/device evidence.

5. **PR382 repairs one entrance, not the overall fragmentation.** Public
   Find my card now opens the existing connection panel with USB recovery
   immediately. It does not merge footer routing, Card Setup, USB commissioning
   and card-local Wi-Fi setup into one section.

## Recommended bounded correction

Make Card → Connection the single visible place for finding/reconnecting a card
and setting its Wi-Fi. Both footer and Card buttons should navigate through one
shared resolver to that place, preserving the same card, progress and return
route. Keep USB versus network as transport choices inside the same steps.
Show Scan nearby networks when the verified card can perform it; otherwise show
why it is unavailable and the next connection step. Keep firmware updating a
separate explicit action rather than requiring owners to enter Install just to
connect or configure Wi-Fi. Preserve exact-card, signature and recovery guards.

## Evidence and limits

- Existing routing tests: cardFlowEntry.test.js + connectPanelRouting.test.js,
  15/15 passed on candidate c6eb000f.
- Prior focused UI regression: 2/2 passed on current-main candidate, covering
  public Find entry, immediate USB option and inspector navigation.
- Prior rendered connection panel screenshot inspected:
  /private/tmp/lw-find-card-fixed.png.
- No new product edits, release-candidate modifications, firmware writes or
  physical Wi-Fi/permission claims were made for this audit.
