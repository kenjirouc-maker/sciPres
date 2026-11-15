/* Procedural 3D models: six "science relics", one per branch the game is built on.
   They orbit the gyro-core (the time machine) on the slides about building it with real science.
   Everything is generated from primitives, so there are no model files to load. */
import {
  Group, Mesh, InstancedMesh, Object3D, Color, Vector3, Sprite, SpriteMaterial, AdditiveBlending, DoubleSide,
  SphereGeometry, TorusGeometry, LatheGeometry, CircleGeometry, CylinderGeometry, TubeGeometry, OctahedronGeometry,
  DodecahedronGeometry, BoxGeometry, RingGeometry, Vector2, CatmullRomCurve3,
  MeshStandardMaterial, MeshPhysicalMaterial, MeshBasicMaterial, ShaderMaterial,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { planetTexture, planetRingTexture, circuitTextures } from './textures.js';

const hdr = (hex, k) => new Color(hex).multiplyScalar(k);

export function createRelics(glowTex, lowTier) {
  const emissive = [];   // [material, baseIntensity] pairs, scaled by world light each frame
  const additive = [];   // [material, baseOpacity] pairs
  const seg = lowTier ? 0.6 : 1;
  const S = (n) => Math.max(6, Math.round(n * seg));
  const em = (m) => { emissive.push([m, m.emissiveIntensity]); return m; };
  const add = (m) => { additive.push([m, m.opacity]); return m; };
  const glowSprite = (color, size, op = 1) => {
    const s = new Sprite(add(new SpriteMaterial({ map: glowTex, color, blending: AdditiveBlending, depthWrite: false, transparent: true, opacity: op, fog: false })));
    s.scale.setScalar(size); return s;
  };

  /* ---- 1. Atom (physics) ---- */
  function atom() {
    const g = new Group();
    const nucMat = em(new MeshPhysicalMaterial({ color: 0x22e6ff, emissive: 0x0aa6c4, emissiveIntensity: 0.9, roughness: 0.25, metalness: 0.1, clearcoat: 1 }));
    const nucMat2 = em(new MeshPhysicalMaterial({ color: 0x8f74ff, emissive: 0x5a3fd6, emissiveIntensity: 0.9, roughness: 0.25, metalness: 0.1, clearcoat: 1 }));
    const sg = new SphereGeometry(0.11, S(20), S(14));
    [[0, 0, 0], [0.12, 0.05, 0.04], [-0.1, 0.07, -0.05], [0.03, -0.12, 0.06], [-0.05, -0.04, 0.12], [0.06, 0.1, -0.1], [-0.08, -0.08, -0.08]]
      .forEach((p, i) => { const m = new Mesh(sg, i % 2 ? nucMat2 : nucMat); m.position.set(p[0], p[1], p[2]); g.add(m); });
    const orbMat = add(new MeshBasicMaterial({ color: hdr(0x22e6ff, 2.2), transparent: true, opacity: 0.85, blending: AdditiveBlending, depthWrite: false, fog: false }));
    const tg = new TorusGeometry(0.62, 0.006, 4, S(128));
    const electrons = [];
    [0, Math.PI / 3, -Math.PI / 3].forEach((rz, i) => {
      const frame = new Group(); frame.rotation.z = rz; frame.rotation.x = 0.35;
      const o = new Mesh(tg, orbMat); o.scale.set(1, 0.36, 1); frame.add(o);
      const e = glowSprite(hdr(0xd4f1ff, 3), 0.2); frame.add(e);
      electrons.push([e, i * 2.1, 2.4 + i * 0.5]);
      g.add(frame);
    });
    g.add(glowSprite(hdr(0x22e6ff, 1.2), 0.9, 0.5));
    return { g, update(t) { electrons.forEach(([e, p, w]) => { const a = t * w + p; e.position.set(Math.cos(a) * 0.62, Math.sin(a) * 0.62 * 0.36, 0); }); } };
  }

  /* ---- 2. Erlenmeyer flask with glowing potion (chemistry) ---- */
  function flask() {
    const g = new Group();
    const prof = [[0.0, -0.46], [0.3, -0.46], [0.4, -0.43], [0.43, -0.37], [0.27, 0.06], [0.12, 0.28], [0.1, 0.32], [0.1, 0.56], [0.125, 0.58], [0.125, 0.62], [0.095, 0.62]]
      .map((p) => new Vector2(p[0], p[1]));
    const glass = new Mesh(new LatheGeometry(prof, S(48)), new MeshPhysicalMaterial({
      color: 0xdff2ff, metalness: 0, roughness: 0.04, transparent: true, opacity: 0.26, side: DoubleSide, depthWrite: false,
      iridescence: 0.8, iridescenceIOR: 1.4, clearcoat: 1, envMapIntensity: 2.2, specularIntensity: 1,
    }));
    glass.renderOrder = 3;
    const lq = [[0.0, -0.44], [0.29, -0.44], [0.385, -0.41], [0.41, -0.36], [0.31, -0.06], [0.0, -0.06]].map((p) => new Vector2(p[0], p[1]));
    const liquid = new Mesh(new LatheGeometry(lq, S(40)), em(new MeshStandardMaterial({ color: 0x5a3fd6, emissive: 0xa48dff, emissiveIntensity: 1.5, roughness: 0.3, transparent: true, opacity: 0.92 })));
    const surf = new Mesh(new CircleGeometry(0.31, S(40)), add(new MeshBasicMaterial({ color: hdr(0xc9b8ff, 2.6), transparent: true, opacity: 0.9, blending: AdditiveBlending, depthWrite: false, fog: false })));
    surf.rotation.x = -Math.PI / 2; surf.position.y = -0.06;
    g.add(liquid, surf, glass);
    const bubbles = [];
    for (let i = 0; i < (lowTier ? 4 : 7); i++) { const b = glowSprite(hdr(0xe7ddff, 2.4), 0.07); bubbles.push([b, i / 7, 0.1 + (i % 3) * 0.06, i * 1.7]); g.add(b); }
    g.add(glowSprite(hdr(0xa48dff, 1.3), 1.1, 0.45));
    g.scale.setScalar(1.05);
    return {
      g, update(t) {
        bubbles.forEach(([b, o, r, p]) => {
          const k = (t * 0.35 + o) % 1, y = -0.4 + k * 0.95, rr = y < -0.06 ? r * (1 - (y + 0.4) * 0.3) : 0.05;
          b.position.set(Math.cos(p + t) * rr, y, Math.sin(p + t * 0.8) * rr);
          b.material.opacity = k < 0.8 ? 1 : (1 - k) * 5;
        });
      },
    };
  }

  /* ---- 3. DNA double helix (biology) ---- */
  function dna() {
    const g = new Group(), PAIRS = lowTier ? 12 : 16, R = 0.27, H = 1.5, TW = 0.48;
    const strandMat = em(new MeshStandardMaterial({ color: 0x2e8f78, emissive: 0x6ff2c8, emissiveIntensity: 1.2, roughness: 0.35, metalness: 0.2 }));
    const balls = new InstancedMesh(new SphereGeometry(0.05, S(14), S(10)), strandMat, PAIRS * 2);
    const rungMat = add(new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 1, toneMapped: true }));
    const rungs = new InstancedMesh(new CylinderGeometry(0.014, 0.014, 1, 6, 1), rungMat, PAIRS);
    const d = new Object3D(), A = [], B = [], cols = [0x6ff2c8, 0x22e6ff, 0x8f74ff, 0xd4f1ff];
    for (let k = 0; k < PAIRS; k++) {
      const y = -H / 2 + (k / (PAIRS - 1)) * H, a = k * TW;
      const pa = new Vector3(Math.cos(a) * R, y, Math.sin(a) * R), pb = new Vector3(-pa.x, y, -pa.z);
      A.push(pa); B.push(pb);
      d.position.copy(pa); d.rotation.set(0, 0, 0); d.scale.setScalar(1); d.updateMatrix(); balls.setMatrixAt(k * 2, d.matrix);
      d.position.copy(pb); d.updateMatrix(); balls.setMatrixAt(k * 2 + 1, d.matrix);
      d.position.set(0, y, 0); d.rotation.set(0, -a, Math.PI / 2); d.scale.set(1, R * 2, 1); d.updateMatrix(); rungs.setMatrixAt(k, d.matrix);
      rungs.setColorAt(k, hdr(cols[k % 4], 1.8));
    }
    const tm = em(new MeshStandardMaterial({ color: 0x1f6f5c, emissive: 0x6ff2c8, emissiveIntensity: 0.8, roughness: 0.4 }));
    [A, B].forEach((pts) => g.add(new Mesh(new TubeGeometry(new CatmullRomCurve3(pts), S(96), 0.02, 6, false), tm)));
    g.add(balls, rungs, glowSprite(hdr(0x6ff2c8, 1.1), 1.4, 0.35));
    return { g, update() {} };
  }

  /* ---- 4. Ringed planet (astronomy) ---- */
  function planet() {
    const g = new Group();
    const body = new Mesh(new SphereGeometry(0.4, S(48), S(32)), em(new MeshStandardMaterial({ map: planetTexture(), roughness: 0.85, metalness: 0, emissive: 0x2a1d6b, emissiveIntensity: 0.35 })));
    const atmo = new Mesh(new SphereGeometry(0.46, S(40), S(24)), add(new ShaderMaterial({
      uniforms: { uColor: { value: new Color(0xb9a8ff) }, uOp: { value: 1 } },
      vertexShader: 'varying vec3 vN; varying vec3 vV; void main(){ vec4 mv=modelViewMatrix*vec4(position,1.); vN=normalize(normalMatrix*normal); vV=normalize(-mv.xyz); gl_Position=projectionMatrix*mv; }',
      fragmentShader: 'uniform vec3 uColor; uniform float uOp; varying vec3 vN; varying vec3 vV; void main(){ float f=pow(1.-max(dot(vN,vV),0.),2.6); gl_FragColor=vec4(uColor*f*2.2*uOp,1.); }',
      transparent: true, blending: AdditiveBlending, depthWrite: false, side: DoubleSide,
    })));
    atmo.material.opacity = 1;
    const rg = new RingGeometry(0.56, 0.98, S(128), 1), uv = rg.attributes.uv, pos = rg.attributes.position;
    for (let i = 0; i < uv.count; i++) { const r = Math.hypot(pos.getX(i), pos.getY(i)); uv.setXY(i, (r - 0.56) / 0.42, 0.5); }
    const ring = new Mesh(rg, new MeshStandardMaterial({ map: planetRingTexture(), transparent: true, side: DoubleSide, depthWrite: false, roughness: 0.9, emissive: 0x8f74ff, emissiveIntensity: 0.25 }));
    em(ring.material);
    ring.rotation.x = -Math.PI / 2 + 0.42; ring.rotation.y = 0.2;
    const moon = new Mesh(new SphereGeometry(0.06, S(16), S(12)), new MeshStandardMaterial({ color: 0xc8d6ff, roughness: 0.9 }));
    g.add(body, atmo, ring, moon);
    return { g, update(t) { body.rotation.y = t * 0.25; moon.position.set(Math.cos(t * 0.7) * 1.15, Math.sin(t * 0.7) * 0.3, Math.sin(t * 0.7) * 0.6); } };
  }

  /* ---- 5. Crystal cluster on rock (geology) ---- */
  function crystal() {
    const g = new Group(), parts = [];
    [[0, 0.42, 0, 0, 0, 0.16, 0.6], [0.2, 0.28, 0.06, 0.1, -0.5, 0.1, 0.42], [-0.18, 0.26, -0.04, -0.15, 0.55, 0.11, 0.4], [0.06, 0.2, -0.2, -0.55, 0.2, 0.09, 0.32], [-0.06, 0.18, 0.2, 0.5, -0.1, 0.08, 0.3]]
      .forEach(([x, y, z, rx, rz, w, h]) => {
        const o = new OctahedronGeometry(1, 0); o.scale(w, h, w); o.rotateX(rx); o.rotateZ(rz); o.translate(x, y, z); parts.push(o);
      });
    const crys = new Mesh(mergeGeometries(parts), em(new MeshPhysicalMaterial({
      color: 0x8fc4ff, emissive: 0x1f5fd8, emissiveIntensity: 0.9, roughness: 0.08, metalness: 0.05, flatShading: true,
      clearcoat: 1, iridescence: 1, iridescenceIOR: 1.8, transparent: true, opacity: 0.88, envMapIntensity: 2,
    })));
    const rock = new Mesh(new DodecahedronGeometry(0.3, 0), new MeshStandardMaterial({ color: 0x1a2440, roughness: 0.95, flatShading: true }));
    rock.scale.set(1.15, 0.5, 1); rock.position.y = -0.06;
    g.add(rock, crys, glowSprite(hdr(0x8fc4ff, 1.2), 1.2, 0.4));
    g.position.y = -0.15;
    return { g, update() {} };
  }

  /* ---- 6. Processor chip (computer science) ---- */
  function chip() {
    const g = new Group(), ct = circuitTextures();
    const board = new Mesh(new BoxGeometry(0.86, 0.05, 0.86), em(new MeshStandardMaterial({ map: ct.map, emissiveMap: ct.emissive, emissive: 0x22e6ff, emissiveIntensity: 1.6, roughness: 0.45, metalness: 0.4 })));
    const die = new Mesh(new BoxGeometry(0.34, 0.06, 0.34), new MeshPhysicalMaterial({ color: 0x0b1226, roughness: 0.15, metalness: 0.6, clearcoat: 1 }));
    die.position.y = 0.055;
    const core = new Mesh(new BoxGeometry(0.16, 0.01, 0.16), add(new MeshBasicMaterial({ color: hdr(0x7feaff, 2.5), transparent: true, opacity: 1, fog: false })));
    core.position.y = 0.09;
    const PIN = lowTier ? 5 : 8, pins = new InstancedMesh(new BoxGeometry(0.03, 0.02, 0.09), new MeshStandardMaterial({ color: 0xc9d6e8, roughness: 0.25, metalness: 1 }), PIN * 4);
    const d = new Object3D(); let n = 0;
    for (let s = 0; s < 4; s++) for (let i = 0; i < PIN; i++) {
      const o = -0.33 + (i / (PIN - 1)) * 0.66, a = s * Math.PI / 2;
      d.position.set(Math.cos(a) * 0.47 - Math.sin(a) * o, 0, Math.sin(a) * 0.47 + Math.cos(a) * o); d.rotation.set(0, -a + Math.PI / 2, 0); d.updateMatrix(); pins.setMatrixAt(n++, d.matrix);
    }
    g.add(board, die, core, pins, glowSprite(hdr(0x22e6ff, 1), 1.3, 0.35));
    g.rotation.x = 0.55;
    const base = new Color(0x7feaff);
    return { g, update(t) { core.material.color.copy(base).multiplyScalar(1.8 + Math.sin(t * 3) * 0.8); } };
  }

  const list = [atom(), flask(), dna(), planet(), crystal(), chip()];
  const root = new Group();
  list.forEach((r, i) => { r.pivot = new Group(); r.pivot.add(r.g); root.add(r.pivot); r.spin = 0.35 + (i % 3) * 0.12; r.phase = i * 1.3; });
  return { root, list, emissive, additive };
}
