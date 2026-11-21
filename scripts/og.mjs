// Share cards (Open Graph images): one 1200x630 PNG per page, drawn after each build into _site/og/.
// satori lays the card out as SVG (text becomes paths) and resvg (WebAssembly) turns it into a PNG: plain JS,
// so it runs in Workers Builds without a browser. Pattern from technoetkinlik's scripts/og.mjs.
//
// base.njk calls the `ogCard` filter with the page's data; the filter returns the card's URL and remembers
// what to draw; eleventy.config.js calls renderCards() on "eleventy.after". Same text + same code -> same PNG,
// cached in .cache/og, so a rebuild only draws what changed.
import { readFileSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import path from "node:path";
import satori from "satori";
import { Resvg, initWasm } from "@resvg/resvg-wasm";

const require = createRequire(import.meta.url);
export const W = 1200, H = 630;
const C = { paper: "#EDEDE8", ink: "#121212", pencil: "#5E5E58", white: "#FFFFFF" };
const CACHE = ".cache/og";
const SELF = createHash("sha256").update(readFileSync(new URL(import.meta.url))).digest("hex");
const FONT_DIR = new URL("./og-fonts/", import.meta.url);

// ---------- which file a page's card goes to ----------
export const cardFile = (url) => (url === "/" ? "home" : String(url).replace(/^\/|\/$/g, "").replace(/\.html$/, "")) + ".png";
export const cardPath = (url) => "/og/" + cardFile(url);

// ---------- what a card says, from the page's data ----------
const year = (d) => (d ? new Date(d).getUTCFullYear() : null);
const join = (parts) => parts.filter(Boolean).join(" · ");
export function cardSpec(url, d, site) {
  const all = site.lines.map((l) => l.id);
  if (url === "/") return { kicker: join(site.lines.map((l) => l.label)), headline: "Four lines, one network", lines: all };
  if (d.thisLine) return { kicker: `${d.thisLine.code} · line`, headline: d.thisLine.label, sub: d.thisLine.long, lines: [d.thisLine.id] };
  if (d.yr) {
    const ids = all.filter((id) => d.yr.lines[id]);
    const n = d.yr.stations.length;
    return { kicker: "Year by year", headline: String(d.yr.year), sub: `${n} station${n === 1 ? "" : "s"} on ${ids.length} line${ids.length === 1 ? "" : "s"}`, lines: ids };
  }
  if (/^\/projects\/[^/]+\/$/.test(url)) return { kicker: join(["Project", year(d.date), d.stack && d.stack[0]]), headline: d.title, sub: d.summary, lines: d.lines };
  if (/^\/sound\/[^/]+\/$/.test(url)) return { kicker: join([d.artist, d.kind, year(d.date)]), headline: d.title, sub: d.summary, lines: d.lines };
  if (/^\/notes\/[^/]+\/$/.test(url)) return { kicker: join(["Note", year(d.date)]), headline: d.title, sub: d.description, lines: [] };
  return { kicker: "engin.al", headline: d.title || site.title, sub: d.description, lines: all };
}

// ---------- registry: filled while pages render, drawn after the build ----------
const queue = new Map();
export function registerCard(url, spec, site) {
  if (!url) return ""; // permalink: false (drafts, stops, Strava notes) renders but is never written
  const colours = Object.fromEntries(site.lines.map((l) => [l.id, l]));
  const lines = (spec.lines || []).map((id) => colours[id]).filter(Boolean).map((l) => ({ code: l.code, label: l.label, color: l.color }));
  queue.set(url, { ...spec, lines });
  return cardPath(url);
}

// ---------- fonts: static cuts of the site's Archivo (scripts/og-fonts.py) + IBM Plex Mono ----------
function fonts() {
  const out = [];
  const add = (name, weight, file) => out.push({ name, weight, style: "normal", data: readFileSync(file) });
  // separate family names per subset: satori falls back between families, not between files of one family
  for (const [sub, suffix] of [["latin", ""], ["latin-ext", "Ext"]]) {
    add("Narrow" + suffix, 800, new URL(`archivo-narrow-850-${sub}.woff`, FONT_DIR));
    add("Wide" + suffix, 600, new URL(`archivo-wide-650-${sub}.woff`, FONT_DIR));
    add("Text" + suffix, 500, new URL(`archivo-text-500-${sub}.woff`, FONT_DIR));
    add("Mono" + suffix, 500, path.join(path.dirname(require.resolve("@fontsource/ibm-plex-mono/package.json")), "files", `ibm-plex-mono-${sub}-500-normal.woff`));
  }
  return out;
}
const FAM = { narrow: "Narrow, NarrowExt", wide: "Wide, WideExt", text: "Text, TextExt", mono: "Mono, MonoExt" };

// ---------- layout (satori takes React-like objects) ----------
const h = (style, children = []) => ({ type: "div", props: { style: { display: "flex", ...style }, children } });
const clip = (s, n) => { s = String(s || "").replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, "") + "…" : s; };
const up = (s) => String(s || "").toUpperCase(); // same as the site's CSS uppercase (lang="en")

// largest headline size whose estimated wrap fits the 1072 px column and `height` px (line height 0.86)
function fit(text, height, max = 168, min = 56) {
  const words = text.split(/\s+/).filter(Boolean);
  for (let size = max; size >= min; size -= 4) {
    const per = 1072 / (size * 0.47); // Archivo 62% width, weight 850, caps: ~0.47em per character
    let n = 1, cur = 0, ok = true;
    for (const w of words) {
      if (w.length > per) { ok = false; break; }
      if (cur && cur + 1 + w.length > per) { n += 1; cur = w.length; } else cur += (cur ? 1 : 0) + w.length;
    }
    if (ok && n * size * 0.86 <= height) return size;
  }
  return min;
}

function logo() {
  const rows = [["#2D3BFF", 30], ["#A87500", 24], ["#D63526", 18], ["#0B8A4E", 36]];
  return h({ flexDirection: "column", gap: 4, width: 36 }, rows.map(([c, w]) => h({ width: w, height: 5, borderRadius: 3, background: c })));
}

function card(spec) {
  const headline = up(clip(spec.headline, 70));
  const sub = clip(spec.sub, 72); // one line
  // the block between the top rule and the rails is ~330 px: kicker and sub take their share first
  const size = fit(headline, 292 - (spec.kicker ? 44 : 0) - (sub ? 50 : 0));
  const lines = spec.lines.length ? spec.lines : [{ color: C.ink }];
  const railTop = 470, railGap = 22, railH = 12;
  const pillH = (lines.length - 1) * railGap + railH + 26;
  return h({ width: W, height: H, background: C.paper, color: C.ink, position: "relative", fontFamily: FAM.text }, [
    // the station's lines run across the bottom of the card, with this station on them
    ...lines.map((l, i) => h({ position: "absolute", left: 0, right: 0, top: railTop + i * railGap, height: railH, background: l.color })),
    h({ position: "absolute", left: 960, top: railTop - 13, width: 52, height: pillH, borderRadius: 26, background: C.white, border: `7px solid ${C.ink}` }),
    h({ position: "absolute", left: 64, right: 64, top: 48, height: railTop - 70, flexDirection: "column" }, [
      h({ justifyContent: "space-between", alignItems: "center", height: 52, borderBottom: `3px solid ${C.ink}`, paddingBottom: 12 }, [
        h({ alignItems: "center", gap: 16 }, [logo(), h({ fontFamily: FAM.narrow, fontWeight: 800, fontSize: 40, letterSpacing: 1 }, "ENGIN AL")]),
        h({ gap: 26, alignItems: "center" }, spec.lines.map((l) => h({ alignItems: "center", gap: 10, fontFamily: FAM.wide, fontWeight: 600, fontSize: 17, letterSpacing: 2.5 }, [
          h({ width: 30, height: 8, background: l.color }), `${l.code} ${l.label.toUpperCase()}`,
        ]))),
      ]),
      h({ flexDirection: "column", justifyContent: "center", flexGrow: 1, paddingTop: 10 }, [
        spec.kicker ? h({ fontFamily: FAM.wide, fontWeight: 600, fontSize: 22, letterSpacing: 3, marginBottom: 14 }, clip(spec.kicker, 60).toUpperCase()) : null,
        h({ fontFamily: FAM.narrow, fontWeight: 800, fontSize: size, lineHeight: 0.86, flexWrap: "wrap" }, headline),
        sub ? h({ fontSize: 26, color: C.pencil, marginTop: 16, lineHeight: 1.3 }, sub) : null,
      ].filter(Boolean)),
    ]),
    h({ position: "absolute", left: 64, bottom: 30, fontFamily: FAM.mono, fontWeight: 500, fontSize: 22, color: C.ink }, "engin.al"),
  ]);
}

// ---------- draw ----------
let ready = null;
const init = () => (ready ||= initWasm(readFileSync(require.resolve("@resvg/resvg-wasm/index_bg.wasm"))));

export async function renderCards(outDir) {
  await init();
  const f = fonts();
  mkdirSync(CACHE, { recursive: true });
  let drawn = 0;
  for (const [url, spec] of queue) {
    const key = createHash("sha256").update(SELF + JSON.stringify(spec)).digest("hex").slice(0, 16);
    const cached = path.join(CACHE, key + ".png");
    let png;
    if (existsSync(cached)) png = readFileSync(cached);
    else {
      const svg = await satori(card(spec), { width: W, height: H, fonts: f });
      png = new Resvg(svg, { fitTo: { mode: "width", value: W } }).render().asPng();
      writeFileSync(cached, png);
      drawn += 1;
    }
    const dest = path.join(outDir, "og", cardFile(url));
    mkdirSync(path.dirname(dest), { recursive: true });
    writeFileSync(dest, png);
  }
  return { total: queue.size, drawn };
}
