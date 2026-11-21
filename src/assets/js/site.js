// Site behaviour. Everything here is progressive: every page works without it.

// ---- click-to-load players (SoundCloud / Mixcloud / Bandcamp / YouTube) ----
document.addEventListener("click", (e) => {
  const a = e.target.closest(".player__facade[data-embed]");
  if (!a || e.metaKey || e.ctrlKey || e.shiftKey) return;
  e.preventDefault();
  const f = document.createElement("iframe");
  f.src = a.dataset.embed;
  f.title = a.dataset.title || "player";
  f.allow = "autoplay; encrypted-media; fullscreen";
  f.referrerPolicy = "strict-origin-when-cross-origin";
  f.className = a.dataset.video ? "video" : "h" + (a.dataset.height || 166);
  a.replaceWith(f);
});

// ---- /#f-sound selects that line in the map filter ----
function applyHashFilter() {
  const m = location.hash.match(/^#f-([\w-]+)$/);
  const input = m && document.getElementById("f-" + m[1]);
  if (input && input.type === "radio") input.checked = true;
}
applyHashFilter();
addEventListener("hashchange", applyHashFilter);

// ---- departures board: letters flip through the alphabet before they settle ----
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
function flip(board) {
  const tiles = [...board.querySelectorAll(".flap")];
  tiles.forEach((tile, i) => {
    const target = tile.textContent;
    let n = 6 + i * 2;
    const tick = () => {
      if (n-- <= 0) { tile.textContent = target; return; }
      tile.textContent = ALPHABET[(ALPHABET.indexOf(target) + n + ALPHABET.length) % ALPHABET.length] || target;
      setTimeout(tick, 45);
    };
    tick();
  });
}
if (!reduce && "IntersectionObserver" in window) {
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { flip(e.target); io.unobserve(e.target); }
  }, { threshold: 0.6 });
  document.querySelectorAll("[data-flap]").forEach((b) => io.observe(b));
}

// ---- phone menu (a <details> sheet): Escape closes it, focus moves in and back out ----
const menu = document.querySelector("[data-menu]");
if (menu) {
  const button = menu.querySelector("summary");
  menu.addEventListener("toggle", () => {
    if (menu.open) menu.querySelector(".menu__sheet a")?.focus();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && menu.open) { menu.open = false; button.focus(); }
  });
  // a link to the page you're on (or an anchor) shouldn't leave the sheet covering it
  menu.addEventListener("click", (e) => { if (e.target.closest(".menu__sheet a")) menu.open = false; });
  matchMedia("(min-width: 44rem)").addEventListener("change", (e) => { if (e.matches) menu.open = false; });
}

// ---- line pages: year bar opens folded years and follows the year in view; panels fold on phones ----
const yearLinks = [...document.querySelectorAll("[data-year-link]")];
if (yearLinks.length) {
  const openYear = (y) => { const d = document.querySelector(`details[data-year="${y}"]`); if (d) d.open = true; };
  yearLinks.forEach((a) => a.addEventListener("click", () => openYear(a.dataset.yearLink)));
  const fromHash = () => { const m = location.hash.match(/^#y(\d{4})$/); if (m) openYear(m[1]); };
  fromHash();
  addEventListener("hashchange", fromHash);
  if ("IntersectionObserver" in window) {
    const mark = (y) => yearLinks.forEach((a) => {
      const on = a.dataset.yearLink === y;
      a.classList.toggle("is-current", on);
      if (on) a.setAttribute("aria-current", "true"); else a.removeAttribute("aria-current");
      if (on) a.scrollIntoView({ block: "nearest", inline: "nearest" });
    });
    const io = new IntersectionObserver((entries) => {
      const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (visible) mark(visible.target.id.slice(1));
    }, { rootMargin: "-20% 0px -70% 0px" });
    document.querySelectorAll(".year-group").forEach((g) => io.observe(g));
  }
}
if (matchMedia("(max-width: 59.99rem)").matches) {
  document.querySelectorAll("[data-panel]").forEach((d) => { d.open = false; });
}

// ---- the network map: pan, year jumps, keyboard, station cards (only where a map is drawn) ----
const network = document.querySelector(".network");
if (network && network.querySelector(".map svg")) {
  import("./map.js").then((m) => m.initMap(network)).catch(() => {});
}

// ---- search: the header button, Ctrl/Cmd+K and / open a dialog (search.js loads on first use) ----
let searchModule = null;
const loadSearch = () => (searchModule ||= import("./search.js"));
const openSearch = () => loadSearch().then((m) => m.openDialog()).catch(() => { location.href = "/search/"; });
document.addEventListener("click", (e) => {
  const a = e.target.closest("[data-search-open]");
  if (!a || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  e.preventDefault();
  if (menu) menu.open = false;
  openSearch();
});
document.addEventListener("keydown", (e) => {
  if (e.defaultPrevented || e.altKey) return;
  const typing = e.target.closest && e.target.closest("input, textarea, select, [contenteditable=''], [contenteditable='true']");
  if ((e.key === "k" || e.key === "K") && (e.ctrlKey || e.metaKey)) { e.preventDefault(); openSearch(); }
  else if (e.key === "/" && !typing && !e.ctrlKey && !e.metaKey) { e.preventDefault(); openSearch(); }
});
const searchKey = document.querySelector("[data-search-key]");
if (searchKey) {
  const mac = /Mac|iPhone|iPad/.test(navigator.userAgentData?.platform || navigator.platform || "");
  searchKey.textContent = mac ? "⌘ K" : "Ctrl K";
  searchKey.hidden = false;
}
const searchPage = document.querySelector("[data-search-page]");
if (searchPage) loadSearch().then((m) => m.mountPage(searchPage)).catch(() => {});
