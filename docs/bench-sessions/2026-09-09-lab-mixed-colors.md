# Lab mixed-color Bench — 2026-09-09

Target: lw-b0fe81f61b44, 192.168.18.70, firmware1548,
boot-deccfe4b-b0fe81f61b44 (API verified 14:37 UTC).
Studio: stable isolated preview http://127.0.0.1:4173/#screen=pattern-lab.
No flash required; serial inspection not needed for browser color reproduction.

Adrian explicitly confirmed held pure red, green, and blue. Mixed-color accuracy
remains unproven. These primary observations do not support a channel permutation.

At 14:37:32 UTC set color1 #ffff00 through the visible color well; journey holds
at0s, Live remains on. Worker firstRGB116,116,0; sent747400 with buffer0;
picker→WebSocket send14.7ms. This measures browser send, not LED display latency.
API: external/wled-realtime, brightness15/255, gammaoff, calibration1/1/1,
FPS92, ditheringfalse. Earlier FPS95–113 crossed the firmware dither threshold;
low-brightness mixed-color/flicker remains a hypothesis, not a diagnosis.
Original owner swatch before primary diagnostics: #ff6600; restore after tests.

Adrian reports: “The yellow looks a little bit greenish.” Held yellow therefore
fails visual match despite equal R/G browser frame; ongoing fade cannot explain
this settled test. All three primary tests passed.

Online primary sources: FastLED Color Correction wiki documents strip-specific
channel balance; FastLED Temporal Dithering wiki documents low-brightness
precision and possible flicker. Source main.cpp uses TypicalLEDStrip correction
and switches dithering at100FPS; API calibration1/1/1 does not mean no built-in
FastLED correction. No correction changes made.

Outcome: mixed-yellow visual mismatch confirmed, cause unproven.
Single next step: compare the same held yellow at a modestly higher, reversible
master brightness while preserving original15/255, then obtain one observation.


## Calibration attempt after owner “go”
Owner authorizes gentle card green correction, selected yellow and brightness
unchanged. No mutation performed. Installed firmware1548 has no calibration-only
live endpoint; /api/config replaces the whole runtime configuration and requests
restart. /api/projects/list returns owner capability rejected; /api/status shows
empty projectHead, legacy internal-flash project lightweaver-bench-discovery-v1,
revision0,41px. Thus project repository cannot be assumed to contain a recoverable
copy of the installed legacy runtime. Do not synthesize a replacement from status.
Previous brightness test is superseded by owner choosing color-balance adjustment.
Implemented a Studio-only Match my strip control. It starts neutral, never
mutates recipe or card configuration, applies equally to the canvas and streamed
pixels, and resets to neutral. Unit4/4, focused browser1/1, production build pass.
Manager worker: gpt-5.6-luna medium, chosen per owner request to conserve tokens.

At 15:01:06 UTC enabled a subtle green90%, red/blue100% audition while the
recipe remains held pure yellow #ffff00. Outgoing first pixel changed from747400
to746800 with WebSocket buffer0. Original card brightness remains15/255; no card
configuration write or firmware change occurred.

Outcome: pending human observation.
Single next step: ask whether this adjusted yellow looks correct, still greenish,
or too orange. Do not move the slider until Adrian answers.

Adrian reports green90% is much closer but still a little green. At 15:04:45 UTC
moved only the reversible green preview to85%; source remains #ffff00. Outgoing
first pixel746300, WebSocket buffer0. No card configuration write occurred.

Single next step: ask whether green85% looks correct, still greenish, or too
orange. Do not move the slider until Adrian answers.

Adrian reports green85% is still green. At 15:26:18 UTC changed only the
temporary green gain to75%; source remains #ffff00. Outgoing first pixel745700,
WebSocket buffer0. No card configuration write occurred.

Single next step: ask whether green75% looks correct, still greenish, or too
orange. Do not move the slider until Adrian answers.

Adrian reports the green75% strip resembles the three-color bar, but both still
look greener than the yellow he intends. This indicates the remaining mismatch
is the chosen digital hue, while the strip-to-screen match is relatively close.
At15:27:32 UTC changed only source color1 to warm yellow #ffd000, retained the
75% green audition and0s hold. Worker firstRGB116,94,0; outgoing first pixel
744700, WebSocket buffer0. No card configuration write occurred.

Single next step: ask whether #ffd000 with green75% is the natural yellow Adrian
means, too green, or too orange. Do not change it until he answers.

Adrian reports warm #ffd000 at green75% remains slightly green and requests three
percent less green. At15:30:31 UTC set temporary green gain72%; source remains
#ffd000. Outgoing first pixel744400, WebSocket buffer0. No card configuration
write occurred.

Single next step: ask whether green72% looks correct, still greenish, or too
orange. Do not move the slider until Adrian answers.

Adrian requests still less green. At15:33:12 UTC set temporary green gain69%;
source remains #ffd000. Outgoing first pixel744100, WebSocket buffer0. No card
configuration write occurred.

Single next step: ask whether green69% looks right. Do not move the slider until
Adrian answers.

Adrian requests less green again. At15:33:47 UTC set temporary green gain66%;
source remains #ffd000. Outgoing first pixel743e00, WebSocket buffer0.

Single next step: ask whether green66% looks right. Do not move the slider until
Adrian answers.

At Adrian's requested value, set temporary green gain62% at15:34:35 UTC; source
remains #ffd000. Outgoing first pixel743a00, WebSocket buffer0.

Single next step: ask whether green62% looks right. Do not move the slider until
Adrian answers.

Adrian reports the physical strip is a good yellow at green62%; the canvas had
become too amber because the hardware correction was also applied visually.
Removed that visual application: canvas now renders source color while only the
outgoing LED frame is corrected. Focused unit4/4, browser1/1, production build
pass; green62% stayed active through HMR.

At15:38:35 UTC began global-balance validation with source #ffffff at0s and
green62%. Worker firstRGB116,116,116; outgoing first pixel744874, buffer0.

Outcome: yellow physical match passed; global correction still unproven.
Single next step: ask whether white appears neutral, greenish, or pink/purple.

Adrian reports white remains a little blue at green62% / blue90%. At00:04:39
Asia/Makassar on2026-09-10, set temporary blue gain85%; green remains62%, source
remains #ffffff. Outgoing first pixel744863, WebSocket buffer0.

Single next step: ask whether blue85% makes white neutral, still blue, or too
warm/pink. Do not move the slider until Adrian answers.

On resumption2026-09-10, Adrian reports white still too blue. Browser inspection
then found the recovered Lab had reset the nonpersistent strip match to neutral
and resumed the journey, so that latest observation cannot be assigned to the
85% audition with confidence. Re-established a valid held-white state: selected
color1 at0s, green62%, blue75%, source #ffffff. At12:02:28 Asia/Makassar the
worker produced116,116,116 and outgoing first pixel744857, WebSocket buffer0.

Single next step: obtain a fresh judgment of held white at green62% / blue75%.

Adrian reports white at green62% / blue100% is slightly blue tinted. Added a
second temporary Blue control; physical stream only, red fixed100%, canvas and
recipe unchanged. Unit4/4, focused browser1/1, production build pass.
At15:40:43 UTC set blue90%; green remains62%, source remains #ffffff. Outgoing
first pixel744868, WebSocket buffer0. No card configuration write occurred.

Single next step: ask whether white now appears neutral, blue, or pink/warm.

Adrian reports the valid held-white test at green62% / blue75% is still too
blue. Current FastLED and CIE research confirms that equal RGB is a digital
source white, not a guaranteed neutral physical white: TypicalLEDStrip is only
an empirical 255:176:240 starting point, WS2812B emitter ratios vary by part and
batch, and a white target must name a viewing condition. For this installation
the working target is a neutral gallery white around4500-5000K rather than the
browser's D65 daylight white around6500K. Community evidence also supports
calibrating each strip with its diffuser in place and using RGBW when accurate
white becomes a hardware requirement.

At13:49 Asia/Makassar on2026-09-10, changed only the temporary physical blue
gain to65%; green remains62%, red100%, source #ffffff held at0s. The outgoing
trace settled at first pixel74484B with WebSocket buffer0. The canvas and recipe
remain unmodified and no card configuration write occurred.

Single next step: judge whether green62% / blue65% reads neutral, still blue, or
too warm/pink. Do not move another control until Adrian answers.

Adrian reports green62% / blue65% looks pretty good and asks to use the same
profile across the creative surfaces. Promoted it from a temporary Lab state to
a persistent Studio strip profile in browser storage. Pattern Lab streamed card
frames and the shared creative WLED/USB frame path now read the same profile at
send time; canvases, recipes, wiring/count probes, Kaleidoscope calibration, and
production tests remain unmodified. The profile survived a fresh Pattern Lab
page load. Unit6/6, focused Chromium1/1, production build pass.

The ESP32-native Patterns path sends pattern controls rather than RGB frames and
therefore still uses the card's stored calibration, currently1/1/1. This card's
installed legacy project `lightweaver-bench-discovery-v1` has no matching Studio
project loaded, so no full configuration replacement or card write was made.

Single next step: load the matching project or establish a recovery-safe config
snapshot before installing red1 / green0.62 / blue0.65 card-wide.
