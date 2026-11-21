---
title: "Ekonomigg"
date: 2025-06-30
lines: [code]
status: ongoing
stack: ["Python", "FastAPI", "PostgreSQL", "React"]
summary: "A guessing game played with real supermarket prices: you see a product and its price, and guess when that price was valid."
featured: false
links:
  - label: site
    url: https://ekonomi.gg
draft: true  # from GitHub (repo, README, commits, releases): review, then untick Draft
---
Everyone in Turkey talks about prices. Ekonomigg turns that into a game: products and prices come from old A101, BİM and ŞOK flyers, and you guess the year, or on Hard the month too.

- **Modes:** Classic (10 questions), Endless (until you miss) and Time Attack
- **Leaderboards** by day, week, month and all time; play anonymously or with an account
- **Backend:** FastAPI, PostgreSQL and Redis, with Prometheus and Grafana for monitoring
- **Frontend:** React, in Turkish and English

Built with a small team since mid-2025. The last few months went into the web app and the API: mobile layout, the play screen and analytics.
