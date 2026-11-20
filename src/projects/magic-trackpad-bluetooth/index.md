---
title: "Magic Trackpad 2 on Windows: Bluetooth fixes"
date: 2026-10-27
channels: [circuits, code]
status: shipped
stack: ["KMDF", "C", "WPP"]
summary: "Fixed a stall where a freshly paired Magic Trackpad never showed up as a touchpad until it was power-cycled."
featured: false
links:
  - label: driver
    url: https://github.com/vitoplantamura/MagicTrackpad2ForWindows
draft: true  # seeded from the repo README: review, then set to false (or untick Draft in the CMS)
---
After a host-initiated Bluetooth pairing, the trackpad sometimes doesn't acknowledge the filter driver's first SET_FEATURE. Upstream sent it synchronously, with no timeout, on the PnP start path, so the HID collection hung and the touchpad didn't exist until the link dropped. With a KVM switching the pad between machines, that meant power-cycling it on every switch.

The fix configures the pad from a recovery timer after start instead of inline, starts reads immediately, times each SET_FEATURE out, and orders the multitouch switch before haptics. It was reproduced and verified in a VirtualBox VM with a test-signed driver, WPP traces and a small tool that removes and re-pairs the pad the way the KVM does.

Merged upstream as two pull requests (#59, #69).
