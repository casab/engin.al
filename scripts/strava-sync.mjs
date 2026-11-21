// Pull activities from Strava and write a small, privacy-trimmed cache for the distance page.
//
//   node --env-file-if-exists=.env scripts/strava-sync.mjs        (npm run strava:sync)
//
// Env: STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET, STRAVA_REFRESH_TOKEN (from `npm run strava:auth`)
// Optional:
//   STRAVA_RUN_MIN_KM         runs at least this long are shown (default 9.5); races always are
//   STRAVA_RIDE_MIN_KM        rides at least this long are shown (default 20); races always are
//   STRAVA_MAX_ROUTES         new route downloads per sync (default 80): Strava allows 100 requests per
//                             15 minutes, so a big backlog fills in over the next daily syncs
//   STRAVA_TRIM_M             metres cut from both ends of every route (default 600)
//   STRAVA_PRIVACY_ZONES      "lat,lng,radiusM;lat,lng,radiusM": points inside are dropped as well
//   STRAVA_TOKEN_OUT          file to write a rotated refresh token to (CI updates the repo secret from it)
//
// Output (committed; builds never call Strava):
//   src/_data/strava/activities.json   { synced_at, activities: [...shown], weekly: { year: { run: [53], ride: [53], run_km, ride_km } } }
//   src/_data/strava/routes/<id>.json  { latlng: [[lat,lng]...], alt: [m...] }  trimmed + simplified
//
// Which activities are shown: races, runs of at least STRAVA_RUN_MIN_KM, rides of at least STRAVA_RIDE_MIN_KM
// (not virtual), plus anything with `show: true` in src/distance/<id>.md. `hidden: true` there removes one;
// `duplicate: true` also leaves it out of the weekly totals (a partial second recording of the same activity).
// Everything else only feeds the weekly totals. Duplicate uploads (same sport and start minute) count once. The token uses the `activity:read` scope, so Strava itself
// leaves out "Only you" activities and privacy-zone data; the trim and zones here are a second layer.

import { readFile, writeFile, readdir, mkdir, unlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const OUT = "src/_data/strava";
const ROUTES = path.join(OUT, "routes");
const API = "https://www.strava.com/api/v3";
const env = process.env;
const RUN_MIN_M = Number(env.STRAVA_RUN_MIN_KM || 9.5) * 1000;
const RIDE_MIN_M = Number(env.STRAVA_RIDE_MIN_KM || 20) * 1000;
const MAX_ROUTES = Number(env.STRAVA_MAX_ROUTES || 80);
const TRIM_M = Number(env.STRAVA_TRIM_M || 600);
const ZONES = String(env.STRAVA_PRIVACY_ZONES || "")
  .split(";").map((z) => z.split(",").map(Number)).filter((z) => z.length === 3 && z.every(Number.isFinite));

const RUN = new Set(["Run", "TrailRun", "VirtualRun"]);
const RIDE = new Set(["Ride", "GravelRide", "MountainBikeRide", "VirtualRide", "EBikeRide", "EMountainBikeRide"]);
const sportOf = (a) => (RUN.has(a.sport_type || a.type) ? "run" : RIDE.has(a.sport_type || a.type) ? "ride" : null);

// ---------------------------------------------------------------- geometry
const rad = (d) => (d * Math.PI) / 180;
export function haversine([lat1, lng1], [lat2, lng2]) {
  const dLat = rad(lat2 - lat1), dLng = rad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(a));
}

/** Drop the first and last `m` metres of a track (and keep altitude in step). */
export function trimEnds(latlng, alt, m) {
  if (latlng.length < 2) return { latlng, alt };
  const d = [0];
  for (let i = 1; i < latlng.length; i++) d.push(d[i - 1] + haversine(latlng[i - 1], latlng[i]));
  const total = d[d.length - 1];
  if (total <= m * 2 + 200) return { latlng: [], alt: [] }; // too short to trim safely: show nothing
  const keep = d.map((x) => x >= m && x <= total - m);
  return { latlng: latlng.filter((_, i) => keep[i]), alt: alt ? alt.filter((_, i) => keep[i]) : alt };
}

export function dropZones(latlng, alt, zones) {
  if (!zones.length) return { latlng, alt };
  const keep = latlng.map((p) => zones.every(([lat, lng, r]) => haversine(p, [lat, lng]) > r));
  return { latlng: latlng.filter((_, i) => keep[i]), alt: alt ? alt.filter((_, i) => keep[i]) : alt };
}

/** Ramer–Douglas–Peucker on a local metric projection. Returns kept indices. */
export function simplify(latlng, epsM = 8) {
  if (latlng.length < 3) return latlng.map((_, i) => i);
  const lat0 = rad(latlng[0][0]);
  const xy = latlng.map(([lat, lng]) => [rad(lng) * Math.cos(lat0) * 6371000, rad(lat) * 6371000]);
  const keep = new Uint8Array(xy.length);
  keep[0] = keep[xy.length - 1] = 1;
  const stack = [[0, xy.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop();
    const [ax, ay] = xy[s], [bx, by] = xy[e];
    const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy) || 1;
    let max = 0, idx = -1;
    for (let i = s + 1; i < e; i++) {
      const dist = Math.abs(dy * xy[i][0] - dx * xy[i][1] + bx * ay - by * ax) / len;
      if (dist > max) { max = dist; idx = i; }
    }
    if (max > epsM && idx > 0) { keep[idx] = 1; stack.push([s, idx], [idx, e]); }
  }
  return [...keep.keys()].filter((i) => keep[i]);
}

export function prepareRoute(latlng, alt) {
  let r = dropZones(latlng, alt, ZONES);
  r = trimEnds(r.latlng, r.alt, TRIM_M);
  if (r.latlng.length < 10) return null;
  let eps = 6, idx = simplify(r.latlng, eps);
  while (idx.length > 700) idx = simplify(r.latlng, (eps *= 1.5));
  return {
    latlng: idx.map((i) => r.latlng[i].map((v) => Math.round(v * 1e5) / 1e5)),
    alt: r.alt && r.alt.length === r.latlng.length ? idx.map((i) => Math.round(r.alt[i])) : undefined,
  };
}

// ---------------------------------------------------------------- duplicates
// The same activity uploaded twice (a later re-import, a second upload of the file): same sport, same start
// minute. The older upload (lower id) stays; the copy feeds neither the list nor the weekly totals.
export function dropDuplicates(list) {
  const first = new Map();
  for (const a of [...list].sort((x, y) => x.id - y.id)) {
    const key = `${sportOf(a)}|${String(a.start_date).slice(0, 16)}`;
    if (!first.has(key)) first.set(key, a.id);
  }
  const keep = new Set(first.values());
  return list.filter((a) => keep.has(a.id));
}

// ---------------------------------------------------------------- weekly totals
export function weeklyTotals(list) {
  const weekly = {};
  for (const a of list) {
    const sport = sportOf(a);
    if (!sport) continue;
    const d = new Date((a.start_date_local || a.start_date).slice(0, 10) + "T00:00:00Z");
    const y = d.getUTCFullYear();
    const day = Math.floor((d - Date.UTC(y, 0, 1)) / 86400000);
    const w = Math.min(52, Math.floor(day / 7));
    weekly[y] ||= { run: Array(53).fill(0), ride: Array(53).fill(0), run_km: 0, ride_km: 0 };
    weekly[y][sport][w] += a.distance / 1000;
    weekly[y][sport + "_km"] += a.distance / 1000;
  }
  for (const y of Object.values(weekly)) {
    y.run = y.run.map((v) => Math.round(v * 10) / 10);
    y.ride = y.ride.map((v) => Math.round(v * 10) / 10);
    y.run_km = Math.round(y.run_km);
    y.ride_km = Math.round(y.ride_km);
  }
  return weekly;
}

// ---------------------------------------------------------------- overrides from src/distance/*.md
async function readOverrides() {
  const out = new Map();
  let files = [];
  try { files = (await readdir("src/distance")).filter((f) => f.endsWith(".md")); } catch { return out; }
  for (const f of files) {
    const text = await readFile(path.join("src/distance", f), "utf8");
    const fm = (text.match(/^---\r?\n([\s\S]*?)\r?\n---/) || [])[1] || "";
    const get = (k) => (fm.match(new RegExp(`^${k}:\\s*(.+)$`, "m")) || [])[1]?.trim().replace(/^["']|["']$/g, "");
    const id = get("strava_id") || f.replace(/\.md$/, "");
    out.set(String(id), { show: get("show") === "true", hidden: get("hidden") === "true", duplicate: get("duplicate") === "true" });
  }
  return out;
}

// ---------------------------------------------------------------- Strava API
async function token() {
  for (const k of ["STRAVA_CLIENT_ID", "STRAVA_CLIENT_SECRET", "STRAVA_REFRESH_TOKEN"]) {
    if (!env[k]) { console.error(`[strava] ${k} is not set. Run \`npm run strava:auth\` first (see README).`); process.exit(1); }
  }
  const res = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: env.STRAVA_CLIENT_ID, client_secret: env.STRAVA_CLIENT_SECRET, grant_type: "refresh_token", refresh_token: env.STRAVA_REFRESH_TOKEN }),
  });
  if (!res.ok) throw new Error(`token refresh failed: ${res.status} ${await res.text()}`);
  const t = await res.json();
  if (t.refresh_token && t.refresh_token !== env.STRAVA_REFRESH_TOKEN) await saveRotatedToken(t.refresh_token);
  return t.access_token;
}

// Strava can hand back a new refresh token. Keep it, or the next sync fails.
async function saveRotatedToken(rt) {
  if (env.GITHUB_ACTIONS) console.log(`::add-mask::${rt}`);
  if (env.STRAVA_TOKEN_OUT) {
    await writeFile(env.STRAVA_TOKEN_OUT, rt);
    console.log("[strava] refresh token rotated; written to STRAVA_TOKEN_OUT for the workflow to store");
  } else if (existsSync(".env")) {
    const e = await readFile(".env", "utf8");
    await writeFile(".env", /^STRAVA_REFRESH_TOKEN=.*$/m.test(e) ? e.replace(/^STRAVA_REFRESH_TOKEN=.*$/m, `STRAVA_REFRESH_TOKEN=${rt}`) : e + `\nSTRAVA_REFRESH_TOKEN=${rt}\n`);
    console.log("[strava] refresh token rotated; .env updated");
  } else {
    console.warn("[strava] refresh token rotated, but there is nowhere to save it. Update STRAVA_REFRESH_TOKEN by hand.");
  }
}

let calls = 0;
async function get(access, url) {
  calls++;
  const res = await fetch(API + url, { headers: { authorization: `Bearer ${access}` } });
  if (res.status === 429) throw new Error("rate limited by Strava (100 requests / 15 min). Try again later; the cache is unchanged.");
  if (!res.ok) throw new Error(`GET ${url}: ${res.status} ${await res.text()}`);
  return res.json();
}

async function main() {
  const access = await token();
  const overrides = await readOverrides();

  const uploaded = [];
  for (let page = 1; ; page++) {
    const batch = await get(access, `/athlete/activities?per_page=200&page=${page}`);
    uploaded.push(...batch);
    if (batch.length < 200) break;
  }
  // a partial recording of an activity that's on Strava in full (`duplicate: true` in src/distance/<id>.md)
  // counts nowhere, not even in the weekly totals; `hidden: true` only keeps it off the map
  const all = dropDuplicates(uploaded).filter((a) => !overrides.get(String(a.id))?.duplicate);

  const shown = all.filter((a) => {
    const sport = sportOf(a), o = overrides.get(String(a.id));
    if (!sport || (o && o.hidden)) return false;
    if (o && o.show) return true;
    if (a.visibility === "only_me" || a.private) return false;
    if (sport === "run") return a.workout_type === 1 || a.distance >= RUN_MIN_M;
    return a.workout_type === 11 || (a.distance >= RIDE_MIN_M && !/Virtual/.test(a.sport_type || ""));
  });

  await mkdir(ROUTES, { recursive: true });
  const existing = new Set((await readdir(ROUTES)).filter((f) => f.endsWith(".json")).map((f) => f.replace(/\.json$/, "")));
  const activities = [];
  let fetched = 0, pending = 0, limited = false;
  for (const a of shown) { // newest first, so the latest routes arrive first
    const id = String(a.id);
    let hasRoute = existing.has(id);
    const wantsRoute = !hasRoute && a.map && a.map.summary_polyline && !/Virtual/.test(a.sport_type || "");
    if (wantsRoute && (limited || fetched >= MAX_ROUTES)) pending++;
    else if (wantsRoute) {
      try {
        fetched++;
        const s = await get(access, `/activities/${id}/streams?keys=latlng,altitude&key_by_type=true`);
        const route = s.latlng ? prepareRoute(s.latlng.data, s.altitude && s.altitude.data) : null;
        if (route) { await writeFile(path.join(ROUTES, `${id}.json`), JSON.stringify(route) + "\n"); hasRoute = true; }
      } catch (e) {
        if (!/rate limited/.test(e.message)) throw e;
        limited = true; // keep what we have; the rest comes on the next sync
        pending++;
      }
    }
    activities.push({
      id: a.id,
      name: a.name,
      sport: sportOf(a),
      sport_type: a.sport_type,
      date: a.start_date_local || a.start_date,
      distance_m: Math.round(a.distance),
      moving_s: a.moving_time,
      elapsed_s: a.elapsed_time,
      elev_m: Math.round(a.total_elevation_gain || 0),
      race: a.workout_type === 1 || a.workout_type === 11,
      has_route: hasRoute,
    });
  }
  // routes of activities that are no longer shown (hidden, deleted, made private) go away
  const keepIds = new Set(activities.filter((a) => a.has_route).map((a) => String(a.id)));
  for (const id of existing) if (!keepIds.has(id)) await unlink(path.join(ROUTES, `${id}.json`));

  activities.sort((x, y) => new Date(y.date) - new Date(x.date));
  const data = { synced_at: new Date().toISOString(), activities, weekly: weeklyTotals(all) };

  // only touch the file when something besides the timestamp changed (keeps git history quiet)
  const file = path.join(OUT, "activities.json");
  let prev = null;
  try { prev = JSON.parse(await readFile(file, "utf8")); } catch {}
  const same = prev && JSON.stringify({ ...prev, synced_at: 0 }) === JSON.stringify({ ...data, synced_at: 0 });
  if (!same) await writeFile(file, JSON.stringify(data, null, 1) + "\n");
  console.log(`[strava] ${all.length} activities (${uploaded.length - all.length} duplicates dropped), ${activities.length} shown, ${keepIds.size} routes, ${calls} API calls${same ? ", no changes" : ""}`);
  if (pending) console.log(`[strava] ${pending} route(s) not downloaded yet (limit ${MAX_ROUTES} per sync${limited ? ", hit Strava's rate limit" : ""}); the next sync continues.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((e) => { console.error("[strava]", e.message); process.exit(1); });
}
