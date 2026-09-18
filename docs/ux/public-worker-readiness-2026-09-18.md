# Public worker readiness — 2026-09-18

## Scope

This is a scoped Sprint audit of `https://led.mandalacodes.com` for a worker who receives only the public URL. It covers fresh browser entry, artwork/layout creation, count calibration, connected-section splitting, pattern choice, browser saving, reload/reopen, and the supported local-card handoff. It does not claim physical LED or card proof.

## Production observed before this candidate

- Fresh storage opened the disconnected Card screen at `#screen=card&section=setup` without a clear design starting point.
- Layout already supported SVG import and shape starters, but the fresh entry screen did not explain the required inputs or the difference between browser and online storage.
- The Projects panel correctly separated **On this device** from **Online project library**. The public library session endpoint redirected to Cloudflare Access (HTTP 302), so an unauthenticated worker cannot retrieve a private team project.
- `/studio-release.json` returned HTTP 200 with `Cache-Control: no-store`, Studio build **1913**, source revision `4449b01bb4782c35a006b1f873174730a148fe09`.
- `/firmware/release-manifest.json` described firmware **1.1.38**, firmware build **1912**, source revision `ca19bc5c27ca7fb3832ad9a7732e3fe4488297ed`.
- The manifest's factory image, app image, update ticket, and update signature each returned HTTP 200 from their immutable public URLs.

## Candidate behavior

- A fresh workspace now opens with three explicit paths: **Start a layout**, **Open saved work**, and **Set up a card**.
- The entry copy says that no Lightweaver project or developer setup is required, that an artwork SVG is required only for artwork-based pieces, and that a shape can be used otherwise.
- Storage copy identifies browser saves as device-local, identifies the online library as the path for an assigned team project, and recommends export when work must move devices.
- Layout start copy tells the worker to enter the real LED count before using the drawing as the installation scale, then divide the route into named connected sections.
- Mixed-content recovery no longer tells a public worker to open Studio from `localhost`; it directs them through the supported card-page bridge.
- Browser-library save verification now compares the normalized JSON representation that local storage actually returns. Optional `undefined` properties can no longer make a valid save report `browser-readback-failed`.

## Automated journey evidence

The candidate passes one visible worker journey in a fresh Chromium context:

1. Open the public-style Studio entry with empty local storage.
2. Choose **Start a layout**.
3. Import an inline SVG artwork and convert its path to a strip.
4. Set the real total to 60 LEDs.
5. Add a connected split and verify two 30-LED sections.
6. Rename the project, choose the Ocean pattern, and save the look.
7. Save to the browser library and verify the stored project has one family, two sections, and one saved look.
8. Reload, verify **Saved in browser**, reopen the saved project, return to Layout, and verify the two 30-LED sections.

The same fresh entry is covered at 390 × 844 phone size. Focused layout, split, and onboarding coverage passes 9/9 tests. The project-storage unit suite passes 42/42 tests, including the JSON readback regression.

## Required inputs and remaining gates

- Real artwork cannot be invented. An artwork-based job still requires its SVG, a portable Lightweaver project backup, or authorized access to an assigned team project. The public site now states these choices instead of implying that private artwork is bundled.
- Team projects remain protected by Cloudflare Access. No account or private project was created or exposed during this audit.
- A physical card is required to prove Wi-Fi/USB commissioning, local card-page bridging, LED output, wiring, and visual pattern correctness. This Sprint used no card commands and flashed no hardware.
- The candidate is not deployed. Production continues to serve Studio build 1913 until the primary release workflow integrates and proves a later build.
