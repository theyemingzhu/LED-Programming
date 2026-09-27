# Lightweaver connection recovery — 2026-09-27

- Scope: repair and verify the connection first; Adrian declined the longer Prove run.
- Source: local `6cd4f718` (Studio build 1793) plus pre-existing uncommitted work.
- Intended card: remembered `lw-b0fe81f61b44`; current USB identity not yet correlated.
- USB: `/dev/cu.usbmodem14301`, no competing owner reported by `lsof`.
- Mac LAN: `192.168.18.111/24`; remembered card `192.168.18.70` does not answer.
- `lightweaver.local` resolution and setup AP `192.168.4.1` also time out.
- Firmware, boot ID, saved project and wiring: unknown until current readback.
- Browser: actual local preview starts discovery and reports no network response.
  Initial apparent pointer no-op was the in-app browser automation coordinate
  offset; direct screenshot-coordinate click and keyboard activation both work.
- Existing focused `setup-find-card` regression passed in the preceding turn.
- Historical recovery: `2026-08-25-lw-b0fe81f61b44-owner-journey.md` records the
  same USB-present/LAN-dead state; read-only USB chip identification followed by
  hard reset restored the same card at `.70` without writing firmware.
- No factory erase, firmware write, project replacement, or deployment authorized
  or needed for this diagnosis. Existing configuration must be preserved.

## Single next step

Bring the original workspace onto freshly fetched main before continuing repairs.

## Subsequent verified findings

- USB identity read confirmed MAC `44:1b:f6:81:fe:b0`, the intended card. Hard
  reset performed without flash writes. Boot reported defaults and no saved Wi-Fi.
- Adrian forbids switching the Mac onto the card setup Wi-Fi: retain internet.
  An attempted network switch did not change the route; verified Mac remains
  `192.168.18.111`, gateway `192.168.18.1`, external HTTPS returned 200.
- Root checkout was stale `codex/pattern-creative-workflow`. Cached main already
  had USB Wi-Fi setup; fresh fetch advanced main further to `66135132`, Studio
  build 2165. Clean managed preview checkout is
  `/Users/adrianrasmussen/.codex/worktrees/connection-restore/led`.
- Read-only app0 scan found embedded build `92bfd6ab...` (1939 / 1.1.39), without
  the USB Wi-Fi protocol marker. Live USB hello did not answer. This image match
  alone does not prove active OTA slot; preserving update requires full ROM
  identity, partition layout and OTA selection proof before any write.
- Restored prior-main preview 2118 passed 15 USB Wi-Fi browser cases, two
  remembered-network reconnect cases, and 93 related unit cases. Latest main2165
  production build passed. No product source changes were needed to restore code.
- Browser USB selection was canceled and browser control subsequently stopped
  by a safety restriction. No firmware write/erase or deployment occurred.
- Hardware repair is paused at Adrian's request to update the workspace first.
