/* Procedural textures, generated once at start-up on small canvases.
   Nothing is downloaded, so the presentation stays a single offline file. */
import {
  CanvasTexture, SRGBColorSpace, NearestFilter, LinearFilter, LinearMipmapLinearFilter, RepeatWrapping, ClampToEdgeWrapping,
} from 'three';

function canvas(w, h) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}
function tex(c, { srgb = true, pixel = false, repeat = false } = {}) {
  const t = new CanvasTexture(c);
  if (srgb) t.colorSpace = SRGBColorSpace;
  if (pixel) { t.magFilter = NearestFilter; t.minFilter = LinearMipmapLinearFilter; }
  else { t.magFilter = LinearFilter; t.minFilter = LinearMipmapLinearFilter; }
  t.wrapS = t.wrapT = repeat ? RepeatWrapping : ClampToEdgeWrapping;
  t.anisotropy = 4;
  return t;
}
// Small deterministic PRNG so every load looks identical (no flicker between reloads).
export function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/* Soft radial glow used by every sprite (electrons, core, halo, bubbles). */
export function glowTexture(size = 128) {
  const [c, x] = canvas(size, size), r = size / 2, g = x.createRadialGradient(r, r, 0, r, r, r);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.18, 'rgba(255,255,255,.85)');
  g.addColorStop(0.45, 'rgba(255,255,255,.22)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, size, size);
  return tex(c, { srgb: false });
}

/* Anamorphic lens streak: long, thin, hot centre, the same language as the intro flare. */
export function streakTexture() {
  const [c, x] = canvas(512, 32);
  const gx = x.createLinearGradient(0, 0, 512, 0);
  gx.addColorStop(0, 'rgba(255,255,255,0)'); gx.addColorStop(0.35, 'rgba(255,255,255,.25)');
  gx.addColorStop(0.5, 'rgba(255,255,255,1)'); gx.addColorStop(0.65, 'rgba(255,255,255,.25)'); gx.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = gx; x.fillRect(0, 0, 512, 32);
  x.globalCompositeOperation = 'destination-in';
  const gy = x.createLinearGradient(0, 0, 0, 32);
  gy.addColorStop(0, 'rgba(0,0,0,0)'); gy.addColorStop(0.5, 'rgba(0,0,0,1)'); gy.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = gy; x.fillRect(0, 0, 512, 32);
  return tex(c, { srgb: false });
}

/* Expanding shockwave ring. */
export function ringTexture() {
  const [c, x] = canvas(256, 256), g = x.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.78, 'rgba(255,255,255,0)');
  g.addColorStop(0.93, 'rgba(255,255,255,1)'); g.addColorStop(0.97, 'rgba(255,255,255,.35)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 256, 256);
  return tex(c, { srgb: false });
}

/* Pixel-art voxel face: bevelled 1px border with dithered grain, the game's 2D pixel look on 3D blocks. */
export function voxelTexture() {
  const N = 16, [c, x] = canvas(N, N), R = rng(7);
  const img = x.createImageData(N, N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    let v = 196 + (R() - 0.5) * 34;
    if ((i + j) % 4 === 0) v += 10;                      // ordered-dither grain
    if (i === 0 || j === 0) v = 246;                     // lit bevel (top/left)
    if (i === N - 1 || j === N - 1) v = 118;             // shaded bevel (bottom/right)
    if ((i === 1 || j === 1) && i < N - 1 && j < N - 1) v = Math.max(v, 222);
    const k = (j * N + i) * 4; img.data[k] = img.data[k + 1] = img.data[k + 2] = v; img.data[k + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  return tex(c, { pixel: true });
}

/* Emissive mask for glowing top blocks: bright rim + a few lit pixels. */
export function voxelGlowTexture() {
  const N = 16, [c, x] = canvas(N, N), R = rng(11);
  const img = x.createImageData(N, N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    let v = 26;
    if (i === 0 || j === 0 || i === N - 1 || j === N - 1) v = 255;
    else if (i === 1 || j === 1 || i === N - 2 || j === N - 2) v = 90;
    else if (R() < 0.06) v = 170;
    const k = (j * N + i) * 4; img.data[k] = img.data[k + 1] = img.data[k + 2] = v; img.data[k + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  return tex(c, { pixel: true, srgb: false });
}

/* Gas-giant bands with turbulence and a storm, for the astronomy relic. */
export function planetTexture() {
  const W = 512, H = 256, [c, x] = canvas(W, H), R = rng(3);
  const img = x.createImageData(W, H);
  const pal = [[28, 20, 74], [74, 58, 170], [143, 116, 255], [196, 186, 255], [112, 150, 255]];
  const ph = Array.from({ length: 6 }, () => R() * 6.28);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const u = i / W * 6.2832, y = j / H;
    const warp = 0.035 * Math.sin(u * 3 + ph[0] + y * 9) + 0.02 * Math.sin(u * 7 + ph[1]);
    let b = 0.5 + 0.28 * Math.sin((y + warp) * 31 + ph[2]) + 0.16 * Math.sin((y + warp) * 73 + ph[3]) + 0.06 * Math.sin(u * 11 + y * 40);
    const sx = (i / W - 0.68) * 2.2, sy = (y - 0.62) * 5.5, sd = sx * sx + sy * sy;   // storm
    if (sd < 1) b = b * sd + 1.05 * (1 - sd);
    b = Math.max(0, Math.min(0.999, b));
    const f = b * (pal.length - 1), k0 = f | 0, t = f - k0, A = pal[k0], B = pal[Math.min(pal.length - 1, k0 + 1)];
    const pole = Math.pow(Math.abs(y - 0.5) * 2, 3) * 0.45;
    const k = (j * W + i) * 4;
    for (let ch = 0; ch < 3; ch++) img.data[k + ch] = (A[ch] + (B[ch] - A[ch]) * t) * (1 - pole);
    img.data[k + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  const t = tex(c); t.wrapS = RepeatWrapping; return t;
}

/* Planetary ring bands (radial alpha profile laid out along u). */
export function planetRingTexture() {
  const W = 256, [c, x] = canvas(W, 4), R = rng(5);
  for (let i = 0; i < W; i++) {
    const u = i / W, edge = Math.min(1, u * 8, (1 - u) * 6);
    const a = edge * (0.35 + 0.45 * Math.abs(Math.sin(u * 37 + 1)) * (0.6 + 0.4 * R())) * (u > 0.62 && u < 0.67 ? 0.15 : 1);
    x.fillStyle = 'rgba(220,210,255,' + a.toFixed(3) + ')'; x.fillRect(i, 0, 1, 4);
  }
  return tex(c);
}

/* Circuit board traces: one albedo map and one emissive map drawn from the same layout. */
export function circuitTextures() {
  const S = 256, R = rng(19);
  const paths = [];
  for (let k = 0; k < 34; k++) {
    const side = k % 4, off = 30 + R() * 196;
    let px = side === 0 ? off : side === 1 ? S - 8 : side === 2 ? off : 8;
    let py = side === 0 ? 8 : side === 1 ? off : side === 2 ? S - 8 : off;
    const pts = [[px, py]];
    for (let s = 0; s < 3; s++) {
      const tx = 128 + (px - 128) * 0.55, ty = 128 + (py - 128) * 0.55;
      if (s % 2 === 0) px = tx; else py = ty;
      pts.push([px, py]);
    }
    pts.push([128 + (px - 128) * 0.36, 128 + (py - 128) * 0.36]);
    paths.push(pts);
  }
  function draw(albedo) {
    const [c, x] = canvas(S, S);
    x.fillStyle = albedo ? '#0a1430' : '#000'; x.fillRect(0, 0, S, S);
    x.lineCap = 'round'; x.lineJoin = 'round';
    x.strokeStyle = albedo ? '#1f4f8a' : '#7feaff'; x.lineWidth = 2.2;
    paths.forEach((p) => { x.beginPath(); p.forEach((q, i) => (i ? x.lineTo(q[0], q[1]) : x.moveTo(q[0], q[1]))); x.stroke(); });
    x.fillStyle = albedo ? '#4d86c4' : '#d8fbff';
    paths.forEach((p) => { const q = p[0]; x.beginPath(); x.arc(q[0], q[1], 3.4, 0, 6.29); x.fill(); });
    x.strokeStyle = albedo ? '#2a5a96' : '#3fa9ff'; x.lineWidth = 3; x.strokeRect(70, 70, 116, 116);
    return tex(c, { srgb: true });
  }
  return { map: draw(true), emissive: draw(false) };
}
