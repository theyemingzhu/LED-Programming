# Lightweaver Bench session

## Session

- Date/time and timezone: 2026-08-25 16:01 +08
- Operator: agent (Cursor), Adrian observing lights
- Behavior under test: Owner journey with the real card connected (Studio on `http://127.0.0.1:4173` → card HTTP)
- Outcome: `pending human observation`

## Exact identity

- Card ID: `lw-b0fe81f61b44`
- Firmware version: `1.1.29`
- Firmware build: `1427`
- Boot ID: `boot-6c66b15e-b0fe81f61b44`
- Card route used: USB JTAG `/dev/cu.usbmodem142201` (MAC `44:1b:f6:81:fe:b0`); HTTP `http://192.168.18.70`
- Project ID: `lightweaver-bench-discovery-v1`
- Project revision: `4`
- Project fingerprint: `4bf1b97f65f40c497f91bbfb293c4e914bf1b97f65f40c497f91bbfb293c4e91`

## Wiring and limits

| Output | GPIO | Pixel count | Chipset | Color order | Current limit | Expected direction |
| --- | ---: | ---: | --- | --- | --- | --- |
| out1 | 18 | 256 | WS2812B | RGB | 2000 mA | forward |

## Machine evidence

| Time | Surface | Action or query | Expected | Actual evidence | Result |
| --- | --- | --- | --- | --- | --- |
| 15:55 +08 | API | `GET http://192.168.18.70/api/status` | card answers | timeout; ARP incomplete | fail |
| 15:56 +08 | USB | `ls /dev/cu.usbmodem*` | ESP32 present | `USB JTAG/serial debug unit` VID:PID=303A:1001 | pass |
| 15:59 +08 | USB | `esptool.py chip_id` (read-only; RTS reset) | ESP32-S3 MAC | MAC `44:1b:f6:81:fe:b0`; hard reset | pass |
| 16:00 +08 | API | `GET /api/status` after reboot | `lw-b0fe81f61b44` ready on LAN | 200; `runtimePhase: ready`; `commandReady: true`; playing `aurora`; Wi-Fi station `192.168.18.70` RSSI -57 | pass |
| 16:05 +08 | browser | `live-card-states` connect on `/`, install, Patterns | `connected-direct` or `connected-bridge`, no alerts | 3/3 passed | pass |
| 16:06 +08 | browser | blackout still lists patterns; tap first pattern plays on card | card `currentPatternId` matches tap | 3/3 passed (full live file 6/6) | pass |

## Human observations

| Time | Known commanded state | One question asked | Adrian's observation | Expected | Result |
| --- | --- | --- | --- | --- | --- |
| 16:06 +08 | GPIO 18, 256 px, after live tap (not blackout) | On the bench strip, are the lights moving, dark, or stuck? | pending | moving (a library pattern, not blackout) | pending |

## Failure / Sprint handoff

- Observed versus expected: LAN address was dead until the USB identity read reset the chip; then station Wi-Fi resumed on the same IP.
- Reproduction: card powered on USB but `/api/status` at the remembered IP times out until a reboot.
- Evidence links: this file
- Suspected ownership boundary: none for the journey itself; Wi-Fi resume after USB-serial open is expected
- Focused acceptance check: Studio link state `connected-direct` to `lw-b0fe81f61b44`
- Workboard issue: pending

## Single next step

LED count is on the card (GPIO 18 × 41, read back). If Adrian is at the strip: are the lights moving, dark, or stuck?
