// Rename activities on Strava (and mark races) from scripts/strava-renames.json, then mirror the names into
// src/_data/strava/activities.json so the site matches before the next sync.
//
//   npm run strava:rename               dry run: prints current → new, changes nothing
//   npm run strava:rename -- --apply    asks Strava for write access once, renames, updates activities.json
//
// Writing needs the `activity:write` scope, which the sync token deliberately doesn't have. So --apply runs its
// own one-time authorisation (same app, same localhost callback as `npm run strava:auth`) and keeps that token
// in memory only: nothing is written to .env, and the read-only sync token is untouched.

import http from "node:http";
import { readFile, writeFile } from "node:fs/promises";

const APPLY = process.argv.includes("--apply");
const DATA = "src/_data/strava/activities.json";
const { renames } = JSON.parse(await readFile("scripts/strava-renames.json", "utf8"));
const data = JSON.parse(await readFile(DATA, "utf8"));
const byId = new Map(data.activities.map((a) => [a.id, a]));

const changes = renames.filter((r) => {
  const a = byId.get(r.id);
  return !a || a.name !== r.name || (r.race && !a.race);
});
for (const r of renames) {
  const a = byId.get(r.id);
  const mark = changes.includes(r) ? "→" : "=";
  console.log(`${r.date}  ${String(r.id).padEnd(12)} ${a ? a.name : "(not in activities.json)"}  ${mark}  ${r.name}${r.race && !(a && a.race) ? "  [+race]" : ""}`);
}
if (!changes.length) { console.log("\nNothing to change."); process.exit(0); }
if (!APPLY) { console.log(`\n${changes.length} to change. Dry run: add -- --apply to write them to Strava.`); process.exit(0); }

const { STRAVA_CLIENT_ID: id, STRAVA_CLIENT_SECRET: secret } = process.env;
if (!id || !secret) { console.error("Set STRAVA_CLIENT_ID and STRAVA_CLIENT_SECRET in .env first."); process.exit(1); }

const PORT = 8723;
const redirect = `http://localhost:${PORT}/callback`;
const token = await new Promise((resolve, reject) => {
  const server = http.createServer(async (req, res) => {
    const u = new URL(req.url, redirect);
    if (u.pathname !== "/callback") { res.writeHead(404).end(); return; }
    const code = u.searchParams.get("code");
    const scope = u.searchParams.get("scope") || "";
    server.close();
    if (!code || !scope.includes("activity:write")) {
      res.writeHead(400).end("Write access wasn't granted. Nothing changed.");
      return reject(new Error("no code or no activity:write scope"));
    }
    const r = await fetch("https://www.strava.com/oauth/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: id, client_secret: secret, code, grant_type: "authorization_code" }),
    });
    if (!r.ok) { res.writeHead(500).end("Token exchange failed, see the terminal."); return reject(new Error(`${r.status} ${await r.text()}`)); }
    res.writeHead(200, { "content-type": "text/plain; charset=utf-8" }).end("Done. You can close this tab and go back to the terminal.");
    resolve((await r.json()).access_token);
  });
  const url = "https://www.strava.com/oauth/authorize?" + new URLSearchParams({
    client_id: id, redirect_uri: redirect, response_type: "code", approval_prompt: "force", scope: "read,activity:read,activity:write",
  });
  server.listen(PORT, "127.0.0.1", () => console.log(`\nOpen this URL and approve write access (used once, not saved):\n\n  ${url}\n`));
});

let done = 0;
for (const r of changes) {
  const a = byId.get(r.id);
  const body = { name: r.name };
  if (r.race) body.workout_type = a && a.sport === "ride" ? 11 : 1; // Strava: 1 = race (run), 11 = race (ride)
  const res = await fetch(`https://www.strava.com/api/v3/activities/${r.id}`, {
    method: "PUT",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) { console.error(`✗ ${r.id} ${r.name}: ${res.status} ${await res.text()}`); continue; }
  if (a) { a.name = r.name; if (r.race) a.race = true; }
  done += 1;
  console.log(`✓ ${r.id} ${r.name}`);
}
await writeFile(DATA, JSON.stringify(data, null, 1) + "\n"); // same format as strava-sync.mjs
console.log(`\n${done}/${changes.length} renamed on Strava; ${DATA} updated. Commit it, or let the daily sync pick the names up.`);
