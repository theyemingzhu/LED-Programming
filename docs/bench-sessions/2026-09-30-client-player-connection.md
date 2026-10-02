# Client player real-card connection

Owner: client-player primary. State: preserving Wi-Fi update started through public Studio.

- Website release independently proven: revision f1c16292e5619f02957e0ed0a3fe752f7ea7db46, Studio/client2314, signed firmware2311. Deployment36588664715. Durable observer reports shipped.
- Before update: exact card lw-b0fe81f61b44, firmware1.1.47/build2160, boot-b9fe4fab-b0fe81f61b44. Network192.168.18.70 now reachable.
- Existing project lightweaver-bench-discovery-v1 revision10, fingerprint b27fd495241a9f27f9a885e99c8722dfb27fd495241a9f27f9a885e99c8722df. Known-good, ready; 41 pixels GPIO18 RGB, five segments11/5/10/10/5. Current lightweaver-section-layout.
- Public player2314 cannot yet connect to old firmware. Public Studio connects to same real card.
- Studio verified official1.2.1/build2311 and displayed preservation of Wi-Fi/project/patterns/wiring/settings. Started exact-card secure Wi-Fi update; no login, physical button, factory image, or network switching.

Next: read update outcome and verify same-card build2311, preserved project fingerprint/wiring, then connect public player. Physical LED appearance remains unobserved.

## Verified outcome

Same-card reboot to boot-a0bfeedd-b0fe81f61b44, firmware1.2.1/build2311; update idle/app1 with no error/rollback. Project revision10/fingerprint and GPIO18/41px/five segments preserved exactly. clientPlaylist.version1 and clientPattern.version1 available.

Public light.mandalacodes.com build2314 connected through the Connect to lights flow and showed five installed patterns with Current sections selected. Actual player speed changed1 to1.05; independent /api/zones readback confirmed1.05 on controlled strip1. Restored through player to1 and independently confirmed all five speeds1. No persistent pattern or playlist changes were made.

Website release complete. Physical appearance and real pattern-save/reboot persistence remain unobserved. Next single Bench step: Adrian observes whether the current lights match the selected Current sections pattern. Keep this chat open for hardware acceptance.
