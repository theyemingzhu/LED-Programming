# Lightweaver client hosting

The client at `https://light.mandalacodes.com` controls a configured local card.
Studio remains at `https://led.mandalacodes.com` for design, installation and
maintenance. Both surfaces are owned by this repository; the parent Mandala
Codes project must not publish to either Pages project.

## Provisioning

On 2026-09-29 the dedicated Cloudflare Pages project `lightweaver-client` was
created with production branch `main`, and `light.mandalacodes.com` was attached.
Its Pages hostname is `lightweaver-client.pages.dev`. Cloudflare domain verification and validation are active. A proxied CNAME from `light.mandalacodes.com` to this hostname
was added through the Cloudflare dashboard; existing records were preserved.
Project creation and DNS do not mean the client app has been deployed.

The project is static only. It has no Studio Functions, cloud library database,
account API, remote card relay, or firmware artifacts. Client mutations stay on
the LAN through the card page bridge. Studio's existing cloud bindings remain
on `lightweaver`, unchanged.

## Build and release

Use the existing preview at `/client.html`; do not start another preview server.
The client entry is `lightweaver/src/client-main.jsx`. `npm run build:client`
builds it independently with `vite.client.config.js`, renames its HTML to the
root `index.html`, and stages `.pages/lightweaver-client`.

`client-release.json` uses the exact Git revision and repository commit count,
matching Studio's build number. `client-build-graph.json` records every staged
asset's length and SHA-256, plus root HTML and release marker. Both JSON files
are served with `Cache-Control: no-store`. `npm run verify:client` checks the
staged bytes; `npm run check:client:prod` proves the live domain against those
same bytes, including `/` routing. A successful upload alone is not shipment.

The existing `Deploy site` workflow publishes the client after Studio's live
proof, under the same serialized production workflow and exact tested or signed
revision. The client publisher isolates Wrangler from Studio Functions and
configuration. The workflow retains client files in its existing release-proof
artifact. Its receipt and independent background observer require Client,
Studio and firmware proof before reporting the combined release shipped. Failed
client publication or proof leaves the release not shipped and reports the
successful Studio state separately. No additional model-powered observer exists.

Local checks: `npm run test:client-release`, `npm run build:client`, and
`npm run verify:client`. Release receipt/observer regressions remain in
`npm run test:background-release`. Publication remains an explicit release
boundary; creating the subdomain does not authorize publishing unverified work.

## Card compatibility

Existing cards only trust Studio's exact origin. The client requires firmware
that explicitly permits `https://light.mandalacodes.com` in its bridge and HTTP
origin policy, and advertises the client playlist contract. DNS cannot remove
that boundary. Older cards need the preserving update flow in Studio; no login
or physical button step is introduced. Keep exact-card identity, version and
readiness checks; never widen trust to every `mandalacodes.com` subdomain.

Before release, inspect the real desktop/mobile client, verify unsupported-card
recovery, and complete the firmware playlist persistence/physical output checks
required by the changed card contract. Automated browser proof cannot establish
that physical LEDs matched a requested look.

## Player-first owner entry

The player's discreet **Owner tools** link opens
`https://led.mandalacodes.com/api/owner/studio`. That specific entry checks the
existing native account session on the server and requires the `owner` role.
It offers the existing username/password login, including temporary-password
replacement. Customers and workers cannot enter through this route. The
response is `no-store`; a separate cookie-free static asset request serves the
Studio only after authentication. The API path bypasses Studio's offline
service-worker shell cache. Failure to read the session or static assets closes
the entry with a service-unavailable page. Return links point only to the fixed
player origin.

This is the approved owner-entry boundary, **not** a password wall around the
existing public Studio root or its static assets. Existing Studio, firmware,
update, installer and account-free recovery URLs remain unchanged. No account,
password, secret, database schema or cross-subdomain cookie sharing was added.

## Limited pattern edits

The player can update brightness, speed and hue for the selected installed
pattern through the bounded client-pattern API. Saved settings belong to that
card and pattern; the original Studio project, recipe and wiring stay intact.
The player checks the card, pattern and saved revision, then verifies a fresh
readback before reporting success. Selecting another pattern discards the
previous unsaved editing state. Studio card controls expose the same saved
settings and a Refresh saved settings action.

This requires the card's clientPattern capability. Ordinary live adjustments
remain separate from explicitly updating a named pattern. Real-card restart and
physical light behavior are not established by browser fixtures.
