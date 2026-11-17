# November 17 single-strip storage and tuning check

The storage fix is parked as `reclaim-idle-nvs-before-project-save`. It applies
after `relative-look-tuning-default-boot`, which provides the runtime tuning
and startup behavior tested on the bench.

## Offline verification

The USB diagnostic reported `ESP_ERR_NVS_NOT_ENOUGH_SPACE` (`0x1105`) from
`nvs_set_str` on the canonical project key. The 3,009-byte install needed 96
contiguous entries and the active page had 95 available after compaction.
The ESP-IDF v4.4.7 host replay of the captured NVS state reproduced the failure
and verified that the old project remained byte-identical.

Reclaiming the explicitly idle wiring marker let the unchanged fixture save
and read back byte for byte. Offline checks covered a simulated interruption
before canonical write, active or unreadable transaction state, and a larger
write that still exceeded the available contiguous space. The old project and
Wi-Fi values survived the failure cases. The wiring promotion power-loss test
covers the guarded reclamation and existing save ordering. No format or
partition changes are needed. Other page layouts can still reject a large save.

## Card readback

- Pinned development app SHA-256
  `d28929409d9ee5406faa87ae7727d268ce81f13de1447b7f2c54e075e0680397`.
- Unchanged 3,009-byte fixture SHA-256
  `9a22b37ebf07cea35b9772b82aa852865cc611e01743792e84c01ed751b7b372`.
- On the existing 41-LED strip, the device saved that exact fixture and
  reported the expected five section patterns for A, B and C.
- Saving A at 75% brightness, 0.8× speed and hue offset +20 left the authored
  section settings intact. The driver brightness readback moved from 166 to 124.
- Restarting from B selected A under a new boot ID and returned the saved
  tuning revision and brightness 124.
- The operator restored the original signed firmware and project. USB verified
  both restore ranges, and two card reads agreed on the original project and
  zone state.

The evidence establishes card commands, state and restoration for one physical
output. Observer confirmation of the visible patterns remained pending when
the bench report was recorded.
