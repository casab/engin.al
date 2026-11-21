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
npm run build:deploy   # clean build + scripts/check.mjs --ci (what Workers Builds runs)
npm run check          # links, alt text, no inline style/script (CSP), no demo Strava data in CI
npm run strava:sync    # pull Strava → src/_data/strava (needs .env), then commit the result
npm run strava:demo    # fake races for layout work; `node scripts/strava-demo.mjs --clear` before committing
npm run r2:media       # upload images to R2 with your wrangler login (no keys); `-- --prune` to drop local copies
npx wrangler deploy --dry-run   # sanity check the Worker bundle and bindings
```

## Layout

| Path | What |
|---|---|
| `src/projects/<slug>/index.md` | project: `lines` (first sets the colour), `short` map label, `status`, `stack`, `summary`, `links`, `cover`, `featured`, `draft` |
| `src/sound/<slug>/index.md` | recording: `artist` (Balgum/Senst), `kind` (dj set, live set, dj mix, track, release, session), `venue`, `length`, `embed_url`, `links`; Sound line unless `lines` says otherwise |
| `src/stops/*.md` | milestones without a page (gigs, degree, jobs): `title`, `short`, `date`, `lines`, `url`, `note`. `permalink: false` |
| `src/distance/<strava-id>.md` | notes on Strava activities: `title`, `show`, `hidden`, `photo`, body. Never pages |
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
| `worker/index.js` | the only server code: `/api/auth` GitHub OAuth for the CMS |
| `scripts/` | `check.mjs`, `strava-*.mjs`, `r2-upload.mjs`, `strip-metadata.mjs` |

**Stations collection** (`eleventy.config.js`): merges projects, sound, stops and Strava races into plain
objects (`id, title, short, date, lines, url, kind, meta, summary, draft, …`). The map, line pages and home
indexes all read it. `draft: true` hides an entry in production builds; `npm run serve` / `SHOW_DRAFTS=1`
shows it.

## The map (`src/_lib/network.js`)

One column per station ordered by date (nothing collides however dates bunch up), a fixed lane per line,
interchanges bend the non-first lines over at 45° to run beside the first, all lines end at the "Now"
terminus. Output is plain SVG; the line filter is CSS `:has()` on radio inputs. A wide map opens scrolled to
the right end (`direction: rtl` trick) with a fade on the left. Phones (< 56rem) get the same stations as a
vertical line diagram. Long titles need a `short` label or they collide.

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
  `duration`); event URLs are `/events/<folder without date>/`.
- **Recordings:** SoundCloud `balgum` (user id 4014191). The RSS feed only has one item; the profile HTML
  (`/balgum/tracks`, `/sets`) lists everything, track pages carry `<time pubdate>` and duration.
- **Senst:** production alias; Spotify artist `266Jp19qo5Tb7hKkj9y2yy`, single "Confusion" (2020-02-29).
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
- Many activities still have Strava's default names ("Morning Run"); rename or hide them via
  `src/distance/<id>.md` in the content review.

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

## Gotchas

- `npm run build:deploy` deletes `_site`, which breaks a running `npm run serve`: restart the dev server.
  The dev server also caches `_data` (new Strava routes didn't show until a restart).
- Git Bash on Windows rewrites arguments that start with `/` into Windows paths: use `MSYS_NO_PATHCONV=1`.
- Full-size screenshots: headless Edge (`msedge --headless=new --screenshot --window-size=1440,2000`) with
  a fresh `--user-data-dir` per run (a reused profile silently produces nothing). Its minimum window width is
  ~500 px, so check phone layouts in the browser pane at 375 px instead.
- When editing JS with Python string replacement, backslashes in regexes get mangled: use the Edit tool.

## Open items

- Content review of everything (Engin: "some data are wrong"): projects, recordings, gigs, Strava names.
- Still drafts: five placeholder milestones (`[Electronics engineering degree]`, `[Machine learning work]`,
  `[Started backend work at Digital Loop]`, `[Guitar, first band]`, `[First half marathon]`) and one
  SoundCloud track Engin hasn't decided on. Possibility, Death and Freedom have no `artist` yet.
- Photos (12–20 asked for), more music links, the CMS OAuth secrets, image resizing on the zone.
- `LICENSE` still carries AstroPaper's copyright line.
