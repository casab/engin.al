// Post-build sanity checks on _site (no dependencies):
//  - every internal href/src resolves to a file
//  - every <img> has an alt attribute
//  - no inline <script> code or style="" attributes (they would break the strict CSP)
//  - every page has a share card in _site/og/ (scripts/og.mjs)
//  - no demo Strava data in CI (CI env var or --ci, used by the Cloudflare build)
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

const ROOT = "_site";
const errors = [];

async function* walk(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else yield p;
  }
}
const exists = async (p) => !!(await stat(p).catch(() => null));

async function resolves(urlPath) {
  const clean = decodeURI(urlPath.split(/[?#]/)[0]);
  if (!clean) return true;
  const p = path.join(ROOT, clean);
  if (clean.endsWith("/")) return exists(path.join(p, "index.html"));
  return (await exists(p)) || exists(path.join(p, "index.html"));
}

let pages = 0;
for await (const file of walk(ROOT)) {
  if (!file.endsWith(".html") || file.includes(`${path.sep}admin${path.sep}`)) continue;
  pages++;
  const html = await readFile(file, "utf8");
  const rel = "/" + path.relative(ROOT, file).split(path.sep).join("/");

  for (const m of html.matchAll(/\s(?:href|src)="([^"]+)"/g)) {
    const url = m[1];
    if (/^(https?:|mailto:|tel:|data:|#)/.test(url)) continue;
    const abs = url.startsWith("/") ? url : path.posix.join(path.posix.dirname(rel), url);
    if (!(await resolves(abs))) errors.push(`${rel}: broken link ${url}`);
  }
  for (const m of html.matchAll(/\ssrcset="([^"]+)"/g)) {
    for (const part of m[1].split(",")) {
      const url = part.trim().split(/\s+/)[0];
      if (url.startsWith("/") && !(await resolves(url))) errors.push(`${rel}: broken srcset ${url}`);
    }
  }
  // every page's share card (og:image, drawn by scripts/og.mjs) must exist
  const og = html.match(/<meta property="og:image" content="https:\/\/engin\.al(\/og\/[^"]+)"/);
  if (!og) errors.push(`${rel}: no share card (og:image)`);
  else if (!(await exists(path.join(ROOT, og[1])))) errors.push(`${rel}: share card ${og[1]} was not drawn`);
  for (const m of html.matchAll(/<img\b[^>]*>/g)) if (!/\balt=/.test(m[0])) errors.push(`${rel}: <img> without alt`);
  if (/\sstyle="/.test(html)) errors.push(`${rel}: inline style attribute (blocked by CSP)`);
  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
    const [, attrs, body] = m;
    if (body.trim() && !/type="application\/(ld\+)?json"/.test(attrs)) errors.push(`${rel}: inline <script> (blocked by CSP)`);
  }
}

// demo Strava data (scripts/strava-demo.mjs) must never reach production
try {
  const strava = JSON.parse(await readFile("src/_data/strava/activities.json", "utf8"));
  const msg = "src/_data/strava/activities.json holds DEMO data: run `node scripts/strava-demo.mjs --clear`";
  if (strava.demo && (process.env.CI || process.argv.includes("--ci"))) errors.push(msg);
  else if (strava.demo) console.warn(`[check] warning: ${msg}`);
} catch {}

if (errors.length) {
  console.error(errors.join("\n"));
  console.error(`\n[check] ${errors.length} problem(s) in ${pages} pages`);
  process.exit(1);
}
console.log(`[check] ${pages} pages OK`);
