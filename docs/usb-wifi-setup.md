# Fresh-install USB Wi-Fi setup

Studio keeps the computer on its normal network. The owner enters the target
network in the installer, installs the verified signed factory image, and uses
the same USB card to join Wi-Fi. A running card can supply nearby networks over
USB; a blank bootloader cannot scan before firmware is installed.

## Trust and recovery

- Factory installation remains an explicit destructive action. Configured-card
  preserving updates do not use this setup flow.
- Studio reopens the selected serial port and challenges the runtime. Card ID,
  firmware version, build identity and boot identity bind subsequent commands.
  A different card or release cannot receive the submitted credentials.
- USB proves the exact card's reported association. It does not grant network
  command authority. The existing local card page/bridge verifies the network
  handoff before Studio proceeds with card commands.
- Failed association keeps USB available for another attempt. An absent SSID,
  authentication failure, and an unknown timeout must remain distinct. An
  authentication failure is not proof that the owner typed a wrong password.
- The Lightweaver setup AP and `http://192.168.4.1` remain the fallback for older
  firmware, unavailable USB, or network problems.

## Credentials

SSID/password entry belongs only to temporary installer state and the USB
request. Never copy credentials into commissioning records, local/session
storage, project data, URLs, diagnostics, logs, release files, or public HTTP
requests. Clear the password after submission and clear temporary inputs when
leaving the installer. The card retains its existing dedicated Wi-Fi persistence
and proven-credential policy; project import cannot acquire credential authority.

## USB contract

At 115200 baud, newline-delimited JSON uses `protocol: lightweaver-usb-wifi`,
`version: 1`, a random request `id`, and `command: hello|scan|provision|status`.
Replies echo only the envelope and explicit response fields, never credentials.
Studio ignores boot chatter and unrelated request IDs.

`hello` returns card ID, boot ID, firmware version, build ID and build number.
Every later request supplies those same values as `expected*` fields. Firmware
refuses identity mismatch before scanning or credential mutation. Provisioning
is restricted to a fresh card without a proven network or installed project;
configured cards use their existing local setup and preserving-update paths.

`provision` supplies the SSID/password and explicit `clearPassword` for an open
network. The response binds its request ID to a Wi-Fi handoff generation.
`status` must match both that attempt and the runtime identity before Studio
accepts an associated station address. A retry isolates previous station events
before attributing a driver disconnect reason to the new attempt. USB never
acknowledges network handoff or grants a network owner capability.

## Required Bench proof — unperformed

Use an explicitly authorized blank/spare card and a signed release containing
this protocol. Do not erase a configured card merely to exercise this feature.
If factory recovery is requested, first record the recovery information required
by [the development workflow](development-workflow.md).

1. Keep the computer on normal Wi-Fi, enter the target SSID/password, install,
   and verify the selected card's identity and assigned station address over USB.
2. Complete the existing card-page/bridge handoff and verify that same card.
3. Try an absent SSID and rejected authentication separately. Record the reason
   actually reported; correct the form and retry without another factory flash.
4. Exercise unplug/replug, reset during join, and a different card. Stale boot or
   attempt responses must not advance setup or receive credentials.
5. Confirm AP fallback remains available during a failed join and the existing
   handoff acknowledgement/timeout policy still controls successful AP retirement.
6. Power-cycle the successfully configured card and verify saved-network reuse.

Browser mocks and a firmware compile do not satisfy these physical observations.
Release signing, semantic version bump, deployment and flashing are separate
release work and are not performed by this implementation checkpoint.
