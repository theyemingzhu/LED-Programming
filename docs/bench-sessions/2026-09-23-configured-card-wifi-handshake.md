# Lightweaver Bench session — configured-card Wi-Fi handshake

## Latest verified state — 2026-09-24

Gallery Wi-Fi is resolved. At approximately04:57 Windows time, the actual card
joined Pillaroflight at192.168.18.22 after correcting a one-character mismatch
between the card entry and the working Windows profile. No credential is recorded.
No firmware or router security change was required for that successful join.

Public Studio2109 then verified card`lw-301bd5a172e0`, firmware1.1.44/build2088,
through the gallery local-page bridge and advanced to Step2of3, Find and verify
the lights. Card reports no installed project, outputs, or count. Discovery
modal opened but no GPIO was selected. Physical light behavior remains untested.
Latest boot ID was not captured; re-correlate before the next card write.

The single resumption step is: restore remote browser control, select the intended
artwork/project in public Studio, and obtain its actual output/count before a
card project write. An asynchronous question for those missing physical details
is pending. Browser tab control currently returns`Debugger unattached`; native
Chrome screenshots work but coordinate actions return`noWindowsAvailable`.

All dated material below is historical and does not override this latest state.

## Session

- Date/time and timezone: 2026-09-23; initial card read 12:19 UTC (20:19 Asia/Makassar), fresh identity/status read 12:57 UTC (20:57 Asia/Makassar); record opened 13:55 UTC (21:55 Asia/Makassar). Exact times of intermediate Windows reads and Adrian's authorizations: unknown.
- Operator: Interstellar Bench operator via Chrome Remote Desktop, explicitly authorized by Adrian; Adrian provides physical observations. No operator action is attributed to this record until reported with evidence.
- Behavior under test: diagnose the configured card's gallery Wi-Fi handshake failure through one bounded temporary Windows 2.4 GHz WPA2 comparison, then recover setup access and resume the gallery connection.
- Outcome: **in progress**. The temporary WPA2 hotspot proved this exact card could associate and obtain an IP; the gallery join remains unresolved. No gallery, nonempty-project preservation, or LED acceptance has passed.

## Exact identity

- Card ID: **`lw-301bd5a172e0`**, recorded by the Interstellar operator's fresh 12:57 UTC read. Re-correlate at the moment of any card write.
- Firmware version: **1.1.42**, observed on the card at 12:19 UTC. Public signed release is 1.1.42; Studio is build **2071**.
- Firmware build: **2070**, observed on the card at 12:19 UTC.
- Boot ID: **`boot-dfacbb8f-301bd5a172e0`** after the Wi-Fi-only reset/reboot verification (exact timestamp unknown). Earlier 12:57 UTC boot was `boot-5291bca3-301bd5a172e0`; a guarded pre-reset write also used `boot-29f8f104`. Verify the latest boot again before any later write.
- Card route used: Windows WLAN connected to the card setup AP, with a separate wired route; exact card-local route and USB identity not copied into this record. Tailscale was separately present. A route is not identity.
- Project ID: empty in the 12:57 UTC read and the post-reset factory-runtime read; no nonempty project identity or preservation was proven.
- Project revision: unknown.
- Project fingerprint: empty in the 12:57 UTC read.

## Wiring and limits

Not queried for this Wi-Fi-only session. Output IDs, GPIO, pixel counts, chipset, color order, current limit, and direction remain **unknown**; no LED hardware pass is inferred.

| Output | GPIO | Pixel count | Chipset | Color order | Current limit | Expected direction |
| --- | ---: | ---: | --- | --- | --- | --- |
| unknown | unknown | unknown | unknown | unknown | unknown | unknown |

## Machine evidence

| Time | Surface | Action or query | Expected | Actual evidence | Result |
| --- | --- | --- | --- | --- | --- |
| 2026-09-23 12:19 UTC | Windows card API and user screenshot | Fresh card identity, firmware, station state, and join diagnosis; source summary in [workboard](../../LIGHTWEAVER_WORKBOARD.md) | Correlated current card with a station IP after valid join | Previously known card identity matched; firmware 1.1.42/build 2070, new boot, setup AP active, no station IP, attempt count 4/generation 2, latest `failureStage=association`, `failureReason=handshake_incomplete`, driver reason **15** (four-way security handshake timeout). Earlier screenshot's generic failure may describe a different retry than the latest status. Exact ID/boot value and raw artifact path are not recorded here. | **fail** for gallery join; identity detail incomplete |
| 2026-09-23 12:57 UTC | Interstellar Windows card API and browser form | Fresh exact identity/status before temporary test | Same intended card, preserved original gallery recovery input, and current join state | Card ID `lw-301bd5a172e0`, boot ID `boot-5291bca3-301bd5a172e0`, firmware build 2070, project ID/fingerprint empty; card WLAN/AP still in `joining`, latest driver reason **15**, attempt count **237**/generation **2**. Separate wired route remains available. Original gallery form is still populated with its password masked and untouched. No hotspot result yet. | **fail** for gallery join; pass for fresh identity and recovery-form presence |
| After 12:19 UTC; exact time unknown | Windows route diagnostics | Read-only Wi-Fi, wired, and Tailscale routing/adapter checks | Exclude a local route overlap as the reason for the card's association failure | Direct card-AP Wi-Fi, separate wired gateway, and Tailscale were seen without a route overlap explaining the card-level handshake. Earlier `netsh` target-not-seen result was invalid because Windows Location permission denied the query (exit 1). | inconclusive for root cause |
| After 12:19 UTC; exact time unknown | Windows saved-profile metadata and firmware configuration | Compare historical security metadata with compiled support | A confirmed live BSSID/cipher mismatch or another proven cause | Historical target profile says WPA3-Personal/GCMP-256; pinned ESP32-S3 SDK disables GCMP support while WPA3 SAE is enabled. Current target BSSID/cipher was **not** proven. This is a compatibility hypothesis, not a diagnosis. | inconclusive |
| After 12:19 UTC; exact time unknown | Windows WinRT hotspot metadata | Read-only suitability check | A temporary isolated 2.4 GHz WPA2 comparison path | Hotspot was **Off** and supports 2.4 GHz/WPA2 over the wired connection. No hotspot, router, firewall, Tailscale, or Ethernet setting was changed. | pass for test feasibility only |
| After 12:57 UTC; exact time unknown | Chrome Remote Desktop / card API / Windows hotspot | One bounded temporary 2.4 GHz WPA2 comparison on the identity-verified card | Same card associates and receives an IP, or provides a precise failure | Exact card `lw-301bd5a172e0` on the same test boot reached station association **and DHCP/IP** on the temporary WPA2 hotspot. The Windows hotspot was then switched **Off**; its saved configuration stayed unchanged. Temporary network name, credentials, and private IP are intentionally omitted. This proves capability on the temporary network, not the gallery root cause. | **pass for temporary WPA2 association and DHCP only** |
| After hotspot stop; exact time unknown | Card page / Windows Wi-Fi | Return to the original populated gallery form and setup AP | Original masked form remains available for restoring gallery credentials | Automatic navigation destroyed the original populated form. Card retained temporary Wi-Fi details, and its setup AP became intermittent after station loss. The planned form-based restoration path was **invalid**. | **fail for original-form restoration** |
| After hotspot stop; exact time unknown | Windows adapter / card API | Restore AP access without destructive card reset | Correlate exact card, preserve project state, and clear only the temporary Wi-Fi setting | A Wi-Fi-only Windows adapter toggle restored card-AP access. Operator guarded card `lw-301bd5a172e0`, boot `boot-29f8f104`, build 2070, then `POST /api/reset-wifi` returned `ok:true`. A later fresh read on boot `boot-dfacbb8f-301bd5a172e0` reported factory runtime, empty project, setup AP active, `configured=false`, empty SSID, `savedPasswordAvailable=false`, and attempts 0. This verifies the temporary card Wi-Fi configuration was cleared. The project was already empty; nonempty-project preservation was not exercised. Wired and Tailscale routes remained intact. | **pass for bounded Wi-Fi-only recovery; gallery join still pending** |
| After recovery; exact time unknown | Credential authorization boundary | Proposed reuse of an existing gallery credential | Only a specifically authorized, non-disclosing operation | Automatic approval review **rejected credential extraction before execution**. No credential was read, logged, or copied; no bypass was attempted. A specific user answer about reuse is pending. | blocked / pending user answer |
| Later reconnect session; exact time unknown | Studio USB inspection, Windows COM3, then card API | Find connected card and enter Step 3 without leaving the card in ROM loader | Card exits USB inspection before Wi-Fi verification; fresh exact-card evidence controls navigation | Studio initially showed firmware **Unknown** while the asynchronous scan was provisional and Step 3 remained locked; the card was held in USB install mode, so its AP disappeared. The existing **Restart card for Wi-Fi connection** helper performed a watchdog reset and serial disconnect. A fresh HTTP read then identified `lw-301bd5a172e0`, boot `boot-bf1a24d5-301bd5a172e0`, build 2070, setup AP active, `configured=false`, no SSID, and empty project. The card page again opened on its setup AP with the gallery network selected and password blank. No firmware, project, or credential write occurred; wired and Tailscale remained intact. | **pass for non-destructive USB/AP recovery; gallery join still pending** |
| Later Windows network comparison; exact time unknown | Windows saved Pillaroflight profile and Wi-Fi adapter | Temporarily prefer 2.4 GHz and connect the existing saved profile without reading/re-entering its key | Determine whether the gallery network is reachable as 2.4 GHz WPA2 from Windows, then restore the original route | Windows joined an actual **2.4 GHz channel 4, WPA2-Personal, Wi-Fi 4/802.11n** link using the already-saved profile. No gallery key was read or re-entered; the live cipher was not exposed by this evidence. The operator restored Intel Preferred Band to its original **1. No Preference**, rejoined the Lightweaver setup AP, and freshly confirmed the same exact card/boot `boot-bf1a24d5-301bd5a172e0`, build 2070, setup AP active, `configured=false`, empty SSID/project. The card page showed Pillaroflight selected with password blank. No card, project, firmware, or credential write occurred. | **pass for Windows 2.4 GHz/WPA2 availability and full route restoration; card gallery handshake remains unproven** |

The card setup page stops polling after about 67.5 seconds while firmware retries can continue; a visible timeout is not by itself a final card state. Adrian privately reported that Show password matched exactly and that router security settings are unavailable. The password itself and any hotspot credentials are not recorded. The valid nonempty password path has no trimming or case conversion; reason 15 alone does **not** establish a wrong password or router fault.

## Human observations

No physical card/LED observation has been returned for this bounded test. Adrian's password-match report is paraphrased in the available workboard, not available verbatim, so this table does not manufacture a quote or a hardware pass. Machine evidence confirms temporary association/DHCP and Wi-Fi-only reset, but not a gallery connection.

| Time | Known commanded state | One question asked | Adrian's observation | Expected | Result |
| --- | --- | --- | --- | --- | --- |
| pending | Exact card back on setup AP after Wi-Fi-only reset; gallery not configured | No new physical question asked; a specific credential-use answer is pending through the primary | pending | A specific observation tied to a freshly identified card/boot, if needed | pending |

## Failure / Sprint handoff

- Observed versus expected: on the gallery network, the card reported association-stage handshake incomplete / driver reason 15 and no station IP; the same card associated and received an IP on the temporary 2.4 GHz WPA2 hotspot. The gallery cause is unknown. Automatic navigation then removed the preserved gallery form, requiring bounded Wi-Fi-only reset before the gallery could be retried.
- The later Studio reconnect journey exposed two software authority faults: Step 3 could open before USB inspection released the card, and an old station address from the temporary hotspot could be reused after a route remount. The focused Studio fix awaits the USB watchdog release, guards a pending Find action, and requires fresh exact-card status before navigation. This is source/test evidence only; it does not establish a gallery join on the physical card.
- Reproduction: configured card attempts the saved gallery network and automatically retries; the fresh 12:19 UTC status captured attempt 4/generation 2. Exact preceding submission and event timing: unknown.
- Evidence links: [active workboard diagnosis](../../LIGHTWEAVER_WORKBOARD.md); 12:19 UTC screenshot/raw read and later operator log paths unknown in this record. Exact hotspot and reset responses are summarized above without secrets or private IPs.
- Suspected ownership boundary: gallery AP security/cipher compatibility **or** another station-handshake factor; historical WPA3/GCMP profile metadata is only a hypothesis. The known firmware diagnostic behavior is shipped in 1.1.42/build 2070.
- Windows successfully joined the saved gallery profile on 2.4 GHz/channel 4 with WPA2-Personal without credential disclosure. This rules out a 5 GHz-only network and weakens historical WPA3/GCMP profile metadata as a current explanation, but it does not show the live cipher or explain the ESP32's reason-15 handshake failure.
- Focused acceptance check: after the pending specific credential-use answer, re-correlate the exact card/boot, retry the gallery network through an authorized preserving route, and verify station association, DHCP/IP, durable setup access, and project state. The completed temporary-hotspot comparison diagnoses capability only; it does not prove the gallery root cause or nonempty-project/LED preservation.
- Workboard issue: `2026-09-23 Live Wi-Fi handshake diagnosis (Bench, active)`; only the primary agent edits that board.

## Authorization and boundaries

Adrian explicitly authorized the Interstellar operator to control the Windows machine through Chrome Remote Desktop and the bounded temporary Windows 2.4 GHz WPA2 hotspot test, contingent on fresh card identity. The original gallery form was populated and masked before the test but was lost on automatic navigation. The hotspot test was stopped; the exact card's temporary Wi-Fi settings were then cleared by the source-confirmed Wi-Fi-only reset and verified on a new boot. That endpoint clears Wi-Fi settings, not the project; the card's project was empty both before and after. No factory flash/erase, router security change, firewall change, Tailscale change, or Ethernet change occurred. Credential extraction was rejected by automatic approval review before execution; no secret was read and no bypass is authorized. The specific user answer for gallery credential reuse is pending.

## Single next step

See the single resumption step in Latest verified state above. The following
release and connection observations are retained as historical evidence only.

Latest actual result: Studio2095 at72320ad8 was deployed via existing manual
workflow35954781268, preserving signed2088 firmware unchanged. Root used the
public Check running firmware over USB action and paired COM3. Exact-card ROM
inspection/reset path reached runtime hello, which timed out under its old3s
single-request limit. Card build remains UNKNOWN. No firmware/credential resend,
erase, BOOT press, shell or private endpoint was used. Bounded recovery-only
same-port hello retry809c5e69 passed18unit/7browser/build, root reviewed, and is
being integrated for immediate manual deploy under Adrian's explicit request to
do the real setup first and broader proof afterward. Broader CI remains failed
on a separate ambiguous test selector until its focused correction is integrated.

2026-09-24 about03:20–03:22UTC: public Studio2089 exposed the verified preserving
update after the normal paired COM3 chooser and completed signed identity scan
for lw-301bd5a172e0, ESP32-S3 16MB, active1.1.42/build2070. Root confirmed that
browser-read ID, then started signed1.1.44/build2088 preserving update. The UI
reported100% and2.18MB/2.18MB acknowledged, followed by
`Invalid head of packet (0x45): Possible serial noise or corruption`.
Current installed firmware/boot is UNKNOWN after this write attempt. No success,
data readback, gallery Wi-Fi, project transfer or light output is inferred. No
factory erase or blind repeat was performed. USB safety owner is investigating
the readback/reset sequence and public Studio recovery path; preserve current UI.

2026-09-24 continuation: a fresh Chrome Remote Desktop screenshot still shows
Studio2081, Not connected, and interrupted Install Step2. The card window's
“Connection active” label is static and is not connection evidence. No card
mutation was performed in this observation. Current user boundaries supersede
earlier diagnostic access above: enter only through led.mandalacodes.com; no
remote shells, direct API diagnostics, owner login, or physical button presses.
Credential extraction remains prohibited without specific authorization. The
intended artwork and verified wiring remain requested but unanswered.
