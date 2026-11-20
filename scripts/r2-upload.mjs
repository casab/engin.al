// Upload media to Cloudflare R2 (S3-compatible API, no extra dependencies).
//
// Credentials come ONLY from environment variables (never commit them):
//   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY
// Optional: R2_MEDIA_BUCKET (default enginal-media), R2_ARCHIVE_BUCKET (default enginal-archive)
//
// Commands:
//   node scripts/r2-upload.mjs media [--prune] [--dry-run]
//       Uploads every image in src/{projects,sound,distance,notes} to the media bucket
//       (key = path inside src/, e.g. projects/zmk-rgb/cover.jpg) and records it in
//       src/_data/media.json (width, height, version). Pages then load it from media.engin.al.
//       --prune deletes local copies that are verified on R2 (same MD5), so git stays small.
//   node scripts/r2-upload.mjs file <localPath> <key> [--archive] [--dry-run]
//       Uploads one file (e.g. an audio preview or a video). Goes into the manifest unless --archive.
//   node scripts/r2-upload.mjs archive <dir> [prefix] [--dry-run]
//       Mirrors a folder (e.g. raw recordings or stems) into the private archive bucket.
//
// Already-uploaded files with the same content are skipped (ETag = MD5 check).
import { createHash, createHmac } from "node:crypto";
import { readFile, writeFile, readdir, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const MANIFEST = "src/_data/media.json";
const MEDIA_DIRS = ["projects", "sound", "distance", "notes"];
const IMAGE_EXT = /\.(jpe?g|png|webp|avif|gif)$/i;
const TYPES = {
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".avif": "image/avif",
  ".gif": "image/gif", ".svg": "image/svg+xml", ".mp4": "video/mp4", ".webm": "video/webm", ".mp3": "audio/mpeg",
  ".pdf": "application/pdf", ".txt": "text/plain; charset=utf-8", ".json": "application/json",
};
const contentType = (f) => TYPES[path.extname(f).toLowerCase()] || "application/octet-stream";

// ---------------------------------------------------------------- AWS SigV4
const sha256hex = (data) => createHash("sha256").update(data).digest("hex");
const hmac = (key, data) => createHmac("sha256", key).update(data).digest();
// RFC 3986 encoding of each path segment (S3 canonical URI rules)
const encodeKey = (key) =>
  key.split("/").map((s) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase())).join("/");

export function sign({ method, host, uri, headers, payloadHash, accessKey, secretKey, region, service, amzDate }) {
  const date = amzDate.slice(0, 8);
  const all = { ...headers, host, "x-amz-content-sha256": payloadHash, "x-amz-date": amzDate };
  const names = Object.keys(all).map((h) => h.toLowerCase()).sort();
  const lower = Object.fromEntries(Object.entries(all).map(([k, v]) => [k.toLowerCase(), String(v).trim()]));
  const canonicalHeaders = names.map((h) => `${h}:${lower[h]}\n`).join("");
  const signedHeaders = names.join(";");
  const canonicalRequest = [method, uri, "", canonicalHeaders, signedHeaders, payloadHash].join("\n");
  const scope = `${date}/${region}/${service}/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256hex(canonicalRequest)].join("\n");
  const kSigning = hmac(hmac(hmac(hmac("AWS4" + secretKey, date), region), service), "aws4_request");
  const signature = createHmac("sha256", kSigning).update(stringToSign).digest("hex");
  return {
    ...lower,
    authorization: `AWS4-HMAC-SHA256 Credential=${accessKey}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
  };
}

function client() {
  const { R2_ACCOUNT_ID: account, R2_ACCESS_KEY_ID: accessKey, R2_SECRET_ACCESS_KEY: secretKey } = process.env;
  if (!account || !accessKey || !secretKey) {
    console.error("Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY in the environment first.");
    process.exit(1);
  }
  const host = `${account}.r2.cloudflarestorage.com`;
  async function request(method, bucket, key, body, extraHeaders = {}) {
    const payload = body ?? Buffer.alloc(0);
    const amzDate = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
    const uri = `/${bucket}/${encodeKey(key)}`;
    const headers = sign({ method, host, uri, headers: extraHeaders, payloadHash: sha256hex(payload), accessKey, secretKey, region: "auto", service: "s3", amzDate });
    delete headers.host; // fetch sets it
    const res = await fetch(`https://${host}${uri}`, { method, headers, body: method === "PUT" ? payload : undefined });
    return res;
  }
  return {
    async etag(bucket, key) {
      const res = await request("HEAD", bucket, key);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`HEAD ${key}: ${res.status}`);
      return (res.headers.get("etag") || "").replace(/"/g, "");
    },
    async put(bucket, key, body, type, cacheControl) {
      const res = await request("PUT", bucket, key, body, { "content-type": type, "cache-control": cacheControl });
      if (!res.ok) throw new Error(`PUT ${key}: ${res.status} ${await res.text()}`);
    },
  };
}

// ---------------------------------------------------------------- helpers
async function* walk(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else yield p;
  }
}
const toKey = (p) => p.split(path.sep).join("/");
const md5 = (buf) => createHash("md5").update(buf).digest("hex");
async function readManifest() {
  try { return JSON.parse(await readFile(MANIFEST, "utf8")); } catch { return {}; }
}
async function writeManifest(m) {
  const sorted = Object.fromEntries(Object.entries(m).sort(([a], [b]) => a.localeCompare(b)));
  await writeFile(MANIFEST, JSON.stringify(sorted, null, 2) + "\n");
}

async function uploadOne(r2, bucket, file, key, { dryRun, cacheControl }) {
  const buf = await readFile(file);
  const hash = md5(buf);
  const remote = dryRun ? null : await r2.etag(bucket, key);
  const same = remote === hash;
  if (!same && !dryRun) await r2.put(bucket, key, buf, contentType(file), cacheControl);
  console.log(`${dryRun ? "would upload" : same ? "unchanged   " : "uploaded    "} ${String(Math.round(buf.length / 1024)).padStart(6)} KB  ${bucket}/${key}`);
  return { hash, bytes: buf.length };
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

async function pool(items, n, fn) {
  const queue = [...items];
  await Promise.all(Array.from({ length: n }, async () => { while (queue.length) await fn(queue.shift()); }));
}

// ---------------------------------------------------------------- commands
const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) await main();

async function main() {
const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith("--")));
const [cmd, ...pos] = args.filter((a) => !a.startsWith("--"));
const dryRun = flags.has("--dry-run");
const MEDIA = process.env.R2_MEDIA_BUCKET || "enginal-media";
const ARCHIVE = process.env.R2_ARCHIVE_BUCKET || "enginal-archive";
const IMMUTABLE = "public, max-age=31536000, immutable"; // URLs carry ?v=<hash>, so content changes get new URLs

if (cmd === "media") {
  const r2 = dryRun ? null : client();
  const manifest = await readManifest();
  const files = [];
  for (const dir of MEDIA_DIRS) {
    try { for await (const f of walk(path.join("src", dir))) if (IMAGE_EXT.test(f)) files.push(f); } catch {}
  }
  let pruned = 0;
  await pool(files, 4, async (file) => {
    const key = toKey(path.relative("src", file));
    const { hash, bytes } = await uploadOne(r2, MEDIA, file, key, { dryRun, cacheControl: IMMUTABLE });
    if (dryRun) return;
    manifest[key] = await describe(file, hash, bytes);
    if (flags.has("--prune") && (await r2.etag(MEDIA, key)) === hash) { await unlink(file); pruned++; }
  });
  if (!dryRun) await writeManifest(manifest);
  console.log(`[r2] ${files.length} image(s) → ${MEDIA}${flags.has("--prune") ? `, ${pruned} local copies removed` : ""}. Manifest: ${MANIFEST}`);
} else if (cmd === "file") {
  const [file, key] = pos;
  if (!file || !key) { console.error("usage: r2-upload.mjs file <localPath> <key> [--archive]"); process.exit(1); }
  const bucket = flags.has("--archive") ? ARCHIVE : MEDIA;
  const r2 = dryRun ? null : client();
  const { hash, bytes } = await uploadOne(r2, bucket, file, key, { dryRun, cacheControl: bucket === MEDIA ? IMMUTABLE : "private, no-store" });
  if (!dryRun && bucket === MEDIA) {
    const manifest = await readManifest();
    manifest[key] = await describe(file, hash, bytes);
    await writeManifest(manifest);
  }
} else if (cmd === "archive") {
  const [dir, prefix = path.basename(path.resolve(pos[0] || "."))] = pos;
  if (!dir) { console.error("usage: r2-upload.mjs archive <dir> [prefix]"); process.exit(1); }
  const r2 = dryRun ? null : client();
  const files = [];
  for await (const f of walk(dir)) files.push(f);
  let total = 0;
  await pool(files, 4, async (file) => {
    const key = `${prefix}/${toKey(path.relative(dir, file))}`;
    total += (await stat(file)).size;
    await uploadOne(r2, ARCHIVE, file, key, { dryRun, cacheControl: "private, no-store" });
  });
  console.log(`[r2] ${files.length} file(s), ${(total / 1048576).toFixed(1)} MB → ${ARCHIVE}/${prefix}/`);
} else {
  console.error("usage: r2-upload.mjs media [--prune] | file <path> <key> [--archive] | archive <dir> [prefix]   (add --dry-run to preview)");
  process.exit(1);
}
}
