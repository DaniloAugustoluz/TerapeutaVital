/**
 * Coluna vertebral 3D procedural (Three.js).
 * - Vértebras geradas por código (sem modelos externos = carregamento leve)
 * - Câmera guiada pelo scroll (keyframes por região da dor)
 * - Interação com o mouse no desktop, sem custo extra no celular
 */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const CORAL = new THREE.Color('#E2725B');
const BLACK = new THREE.Color('#000000');
const UP = new THREE.Vector3(0, 1, 0);

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (e0, e1, x) => { const t = clamp01((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t); };
const easeOutBack = (t) => { const c1 = 1.4, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };

/* ---------- Geometrias ---------- */
function roundedLathe(radius, height, bevel, segments, waist = 0) {
  const pts = [];
  const h = height / 2;
  const steps = 6;
  pts.push(new THREE.Vector2(0.0001, -h));
  for (let i = 0; i <= steps; i++) {
    const a = -Math.PI / 2 + (i / steps) * (Math.PI / 2);
    pts.push(new THREE.Vector2(radius - bevel + Math.cos(a) * bevel, -h + bevel + Math.sin(a) * bevel));
  }
  const inner = h - bevel;
  for (let i = 1; i < 6; i++) {
    const y = -inner + (i / 6) * inner * 2;
    const k = 1 - Math.pow(y / inner, 2);
    pts.push(new THREE.Vector2(radius - waist * radius * k, y));
  }
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * (Math.PI / 2);
    pts.push(new THREE.Vector2(radius - bevel + Math.cos(a) * bevel, h - bevel + Math.sin(a) * bevel));
  }
  pts.push(new THREE.Vector2(0.0001, h));
  return new THREE.LatheGeometry(pts, segments);
}

function orientedCapsule(radius, length, dir, center, flattenX = 1, segs = 10) {
  const g = new THREE.CapsuleGeometry(radius, length, 4, segs);
  g.scale(flattenX, 1, 1);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, dir.clone().normalize()));
  g.translate(center.x, center.y, center.z);
  return g;
}

function prep(list) {
  return list.map((g) => {
    const n = g.index ? g.toNonIndexed() : g;
    for (const key of Object.keys(n.attributes)) if (key !== 'position' && key !== 'normal') n.deleteAttribute(key);
    return n;
  });
}

function buildVertebraGeometry(q) {
  const parts = [];
  const body = roundedLathe(0.5, 0.36, 0.075, q.seg, 0.07);
  body.scale(1.12, 1, 0.92);
  parts.push(body);

  // arco neural (lâmina)
  const arch = new THREE.TorusGeometry(0.27, 0.085, 10, q.seg, Math.PI);
  arch.rotateX(-Math.PI / 2);
  arch.translate(0, 0, -0.5);
  parts.push(arch);

  // pedículos
  for (const s of [-1, 1]) {
    const ped = new THREE.CylinderGeometry(0.08, 0.09, 0.2, 10);
    ped.rotateX(Math.PI / 2);
    ped.translate(s * 0.27, 0, -0.43);
    parts.push(ped);
  }

  // processo espinhoso
  const spDir = new THREE.Vector3(0, -0.55, -1).normalize();
  parts.push(orientedCapsule(0.075, 0.42, spDir, new THREE.Vector3(0, 0, -0.77).addScaledVector(spDir, 0.27), 0.62));

  // processos transversos
  for (const s of [-1, 1]) {
    const d = new THREE.Vector3(s, 0.06, -0.45).normalize();
    parts.push(orientedCapsule(0.062, 0.34, d, new THREE.Vector3(s * 0.25, 0, -0.6).addScaledVector(d, 0.25)));
  }

  // facetas articulares
  for (const s of [-1, 1]) {
    for (const y of [0.17, -0.17]) {
      const f = new THREE.SphereGeometry(0.075, 10, 8);
      f.translate(s * 0.19, y, -0.6);
      parts.push(f);
    }
  }
  return mergeGeometries(prep(parts), false);
}

function stripeTexture([r, g, b], bands = 1) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 4;
  const ctx = c.getContext('2d');
  const grd = ctx.createLinearGradient(0, 0, 256, 0);
  grd.addColorStop(0, `rgba(${r},${g},${b},0)`);
  grd.addColorStop(0.36, `rgba(${r},${g},${b},0)`);
  grd.addColorStop(0.5, `rgba(${r},${g},${b},1)`);
  grd.addColorStop(0.64, `rgba(${r},${g},${b},0)`);
  grd.addColorStop(1, `rgba(${r},${g},${b},0)`);
  ctx.fillStyle = grd; ctx.fillRect(0, 0, 256, 4);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(bands, 1);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function radialTexture(inner, outer) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, inner);
  g.addColorStop(1, outer);
  ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/* ---------- Cena ---------- */
export function createSpine(container, { labels = {}, isMobile = false, reducedMotion = false } = {}) {
  const q = isMobile ? { seg: 24, particles: 120, dpr: 1.5 } : { seg: 40, particles: 320, dpr: 1.75 };

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q.dpr));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.02;
  renderer.setClearColor(0x000000, 0);
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = envTex;
  scene.environmentIntensity = 0.85;

  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);

  scene.add(new THREE.HemisphereLight(0xfff6e8, 0xb8d4c4, 0.55));
  const key = new THREE.DirectionalLight(0xfff1dc, 1.5);
  key.position.set(5, 8, 7);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xbfe3d2, 1.6);
  rim.position.set(-6, 3, -7);
  scene.add(rim);

  /* materiais por região: 0 cervical, 1 torácica, 2 lombar, 3 sacral */
  const Mat = isMobile ? THREE.MeshStandardMaterial : THREE.MeshPhysicalMaterial;
  const boneBase = isMobile
    ? { color: '#EEE5D3', roughness: 0.42, metalness: 0 }
    : { color: '#EEE5D3', roughness: 0.4, metalness: 0, clearcoat: 0.55, clearcoatRoughness: 0.3, sheen: 0.45, sheenRoughness: 0.6, sheenColor: new THREE.Color('#ffffff') };
  const discBase = isMobile
    ? { color: '#9DC9BA', roughness: 0.3, metalness: 0 }
    : { color: '#9DC9BA', roughness: 0.28, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.15 };
  const boneMats = [0, 1, 2, 3].map(() => new Mat({ ...boneBase, emissive: BLACK.clone() }));
  const discMats = [0, 1, 2].map(() => new Mat({ ...discBase, emissive: BLACK.clone() }));

  const vertGeo = buildVertebraGeometry(q);
  const discGeo = roundedLathe(0.47, 0.13, 0.05, q.seg, -0.05);
  discGeo.scale(1.12, 1, 0.92);

  /* especificação das 24 vértebras móveis */
  const specs = [];
  for (let i = 0; i < 24; i++) {
    if (i < 7) specs.push({ region: 0, s: 0.56 + i * 0.022, dk: 0.8 });
    else if (i < 19) specs.push({ region: 1, s: 0.72 + (i - 7) * 0.024, dk: 0.9 });
    else specs.push({ region: 2, s: 1.0 + (i - 19) * 0.04, dk: 1.18 });
  }
  const BODY_H = 0.36, DISC_H = 0.13;
  let total = 0;
  const marks = [];
  specs.forEach((sp, i) => {
    marks.push({ kind: 'v', i, at: total + (BODY_H * sp.s) / 2 });
    total += BODY_H * sp.s;
    const next = specs[i + 1];
    const ds = next ? (sp.s + next.s) / 2 : sp.s;
    const dh = DISC_H * ds * sp.dk;
    marks.push({ kind: 'd', i, s: ds, region: sp.region, at: total + dh / 2 });
    total += dh;
  });
  const sacrumAt = total + 0.12;
  total = sacrumAt + 2.0;

  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0.0, 0.3),
    new THREE.Vector3(0, -0.9, 0.55),
    new THREE.Vector3(0, -2.0, 0.25),
    new THREE.Vector3(0, -3.6, -0.45),
    new THREE.Vector3(0, -5.0, -0.65),
    new THREE.Vector3(0, -6.6, -0.25),
    new THREE.Vector3(0, -7.6, 0.25),
    new THREE.Vector3(0, -8.6, 0.62),
    new THREE.Vector3(0, -9.6, 0.32),
    new THREE.Vector3(0, -10.5, -0.3),
    new THREE.Vector3(0, -11.4, -0.95),
  ], false, 'centripetal');
  const curveLen = curve.getLength();
  const uAt = (d) => clamp01(d / total);

  const rig = new THREE.Group();
  const spine = new THREE.Group();
  rig.add(spine);
  scene.add(rig);

  const pieces = [];
  const canal = [];
  const tmpQ = new THREE.Quaternion();
  let herniaDisc = null;

  marks.forEach((m) => {
    const u = uAt(m.at);
    const pos = curve.getPointAt(u);
    const tan = curve.getTangentAt(u);
    tmpQ.setFromUnitVectors(UP, tan.clone().negate());
    if (m.kind === 'v') {
      const sp = specs[m.i];
      const mesh = new THREE.Mesh(vertGeo, boneMats[sp.region]);
      mesh.position.copy(pos);
      mesh.quaternion.copy(tmpQ);
      mesh.scale.setScalar(sp.s);
      spine.add(mesh);
      pieces.push({ mesh, base: pos.clone(), s: sp.s, order: m.i * 2 });
      canal.push(pos.clone().add(new THREE.Vector3(0, 0, -0.62 * sp.s).applyQuaternion(tmpQ)));
    } else {
      const mesh = new THREE.Mesh(discGeo, discMats[m.region]);
      mesh.position.copy(pos);
      mesh.quaternion.copy(tmpQ);
      mesh.scale.setScalar(m.s);
      spine.add(mesh);
      pieces.push({ mesh, base: pos.clone(), s: m.s, order: m.i * 2 + 1 });
      if (m.i === 22) herniaDisc = mesh; // L4–L5
    }
  });

  /* sacro (5 segmentos fundidos + asas) + cóccix */
  const sacBodyGeo = roundedLathe(0.5, 0.36, 0.12, q.seg, 0);
  sacBodyGeo.scale(1.12, 1, 0.92);
  const S0 = 1.12;
  const sacSegs = [
    { wx: 1.62, hy: 1.0, wz: 1.0 }, { wx: 1.34, hy: 0.92, wz: 0.9 }, { wx: 1.08, hy: 0.84, wz: 0.8 },
    { wx: 0.84, hy: 0.74, wz: 0.7 }, { wx: 0.62, hy: 0.64, wz: 0.6 },
  ];
  const sacFrames = [];
  let sd = sacrumAt;
  sacSegs.forEach((g, k) => {
    const hh = BODY_H * g.hy * S0;
    const at = sd + hh / 2;
    sd += hh * 0.74;
    const pos = curve.getPointAt(uAt(at));
    const qq = new THREE.Quaternion().setFromUnitVectors(UP, curve.getTangentAt(uAt(at)).negate());
    const m = new THREE.Mesh(sacBodyGeo, boneMats[3]);
    m.position.copy(pos);
    m.quaternion.copy(qq);
    const sv = new THREE.Vector3(g.wx * S0, g.hy * S0, g.wz * S0);
    m.scale.copy(sv);
    spine.add(m);
    pieces.push({ mesh: m, base: pos.clone(), s: 1, sv, order: 48 + k * 0.6 });
    sacFrames.push({ pos, q: qq, g });
    // crista sacral mediana
    const crest = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), boneMats[3]);
    crest.position.copy(pos).add(new THREE.Vector3(0, 0, -0.5 * g.wz * S0).applyQuaternion(qq));
    const cs = new THREE.Vector3(0.9, 1.3, 1).multiplyScalar(g.wz);
    crest.scale.copy(cs);
    spine.add(crest);
    pieces.push({ mesh: crest, base: crest.position.clone(), s: 1, sv: cs, order: 48.5 + k * 0.6 });
  });
  // asas do sacro (S1)
  const ala = new THREE.CapsuleGeometry(0.2, 0.42, 4, 12);
  for (const sgn of [-1, 1]) {
    const f = sacFrames[0];
    const dir = new THREE.Vector3(sgn, -0.55, -0.12).normalize();
    const m = new THREE.Mesh(ala, boneMats[3]);
    m.position.copy(f.pos).add(new THREE.Vector3(sgn * 0.62, -0.12, -0.08).applyQuaternion(f.q));
    m.quaternion.copy(f.q).multiply(new THREE.Quaternion().setFromUnitVectors(UP, dir));
    const sv = new THREE.Vector3(1, 1, 0.75);
    m.scale.copy(sv);
    spine.add(m);
    pieces.push({ mesh: m, base: m.position.clone(), s: 1, sv, order: 49 });
  }
  const coccyxGeo = new THREE.SphereGeometry(0.12, 12, 10);
  for (let k = 0; k < 3; k++) {
    const c = new THREE.Mesh(coccyxGeo, boneMats[3]);
    c.position.copy(curve.getPointAt(uAt(sd + 0.08 + k * 0.13)));
    const cs = 1 - k * 0.22;
    const sv = new THREE.Vector3(cs * 1.25, cs * 0.8, cs);
    c.scale.copy(sv);
    spine.add(c);
    pieces.push({ mesh: c, base: c.position.clone(), s: 1, sv, order: 51 + k });
  }
  const sacPos = sacFrames[2].pos.clone();

  /* hérnia (L4–L5) */
  const hernia = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 12), new Mat({ ...discBase, color: '#F08B73', emissive: CORAL.clone(), emissiveIntensity: 0.6 }));
  hernia.position.set(0.12, 0, -0.42);
  hernia.scale.setScalar(0.001);
  herniaDisc && herniaDisc.add(hernia);

  /* medula (fluxo de energia) */
  const cordPts = canal.concat(sacFrames.slice(0, 3).map((f) => f.pos.clone().add(new THREE.Vector3(0, 0, -0.32 * f.g.wz).applyQuaternion(f.q))));
  const cordCurve = new THREE.CatmullRomCurve3(cordPts);
  const cordCore = new THREE.Mesh(new THREE.TubeGeometry(cordCurve, 180, 0.055, 8, false), new THREE.MeshStandardMaterial({ color: '#D7E8DD', emissive: new THREE.Color('#6FB596'), emissiveIntensity: 0.25, roughness: 0.55 }));
  spine.add(cordCore);
  const flowTex = stripeTexture([150, 236, 196], 3);
  const cordFlow = new THREE.Mesh(new THREE.TubeGeometry(cordCurve, 180, 0.085, 8, false), new THREE.MeshBasicMaterial({ map: flowTex, transparent: true, depthWrite: false, opacity: 0.85 }));
  spine.add(cordFlow);

  /* nervos ciáticos (saem de L4–S3) */
  const nerves = [];
  const painTex = stripeTexture([255, 132, 104], 2);
  const s1 = sacFrames[0], s2 = sacFrames[1];
  for (const sgn of [-1, 1]) {
    const p0 = s1.pos.clone().lerp(s2.pos, 0.5).add(new THREE.Vector3(sgn * 0.55, 0, 0.18).applyQuaternion(s1.q));
    const p1 = p0.clone().add(new THREE.Vector3(sgn * 0.32, -0.7, 0.32));
    const p2 = p1.clone().add(new THREE.Vector3(sgn * 0.18, -1.1, 0.02));
    const p3 = p2.clone().add(new THREE.Vector3(sgn * 0.1, -1.6, -0.14));
    const p4 = p3.clone().add(new THREE.Vector3(sgn * 0.05, -1.9, -0.04));
    const nc = new THREE.CatmullRomCurve3([p0, p1, p2, p3, p4]);
    const core = new THREE.Mesh(new THREE.TubeGeometry(nc, 100, 0.065, 8, false), new THREE.MeshStandardMaterial({ color: '#EADDB4', emissive: new THREE.Color('#000'), roughness: 0.45 }));
    const glow = new THREE.Mesh(new THREE.TubeGeometry(nc, 100, 0.11, 8, false), new THREE.MeshBasicMaterial({ map: painTex, transparent: true, depthWrite: false, opacity: 0 }));
    spine.add(core, glow);
    nerves.push({ core, glow });
  }

  /* auras de dor (sprites) */
  const auraTex = radialTexture('rgba(226,114,91,0.7)', 'rgba(226,114,91,0)');
  const centerOf = (a, b) => {
    const v = new THREE.Vector3();
    for (let i = a; i <= b; i++) v.add(curve.getPointAt(uAt(marks[i * 2].at)));
    return v.multiplyScalar(1 / (b - a + 1));
  };
  const regionCenters = [centerOf(0, 6), centerOf(8, 17), centerOf(19, 23), sacPos.clone().add(new THREE.Vector3(0, -0.5, 0.2))];
  const auras = regionCenters.map((c, i) => {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: auraTex, transparent: true, depthWrite: false, opacity: 0 }));
    sp.position.copy(c);
    const base = [2.4, 3.2, 2.9, 3.0][i];
    sp.scale.setScalar(base);
    sp.userData.base = base;
    spine.add(sp);
    return sp;
  });

  /* centraliza e escala a coluna (apenas ossos e discos) */
  const box = new THREE.Box3();
  pieces.forEach((p) => box.expandByObject(p.mesh));
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const SCALE = 7.4 / size.y;
  spine.scale.setScalar(SCALE);
  spine.position.set(-center.x * SCALE, -center.y * SCALE + 0.15, -center.z * SCALE);
  rig.updateMatrixWorld(true);
  const worldCenters = regionCenters.map((c) => spine.localToWorld(c.clone()));

  /* âncoras dos rótulos (ao lado direito da coluna) */
  const labelKeys = ['cervical', 'toracica', 'lombar', 'sacral'];
  const anchors = regionCenters.map((c, i) => {
    const o = new THREE.Object3D();
    o.position.copy(c).add(new THREE.Vector3([0.85, 1.05, 1.3, 1.35][i], 0, 0));
    spine.add(o);
    return o;
  });

  /* partículas */
  const pGeo = new THREE.BufferGeometry();
  const pCount = q.particles;
  const pPos = new Float32Array(pCount * 3);
  for (let i = 0; i < pCount; i++) {
    const r = 1.4 + Math.random() * 3.2, a = Math.random() * Math.PI * 2;
    pPos[i * 3] = Math.cos(a) * r;
    pPos[i * 3 + 1] = (Math.random() - 0.5) * 9;
    pPos[i * 3 + 2] = Math.sin(a) * r;
  }
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  const particles = new THREE.Points(pGeo, new THREE.PointsMaterial({
    size: isMobile ? 0.06 : 0.05, map: radialTexture('rgba(111,170,140,1)', 'rgba(111,170,140,0)'),
    transparent: true, opacity: 0.6, depthWrite: false, sizeAttenuation: true,
  }));
  rig.add(particles);

  /* keyframes de câmera (0 hero → 4 ciático) */
  const W = worldCenters;
  const desk = [
    { focus: new THREE.Vector3(0, 0, 0), dist: 15.5, azim: 0.78, elev: 0.06, sx: 0.2, sy: 0 },
    { focus: W[0], dist: 6.2, azim: 0.95, elev: 0.14, sx: 0.2, sy: 0 },
    { focus: W[1], dist: 7.8, azim: 2.55, elev: 0.1, sx: 0.2, sy: 0 },
    { focus: W[2], dist: 6.2, azim: 2.05, elev: 0.04, sx: 0.2, sy: 0 },
    { focus: W[3].clone().add(new THREE.Vector3(0, -0.9, 0)), dist: 9.2, azim: 2.55, elev: 0.16, sx: 0.2, sy: 0 },
  ];
  const mob = [
    { focus: new THREE.Vector3(0, -0.4, 0), dist: 19, azim: 0.78, elev: 0.06, sx: 0.3, sy: -0.04 },
    { focus: W[0], dist: 7.2, azim: 0.95, elev: 0.14, sx: 0, sy: 0.24 },
    { focus: W[1], dist: 9, azim: 2.55, elev: 0.1, sx: 0, sy: 0.24 },
    { focus: W[2], dist: 7.2, azim: 2.05, elev: 0.04, sx: 0, sy: 0.24 },
    { focus: W[3].clone().add(new THREE.Vector3(0, -0.9, 0)), dist: 10.5, azim: 2.55, elev: 0.16, sx: 0, sy: 0.24 },
  ];
  let frames = isMobile ? mob : desk;

  const state = { fx: 0, fy: 0, fz: 0, dist: frames[0].dist, azim: frames[0].azim, elev: frames[0].elev, sx: frames[0].sx, sy: frames[0].sy };
  const target = { ...state };
  let progress = 0;
  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  const weights = [0, 0, 0, 0, 0];

  function computeTarget() {
    const f = Math.min(4, Math.max(0, progress));
    const k = Math.min(3, Math.floor(f));
    const t = smooth(0.18, 0.82, f - k);
    const a = frames[k], b = frames[k + 1];
    target.fx = lerp(a.focus.x, b.focus.x, t);
    target.fy = lerp(a.focus.y, b.focus.y, t);
    target.fz = lerp(a.focus.z, b.focus.z, t);
    target.dist = lerp(a.dist, b.dist, t);
    target.azim = lerp(a.azim, b.azim, t);
    target.elev = lerp(a.elev, b.elev, t);
    target.sx = lerp(a.sx, b.sx, t);
    target.sy = lerp(a.sy, b.sy, t);
    for (let i = 0; i <= 4; i++) weights[i] = clamp01(1 - Math.abs(f - i) * 1.5);
  }
  computeTarget();
  Object.assign(state, target);

  /* tamanho */
  let w = 1, h = 1;
  function resize() {
    const r = container.getBoundingClientRect();
    w = Math.max(1, r.width); h = Math.max(1, r.height);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
  }
  resize();
  const ro = new ResizeObserver(resize);
  ro.observe(container);

  /* loop */
  const clock = new THREE.Clock();
  let running = false, raf = 0, elapsed = 0;
  let intro = reducedMotion ? 1 : 0;
  let introStart = 0;
  const tmp = new THREE.Vector3();

  function frame() {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(clock.getDelta(), 0.05);
    elapsed += dt;
    const damp = reducedMotion ? 1 : 1 - Math.exp(-dt * 4.2);

    // montagem inicial (vértebras "encaixando")
    if (intro < 1) {
      if (!introStart) introStart = performance.now();
      intro = Math.min(1, (performance.now() - introStart) / 2400);
      const T = intro * 2.4;
      for (const p of pieces) {
        const local = clamp01((T - p.order * 0.026) / 0.75);
        const e = easeOutBack(local);
        if (p.sv) p.mesh.scale.copy(p.sv).multiplyScalar(Math.max(0.0001, e));
        else p.mesh.scale.setScalar(Math.max(0.0001, p.s * e));
        p.mesh.position.copy(p.base).add(tmp.set(0, (1 - local) * 1.6, 0));
      }
      const cv = clamp01((T - 1.3) / 1.0);
      cordCore.geometry.setDrawRange(0, Math.floor(cordCore.geometry.index.count * cv / 3) * 3);
      cordFlow.material.opacity = 0.9 * cv;
      nerves.forEach((n) => n.core.geometry.setDrawRange(0, Math.floor(n.core.geometry.index.count * cv / 3) * 3));
    }

    // estado da câmera (suavizado)
    pointer.x += (pointer.tx - pointer.x) * (1 - Math.exp(-dt * 3));
    pointer.y += (pointer.ty - pointer.y) * (1 - Math.exp(-dt * 3));
    for (const k in target) state[k] += (target[k] - state[k]) * damp;

    const heroW = weights[0];
    const sway = reducedMotion ? 0 : Math.sin(elapsed * 0.32) * 0.28 * heroW;
    const azim = state.azim + sway + pointer.x * (0.18 + 0.32 * heroW);
    const elev = state.elev + pointer.y * 0.1;
    camera.position.set(
      state.fx + state.dist * Math.cos(elev) * Math.sin(azim),
      state.fy + state.dist * Math.sin(elev),
      state.fz + state.dist * Math.cos(elev) * Math.cos(azim),
    );
    camera.lookAt(state.fx, state.fy, state.fz);
    camera.setViewOffset(w, h, -state.sx * w, state.sy * h, w, h);

    // destaque das regiões (dor)
    const pulse = reducedMotion ? 0.75 : 0.62 + 0.38 * Math.sin(elapsed * 3.1);
    for (let r = 0; r < 4; r++) {
      const wr = weights[r + 1];
      boneMats[r].emissive.copy(CORAL);
      boneMats[r].emissiveIntensity = wr * 0.62 * pulse;
      if (discMats[r]) { discMats[r].emissive.copy(CORAL); discMats[r].emissiveIntensity = wr * 0.7 * pulse; }
      auras[r].material.opacity = wr * (0.55 + 0.45 * pulse);
      auras[r].scale.setScalar(auras[r].userData.base * (0.9 + 0.15 * pulse));
    }
    const hw = weights[3];
    hernia.scale.setScalar(Math.max(0.001, hw));
    hernia.material.emissiveIntensity = 0.4 + 0.6 * pulse;

    const nw = weights[4];
    nerves.forEach((n) => {
      n.core.material.emissive.copy(CORAL);
      n.core.material.emissiveIntensity = nw * 0.7 * pulse;
      n.glow.material.opacity = nw;
    });

    if (!reducedMotion) {
      flowTex.offset.x -= dt * 0.22;
      painTex.offset.x -= dt * 0.55;
      particles.rotation.y += dt * 0.03;
      const arr = pGeo.attributes.position.array;
      for (let i = 1; i < arr.length; i += 3) { arr[i] += dt * 0.12; if (arr[i] > 4.5) arr[i] = -4.5; }
      pGeo.attributes.position.needsUpdate = true;
    }

    // rótulos HTML
    const labelVis = clamp01(1 - progress * 2.2) * clamp01((intro - 0.75) / 0.25);
    anchors.forEach((a, i) => {
      const el = labels[labelKeys[i]];
      if (!el) return;
      a.getWorldPosition(tmp);
      tmp.project(camera);
      const x = (tmp.x * 0.5 + 0.5) * w, y = (-tmp.y * 0.5 + 0.5) * h;
      const op = Math.max(labelVis, weights[i + 1] * 0.95);
      el.style.opacity = op.toFixed(3);
      el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(0, -50%)`;
    });

    renderer.render(scene, camera);
  }

  function start() { if (!running) { running = true; clock.getDelta(); frame(); } }
  function stop() { running = false; cancelAnimationFrame(raf); }

  const io = new IntersectionObserver(([e]) => (e.isIntersecting && !document.hidden ? start() : stop()), { threshold: 0 });
  io.observe(container);
  const onVis = () => (document.hidden ? stop() : start());
  document.addEventListener('visibilitychange', onVis);

  return {
    setProgress(f) { progress = f; computeTarget(); },
    setPointer(x, y) { pointer.tx = x; pointer.ty = y; },
    setMobile(m) { frames = m ? mob : desk; computeTarget(); },
    destroy() {
      stop(); io.disconnect(); ro.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      renderer.dispose(); pmrem.dispose(); envTex.dispose();
      container.removeChild(renderer.domElement);
    },
  };
}
