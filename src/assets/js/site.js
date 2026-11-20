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
