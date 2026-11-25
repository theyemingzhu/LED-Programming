# Lightweaver board pin map and output capacity

The reference platform is ESP32-S3-DevKitC-1 N16R8, with 16 MB flash and 8 MB octal PSRAM. Confirm the PCB revision, module marking, and any attached board wiring before qualifying a new profile. The bench card identifies as `lw-40402bad4f7c` and runs 1.2.8 build 2925. Its earlier USB session identified a CH340 bridge, so Espressif's reference schematic alone cannot identify the exact PCB or onboard RGB connection. [Espressif board guide](https://docs.espressif.com/projects/esp-dev-kits/en/latest/esp32s3/esp32-s3-devkitc-1/user_guide_v1.1.html) · [Bench evidence](../bench-sessions/2026-11-05-lw-40402bad4f7c-usb-wifi-reconnect.md)

## Pin roles

| Pin | Role on the current target | LED data eligibility |
|---|---|---|
| 0 | BOOT strap and dial press in the current setup | Reserve for boot |
| 1 | Exposed GPIO, brightness analog input is off on the bench card | Candidate for qualification |
| 2 | Status output, driven early during boot before project controls load | Reserve until boot and status paths both release it |
| 3 | JTAG selection strap sampled at reset | Reserve for boot |
| 4, 5, 6, 7 | Dial A, dial B, alternate dial press, previous button | Firmware supports LED data on each when its control is reassigned or disabled |
| 8, 9 | Next and blackout buttons | Candidates for qualification when their controls are reassigned or disabled |
| 10 | microSD chip select (CS) | Reserved by Lightweaver's current microSD wiring |
| 11 | microSD controller out (MOSI) | Reserved by Lightweaver's current microSD wiring |
| 12 | microSD clock (SCK) | Reserved by Lightweaver's current microSD wiring |
| 13 | microSD controller in (MISO) | Reserved by Lightweaver's current microSD wiring |
| 14 | Exposed GPIO, no current Lightweaver assignment | Candidate for qualification |
| 15, 16 | Configured LED data on the bench card | Supported, assigned |
| 17, 18, 21 | Exposed and unassigned on the bench card | Supported, available for remapping |
| 19, 20 | Native USB D− and D+, used for flashing and recovery | Reserved for USB |
| 22–25 | Absent from the ESP32-S3 GPIO numbering | Unavailable |
| 26–34 | Flash/PSRAM bus on the target, absent from the DevKitC-1 headers | Unavailable |
| 35, 36, 37 | Header pins used internally by octal PSRAM on N16R8 | Unavailable for external use |
| 38 | Configured LED data, onboard RGB on Espressif v1.1 | Supported, assigned. Onboard light may share the signal |
| 39, 40, 41, 42 | External JTAG signals MTCK, MTDO, MTDI and MTMS. 41 is configured LED data | Supported when external pin-based JTAG is unused. 39, 40 and 42 are unassigned |
| 43, 44 | UART0 TX and RX wired to the reference board's USB-to-UART bridge | Reserve for serial logs, flashing and recovery |
| 45, 46 | Flash supply voltage and boot/logging straps respectively | Reserve for boot |
| 47 | Exposed and unassigned on the bench card | Supported, available for remapping |
| 48 | Onboard RGB on Espressif v1.0 | Supported, unassigned. Onboard light may share the signal |
| 3V3, 5V, G, RST | Power, ground and reset header positions | Dedicated board connections |

[ESP32-S3 datasheet](https://documentation.espressif.com/esp32-s3_datasheet_en.pdf) · [ESP32-S3 GPIO restrictions](https://docs.espressif.com/projects/esp-idf/en/stable/esp32s3/api-reference/peripherals/gpio.html) · [Reference schematic](https://dl.espressif.com/dl/schematics/SCH_ESP32-S3-DevKitC-1_V1.1_20220413.pdf) · [Lightweaver microSD assignments](../../firmware/lightweaver-controller/platformio.ini#L32) · [Lightweaver hardware contract](../../packages/lightweaver-contract/card-hardware.json)

With the live controls in their current assignments, 12 pins in the current LED contract are eligible. Four are assigned and eight are available destinations for a rewire. A free pin and a free output slot are separate properties. GPIOs 10–13 stay reserved even with an empty SD slot because firmware initializes the bus at startup. A future SD-free or alternate-SD profile would require explicit board and firmware support.

## Implementation and acceptance

1. **Put the roles on the connector drawing.** Keep the two header rows in physical order and attach a short role to each position. Display LED data, SD signal, control, USB, UART, boot, memory, power and ground at the pins. Mark assigned outputs and show the current control assignments wherever card data is available. Label defaults where only the nominal profile is known. Show the onboard RGB and external JTAG sharing on the relevant positions.
2. **Use one versioned board definition.** Extend the existing hardware contract to carry board/module identity, header position, LED and control eligibility, fixed assignments and shared uses. Generate firmware pin tables and use the same facts in Studio, discovery, install validation and the wiring guide. Merge live output and control ownership separately. A supported pin already owned by a control is unavailable until that control is moved. Older cards retain their existing capabilities.
3. **Measure how many lines can play together.** Start with a four-output baseline, then five and eight lines with unequal lengths and distinguishable output patterns. Include a 600-LED line and validate GPIO 1 and 14 separately. Record sustained frame rate, frame gaps, visible corruption, Wi-Fi control, microSD playback and cold boot with the same wiring. Check USB recovery and whether the onboard LED shares the signal. The ESP32-S3 has four simultaneous RMT transmitters. FastLED's legacy RMT driver can queue more outputs. If the queue misses the chosen performance target, compare the LCD parallel backend, including its memory use and any extra GPIO requirements. Publish only the measured envelopes by driver, chipset and target frame rate. [Espressif peripheral capabilities](https://raw.githubusercontent.com/espressif/esp-idf/v4.4.7/components/soc/esp32s3/include/soc/soc_caps.h) · [FastLED RMT queue](https://github.com/FastLED/FastLED/blob/3.10.3/src/platforms/esp/32/rmt_4/idf4_rmt.h)
4. **Carry the measured capacity through the workflow.** Add or move an output in Studio without losing artwork or pattern assignments. Explain each pin conflict and show configured LED counts, playback budget and power limits separately. A provisional 256-LED discovery allocation can grow through Light more. Test exact pin/count readback, rewire confirmation and rollback, offline restart, recording compatibility, and install payload size. Version the recording topology when it grows beyond the current four entries. [Discovery allocation](../../lightweaver/src/lib/benchConfig.js#L56) · [Sequence topology](../../firmware/lightweaver-controller/src/LightweaverSequencePlayback.h#L13)

First acceptance is a photographed or observed five-output bench run with one line above 256 LEDs, correct distinct signals on all five pins, and exact readback after reboot. Use the bench results to set the supported output count and display a realistic frame-rate budget in Studio.

## Board profile editor and detection

Espressif already publishes a Board Manager catalog with machine-readable board, device and peripheral YAML. Its web editor can create those files. Use that data to prefill drafts where available, then fill in connector order, module variant, PCB revision and Lightweaver's installation wiring from the manufacturer's pinout and schematic. For example, the DevKitC-1 has no onboard SD wiring in the catalog, while the ESP32-S3-USB-OTG board has SDMMC. A PlatformIO board ID is also useful for build settings, but the current generic DevKitC-1 ID defaults to N8 with no PSRAM and Lightweaver overlays N16R8 settings. [Espressif Boards Catalog](https://docs.espressif.com/projects/esp-board-manager/en/latest/references/boards/index.html) · [Board YAML format](https://docs.espressif.com/projects/esp-board-manager/en/latest/programming-guide/board-directory.html) · [Espressif web editor](https://docs.espressif.com/projects/esp-adf/en/latest/tools/esp-board-manager-tool.html) · [PlatformIO DevKitC-1 defaults](https://docs.platformio.org/en/latest/boards/espressif32/esp32-s3-devkitc-1.html)

Espressif's DevKitC-1 peripheral YAML explicitly omits reset and the USB interfaces. The USB-OTG YAML also omits certain pins handled by the chip or by other hardware. An importer must treat omissions as unknown and use the board schematic and chip rules to verify availability. [DevKitC-1 peripheral source](https://raw.githubusercontent.com/espressif/esp-board-manager/main/esp_boards/esp32_s3_devkitc_1/board_peripherals.yaml) · [USB-OTG peripheral source](https://raw.githubusercontent.com/espressif/esp-board-manager/main/esp_boards/esp32_s3_usb_otg/board_peripherals.yaml)

Build the first editor around **Duplicate board profile**. Select a chip and module, enter the board/revision and source links, lay out the headers, and mark on-board peripherals, shared pins, and the installation's own wiring with the same drawing used in Studio. Store a stable profile ID and revision. Validate the draft against chip/module restrictions, conflicting pin claims, and the firmware target's capabilities. Drafts are useful as wiring references. Applying a profile to a live card requires a compatible firmware target and verified output mapping. Flash, PSRAM and recovery pin protections stay enforced by firmware. An SD bus move requires a firmware target that can initialize the new bus wiring.

**Detect board** should combine evidence and present the best matches. A running Lightweaver card can advertise its firmware target, profile ID/revision, chip, detected flash/PSRAM, and live assignments. On an unprovisioned board, the existing USB installer can identify the chip and use a read-only flash ID to check size. USB VID/PID can identify the native interface or bridge, and a card ID can retrieve a previously confirmed profile. Those signals cannot read PCB traces or distinguish two boards with the same chip and memory. If revision or wiring is ambiguous, show the evidence and ask the user to confirm the printed board/module label against the candidate pin map once. Save that choice per card. Avoid toggling unknown pins as a detection method. Bench probing starts only on an output allowed by a confirmed compatible profile. [Espressif serial detection](https://docs.espressif.com/projects/esptool/en/latest/esp32s3/advanced-topics/serial-protocol.html) · [Read flash ID](https://docs.espressif.com/projects/esptool/en/latest/esp32s3/esptool/basic-commands.html#read-spi-flash-id-flash-id)

Start with DevKitC-1 N16R8 profiles for v1.0 and v1.1 to verify that the same chip and memory produce an ambiguous match yet different onboard RGB pin labels. Add the ESP32-S3-USB-OTG as a documentation-backed draft to prove the editor and drawing can express a different SD interface and connector layout. Treat running Lightweaver on it as a separate hardware target qualification.

## Local implementation and qualification

Studio can author eight outputs and checks the card's advertised limit and pin list before writing. Use the Board Manager in **Card → Setup → Board Manager** to view, duplicate or create a profile, or import/export the versioned JSON. A profile confirmed for an exact card supplies the connector map to Wiring and discovery. Existing card firmware keeps its four-output limit.

The browser simulator exercises five outputs including a 600-LED line, wiring confirmation, exact readback after reboot, offline startup, and a rejected rewire restoring the previous map. Recording and portable restore exercise LWSEQ topology v2 with five outputs. Four-output and smaller files still use the original header encoding.

The opt-in PlatformIO environment `esp32-s3-n16r8-output-bench` compiles with eight output slots on the existing approved GPIO list. Build it with `pio run -e esp32-s3-n16r8-output-bench` from `firmware/lightweaver-controller`. It keeps the same install format and reports its experimental output capacity and topology version. The standard environment still advertises four output slots. Verified physical frame-rate envelopes, extra GPIO candidates and other board firmware targets require their own bench measurements.

## Adapting a reference to the board in your hand

In Board Manager, choose the closest connector layout and module, then select **Use as starting point**. Name the copy for the supplier and PCB revision, and add its schematic or pinout to the sources. Select a contact in the drawing to edit its printed label, GPIO, board role, and planned Lightweaver function. Use the swap handle only when the source shows that two connector positions have exchanged assignments. Use **Add pin group** when the connector layout itself differs, and **Start blank** when a reference would carry over too many wrong positions. Keep any unverified contacts **Unresolved**.

Separate identifying the PCB from choosing installation functions. The GPIOs listed on the module describe the chip’s exposed signals. The exact PCB schematic identifies which of those signals reach a header or an onboard device. Espressif’s YAML can supply peripheral assignments, while omitted contacts still need the schematic. A saved Studio copy records the wiring reference. Assign a live LED output separately in Wiring using pins supported by the connected firmware. Changing a fixed peripheral bus, such as microSD, requires firmware built for that wiring. [Espressif board configuration tool](https://docs.espressif.com/projects/esp-adf/en/latest/tools/esp-board-manager-tool.html) · [DevKitC-1 revision and module guide](https://docs.espressif.com/projects/esp-dev-kits/en/latest/esp32s3/esp32-s3-devkitc-1/user_guide_v1.1.html)

## Operator workflow master plan

| Operator action | Where it happens | What Lightweaver carries forward |
|---|---|---|
| **Find my board** | Board Manager reads the connected card and shows the closest model and revision choices. | Exact card ID, explicitly reported profile if present, chip, flash and PSRAM evidence. A unique match from shared specs is a suggestion. If multiple revisions fit, show the physical difference to look for and ask once. |
| **Fix the map** | Choose a reference, open a pin on the graphic, and edit its GPIO or function. Use the move/swap controls only for connector position corrections. | The reference stays reusable. The draft keeps its source links, physical position, board role and planned installation function. Unresolved pins stay visibly unavailable until checked. |
| **Save and use it** | Save the revised profile, confirm it for the card, and open Wiring. | The exact card and saved revision select the same map in the Board Manager, Wiring, and discovery. A later revision requires a fresh confirmation. Profiles are portable as Lightweaver JSON. |
| **Set up the lights** | Choose a supported data GPIO, move a named output if needed, and count or edit that strip’s LEDs. | Preserve the output’s artwork and patterns. Check firmware pin/output/pixel capability, connector roles and controls. Verify the changed mapping and LED count after restart, with rollback on a failed wiring test. |

The operator starts with one main action in each screen. Use short plain-English labels and keep the pin number, its purpose, and its state together. Test the phone flow with a known card, indistinguishable revisions, a supplier variant, a claimed GPIO, and a strip above 256 LEDs. The standard firmware’s four-output capacity and the eight-output bench build are distinct. Physical signal quality and refresh limits are qualified on the actual board.

The vendor catalog remains an input to supported templates. Check the physical connector numbering and board revisions against primary schematics before adding templates, and keep documented templates separate from Lightweaver firmware compatibility. [Espressif Boards Catalog](https://docs.espressif.com/projects/esp-board-manager/en/latest/references/boards/index.html) · [Espressif board adaptation](https://docs.espressif.com/projects/esp-board-manager/en/latest/create-board/copy-existing.html)
