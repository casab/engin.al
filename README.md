# engin.al

Personal site of Engin Al: **things that oscillate**. Code, circuits, sound and distance, shown as four channels of one oscilloscope.

Static site built with [Eleventy](https://www.11ty.dev/), edited with [Sveltia CMS](https://sveltiacms.app/) at `/admin/`, deployed to Cloudflare as an assets-only Worker with the [`cf` CLI](https://developers.cloudflare.com/cf/). No framework, no trackers. The hero is a hand-written WebGL2 phosphor scope that also works as a tiny synth.

## Develop

```sh
npm ci
npm run serve        # http://localhost:8080 (drafts are shown, marked "draft")
npm run build        # → _site/ (drafts hidden)
npm run check        # broken links, missing alt text, CSP-unsafe markup, demo data
npm run strava:demo  # fake races for layout work; `node scripts/strava-demo.mjs --clear` before committing
```

Node 22.9+.

## Layout

| Path | What |
|---|---|
| `src/projects/<slug>/index.md` | a project; images next to it. `channels: [code, circuits, sound]`, first one sets the colour |
| `src/sound/<slug>/index.md` | a live set, mix, track or release; `embed_url` becomes a click-to-load player |
| `src/distance/<strava-id>.md` | optional note/title/photo for a synced Strava activity, or `show: true` / `hidden: true` |
| `src/notes/*.md` | occasional longer notes |
| `src/_data/{now,about,rig,site}.json` | the Now page, About page, instrument list, site settings (all editable in the CMS) |
| `src/_data/strava/` | Strava cache written by `scripts/strava-sync.mjs`, committed |
| `src/_lib/signal.js` | build-time SVG geometry: route traces, elevation profiles, weekly waveforms, project sigils |
| `src/assets/js/scope.js` | the WebGL2 oscilloscope (persistence + bloom), with a 2D-canvas fallback |
| `src/assets/js/synth.js` | Web Audio synth that drives the scope with its real output (keys A–K, tap/drag on the scope) |
| `public/admin/config.yml` | Sveltia CMS collections |
| `public/_headers`, `public/_redirects` | CSP and caching; old blog URLs → new ones |
| `cloudflare.config.ts` | Worker name, asset handling, custom domain |

Content written as `draft: true` is visible in `npm run serve` and hidden in production.

## Edit

See [docs/EDITING.md](docs/EDITING.md). Short version: open `/admin/`, sign in, edit, save. The site rebuilds in about a minute.

## One-time setup

1. **Cloudflare**: create an API token with *Workers Scripts: Edit* for the account, and add repository secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`. The first push to `main` creates the `engin-al` Worker. Pull requests get a Worker Preview URL.
2. **Domain**: engin.al currently points at GitHub Pages. Once the zone is on Cloudflare, uncomment `domains: ["engin.al"]` in `cloudflare.config.ts` (the token then also needs zone permissions), deploy, and turn GitHub Pages off in the repository settings.
3. **Strava**:
   - Create an API app at <https://www.strava.com/settings/api> with callback domain `localhost`.
   - `cp .env.example .env`, fill in `STRAVA_CLIENT_ID` / `STRAVA_CLIENT_SECRET`, run `npm run strava:auth` and approve. This stores `STRAVA_REFRESH_TOKEN` in `.env`.
   - `npm run strava:sync` once locally and look at the result on `/distance/` before committing `src/_data/strava/`.
   - Add repository secrets `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`, `STRAVA_REFRESH_TOKEN`, and `GH_SECRETS_TOKEN` (fine-grained token for this repo only, *Secrets: read and write*, so the daily job can store a rotated refresh token). Optionally `STRAVA_PRIVACY_ZONES` (`lat,lng,radiusMetres;…`).
   - `.github/workflows/strava-sync.yml` then syncs daily and deploys when something changed.
4. **CMS sign-in**: works right away with "Sign in with Token" (fine-grained GitHub token, *Contents: read and write* on this repo). For a one-click GitHub button, deploy [sveltia-cms-auth](https://github.com/sveltia/sveltia-cms-auth) and set `base_url` in `public/admin/config.yml`.
5. **Media on R2** (optional, keeps git small): create bucket `enginal-media` with public domain `media.engin.al`, put `R2_*` keys in `.env`, run `npm run r2:media -- --prune`. Pages then load those images from R2, resized by Cloudflare.

## Strava privacy

- The token only has `activity:read`, so Strava itself leaves out "Only you" activities and privacy-zone data.
- Only races (and rides over `STRAVA_RIDE_MIN_KM`, default 100 km) get a route card. Everything else only feeds the weekly totals, which hold no locations.
- Every route loses its first and last 600 m (`STRAVA_TRIM_M`) and anything inside `STRAVA_PRIVACY_ZONES`, and is simplified before it's written.
- The "Powered by Strava" attribution on `/distance/` is required by Strava's API terms.

## Credits

Fonts: [Bricolage Grotesque](https://github.com/ateliertriay/bricolage) and [Martian Mono](https://github.com/evilmartians/mono), both under the SIL Open Font License (see `src/assets/fonts/`).
