# One Card connection flow

Approved behavior, 2026-10-01. Implementation is in progress.

Both the footer connection status and Card's connection action lead to
Card → Connection. They resume the same current step rather than opening
independent setup windows.

1. **Find your card.** Try its remembered/network addresses. Keep Connect by
   USB immediately available. Put setup-hotspot and manual-address alternatives
   under Other ways to connect. A failed attempt explains what failed and offers
   the relevant next action without resetting the program.
2. **Set up Wi-Fi.** Skip when the exact card reports an established network.
   When a verified supported USB card is eligible, scan using that card, choose
   a nearby 2.4 GHz network or enter a hidden name, then join. A configured card
   whose existing firmware does not allow USB provisioning uses its local Wi-Fi
   setup page. Show that requirement rather than promising an unavailable scan.
3. **Connected.** Identify the exact card and the network it reported. Return
   to the working screen that initiated the flow. Change the card's Wi-Fi is a
   distinct intentional action; it does not masquerade as reconnecting Studio.

Keep one primary action per step, with USB as a immediately accessible secondary
choice. Hide IP addresses, firmware identities and diagnostics in details.
Firmware update remains a separate explicit action. Connection does not request
an account, a physical-button action or destructive factory flashing.

## Verification boundaries

Automated checks cover equivalent entrances, route/state continuity, supported
USB scan/join, configured-card fallback, failure recovery, wrong-card blocking,
return navigation and layout on desktop/mobile. The integrated checkpoint runs
unit tests and a production build once after focused checks.

Physical acceptance remains separate: owner observes actual USB selection,
network permission prompts, Wi-Fi scan results, reconnection and retained card
configuration. A browser fixture cannot certify those observations.
