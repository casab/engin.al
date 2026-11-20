---
title: "Magic Trackpad Visualizer"
short: "Trackpad Visualizer"
date: 2026-11-16
lines: [circuits, code]
status: shipped
stack: ["C#", "HLSL", "Direct3D"]
summary: "Shows what an Apple Magic Trackpad feels on Windows: every finger, its pressure and contact shape, drawn live on the GPU."
featured: true
links:
  - label: repo
    url: https://github.com/casab/MagicTrackpadVisualizer
draft: true  # seeded from the repo README: review, then set to false (or untick Draft in the CMS)
---
A companion to the MagicTrackpad2ForWindows driver, which reports per-finger pressure and contact size and can fire the trackpad's haptic actuator on demand.

Fingers press dents into a sheet; a force click sets off a shock wave, and the trackpad ticks and buzzes back. Other Precision Touchpads show up too, with whatever their reports contain.

*Draft: add the demo GIF as the cover.*
