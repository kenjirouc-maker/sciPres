/* EVOQUEST sound design. Every sound is synthesised with the Web Audio API at runtime:
   no audio files, no network, nothing to download. Browsers only allow audio after a
   user gesture, so the engine is created lazily by unlock() on the first click/key/tap.

   Signal flow:  voices -> dry bus ----------------------> master -> compressor -> out
                        \-> reverb send -> convolver ---/                                */

const STORE_KEY = 'evoquest.sound';

function loadMuted() {
  try { return localStorage.getItem(STORE_KEY) === 'off'; } catch (e) { return false; }
}
function saveMuted(m) {
  try { localStorage.setItem(STORE_KEY, m ? 'off' : 'on'); } catch (e) { /* storage blocked: keep in memory */ }
}

const NOTE = (n) => 440 * Math.pow(2, (n - 69) / 12); // MIDI -> Hz

export function createSFX() {
  let ctx = null, master, dry, wet, noise, drone = null, muted = loadMuted();
  let lastTick = 0, seq = null;
  const listeners = [];

  function build() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try { ctx = new AC({ latencyHint: 'interactive' }); } catch (e) { return null; }

    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.knee.value = 12; comp.ratio.value = 4;
    comp.attack.value = 0.004; comp.release.value = 0.25;
    master = ctx.createGain(); master.gain.value = muted ? 0 : 0.85;
    master.connect(comp); comp.connect(ctx.destination);

    dry = ctx.createGain(); dry.connect(master);

    // Synthetic hall: exponentially decaying stereo noise, generated once.
    const len = Math.floor(ctx.sampleRate * 2.2), ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
    }
    const conv = ctx.createConvolver(); conv.buffer = ir;
    wet = ctx.createGain(); wet.gain.value = 0.55;
    wet.connect(conv); conv.connect(master);

    noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const nd = noise.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    return ctx;
  }

  /* ---------- small building blocks ---------- */
  // Route a voice to the dry bus (or a sequence bus) plus an optional reverb send.
  function out(node, send = 0.3, bus = null) {
    node.connect(bus || dry);
    if (send > 0 && !bus) { const s = ctx.createGain(); s.gain.value = send; node.connect(s); s.connect(wet); }
    return node;
  }
  function env(g, t, a, peak, hold, rel) {
    g.gain.cancelScheduledValues(t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.setValueAtTime(peak, t + a + hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + hold + rel);
    return t + a + hold + rel;
  }
  function tone(freq, t, { type = 'sine', a = 0.01, peak = 0.1, hold = 0, rel = 0.6, send = 0.35, detune = 0, bus = null, pan = 0 } = {}) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t); o.detune.value = detune;
    let node = g;
    if (pan && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = pan; g.connect(p); node = p; }
    o.connect(g); out(node, send, bus);
    const end = env(g, t, a, peak, hold, rel);
    o.start(t); o.stop(end + 0.05);
    return o;
  }
  function noiseSrc(t, dur) {
    const s = ctx.createBufferSource(); s.buffer = noise; s.loop = true;
    s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.05);
    return s;
  }
  const ready = () => ctx && ctx.state === 'running' && !muted;

  /* ---------- ambient bed: a quiet, slowly breathing drone ---------- */
  function startDrone() {
    if (drone || !ctx) return;
    const t = ctx.currentTime, g = ctx.createGain(), lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 320; lp.Q.value = 0.7;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.05, t + 4);
    const oscs = [[NOTE(33), 'sawtooth', -7], [NOTE(33), 'sawtooth', 7], [NOTE(40), 'triangle', 0], [NOTE(21), 'sine', 0]].map(([f, ty, dt]) => {
      const o = ctx.createOscillator(); o.type = ty; o.frequency.value = f; o.detune.value = dt;
      const og = ctx.createGain(); og.gain.value = ty === 'sine' ? 0.5 : 0.22; o.connect(og); og.connect(lp); o.start(t); return o;
    });
    const lfo = ctx.createOscillator(), lfoG = ctx.createGain();
    lfo.frequency.value = 0.05; lfoG.gain.value = 140; lfo.connect(lfoG); lfoG.connect(lp.frequency); lfo.start(t);
    lp.connect(g); out(g, 0.5);
    drone = { g, lp, oscs, lfo };
  }
  function droneMood(dark) {
    if (!drone) return;
    const t = ctx.currentTime;
    drone.lp.frequency.cancelScheduledValues(t);
    drone.lp.frequency.setTargetAtTime(dark ? 190 : 320, t, 0.8);
  }

  /* ---------- public sounds ---------- */
  // Slide transition: a band-passed noise sweep that pans with the on-screen glow line, plus a low thump on arrival.
  function whoosh(dir = 1, strength = 1) {
    if (!ready()) return;
    const t = ctx.currentTime + 0.01, d = 0.95;
    const src = noiseSrc(t, d), bp = ctx.createBiquadFilter(), g = ctx.createGain();
    bp.type = 'bandpass'; bp.Q.value = 1.1;
    bp.frequency.setValueAtTime(dir > 0 ? 260 : 2600, t);
    bp.frequency.exponentialRampToValueAtTime(dir > 0 ? 2800 : 300, t + d * 0.8);
    let node = g;
    if (ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.setValueAtTime(-0.85 * dir, t); p.pan.linearRampToValueAtTime(0.85 * dir, t + d);
      g.connect(p); node = p;
    }
    src.connect(bp); bp.connect(g); out(node, 0.4);
    env(g, t, 0.28, 0.16 * strength, 0.12, 0.55);
    const o = ctx.createOscillator(), og = ctx.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(110, t + 0.35); o.frequency.exponentialRampToValueAtTime(42, t + 0.9);
    o.connect(og); out(og, 0.15); env(og, t + 0.35, 0.02, 0.2 * strength, 0.04, 0.5);
    o.start(t + 0.35); o.stop(t + 1);
  }

  // Decode text: a tiny burst of digital ticks (rate-limited so stacked labels never get noisy).
  function decode(delayMs = 0) {
    if (!ready()) return;
    const at = ctx.currentTime + delayMs / 1000;
    if (at < lastTick + 0.09) return;
    lastTick = at;
    for (let i = 0; i < 5; i++) {
      tone(2200 + Math.random() * 1400, at + i * 0.034, { type: 'square', a: 0.002, peak: 0.011, rel: 0.025, send: 0.08 });
    }
  }

  function click() { if (ready()) tone(1320, ctx.currentTime, { type: 'triangle', a: 0.002, peak: 0.05, rel: 0.08, send: 0.1 }); }

  // Opening: sub boom under the point of light, then a bright shimmer on the anamorphic flare.
  function intro() {
    if (!ready()) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(70, t + 0.15); o.frequency.exponentialRampToValueAtTime(30, t + 2);
    o.connect(g); out(g, 0.3); env(g, t + 0.15, 0.05, 0.35, 0.2, 1.8); o.start(t + 0.15); o.stop(t + 2.4);
    const src = noiseSrc(t + 0.8, 1.6), hp = ctx.createBiquadFilter(), ng = ctx.createGain();
    hp.type = 'highpass'; hp.frequency.value = 5000; src.connect(hp); hp.connect(ng); out(ng, 0.8);
    env(ng, t + 0.85, 0.12, 0.05, 0.1, 1.2);
    [76, 83, 88].forEach((n, i) => tone(NOTE(n), t + 0.9 + i * 0.07, { peak: 0.035, a: 0.01, rel: 1.6, send: 0.9 }));
  }

  // Tree of Science: the seed blooms, the trunk swells, then each branch pops with a rising pentatonic note.
  function cancelSeq() {
    if (!seq) return;
    const g = seq, t = ctx.currentTime;
    g.gain.cancelScheduledValues(t); g.gain.setTargetAtTime(0, t, 0.08);
    setTimeout(() => { try { g.disconnect(); } catch (e) { /* already gone */ } }, 600);
    seq = null;
  }
  function tree() {
    if (!ready()) return;
    cancelSeq();
    const t = ctx.currentTime, bus = ctx.createGain();
    bus.connect(master); seq = bus;
    const busWet = ctx.createGain(); busWet.gain.value = 0.7; bus.connect(busWet); busWet.connect(wet);
    tone(NOTE(57), t + 0.55, { peak: 0.06, a: 0.05, rel: 2.2, bus, send: 0 });
    tone(NOTE(64), t + 0.6, { peak: 0.04, a: 0.08, rel: 2.2, bus, send: 0 });
    const src = noiseSrc(t + 1.2, 1.8), bp = ctx.createBiquadFilter(), ng = ctx.createGain();
    bp.type = 'bandpass'; bp.Q.value = 3; bp.frequency.setValueAtTime(400, t + 1.2); bp.frequency.exponentialRampToValueAtTime(3200, t + 2.8);
    src.connect(bp); bp.connect(ng); ng.connect(bus); env(ng, t + 1.2, 0.8, 0.05, 0.3, 0.6);
    const scale = [69, 72, 74, 76, 79, 81, 84, 86];
    scale.forEach((n, i) => {
      const at = t + 2.4 + i * 0.34 + 0.85;
      tone(NOTE(n), at, { peak: 0.045, a: 0.004, rel: 1.1, bus, send: 0, pan: i % 2 ? 0.45 : -0.45 });
      tone(NOTE(n + 12), at, { type: 'triangle', peak: 0.012, a: 0.004, rel: 0.5, bus, send: 0, pan: i % 2 ? 0.45 : -0.45 });
    });
    [81, 88].forEach((n, i) => tone(NOTE(n), t + 6.1 + i * 0.12, { peak: 0.03, a: 0.01, rel: 2.4, bus, send: 0 }));
  }
  function treePanel(on) { if (ready()) { tone(NOTE(on ? 76 : 69), ctx.currentTime, { peak: 0.03, a: 0.01, rel: 0.9, send: 0.6 }); } }

  // Finale: a widening Cmaj9 swell, a boom on the ring, and bell tones as each line rises.
  function finale() {
    if (!ready()) return;
    cancelSeq();
    const t = ctx.currentTime, bus = ctx.createGain(); bus.connect(master); seq = bus;
    const busWet = ctx.createGain(); busWet.gain.value = 0.8; bus.connect(busWet); busWet.connect(wet);
    const lp = ctx.createBiquadFilter(), pg = ctx.createGain();
    lp.type = 'lowpass'; lp.frequency.setValueAtTime(260, t); lp.frequency.exponentialRampToValueAtTime(2600, t + 3);
    lp.connect(pg); pg.connect(bus); env(pg, t, 1.4, 0.07, 3.2, 4);
    [48, 55, 62, 64, 71].forEach((n) => [-9, 9].forEach((dt) => {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = NOTE(n); o.detune.value = dt;
      o.connect(lp); o.start(t); o.stop(t + 9);
    }));
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(64, t + 0.4); o.frequency.exponentialRampToValueAtTime(28, t + 2.4);
    o.connect(g); g.connect(bus); env(g, t + 0.4, 0.03, 0.3, 0.2, 2); o.start(t + 0.4); o.stop(t + 2.8);
    [0, 1, 2].forEach((i) => {
      const at = t + 0.5 + i * 0.2;
      [1, 2.76, 5.4].forEach((h, k) => tone(NOTE(79 + i * 2) * h, at, { peak: 0.03 / (k + 1), a: 0.003, rel: 2.2 / (k + 1), bus, send: 0 }));
    });
  }

  function setMuted(m) {
    muted = !!m; saveMuted(muted);
    if (ctx) { const t = ctx.currentTime; master.gain.cancelScheduledValues(t); master.gain.setTargetAtTime(muted ? 0 : 0.85, t, 0.08); }
    listeners.forEach((f) => f(muted));
  }

  // Must run inside a user-gesture handler: creates/resumes the context and starts the ambient bed.
  function unlock() {
    if (!ctx && !build()) return;
    if (ctx.state !== 'running') { const p = ctx.resume(); if (p && p.catch) p.catch(() => {}); }
    startDrone();
  }

  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    if (document.hidden) ctx.suspend().catch(() => {}); else ctx.resume().catch(() => {});
  });

  return {
    unlock, whoosh, decode, click, intro, tree, treePanel, finale, cancelSeq, droneMood,
    toggle() { setMuted(!muted); if (!muted) unlock(); return muted; },
    isMuted: () => muted,
    onChange(f) { listeners.push(f); f(muted); },
  };
}
