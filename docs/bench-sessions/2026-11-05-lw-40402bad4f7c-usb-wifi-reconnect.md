# Lightweaver Bench session — USB and Wi-Fi reconnect

## Session

- Date/time and timezone: 2026-11-05, America/Los_Angeles
- Operator: Adrian (physical card); Codex (machine diagnosis and preserving recovery)
- Behavior under test: reconnect one previously paired ESP32-S3 card by USB or Wi-Fi
- Outcome: USB/LAN/Studio reconnection passed; physical LED playback not tested in this connection session

## Exact identity

- Card ID: `lw-40402bad4f7c`, returned by the recovered USB runtime and LAN API. ROM MAC `7c:4f:ad:2b:40:40` has reversed byte order in the Lightweaver card ID. The earlier derived `lw-7c4fad2b4040` was wrong; this card is distinct from prior session card `lw-b0fe81f61b44`.
- Firmware version/build/boot ID: Lightweaver 1.2.2/build 2320, build ID `17ec775f13027f698a36acf3016a6340c54d7234`. Last correlated boot after three USB reconnects: `boot-c295f60a-40402bad4f7c`.
- Card route: COM5 is CH340 UART (`VID_1A86&PID_7523`); after cable move, COM6 is native ESP32-S3 USB Serial/JTAG (`VID_303A&PID_1001`), same MAC
- Project ID/revision/fingerprint: `lightweaver-bench-discovery-v1`, revision 1, fingerprint `0eaeb26059180eba`
- Wiring and limits: GPIO38 256 pixels; GPIO41 256 pixels; other limits not observed

## Machine evidence

| Time | Surface | Action or query | Expected | Actual evidence | Result |
| --- | --- | --- | --- | --- | --- |
| 2026-11-05 | Windows USB | `Get-PnpDevice -Class Ports -PresentOnly` | ESP32-S3 USB serial device | Only ACPI communications port COM1; no ESP32 USB device visible | inconclusive for Adrian's card |
| 2026-11-05 | Source | Inspect `lw-flash.jsx`, USB firmware reader and runtime Wi-Fi channel | Distinguish ROM selection, firmware scan, Wi-Fi setup | Find selects ROM, tries exact-current runtime hello, then scans firmware in background if needed; configured-card USB Wi-Fi mutation is deliberately limited | pass (code path identified) |
| 2026-11-05 | Tests | Focused USB reader, runtime Wi-Fi, serial selection and installer-core tests | Baseline green | 76/76 pass | pass |
| 2026-11-05 | Windows USB | Repeat port inventory after Adrian connected card | Detect exact USB device | COM5 CH340 UART appeared; no `VID_303A` native USB CDC device | pass for UART route, native route absent |
| 2026-11-05 | ROM serial | `esptool read-mac` on COM5; automatic hard reset | Correlate chip and MAC without write | ESP32-S3 QFN56 v0.2, embedded PSRAM 8 MB, MAC `7c:4f:ad:2b:40:40` | pass |
| 2026-11-05 | Boot serial | Read filtered 115200 log after software RTS reset | Determine boot mode | `SPI_FAST_FLASH_BOOT`, entry address present; no application identity on CH340 UART | partial |
| 2026-11-05 | Source/hardware contract | Check PlatformIO flags and USB enumeration | Determine Studio USB Wi-Fi channel | Firmware uses `ARDUINO_USB_MODE=1` and `ARDUINO_USB_CDC_ON_BOOT=1`; `Serial` is native USB CDC, while COM5 is CH340 UART | pass |
| 2026-11-05 | Windows Wi-Fi | Check radio/scanning state | Determine AP visibility | Radio on but Windows denied network enumeration without Location permission; AP presence is unknown | inconclusive |
| 2026-11-05 | Regression | Optional firmware scan deadline after completed packet | Preserve valid USB connection | Red before fix, green after fix; reader 24/24 passed | pass in simulation |
| 2026-11-05 | Native USB | COM6 `hello` read-only frame | Exact Lightweaver runtime reply | Port opens but small write times out, with DTR low and high | fail |
| 2026-11-05 | LAN | Read-only GET `/api/status` scan of local 192.168.18.0/24 | Exact card response | No Lightweaver API found; `lightweaver.local` unresolved | inconclusive route |
| 2026-11-05 | ROM flash | Stub read of app at 0x10000 on COM6 | Stable read | Reproducibly stops at address 0x38000, even at 115200; ROM `--no-stub` reads the sector and entire 3 MB range successfully | fail for stub; pass for ROM |
| 2026-11-05 | ROM metadata | Read OTA selector and partition table | Determine active layout | Active app0, sequence 1; installed table has 8 MB layout, app0 0x10000/0x140000; hardware flash is 16 MB | incompatible with Lightweaver N16R8 layout |
| 2026-11-05 | Image analysis | Parse 3 MB ROM read and compare archived signed images | Determine active firmware | Valid 6-segment Arduino image ends before 0x5B000, declares 8 MB flash, contains no Lightweaver/provisioning protocol. Bytes from 0x5B000 onward match archived signed Lightweaver 1.2.1, but are stale residue outside the active image. Do not identify running firmware from those bytes. | pass |
| 2026-11-05 | Recovery backup | Two independent ROM reads of current NVS 0x9000/0x5000 | Preserve existing configuration before any write | Both SHA-256 `2ecbbf201e42320cf2fac63b74924bd3113908abbd7fe056315f8b208cd4a5d6`; Lightweaver, knownGoodConfig and Wi-Fi key names are present; values and credentials not printed | pass |
| 2026-11-05 | Signed target | Verify committed 1.2.2 factory/app artifacts | Prepare a possible recovery without executing it | Factory SHA-256 `149f86372fb115468da4a33c435a0425078f1ca9d94d2390066966eb4125ffba`; app size 2,425,728; partition table SHA-256 `9af3af2b74e944337ba85f2b0027ee80df160579a1ab746ba0f95853f618cd60`. Factory NVS slice is erased, so writing the combined factory image would destroy saved data. | pass, no write |
| 2026-11-05 | Recovery preservation | Save old boot, partition table, OTA selector, NVS, app region and SPIFFS | Complete private rollback data before mutation | Durable private backup under `C:\LED\LED-Programming\.git\lightweaver-bench\2026-11-05-lw-7c4fad2b4040` (folder has the early incorrect derived ID). Old SPIFFS 0x290000/0x160000 SHA-256 `3cf4e5a0597dd20f5a6f7b56607f7ba795de600e159f06a7189f7a990f376b46`. Credentials never printed. | pass |
| 2026-11-05 | Signed recovery | Validate manifest/ticket signatures, target N16R8, artifact hashes and layout | Restore Lightweaver while retaining saved card data | Verified factory/app and signed boot/table. New table preserves NVS 0x9000/0x5000; app0 0x10000/0x640000, app1 0x650000/0x640000, SPIFFS 0xc90000/0x360000. No factory-image whole-flash write. | pass |
| 2026-11-05 | COM6 ROM write | `esptool --no-stub` write only signed boot 0x0/0x8000, table 0x8000/0x1000, app 0x10000/0x250380 | Signed Lightweaver boots without erasing NVS/OTA | Completed 30.7 s, flasher hash verified; no erase-all, NVS write, OTA write, BOOT or RESET button. Log: private `preserving-recovery-write.log`. | pass |
| 2026-11-05 | Independent flash readback | Read 0x0 through 0x260380 and compare slices | Exact written bytes and preserved OTA | Boot, table and app exactly match signed slices; OTA exactly matches backup. NVS changed 1276 bytes in page 2 after runtime boot, so it is **not** byte-identical to pre-recovery; saved Wi-Fi and project were verified through runtime APIs. | pass with explicit NVS caveat |
| 2026-11-05 | COM6 USB runtime | Read-only `hello` | Exact card/firmware and saved Wi-Fi | `lw-40402bad4f7c`, 1.2.2/build 2320, `freshInstallEligible=false`, station IP `192.168.18.50`; setup AP inactive because station is connected. | pass |
| 2026-11-05 | LAN runtime | `node scripts/bench-check.mjs --host 192.168.18.50` | Same card/build/boot and installed project | Exact ID/build/boot match `/api/status` and `/api/firmware-info`; project installed, command/playback ready, power on, brightness 255. This does not prove physical LED output. | pass |
| 2026-11-05 | USB reconnect | Three separate COM6 opens with bounded read-only `hello` retries, then LAN status | Reliable same-card USB reconnect | All 3 succeeded on attempt 2 in ~2.1 s each; opening COM6 caused a new boot each time. Final LAN boot ID matched USB: `boot-c295f60a-40402bad4f7c`. | pass for machine route; Studio UI pending |
| 2026-11-05 | Public Studio | No-store `/studio-release.json` | Identify actual browser code | Live source revision `7e338a06290a937752c1e6c1ad1b73bb31cfd5c4`, Studio build 2385. Current local recovery UI change is not live. | pass for identity |
| 2026-11-05 | Card page | HTTP GET `http://192.168.18.50/` and DNS check for `lightweaver.local` | Locate actual card page | Card page returns HTTP 200 at IP; `lightweaver.local` fails DNS on the same Windows computer. | root cause confirmed |
| 2026-11-05 | Studio tab | Adrian copied the failing tab URL and error | Distinguish address failure from card protocol failure | Studio opened `http://lightweaver.local/?lwBridgeAttempt=3#studioBridge=1&bridgeUtility=1&studioOrigin=https%3A%2F%2Fled.mandalacodes.com`; Chrome showed `ERR_NAME_NOT_RESOLVED`. | fail for mDNS route |
| 2026-11-05 | Studio tab | Adrian replaced only `.local` hostname with verified `192.168.18.50` | Preserve bridge launch and connect exact card | Adrian observed the card page display and Studio show Connected. The card IP had just passed read-only bench check, 1.2.2/build 2320. | pass, owner-observed UI |
| 2026-11-05 | Local UI regression | Known-IP reconnect form in commissioning panel | Give a recoverable path when `.local` fails | Focused browser regression 1/1 passed; production build passed; rendered form screenshot inspected. PR416 shipped with Studio build 2389 and firmware build 2320 after independent live proof. | shipped |

## Human observations

Adrian reports that Studio recognizes a previously connected card, but reconnect through Find connected card stopped around 20–30%. He confirmed the second USB connector and moved the cable there. His phone did not show `Lightweaver-4040` before recovery. The recovered card is now in station mode, so the setup AP is not expected while saved Wi-Fi works. He later observed `ERR_NAME_NOT_RESOLVED` on a `lightweaver.local` Studio card tab. After changing only the hostname to `192.168.18.50`, he observed the card page and Studio Connected. The exact remembered-card ID that Studio showed before recovery remains unknown. Physical LED output has not been observed.

## Failure / Sprint handoff

- Observed versus expected: before recovery, the active image was not Lightweaver and installed 8 MB partition table could not fit the signed 16 MB Lightweaver app. Recovery restored runtime and saved Wi-Fi/project. Public Studio's reconnect tab used an unresolvable `.local` name even though the card served its page at a working LAN IP.
- Reproduction: open Studio, try to reconnect remembered card, select Find connected card; reported failure around 20–30%.
- Suspected ownership boundary: card firmware/layout and physical USB stub transfer; the optional Studio scan deadline also had a separate false-error path now fixed locally.
- Focused acceptance check: exact card API and USB match; Adrian observed the card page and Studio Connected using the verified IP. A local IP-entry recovery control passed its focused browser test and build. Physical playback remains unobserved.
- Workboard issue: current Bench entry.

## Single next step

PR416 has passed strict live proof at Studio build 2389 / firmware build 2320. Continue the 2026-11-06 remembered-card reconnect Sprint in the workboard. A future LED-output Bench session would need a separate owner observation.
