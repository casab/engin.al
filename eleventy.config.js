import path from "node:path";
import { readFileSync } from "node:fs";
import markdownIt from "markdown-it";
import { eleventyImageTransformPlugin } from "@11ty/eleventy-img";
import { feedPlugin } from "@11ty/eleventy-plugin-rss";
import { routeGeometry, weeklyTrace } from "./src/_lib/signal.js";
import { buildNetwork, lineStations } from "./src/_lib/network.js";
import { cardSpec, registerCard, renderCards } from "./scripts/og.mjs";
import { hashAssets } from "./scripts/hash-assets.mjs";

const TZ = "Europe/Istanbul";
const SITE_URL = "https://engin.al/";
const SHOW_DRAFTS = process.env.ELEVENTY_RUN_MODE === "serve" || !!process.env.SHOW_DRAFTS;

const md = markdownIt({ html: true, linkify: true, typographer: true });
// External links: no referrer leakage, no window.opener.
const defaultLinkOpen =
  md.renderer.rules.link_open || ((tokens, idx, options, env, self) => self.renderToken(tokens, idx, options));
md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
  const href = tokens[idx].attrGet("href") || "";
  if (/^https?:\/\//.test(href)) tokens[idx].attrSet("rel", "noopener noreferrer");
  return defaultLinkOpen(tokens, idx, options, env, self);
};

const toDate = (d) => (d instanceof Date ? d : new Date(d));
// path of a file inside a page bundle, relative to the input dir (for <img src> and links)
const bundlePath = (file, inputPath) => {
  if (!file) return "";
  if (/^(https?:)?\//.test(file)) return file;
  const dir = path.posix.dirname(inputPath.split(path.sep).join("/").replace(/^\.\//, "").replace(/^src\//, ""));
  return "/" + path.posix.join(dir, file);
};
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

export default function (eleventyConfig) {
  eleventyConfig.setLibrary("md", md);

  // ---- assets ----
  eleventyConfig.addPassthroughCopy({ "src/assets/fonts": "assets/fonts" });
  eleventyConfig.addPassthroughCopy({ "src/assets/js": "assets/js" });
  eleventyConfig.addPassthroughCopy({ "src/assets/css": "assets/css" });
  eleventyConfig.addPassthroughCopy({ public: "/" });
  eleventyConfig.addGlobalData("showDrafts", SHOW_DRAFTS);
  // drafts get no page of their own in a production build
  eleventyConfig.addGlobalData("eleventyComputed.permalink", () => (data) =>
    data.draft && !SHOW_DRAFTS ? false : data.permalink);
  // CMS: self-hosted Sveltia bundle + lazily loaded backend chunks (no source maps)
  const noMaps = { filter: ["**/*", "!**/*.map"] };
  eleventyConfig.addPassthroughCopy({ "node_modules/@sveltia/cms/dist/sveltia-cms.js": "admin/sveltia-cms.js" });
  eleventyConfig.addPassthroughCopy({ "node_modules/@sveltia/cms/dist/chunks": "admin/chunks" }, noMaps);
  // full-size masters stay downloadable next to their page bundle
  for (const dir of ["projects", "sound", "notes", "distance", "stops"]) {
    eleventyConfig.addPassthroughCopy(`src/${dir}/**/*.{jpg,jpeg,png,webp,gif,svg}`);
  }
  eleventyConfig.addWatchTarget("src/assets/");
  eleventyConfig.addWatchTarget("src/_lib/");

  // ---- responsive images: every <img> pointing at a local raster becomes <picture> avif/webp/jpeg ----
  eleventyConfig.addPlugin(eleventyImageTransformPlugin, {
    extensions: "html",
    formats: ["avif", "webp", "jpeg"],
    widths: [400, 800, 1400],
    urlPath: "/img/",
    outputDir: "_site/img/",
    failOnError: true,
    htmlOptions: {
      imgAttributes: { loading: "lazy", decoding: "async" },
      pictureAttributes: {},
    },
    sharpJpegOptions: { quality: 78, mozjpeg: true },
    sharpWebpOptions: { quality: 76 },
    sharpAvifOptions: { quality: 55 },
  });

  // ---- collections ----
  const byDateDesc = (a, b) => toDate(b.data.date) - toDate(a.data.date);
  // draft: true hides an entry everywhere in a production build; `npm run serve` (or SHOW_DRAFTS=1) shows them, marked
  const published = (items) => (SHOW_DRAFTS ? items : items.filter((i) => !i.data.draft));
  const projects = (api) => published(api.getFilteredByGlob("src/projects/*/index.md")).sort(byDateDesc);
  const sound = (api) => published(api.getFilteredByGlob("src/sound/*/index.md")).sort(byDateDesc);
  const notes = (api) => published(api.getFilteredByGlob("src/notes/**/*.md")).sort(byDateDesc);
  const stops = (api) => published(api.getFilteredByGlob("src/stops/*.md"));

  eleventyConfig.addCollection("projects", projects);
  eleventyConfig.addCollection("sound", sound);
  eleventyConfig.addCollection("notes", notes);
  // Notes on top of synced Strava activities (src/distance/<activity-id>.md). They never render as pages.
  eleventyConfig.addCollection("distanceNotes", (api) => api.getFilteredByGlob("src/distance/*.md"));
  eleventyConfig.addCollection("feedItems", (api) => [...projects(api), ...sound(api), ...notes(api)].sort(byDateDesc));

  // Every stop on the network: projects, recordings, milestones and races, as plain objects.
  const readStrava = () => {
    try { return JSON.parse(readFileSync("src/_data/strava/activities.json", "utf8")); } catch { return { activities: [] }; }
  };
  eleventyConfig.addWatchTarget("src/_data/strava/");
  const buildStations = (api) => {
    const fromItem = (item, kind, meta) => ({
      id: item.url || item.fileSlug,
      title: item.data.title,
      short: item.data.short || null,
      date: toDate(item.data.date),
      lines: item.data.lines || [],
      url: item.url || item.data.url || null,
      kind,
      meta,
      summary: item.data.summary || item.data.note || "",
      draft: !!item.data.draft,
      featured: !!item.data.featured,
      cover: item.data.cover ? bundlePath(item.data.cover, item.inputPath) : null,
      coverAlt: item.data.cover_alt || "",
      embed: item.data.embed_url || null,
      bandcampId: item.data.bandcamp_id || null,
      data: { status: item.data.status, stack: item.data.stack || [] },
    });
    const notesById = new Map(api.getFilteredByGlob("src/distance/*.md").map((n) => [String(n.data.strava_id || n.fileSlug), n]));
    const races = (readStrava().activities || [])
      .map((a) => ({ a, n: notesById.get(String(a.id)) }))
      .filter(({ n }) => !(n && n.data.hidden))
      .map(({ a, n }) => ({
        id: `a${a.id}`,
        title: (n && n.data.title) || a.name,
        date: toDate(a.date),
        lines: ["distance"],
        url: `/distance/#a${a.id}`,
        kind: a.sport === "ride" ? "ride" : "race",
        meta: `${(a.distance_m / 1000).toFixed(1)} km`,
        summary: "",
        note: n ? n.content : "",
        photo: n && n.data.photo ? bundlePath(n.data.photo, n.inputPath) : null,
        photoAlt: (n && n.data.photo_alt) || "",
        activity: a,
      }));
    return [
      ...projects(api).map((p) => fromItem(p, "project", [p.data.stack && p.data.stack[0], toDate(p.data.date).getUTCFullYear()].filter(Boolean).join(" · "))),
      ...sound(api).map((p) => fromItem(p, "sound", [p.data.artist, p.data.kind, toDate(p.data.date).getUTCFullYear()].filter(Boolean).join(" · "))),
      // a gig without a recording of my own set is a stop too: artist and kind (dj set, live set) like a recording
      ...stops(api).map((p) => fromItem(p, "stop", [p.data.artist, p.data.kind, toDate(p.data.date).getUTCFullYear()].filter(Boolean).join(" · "))),
      ...races,
    ].sort((a, b) => b.date - a.date);
  };
  eleventyConfig.addCollection("stations", buildStations);
  // one entry per year with stations, newest first: the /years/<yyyy>/ pages paginate over it
  eleventyConfig.addCollection("stationYears", (api) => {
    const groups = new Map();
    for (const s of buildStations(api)) {
      const y = s.date.getUTCFullYear();
      if (!groups.has(y)) groups.set(y, []);
      groups.get(y).push(s);
    }
    const years = [...groups.keys()].sort((a, b) => b - a);
    return years.map((year, i) => {
      const stations = groups.get(year);
      const lines = {};
      for (const s of stations) for (const l of s.lines) lines[l] = (lines[l] || 0) + 1;
      return {
        year, stations, lines,
        interchanges: stations.filter((s) => s.lines.length > 1).length,
        races: stations.filter((s) => s.activity && s.activity.race).length,
        newer: years[i - 1] || null,
        older: years[i + 1] || null,
      };
    });
  });

  // ---- filters ----
  eleventyConfig.addFilter("md", (s) => (s ? md.render(String(s)) : ""));
  eleventyConfig.addFilter("mdInline", (s) => (s ? md.renderInline(String(s)) : ""));
  eleventyConfig.addFilter("date", (d, style = "dots") => {
    if (!d) return "";
    const date = toDate(d);
    const p = (o) => new Intl.DateTimeFormat("en-GB", { timeZone: TZ, ...o }).format(date);
    if (style === "iso") return date.toISOString().slice(0, 10);
    if (style === "year") return p({ year: "numeric" });
    if (style === "month") return p({ month: "short", year: "numeric" });
    if (style === "day") return p({ day: "numeric", month: "short" });
    if (style === "long") return p({ day: "numeric", month: "long", year: "numeric" });
    return `${p({ year: "numeric" })}.${p({ month: "2-digit" })}.${p({ day: "2-digit" })}`;
  });
  eleventyConfig.addFilter("pad", (n, len = 2) => String(n).padStart(len, "0"));
  eleventyConfig.addFilter("hex", (n, pad = 2) => "0x" + Number(n).toString(16).toUpperCase().padStart(pad, "0"));
  eleventyConfig.addFilter("limit", (arr, n) => (arr || []).slice(0, n));
  eleventyConfig.addFilter("json", (v) => JSON.stringify(v).replace(/</g, "\\u003c"));
  eleventyConfig.addFilter("absoluteUrl", (url, base = SITE_URL) => new URL(url, base).href);
  eleventyConfig.addFilter("stripHtml", (s) => String(s || "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim());
  eleventyConfig.addFilter("km", (m, digits = 1) => (Number(m || 0) / 1000).toFixed(digits));
  eleventyConfig.addFilter("duration", (s) => {
    s = Math.round(Number(s || 0));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    return h ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${m}:${String(sec).padStart(2, "0")}`;
  });
  // min/km for runs, km/h for rides
  eleventyConfig.addFilter("pace", (a) => {
    if (!a || !a.distance_m || !a.moving_s) return "";
    if (a.sport === "ride") return `${((a.distance_m / 1000) / (a.moving_s / 3600)).toFixed(1)} km/h`;
    const spk = a.moving_s / (a.distance_m / 1000);
    return `${Math.floor(spk / 60)}:${String(Math.round(spk % 60)).padStart(2, "0")} /km`;
  });
  eleventyConfig.addFilter("groupByYear", (items) => {
    const groups = new Map();
    for (const i of items || []) {
      const y = toDate(i.data ? i.data.date : i.date).getUTCFullYear();
      if (!groups.has(y)) groups.set(y, []);
      groups.get(y).push(i);
    }
    return [...groups.entries()];
  });
  // path of a file inside the page bundle, relative to the input dir (for <img src> and links)
  eleventyConfig.addFilter("bundle", bundlePath);

  // ---- distance: Strava cache (scripts/strava-sync.mjs); routes/<id>.json hold trimmed, simplified tracks ----
  // "thumb": small, coarse geometry for lists (the Distance page has dozens of routes)
  eleventyConfig.addFilter("route", (id, strava, size) => {
    const r = strava && strava.routes && strava.routes[String(id)];
    if (!r) return null;
    return size === "thumb" ? routeGeometry(r, { w: 200, h: 150, pad: 6, elevH: 30, maxPoints: 80, elevPoints: 48, round: 0 }) : routeGeometry(r);
  });
  eleventyConfig.addFilter("weeklyTrace", (weeks, opts) => weeklyTrace(weeks, opts));
  eleventyConfig.addFilter("weeklyYears", (weekly) => Object.keys(weekly || {}).sort().reverse());
  // shared vertical scale for the weekly traces: the 97th percentile of non-empty weeks, so one huge week
  // doesn't flatten every other year (taller weeks are clipped at the top)
  eleventyConfig.addFilter("weeklyMax", (weekly) => {
    const vals = Object.values(weekly || {}).flatMap((y) => [...(y.run || []), ...(y.ride || [])]).filter((v) => v > 0).sort((a, b) => a - b);
    return vals.length ? Math.max(1, vals[Math.min(vals.length - 1, Math.floor(vals.length * 0.97))]) : 1;
  });
  // ---- the network ----
  eleventyConfig.addFilter("network", (stations, lines) => buildNetwork(stations, lines));
  eleventyConfig.addFilter("lineStations", (stations, lineId, lines) => lineStations(stations, lineId, lines));
  eleventyConfig.addFilter("lineInfo", (id, lines) => (lines || []).find((l) => l.id === id) || { id, code: "", label: id, color: "#121212" });
  eleventyConfig.addFilter("onLine", (items, id) => (items || []).filter((i) => ((i.data ? i.data.lines : i.lines) || []).includes(id)));
  eleventyConfig.addFilter("interchanges", (stations) => (stations || []).filter((s) => (s.lines || []).length > 1));
  eleventyConfig.addFilter("first", (arr) => (arr || [])[0]);
  // sitemap.xml: collections.all has only the first page of a paginated template, so add the line and year pages
  eleventyConfig.addFilter("sitemapUrls", (all, lines, years) => {
    const out = new Map();
    for (const p of all || []) if (p.url && p.url.endsWith("/") && !p.data.draft) out.set(p.url, /^\/(projects|sound|notes)\//.test(p.url) ? p.data.date : null);
    for (const l of lines || []) if (!out.has(l.url)) out.set(l.url, null);
    for (const y of years || []) out.set(`/years/${y.year}/`, null);
    return [...out].map(([url, date]) => ({ url, date })).sort((a, b) => a.url.localeCompare(b.url));
  });
  // Station pages: for each line the entry is on, its place on that line and the stations either side
  eleventyConfig.addFilter("nextStops", (stations, url, ids, lines) => (ids || []).map((id) => {
    const list = lineStations(stations, id, lines); // newest first
    const i = list.findIndex((s) => s.url === url);
    if (i === -1) return null;
    return { line: lines.find((l) => l.id === id), n: list.length - i, total: list.length, newer: list[i - 1] || null, older: list[i + 1] || null };
  }).filter(Boolean));
  // the lines that have a count in { lineId: n } (a year page draws only those)
  eleventyConfig.addFilter("linesIn", (lines, counts) => (lines || []).filter((l) => counts && counts[l.id]));
  // compact station data for the map's hover/tap cards (index = data-st on the station)
  eleventyConfig.addFilter("mapCards", (stations, lines) => {
    const code = Object.fromEntries((lines || []).map((l) => [l.id, [l.code, l.label]]));
    const month = (d) => new Intl.DateTimeFormat("en-GB", { timeZone: TZ, month: "short", year: "numeric" }).format(toDate(d));
    // the card already shows month + year, so a bare year in meta (a project's status) would repeat it
    const meta = (s) => (s.meta || "").split(" · ").filter((p) => p !== String(toDate(s.date).getUTCFullYear())).join(" · ");
    return (stations || []).map((s) => ({ t: s.title, d: month(s.date), m: meta(s), s: s.summary, u: s.url, l: s.lines.map((id) => [id, ...(code[id] || [id, id])]) }));
  });
  // /search.json: every station and note, newest first, with short keys (search.js reads them)
  const KIND = { project: "Project", sound: "Recording", stop: "Milestone", race: "Run", ride: "Ride", note: "Note" };
  const trim = (s, n) => { s = String(s || "").replace(/<[^>]+>/g, "").replace(/[#*_`>\[\]]/g, "").replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n).replace(/\s+\S*$/, "") + "…" : s; };
  eleventyConfig.addFilter("searchIndex", (stations, notes) => [
    ...(stations || []).map((s) => ({
      t: s.title,
      s: s.short && s.short !== s.title ? s.short : undefined,
      l: s.lines,
      y: toDate(s.date).getUTCFullYear(),
      k: KIND[s.kind] || s.kind,
      m: s.meta || undefined,
      x: (s.data && s.data.stack && s.data.stack.length) ? s.data.stack.join(" ") : undefined,
      u: s.url || undefined,
      d: trim(s.summary || s.note, 160) || undefined,
    })),
    ...(notes || []).map((n) => ({
      t: n.data.title, l: [], y: toDate(n.data.date).getUTCFullYear(), k: KIND.note, u: n.url,
      x: (n.data.tags || []).join(" ") || undefined, d: trim(n.data.description, 160) || undefined,
    })),
  ]);
  // A–Z by title (the /search/ page without JS)
  eleventyConfig.addFilter("byTitle", (items) => (items || []).slice().sort((a, b) => String(a.title).localeCompare(String(b.title), "tr")));
  // [[year, stations], …], newest year first (input is already newest first)
  eleventyConfig.addFilter("byYear", (stations) => {
    const groups = new Map();
    for (const s of stations || []) {
      const y = toDate(s.date).getUTCFullYear();
      if (!groups.has(y)) groups.set(y, []);
      groups.get(y).push(s);
    }
    return [...groups.entries()].sort((a, b) => b[0] - a[0]);
  });

  // ---- media on R2 (media.engin.al) ----
  // src/_data/media.json (written by scripts/r2-upload.mjs) lists files that live in the R2 bucket.
  // Those are served from R2 and resized by Cloudflare (/cdn-cgi/image); anything not listed
  // falls back to the local file + build-time eleventy-img pipeline (e.g. fresh CMS uploads).
  const MEDIA_BASE = "https://media.engin.al";
  const MEDIA_WIDTHS = [400, 800, 1400];
  let MEDIA = {};
  const loadMedia = () => {
    try { MEDIA = JSON.parse(readFileSync("src/_data/media.json", "utf8")); } catch { MEDIA = {}; }
  };
  loadMedia();
  eleventyConfig.on("eleventy.before", loadMedia);

  // Share cards (scripts/og.mjs): base.njk asks for the page's card URL; every card is drawn after the build.
  eleventyConfig.addFilter("ogCard", (url, data, site) => registerCard(url, cardSpec(url, data || {}, site), site));
  eleventyConfig.on("eleventy.after", async ({ directories, runMode }) => {
    const t = Date.now();
    const { total, drawn } = await renderCards(directories.output);
    console.log(`[og] ${total} share cards (${drawn} drawn, the rest cached) in ${Date.now() - t} ms`);
    // content hashes in /assets/ file names (scripts/hash-assets.mjs); not while serving, where the dev server
    // serves the unhashed files straight from src/
    if (runMode === "build") {
      const { assets, pages } = await hashAssets(directories.output);
      console.log(`[hash] ${assets} assets renamed, ${pages} files updated`);
    }
  });
  eleventyConfig.addWatchTarget("src/_data/media.json");
  const mediaKey = (src) => String(src || "").replace(/^\/+/, "");
  const cdn = (key, m, width, extra = "") =>
    `${MEDIA_BASE}/cdn-cgi/image/width=${Math.min(width, m.w || width)},quality=80,format=auto,fit=scale-down${extra}/${key}?v=${m.v}`;

  // {% image src, alt, sizes, eager %}: src is a site path like /projects/<bundle>/cover.jpg
  eleventyConfig.addShortcode("image", (src, alt = "", sizes = "100vw", eager = false) => {
    const key = mediaKey(src);
    const m = MEDIA[key];
    const loading = eager ? `loading="eager" fetchpriority="high"` : `loading="lazy"`;
    if (m && m.w) {
      const widths = [...new Set(MEDIA_WIDTHS.map((w) => Math.min(w, m.w)))];
      const srcset = widths.map((w) => `${cdn(key, m, w)} ${w}w`).join(", ");
      return `<img src="${cdn(key, m, 800)}" srcset="${srcset}" sizes="${esc(sizes)}" width="${m.w}" height="${m.h}" alt="${esc(alt)}" ${loading} decoding="async" eleventy:ignore>`;
    }
    return `<img src="${esc(src)}" alt="${esc(alt)}" sizes="${esc(sizes)}" ${loading}>`; // local → eleventy-img transform
  });
  eleventyConfig.addFilter("mediaOg", (src) => {
    const key = mediaKey(src);
    const m = MEDIA[key];
    return m && m.w ? cdn(key, m, 1200).replace("format=auto", "format=jpeg") : src;
  });
  eleventyConfig.addFilter("mediaUrl", (src) => {
    const key = mediaKey(src);
    return MEDIA[key] ? `${MEDIA_BASE}/${key}?v=${MEDIA[key].v}` : src;
  });

  // ---- click-to-load players (SoundCloud, Mixcloud, Bandcamp, YouTube) ----
  eleventyConfig.addFilter("player", (item) => toPlayer(item || {}));
  function toPlayer(item) {
    let u;
    try { u = new URL(item.url); } catch { return null; }
    const parts = u.pathname.split("/").filter(Boolean);
    const label = item.title || u.hostname.replace(/^www\./, "") + u.pathname.replace(/\/$/, "");
    if (/(^|\.)soundcloud\.com$/.test(u.hostname) && parts.length) {
      const isTrack = parts.length === 2 && !["sets", "tracks", "albums", "likes", "reposts", "popular-tracks"].includes(parts[1]);
      const embed = "https://w.soundcloud.com/player/?" + new URLSearchParams({
        url: u.href, color: "#ff5ec8", auto_play: "true", hide_related: "true", show_comments: "false",
        show_user: "true", show_reposts: "false", show_teaser: "false", visual: "false",
      });
      return { type: "soundcloud", url: u.href, label, embed, height: isTrack ? 166 : 320 };
    }
    if (/(^|\.)mixcloud\.com$/.test(u.hostname) && parts.length >= 2) {
      const feed = "/" + parts.slice(0, 2).join("/") + "/";
      const embed = "https://player-widget.mixcloud.com/widget/iframe/?" + new URLSearchParams({ hide_cover: "1", mini: "1", light: "0", autoplay: "1", feed });
      return { type: "mixcloud", url: u.href, label, embed, height: 60 };
    }
    if (/(^|\.)bandcamp\.com$/.test(u.hostname) && item.bandcamp_id) {
      const kind = item.bandcamp_type || (parts[0] === "track" ? "track" : "album");
      const embed = `https://bandcamp.com/EmbeddedPlayer/${kind}=${item.bandcamp_id}/size=large/bgcol=0b0d12/linkcol=ff5ec8/artwork=small/tracklist=false/transparent=true/`;
      return { type: "bandcamp", url: u.href, label, embed, height: 120 };
    }
    if (/^open\.spotify\.com$/.test(u.hostname)) {
      const i = parts.findIndex((p) => ["track", "album", "artist", "playlist", "episode"].includes(p));
      if (i >= 0 && parts[i + 1]) {
        const embed = `https://open.spotify.com/embed/${parts[i]}/${encodeURIComponent(parts[i + 1])}`;
        return { type: "spotify", url: u.href, label, embed, height: parts[i] === "track" || parts[i] === "episode" ? 152 : 352 };
      }
    }
    const yt = /(^|\.)youtube\.com$/.test(u.hostname) ? u.searchParams.get("v") || (parts[0] === "live" ? parts[1] : null)
      : /^youtu\.be$/.test(u.hostname) ? parts[0] : null;
    if (yt) return { type: "youtube", url: u.href, label, embed: `https://www.youtube-nocookie.com/embed/${encodeURIComponent(yt)}?autoplay=1`, height: 0, video: true };
    return { type: "link", url: u.href, label, embed: null };
  }

  eleventyConfig.addPlugin(feedPlugin, {
    type: "atom",
    outputPath: "/feed.xml",
    collection: { name: "feedItems", limit: 30 },
    metadata: {
      language: "en",
      title: "engin.al",
      subtitle: "Projects, sounds and notes from Engin Al.",
      base: SITE_URL,
      author: { name: "Engin Al" },
    },
  });

  return {
    dir: { input: "src", includes: "_includes", data: "_data", output: "_site" },
    // Markdown written in the CMS is never run through a template engine (no surprises with "{{").
    markdownTemplateEngine: false,
    htmlTemplateEngine: "njk",
    templateFormats: ["njk", "md"],
  };
}
