// Upload media to the R2 bucket enginal-media (public at https://media.engin.al) with wrangler.
//
// No R2 access keys (as on technoetkinlik and uncvl.xyz): every write runs `wrangler r2 object put --remote`
// with your own Cloudflare login (`npx wrangler login` once). Nothing to put in .env.
//
// Commands:
//   npm run r2:media -- [--prune] [--dry-run]
//       Uploads every image in src/{projects,sound,distance,notes,stops} to the bucket
//       (key = path inside src/, e.g. projects/dtx-choke/cover.jpg) and records it in
//       src/_data/media.json (width, height, version). Pages then load it from media.engin.al,
//       resized by Cloudflare (/cdn-cgi/image).
//       --prune deletes local copies once the public copy is verified (same MD5), so git stays small.
//   npm run r2:file -- <localPath> <key> [--dry-run]
//       Uploads one file (e.g. an audio preview or a video) and records it in the manifest.
//
// Files whose content matches the manifest are skipped.
import { createHash } from "node:crypto";
import { readFile, writeFile, readdir, unlink } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

const BUCKET = "enginal-media";
const PUBLIC_BASE = "https://media.engin.al";
const MANIFEST = "src/_data/media.json";
const MEDIA_DIRS = ["projects", "sound", "distance", "notes", "stops"];
const IMAGE_EXT = /\.(jpe?g|png|webp|avif|gif)$/i;
const IMMUTABLE = "public, max-age=31536000, immutable"; // URLs carry ?v=<hash>, so new content gets a new URL
const TYPES = {
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".avif": "image/avif",
  ".gif": "image/gif", ".svg": "image/svg+xml", ".mp4": "video/mp4", ".webm": "video/webm", ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4", ".wav": "audio/wav", ".pdf": "application/pdf",
};
const contentType = (f) => TYPES[path.extname(f).toLowerCase()] || "application/octet-stream";
const md5 = (buf) => createHash("md5").update(buf).digest("hex");
const toKey = (p) => p.split(path.sep).join("/");

// Run the project's own wrangler with node directly (no shell, so odd file names can't break anything).
const WRANGLER = path.resolve("node_modules/wrangler/bin/wrangler.js");
if (!existsSync(WRANGLER)) { console.error("Run this from the repository root after `npm ci` (wrangler not found)."); process.exit(1); }
function put(file, key) {
  const args = [WRANGLER, "r2", "object", "put", `${BUCKET}/${key}`, "--file", file,
    "--content-type", contentType(file), "--cache-control", IMMUTABLE, "--remote"];
  const r = spawnSync(process.execPath, args, { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`wrangler r2 object put ${key} failed:\n${(r.stderr || r.stdout || "").trim()}`);
}

// The public copy is verified before a local file is deleted: R2's ETag is the MD5 of a single-part upload.
async function publicMd5(key) {
  const res = await fetch(`${PUBLIC_BASE}/${key.split("/").map(encodeURIComponent).join("/")}`, { method: "HEAD", cache: "no-store" });
  return res.ok ? (res.headers.get("etag") || "").replace(/"/g, "") : null;
}

async function* walk(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else yield p;
  }
}
async function readManifest() {
  try { return JSON.parse(await readFile(MANIFEST, "utf8")); } catch { return {}; }
}
async function writeManifest(m) {
  const sorted = Object.fromEntries(Object.entries(m).sort(([a], [b]) => a.localeCompare(b)));
  await writeFile(MANIFEST, JSON.stringify(sorted, null, 2) + "\n");
}
async function describe(file, hash, bytes) {
  const entry = { v: hash.slice(0, 10), bytes };
  if (IMAGE_EXT.test(file)) {
    const { default: sharp } = await import("sharp");
    const m = await sharp(file).metadata();
    Object.assign(entry, { w: m.width, h: m.height });
  } else entry.type = contentType(file).split(";")[0];
  return entry;
}

async function upload(file, key, manifest, { dryRun }) {
  const buf = await readFile(file);
  const hash = md5(buf);
  const same = manifest[key] && manifest[key].v === hash.slice(0, 10);
  const kb = String(Math.round(buf.length / 1024)).padStart(6);
  if (same) { console.log(`unchanged    ${kb} KB  ${key}`); return hash; }
  if (dryRun) { console.log(`would upload ${kb} KB  ${key}`); return hash; }
  put(file, key);
  manifest[key] = await describe(file, hash, buf.length);
  console.log(`uploaded     ${kb} KB  ${key}`);
  return hash;
}

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith("--")));
const [cmd, ...pos] = args.filter((a) => !a.startsWith("--"));
const dryRun = flags.has("--dry-run");
const manifest = await readManifest();

if (cmd === "media") {
  const files = [];
  for (const dir of MEDIA_DIRS) {
    try { for await (const f of walk(path.join("src", dir))) if (IMAGE_EXT.test(f)) files.push(f); } catch {}
  }
  let pruned = 0;
  for (const file of files) {
    const key = toKey(path.relative("src", file));
    const hash = await upload(file, key, manifest, { dryRun });
    if (!dryRun) await writeManifest(manifest);
    if (!dryRun && flags.has("--prune") && (await publicMd5(key)) === hash) { await unlink(file); pruned++; }
  }
  console.log(`[r2] ${files.length} image(s) → ${BUCKET}${flags.has("--prune") ? `, ${pruned} local copies removed` : ""}. Manifest: ${MANIFEST}`);
} else if (cmd === "file") {
  const [file, key] = pos;
  if (!file || !key) { console.error("usage: npm run r2:file -- <localPath> <key>"); process.exit(1); }
  await upload(file, key, manifest, { dryRun });
  if (!dryRun) await writeManifest(manifest);
} else {
  console.error("usage: npm run r2:media -- [--prune] [--dry-run]   |   npm run r2:file -- <path> <key>");
  process.exit(1);
}
