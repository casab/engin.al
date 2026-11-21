# engin.al: project notes for Claude

Personal site of Engin Al: **"Four lines, one network"**. Code, Circuits, Sound and Distance are four
transit lines; projects, recordings, milestones and races are stations; work on two or more lines is an
interchange. Live at https://engin.al. Repo: github.com/casab/engin.al (public).

> **Keep this file current.** Update it in the same PR whenever something here changes: a new collection
> or field, a script, a command, a deploy step, a decision Engin makes, a gotcha you hit. Stale notes are
> worse than none. If unsure whether something belongs here, it probably does.

## How Engin works with Claude

- Engin works in the main checkout `C:\Users\engin\codejunk\engin.al` (on `main`). Claude usually works in
  a git worktree under `.claude/worktrees/…`. Every change goes on a branch from the latest `origin/main`
  and into its own PR; Engin merges. **Always `git fetch` and branch from `origin/main`**: PRs often get
  merged while Claude is still working, and a push to an already-merged branch needs a new PR.
- **Don't stack PRs on each other's branches.** On 2026-11-21 #13–#16 targeted the previous PR's branch; merged
  in quick succession, they landed in those branches and never reached `main` (fixed by a follow-up PR). Target
  `main` every time; if a PR depends on an open one, say so in its description and let it show both diffs.
- After a merge, Engin's checkout needs `git pull` (and `npm ci` when dependencies changed) before he runs
  any local command (Strava sync, `wrangler secret put`, …).
- Engin prefers being given **commands to run himself** for credentials and account setup (secrets, OAuth
  apps, zone settings). Resource creation Claude may do when asked (it created the R2 bucket with wrangler).
- Sister projects with the same stack and patterns, worth reading before solving something new:
  `C:\Users\engin\Claude\Projects\technoetkinlik` (Worker OAuth for Sveltia, R2, CSP, Workers Builds) and
  `C:\Users\engin\codejunk\uncvl.xyz` (Eleventy + Sveltia + R2; Balgum's gigs live in its event data).
- Content is being filled first and **reviewed later**: Engin said some data is wrong. Don't treat existing
  entries as verified facts, and never invent dates, venues, times or numbers: use `[placeholder]` text
  and `draft: true` instead.

## Stack

- **Eleventy 3** (Nunjucks + Markdown), no front-end framework. Markdown is never run through Nunjucks.
- **Sveltia CMS** at `/admin/` (self-hosted from `node_modules`, pinned), GitHub backend, config in
  `public/admin/config.yml`.
- **Cloudflare Worker** `engin-al` with static assets (`wrangler.jsonc`). Deployed by **Workers Builds**
  on every push to `main` (build `npm run build:deploy`, deploy `npx wrangler deploy`, preview
  `npx wrangler preview`). The custom domain is attached in the dashboard, not via `routes`.
- The project has a `wrangler.jsonc`, so use **Wrangler** for dev/deploy/R2 (Engin's global rule: `cf`
  CLI only where there's no Wrangler config). `cf` is fine for zone-level things (e.g. zone settings).
- Node 22+ (Engin has 26 locally). No `.node-version` file: a local Node version manager picks it up and
  breaks builds.

## Commands

```sh
npm run serve          # dev server :8080, shows drafts (marked)
npm run build:deploy   # clean build (hashes asset names) + scripts/check.mjs --ci (what Workers Builds runs)
npm run check          # links, alt text, no inline style/script (CSP), no demo Strava data in CI
npm run strava:sync    # pull Strava → src/_data/strava (needs .env), then commit the result
npm run strava:rename  # dry run of scripts/strava-renames.json; `-- --apply` renames on Strava (one-time write auth)
npm run strava:demo    # fake races for layout work; `node scripts/strava-demo.mjs --clear` before committing
npm run r2:media       # upload images to R2 with your wrangler login (no keys); `-- --prune` to drop local copies
npx wrangler deploy --dry-run   # sanity check the Worker bundle and bindings
npx wrangler dev --port 8787     # serve the production _site with _headers (launch.json "production build")
```

## Layout

| Path | What |
|---|---|
| `src/projects/<slug>/index.md` | project: `lines` (first sets the colour), `short` map label, `status`, `stack`, `summary`, `links`, `cover`, `featured`, `draft` |
| `src/sound/<slug>/index.md` | recording: `artist` (Balgum/Senst), `kind` (dj set, live set, dj mix, track, release, session), `venue`, `length`, `embed_url` (the recording), `tracklist_url` (playlist of the tracks played), `links`; Sound line unless `lines` says otherwise |
| `src/stops/*.md` | milestones without a page: gigs without a recording (`artist` + `kind`: dj set, live set), and **periods** (jobs, degrees: `end` = date or `present`, `role`, optional `when`). Also `title`, `short`, `date`, `lines`, `url`, `note`. `permalink: false` |
| `src/distance/<strava-id>.md` | notes on Strava activities: `title`, `show`, `hidden`, `duplicate`, `photo`, body. Never pages |
| `src/notes/*.md` | occasional write-ups; not on the map, not in the menu |
| `src/_data/site.json` | the four lines (id, code, label, colour, description, url), menu, home intro, socials, `aliases` (Balgum, Senst), `strava_url` |
| `src/_data/now.json` | Now page + departures board rows (`board`) |
| `src/_data/about.json`, `rig.json` | Network information (bio lines) and the instrument list ("Rolling stock") |
| `src/_data/strava/` | `activities.json` + `routes/<id>.json`, written by the sync and committed |
| `src/_data/media.json` | files on R2 (written by `r2-upload.mjs`); listed images load from media.engin.al |
| `src/_lib/network.js` | map layout (see below) |
| `src/_lib/signal.js` | route traces, elevation profiles, weekly traces as SVG paths |
| `src/index.njk`, `src/pages/line.njk` | home; one paginated template for `/code/ /circuits/ /sound/ /distance/` |
| `src/_includes/macros.njk` | `network` (map + phone diagram + filter), `board`, `player`, `tags` |
| `src/assets/css/site.css` | the whole design system (layers, tokens) |
| `src/assets/js/site.js` | click-to-load players, split-flap flip, `#f-<line>` filter hash. Everything works without it |
| `src/assets/js/map.js` | the explorable map (pan, timeline, keyboard, station cards); imported by `site.js` |
| `src/assets/js/search.js` | the search dialog and the live search on `/search/`; imported by `site.js` on first use |
| `src/pages/years.njk`, `year.njk` | `/years/` and `/years/<yyyy>/`, paginated over the `stationYears` collection |
| `src/pages/search.njk`, `search-index.njk` | `/search/` (A–Z by line, the no-JS fallback) and `/search.json` (`searchIndex` filter) |
| `worker/index.js` | the only server code: `/api/auth` GitHub OAuth for the CMS |
| `scripts/` | `check.mjs`, `og.mjs`, `hash-assets.mjs`, `strava-*.mjs`, `r2-upload.mjs`, `strip-metadata.mjs` |
| `scripts/og.mjs`, `scripts/og-fonts/` | share cards (see below); static Archivo cuts made by `scripts/og-fonts.py` |
| `src/pages/sitemap.njk` | `/sitemap.xml` (`sitemapUrls` filter adds the paginated line and year pages) |

**Stations collection** (`eleventy.config.js`): merges projects, sound, stops and Strava races into plain
objects (`id, title, short, date, lines, url, kind, meta, summary, draft, …`). The map, line pages and home
indexes all read it. `draft: true` hides an entry in production builds; `npm run serve` / `SHOW_DRAFTS=1`
shows it.

## The map (`src/_lib/network.js`)

One column per station ordered by date (nothing collides however dates bunch up), a fixed lane per line,
interchanges bend the non-first lines over at 45° to run beside the first, all lines end at the "Now"
terminus. Output is plain SVG; the line filter is CSS `:has()` on radio inputs. A wide map opens scrolled to
the right end (`direction: rtl` trick) with a fade on the left. Phones (< 40rem) get the same stations as a
vertical line diagram; tablets and up get the map. Long titles need a `short` label or they collide.

- **Density:** consecutive plain single-line stations sit `TIGHT` (90 px) apart; interchanges keep the wide
  column for their bends. Labels take one of two tiers; a label that would need a third is `minor` (hidden
  until hover/focus, still in the card). Interchanges, projects and recordings always keep their label.
- **`src/assets/js/map.js`** (loaded by `site.js` only where a map is drawn): drag to pan with the mouse,
  ←/→/Home/End between stations, a **timeline** ("Jump to" one button per year + Now; highlights the year in
  view; hidden without JS) and a **station card** (hover, keyboard focus, or the first tap on touch; the
  second tap follows the link; Escape closes). Card data is a `<script type="application/json"
  data-map-data>` block built by the `mapCards` filter, indexed by `data-st`. The card is positioned with
  `style.setProperty("--x"/"--y")` (CSSOM is fine under the CSP; `style=""` attributes are not).
- In the rtl scroller `scrollLeft` is 0 at the right end and negative further left.
- **Overview rail** instead of the native scrollbar (Engin found the default one too generic): `map.js` builds a
  `.map-rail` under the map with a miniature of the line paths (cloned, viewBox cropped to the lines' band,
  `preserveAspectRatio="none"` + `vector-effect: non-scaling-stroke`) and a framed window for the part on screen.
  Drag the window, click/tap the rail to glide there, or ←/→/PageUp/PageDown/Home/End on it (`role="scrollbar"`).
  It only appears when the map overflows, and it's hidden on phones. The `.ln` clones follow the line filter.
  Without JS the map keeps a thin ink scrollbar (`scrollbar-color`, also on `pre`).

## Phones

- Below 44rem the header nav becomes a **Menu** button: a `<details>` sheet (`[data-menu]` in `base.njk`)
  with the four lines and their station counts, then Now / Network info / The map. Works without JS;
  `site.js` adds Escape, focus in/out and closing on link clicks. `html:has(.menu[open])` locks scrolling.
- The home page reorders on phones with flex `order` (`.home` wrapper): hero → departures board → the
  line diagram → line indexes (3 stations each) → featured interchange → network information.
- The phone line diagram shows the **newest 12** stations; a CSS-only checkbox (`#d-all`) shows the rest,
  and choosing a line filter shows every station of that line. When adding filter rules, the reveal rules
  are written per line on purpose: a generic `:not(#f-all)` rule out-specifies the line filters.
- Every tappable thing is ≥ 44 px (`min-height: 2.75rem`). Measured at 375 px: home ≈ 4,500 px tall.

## Station pages and share cards

- Project and recording pages end with **Next stops**: per line the entry is on, its number on that line and
  the older/newer station (`nextStops` filter over `lineStations()`, `nextStops` macro). It replaced the old
  projects-only pager.
- A **Share** button (hidden without JS) on project, recording and note pages: the system share sheet on
  touch devices, "Copy link" + a toast elsewhere. It shares the canonical `https://engin.al/...` URL.
- **Share cards:** every page's `og:image` is `/og/<path>.png` (1200×630), drawn after each build by
  `scripts/og.mjs` (satori → SVG, `@resvg/resvg-wasm` → PNG; no browser, works in Workers Builds). `base.njk`
  calls the `ogCard` filter with the page's data; `cardSpec()` decides the kicker/headline/sub/lines per page
  type; `renderCards()` runs on `eleventy.after`. Cached in `.cache/og` by content + code hash.
  `check.mjs` fails if a page has no card. satori can't read variable fonts, so `scripts/og-fonts/` holds
  static WOFF cuts of Archivo (62%/850, 125%/650, 100%/500); regenerate with `scripts/og-fonts.py` (needs
  `fonttools` + `brotli` in a venv) only if the card needs another style.
- `robots.txt` points at `/sitemap.xml`.

## Periods (jobs, degrees)

- Engin (2026-11-21): jobs are periods, not instants; "it would look weird if we only put the starting time".
  A milestone with `end` (YYYY-MM-DD or `present`) is a period. `buildStations()` adds `end` and `range`
  ("Dec 2021 – Sep 2024", "May 2025 – now"); `when` overrides the range when only years are known
  ("2012 – 2017"), and then `date`/`end` only place it (Jan 1 of the years). Meta is `role · range`. A single
  milestone known only to the year can use `when` too (`when: "2009"`), so no invented month is shown.
- The station sits at its start like any other. `buildNetwork()` also returns `bars`: a strip under the year
  axis (the lanes are too full of bends and labels), one bar per period from its station to where the end date
  falls between columns (`xAt`, interpolated by date), or to the terminus with an arrow while it runs.
  Overlapping bars stack on rows; long bars repeat the name at the end. Bars follow the line filter (`.span`).
- Lists show the start (`range` before " – ") in the date column and the range in the meta; map cards and
  "Next stops" show the range. Year pages list periods still running that year ("Still running in", `ongoing`).
- Sources: the CV (LaTeX, Engin, 2026) and the LinkedIn export (`Profile.pdf`): Semafor Teknoloji internship
  (Aug–Sep 2016), Delphi Technologies (Sep 2017–Oct 2019, İzmir), freelance (Jun–Dec 2020), Akinon (Jan–Dec
  2021), Gowit (Dec 2021–Sep 2024), Digital Loop (May 2025–). B.Sc. Dokuz Eylül 2012–2017 after a year at
  Eskişehir Osmangazi; M.Sc. Dokuz Eylül 2017–2019, coursework completed. Courses were left out (Engin: the CV's
  list is partial). Marathon times and half-marathon counts stay off the site: official times differ from
  Strava and many halves weren't recorded. Employer work gets one plain line per job, never a project page.

## Year pages

- `stationYears` collection (`eleventy.config.js`, built from the same `buildStations()` as `stations`):
  `{ year, stations, lines: { id: n }, interchanges, races, newer, older }`, newest first. Only years with
  stations get a page (drafts count only in `npm run serve`, so 2012/2015 show locally but not live).
- A year page draws `network` with only that year's lines (`linesIn` filter), no timeline, and the terminus
  is the next year (`end` argument of the macro: `{ label, url, note }`; default is Now → `/now/`).
- "In numbers" uses the Strava `weekly` totals (`run_km`, `ride_km`), which count every activity, not only
  the ones on the map; the page says so.
- Linked from the map's timeline ("Year by year →"), each year on a line page, the menu and the footer.

## Search

- `/search.json` = `{ lines, items }`: every station plus notes, newest first, short keys (`t` title, `s` short,
  `l` lines, `y` year, `k` kind, `m` meta, `x` stack/tags, `u` url, `d` summary ≤ 160 chars). ~100 items ≈ 15 KB.
- The header **Search** link goes to `/search/`; with JS it (and Ctrl/Cmd+K, `/`) opens a `<dialog>` combobox
  instead. Every typed word must match somewhere; title prefix > word start in title > short > meta/stack/
  year/kind/line > summary; ties stay newest first. Turkish letters fold (ı/İ/I → i, ş → s, …) one char at a
  time so highlights line up. Line chips filter; ↑/↓/Enter (Ctrl+Enter = new tab); Escape always closes the
  dialog (a `type="search"` input would otherwise just clear itself).
- On `/search/` the same UI mounts in the page, keeps `?q=` in the URL and hides the A–Z list while there's
  a query. Phones get the dialog full screen.

## Line pages

- Stations are grouped by year (`byYear` filter over `lineStations()`): one `<details data-year>` per year,
  the newest two open. A sticky **year bar** (`.year-bar`) has one chip per year with its count; `site.js`
  opens a folded year when its chip or `#yYYYY` is used and highlights the year in view.
- The aside becomes `<details class="panel" data-panel>` panels. Below 60rem the aside moves above the list
  (`order: -1`) and `site.js` folds the panels to their headings; "Other lines" is hidden there (the menu has
  them).
- Distance draws **thumbnails**: `route(strava, "thumb")` → `routeGeometry(..., { maxPoints: 80,
  elevPoints: 48, round: 0 })`, line-only elevation, integer weekly traces. Keep the Distance page ≲ 150 KB
  of HTML (it was 532 KB with full routes). `.stop` uses `content-visibility: auto`.
- The weekly traces share one scale capped at the 97th percentile of non-empty weeks (`weeklyMax`), so one
  big week doesn't flatten the others.

## Design rules

- Paper `#EDEDE8`, ink `#121212`, one font family **Archivo** (variable width: 62% display caps, 125% wide
  labels) + **IBM Plex Mono**, self-hosted. Hairline rules, not boxes. The dark departures board is the one
  dark object.
- Line colours (chosen for ≥3:1 on paper): Code `#2D3BFF`, Circuits `#A87500`, Sound `#D63526`,
  Distance `#0B8A4E`. Small grey text `#5E5E58` (4.5:1). Use `.c-<line>` classes to set `--line`.
- **CSP is strict**: no inline `style=""` and no inline scripts in pages (check.mjs fails the build);
  `<script type="application/json">` data blocks are allowed. New third-party embeds need their origin in
  `public/_headers` `frame-src`.
- Tone: first person, plain, specific. No skill bars, no "passionate", numbers in details not headlines.
  Engin asked for no neo-brutalism and nothing narcissistic.
- The footer says "No tracking": the Cloudflare Web Analytics beacon stays blocked by CSP unless Engin
  decides otherwise.

## Content sources (where facts come from)

- **Balgum gigs:** uncvl.xyz event data (`origin/main` of the uncvl repo, `lineup` with `act_type`,
  `duration`); event URLs are `/events/<folder without date>/`. Gigs elsewhere: Resident Advisor
  (`ra.co/dj/balgum`, event pages like `ra.co/events/1990893`, Moment x Byond VII). curl gets a 403 there, but
  the page reads fine in the browser pane.
- **Recordings:** SoundCloud `balgum` (user id 4014191). The RSS feed only has one item; the profile HTML
  `/balgum/tracks` lists the tracks, and track pages carry `<time pubdate>` and duration. **`/balgum/sets` renders
  only the newest playlist in its HTML** (the rest load on scroll): list them in the browser pane by scrolling
  the page. That's how the setlists for Tyke, Dalga, Dinozor, xbeyond, Stella and F.Loki were missed at first.
  Setlist playlists are titled `<Balgum|Senst> - <event or venue> - DD.MM.YYYY` (`/sets/tracks` and `/sets/dj-sets`
  are collections of his own uploads, not setlists). Prefer adding a setlist as `tracklist_url`. Each page's
  `window.__sc_hydration` JSON has `kind` (track/playlist), the full title, description (tracklists) and a
  playlist's tracks with their uploaders. Engin's titles follow `Balgum - <event> - DD.MM.YYYY@(<venue>) {Set}`.
  Uncivilization Records (`uncvl`) uploads single-set tracks (`/uncvl/balgum-rehab2`, …) and one playlist per night.
- **Gig vs recording (matching rule, 2026-11-21):** a gig gets a page under `src/sound/` when there's a
  recording of *Engin's own set* (`embed_url`, that single track) or a tracklist playlist of what he played
  (`tracklist_url`, e.g. `/balgum/sets/…`). Both → both players, recording first. Neither → a milestone in
  `src/stops/` with `artist` and `kind`. `/uncvl/sets/…` is the whole night, other people's sets (Synth & Punk
  only holds Ox's): only ever a link ("The whole night"), never a player.
- **Indicators** (Engin asked for them): the `player` macro takes `as` = `"recording"` or `"tracklist"`. A tag
  above the title says "Recording" or "Tracklist · not a recording"; a tracklist also has dashed rules and an
  outlined ≡ instead of ▶. A tracklist-only entry gets "tracklist only" in its meta (line page, map card,
  search) and "Recording: none, only the tracklist" on its page. The line page shows one player per row (the
  recording, else the tracklist).
- `check.mjs` fails on a `/sets/` `embed_url` (unless `kind: release`) and on a non-draft `src/sound/` entry
  with neither field. Titles use the event's own name from uncvl (`title`, or `codename` when the title is a
  lineup); `act_type` gives dj set / live set.
- **Balgum and Senst** are both producer and DJ names, split by genre (Engin, 2026-11-21): **Balgum** for
  techno, drum and bass, hardcore and the like (Death, Possibility); **Senst** for house, electronica and
  downtempo (Confusion, Freedom). Everything is uploaded on the `balgum` SoundCloud, so the uploader
  doesn't tell you the name: go by genre, and ask when unclear.
- **Senst:** Spotify artist `266Jp19qo5Tb7hKkj9y2yy`, single "Confusion" (2020-02-29).
- **Rig** (`rig.json`, Engin, 2026-11-21): Yamaha Pacifica 611HFM, Yamaha DTX6K3-X (its module is the DTX-PRO,
  hence the dtx-choke project's wording), M-Audio Keystation 61, Novation Circuit Tracks / Circuit Rhythm /
  Mono Station, Arturia MicroFreak, Empress Audio ZOIA, Ableton Live 12, Denon Prime Go.
- **Projects:** GitHub (`gh`), READMEs, commit history, releases, the products' sites. Private repos get no
  repo link. Don't add repos Engin has no own commits in, or Epic Games / employer material.
- **Distance:** Strava athlete 29741063, synced by `scripts/strava-sync.mjs`.

## Strava sync

- Shows races always, runs ≥ `STRAVA_RUN_MIN_KM` (9.5) and rides ≥ `STRAVA_RIDE_MIN_KM` (20); virtual rides
  never get a route. Everything else only feeds the weekly totals.
- At most `STRAVA_MAX_ROUTES` (80) new route downloads per sync (Strava: 100 requests / 15 min); a 429 keeps
  what was fetched. The rest arrive on later syncs.
- Token scope `activity:read` (Strava drops "Only you" activities and privacy zones); routes also lose
  600 m at both ends (`STRAVA_TRIM_M`) and anything in `STRAVA_PRIVACY_ZONES`.
- Daily GitHub Action commits changes to `main`, which triggers the Cloudflare build. Repo secrets:
  `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`, `STRAVA_REFRESH_TOKEN`, `GH_SECRETS_TOKEN` (stores a rotated
  refresh token).
- **Names live on Strava** (Engin, 2026-11-21: "update Strava directly"): fix a name on Strava, not with a
  `title` in `src/distance/<id>.md`, and the sync brings it here. `scripts/strava-renames.json` holds
  researched race names (`<race's own name> <year>`, English where the race has an English name, Turkish
  where it only has one; `race: true` also sets Strava's Race workout type). `npm run strava:rename -- --apply`
  (Engin runs it) asks for `activity:write` once, keeps that token in memory only, renames, and mirrors the
  names into `activities.json`. Research: the route's coordinates + date → the organiser's site, ahotu, ITRA,
  sporbilet, local news. Karşıyaka (≈38.45, 27.10) hosts the Atadan Anaya and Zübeyde Hanım runs.
- Still unnamed: the 11 km "race" on 2019-03-31 (Sunday evening on the usual training loop) and the 10 km on
  2024-05-18. Many other activities keep Strava's default names ("Morning Run").
- The "Delphi ride" (2018-06-21…23, Düsseldorf area → Aachen area → Eifel → Luxembourg) is the CV's "350 km
  European tour in 3 days" from the Delphi Technologies years. Engin confirmed (2026-11-21): day one is the
  112 km recording (1653492474; 112 + 151 + 83 = 346 km), renamed "Delphi ride day 1" via the rename list. The
  routes check out: each day ends 0.4 km (the trimmed ends) from where the next one starts. The 95 km recording
  of the same morning (1653487228) starts at the same spot, follows the same track (96% within 150 m) and stops
  13 km short: a partial copy, `duplicate: true` in `src/distance/1653487228.md`.
- **Duplicates:** the 2018 activities from April to September are on Strava twice (the `12946…` ids are a
  later re-import). The sync's `dropDuplicates()` keeps the older upload of any two with the same sport and start
  minute, in the list and in the weekly totals (11 copies on 2026-11-21). The copies are still on Strava;
  deleting them there is Engin's call. A copy that starts at a different minute (a partial second recording)
  isn't caught: mark it `duplicate: true` in `src/distance/<id>.md`, which drops it from the list and the weekly
  totals (`hidden: true` only drops it from the list).

## Cloudflare

- **Worker** `engin-al`: `run_worker_first: ["/api/*"]`; everything else is static assets. Invocation logs
  are off (sign-in URLs carry codes). `compatibility_date` must not be in the future in UTC (local
  workerd rejects it).
- **CMS sign-in:** `/api/auth` + `/api/auth/callback` in `worker/index.js` (ported from technoetkinlik).
  Needs Worker secrets `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` (GitHub OAuth app, callback
  `https://engin.al/api/auth/callback`), set with `npx wrangler secret put …`. "Sign in with Token" works
  without them.
- **R2:** bucket `enginal-media` (EEUR), public at `https://media.engin.al`, bound as `MEDIA`. No access
  keys anywhere. Resizing via `/cdn-cgi/image` needs image resizing on the zone (zone id
  `da3fd5a67c872a4ddbbafcf6636d92ff`); it was off as of 2026-11-21, Engin to switch on.
- `/admin/*` headers: COOP `unsafe-none` (the sign-in popup), CSP allows `data:`/`blob:`, api.github.com,
  githubstatus.com.

## Asset hashes and caching

- After a production build (`runMode === "build"` in the `eleventy.after` hook, after the share cards),
  `scripts/hash-assets.mjs` renames every CSS, JS and font file under `_site/assets/` to `name.<10 hex>.ext` and
  rewrites the references: absolute `/assets/...` paths in pages, feeds and CSS, and `./name.js` imports between
  scripts. Files are hashed after what they point at, so `site.js` gets a new name when `map.js` changes.
  `npm run serve` skips it (the dev server serves `src/` unhashed).
- So in source, always reference assets as `/assets/<dir>/<file>` (or `./file.js` between scripts); anything
  built differently (string concatenation) won't be rewritten. `check.mjs` checks `url()` and `import()` targets
  and, with `--ci`, fails on an unhashed CSS/JS/font file.
- `_headers`: `/assets/*` is cached for a year, `immutable`. Pages keep the default `max-age=0, must-revalidate`.
  Keep **one** rule per path: when several `_headers` rules match, their values for the same header are joined
  (live fonts once got `max-age=3600, must-revalidate, public, max-age=31536000, immutable`).
- A tab left open across a deploy asks for old hashed names that no longer exist: a failed `import("./search…")`
  falls back to `/search/`, and a failed map import leaves the plain map.

## Gotchas

- `npm run build:deploy` deletes `_site`, which breaks a running `npm run serve`: restart the dev server.
  The other way round too: a running dev server rebuilds into the same `_site` **with drafts**, so stop it
  before checking a production build (`ls _site/years` once showed the draft-only years 2012/2015).
  The dev server also caches `_data` (new Strava routes didn't show until a restart) and doesn't always pick up
  changes to filters in `eleventy.config.js`: restart it.
- Git Bash on Windows rewrites arguments that start with `/` into Windows paths: use `MSYS_NO_PATHCONV=1`.
- Full-size screenshots: headless Edge (`msedge --headless=new --screenshot --window-size=1440,2000`) with
  a fresh `--user-data-dir` per run (a reused profile silently produces nothing). Its minimum window width is
  ~500 px, so check phone layouts in the browser pane at 375 px instead.
- When editing JS with Python string replacement, backslashes in regexes get mangled: use the Edit tool.
- Line endings are mixed (many files CRLF, some LF, no `.gitattributes`). Git Bash `sed -i` and Python text
  mode can flip a whole file: check `git diff --numstat` before committing, and edit with the Edit tool or
  Python `newline=""`.
- A collection can't read another template's `content` (`TemplateContentPrematureUseError`): the distance notes
  use `rawInput` (raw Markdown) and the line page renders it with `md`.

## Open items

- Content review of everything (Engin: "some data are wrong"): projects, recordings, gigs, Strava names.
- Still a draft: one SoundCloud track Engin hasn't decided on. "Started playing guitar" is December 2009 (Engin;
  no band names for now), the first station on the Sound line. The first half marathon is the 9 Eylül İzmir
  Half Marathon 2018 (Engin, 2026-11-21): a note on its Strava station (`src/distance/1813356268.md`), not a
  separate milestone.
- No recording known for Decentralized Consensus (Nomads 36, 2026-04-24; its page plays the tracklist) or
  Synth Sessions #2 (Engin's live set, a milestone). When one appears, add `embed_url` / move it to `src/sound/`.
- Photos (12–20 asked for), more music links, the CMS OAuth secrets, image resizing on the zone.
- `LICENSE` is MIT, "Copyright (c) 2023-2026 Engin Al" since 2026-11-21 (no AstroPaper code is left; the old
  line named its author). The README says the MIT license covers the code, not the writing, photos,
  recordings or Strava data. Keep the README in step with this file when commands or the layout change.
