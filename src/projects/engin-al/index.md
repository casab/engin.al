---
title: "engin.al"
date: 2026-11-21
lines: [code]
status: ongoing
stack: ["Eleventy", "Sveltia CMS", "Cloudflare Workers"]
summary: "This site: four lines, one network, drawn at build time from its own content."
featured: false
links:
  - label: repo
    url: https://github.com/casab/engin.al
draft: true  # from GitHub (repo, README, commits, releases): review, then untick Draft
---
The map on the home page is generated when the site builds: every project, recording, milestone and race is a station, ordered by date. Work that crosses disciplines becomes an interchange. It ships as plain SVG, and the line filter is pure CSS.

Races come from Strava through a daily sync, recordings from SoundCloud, and everything else is edited in Sveltia CMS. It runs as a Cloudflare Worker with static assets.
