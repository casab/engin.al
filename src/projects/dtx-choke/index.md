---
title: "dtx-choke"
date: 2026-11-01
lines: [sound, circuits]
status: ongoing
stack: ["Rust", "Win32", "Windows MIDI Services"]
summary: "A tiny native app that makes Yamaha DTX PRO cymbal chokes work with Addictive Drums 2 in Ableton."
featured: true
draft: false
---
The DTX PRO kit sends its cymbal Note Offs at the wrong moment for Addictive Drums 2, so grabbing a cymbal doesn't choke it. The usual fix is a Bome MIDI Translator preset plus a loopMIDI virtual port.

dtx-choke replaces both with one small Win32 app. It reads the kit through Windows MIDI Services, drops the kit's own cymbal Note Offs, watches poly aftertouch for a choke grab, and sends the Note Offs itself on a timer. Everything else passes through untouched, on a virtual MIDI device that only exists while the app runs.

- about 2 MB of memory, no polling: it sleeps until a MIDI message or a timer arrives
- measured on a real kit: **0.04 ms** added latency, choke timing accurate to about 1 ms
- tray icon shows whether the kit is connected

