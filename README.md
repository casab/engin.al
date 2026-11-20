# engin.al

Personal site of Engin Al: **four lines, one network**. Code, circuits, sound and distance are four transit lines. Projects, recordings, milestones and races are stations, and work that crosses disciplines is an interchange.

Static site built with [Eleventy](https://www.11ty.dev/), edited with [Sveltia CMS](https://sveltiacms.app/) at `/admin/`, deployed to Cloudflare as an assets-only Worker (`wrangler.jsonc`) through Cloudflare's Git integration. No framework, no trackers. The network map is laid out at build time from the content (`src/_lib/network.js`) and ships as plain SVG; the line filter is pure CSS.

## Develop

```sh
npm ci
npm run serve        # http://localhost:8080 (drafts are shown, marked "draft")
npm run build        # → _site/ (drafts hidden)
npm run check        # broken links, missing alt text, CSP-unsafe markup, demo data
npm run strava:demo  # fake races for layout work; `node scripts/strava-demo.mjs --clear` before committing
npm run deploy       # manual deploy from your machine (clean build + check + wrangler deploy)
```

Node 22.9+.

## Layout

| Path | What |
|---|---|
| `src/projects/<slug>/index.md` | a project; images next to it. `lines: [circuits, code]`: the first sets the colour, two or more make an interchange. `short:` is an optional map label |
| `src/sound/<slug>/index.md` | a live set, mix, track or release (Sound line unless `lines` says otherwise); `embed_url` becomes a click-to-load player |
| `src/stops/*.md` | milestones without a page of their own (a degree, a first gig, a new job): title, date, lines |
| `src/distance/<strava-id>.md` | optional note/title/photo for a synced Strava activity, or `show: true` / `hidden: true` |
| `src/notes/*.md` | occasional longer notes (not on the map, not in the menu) |
| `src/_data/site.json` | the four lines (name, colour, description), menu, home intro, socials |
| `src/_data/now.json` | the Now page and the departures board rows |
| `src/_data/{about,rig}.json` | Network information (about) and the instrument list on the Sound line |
| `src/_data/strava/` | Strava cache written by `scripts/strava-sync.mjs`, committed; races become Distance stations |
| `src/_lib/network.js` | the map layout: one column per station by date, fixed lanes, 45° bends into interchanges, all lines ending at "Now" |
| `src/_lib/signal.js` | route traces, elevation profiles and weekly-distance traces as SVG paths |
| `src/pages/line.njk` | one page per line (`/code/`, `/circuits/`, `/sound/`, `/distance/`) |
| `src/assets/js/site.js` | click-to-load players and the split-flap animation; everything works without it |
| `public/admin/config.yml` | Sveltia CMS collections |
| `public/_headers`, `public/_redirects` | CSP and caching; old URLs → new ones |
| `wrangler.jsonc` | Worker name, asset handling, which paths run the Worker (`/api/*`) |
| `worker/index.js` | the only server code: GitHub sign-in for the CMS at `/api/auth` |

Content written as `draft: true` is visible in `npm run serve` and hidden in production.

## Edit

See [docs/EDITING.md](docs/EDITING.md). Short version: open `/admin/`, sign in, edit, save. The site rebuilds in about a minute.

## One-time setup

1. **Cloudflare**: in the dashboard, go to *Workers & Pages → Create → Import a repository*, pick `casab/engin.al`, and set:
   - Build command: `npm run build:deploy` (clean build, then the same checks as CI)
   - Deploy command: `npx wrangler deploy`
   - Non-production branch deploy command: `npx wrangler versions upload` (every pull request gets a preview URL)

   The Worker name comes from `wrangler.jsonc` (`engin-al`). No Cloudflare secrets are needed in GitHub: the GitHub Actions `ci` workflow only builds and checks.
2. **Domain**: engin.al currently points at GitHub Pages. Once the zone is on Cloudflare, uncomment the `routes` entry in `wrangler.jsonc` (or add the custom domain in the dashboard), let it deploy, and turn GitHub Pages off in the repository settings.
3. **Strava**:
   - Create an API app at <https://www.strava.com/settings/api> with callback domain `localhost`.
   - `cp .env.example .env`, fill in `STRAVA_CLIENT_ID` / `STRAVA_CLIENT_SECRET`, run `npm run strava:auth` and approve. This stores `STRAVA_REFRESH_TOKEN` in `.env`.
   - `npm run strava:sync` once locally and look at the result on `/distance/` before committing `src/_data/strava/`.
   - Add repository secrets `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`, `STRAVA_REFRESH_TOKEN`, and `GH_SECRETS_TOKEN` (fine-grained token for this repo only, *Secrets: read and write*, so the daily job can store a rotated refresh token). Optionally `STRAVA_PRIVACY_ZONES` (`lat,lng,radiusMetres;…`).
   - `.github/workflows/strava-sync.yml` then syncs daily and commits when something changed; that push makes Cloudflare rebuild the site.
4. **CMS sign-in** (same setup as technoetkinlik): "Sign in with GitHub" goes through the site's own Worker (`worker/index.js`, `/api/auth`).
   - Create a GitHub OAuth app at <https://github.com/settings/developers> → *OAuth Apps* → *New OAuth App*: homepage `https://engin.al`, callback URL `https://engin.al/api/auth/callback`.
   - In Cloudflare: *Workers & Pages* → `engin-al` → *Settings* → *Variables and secrets*: add `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`, both as type **Secret** (deploys keep secrets; plain variables would be overwritten by `wrangler.jsonc`).
   - Until then, "Sign in with Token" works with a fine-grained GitHub token (*Contents: read and write* on this repo).
5. **Media on R2** (optional, keeps git small): create bucket `enginal-media` with public domain `media.engin.al`, put `R2_*` keys in `.env`, run `npm run r2:media -- --prune`. Pages then load those images from R2, resized by Cloudflare.

## Strava privacy

- The token only has `activity:read`, so Strava itself leaves out "Only you" activities and privacy-zone data.
- Only races (and rides over `STRAVA_RIDE_MIN_KM`, default 100 km) get a route card. Everything else only feeds the weekly totals, which hold no locations.
- Every route loses its first and last 600 m (`STRAVA_TRIM_M`) and anything inside `STRAVA_PRIVACY_ZONES`, and is simplified before it's written.
- The "Powered by Strava" attribution on `/distance/` is required by Strava's API terms.

## Credits

Fonts: [Bricolage Grotesque](https://github.com/ateliertriay/bricolage) and [Martian Mono](https://github.com/evilmartians/mono), both under the SIL Open Font License (see `src/assets/fonts/`).
