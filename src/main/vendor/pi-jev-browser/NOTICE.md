# Pi Jev Browser attribution

Source: https://github.com/laihenyi/pi-Jev-browser
Pinned revision: 206a351831d82580a78ac4635aabcc33bc7134c9
License: Apache-2.0 (LICENSE in this directory).

ViTrip vendors the surface-independent loop, driver contract, verification gate,
error helpers, and the question/candidate-building portion of policy.ts.
Changes: local import extensions removed; SDK-only types replaced with structural
interfaces; unused SDK transport and Pi model helper omitted. ViTrip supplies its
own Electron driver and OpenRouter transport in ../../pi-jev-browser.ts.
The experimental driver controls the existing in-app browser. It does not install
upstream's standalone Playwright Chromium or enable host-wide macOS app control.
