/* EVOQUEST 3D world: Three.js scene + postprocessing effect chain.
   Drop-in replacement for the original canvas-2D world: it reads the same camera/core POSES
   that the deck interpolates, so every slide keeps its composition, now rendered in real 3D.

   Render path (one RenderPass + one merged EffectPass):
     scene (HDR, half-float) -> ChromaticAberration -> Bloom (mipmap) -> Vignette -> Neutral tone map -> Film grain -> screen
   Performance: tiered quality (desktop / mobile), pixel budget, adaptive resolution that holds 50-60 fps,
   instanced geometry, no shadows, zero per-frame allocations, shader warm-up before the intro reveal. */
import {
  WebGLRenderer, Scene, PerspectiveCamera, Color, Vector2, Vector3, Matrix4, Quaternion, Euler, Object3D, Group,
  Mesh, InstancedMesh, InstancedBufferGeometry, InstancedBufferAttribute, BufferAttribute, PlaneGeometry, BoxGeometry,
  IcosahedronGeometry, TorusGeometry, SphereGeometry, BufferGeometry, Line, LineBasicMaterial,
  ShaderMaterial, MeshStandardMaterial, MeshPhysicalMaterial, MeshBasicMaterial, SpriteMaterial, Sprite,
  AdditiveBlending, CustomBlending, OneFactor, AddEquation, BackSide, DoubleSide, HalfFloatType, UnsignedByteType,
  FogExp2, PointLight, HemisphereLight, DirectionalLight, PMREMGenerator, MathUtils,
} from 'three';
import {
  EffectComposer, RenderPass, EffectPass, BloomEffect, ChromaticAberrationEffect, VignetteEffect, NoiseEffect,
  ToneMappingEffect, ToneMappingMode, BlendFunction,
} from 'postprocessing';
import { glowTexture, streakTexture, ringTexture, voxelTexture, voxelGlowTexture, rng } from './textures.js';
import { createRelics } from './relics.js';

const TAU = Math.PI * 2;
const FOG = 0.026;                                   // same exponential-squared fog as the 2D renderer
const fogAt = (depth) => { const k = FOG * depth; return Math.exp(-k * k); };
const hdr = (hex, k) => new Color(hex).multiplyScalar(k);

export function detectTier() {
  const coarse = !!(window.matchMedia && matchMedia('(pointer: coarse)').matches);
  const ua = navigator.userAgent || '';
  const mobile = /Android|iPhone|iPad|iPod|Mobile|Silk|Kindle/i.test(ua) || (navigator.maxTouchPoints > 1 && /Mac/.test(navigator.platform || ''));
  const cores = navigator.hardwareConcurrency || 4, mem = navigator.deviceMemory || 8;
  return (mobile || coarse || cores <= 2 || mem <= 2) ? 'low' : 'high';
}

export function createWorld3D(canvas, { reduced = false, tier = detectTier(), adaptive = true } = {}) {
  const LOW = tier === 'low';
  const Q = {
    maxDpr: LOW ? Math.min(window.devicePixelRatio || 1, 1.6) : Math.min(window.devicePixelRatio || 1, 2),
    maxPixels: LOW ? 1.9e6 : 3.8e6,          // pixel budget: caps 4K/retina fill cost
    minScale: LOW ? 0.5 : 0.6,
    particles: LOW ? 1800 : 3200,
    msaa: LOW ? 0 : 4,
    bloomScale: LOW ? 0.5 : 0.75,
  };

  /* ---------------- renderer + composer ---------------- */
  const renderer = new WebGLRenderer({ canvas, powerPreference: 'high-performance', antialias: false, stencil: false, depth: false, alpha: false });
  const ext = renderer.extensions;
  const halfFloat = ext.has('EXT_color_buffer_float') || ext.has('EXT_color_buffer_half_float');
  renderer.setClearColor(0x03060f, 1);

  const scene = new Scene();
  scene.fog = new FogExp2(0x03060f, FOG);
  const camera = new PerspectiveCamera(50, 16 / 9, 0.1, 220);

  const composer = new EffectComposer(renderer, { frameBufferType: halfFloat ? HalfFloatType : UnsignedByteType, multisampling: Q.msaa });
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new BloomEffect({ mipmapBlur: true, luminanceThreshold: 0.52, luminanceSmoothing: 0.28, intensity: 1.35, radius: 0.72, levels: LOW ? 6 : 8, resolutionScale: Q.bloomScale });
  const chroma = new ChromaticAberrationEffect({ offset: new Vector2(0.0004, 0.0004), radialModulation: true, modulationOffset: 0.2 });
  const vignette = new VignetteEffect({ offset: 0.28, darkness: 0.72 });
  const grain = new NoiseEffect({ blendFunction: BlendFunction.OVERLAY, premultiply: false });
  grain.blendMode.opacity.value = reduced ? 0.05 : 0.11;
  const tone = new ToneMappingEffect({ mode: ToneMappingMode.NEUTRAL });
  composer.addPass(new EffectPass(camera, chroma, bloom, vignette, tone, grain));

  /* ---------------- shared assets ---------------- */
  const GLOW = glowTexture(), STREAK = streakTexture(), RING = ringTexture();
  const sprite = (tex, color, op = 1) => new Sprite(new SpriteMaterial({ map: tex, color, blending: AdditiveBlending, depthWrite: false, transparent: true, opacity: op, fog: false }));

  /* image-based lighting: a tiny procedural studio in brand colours, prefiltered once */
  {
    const pm = new PMREMGenerator(renderer), es = new Scene();
    es.add(new Mesh(new SphereGeometry(20, 24, 12), new MeshBasicMaterial({ color: 0x050c20, side: BackSide })));
    const panel = (w, h, c, k, x, y, z) => { const m = new Mesh(new PlaneGeometry(w, h), new MeshBasicMaterial({ color: hdr(c, k), side: DoubleSide })); m.position.set(x, y, z); m.lookAt(0, 0, 0); es.add(m); };
    panel(10, 2.5, 0x22e6ff, 5, 0, 9, -6); panel(6, 6, 0x8f74ff, 3, -11, 2, 4); panel(5, 4, 0xffffff, 6, 9, 5, 9); panel(16, 1.2, 0x0f5fff, 4, 0, -8, 0);
    scene.environment = pm.fromScene(es, 0.035).texture;
    pm.dispose();
  }

  /* lights (scaled by the pose's world-light value each frame) */
  const hemi = new HemisphereLight(0x6fa8ff, 0x060a18, 0.9);
  const key = new DirectionalLight(0xcfe8ff, 1.5); key.position.set(6, 8, 10);
  const rim = new DirectionalLight(0x8f74ff, 1.8); rim.position.set(-8, 3, -6);
  const coreLight = new PointLight(0x22e6ff, 0, 0, 2);
  scene.add(hemi, key, rim, coreLight);

  /* ---------------- background: the CSS atmosphere, now in the GPU ---------------- */
  const bgU = { uRes: { value: [1, 1] }, uTime: { value: 0 }, uDark: { value: 0 } };
  const bg = new Mesh(new PlaneGeometry(2, 2), new ShaderMaterial({
    uniforms: bgU, depthTest: false, depthWrite: false, fog: false,
    vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.,1.); }',
    fragmentShader: /* glsl */`
      uniform vec2 uRes; uniform float uTime, uDark; varying vec2 vUv;
      vec3 toLin(vec3 c){ return mix(c/12.92, pow((c+.055)/1.055, vec3(2.4)), step(.04045, c)); }
      float ease(float p){ return p*p*(3.-2.*p); }
      float osc(float P){ float k=fract(uTime/(2.*P)); return ease(k<.5?k*2.:2.-k*2.); }
      vec3 blob(vec3 col, vec2 px, vec2 c, vec2 tr, float sc, float P, vec3 bc, float op, float vm){
        float e=osc(P); vec2 cc=c+tr*e*vm; float R=.4596*70.*vm*(1.+(sc-1.)*e);
        float a=max(0.,1.-length(px-cc)/R); return mix(col, bc, a*op);
      }
      void main(){
        vec2 px=vec2(vUv.x,1.-vUv.y)*uRes; float vm=max(uRes.x,uRes.y)/100.;
        vec2 q=vec2((px.x-.5*uRes.x)/(1.2*uRes.x),(px.y-1.15*uRes.y)/(.9*uRes.y)); float d=length(q);
        vec3 c0=vec3(11.,31.,74.)/255., c1=vec3(5.,12.,32.)/255., c2=vec3(3.,6.,15.)/255.;
        vec3 col = d<.46 ? mix(c0,c1,d/.46) : mix(c1,c2,clamp((d-.46)/.36,0.,1.));
        col=blob(col,px,vec2(17.*vm,9.*vm),vec2(20.,14.),1.18,26.,vec3(15.,95.,255.)/255.,.34,vm);
        col=blob(col,px,vec2(uRes.x-5.*vm,uRes.y+vm),vec2(-24.,-10.),1.1,32.,vec3(34.,230.,255.)/255.,.2,vm);
        col=blob(col,px,vec2(.34*uRes.x+35.*vm,.18*uRes.y+35.*vm),vec2(-16.,16.),1.25,38.,vec3(143.,116.,255.)/255.,.17,vm);
        col=mix(vec3(3.,6.,15.)/255., col, mix(1.,.28,uDark));
        float sh=fract(uTime/48.)*84.; vec2 g=mod(px-sh,84.); float line=max(step(g.x,1.),step(g.y,1.));
        vec2 m=vec2((px.x-.5*uRes.x)/(.7*uRes.x),(px.y-.5*uRes.y)/(.62*uRes.y)); float mask=1.-clamp((length(m)-.15)/.85,0.,1.);
        col=mix(col, vec3(120.,200.,255.)/255., .05*line*mask*mix(1.,.15,uDark));
        gl_FragColor=vec4(toLin(col),1.);
      }`,
  }));
  bg.frustumCulled = false; bg.renderOrder = -100;
  scene.add(bg);

  /* ---------------- holographic floor grid ---------------- */
  const floorU = { uTime: { value: 0 }, uAmp: { value: 0.4 }, uCore: { value: new Vector3() }, uGlow: { value: 0 }, uDpr: { value: 1 } };
  const floor = new Mesh(new PlaneGeometry(120, 110), new ShaderMaterial({
    uniforms: floorU, transparent: true, depthWrite: false, fog: false,
    blending: CustomBlending, blendEquation: AddEquation, blendSrc: OneFactor, blendDst: OneFactor,
    vertexShader: 'varying vec3 vW; varying float vZ; void main(){ vec4 w=modelMatrix*vec4(position,1.); vW=w.xyz; vec4 mv=viewMatrix*w; vZ=-mv.z; gl_Position=projectionMatrix*mv; }',
    fragmentShader: /* glsl */`
      uniform float uTime, uAmp, uGlow, uDpr; uniform vec3 uCore; varying vec3 vW; varying float vZ;
      float gridLine(vec2 p){   // exactly 1 CSS px wide at any pixel ratio, anti-aliased, moire-free at distance
        vec2 w=max(fwidth(p),vec2(1e-4)); vec2 g=abs(fract(p-.5)-.5)/w;           // distance to line, device px
        float hw=.5*uDpr; vec2 cov=clamp(hw+.5-g,0.,1.)*min(1.,2.*hw);            // box-filtered coverage
        float l=max(cov.x,cov.y); float far=clamp(max(w.x,w.y)*2.5-.5,0.,1.);
        return mix(l, .045, far);
      }
      void main(){
        vec2 p=vec2(vW.x, vW.z-mod(uTime*.35,2.))*.5;
        float f=exp(-pow(.026*vZ,2.));
        float l=gridLine(p);
        float pool=exp(-dot(vW.xz-uCore.xz,vW.xz-uCore.xz)*.035)*uGlow;
        vec3 c=vec3(.0273,.2232,.8308)*l*uAmp*.62 + vec3(.016,.79,1.)*pool*(.08+.4*l);
        gl_FragColor=vec4(c*f,1.);
      }`,
  }));
  floor.rotation.x = -Math.PI / 2; floor.position.set(0, -5.4, -25);
  scene.add(floor);

  /* ---------------- particles: instanced quads with true motion streaks ---------------- */
  const R = rng(42), PC = Q.particles;
  const pg = new InstancedBufferGeometry();
  pg.setAttribute('position', new BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), 3));
  pg.setIndex([0, 1, 2, 0, 2, 3]);
  const aPos = new Float32Array(PC * 3), aCol = new Float32Array(PC * 3), aB = new Float32Array(PC * 2);
  const PCOL = [new Color(212 / 255, 241 / 255, 1).convertSRGBToLinear(), new Color(34 / 255, 230 / 255, 1).convertSRGBToLinear(), new Color(143 / 255, 116 / 255, 1).convertSRGBToLinear()];
  for (let i = 0; i < PC; i++) {
    aPos[i * 3] = (R() - 0.5) * 90; aPos[i * 3 + 1] = (R() - 0.5) * 50; aPos[i * 3 + 2] = -60 + R() * 85;
    const r = R(), c = PCOL[r < 0.6 ? 0 : r < 0.9 ? 1 : 2];
    aCol[i * 3] = c.r; aCol[i * 3 + 1] = c.g; aCol[i * 3 + 2] = c.b;
    aB[i * 2] = 0.35 + R() * 0.65; aB[i * 2 + 1] = R() * TAU;
  }
  pg.setAttribute('aPos', new InstancedBufferAttribute(aPos, 3));
  pg.setAttribute('aCol', new InstancedBufferAttribute(aCol, 3));
  pg.setAttribute('aB', new InstancedBufferAttribute(aB, 2));
  pg.instanceCount = PC;
  const partU = { uRot: { value: 0 }, uPrevRot: { value: 0 }, uTime: { value: 0 }, uDim: { value: 1 }, uRes: { value: [1, 1] }, uPrevVP: { value: new Matrix4() }, uShutter: { value: 0 } };
  const particles = new Mesh(pg, new ShaderMaterial({
    uniforms: partU, transparent: true, depthWrite: false, fog: false,
    blending: CustomBlending, blendEquation: AddEquation, blendSrc: OneFactor, blendDst: OneFactor,
    vertexShader: /* glsl */`
      attribute vec3 aPos, aCol; attribute vec2 aB;
      uniform float uRot, uPrevRot, uTime, uDim, uShutter; uniform vec2 uRes; uniform mat4 uPrevVP;
      varying vec2 vQ; varying vec3 vC; varying float vA;
      vec3 rotY(vec3 p, float a){ float c=cos(a), s=sin(a); return vec3(p.x*c+p.z*s, p.y, -p.x*s+p.z*c); }
      void main(){
        vec3 drift=vec3(0., sin(uTime*.23+aB.y)*.18, 0.);
        vec3 wp=rotY(aPos,uRot)+drift;
        vec4 mv=viewMatrix*vec4(wp,1.); float z=-mv.z;
        if(z<.15){ gl_Position=vec4(2.,2.,2.,1.); return; }
        vec4 clip=projectionMatrix*mv;
        vec4 pc=uPrevVP*vec4(rotY(aPos,uPrevRot)+drift,1.);
        vec2 sNow=clip.xy/clip.w*.5*uRes, sPrev=pc.xy/max(pc.w,1e-3)*.5*uRes;
        vec2 vel=(sNow-sPrev)*uShutter; float L=length(vel); if(L>240.){ vel*=240./L; L=240.; }
        float size=clamp(.09*(uRes.y*.5)/z*2.6, .8, 46.);
        vec2 dir= L>.5 ? vel/L : vec2(1.,0.); vec2 nrm=vec2(-dir.y,dir.x);
        float hl=size+L*.5;
        vec2 off=dir*(position.x*hl) - vel*.5 + nrm*(position.y*size);
        clip.xy+=off/(.5*uRes)*clip.w;
        gl_Position=clip;
        vQ=vec2(position.x, position.y);
        float tw=.72+.28*sin(uTime*1.3+aB.y);
        float f=exp(-pow(.026*z,2.));
        vA=aB.x*f*uDim*.9*tw*mix(1., size/hl, .65);
        vC=aCol;
      }`,
    fragmentShader: /* glsl */`
      varying vec2 vQ; varying vec3 vC; varying float vA;
      void main(){
        float r=length(vQ); if(r>1.) discard;
        float a = r<.18 ? mix(1.,.9,r/.18) : r<.45 ? mix(.9,.25,(r-.18)/.27) : mix(.25,0.,(r-.45)/.55);
        vec3 c=mix(vec3(1.), vC, smoothstep(0.,.2,r));
        gl_FragColor=vec4(c*a*vA,1.);
      }`,
  }));
  particles.frustumCulled = false; particles.renderOrder = 2;
  scene.add(particles);

  /* ---------------- voxel terrain (instanced, pixel-art textured, lit) ---------------- */
  const COLS = 60, CS = 0.5, vr = rng(9), cells = { body: [], cyan: [], violet: [] };
  for (let ci = 0; ci < COLS; ci++) {
    let hh = Math.round(2.4 + 1.6 * Math.sin(ci * 0.31) + 1.1 * Math.sin(ci * 0.12 + 1.7) + 0.9 * Math.sin(ci * 0.77 + 0.4));
    hh = Math.max(1, Math.min(5, hh));
    for (let j = 0; j < hh; j++) {
      const top = j === hh - 1, cell = { x: (ci - COLS / 2) * CS, y: j * CS, c: ci, j };
      if (top) { const vi = vr() < 0.12, m = 0.75 + vr() * 0.25; cell.col = new Color(vi ? 0x8f74ff : 0x22e6ff).multiplyScalar(m); (vi ? cells.violet : cells.cyan).push(cell); }
      else { const l2 = vr() * 0.7, m = 0.7 + (j / hh) * 0.3; cell.col = new Color((11 + 9 * l2) / 255, (47 + 33 * l2) / 255, (122 + 36 * l2) / 255).convertSRGBToLinear().multiplyScalar(m * 2.6); cells.body.push(cell); }
    }
  }
  const VT = voxelTexture(), VG = voxelGlowTexture(), box = new BoxGeometry(1, 1, 1);
  const voxelGroup = new Group(); voxelGroup.position.set(0, -6.5, -1);
  const vmeshes = [
    [cells.body, new MeshStandardMaterial({ map: VT, roughness: 0.62, metalness: 0.25 })],
    [cells.cyan, new MeshStandardMaterial({ map: VT, roughness: 0.35, metalness: 0.1, emissive: 0x22e6ff, emissiveMap: VG, emissiveIntensity: 2.2 })],
    [cells.violet, new MeshStandardMaterial({ map: VT, roughness: 0.35, metalness: 0.1, emissive: 0x8f74ff, emissiveMap: VG, emissiveIntensity: 2.2 })],
  ].map(([list, mat]) => {
    const m = new InstancedMesh(box, mat, list.length);
    list.forEach((c, i) => m.setColorAt(i, c.col));
    m.frustumCulled = false; voxelGroup.add(m);
    return { m, list, base: mat.emissiveIntensity };
  });
  scene.add(voxelGroup);
  const dummy = new Object3D(); let lastV = -1;
  function updateVoxels(v) {
    if (Math.abs(v - lastV) < 1e-4) return; lastV = v;
    vmeshes.forEach(({ m, list }) => {
      list.forEach((cl, i) => {
        let u = (v * 1.7 - (cl.c / COLS) * 0.95 - cl.j * 0.03) / 0.45; u = Math.max(0, Math.min(1, u)); u = u * u * (3 - 2 * u);
        const s = Math.max(1e-4, CS * 0.88 * u);
        dummy.position.set(cl.x, cl.y - (1 - u) * 0.9, 0); dummy.scale.setScalar(s); dummy.updateMatrix(); m.setMatrixAt(i, dummy.matrix);
      });
      m.instanceMatrix.needsUpdate = true;
    });
  }

  /* ---------------- the gyro-core: the time machine ---------------- */
  const core = new Group(); scene.add(core);
  const RAD = [2.35, 1.8, 1.3], RHEX = [0x22e6ff, 0xd4f1ff, 0x8f74ff], BASEE = [[1.1, 0.2, 0], [0.4, 1, 0.3], [0.2, -0.6, 1]];
  const ringGeo = new TorusGeometry(1, LOW ? 0.0085 : 0.0048, 6, LOW ? 160 : 256);   // no MSAA on mobile: keep tube >= 1px
  const rings = RHEX.map((hex) => {
    const u = { uColor: { value: new Color(hex) }, uAlpha: { value: 1 }, uHead: { value: 0 } };
    const m = new Mesh(ringGeo, new ShaderMaterial({
      uniforms: u, transparent: true, depthWrite: false, fog: false,
      blending: CustomBlending, blendEquation: AddEquation, blendSrc: OneFactor, blendDst: OneFactor,
      vertexShader: 'varying vec3 vL; varying float vF; void main(){ vL=position; vec4 mv=modelViewMatrix*vec4(position,1.); vF=exp(-pow(.026*-mv.z,2.)); gl_Position=projectionMatrix*mv; }',
      fragmentShader: 'uniform vec3 uColor; uniform float uAlpha, uHead; varying vec3 vL; varying float vF; void main(){ float a=atan(vL.y,vL.x); float b=mod(uHead-a,6.2831853); float tr=exp(-b*1.5); gl_FragColor=vec4(uColor*(1.15+4.5*tr)*uAlpha*vF,1.); }',
    }));
    m.frustumCulled = false; scene.add(m);
    const e = sprite(GLOW, hdr(hex, 2)); scene.add(e);
    return { m, u, e };
  });
  // faceted crystal with glowing edges (barycentric wireframe), glassy and iridescent
  const icoGeo = new IcosahedronGeometry(0.62, 0);
  { const n = icoGeo.attributes.position.count, b = new Float32Array(n * 3); for (let i = 0; i < n; i++) b[i * 3 + (i % 3)] = 1; icoGeo.setAttribute('aBary', new BufferAttribute(b, 3)); }
  const edgeU = { uEdge: { value: hdr(0x22e6ff, 3.2) } };
  const crystalMat = new MeshPhysicalMaterial({
    color: 0x0c2350, metalness: 0.35, roughness: 0.12, flatShading: true, clearcoat: 1, clearcoatRoughness: 0.08,
    iridescence: 1, iridescenceIOR: 1.7, emissive: 0x0a2a6b, emissiveIntensity: 0.6, transparent: true, opacity: 0.62, depthWrite: false, envMapIntensity: 1.6,
  });
  crystalMat.onBeforeCompile = (sh) => {
    sh.uniforms.uEdge = edgeU.uEdge;
    sh.vertexShader = 'attribute vec3 aBary; varying vec3 vBary;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvBary=aBary;');
    sh.fragmentShader = 'uniform vec3 uEdge; varying vec3 vBary;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>',
      '#include <emissivemap_fragment>\n{ float e=min(min(vBary.x,vBary.y),vBary.z); float w=fwidth(e); totalEmissiveRadiance+=uEdge*(1.-smoothstep(w*.6,w*1.6+.012,e)); }');
  };
  crystalMat.customProgramCacheKey = () => 'evoq-crystal';
  const crystal = new Mesh(icoGeo, crystalMat); crystal.renderOrder = 4; core.add(crystal);
  const shellU = { uColor: { value: new Color(0x22e6ff) }, uOp: { value: 1 } };
  const shell = new Mesh(new SphereGeometry(0.8, 40, 24), new ShaderMaterial({
    uniforms: shellU, transparent: true, depthWrite: false, fog: false, blending: AdditiveBlending,
    vertexShader: 'varying vec3 vN, vV; void main(){ vec4 mv=modelViewMatrix*vec4(position,1.); vN=normalize(normalMatrix*normal); vV=normalize(-mv.xyz); gl_Position=projectionMatrix*mv; }',
    fragmentShader: 'uniform vec3 uColor; uniform float uOp; varying vec3 vN, vV; void main(){ float f=pow(1.-abs(dot(vN,vV)),3.); gl_FragColor=vec4(uColor*f*1.6*uOp,1.); }',
  }));
  core.add(shell);
  const coreHot = sprite(GLOW, hdr(0xffffff, 2.3)), coreHalo = sprite(GLOW, hdr(0x22e6ff, 1)), flare = sprite(STREAK, hdr(0xbff6ff, 1.6));
  coreHot.renderOrder = coreHalo.renderOrder = flare.renderOrder = 6;
  scene.add(coreHot, coreHalo, flare);
  const shock = new Mesh(new PlaneGeometry(2, 2), new MeshBasicMaterial({ map: RING, color: hdr(0x22e6ff, 2.4), blending: AdditiveBlending, transparent: true, depthWrite: false, opacity: 0, fog: false }));
  shock.renderOrder = 7; scene.add(shock);

  /* ---------------- science relics orbiting the core ---------------- */
  const relics = createRelics(GLOW, LOW);
  scene.add(relics.root);
  const OY = 0.62, OZ = 0.28;   // orbit tilt: relics cross above/below the centre, never through the headline
  const orbitPts = []; for (let i = 0; i <= 128; i++) { const a = i / 128 * TAU; orbitPts.push(new Vector3(Math.cos(a), OY * Math.sin(a), OZ * Math.sin(a))); }
  const orbit = new Line(new BufferGeometry().setFromPoints(orbitPts), new LineBasicMaterial({ color: hdr(0x8fdcff, 1.2), transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, fog: false }));
  scene.add(orbit);

  /* ---------------- sizing + adaptive resolution ---------------- */
  let W = 1, H = 1, scale = 1, dpr = 1;
  function applySize() {
    W = Math.max(1, innerWidth); H = Math.max(1, innerHeight);
    dpr = Math.max(0.5, Math.min(Q.maxDpr * scale, Math.sqrt(Q.maxPixels / (W * H))));
    renderer.setPixelRatio(dpr);
    composer.setSize(W, H);
    const a = W / H;
    camera.aspect = a;
    camera.fov = a < 16 / 9 ? MathUtils.radToDeg(2 * Math.atan(Math.tan(MathUtils.degToRad(25)) * (16 / 9) / a)) : 50;
    camera.updateProjectionMatrix();
    bgU.uRes.value = [W, H]; partU.uRes.value = [W, H]; floorU.uDpr.value = dpr;
  }
  const perf = { frames: 0, since: 0, fps: 60, low: 0, high: 0, warm: 0 };
  function governor(now) {
    if (!perf.since) { perf.since = now; perf.warm = now + 2500; return; }
    perf.frames++;
    const el = now - perf.since; if (el < 1000) return;
    perf.fps = perf.frames * 1000 / el; perf.frames = 0; perf.since = now;
    if (now < perf.warm || !adaptive) return;
    if (perf.fps < 50) { perf.high = 0; if (++perf.low >= 2) { perf.low = 0; degrade(); } }
    else if (perf.fps > 57 && scale < 1) { perf.low = 0; if (++perf.high >= 5) { perf.high = 0; scale = Math.min(1, scale * 1.1); applySize(); } }
    else { perf.low = 0; perf.high = 0; }
  }
  function degrade() {
    if (composer.multisampling > 0) { composer.multisampling = 0; return; }
    if (scale > Q.minScale) { scale = Math.max(Q.minScale, scale * 0.85); applySize(); }
  }
  document.addEventListener('visibilitychange', () => { perf.since = 0; perf.frames = 0; });

  /* ---------------- per-frame state ---------------- */
  const qG = new Quaternion(), qR = new Quaternion(), qT = new Quaternion(), eul = new Euler(), v3 = new Vector3(), fwd = new Vector3();
  const lastPos = new Vector3(), ZAXIS = new Vector3(0, 0, 1);
  let last = performance.now(), pr = 0, prevPr = 0, spinAcc = 0, crx = 0, cry = 0, flash = 0, flashAt = -1e9, flashK = 0, shockAt = -1e9, shockK = 1, dark = 0, first = true, cpuMs = 0;
  const ph = [0, 2, 4];
  const depthOf = (p) => v3.copy(p).sub(camera.position).dot(fwd);

  function step(now, S) {
    const dt = Math.min(0.05, Math.max(0.0001, (now - last) / 1000)); last = now;
    const t = now / 1000, L = S.live, kk = S.kk;
    const ox = L[6], oy = L[7], oz = L[8], os = L[9], sp = L[10], v = L[11], s = L[12], ti = L[13], g = L[14], dim = L[15];
    const relAmt = L[16] || 0, relR = L[17] || 3;
    governor(now);

    /* camera: same pose + pointer parallax + slow handheld sway as the original */
    const sway = reduced ? 0 : 1;
    camera.position.set(L[0] + S.pmx * 0.6 + Math.sin(t * 0.21) * 0.3 * sway, L[1] - S.pmy * 0.35 + Math.cos(t * 0.17) * 0.18 * sway, L[2]);
    camera.lookAt(L[3], L[4], L[5]);
    camera.updateMatrixWorld();
    camera.getWorldDirection(fwd);
    const camSpeed = first ? 0 : lastPos.distanceTo(camera.position) / dt; lastPos.copy(camera.position);

    const t0 = performance.now();
    flash = flashK * Math.exp(-Math.max(0, now - flashAt) / 1000 * 2.4);
    dark += ((S.dark ? 1 : 0) - dark) * (1 - Math.exp(-dt / 0.6));
    bgU.uTime.value = t; bgU.uDark.value = dark;

    /* lights + IBL follow the pose's world light */
    hemi.intensity = 0.9 * dim; key.intensity = 1.5 * dim; rim.intensity = 1.8 * dim; scene.environmentIntensity = dim;
    const gl = Math.min(1.4, g), gk = gl * (1 + flash * 0.9);
    coreLight.position.set(ox, oy, oz); coreLight.intensity = (14 + 26 * gl) * dim * os * (1 + flash);

    /* floor */
    floorU.uTime.value = t; floorU.uAmp.value = (0.32 + 0.16 * (1 - Math.min(1, v))) * dim;
    floorU.uCore.value.set(ox, oy, oz); floorU.uGlow.value = gk * dim * Math.min(1, os) * Math.exp(-Math.max(0, oy + 5.4 - 2) * 0.35);

    /* particles (rotation speeds up mid-transition, exactly like the 2D world) */
    prevPr = pr; pr += dt * (0.008 + 0.08 * Math.sin(Math.PI * kk));
    partU.uRot.value = pr; partU.uPrevRot.value = first ? pr : prevPr; partU.uTime.value = t; partU.uDim.value = dim;
    partU.uShutter.value = reduced || first ? 0 : Math.min(3, 0.034 / dt);

    /* voxels */
    voxelGroup.visible = v > 0.002;
    if (voxelGroup.visible) {
      voxelGroup.position.x = Math.sin(t * 0.1) * 0.5;
      updateVoxels(v);
      vmeshes.forEach((o) => { if (o.base) o.m.material.emissiveIntensity = o.base * dim; });
    }

    /* gyro-core */
    spinAcc += dt * s; crx += dt * 0.2; cry += dt * 0.35;
    qG.setFromEuler(eul.set(ti * 0.4, Math.sin(t * 0.1) * 0.4, 0, 'XYZ'));
    core.position.set(ox, oy, oz);
    const ra = (0.16 + 0.62 * gl) * 0.85 * dim;
    for (let rr = 0; rr < 3; rr++) {
      const sc = RAD[rr] * (1 + (sp - 1) * (0.55 + 0.2 * rr)) * os, R3 = rings[rr];
      qR.setFromEuler(eul.set(BASEE[rr][0] + spinAcc * (0.5 + 0.3 * rr), BASEE[rr][1] + spinAcc * (0.35 + 0.25 * rr), BASEE[rr][2], 'XYZ'));
      qT.multiplyQuaternions(qG, qR);
      R3.m.position.set(ox, oy, oz); R3.m.quaternion.copy(qT); R3.m.scale.setScalar(Math.max(1e-4, sc));
      ph[rr] += dt * (1.2 + 0.8 * rr) * (0.6 + s * 3);
      R3.u.uHead.value = ((ph[rr] % TAU) + TAU) % TAU; R3.u.uAlpha.value = ra * (1 + flash * 0.6);
      v3.set(Math.cos(ph[rr]) * sc, Math.sin(ph[rr]) * sc, 0).applyQuaternion(qT); R3.e.position.set(ox + v3.x, oy + v3.y, oz + v3.z);
      const es = Math.max(0.05, 0.42 * sc);
      R3.e.scale.setScalar(es); R3.e.material.opacity = Math.min(1, 0.4 + 0.5 * gl) * fogAt(depthOf(R3.e.position)) * dim;
    }
    const cf = fogAt(depthOf(core.position));
    qR.setFromEuler(eul.set(crx, cry, 0, 'XYZ')); core.quaternion.multiplyQuaternions(qG, qR);
    core.scale.setScalar(Math.max(1e-4, os));
    crystalMat.opacity = (0.45 + 0.3 * Math.min(1, g)) * Math.min(1, os * 3) * cf;
    edgeU.uEdge.value.setHex(0x22e6ff).multiplyScalar((1.6 + 2.2 * Math.min(1, g)) * Math.min(1, os * 3) * dim * cf * (1 + flash));
    crystalMat.emissiveIntensity = 0.6 * dim;
    const behindText = Math.min(1, Math.max(0.35, 1.6 - os * 0.5));   // big core = it sits behind a headline: calm it
    shellU.uOp.value = (0.1 + 0.14 * gl) * dim * cf * behindText;
    const inr = 0.34 * os * 3.2 * (1 + 0.08 * Math.sin(t * 2.2)), hal = 4.6 * os;
    coreHot.position.copy(core.position); coreHot.scale.setScalar(Math.max(1e-4, inr)); coreHot.material.opacity = Math.min(1, 0.5 + 0.4 * gk) * cf * Math.max(dim, 0.35) * (0.4 + 0.6 * behindText);
    coreHalo.position.copy(core.position); coreHalo.scale.setScalar(Math.max(1e-4, hal)); coreHalo.material.opacity = Math.min(1, 0.08 + 0.24 * gk) * cf * dim;
    flare.position.copy(core.position); flare.scale.set(Math.max(1e-4, 7.5 * os), Math.max(1e-4, 0.16 * os), 1);
    flare.material.opacity = Math.min(1, 0.15 * gk) * cf * dim * (reduced ? 0.5 : 1);

    /* shockwave pulse on transitions */
    const sk = (now - shockAt) / 1250; shock.visible = sk >= 0 && sk < 1;
    if (shock.visible) {
      shock.position.copy(core.position); shock.quaternion.copy(camera.quaternion);
      shock.scale.setScalar((0.6 + sk * 9) * Math.max(0.35, os) * shockK); shock.material.opacity = (1 - sk) * (1 - sk) * 0.9 * cf * Math.max(dim, 0.4);
    }

    /* relics */
    const relVis = relAmt > 0.01;
    relics.root.visible = relVis; orbit.visible = relVis;
    if (relVis) {
      relics.emissive.forEach(([m, b]) => { m.emissiveIntensity = b * dim; });
      orbit.position.copy(core.position); orbit.scale.setScalar(relR); orbit.rotation.set(0, 0, Math.sin(t * 0.1) * 0.05);
      orbit.material.opacity = 0.22 * relAmt * dim;
      const n = relics.list.length;
      relics.list.forEach((r, i) => {
        let a = (relAmt * 1.5 - i * 0.08) / 1; a = Math.max(0, Math.min(1, a)); a = a * a * (3 - 2 * a);
        r.pivot.visible = a > 0.01;
        if (!r.pivot.visible) return;
        const ang = t * 0.12 + i * TAU / n;
        v3.set(Math.cos(ang), OY * Math.sin(ang), OZ * Math.sin(ang)).multiplyScalar(relR).applyAxisAngle(ZAXIS, orbit.rotation.z);
        r.pivot.position.set(ox + v3.x, oy + v3.y + Math.sin(t * 0.8 + r.phase) * 0.12, oz + v3.z);
        r.pivot.scale.setScalar(a * (0.9 + 0.12 * Math.min(1, relR / 6)) * (1 + (1 - a) * 0.4));
        r.g.rotation.y = t * r.spin + r.phase; r.g.rotation.z = Math.sin(t * 0.4 + r.phase) * 0.15;
        r.update(t);
      });
      relics.additive.forEach(([m, b]) => { if (m.uniforms && m.uniforms.uOp) m.uniforms.uOp.value = b * dim; else m.opacity = b * dim; });
    }

    /* lens: chromatic aberration grows with camera speed and transition flashes */
    const ca = reduced ? 0.0003 : 0.00035 + Math.min(0.0028, camSpeed * 0.00022) + flash * 0.0016;
    chroma.offset.set(ca, ca * 0.6);
    bloom.intensity = 1.35 * (1 + flash * 0.45);

    composer.render(dt);
    cpuMs += (performance.now() - t0 - cpuMs) * 0.05;

    partU.uPrevVP.value.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    first = false;
  }

  function pulse(kind) {
    if (reduced) return;
    const k = kind === 'finale' ? 1 : kind === 'build' ? 0.55 : kind === 'intro' ? 0.8 : 0.5;
    const n = performance.now(); flashK = Math.max(flash, k); flashAt = n; shockAt = n; shockK = kind === 'finale' ? 1.6 : 1;
  }

  /* compile every shader up front (while the black intro hides the screen) to avoid first-use hitches */
  function warmup(S) {
    voxelGroup.visible = true; relics.root.visible = true; orbit.visible = true; shock.visible = true;
    relics.list.forEach((r) => { r.pivot.visible = true; });
    updateVoxels(1); camera.position.set(0, 0, 12); camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
    renderer.compile(scene, camera);
    composer.render(0.016);
    lastV = -1; first = true; last = performance.now();
    step(performance.now(), S);
  }

  const onLost = (e) => { e.preventDefault(); };
  canvas.addEventListener('webglcontextlost', onLost, false);

  applySize();
  return {
    isGL: true, tier,
    resize: applySize, step, pulse, warmup,
    stats: () => ({ fps: Math.round(perf.fps), dpr: Math.round(dpr * 100) / 100, tier, msaa: composer.multisampling, cpuMs: Math.round(cpuMs * 100) / 100 }),
  };
}
