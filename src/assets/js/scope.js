// Phosphor oscilloscope for the home page hero.
//
// WebGL2 path: every frame the previous frame is copied into a fresh framebuffer at reduced
// brightness (persistence), the beam is drawn on top as additive gaussian line segments whose
// brightness falls with beam speed (like a real CRT), and the result is shown with a cheap bloom.
// Fallback: the same idea on a 2D canvas. Reduced motion: the static SVG in the markup stays.

const N = 512; // points per trace
const CHANNELS = ["code", "circuits", "sound", "distance"];
const COLORS = {
  code: [0.49, 1.0, 0.7],
  circuits: [1.0, 0.71, 0.28],
  sound: [1.0, 0.37, 0.78],
  distance: [0.37, 0.85, 1.0],
};
const LABELS = { code: "CH1 code", circuits: "CH2 circuits", sound: "CH3 sound", distance: "CH4 distance" };
const MODES = { code: "2 ms/div", circuits: "500 µs/div", sound: "1 ms/div", distance: "X–Y" };

// ---------------------------------------------------------------- waveforms (x, y in -1..1)
function fallbackRoute() {
  // a closed, wobbly loop: only used when no Strava route has been synced yet
  const pts = [];
  for (let i = 0; i < 300; i++) {
    const t = (i / 300) * Math.PI * 2;
    const r = 0.62 + 0.14 * Math.sin(3 * t + 0.7) + 0.07 * Math.sin(7 * t);
    pts.push([Math.cos(t) * r * 1.1, Math.sin(t) * r * 0.85 + 0.08 * Math.sin(5 * t)]);
  }
  return pts;
}

function resample(pts, n) {
  // even spacing along the path, so the beam moves at constant speed
  const d = [0];
  for (let i = 1; i < pts.length; i++) d.push(d[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const total = d[d.length - 1] || 1;
  const out = [];
  let j = 0;
  for (let i = 0; i < n; i++) {
    const s = (i / (n - 1)) * total;
    while (j < d.length - 2 && d[j + 1] < s) j++;
    const k = (s - d[j]) / (d[j + 1] - d[j] || 1);
    out.push([pts[j][0] + (pts[j + 1][0] - pts[j][0]) * k, pts[j][1] + (pts[j + 1][1] - pts[j][1]) * k]);
  }
  return out;
}

export function makeWaves(routePts) {
  const route = resample(routePts && routePts.length > 8 ? routePts : fallbackRoute(), N);
  const ax = 0.9;
  return {
    // CH1: attention-like bumps drifting over a baseline (a nod to ML)
    code(t, out) {
      const c = [Math.sin(t * 0.7) * 0.55, Math.sin(t * 0.43 + 2) * 0.6, Math.sin(t * 0.31 + 4) * 0.5];
      for (let i = 0; i < N; i++) {
        const x = (i / (N - 1)) * 2 - 1;
        let y = -0.45;
        y += 0.85 * Math.exp(-(((x - c[0]) / 0.09) ** 2));
        y += 1.1 * Math.exp(-(((x - c[1]) / 0.06) ** 2));
        y += 0.6 * Math.exp(-(((x - c[2]) / 0.12) ** 2));
        y += 0.025 * Math.sin(x * 60 + t * 9);
        out[i * 2] = x * ax; out[i * 2 + 1] = y * 0.75;
      }
    },
    // CH2: square wave with overshoot and ringing on every edge
    circuits(t, out) {
      for (let i = 0; i < N; i++) {
        const x = (i / (N - 1)) * 2 - 1;
        const ph = ((x + 1) * 1.6 + t * 0.35) % 1;
        const hi = ph < 0.5;
        const e = hi ? ph : ph - 0.5;
        const ring = Math.exp(-e * 38) * Math.cos(e * 150);
        const y = (hi ? 1 : -1) * (0.55 + 0.22 * ring);
        out[i * 2] = x * ax; out[i * 2 + 1] = y;
      }
    },
    // CH3: FM synthesis with a slow envelope (replaced by the real signal when the synth is on)
    sound(t, out) {
      const idx = 1.6 + 1.4 * Math.sin(t * 0.6);
      for (let i = 0; i < N; i++) {
        const x = (i / (N - 1)) * 2 - 1;
        const env = 0.35 + 0.35 * Math.sin((x + 1) * Math.PI * 0.5 + t * 0.8) ** 2;
        const y = Math.sin(x * 22 + t * 3 + idx * Math.sin(x * 7 + t * 1.3)) * env;
        out[i * 2] = x * ax; out[i * 2 + 1] = y;
      }
    },
    // CH4: the last race route in X–Y mode; the beam traces it and persistence leaves the trail
    distance(t, out) {
      const head = (t * 0.09) % 1;
      const len = 0.42;
      for (let i = 0; i < N; i++) {
        const s = (head - len + (i / (N - 1)) * len + 1) % 1;
        const p = route[Math.min(N - 1, Math.floor(s * (N - 1)))];
        out[i * 2] = p[0] * 0.92; out[i * 2 + 1] = p[1] * 0.92;
      }
    },
  };
}

// ---------------------------------------------------------------- WebGL2 renderer
const VS_QUAD = `#version 300 es
in vec2 p; out vec2 uv;
void main() { uv = p * 0.5 + 0.5; gl_Position = vec4(p, 0.0, 1.0); }`;

const FS_FADE = `#version 300 es
precision highp float;
in vec2 uv; uniform sampler2D prev; uniform float decay; out vec4 o;
void main() { vec4 c = texture(prev, uv); o = vec4(max(c.rgb * decay - 0.0015, 0.0), 1.0); }`;

const VS_SEG = `#version 300 es
in vec2 corner;          // x: 0..1 along the segment, y: -1..1 across
in vec4 seg;             // a.xy, b.xy (clip space)
uniform vec2 res; uniform float width;
out vec2 vLocal; out float vLen; out float vEnergy;
void main() {
  vec2 a = seg.xy * res * 0.5, b = seg.zw * res * 0.5;
  vec2 d = b - a; float len = length(d);
  vec2 dir = len > 0.0001 ? d / len : vec2(1.0, 0.0);
  vec2 nrm = vec2(-dir.y, dir.x);
  float along = mix(-width, len + width, corner.x);
  vec2 pos = a + dir * along + nrm * corner.y * width;
  vLocal = vec2(along, corner.y * width); vLen = len;
  vEnergy = clamp(3.0 / (len + 1.5), 0.08, 1.0); // slow beam = bright, fast beam = dim
  gl_Position = vec4(pos / (res * 0.5), 0.0, 1.0);
}`;

const FS_SEG = `#version 300 es
precision highp float;
in vec2 vLocal; in float vLen; in float vEnergy;
uniform vec3 color; uniform float width; uniform float gain; out vec4 o;
void main() {
  float x = clamp(vLocal.x, 0.0, vLen);
  float dist = length(vec2(vLocal.x - x, vLocal.y));
  float s = width * 0.38;
  float core = exp(-dist * dist / (2.0 * s * s));
  float i = core * vEnergy * gain;
  o = vec4(color * i + vec3(i * i * 0.35), 1.0);
}`;

const FS_SHOW = `#version 300 es
precision highp float;
in vec2 uv; uniform sampler2D tex; uniform vec2 px; out vec4 o;
void main() {
  vec3 c = texture(tex, uv).rgb;
  vec3 b = vec3(0.0);
  for (int i = -3; i <= 3; i++) for (int j = -3; j <= 3; j++) {
    vec2 off = vec2(float(i), float(j)) * px * 2.5;
    b += texture(tex, uv + off).rgb * exp(-float(i * i + j * j) / 6.0);
  }
  b /= 18.0;
  vec3 col = c + b * 0.9;
  col = 1.0 - exp(-col * 1.6);  // soft tone map
  o = vec4(col, 1.0);
}`;

function compile(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
  return s;
}
function program(gl, vs, fs) {
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  return p;
}

function glRenderer(canvas) {
  const gl = canvas.getContext("webgl2", { antialias: false, premultipliedAlpha: false, alpha: true });
  if (!gl) return null;
  const halfFloat = gl.getExtension("EXT_color_buffer_float") || gl.getExtension("EXT_color_buffer_half_float");
  const pFade = program(gl, VS_QUAD, FS_FADE);
  const pSeg = program(gl, VS_SEG, FS_SEG);
  const pShow = program(gl, VS_QUAD, FS_SHOW);

  const quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const vaoQuad = gl.createVertexArray();
  gl.bindVertexArray(vaoQuad);
  for (const p of [pFade, pShow]) {
    const loc = gl.getAttribLocation(p, "p");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  }

  const vaoSeg = gl.createVertexArray();
  gl.bindVertexArray(vaoSeg);
  const corners = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, corners);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, -1, 1, -1, 0, 1, 1, 1]), gl.STATIC_DRAW);
  const locC = gl.getAttribLocation(pSeg, "corner");
  gl.enableVertexAttribArray(locC);
  gl.vertexAttribPointer(locC, 2, gl.FLOAT, false, 0, 0);
  const segBuf = gl.createBuffer();
  const segData = new Float32Array((N - 1) * 4);
  gl.bindBuffer(gl.ARRAY_BUFFER, segBuf);
  gl.bufferData(gl.ARRAY_BUFFER, segData.byteLength, gl.DYNAMIC_DRAW);
  const locS = gl.getAttribLocation(pSeg, "seg");
  gl.enableVertexAttribArray(locS);
  gl.vertexAttribPointer(locS, 4, gl.FLOAT, false, 0, 0);
  gl.vertexAttribDivisor(locS, 1);

  const U = (p, n) => gl.getUniformLocation(p, n);
  const u = {
    fadePrev: U(pFade, "prev"), decay: U(pFade, "decay"),
    res: U(pSeg, "res"), width: U(pSeg, "width"), color: U(pSeg, "color"), gain: U(pSeg, "gain"), segWidth: U(pSeg, "width"),
    showTex: U(pShow, "tex"), px: U(pShow, "px"),
  };

  let targets = [], w = 0, h = 0;
  function makeTarget() {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    if (halfFloat) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
    else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    return { tex, fb };
  }
  function resize(cw, ch) {
    if (cw === w && ch === h) return;
    w = cw; h = ch;
    for (const t of targets) { gl.deleteTexture(t.tex); gl.deleteFramebuffer(t.fb); }
    targets = [makeTarget(), makeTarget()];
  }

  let cur = 0;
  return {
    resize,
    frame(points, color, { decay = 0.84, width = 3.2, gain = 1.0 } = {}) {
      const src = targets[cur], dst = targets[1 - cur];
      gl.viewport(0, 0, w, h);
      // 1. persistence: previous frame, dimmed
      gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fb);
      gl.disable(gl.BLEND);
      gl.useProgram(pFade);
      gl.bindVertexArray(vaoQuad);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, src.tex);
      gl.uniform1i(u.fadePrev, 0);
      gl.uniform1f(u.decay, decay);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      // 2. beam: additive gaussian segments
      for (let i = 0; i < N - 1; i++) {
        segData[i * 4] = points[i * 2]; segData[i * 4 + 1] = points[i * 2 + 1];
        segData[i * 4 + 2] = points[i * 2 + 2]; segData[i * 4 + 3] = points[i * 2 + 3];
      }
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE);
      gl.useProgram(pSeg);
      gl.bindVertexArray(vaoSeg);
      gl.bindBuffer(gl.ARRAY_BUFFER, segBuf);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, segData);
      gl.uniform2f(u.res, w, h);
      gl.uniform1f(u.segWidth, width);
      gl.uniform3fv(u.color, color);
      gl.uniform1f(u.gain, gain * 0.55);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, N - 1);
      // 3. show with bloom
      gl.disable(gl.BLEND);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.useProgram(pShow);
      gl.bindVertexArray(vaoQuad);
      gl.bindTexture(gl.TEXTURE_2D, dst.tex);
      gl.uniform1i(u.showTex, 0);
      gl.uniform2f(u.px, 1 / w, 1 / h);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      cur = 1 - cur;
    },
  };
}

// ---------------------------------------------------------------- 2D fallback
function canvasRenderer(canvas) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  let w = 0, h = 0;
  return {
    resize(cw, ch) { w = cw; h = ch; },
    frame(points, color, { decay = 0.84, width = 3.2 } = {}) {
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = `rgba(0,0,0,${1 - decay})`;
      ctx.fillRect(0, 0, w, h);
      const rgb = color.map((c) => Math.round(c * 255)).join(",");
      ctx.globalCompositeOperation = "lighter";
      ctx.lineJoin = ctx.lineCap = "round";
      for (const [lw, a] of [[width * 3, 0.12], [width, 0.9]]) {
        ctx.strokeStyle = `rgba(${rgb},${a})`;
        ctx.lineWidth = lw;
        ctx.beginPath();
        for (let i = 0; i < N; i++) {
          const x = (points[i * 2] * 0.5 + 0.5) * w, y = (0.5 - points[i * 2 + 1] * 0.5) * h;
          i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        }
        ctx.stroke();
      }
    },
  };
}

// ---------------------------------------------------------------- controller
export function startScope(root, { routePts, getExternal } = {}) {
  const canvas = root.querySelector("canvas");
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!canvas || reduce) return null;

  let r = null;
  try { r = glRenderer(canvas); } catch (e) { r = null; }
  if (!r) r = canvasRenderer(canvas);
  if (!r) return null;
  root.classList.add("is-live");

  const waves = makeWaves(routePts);
  const a = new Float32Array(N * 2), b = new Float32Array(N * 2), mix = new Float32Array(N * 2);
  const labelCh = root.querySelector("[data-scope-ch]");
  const labelMode = root.querySelector("[data-scope-mode]");

  let auto = true, chIdx = 0, from = "code", to = "code", morph = 1, lastSwitch = 0;
  let color = COLORS.code.slice();
  let running = true, visible = true, raf = 0, t0 = performance.now(), last = t0;

  function setLabels(ch) {
    root.dataset.ch = ch;
    root.className = root.className.replace(/\bch-\w+/g, "").trim() + " ch-" + ch;
    if (labelCh) labelCh.textContent = LABELS[ch];
    if (labelMode) labelMode.textContent = MODES[ch];
  }
  function go(ch) {
    if (ch === to) return;
    from = to; to = ch; morph = 0;
    setLabels(ch);
    root.dispatchEvent(new CustomEvent("scope:channel", { detail: ch, bubbles: true }));
  }

  function size() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    const cw = Math.max(2, Math.round(rect.width * dpr)), ch = Math.max(2, Math.round(rect.height * dpr));
    canvas.width = cw; canvas.height = ch;
    r.resize(cw, ch);
  }
  size();
  new ResizeObserver(size).observe(canvas);

  function tick(now) {
    raf = 0;
    if (!running || !visible) { last = now; return; }
    const t = (now - t0) / 1000;
    // frame-rate independent: everything below is scaled to 60 fps-equivalent steps
    const steps = Math.min(30, Math.max(0.25, (now - last) / (1000 / 60)));
    last = now;
    if (auto && t - lastSwitch > 6) { lastSwitch = t; chIdx = (CHANNELS.indexOf(to) + 1) % CHANNELS.length; go(CHANNELS[chIdx]); }

    const ext = getExternal && getExternal();
    if (ext) {
      // live synth signal: the scope becomes a real scope
      if (to !== "sound") go("sound");
      for (let i = 0; i < N; i++) { mix[i * 2] = ((i / (N - 1)) * 2 - 1) * 0.9; mix[i * 2 + 1] = ext[i] * 0.85; }
      morph = 1;
    } else {
      waves[to](t, b);
      if (morph < 1) {
        waves[from](t, a);
        morph = Math.min(1, morph + 0.025 * steps);
        const k = morph * morph * (3 - 2 * morph);
        for (let i = 0; i < N * 2; i++) mix[i] = a[i] + (b[i] - a[i]) * k;
      } else mix.set(b);
    }
    const target = COLORS[to];
    const ck = 1 - Math.pow(1 - 0.08, steps);
    for (let i = 0; i < 3; i++) color[i] += (target[i] - color[i]) * ck;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const decay = Math.pow(to === "distance" ? 0.93 : 0.82, steps);
    r.frame(mix, color, { decay, width: 2.6 * dpr, gain: ext ? 1.2 : 1 });
    raf = requestAnimationFrame(tick);
  }
  const kick = () => { if (!raf && running && visible) { last = performance.now(); raf = requestAnimationFrame(tick); } };

  new IntersectionObserver(([e]) => { visible = e.isIntersecting; kick(); }).observe(root);
  document.addEventListener("visibilitychange", () => { running = !document.hidden; kick(); });
  kick();

  return {
    lock(ch) { auto = false; go(ch); },
    release() { auto = true; },
    get channel() { return to; },
  };
}
