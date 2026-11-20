// A small polyphonic synth that drives the scope with its real output.
// Off until the visitor turns it on (browsers need a gesture for audio anyway).
// Keys: A W S E D F T G Y H U J K = C4..C5 (Z / X shift the octave). Pointer: x = pitch, y = filter.

const KEYS = "awsedftgyhujk";
const N = 512;

export function createSynth() {
  let ctx = null, out, filter, analyser, buf, octave = 0;
  const voices = new Map();

  function init() {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    out = ctx.createGain();
    out.gain.value = 0.22;
    filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 2400;
    filter.Q.value = 6;
    const comp = ctx.createDynamicsCompressor();
    analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    buf = new Float32Array(analyser.fftSize);
    filter.connect(out).connect(comp).connect(analyser).connect(ctx.destination);
  }

  function noteOn(id, midi) {
    if (!ctx || voices.has(id)) return;
    const f = 440 * 2 ** ((midi - 69) / 12);
    const now = ctx.currentTime;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(0.5, now + 0.01);
    g.gain.exponentialRampToValueAtTime(0.3, now + 0.25);
    const o1 = ctx.createOscillator(), o2 = ctx.createOscillator(), sub = ctx.createOscillator();
    o1.type = "sawtooth"; o2.type = "sawtooth"; sub.type = "square";
    o1.frequency.value = f; o2.frequency.value = f; sub.frequency.value = f / 2;
    o1.detune.value = -7; o2.detune.value = 7;
    const subG = ctx.createGain(); subG.gain.value = 0.25;
    o1.connect(g); o2.connect(g); sub.connect(subG).connect(g);
    g.connect(filter);
    for (const o of [o1, o2, sub]) o.start(now);
    voices.set(id, { g, osc: [o1, o2, sub] });
  }
  function noteOff(id) {
    const v = voices.get(id);
    if (!v || !ctx) return;
    const now = ctx.currentTime;
    v.g.gain.cancelScheduledValues(now);
    v.g.gain.setValueAtTime(v.g.gain.value, now);
    v.g.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
    for (const o of v.osc) o.stop(now + 0.4);
    voices.delete(id);
  }

  // Trigger-aligned window of the output (rising zero crossing), resampled to N points.
  function read() {
    if (!ctx || !voices.size) return null;
    analyser.getFloatTimeDomainData(buf);
    let start = 0;
    for (let i = 1; i < buf.length / 2; i++) if (buf[i - 1] < 0 && buf[i] >= 0) { start = i; break; }
    const span = 900;
    const outArr = new Float32Array(N);
    for (let i = 0; i < N; i++) outArr[i] = Math.max(-1, Math.min(1, buf[start + Math.floor((i / N) * span)] * 2.2));
    return outArr;
  }

  const onKey = (e) => {
    if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
    if (/^(input|textarea|select)$/i.test(e.target.tagName)) return;
    const k = e.key.toLowerCase();
    if (e.type === "keydown" && k === "z") { octave = Math.max(-2, octave - 1); return; }
    if (e.type === "keydown" && k === "x") { octave = Math.min(2, octave + 1); return; }
    const i = KEYS.indexOf(k);
    if (i < 0) return;
    e.preventDefault();
    if (e.type === "keydown") noteOn("k" + k, 60 + i + octave * 12);
    else noteOff("k" + k);
  };

  let surface = null;
  const pointerNote = (e) => {
    const r = surface.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
    const scale = [0, 2, 3, 5, 7, 8, 10, 12, 14, 15, 17, 19]; // natural minor over 1.5 octaves
    return { midi: 48 + scale[Math.min(scale.length - 1, Math.floor(x * scale.length))], cutoff: 300 + (1 - y) * 5000 };
  };
  const onDown = (e) => {
    if (!ctx) return;
    surface.setPointerCapture(e.pointerId);
    const { midi, cutoff } = pointerNote(e);
    filter.frequency.setTargetAtTime(cutoff, ctx.currentTime, 0.03);
    noteOn("p" + e.pointerId, midi);
  };
  const onMove = (e) => {
    if (!ctx || !voices.has("p" + e.pointerId)) return;
    const { midi, cutoff } = pointerNote(e);
    filter.frequency.setTargetAtTime(cutoff, ctx.currentTime, 0.03);
    const v = voices.get("p" + e.pointerId);
    const f = 440 * 2 ** ((midi - 69) / 12);
    v.osc[0].frequency.setTargetAtTime(f, ctx.currentTime, 0.02);
    v.osc[1].frequency.setTargetAtTime(f, ctx.currentTime, 0.02);
    v.osc[2].frequency.setTargetAtTime(f / 2, ctx.currentTime, 0.02);
  };
  const onUp = (e) => noteOff("p" + e.pointerId);

  return {
    async enable(el) {
      if (!ctx) init();
      await ctx.resume();
      surface = el;
      addEventListener("keydown", onKey);
      addEventListener("keyup", onKey);
      el.addEventListener("pointerdown", onDown);
      el.addEventListener("pointermove", onMove);
      el.addEventListener("pointerup", onUp);
      el.addEventListener("pointercancel", onUp);
    },
    disable() {
      for (const id of [...voices.keys()]) noteOff(id);
      removeEventListener("keydown", onKey);
      removeEventListener("keyup", onKey);
      if (surface) {
        surface.removeEventListener("pointerdown", onDown);
        surface.removeEventListener("pointermove", onMove);
        surface.removeEventListener("pointerup", onUp);
        surface.removeEventListener("pointercancel", onUp);
      }
      if (ctx) ctx.suspend();
    },
    read,
  };
}
