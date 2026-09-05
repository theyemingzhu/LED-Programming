# Step four to Patterns — 2026-09-05

Card: lw-b0fe81f61b44, route192.168.18.70, firmware build1524.
Preview: http://127.0.0.1:9212/. Firmware flash is unnecessary.

## Reproduction
Open Patterns had already staged revision2 but still required a separate Start
light test below the setup ladder. Repeated Open Patterns assigned the same
hash and did nothing. The install button was disabled, misleadingly suggesting
connection was missing during the test.

## Machine observation
Activated staged candidate bf58bd46274f6163 using the browser. Card boot
boot-95b746b0-b0fe81f61b44 reported41LEDs, GPIO18, GRB, combo-aurora,
brightness115, approximately76FPS. Project revision2; fingerprint
4e164cfaafd1b8ac45ebbac6e81b64f44e164cfaafd1b8ac45ebbac6e81b64f4.
Visual observation was requested but not received during90-second probation.
Browser returned to temporary discovery setup after the automatic rollback.
No visual pass or permanent install is claimed.

## Single next step
After the repaired Open Patterns flow is ready, start it when Adrian can
observe the lights, confirm the visible result, then exercise a pattern change
and independently read it back from the same card.

## Repaired live handoff
One click on Open Patterns automatically staged and activated41LEDs on the
same card (activation955bc24d4fecdc19). API confirmed testing; confirmation
controls appeared inside phase4. No separate Start light test click was used.
An overlapping operation-end event left stale phase1 copy; the exact-status
refresh now runs for every settled hardware operation; the overlapping-operation regression passed.
Without visual confirmation the card restored its known-good setup; phase4
then correctly displayed Retry and removed the expired confirmation.
