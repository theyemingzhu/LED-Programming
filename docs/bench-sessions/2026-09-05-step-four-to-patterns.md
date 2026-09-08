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

## Final confirmation and real pattern playback repair

Adrian reported that he had already clicked “The lights look correct” for the
41-LED GPIO18 setup. Reproduced the rejection on the actual screen: background
card reconstruction replaced the open project during probation, prematurely
marked it installed, and invalidated the confirmation's project generation.
Both background adoption paths now exclude active installation/candidates, and
the unsaved-project check uses the live lifecycle's supported predicate.

Carried that existing owner confirmation through for the exact same card and
geometry: verified activation c199aa70f2ad0308 in testing, then confirmed that
activation. Card returned known-good, runtimePhase ready, playbackReady true,
provisionalSetup false, and no active probation. This is reuse of the owner's
reported observation, not a newly claimed visual hardware observation.

A separate Patterns bug canceled its delayed command whenever routine status
polling replaced an otherwise identical readiness envelope. Pattern commands
now survive same-card refreshes and still cancel when card authority changes.
The readout only claims “On the card now” after acknowledgement.

Actual browser clicks on Rainbow then Ocean were independently followed by
GET /api/status: currentPatternId rainbow then ocean, same card lw-b0fe81f61b44,
ready playback, brightness115 and measured26FPS. Inspected the actual screen:
Ocean selected,41LEDs, Connected, and “On the card now Ocean”.
An earlier chase snapshot while Ocean was sending was not reproduced; both
explicit final selections matched their exact IDs. No mapping change needed.

Resume: click any pattern in http://127.0.0.1:9212/#screen=pattern. The card is
permanently configured; no repeated installation or confirmation is needed
for live pattern changes. New physical color appearance remains owner-observed.
No firmware flash, production deployment, or new firmware release performed.

Final verification: realistic candidate-runtime regression witnessed failing
confirmation before the fix and passing afterward.9/9 installation browser
cases,4/4 focused Patterns cases,22 adoption/resume Node checks,2,262 full
library tests, and production build passed.
