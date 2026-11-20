// Writes clearly-marked DEMO data for the distance page, so the layout can be worked on before
// the first real Strava sync. Never commit the result: `npm run check` fails in CI while it's there.
//   node scripts/strava-demo.mjs          write demo data
//   node scripts/strava-demo.mjs --clear  back to the empty cache
import { writeFile, mkdir, readdir, unlink } from "node:fs/promises";
import path from "node:path";
import { prepareRoute, weeklyTotals } from "./strava-sync.mjs";

const OUT = "src/_data/strava", ROUTES = path.join(OUT, "routes");
await mkdir(ROUTES, { recursive: true });
for (const f of await readdir(ROUTES)) if (f.endsWith(".json")) await unlink(path.join(ROUTES, f));

if (process.argv.includes("--clear")) {
  await writeFile(path.join(OUT, "activities.json"), JSON.stringify({ synced_at: null, activities: [], weekly: {} }, null, 2) + "\n");
  console.log("[strava-demo] cleared");
  process.exit(0);
}

let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
// a wobbly loop or out-and-back somewhere on a fictional grid (not a real place)
function fakeTrack(km, kind) {
  const pts = [], alt = [], n = Math.round(km * 40);
  const lat0 = 10 + rnd() * 0.1, lng0 = 20 + rnd() * 0.1, r = km / (2 * Math.PI) / 111;
  const a = 2 + Math.floor(rnd() * 4), b = rnd() * 6;
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * Math.PI * 2;
    const wob = 1 + 0.25 * Math.sin(a * t + b) + 0.08 * Math.sin(11 * t);
    const p = kind === "loop" ? [lat0 + Math.sin(t) * r * wob, lng0 + Math.cos(t) * r * wob * 1.3] : [lat0 + (i / n) * r * 2 * Math.sin(b), lng0 + Math.sin(t * 2) * r * 0.6 + (i / n) * r * 3];
    pts.push(p);
    alt.push(40 + 30 * Math.sin(t * a) + 12 * Math.sin(t * 9) + (kind === "loop" ? 0 : 120 * Math.sin(t / 2)));
  }
  return { pts, alt };
}

const shown = [
  ["DEMO · City half marathon", "run", 21.1, 6000, "2026-10-12", "loop"],
  ["DEMO · Autumn marathon", "run", 42.2, 12600, "2025-11-09", "loop"],
  ["DEMO · Coast ride", "ride", 142, 18200, "2026-06-21", "line"],
  ["DEMO · Spring half", "run", 21.1, 6300, "2026-04-26", "loop"],
];
const activities = [];
for (const [i, [name, sport, km, sec, date, kind]] of shown.entries()) {
  const id = 9000000000 + i;
  const t = fakeTrack(km, kind);
  const route = prepareRoute(t.pts, t.alt);
  if (route) await writeFile(path.join(ROUTES, `${id}.json`), JSON.stringify(route) + "\n");
  activities.push({ id, name, sport, sport_type: sport === "run" ? "Run" : "Ride", date: date + "T09:00:00Z", distance_m: km * 1000, moving_s: sec, elapsed_s: sec + 60, elev_m: Math.round(km * 4), race: sport === "run", has_route: !!route });
}
const all = [];
for (let d = Date.UTC(2024, 0, 1); d < Date.UTC(2026, 10, 20); d += 86400000) {
  const season = 0.6 + 0.4 * Math.sin(d / 86400000 / 58);
  if (rnd() < 0.45) all.push({ sport_type: "Run", start_date_local: new Date(d).toISOString(), distance: (5 + rnd() * 12 * season) * 1000 });
  if (rnd() < 0.08) all.push({ sport_type: "Ride", start_date_local: new Date(d).toISOString(), distance: (25 + rnd() * 70) * 1000 });
}
await writeFile(path.join(OUT, "activities.json"), JSON.stringify({ demo: true, synced_at: new Date().toISOString(), activities, weekly: weeklyTotals(all) }, null, 1) + "\n");
console.log(`[strava-demo] wrote ${activities.length} demo activities. Run with --clear before committing.`);
