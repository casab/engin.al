// The network map: drag to pan, jump to a year, arrow keys between stations, and a small card per station
// (hover or focus on desktop, first tap on touch). Loaded by site.js only on pages with a map.
// Without this file the map is a plain scrollable SVG of links, which is fine.

export function initMap(network) {
  const scroller = network.querySelector(".map");
  const svg = scroller && scroller.querySelector("svg");
  const card = network.querySelector("[data-map-card]");
  const dataEl = network.querySelector("[data-map-data]");
  if (!svg || !card || !dataEl) return;
  let data = [];
  try { data = JSON.parse(dataEl.textContent); } catch { return; }

  const stations = [...svg.querySelectorAll(".st")];
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const behavior = reduce ? "auto" : "smooth";
  // stations without a page still get keyboard focus so their card can open
  stations.forEach((g) => {
    const plain = g.querySelector(".st__plain");
    if (plain) { plain.setAttribute("tabindex", "0"); plain.setAttribute("role", "button"); }
  });
  const focusable = (g) => g.querySelector("a, .st__plain");

  // ---------------------------------------------------------------- card
  let current = null, hideTimer = 0;
  function show(g) {
    clearTimeout(hideTimer);
    const d = data[Number(g.dataset.st)];
    if (!d) return;
    current = g;
    card.replaceChildren();
    const tags = document.createElement("ul");
    tags.className = "tags";
    for (const [id, code, label] of d.l) {
      const li = document.createElement("li");
      li.className = `tag c-${id}`;
      const bar = document.createElement("span");
      bar.className = "bar";
      li.append(bar, `${code} ${label}`);
      tags.append(li);
    }
    const title = document.createElement("p");
    title.className = "map-card__title";
    title.textContent = d.t;
    const meta = document.createElement("p");
    meta.className = "mono muted";
    meta.textContent = [d.d, d.m].filter(Boolean).join(" · ");
    card.append(tags, title, meta);
    if (d.s) {
      const sum = document.createElement("p");
      sum.className = "map-card__sum";
      sum.textContent = d.s.length >= 140 ? d.s.replace(/\s+\S*$/, "") + "…" : d.s;
      card.append(sum);
    }
    if (d.u) {
      const a = document.createElement("a");
      a.className = "cta";
      a.href = d.u;
      a.textContent = d.u.startsWith("http") ? "Open ↗" : "Open →";
      if (d.u.startsWith("http")) a.rel = "noopener noreferrer";
      card.append(a);
    }
    card.hidden = false;
    place(g);
  }
  function place(g) {
    const box = network.getBoundingClientRect();
    const r = (g.querySelector("rect, circle") || g).getBoundingClientRect();
    const cw = card.offsetWidth, ch = card.offsetHeight;
    let left = r.left + r.width / 2 - box.left - cw / 2;
    left = Math.max(8, Math.min(left, box.width - cw - 8));
    // above the station when that stays inside the map (not over the filter and timeline), else below
    const mapTop = scroller.getBoundingClientRect().top;
    let top = r.top - box.top - ch - 14;
    if (r.top - ch - 14 < Math.max(8, mapTop)) top = r.bottom - box.top + 14;
    card.style.setProperty("--x", `${Math.round(left)}px`);
    card.style.setProperty("--y", `${Math.round(top)}px`);
  }
  function hide(now = false) {
    clearTimeout(hideTimer);
    const go = () => { card.hidden = true; current = null; };
    if (now) go(); else hideTimer = setTimeout(go, 180);
  }

  for (const g of stations) {
    g.addEventListener("pointerenter", (e) => { if (e.pointerType === "mouse") show(g); });
    g.addEventListener("pointerleave", (e) => { if (e.pointerType === "mouse") hide(); });
    // keyboard focus only: a tap also focuses the link, and must not count as the first tap
    g.addEventListener("focusin", () => { if (g.querySelector(":focus-visible")) show(g); });
    g.addEventListener("focusout", () => hide());
    // touch: the first tap opens the card, a second tap on the same station follows its link
    g.addEventListener("click", (e) => {
      if (dragged) { e.preventDefault(); return; }
      if (lastPointer !== "mouse" && current !== g) { e.preventDefault(); show(g); }
    });
  }
  card.addEventListener("pointerenter", () => clearTimeout(hideTimer));
  card.addEventListener("pointerleave", () => hide());
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !card.hidden) { const g = current; hide(true); g && focusable(g)?.focus(); } });
  document.addEventListener("pointerdown", (e) => { if (!card.hidden && !card.contains(e.target) && !e.target.closest(".st")) hide(true); });
  scroller.addEventListener("scroll", () => { if (current) place(current); markYear(); syncRail(); }, { passive: true });

  // ---------------------------------------------------------------- drag to pan (mouse; touch scrolls natively)
  let lastPointer = "mouse", dragged = false, startX = 0, startScroll = 0, dragging = false;
  scroller.addEventListener("pointerdown", (e) => {
    lastPointer = e.pointerType;
    dragged = false;
    if (e.pointerType !== "mouse" || e.button !== 0) return;
    dragging = true;
    startX = e.clientX;
    startScroll = scroller.scrollLeft;
  });
  addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const dx = e.clientX - startX;
    if (!dragged && Math.abs(dx) > 5) { dragged = true; scroller.classList.add("is-dragging"); hide(true); }
    if (dragged) scroller.scrollLeft = startScroll - dx;
  });
  addEventListener("pointerup", () => {
    if (!dragging) return;
    dragging = false;
    scroller.classList.remove("is-dragging");
    setTimeout(() => { dragged = false; }, 0);
  });
  scroller.classList.add("is-pannable");

  // ---------------------------------------------------------------- keyboard: ← → between stations
  const ordered = stations.slice().sort((a, b) => Number(a.dataset.st) - Number(b.dataset.st));
  svg.addEventListener("keydown", (e) => {
    const g = e.target.closest(".st");
    if (!g) return;
    const i = ordered.indexOf(g);
    let next = null;
    if (e.key === "ArrowRight") next = ordered[i + 1];
    else if (e.key === "ArrowLeft") next = ordered[i - 1];
    else if (e.key === "Home") next = ordered[0];
    else if (e.key === "End") next = ordered[ordered.length - 1];
    else if ((e.key === "Enter" || e.key === " ") && g.querySelector(".st__plain")) { e.preventDefault(); show(g); return; }
    if (!next) return;
    e.preventDefault();
    focusable(next)?.focus({ preventScroll: true });
    next.scrollIntoView({ inline: "center", block: "nearest", behavior });
  });

  // ---------------------------------------------------------------- jump to a year
  const timeline = network.querySelector("[data-timeline]");
  const yearButtons = timeline ? [...timeline.querySelectorAll("[data-map-year]")] : [];
  if (timeline && yearButtons.length) {
    timeline.hidden = false;
    for (const b of yearButtons) {
      b.addEventListener("click", () => {
        const y = b.dataset.mapYear;
        if (y === "now") { scroller.scrollTo({ left: 0, behavior }); return; } // rtl: 0 is the right end
        const g = ordered.find((s) => s.dataset.year === y);
        const dot = g && g.querySelector("circle, rect");
        if (!dot) return;
        // bring the year's first station to ~6rem from the left edge (its label may stick out further)
        const delta = dot.getBoundingClientRect().left - scroller.getBoundingClientRect().left - 96;
        scroller.scrollBy({ left: delta, behavior });
      });
    }
  }
  // highlight the year whose stations sit in the left half of the visible map
  function markYear() {
    if (!yearButtons.length) return;
    const box = scroller.getBoundingClientRect();
    const mid = box.left + box.width * 0.35;
    let year = null;
    for (const g of ordered) {
      const x = g.getBoundingClientRect().left;
      if (x > mid) break;
      year = g.dataset.year;
    }
    // the map is rtl (it opens at its right end): there scrollLeft is 0, and negative further left
    const atEnd = scroller.scrollLeft > -4;
    const target = atEnd ? "now" : year;
    for (const b of yearButtons) {
      const on = b.dataset.mapYear === target;
      b.classList.toggle("is-current", on);
      if (on) b.setAttribute("aria-current", "true"); else b.removeAttribute("aria-current");
    }
  }
  markYear();

  // ---------------------------------------------------------------- overview rail (replaces the native scrollbar)
  // A miniature of the whole network under the map; the framed window is the part on screen. Drag the window,
  // or click/tap anywhere on the rail to go there. Without JS the map keeps a thin native scrollbar.
  const NS = "http://www.w3.org/2000/svg";
  const rail = document.createElement("div");
  rail.className = "map-rail";
  rail.hidden = true;
  rail.tabIndex = 0;
  scroller.id ||= "network-map";
  for (const [k, v] of Object.entries({ role: "scrollbar", "aria-controls": scroller.id, "aria-orientation": "horizontal",
    "aria-label": "Map overview", "aria-valuemin": "0", "aria-valuemax": "100", "aria-valuenow": "100" })) rail.setAttribute(k, v);
  const mini = document.createElementNS(NS, "svg");
  mini.setAttribute("viewBox", svg.getAttribute("viewBox"));
  mini.setAttribute("preserveAspectRatio", "none");
  mini.setAttribute("aria-hidden", "true");
  for (const ln of svg.querySelectorAll(".ln")) {
    const g = document.createElementNS(NS, "g");
    g.setAttribute("class", ln.getAttribute("class")); // .ln.c-<line>: the line filter dims it like the map
    const p = document.createElementNS(NS, "path");
    p.setAttribute("d", ln.querySelector("path").getAttribute("d"));
    g.append(p);
    mini.append(g);
  }
  const hubRect = svg.querySelector(".hub rect");
  if (hubRect) { const r = hubRect.cloneNode(); r.setAttribute("class", "map-rail__hub"); mini.append(r); }
  rail.append(mini);
  // only the band the lines run in (the map's height is mostly labels), at the map's full width.
  // Measured once the map is visible (getBBox is empty while it's hidden on phones).
  let cropped = false;
  function crop() {
    try {
      let top = Infinity, bottom = -Infinity;
      for (const el of svg.querySelectorAll(".ln path, .hub rect")) {
        const b = el.getBBox();
        top = Math.min(top, b.y);
        bottom = Math.max(bottom, b.y + b.height);
      }
      if (!(bottom > top)) return;
      const vb = svg.viewBox.baseVal;
      mini.setAttribute("viewBox", `${vb.x} ${top - 6} ${vb.width} ${bottom - top + 12}`);
      cropped = true;
    } catch {}
  }
  const win = document.createElement("span");
  win.className = "map-rail__window";
  rail.append(win);
  scroller.after(rail);

  // rtl: scrollLeft runs from -max (left end) to 0 (right end); pos is the same thing counted from the left
  const maxScroll = () => scroller.scrollWidth - scroller.clientWidth;
  function syncRail() {
    const max = maxScroll();
    const on = max > 4;
    rail.hidden = !on;
    scroller.classList.toggle("has-rail", on);
    if (!on) return;
    if (!cropped) crop();
    const pos = Math.max(0, Math.min(max, scroller.scrollLeft + max));
    win.style.setProperty("--l", `${(pos / scroller.scrollWidth) * 100}%`);
    win.style.setProperty("--w", `${(scroller.clientWidth / scroller.scrollWidth) * 100}%`);
    rail.setAttribute("aria-valuenow", String(Math.round((pos / max) * 100)));
    rail.setAttribute("aria-valuetext", markedYear() || "Now");
  }
  const markedYear = () => yearButtons.find((b) => b.classList.contains("is-current"))?.textContent;
  // put the window's left edge at clientX - grab
  let grab = null;
  function railTo(clientX, smooth) {
    const r = rail.getBoundingClientRect();
    const max = maxScroll();
    const pos = Math.max(0, Math.min(max, ((clientX - grab - r.left) / r.width) * scroller.scrollWidth));
    scroller.scrollTo({ left: pos - max, behavior: smooth ? behavior : "auto" });
  }
  rail.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    rail.setPointerCapture(e.pointerId);
    rail.classList.add("is-grabbing");
    hide(true);
    const w = win.getBoundingClientRect();
    const onWindow = e.clientX >= w.left && e.clientX <= w.right;
    // grabbing the window keeps where it was held; anywhere else the window glides over to centre there
    grab = onWindow ? e.clientX - w.left : w.width / 2;
    if (!onWindow) railTo(e.clientX, true);
  });
  rail.addEventListener("pointermove", (e) => { if (grab !== null && e.buttons) railTo(e.clientX, false); });
  const release = () => { grab = null; rail.classList.remove("is-grabbing"); };
  rail.addEventListener("pointerup", release);
  rail.addEventListener("pointercancel", release);
  rail.addEventListener("keydown", (e) => {
    const step = scroller.clientWidth * 0.5;
    const moves = { ArrowLeft: -step, ArrowRight: step, PageUp: -scroller.clientWidth, PageDown: scroller.clientWidth };
    if (e.key in moves) scroller.scrollBy({ left: moves[e.key], behavior });
    else if (e.key === "Home") scroller.scrollTo({ left: -maxScroll(), behavior });
    else if (e.key === "End") scroller.scrollTo({ left: 0, behavior });
    else return;
    e.preventDefault();
  });
  new ResizeObserver(syncRail).observe(scroller);
  syncRail();
}
