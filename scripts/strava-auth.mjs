// One-time Strava authorisation: gets the first refresh token and stores it in .env.
//
// 1. Create an API application at https://www.strava.com/settings/api
//    "Authorization Callback Domain": localhost
// 2. Put STRAVA_CLIENT_ID and STRAVA_CLIENT_SECRET in .env (see .env.example)
// 3. npm run strava:auth  → open the printed URL, approve, done.
//
// Scope is `activity:read`: Strava then leaves out "Only you" activities and privacy-zone data.

import http from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";

const { STRAVA_CLIENT_ID: id, STRAVA_CLIENT_SECRET: secret } = process.env;
if (!id || !secret) {
  console.error("Set STRAVA_CLIENT_ID and STRAVA_CLIENT_SECRET in .env first (see .env.example).");
  process.exit(1);
}
const PORT = 8723;
const redirect = `http://localhost:${PORT}/callback`;
const url = "https://www.strava.com/oauth/authorize?" + new URLSearchParams({
  client_id: id, redirect_uri: redirect, response_type: "code", approval_prompt: "auto", scope: "read,activity:read",
});

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, redirect);
  if (u.pathname !== "/callback") { res.writeHead(404).end(); return; }
  const code = u.searchParams.get("code");
  if (!code) { res.writeHead(400).end("No code. Did you cancel?"); return; }
  try {
    const r = await fetch("https://www.strava.com/oauth/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: id, client_secret: secret, code, grant_type: "authorization_code" }),
    });
    if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
    const t = await r.json();
    let e = existsSync(".env") ? await readFile(".env", "utf8") : "";
    e = /^STRAVA_REFRESH_TOKEN=.*$/m.test(e) ? e.replace(/^STRAVA_REFRESH_TOKEN=.*$/m, `STRAVA_REFRESH_TOKEN=${t.refresh_token}`) : e.replace(/\n?$/, "\n") + `STRAVA_REFRESH_TOKEN=${t.refresh_token}\n`;
    await writeFile(".env", e);
    res.writeHead(200, { "content-type": "text/plain; charset=utf-8" }).end("Done. You can close this tab.");
    console.log(`Authorised as ${t.athlete?.firstname ?? "athlete"}. STRAVA_REFRESH_TOKEN saved to .env.`);
    console.log("Next: npm run strava:sync, and add the same token as the STRAVA_REFRESH_TOKEN repo secret.");
  } catch (err) {
    res.writeHead(500).end("Token exchange failed, see the terminal.");
    console.error("Token exchange failed:", err.message);
  }
  server.close();
});
server.listen(PORT, "127.0.0.1", () => console.log(`Open this URL and approve access:\n\n  ${url}\n`));
