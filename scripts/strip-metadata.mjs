// Losslessly removes EXIF / XMP / IPTC / comments from JPEG and PNG files (pixels are not re-encoded).
// The colour profile (ICC) is kept. Usage: node scripts/strip-metadata.mjs [dir ...]   (default: src)
import { readFile, writeFile, readdir } from "node:fs/promises";
import path from "node:path";

async function* walk(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else yield p;
  }
}

function stripJpeg(buf) {
  if (buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  const out = [buf.subarray(0, 2)];
  let i = 2;
  while (i < buf.length) {
    if (buf[i] !== 0xff) return null; // unexpected; leave the file alone
    const marker = buf[i + 1];
    if (marker === 0xda) { out.push(buf.subarray(i)); break; } // start of scan: rest is image data
    const len = buf.readUInt16BE(i + 2);
    const seg = buf.subarray(i, i + 2 + len);
    const drop = marker === 0xe1 /* EXIF, XMP */ || marker === 0xed /* IPTC/Photoshop */ || marker === 0xfe; /* comment */
    if (!drop) out.push(seg);
    i += 2 + len;
  }
  return Buffer.concat(out);
}

function stripPng(buf) {
  const sig = buf.subarray(0, 8);
  if (sig.toString("hex") !== "89504e470d0a1a0a") return null;
  const out = [sig];
  let i = 8;
  while (i < buf.length) {
    const len = buf.readUInt32BE(i);
    const type = buf.toString("latin1", i + 4, i + 8);
    const chunk = buf.subarray(i, i + 12 + len);
    if (!["tEXt", "iTXt", "zTXt", "eXIf", "tIME"].includes(type)) out.push(chunk);
    i += 12 + len;
  }
  return Buffer.concat(out);
}

const dirs = process.argv.slice(2).length ? process.argv.slice(2) : ["src"];
let changed = 0;
for (const dir of dirs) {
  for await (const file of walk(dir)) {
    const ext = path.extname(file).toLowerCase();
    if (![".jpg", ".jpeg", ".png"].includes(ext)) continue;
    const buf = await readFile(file);
    const stripped = ext === ".png" ? stripPng(buf) : stripJpeg(buf);
    if (stripped && stripped.length < buf.length) {
      await writeFile(file, stripped);
      changed++;
      console.log(`stripped ${buf.length - stripped.length} bytes  ${file}`);
    }
  }
}
console.log(`[strip-metadata] ${changed} file(s) cleaned`);
