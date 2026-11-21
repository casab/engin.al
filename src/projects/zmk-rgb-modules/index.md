---
title: "ZMK modules for a Reviung41"
short: "ZMK modules"
date: 2026-11-18
lines: [circuits]
status: ongoing
stack: ["C", "Zephyr", "ZMK", "Devicetree"]
summary: "One feature per repo: per-LED overlays, layer, battery, Bluetooth and media indicators, and a lazy layer-modifier key."
featured: true
links:
  - label: config
    url: https://github.com/casab/zmk-config
  - label: led overlay
    url: https://github.com/casab/zmk-rgb-led-overlay
  - label: lazy layer mod
    url: https://github.com/casab/zmk-lazy-layer-mod
draft: false
---
My keyboard is a Reviung41 with a nice!nano running ZMK. ZMK's underglow lights the whole strip with one effect, so the base module, **zmk-rgb-led-overlay**, adds a virtual LED strip between the underglow and the real LEDs. Indicators draw on top of it without breaking anything ZMK already does.

On top of that:

- **zmk-rgb-layer-indicator**: a color per active layer, then your own underglow comes back exactly as it was
- **zmk-rgb-battery-indicator**: a short gauge animation, green/orange/red
- **zmk-rgb-ble-indicator**: lights the active Bluetooth profile's area when it changes, from a key or from the AutoSwitch KVM app
- **zmk-rgb-media-indicator**: directional sweeps for next/previous/volume/brightness keys, no keymap changes
- **zmk-lazy-layer-mod**: a layer key that only adds Cmd/Win when held on its own, so Cmd+click still works
