# Compact strip inspector

Approved in task `01a0b278-5a39-7111-9b2d-fca3612f2b58` on 2026-09-18.

The operator approved inline values and units, quiet separation without Size or
Wiring headings, and no label-only rows. The division editor places its section
count beside the disclosure and shows editable LED counts without duplicate
number labels or a summary. Pitch, emission, first-light position and project
chipset now live in the selected-strip facts inside Specs. The chipset link opens
the existing project-wide wiring controls.

GPIO occupies its own row above Reverse data and Set first light. Flip path,
Reflection points and Split in two remain readable actions. The selected strip's
menu contains ordering, duplication and removal. Accessible field names,
neighbor balancing, validation, locking and keyboard dismissal are preserved.

Integrated with candidate `de885d4d`, including imported-artwork count calibration,
connected parent/child controls and sticky family headers. Imported strips retain
the Add split entry into that editor. No firmware, card command or data migration
was introduced by this redesign.

## Verification

- Focused regression witnessed red: Pitch remained among editable controls.
- Integrated library checkpoint: 2,548 tests passed.
- Final production build passed after UI corrections.
- Actual Studio screen inspected; [desktop evidence](desktop.png).
- Design detector and Git whitespace checks passed.
- Browser batch: 61 passed, 2 failed; both corrected cases then passed (2/2).
  The failures were the relocated picker active-state styling and a test still
  targeting the old GPIO selector instead of the connected-child override.
- Final production rebuild passed after the last active-state CSS correction.

Local implementation only. Production release is coordinated with task
`01a0b25c-cef7-79f0-adff-d84049fc8092`; this task did not deploy.
