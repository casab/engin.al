// Site behaviour. Everything here is progressive: pages work without it.

// ---- click-to-load players (SoundCloud / Mixcloud / Bandcamp / YouTube) ----
document.addEventListener("click", (e) => {
  const a = e.target.closest(".player__facade[data-embed]");
  if (!a || e.metaKey || e.ctrlKey || e.shiftKey) return;
  e.preventDefault();
  const f = document.createElement("iframe");
  f.src = a.dataset.embed;
  f.title = a.dataset.title || "player";
  f.allow = "autoplay; encrypted-media; fullscreen";
  f.loading = "lazy";
  f.referrerPolicy = "strict-origin-when-cross-origin";
  if (a.dataset.video) f.className = "video";
  else f.className = "h" + (a.dataset.height || 166);
  a.replaceWith(f);
});

// ---- /projects/#f-circuits → select that filter ----
function applyHashFilter() {
  const m = location.hash.match(/^#f-([\w-]+)$/);
  const input = m && document.getElementById("f-" + m[1]);
  if (input && input.type === "radio") input.checked = true;
}
applyHashFilter();
addEventListener("hashchange", applyHashFilter);
document.addEventListener("change", (e) => {
  if (e.target.matches(".filter input")) history.replaceState(null, "", e.target.value === "all" ? location.pathname : "#f-" + e.target.value);
});

// ---- home: scope + synth ----
const scopeEl = document.querySelector("[data-scope]");
if (scopeEl) {
  const routeEl = document.getElementById("scope-route");
  let routePts = null;
  try { routePts = routeEl ? JSON.parse(routeEl.textContent) : null; } catch {}

  const [{ startScope }, synthMod] = await Promise.all([import("./scope.js"), import("./synth.js")]);
  let synth = null;
  const scope = startScope(scopeEl, { routePts, getExternal: () => (synth ? synth.read() : null) });

  // channel cards lock the scope to their channel on hover/focus
  const cards = document.querySelectorAll("[data-channel]");
  const mark = (ch) => cards.forEach((c) => c.classList.toggle("is-active", c.dataset.channel === ch));
  scopeEl.addEventListener("scope:channel", (e) => mark(e.detail));
  if (scope) {
    mark(scope.channel);
    for (const c of cards) {
      c.addEventListener("pointerenter", () => scope.lock(c.dataset.channel));
      c.addEventListener("focus", () => scope.lock(c.dataset.channel));
      c.addEventListener("pointerleave", () => scope.release());
      c.addEventListener("blur", () => scope.release());
    }
  }

  // sound toggle: only offered when the scope is actually running and Web Audio exists
  const toggle = document.querySelector("[data-synth-toggle]");
  if (toggle && scope && (window.AudioContext || window.webkitAudioContext)) {
    toggle.hidden = false;
    const label = toggle.querySelector("[data-synth-label]");
    toggle.addEventListener("click", async () => {
      const on = toggle.getAttribute("aria-pressed") !== "true";
      if (on) {
        synth = synth || synthMod.createSynth();
        await synth.enable(scopeEl);
        scope.lock("sound");
      } else {
        synth.disable();
        scope.release();
      }
      toggle.setAttribute("aria-pressed", String(on));
      label.textContent = on ? "sound on" : "sound off";
      scopeEl.classList.toggle("is-playing", on);
    });
  }
}
