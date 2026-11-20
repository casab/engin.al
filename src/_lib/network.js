// Lays out the four-line network map at build time and returns plain geometry for an SVG.
//
// Model: every station (project, recording, milestone, race) has a date and one or more lines.
// Time runs left to right, one column per station, so nothing collides however dates bunch up.
// Each line has a fixed lane. A station on several lines is an interchange: the first of its
// lines (in the order of site.lines) stays in its lane, the others bend over at 45° to run right
// beside it, then bend back. All lines end together at the "Now" terminus on the right.
// No layout solver: the result is predictable and only grows to the right as content is added.

const LANE_TOP = 120;
const LANE_GAP = 120;
const START = 24;
const SPACING = 150;
const FLAT = 16; // half-length of the straight run through an interchange
const PAIR = 18; // distance between lines running side by side
const r = (n) => Math.round(n * 10) / 10;

// Rough label width for collision checks (Archivo at the sizes the map uses).
const textWidth = (s, perChar) => String(s).length * perChar;

function toPath(pts) {
  let d = `M${r(pts[0][0])} ${r(pts[0][1])}`;
  for (let i = 1; i < pts.length; i++) {
    const [x1, y1] = pts[i - 1];
    const [x2, y2] = pts[i];
    if (y1 === y2) d += `H${r(x2)}`;
    else {
      const dy = Math.abs(y2 - y1);
      d += x2 - x1 > dy ? `H${r(x2 - dy)}L${r(x2)} ${r(y2)}` : `L${r(x2)} ${r(y2)}`;
    }
  }
  return d;
}

/**
 * @param stations [{ id, title, date, lines: [lineId…], url? }]
 * @param lines site.lines ([{ id, color, … }]) in lane order
 */
export function buildNetwork(stations, lines) {
  const index = Object.fromEntries(lines.map((l, i) => [l.id, i]));
  const base = (id) => LANE_TOP + index[id] * LANE_GAP;

  const list = (stations || [])
    .map((s) => ({ ...s, lines: (s.lines || []).filter((l) => l in index).sort((a, b) => index[a] - index[b]) }))
    .filter((s) => s.lines.length)
    .sort((a, b) => new Date(a.date) - new Date(b.date) || String(a.title).localeCompare(String(b.title)));

  // how far the furthest line of an interchange has to travel to reach its partner
  list.forEach((s) => {
    s.ys = {};
    const anchor = base(s.lines[0]);
    s.lines.forEach((l, k) => (s.ys[l] = anchor + k * PAIR));
    s.reach = Math.max(0, ...s.lines.map((l) => Math.abs(base(l) - s.ys[l])));
  });
  // columns: an interchange gets room on both sides for 45° bends
  let x = START + 70;
  list.forEach((s, i) => {
    if (i) x += SPACING + (s.reach ? s.reach + FLAT : 0) + (list[i - 1].reach ? list[i - 1].reach + FLAT : 0) * 0.5;
    s.x = x;
  });
  const hubX = (list.length ? x : START + 70) + SPACING * 1.3 + LANE_GAP * 1.5;
  const centerY = lines.reduce((sum, l) => sum + base(l.id), 0) / lines.length;
  const hubY = Object.fromEntries(lines.map((l, i) => [l.id, centerY + (i - (lines.length - 1) / 2) * PAIR]));

  const paths = lines.map((line) => {
    const b = base(line.id);
    const pts = [[START, b]];
    const push = (px, py) => {
      const last = pts[pts.length - 1];
      if (px > last[0]) pts.push([px, py]);
      else if (px === last[0]) last[1] = py;
    };
    for (const s of list) {
      if (!s.lines.includes(line.id)) continue;
      const ty = s.ys[line.id];
      if (ty === b) push(s.x, b);
      else {
        const g = Math.abs(ty - b) + FLAT + 8; // exactly enough for a 45° bend
        push(s.x - g, b);
        push(s.x - FLAT, ty);
        push(s.x + FLAT, ty);
        push(s.x + g, b);
      }
    }
    push(hubX, hubY[line.id]);
    return { id: line.id, color: line.color, d: toPath(pts) };
  });

  // labels: lanes 1–2 label above, 3–4 below; alternate tiers when neighbours would overlap
  const lastEnd = {};
  const out = list.map((s) => {
    const inter = s.lines.length > 1;
    const lane = index[s.lines[0]];
    const anchorY = s.ys[s.lines[0]];
    const above = inter || lane < 2;
    const key = s.lines[0] + (above ? "^" : "v");
    const text = s.short || s.title;
    const w = inter ? textWidth(text, 10) : textWidth(text, 7.6);
    const tier = lastEnd[key] != null && s.x - w / 2 < lastEnd[key].end + 10 ? 1 - lastEnd[key].tier : 0;
    lastEnd[key] = { end: s.x + w / 2, tier };
    const maxY = Math.max(...Object.values(s.ys));
    const label = above
      ? { x: s.x, y: r(anchorY - (inter ? 24 : 18) - tier * 20) }
      : { x: s.x, y: r(maxY + 30 + tier * 20) };
    return {
      id: s.id,
      title: s.title,
      text,
      url: s.url || null,
      kind: s.kind,
      draft: !!s.draft,
      lines: s.lines,
      interchange: inter,
      x: r(s.x),
      y: r(anchorY),
      pill: inter ? { x: r(s.x - 12), y: r(anchorY - 12), w: 24, h: r(maxY - anchorY + 24) } : null,
      label,
    };
  });

  const axisY = base(lines[lines.length - 1].id) + 92;
  const years = [];
  list.forEach((s, i) => {
    const y = new Date(s.date).getUTCFullYear();
    if (!i || y !== new Date(list[i - 1].date).getUTCFullYear()) years.push({ x: r(s.x), label: String(y) });
  });
  const ys = Object.values(hubY);
  return {
    width: Math.ceil(hubX + 130),
    height: axisY + 30,
    axisY,
    paths,
    stations: out,
    years,
    hub: { x: r(hubX - 2), y: r(Math.min(...ys) - 16), w: 34, h: r(Math.max(...ys) - Math.min(...ys) + 32), labelX: r(hubX + 46), labelY: r(centerY + 8) },
  };
}

/** Stations of one line, newest first, numbered in the order they opened ("02·4"). */
export function lineStations(stations, lineId, lines) {
  const n = String((lines.findIndex((l) => l.id === lineId) + 1) || 0).padStart(2, "0");
  const asc = (stations || []).filter((s) => (s.lines || []).includes(lineId)).sort((a, b) => new Date(a.date) - new Date(b.date));
  return asc.map((s, i) => ({ ...s, code: `${n}·${i + 1}` })).reverse();
}
