---
title: "AutoSwitch KVM"
date: 2026-11-12
lines: [circuits, code]
status: ongoing
stack: ["C#", "Swift", "Bluetooth", "HID++"]
summary: "Your Bluetooth keyboard, mouse and trackpad follow your KVM switch, on macOS and Windows."
featured: true
links:
  - label: site
    url: https://autoswitchkvm.com
  - label: repo
    url: https://github.com/casab/AutoSwitchKVM
draft: false
---
A KVM switch moves the monitor and the USB devices between two computers, but Bluetooth devices stay with whichever computer they last paired with. Every switch meant re-pairing a Magic Trackpad by hand, or pressing channel keys on every keyboard and mouse.

AutoSwitch runs in the menu bar on macOS and in the tray on Windows. It notices when the KVM switches and moves the devices along:

- **Apple Magic Trackpad, Keyboard and Mouse:** hands the pairing over to the other computer
- **Logitech Easy-Switch** keyboards and mice: tells the device to change channel
- **ZMK keyboards:** the same, through a small firmware module I wrote for it, [zmk-autoswitch](https://github.com/casab/zmk-autoswitch), which speaks a slice of Logitech's HID++ protocol
- **Headphones and speakers:** disconnects them from the computer you leave and connects them on the other

Started in June 2026. First release (v0.1.0) on 12 November, v0.5.3 eight days later. The Windows build installs and updates itself through Velopack.
