// Build-time geometry for "signals": route traces, elevation profiles and weekly-distance waveforms.
// Everything here turns data into SVG path strings, so pages need no client JS to draw them.

const R = 6371000;
const rad = (d) => (d * Math.PI) / 180;
const f1 = (n) => Math.round(n * 10) / 10;

export function haversine([lat1, lng1], [lat2, lng2]) {
  const dLat = rad(lat2 - lat1), dLng = rad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// Catmull-Rom → cubic Bézier, for smooth traces through sampled points.
function smoothPath(pts) {
  if (pts.length < 2) return "";
  let d = `M${f1(pts[0][0])} ${f1(pts[0][1])}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${f1(c1[0])} ${f1(c1[1])} ${f1(c2[0])} ${f1(c2[1])} ${f1(p2[0])} ${f1(p2[1])}`;
  }
  return d;
}
const linePath = (pts) => pts.map(([x, y], i) => `${i ? "L" : "M"}${f1(x)} ${f1(y)}`).join("");

/**
 * Route { latlng: [[lat,lng]...], alt?: [m...] } → SVG geometry.
 * Returns { viewBox, d, elev: { viewBox, d, min, max }, scope: [[x,y]...] (normalised -1..1 for the hero scope) }.
 */
export function routeGeometry(route, { w = 400, h = 300, pad = 12, elevH = 60 } = {}) {
  const ll = route.latlng || [];
  if (ll.length < 2) return null;
  const meanLat = ll.reduce((s, p) => s + p[0], 0) / ll.length;
  const k = Math.cos(rad(meanLat));
  const xy = ll.map(([lat, lng]) => [lng * k, -lat]);
  const xs = xy.map((p) => p[0]), ys = xy.map((p) => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const span = Math.max(maxX - minX, maxY - minY) || 1;
  const s = Math.min((w - pad * 2) / (maxX - minX || span), (h - pad * 2) / (maxY - minY || span));
  const ox = (w - (maxX - minX) * s) / 2, oy = (h - (maxY - minY) * s) / 2;
  const pts = xy.map(([x, y]) => [ox + (x - minX) * s, oy + (y - minY) * s]);

  let elev = null;
  const alt = route.alt || [];
  if (alt.length === ll.length) {
    const dist = [0];
    for (let i = 1; i < ll.length; i++) dist.push(dist[i - 1] + haversine(ll[i - 1], ll[i]));
    const total = dist[dist.length - 1] || 1;
    const lo = Math.min(...alt), hi = Math.max(...alt), rng = Math.max(hi - lo, 20);
    const e = alt.map((a, i) => [(dist[i] / total) * w, elevH - 4 - ((a - lo) / rng) * (elevH - 8)]);
    elev = { viewBox: `0 0 ${w} ${elevH}`, d: linePath(e), area: `${linePath(e)}L${w} ${elevH}L0 ${elevH}Z`, min: Math.round(lo), max: Math.round(hi) };
  }

  // normalised copy for the WebGL scope (y up), resampled to at most 256 points
  const step = Math.max(1, Math.floor(pts.length / 256));
  const scope = pts.filter((_, i) => i % step === 0).map(([x, y]) => [f1(((x / w) * 2 - 1) * 100) / 100, f1((1 - (y / h) * 2) * 100) / 100]);

  return { viewBox: `0 0 ${w} ${h}`, d: linePath(pts), elev, scope, start: pts[0].map(f1), end: pts[pts.length - 1].map(f1) };
}

/**
 * Weekly distance (km per week, index 0 = ISO week 1) → a smooth waveform across the width.
 * `max` lets several years share one vertical scale.
 */
export function weeklyTrace(weeks, { w = 1000, h = 120, max } = {}) {
  const vals = (weeks || []).map((v) => Number(v) || 0);
  if (!vals.length) return { d: "", max: 0 };
  const top = max || Math.max(...vals, 1);
  const pts = vals.map((v, i) => [(i / Math.max(vals.length - 1, 1)) * w, h - 6 - (v / top) * (h - 12)]);
  return { d: smoothPath(pts), max: top, viewBox: `0 0 ${w} ${h}` };
}
