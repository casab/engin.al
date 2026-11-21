// Content hashes in asset file names: _site/assets/css/site.css -> site.3f2a9c1b0d.css, after each production
// build (eleventy.config.js, "eleventy.after", not in `npm run serve`). Every reference is rewritten: absolute
// /assets/... paths anywhere in the site, and ./name.js imports between the scripts. A file is hashed after the
// files it points at, so site.js's name changes when map.js changes and site.css's when a font changes.
// The names change only when the content does, so _headers can cache /assets/* for a year (immutable).
import { readdir, readFile, writeFile, rename, rm } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";

const HASHED = /\.(css|js|woff2)$/;
const TEXT = /\.(html|css|js|xml|json|webmanifest)$/;
const STALE = /\.[0-9a-f]{10}\.(css|js|woff2)$/;

async function* walk(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else yield p;
  }
}
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const url = (out, file) => "/" + path.relative(out, file).split(path.sep).join("/");

export async function hashAssets(out) {
  const assetsDir = path.join(out, "assets");
  const assets = [];
  for await (const f of walk(assetsDir)) {
    if (!HASHED.test(f)) continue;
    // left by an earlier build into the same _site (`npm run build` doesn't clean): the fresh unhashed copy
    // gets the same name back if nothing changed, so the old one can go
    if (STALE.test(f)) await rm(f);
    else assets.push(f);
  }
  const content = new Map();
  for (const f of assets) content.set(f, await readFile(f, f.endsWith(".woff2") ? null : "utf8"));

  // a file's references: absolute /assets/... paths, plus ./name for scripts in the same folder
  const refsTo = (from, to) => {
    const abs = new RegExp(`${esc(url(out, to))}(?=[?#"')\\s]|$)`, "g");
    const rel = path.dirname(from) === path.dirname(to) ? new RegExp(`\\./${esc(path.basename(to))}(?=["'])`, "g") : null;
    return [abs, rel].filter(Boolean);
  };
  const dependsOn = (from, to) => from !== to && typeof content.get(from) === "string" && refsTo(from, to).some((re) => re.test(content.get(from)));

  // hash leaves first (fonts, lazily imported scripts), then whatever points at them
  const renamed = new Map(); // old absolute path -> new absolute path
  const pending = new Set(assets);
  while (pending.size) {
    const ready = [...pending].filter((f) => ![...pending].some((g) => dependsOn(f, g)));
    if (!ready.length) throw new Error(`[hash] circular references between ${[...pending].map((f) => url(out, f)).join(", ")}`);
    for (const f of ready) {
      let body = content.get(f);
      if (typeof body === "string") body = rewrite(body, f, renamed, out);
      const hash = createHash("sha256").update(body).digest("hex").slice(0, 10);
      const ext = path.extname(f);
      const next = path.join(path.dirname(f), `${path.basename(f, ext)}.${hash}${ext}`);
      if (typeof body === "string") await writeFile(f, body);
      await rename(f, next);
      renamed.set(f, next);
      pending.delete(f);
    }
  }

  // and every page, feed and data file outside /assets/
  let pages = 0;
  for await (const f of walk(out)) {
    if (!TEXT.test(f) || f.startsWith(assetsDir + path.sep) || f.includes(`${path.sep}admin${path.sep}`)) continue;
    const before = await readFile(f, "utf8");
    const after = rewrite(before, f, renamed, out);
    if (after !== before) { await writeFile(f, after); pages += 1; }
  }
  return { assets: renamed.size, pages };
}

function rewrite(text, from, renamed, out) {
  for (const [oldFile, newFile] of renamed) {
    text = text.replace(new RegExp(`${esc(url(out, oldFile))}(?=[?#"')\\s]|$)`, "g"), url(out, newFile));
    if (path.dirname(from) === path.dirname(oldFile))
      text = text.replace(new RegExp(`\\./${esc(path.basename(oldFile))}(?=["'])`, "g"), `./${path.basename(newFile)}`);
  }
  return text;
}
