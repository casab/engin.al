// Search over /search.json: a dialog (header button, Ctrl/Cmd+K or /) and the live search on /search/.
// Loaded by site.js on first use; the index is fetched on first open. Without JS, /search/ lists everything A–Z.

// ---------------------------------------------------------------- index
let loading = null;
const LINES = new Map();

// Fold case and accents one character at a time so positions in the folded text match the original
// (needed for highlighting). Turkish dotted/dotless i both fold to i; ş ç ğ ö ü â lose their marks.
const foldCache = new Map();
function foldChar(ch) {
  let f = foldCache.get(ch);
  if (f === undefined) {
    f = ch === "İ" || ch === "I" || ch === "ı" ? "i" : (ch.normalize("NFD")[0] || ch).toLowerCase();
    if (f.length !== ch.length) f = ch.toLowerCase().length === ch.length ? ch.toLowerCase() : ch;
    foldCache.set(ch, f);
  }
  return f;
}
const fold = (s) => { let o = ""; for (const ch of String(s ?? "")) o += foldChar(ch); return o; };

function load() {
  loading ||= fetch("/search.json")
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
    .then((data) => {
      for (const l of data.lines || []) LINES.set(l.id, l);
      return (data.items || []).map((it, i) => {
        const lineWords = (it.l || []).map((id) => { const l = LINES.get(id); return l ? `${l.code} ${l.label}` : id; }).join(" ");
        return {
          ...it, i,
          ft: fold(it.t),
          fs: it.s ? fold(it.s) : "",
          fo: fold([it.m, it.x, it.y, it.k, lineWords].filter(Boolean).join(" ")),
          fd: it.d ? fold(it.d) : "",
        };
      });
    })
    .catch((err) => { loading = null; throw err; });
  return loading;
}

const WORD = /[\p{L}\p{N}]/u;
function score(it, terms, q) {
  let total = 0;
  for (const term of terms) {
    const at = it.ft.indexOf(term);
    let s = 0;
    if (at === 0) s = 30;
    else if (at > 0) s = WORD.test(it.ft[at - 1]) ? 10 : 20; // a word start in the title beats the middle of one
    else if (it.fs.includes(term)) s = 12;
    else if (it.fo.includes(term)) s = 4;
    else if (it.fd.includes(term)) s = 1;
    if (!s) return 0; // every word has to match somewhere
    total += s;
  }
  if (it.ft.startsWith(q)) total += 50;
  return total;
}

function search(items, query, line) {
  const pool = line === "all" ? items : items.filter((it) => (it.l || []).includes(line));
  const q = fold(query).trim().replace(/\s+/g, " ");
  if (!q) return { list: pool.slice(0, 8), latest: true, total: pool.length };
  const terms = q.split(" ");
  const hits = [];
  for (const it of pool) { const s = score(it, terms, q); if (s) hits.push([s, it]); }
  hits.sort((a, b) => b[0] - a[0] || a[1].i - b[1].i);
  return { list: hits.slice(0, 40).map((h) => h[1]), latest: false, total: hits.length, terms };
}

// ---------------------------------------------------------------- rendering helpers
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

// the title with each matched word wrapped in <mark>
function highlight(text, folded, terms) {
  const frag = document.createDocumentFragment();
  const ranges = [];
  for (const t of terms || []) {
    let at = folded.indexOf(t);
    while (at !== -1) { ranges.push([at, at + t.length]); at = folded.indexOf(t, at + t.length); }
  }
  ranges.sort((a, b) => a[0] - b[0]);
  let pos = 0;
  for (const [a, b] of ranges) {
    if (b <= pos) continue;
    const from = Math.max(a, pos);
    if (from > pos) frag.append(text.slice(pos, from));
    frag.append(el("mark", null, text.slice(from, b)));
    pos = b;
  }
  frag.append(text.slice(pos));
  return frag;
}

function metaLine(it) {
  const parts = String(it.m || "").split(" · ").filter((p) => p && p !== String(it.y));
  return [it.k, it.y, ...parts].filter(Boolean).join(" · ");
}

// ---------------------------------------------------------------- one search UI (dialog or page)
let uid = 0;
function createUI({ inDialog, onClose }) {
  const id = `search-${++uid}`;
  const root = el("div", "search__panel");
  root.innerHTML = `
    <div class="search__bar">
      <svg viewBox="0 0 16 16" width="18" height="18" aria-hidden="true" focusable="false"><circle cx="6.5" cy="6.5" r="4.75" fill="none" stroke="currentColor" stroke-width="2"/><path d="M10 10l4.5 4.5" stroke="currentColor" stroke-width="2" stroke-linecap="square"/></svg>
      <input class="search__input" type="search" role="combobox" aria-autocomplete="list" aria-expanded="true"
        aria-controls="${id}-list" aria-describedby="${id}-status" aria-label="Search the network"
        placeholder="Search stations, years, stacks…" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="go">
      ${inDialog ? '<button class="search__close" type="button"><span class="search__close-key">Esc</span><span class="search__close-word">Close</span></button>' : ""}
    </div>
    <div class="search__chips" role="group" aria-label="Line"></div>
    <p class="search__status mono muted" id="${id}-status" aria-live="polite"></p>
    <ul class="search__results" role="listbox" id="${id}-list" aria-label="Results"></ul>
    ${inDialog ? '<p class="search__foot mono muted" aria-hidden="true"><kbd>↑</kbd><kbd>↓</kbd> move · <kbd>Enter</kbd> open · <kbd>Esc</kbd> close</p>' : ""}`;
  const input = root.querySelector("input");
  const chips = root.querySelector(".search__chips");
  const status = root.querySelector(".search__status");
  const list = root.querySelector(".search__results");
  root.querySelector(".search__close")?.addEventListener("click", () => onClose && onClose());

  let items = [], line = "all", active = -1, options = [];

  function addChip(value, label, lineId) {
    const b = el("button", lineId ? `chip c-${lineId}` : "chip");
    b.type = "button";
    b.dataset.line = value;
    b.setAttribute("aria-pressed", String(value === line));
    if (lineId) { const bar = el("span", "bar"); bar.setAttribute("aria-hidden", "true"); b.append(bar); }
    b.append(label);
    b.addEventListener("click", () => {
      line = value;
      chips.querySelectorAll(".chip").forEach((c) => c.setAttribute("aria-pressed", String(c.dataset.line === line)));
      render();
      input.focus();
    });
    chips.append(b);
  }

  function setActive(n) {
    if (!options.length) { active = -1; input.removeAttribute("aria-activedescendant"); return; }
    active = (n + options.length) % options.length;
    options.forEach((o, i) => o.setAttribute("aria-selected", String(i === active)));
    input.setAttribute("aria-activedescendant", options[active].id);
    options[active].scrollIntoView({ block: "nearest" });
  }

  function render() {
    const query = input.value;
    const { list: hits, latest, total, terms } = search(items, query, line);
    list.replaceChildren();
    options = hits.map((it, n) => {
      const li = el("li", "search__opt");
      li.id = `${id}-o${n}`;
      li.setAttribute("role", "option");
      li.setAttribute("aria-selected", "false");
      const a = el(it.u ? "a" : "div", "search__hit");
      if (it.u) { a.href = it.u; a.tabIndex = -1; }
      const bars = el("span", "search__bars");
      bars.setAttribute("aria-hidden", "true");
      for (const l of it.l || []) bars.append(el("span", `bar c-${l}`));
      const title = el("span", "search__t");
      title.append(highlight(it.t, it.ft, terms));
      a.append(bars, title, el("span", "search__m mono muted", metaLine(it)));
      if (it.d && !latest) a.append(el("span", "search__d muted", it.d));
      li.append(a);
      // pointer: hovering moves the active option; stations without a page just stay listed
      li.addEventListener("pointermove", () => { const i = options.indexOf(li); if (i !== active) setActive(i); });
      return li;
    });
    list.append(...options);
    const lineName = line === "all" ? "" : ` on ${LINES.get(line)?.label || line}`;
    status.textContent = latest
      ? `Latest${lineName} · ${total} in all`
      : total ? `${total} match${total === 1 ? "" : "es"}${lineName}${total > hits.length ? `, top ${hits.length} shown` : ""}`
      : `Nothing${lineName} matches “${query.trim()}”.`;
    input.setAttribute("aria-expanded", String(options.length > 0));
    // with a query the best match is active (Enter opens it); the "latest" list waits for the arrow keys
    if (options.length && !latest) setActive(0);
    else { active = -1; input.removeAttribute("aria-activedescendant"); }
  }

  function go(newTab) {
    const o = options[active] || (input.value.trim() && options[0]);
    const a = o && o.querySelector("a");
    if (!a) return;
    if (newTab) window.open(a.href, "_blank", "noopener"); else { onClose && onClose(true); location.href = a.href; }
  }

  input.addEventListener("input", () => { render(); root.dispatchEvent(new CustomEvent("search:query", { detail: input.value })); });
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive(active + 1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive(active < 0 ? options.length - 1 : active - 1); }
    else if (e.key === "Enter") { e.preventDefault(); go(e.ctrlKey || e.metaKey); }
    // type="search" clears itself on Escape and keeps the dialog open: in the dialog Escape always closes it
    else if (e.key === "Escape" && inDialog) { e.preventDefault(); onClose && onClose(); }
    else if (e.key === "Escape" && !inDialog && input.value) { e.preventDefault(); input.value = ""; render(); root.dispatchEvent(new CustomEvent("search:query", { detail: "" })); }
  });

  status.textContent = "Loading the index…";
  load().then((loaded) => {
    items = loaded;
    addChip("all", "All lines");
    for (const l of LINES.values()) addChip(l.id, `${l.code} ${l.label}`, l.id);
    render();
  }).catch(() => { status.textContent = "The search index didn't load. The A–Z list on /search/ has everything."; });

  return { root, input, refresh: () => items.length && render() };
}

// ---------------------------------------------------------------- dialog
let dialog = null, ui = null, opener = null, pageUI = null;
export function openDialog() {
  if (pageUI) { pageUI.input.focus(); pageUI.input.select(); return; } // on /search/ the page is the search
  if (!dialog) {
    dialog = el("dialog", "search");
    dialog.setAttribute("aria-label", "Search");
    ui = createUI({ inDialog: true, onClose: (leaving) => close(leaving) });
    dialog.append(ui.root);
    // a click on the backdrop (the dialog element itself, outside the panel) closes it
    dialog.addEventListener("click", (e) => { if (e.target === dialog) close(); });
    dialog.addEventListener("close", () => { if (opener && document.contains(opener)) opener.focus(); opener = null; });
    document.body.append(dialog);
  }
  if (dialog.open) { ui.input.focus(); return; }
  opener = document.activeElement;
  dialog.showModal();
  ui.input.focus();
  ui.input.select();
  ui.refresh();
}
function close(leaving) {
  if (!dialog || !dialog.open) return;
  if (leaving) opener = null; // navigating away: don't flash focus back to the button
  dialog.close();
}

// ---------------------------------------------------------------- /search/ page
export function mountPage(host) {
  const az = document.querySelector("[data-search-az]");
  pageUI = createUI({ inDialog: false });
  host.append(pageUI.root);
  host.hidden = false;
  const params = new URLSearchParams(location.search);
  if (params.get("q")) pageUI.input.value = params.get("q");
  const sync = (q) => {
    if (az) az.hidden = !!q.trim();
    const url = new URL(location.href);
    if (q.trim()) url.searchParams.set("q", q.trim()); else url.searchParams.delete("q");
    history.replaceState(null, "", url);
  };
  pageUI.root.addEventListener("search:query", (e) => sync(e.detail));
  sync(pageUI.input.value);
  pageUI.input.focus();
}
