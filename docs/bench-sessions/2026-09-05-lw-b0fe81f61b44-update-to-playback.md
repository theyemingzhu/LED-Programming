# Bench session — update to playback

- Date: 2026-09-05, Asia/Makassar.
- Outcome: failed Studio handoff; diagnosis and repair plan completed, fixes pending.
- Card: `lw-b0fe81f61b44`; firmware 1.1.31 **build 1524**; boot `boot-44bdf529-b0fe81f61b44`.
- Routes independently agree: `http://lightweaver.local`, `http://192.168.18.70`.
- USB `/dev/cu.usbmodem14301` exists, no owner reported by lsof; its chip identity was not read or correlated. Serial opening/reset was unnecessary to establish the observed HTTP/UI contradiction and was not performed.
- Public Studio **build 1525**, revision `ef5e1ed966517b3f5b5259a1984c7be0872d7701`; browser and fetched marker agree.
- Project: empty ID, revision 0, empty fingerprint; zero outputs/pixels/looks; factory runtime; command/playback readiness false; current limit 100 mA default. No wiring was assumed from the old session.
- Wi-Fi: configured station, `192.168.18.70`, AP inactive, no pending transition/error. Password not retrieved.

## Evidence

Repeated read-only firmware-info/status responses agree on exact card/build/boot. [Redacted snapshot](2026-09-05-update-connection-evidence.json) records timestamp and fields. AP probe timed out. Initial Edge install step 3 promised automatic continuation and showed old firmware **1446 →1524**. Reconnect opened a reachable local bridge; no completed Studio acknowledgement was observed. That popup was closed during inspection, so that particular retry is not independent proof of timeout. The initial stuck state predates this action. Footer navigation later described setup-network state despite station API evidence.

`node scripts/bench-check.mjs --host 192.168.18.70` failed and wrongly advised reflashing because `projectId` was empty; the field exists and firmware is current. `/json/state` responded, which does not establish project playback readiness.

The previous 2026-08-25 session's configured project/LED count is no longer current: live factory-blank evidence invalidates resuming its visual observation step. Nothing was flashed, configured or erased in this session. Light behavior is unobserved.

## Repair handoff

See [prioritized findings, ownership and acceptance checks](../plans/2026-09-05-update-to-playback-repair.md). JOURNEY-01–10 are queued, not fixed or shipped.

## Single next step

Reproduce the production Edge commissioning acknowledgement failure with this exact blank station-card response and capture why the first connection attempt does not deliver status to `acknowledgeCommissionedCardFromStatus`, before implementing the Studio retry fix.
