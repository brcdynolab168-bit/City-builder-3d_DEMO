import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { createAgents } from './agents.js';

// ---------------------------------------------------------------
// ค่าตั้งต้น / เครื่องมือ
// ---------------------------------------------------------------
const N = 48; // ขนาดแผนที่ N x N ช่อง
const SAVE_KEY = 'mini-city-3d-save-v1';
const START_MONEY = 20000;
const DAY_LENGTH_SEC = 180; // เวลาจริงที่ใช้ต่อ 1 วัน (กลางวัน→กลางคืน)

const TOOLS = {
  select:   { label: '👆 ดูเมือง',     cost: 0 },
  road:     { label: '🛣️ ถนน',         cost: 10 },
  res:      { label: '🏠 ที่อยู่อาศัย', cost: 20 },
  com:      { label: '🏬 พาณิชย์',      cost: 30 },
  ind:      { label: '🏭 อุตสาหกรรม',   cost: 30 },
  power:    { label: '⚡ โรงไฟฟ้า',     cost: 500 },
  park:     { label: '🌳 สวน',          cost: 50 },
  bulldoze: { label: '🚜 รื้อ',          cost: 5 },
};
const TOOL_KEYS = Object.keys(TOOLS);
const ZONES = ['res', 'com', 'ind'];

// ---------------------------------------------------------------
// สถานะเกม
// ---------------------------------------------------------------
let state = newState();
let currentTool = 'road';
let speed = 1;

function newState() {
  return { money: START_MONEY, day: 0, tiles: new Array(N * N).fill(null) };
}
const idx = (x, z) => z * N + x;
const inBounds = (x, z) => x >= 0 && z >= 0 && x < N && z < N;
const tileAt = (x, z) => (inBounds(x, z) ? state.tiles[idx(x, z)] : null);
const isType = (x, z, t) => tileAt(x, z)?.t === t;

function save() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); } catch {}
}
function load() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return;
    const s = JSON.parse(raw);
    if (s && Array.isArray(s.tiles) && s.tiles.length === N * N) state = s;
  } catch {}
}

// ---------------------------------------------------------------
// Three.js: ฉาก กล้อง แสง
// ---------------------------------------------------------------
const app = document.getElementById('app');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8fc4ee);
scene.fog = new THREE.Fog(0x8fc4ee, 70, 170);

// แสงสะท้อนรอบด้าน ทำให้กระจกและวัสดุมีมิติ
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.5;

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 400);
camera.position.set(N * 0.55, N * 0.5, N * 0.55);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.12;
controls.maxPolarAngle = Math.PI / 2.15;
controls.minDistance = 5;
controls.maxDistance = 90;
// ซ้าย = สร้างของ, ขวา = หมุน, ล้อกลาง = ซูม
controls.mouseButtons = { LEFT: null, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
controls.listenToKeyEvents(window); // ลูกศร = เลื่อนกล้อง
controls.keyPanSpeed = 20;
// หน้าจอสัมผัส: สองนิ้วเลื่อน/ซูม, นิ้วเดียวแตะเพื่อสร้าง
controls.touches = { ONE: null, TWO: THREE.TOUCH.DOLLY_PAN };

const hemi = new THREE.HemisphereLight(0xcfe6ff, 0x6b7a5a, 0.8);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff1d6, 2.2);
sun.position.set(22, 38, 14);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
const sc = sun.shadow.camera;
sc.left = -N * 0.8; sc.right = N * 0.8; sc.top = N * 0.8; sc.bottom = -N * 0.8;
sc.near = 1; sc.far = 140;
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.02;
scene.add(sun);

// ---------------------------------------------------------------
// ตั้งค่ากราฟิก 3 ระดับ / โหมดควบคุม
// ---------------------------------------------------------------
const SETTINGS_KEY = 'mini-city-3d-settings-v1';
const QUALITY = {
  low: {
    label: 'ต่ำ', desc: 'เบาที่สุด: ไม่มีเงา รถไม่กี่คัน เหมาะกับเครื่องช้า',
    pixelRatio: 1, shadows: false, shadowSize: 0, bloom: false, cars: 8, people: 0, pets: 0, details: 0,
  },
  med: {
    label: 'กลาง', desc: 'สมดุล: เงานุ่ม ไฟถนน รถ ผู้คน และสัตว์เลี้ยงพอเหมาะ',
    pixelRatio: 1.5, shadows: true, shadowSize: 2048, bloom: false, cars: 35, people: 30, pets: 8, details: 1,
  },
  high: {
    label: 'สูง', desc: 'สมจริงสุด: เงาละเอียด แสงเรืองตอนกลางคืน ไฟถนนเยอะ รถ ผู้คน หมา แมว จำนวนมาก',
    pixelRatio: 2, shadows: true, shadowSize: 4096, bloom: true, cars: 80, people: 80, pets: 24, details: 2,
  },
};
const settings = { quality: 'med', mode: 'trackpad' };
try { Object.assign(settings, JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}')); } catch {}
if (!QUALITY[settings.quality]) settings.quality = 'med';
if (settings.mode !== 'trackpad' && settings.mode !== 'mouse') settings.mode = 'trackpad';
const saveSettings = () => { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch {} };
let qualityKey = settings.quality;
let lastDetails = -1;
let useBloom = false;
let nightLevel = 0;

// หลังประมวลผลภาพ (แสงเรือง) ใช้เฉพาะระดับสูง ถ้าสร้างไม่ได้จะข้ามไปเอง
let composer = null;
let bloomPass = null;
try {
  const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
  composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.4, 0.6, 0.9);
  composer.addPass(bloomPass);
  composer.addPass(new OutputPass());
} catch (err) {
  console.warn('เปิดแสงเรืองไม่ได้ ข้ามไป:', err);
  composer = null;
}

// รถ ผู้คน หมา แมว
const agents = createAgents({ scene, N, tileType: (x, z) => tileAt(x, z)?.t ?? null });

// ---------------------------------------------------------------
// เท็กซ์เจอร์ที่สร้างจากโค้ด (canvas)
// ---------------------------------------------------------------
function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvasTex(w, h, draw, srgb = true) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

function noiseTex(base, specks, size = 256, repeat = 1) {
  const rnd = mulberry32(base.length * 977 + size);
  const t = canvasTex(size, size, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    for (let i = 0; i < w * h * 0.06; i++) {
      g.fillStyle = specks[Math.floor(rnd() * specks.length)];
      const s = 1 + rnd() * 3;
      g.fillRect(rnd() * w, rnd() * h, s, s);
    }
  });
  t.repeat.set(repeat, repeat);
  return t;
}

const grassTex = noiseTex('#6f9f58', ['rgba(40,90,30,.25)', 'rgba(150,190,90,.22)', 'rgba(90,130,60,.25)', 'rgba(60,100,40,.2)'], 256, N / 5);
const asphaltTex = noiseTex('#3b3f45', ['rgba(255,255,255,.07)', 'rgba(0,0,0,.12)', 'rgba(120,120,120,.1)'], 128, 1);
const gravelTex = noiseTex('#5e6064', ['rgba(255,255,255,.08)', 'rgba(0,0,0,.14)'], 128, 1);

// ---------------------------------------------------------------
// วัสดุ
// ---------------------------------------------------------------
const std = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85, metalness: 0, ...o });
const zoneMat = c => new THREE.MeshStandardMaterial({ color: c, roughness: 1, transparent: true, opacity: 0.5 });

const M = {
  walk: std(0xb9b6ae, { roughness: 0.95 }),
  road: new THREE.MeshStandardMaterial({ map: asphaltTex, roughness: 0.95 }),
  line: std(0xeadd8c, { roughness: 0.6 }),
  zone: { res: zoneMat(0x4caf50), com: zoneMat(0x2196f3), ind: zoneMat(0xffc107) },
  roofFlat: new THREE.MeshStandardMaterial({ map: gravelTex, roughness: 0.95 }),
  roofTile: std(0x9c4a3a, { roughness: 0.8 }),
  brick: std(0x8c4a3a),
  door: std(0x3a2b22),
  metal: std(0x8f969c, { metalness: 0.6, roughness: 0.4 }),
  concrete: std(0xd7d5cf),
  lampGlow: std(0xfff2c0, { emissive: 0xffe2a0, emissiveIntensity: 0 }),
  stack: std(0xc0392b),
  park: std(0x6aa84f, { roughness: 1 }),
  path: std(0xcdbf9a),
  water: std(0x3b87a8, { roughness: 0.1, metalness: 0.2 }),
  soil: std(0x6b5a45, { roughness: 1 }),
  trunk: std(0x6b4a2b),
  leaf: [0x2e7d32, 0x3b8f3f, 0x4f9d44, 0x5c8f2e].map(c => std(c, { flatShading: true, roughness: 1 })),
  awning: [0xc0392b, 0x2e86c1, 0x1e8449, 0xd68910].map(c => std(c)),
};

// พื้นดิน เกาะ และน้ำรอบเมือง
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(N, N),
  new THREE.MeshStandardMaterial({ map: grassTex, roughness: 1 })
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const island = new THREE.Mesh(new THREE.BoxGeometry(N + 0.5, 0.7, N + 0.5), M.soil);
island.position.y = -0.36;
island.receiveShadow = true;
scene.add(island);

const sea = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), M.water);
sea.rotation.x = -Math.PI / 2;
sea.position.y = -0.5;
sea.receiveShadow = true;
scene.add(sea);

const grid = new THREE.GridHelper(N, N, 0x000000, 0x000000);
grid.material.opacity = 0.07;
grid.material.transparent = true;
grid.position.y = 0.012;
scene.add(grid);

// ---------------------------------------------------------------
// กลางวัน / กลางคืน
// ---------------------------------------------------------------
const C_DAY = new THREE.Color(0x8fc4ee);
const C_NIGHT = new THREE.Color(0x0a1124);
const C_WARM = new THREE.Color(0xff9a5c);
const tmpColor = new THREE.Color();
const facadeMats = []; // วัสดุหน้าต่างอาคาร (ไฟติดตอนกลางคืน)
let tod = 0.36; // เวลาในวัน 0..1 (0.5 = เที่ยง)

function updateSky(dt) {
  tod = (tod + dt / DAY_LENGTH_SEC) % 1;
  const ang = (tod - 0.25) * Math.PI * 2;
  const elev = Math.sin(ang);
  sun.position.set(Math.cos(ang) * 40, Math.max(elev, 0.08) * 40 + 2, 16);
  const day = THREE.MathUtils.smoothstep(elev, -0.12, 0.28);
  sun.intensity = 2.3 * day;
  hemi.intensity = 0.18 + 0.65 * day;
  scene.environmentIntensity = 0.12 + 0.45 * day;
  renderer.toneMappingExposure = 0.85 + 0.25 * day;

  tmpColor.copy(C_NIGHT).lerp(C_DAY, day);
  const warm = THREE.MathUtils.clamp(1 - Math.abs(elev) / 0.3, 0, 1) * 0.55;
  tmpColor.lerp(C_WARM, warm);
  scene.background.copy(tmpColor);
  scene.fog.color.copy(tmpColor);
  sun.color.setHex(0xfff1d6).lerp(C_WARM, warm * 0.8);

  const night = 1 - day;
  for (const m of facadeMats) m.emissiveIntensity = night * 1.3;
  M.lampGlow.emissiveIntensity = night * 3;
  nightLevel = night;
  return night;
}

// ---------------------------------------------------------------
// หน้าต่างอาคาร: สร้างเท็กซ์เจอร์ผนัง + ไฟกลางคืนจากโค้ด
// ---------------------------------------------------------------
const FLOOR = 0.16; // ความสูงต่อชั้น
const BAY = 0.16;   // ความกว้างต่อช่องหน้าต่าง
const TEXN = 4;     // 1 เท็กซ์เจอร์ = 4x4 ช่องหน้าต่าง

function makeFacadeMat(o) {
  const S = 256, n = TEXN, cell = S / n;
  const rnd = mulberry32(o.seed);
  const lit = Array.from({ length: n * n }, () => rnd() < o.lit);
  const mx = o.mx * cell, my = o.my * cell;

  const map = canvasTex(S, S, g => {
    g.fillStyle = o.wall; g.fillRect(0, 0, S, S);
    if (o.stripes) {
      g.fillStyle = 'rgba(0,0,0,0.11)';
      for (let y = 0; y < S; y += 8) g.fillRect(0, y, S, 2);
    }
    for (let i = 0; i < 1800; i++) {
      g.fillStyle = rnd() < 0.5 ? 'rgba(0,0,0,.05)' : 'rgba(255,255,255,.05)';
      g.fillRect(rnd() * S, rnd() * S, 2, 2);
    }
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        const x = c * cell + mx, y = r * cell + my, w = cell - 2 * mx, h = cell - 2 * my;
        g.fillStyle = o.frame; g.fillRect(x - 2, y - 2, w + 4, h + 4);
        const grd = g.createLinearGradient(0, y, 0, y + h);
        grd.addColorStop(0, o.glassTop); grd.addColorStop(1, o.glassBot);
        g.fillStyle = grd; g.fillRect(x, y, w, h);
        if (o.mullion) { g.fillStyle = o.frame; g.fillRect(x + w / 2 - 1, y, 2, h); }
        if (o.sill) { g.fillStyle = 'rgba(255,255,255,.28)'; g.fillRect(x - 3, y + h + 2, w + 6, 3); }
      }
    }
  });

  const emi = canvasTex(S, S, g => {
    g.fillStyle = '#000'; g.fillRect(0, 0, S, S);
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (!lit[r * n + c]) continue;
        const x = c * cell + mx, y = r * cell + my, w = cell - 2 * mx, h = cell - 2 * my;
        g.fillStyle = rnd() < 0.7 ? '#ffd08a' : '#ffe9c2';
        g.fillRect(x, y, w, h);
      }
    }
  });

  const mat = new THREE.MeshStandardMaterial({
    map, emissiveMap: emi, emissive: 0xffffff, emissiveIntensity: 0,
    roughness: o.rough, metalness: o.metal,
  });
  facadeMats.push(mat);
  return [mat, mat, M.roofFlat, M.roofFlat, mat, mat]; // +x, -x, บน, ล่าง, +z, -z
}

const FM = {
  glass: [
    { seed: 11, wall: '#2f4b63', frame: '#1b2a37', glassTop: '#a5cdea', glassBot: '#5e8fb3', mx: 0.05, my: 0.07, lit: 0.35, rough: 0.2, metal: 0.65, mullion: true },
    { seed: 12, wall: '#3a5a52', frame: '#1d2e2a', glassTop: '#a8d4cb', glassBot: '#5f9488', mx: 0.05, my: 0.07, lit: 0.3, rough: 0.2, metal: 0.65, mullion: true },
    { seed: 13, wall: '#46506a', frame: '#222838', glassTop: '#b6bfe0', glassBot: '#6c789e', mx: 0.05, my: 0.07, lit: 0.4, rough: 0.2, metal: 0.65, mullion: true },
  ],
  office: [
    { seed: 21, wall: '#bdb6a8', frame: '#8a8478', glassTop: '#7c9bb3', glassBot: '#4d6a82', mx: 0.16, my: 0.2, lit: 0.3, rough: 0.7, metal: 0.1, sill: true },
    { seed: 22, wall: '#d6d0c4', frame: '#9c968a', glassTop: '#86a4ba', glassBot: '#52708a', mx: 0.18, my: 0.2, lit: 0.3, rough: 0.7, metal: 0.1, sill: true },
  ],
  res: [
    { seed: 31, wall: '#ecdfc6', frame: '#f5f0e6', glassTop: '#7d9db5', glassBot: '#4f6f87', mx: 0.22, my: 0.2, lit: 0.4, rough: 0.9, metal: 0, sill: true },
    { seed: 32, wall: '#d9a58b', frame: '#f2e8de', glassTop: '#7d9db5', glassBot: '#4f6f87', mx: 0.22, my: 0.2, lit: 0.4, rough: 0.9, metal: 0, sill: true },
    { seed: 33, wall: '#cfd6d9', frame: '#8e979c', glassTop: '#8aa8bd', glassBot: '#557188', mx: 0.2, my: 0.18, lit: 0.45, rough: 0.8, metal: 0, sill: true },
    { seed: 34, wall: '#a65a45', frame: '#e8dccb', glassTop: '#7d9db5', glassBot: '#4f6f87', mx: 0.22, my: 0.2, lit: 0.4, rough: 0.9, metal: 0, stripes: true, sill: true },
  ],
  ind: [
    { seed: 41, wall: '#9aa1a8', frame: '#4a5056', glassTop: '#6d7f8d', glassBot: '#3f4e59', mx: 0.3, my: 0.34, lit: 0.12, rough: 0.6, metal: 0.35, stripes: true },
    { seed: 42, wall: '#c9b27a', frame: '#5a5030', glassTop: '#6d7f8d', glassBot: '#3f4e59', mx: 0.3, my: 0.34, lit: 0.12, rough: 0.6, metal: 0.3, stripes: true },
  ],
};
for (const k in FM) FM[k] = FM[k].map(makeFacadeMat);

// ---------------------------------------------------------------
// เรขาคณิตสำเร็จรูป
// ---------------------------------------------------------------
const boxGeo = new THREE.BoxGeometry(1, 1, 1);
const cylGeo = new THREE.CylinderGeometry(0.5, 0.5, 1, 16);
const coolGeo = new THREE.CylinderGeometry(0.26, 0.4, 1, 24);
const icoGeo = new THREE.IcosahedronGeometry(0.5, 1);

const hash = (x, z) => {
  let h = (Math.imul(x + 1, 73856093) ^ Math.imul(z + 1, 19349663)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return (h % 1000) / 1000;
};
const pick = (arr, r) => arr[Math.floor(r * arr.length) % arr.length];

// กล่องที่ปรับ UV ให้หน้าต่างเรียงตามชั้นพอดี
const facadeGeoCache = new Map();
function facadeGeo(w, h, d) {
  const key = [w, h, d].map(v => v.toFixed(3)).join('|');
  let g = facadeGeoCache.get(key);
  if (g) return g;
  g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  const TW = TEXN * BAY, TH = TEXN * FLOOR;
  const sc = [[d / TW, h / TH], [d / TW, h / TH], [w / 0.8, d / 0.8], [w / 0.8, d / 0.8], [w / TW, h / TH], [w / TW, h / TH]];
  for (let f = 0; f < 6; f++) {
    for (let i = 0; i < 4; i++) {
      const k = f * 4 + i;
      uv.setXY(k, uv.getX(k) * sc[f][0], uv.getY(k) * sc[f][1]);
    }
  }
  uv.needsUpdate = true;
  facadeGeoCache.set(key, g);
  return g;
}

// หลังคาจั่ว (สันหลังคาอยู่ตามแกน Z)
const gableCache = new Map();
function gableGeo(span, length, rise) {
  const key = [span, length, rise].map(v => v.toFixed(3)).join('|');
  let g = gableCache.get(key);
  if (g) return g;
  const s = new THREE.Shape();
  s.moveTo(-span / 2, 0); s.lineTo(span / 2, 0); s.lineTo(0, rise); s.closePath();
  g = new THREE.ExtrudeGeometry(s, { depth: length, bevelEnabled: false });
  g.translate(0, 0, -length / 2);
  gableCache.set(key, g);
  return g;
}

function put(parent, geo, mat, px, py, pz, sx = 1, sy = 1, sz = 1, ry = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(px, py, pz);
  m.scale.set(sx, sy, sz);
  m.rotation.y = ry;
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}
// ตึกหนึ่งชั้นเรียงซ้อนกัน คืนค่าความสูงด้านบน
function block(parent, w, floors, d, mats, px, py, pz) {
  const h = floors * FLOOR;
  put(parent, facadeGeo(w, h, d), mats, px, py + h / 2, pz);
  return py + h;
}
function roofCap(parent, w, d, y) {
  put(parent, boxGeo, M.roofFlat, 0, y + 0.015, 0, w + 0.04, 0.03, d + 0.04);
  return y + 0.03;
}
function addTree(parent, px, pz, s, r) {
  put(parent, cylGeo, M.trunk, px, 0.04 + 0.11 * s, pz, 0.06 * s, 0.22 * s, 0.06 * s);
  const top = 0.04 + 0.22 * s;
  put(parent, icoGeo, pick(M.leaf, r), px, top + 0.14 * s, pz, 0.36 * s, 0.32 * s, 0.36 * s, r * 6);
  put(parent, icoGeo, pick(M.leaf, r + 0.37), px + 0.05 * s, top + 0.3 * s, pz - 0.03 * s, 0.24 * s, 0.22 * s, 0.24 * s, r * 3);
}

// ---------------------------------------------------------------
// โมเดล 3D (.glb): วางไฟล์ใน src/models/ แล้วเกมจะโหลดให้เอง
//   src/models/res/lv1/*.glb   บ้าน เลเวล 1   (lv2, lv3 เช่นเดียวกัน)
//   src/models/com/lv1/*.glb   ร้านค้า/ตึก    src/models/ind/lv1/*.glb  โรงงาน
//   src/models/power/*.glb     โรงไฟฟ้า        src/models/park/*.glb     ต้นไม้
// ถ้ามีไฟล์ จะใช้แทนอาคารที่สร้างจากโค้ด
// ---------------------------------------------------------------
const MODEL_YAW_OFFSET = 0; // ถ้าอาคารหันหลังให้ถนน ลองเปลี่ยนเป็น Math.PI (หรือ ±Math.PI / 2)
const MODEL_FOOT = { res: 0.8, com: 0.85, ind: 0.88, power: 0.9, park: 0.5 };
const modelUrls = import.meta.glob('./models/**/*.glb', { query: '?url', import: 'default', eager: true });
const MODEL_RE = /^\.\/models\/(res|com|ind|power|park)\/(?:lv([1-3])\/)?[^/]+\.glb$/i;
const MODELS = {
  res: { 1: [], 2: [], 3: [], any: [] },
  com: { 1: [], 2: [], 3: [], any: [] },
  ind: { 1: [], 2: [], 3: [], any: [] },
  power: { any: [] },
  park: { any: [] },
};

function prepareModel(root, foot) {
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const s = foot / Math.max(size.x, size.z, 1e-6);
  root.position.set(-center.x, -box.min.y, -center.z);
  const wrap = new THREE.Group();
  wrap.add(root);
  wrap.scale.setScalar(s);
  wrap.traverse(o => {
    if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; }
  });
  return wrap;
}

async function loadModels() {
  const loader = new GLTFLoader();
  const jobs = [];
  let ok = 0;
  for (const [path, url] of Object.entries(modelUrls)) {
    const m = path.match(MODEL_RE);
    if (!m) continue;
    const type = m[1].toLowerCase();
    const lv = m[2] ? +m[2] : 'any';
    jobs.push(
      loader.loadAsync(url).then(gltf => {
        MODELS[type][lv].push({ name: path, obj: prepareModel(gltf.scene, MODEL_FOOT[type]) });
        ok++;
      }).catch(err => console.warn('โหลดโมเดลไม่สำเร็จ:', path, err))
    );
  }
  await Promise.all(jobs);
  for (const type in MODELS) for (const lv in MODELS[type]) MODELS[type][lv].sort((a, b) => a.name.localeCompare(b.name));
  return ok;
}

function getModel(type, lv, r) {
  const set = MODELS[type];
  if (!set) return null;
  let list = null;
  for (let l = lv; l >= 1; l--) {
    if (set[l]?.length) { list = set[l]; break; }
  }
  if (!list) list = set.any;
  return list?.length ? list[Math.floor(r * list.length) % list.length].obj : null;
}

// หันหน้าอาคารเข้าหาถนนที่อยู่ติดกัน (หน้าอาคาร = +Z)
function facing(x, z, r) {
  if (isType(x, z + 1, 'road')) return 0;
  if (isType(x + 1, z, 'road')) return Math.PI / 2;
  if (isType(x, z - 1, 'road')) return Math.PI;
  if (isType(x - 1, z, 'road')) return -Math.PI / 2;
  return Math.floor(r * 4) * (Math.PI / 2);
}

// ---------------------------------------------------------------
// อาคารที่สร้างจากโค้ด
// ---------------------------------------------------------------
function buildZoneBuilding(bg, type, lv, r, r2) {
  const y0 = 0.03;
  if (type === 'res') {
    const mats = pick(FM.res, r);
    if (lv === 1) {
      const w = 0.56, d = 0.46;
      const top = block(bg, w, 2, d, mats, 0, y0, 0);
      put(bg, gableGeo(d + 0.08, w + 0.08, 0.2), M.roofTile, 0, top, 0, 1, 1, 1, Math.PI / 2);
      put(bg, boxGeo, M.brick, 0.16, top + 0.1, 0.04, 0.07, 0.22, 0.07);
      put(bg, boxGeo, M.door, -0.1, y0 + 0.07, d / 2 + 0.003, 0.08, 0.14, 0.01);
    } else if (lv === 2) {
      const w = 0.7, d = 0.58;
      const top = block(bg, w, 3 + (r2 < 0.5 ? 0 : 1), d, mats, 0, y0, 0);
      const t2 = roofCap(bg, w, d, top);
      put(bg, boxGeo, M.metal, 0.16, t2 + 0.04, -0.1, 0.16, 0.08, 0.12);
    } else {
      const w = 0.72, d = 0.72;
      const top = block(bg, w, 6 + Math.floor(r2 * 3), d, mats, 0, y0, 0);
      const t2 = roofCap(bg, w, d, top);
      put(bg, cylGeo, M.metal, -0.18, t2 + 0.09, -0.15, 0.16, 0.18, 0.16);
      put(bg, boxGeo, M.concrete, 0.18, t2 + 0.06, 0.15, 0.18, 0.12, 0.18);
    }
  } else if (type === 'com') {
    if (lv === 1) {
      const w = 0.7, d = 0.6;
      const top = block(bg, w, 2, d, pick(FM.office, r), 0, y0, 0);
      roofCap(bg, w, d, top);
      put(bg, boxGeo, pick(M.awning, r2), 0, y0 + FLOOR * 0.95, d / 2 + 0.07, w * 0.9, 0.025, 0.14);
    } else if (lv === 2) {
      const t1 = block(bg, 0.78, 2, 0.78, pick(FM.office, r), 0, y0, 0);
      const t2 = block(bg, 0.58, 4 + Math.floor(r2 * 3), 0.58, pick(FM.glass, r), 0, t1, 0);
      const t3 = roofCap(bg, 0.58, 0.58, t2);
      put(bg, boxGeo, M.metal, 0.1, t3 + 0.05, 0.05, 0.18, 0.1, 0.18);
    } else {
      const t1 = block(bg, 0.82, 2, 0.82, pick(FM.office, r), 0, y0, 0);
      const t2 = block(bg, 0.64, 9 + Math.floor(r2 * 7), 0.64, pick(FM.glass, r), 0, t1, 0);
      const t3 = block(bg, 0.44, 2, 0.44, pick(FM.glass, r + 0.4), 0, t2, 0);
      const t4 = roofCap(bg, 0.44, 0.44, t3);
      put(bg, cylGeo, M.metal, 0, t4 + 0.22, 0, 0.018, 0.44, 0.018);
    }
  } else {
    const mats = pick(FM.ind, r);
    if (lv === 1) {
      const top = block(bg, 0.84, 2, 0.66, mats, 0, y0, 0);
      roofCap(bg, 0.84, 0.66, top);
      put(bg, boxGeo, M.door, -0.18, y0 + 0.09, 0.333, 0.2, 0.18, 0.01);
      put(bg, boxGeo, M.door, 0.18, y0 + 0.09, 0.333, 0.2, 0.18, 0.01);
    } else if (lv === 2) {
      const top = block(bg, 0.84, 2, 0.66, mats, 0, y0, 0);
      const t2 = roofCap(bg, 0.84, 0.66, top);
      block(bg, 0.28, 3, 0.28, pick(FM.office, r), -0.28, y0, -0.2);
      put(bg, cylGeo, M.stack, 0.28, t2 + 0.3, -0.15, 0.13, 0.6, 0.13);
      put(bg, cylGeo, M.concrete, 0.12, y0 + 0.2, 0.22, 0.22, 0.4, 0.22);
    } else {
      const top = block(bg, 0.88, 3, 0.78, mats, 0, y0, 0);
      const t2 = roofCap(bg, 0.88, 0.78, top);
      block(bg, 0.3, 4, 0.3, pick(FM.office, r), -0.3, y0, 0.18);
      put(bg, cylGeo, M.stack, 0.3, t2 + 0.4, -0.2, 0.13, 0.8, 0.13);
      put(bg, cylGeo, M.stack, 0.12, t2 + 0.32, -0.28, 0.11, 0.64, 0.11);
      put(bg, cylGeo, M.stack, 0.2, t2 + 0.25, 0.0, 0.1, 0.5, 0.1);
      put(bg, cylGeo, M.concrete, 0.2, y0 + 0.2, 0.3, 0.2, 0.4, 0.2);
    }
  }
}

function buildPowerPlant(bg) {
  const y0 = 0.03;
  const top = block(bg, 0.86, 2, 0.5, FM.ind[0], 0, y0, 0.2);
  roofCap(bg, 0.86, 0.5, top);
  put(bg, coolGeo, M.concrete, -0.22, y0 + 0.45, -0.22, 0.5, 0.9, 0.5);
  put(bg, coolGeo, M.concrete, 0.22, y0 + 0.4, -0.22, 0.46, 0.8, 0.46);
  put(bg, cylGeo, M.stack, 0.36, y0 + 0.6, 0.2, 0.07, 1.2, 0.07);
}

// ---------------------------------------------------------------
// สร้าง mesh ของแต่ละช่อง
// ---------------------------------------------------------------
const tileGroup = new THREE.Group();
scene.add(tileGroup);
const meshes = new Array(N * N).fill(null);

function buildTile(x, z) {
  if (!inBounds(x, z)) return;
  const i = idx(x, z);
  if (meshes[i]) { tileGroup.remove(meshes[i]); meshes[i] = null; }
  const t = state.tiles[i];
  if (!t) return;

  const g = new THREE.Group();
  g.position.set(x - N / 2 + 0.5, 0, z - N / 2 + 0.5);
  const r = hash(x, z);
  const r2 = hash(x * 3 + 1, z * 5 + 2);
  const rot = () => facing(x, z, r);

  if (t.t === 'road') {
    // ทางเท้า + ผิวถนนแอสฟัลต์ + เส้นแบ่งเลน
    put(g, boxGeo, M.walk, 0, 0.02, 0, 0.98, 0.04, 0.98);
    put(g, boxGeo, M.road, 0, 0.05, 0, 0.74, 0.02, 0.74);
    const rd = (dx, dz) => isType(x + dx, z + dz, 'road');
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (const [dx, dz] of dirs) {
      if (!rd(dx, dz)) continue;
      if (dx !== 0) {
        put(g, boxGeo, M.road, dx * 0.435, 0.05, 0, 0.13, 0.02, 0.74);
        put(g, boxGeo, M.line, dx * 0.38, 0.0615, 0, 0.18, 0.003, 0.025);
      } else {
        put(g, boxGeo, M.road, 0, 0.05, dz * 0.435, 0.74, 0.02, 0.13);
        put(g, boxGeo, M.line, 0, 0.0615, dz * 0.38, 0.025, 0.003, 0.18);
      }
    }
    if (rd(1, 0) && rd(-1, 0) && !rd(0, 1) && !rd(0, -1)) put(g, boxGeo, M.line, 0, 0.0615, 0, 0.18, 0.003, 0.025);
    if (rd(0, 1) && rd(0, -1) && !rd(1, 0) && !rd(-1, 0)) put(g, boxGeo, M.line, 0, 0.0615, 0, 0.025, 0.003, 0.18);
    // เสาไฟถนน (ระดับกลางขึ้นไป)
    const details = QUALITY[qualityKey].details;
    if (details >= 1 && r < (details >= 2 ? 0.7 : 0.4)) {
      const sx = r2 < 0.5 ? -1 : 1, sz = r < 0.2 ? -1 : 1;
      put(g, cylGeo, M.metal, sx * 0.45, 0.17, sz * 0.45, 0.012, 0.26, 0.012);
      put(g, boxGeo, M.lampGlow, sx * 0.45, 0.31, sz * 0.45, 0.05, 0.012, 0.035);
    }
  } else if (ZONES.includes(t.t)) {
    put(g, boxGeo, M.zone[t.t], 0, 0.015, 0, 0.94, 0.03, 0.94);
    const lv = t.lv;
    if (lv > 0) {
      const mdl = getModel(t.t, lv, r);
      if (mdl) {
        const c = mdl.clone(true);
        c.position.set(0, 0.03, 0);
        c.rotation.y = rot() + MODEL_YAW_OFFSET;
        g.add(c);
      } else {
        const bg = new THREE.Group();
        bg.rotation.y = rot();
        g.add(bg);
        buildZoneBuilding(bg, t.t, lv, r, r2);
      }
    }
  } else if (t.t === 'power') {
    put(g, boxGeo, M.walk, 0, 0.015, 0, 0.96, 0.03, 0.96);
    const pm = getModel('power', 0, r);
    if (pm) {
      const c = pm.clone(true);
      c.position.set(0, 0.03, 0);
      c.rotation.y = rot() + MODEL_YAW_OFFSET;
      g.add(c);
    } else {
      const bg = new THREE.Group();
      bg.rotation.y = rot();
      g.add(bg);
      buildPowerPlant(bg);
    }
  } else if (t.t === 'park') {
    put(g, boxGeo, M.park, 0, 0.02, 0, 0.96, 0.04, 0.96);
    put(g, boxGeo, M.path, 0, 0.042, 0, 0.12, 0.006, 0.96);
    put(g, boxGeo, M.path, 0, 0.042, 0, 0.96, 0.006, 0.12);
    if (r2 > 0.65) put(g, cylGeo, M.water, 0.24, 0.043, -0.24, 0.3, 0.006, 0.3);
    if (getModel('park', 0, r)) {
      for (let k = 0; k < 2; k++) {
        const c = getModel('park', 0, hash(x * 7 + k, z * 3 + k)).clone(true);
        c.position.set(k ? 0.26 : -0.26, 0.04, k ? -0.26 : 0.26);
        c.rotation.y = hash(x + k, z * 5) * Math.PI * 2;
        g.add(c);
      }
    } else {
      addTree(g, -0.28, 0.26, 1.0 + r * 0.4, r);
      addTree(g, 0.28, 0.3, 0.8 + r2 * 0.4, r2);
      addTree(g, -0.26, -0.28, 0.9 + r * 0.3, r2 + 0.2);
      if (r2 <= 0.65) addTree(g, 0.26, -0.26, 1.0, r + 0.5);
    }
  }

  meshes[i] = g;
  tileGroup.add(g);
}

function refresh(x, z) {
  agents.invalidate();
  buildTile(x, z);
  // สร้างช่องข้างเคียงใหม่ด้วย (ถนนต่อกัน + อาคารหันหน้าเข้าหาถนน)
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) buildTile(x + dx, z + dz);
}
function rebuildAll() {
  for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) buildTile(x, z);
}

// ---------------------------------------------------------------
// การสร้าง / รื้อ
// ---------------------------------------------------------------
const toastEl = document.getElementById('toast');
let toastTimer = 0;
function toast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 1400);
}

function applyTool(x, z) {
  if (currentTool === 'select' || !inBounds(x, z)) return;
  const i = idx(x, z);
  const cur = state.tiles[i];
  const cost = TOOLS[currentTool].cost;

  if (currentTool === 'bulldoze') {
    if (!cur) return;
    if (state.money < cost) return toast('เงินไม่พอ');
    state.money -= cost;
    state.tiles[i] = null;
    refresh(x, z);
    updateHUD();
    return;
  }
  if (cur) return; // วางทับของเดิมไม่ได้ ต้องรื้อก่อน
  if (state.money < cost) return toast('เงินไม่พอ');
  state.money -= cost;
  state.tiles[i] = { t: currentTool, lv: 0 };
  refresh(x, z);
  updateHUD();
}

// ---------------------------------------------------------------
// ระบบจำลองเมือง
// ---------------------------------------------------------------
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const adjRoad = (x, z) => isType(x + 1, z, 'road') || isType(x - 1, z, 'road') || isType(x, z + 1, 'road') || isType(x, z - 1, 'road');

function computeStats() {
  const s = { pop: 0, jobsCom: 0, jobsInd: 0, powerCap: 0, powerUse: 0, roads: 0, parks: 0, plants: 0, comLv: 0, indLv: 0 };
  for (const t of state.tiles) {
    if (!t) continue;
    if (t.t === 'res') { s.pop += t.lv * 8; s.powerUse += t.lv * 2; }
    else if (t.t === 'com') { s.jobsCom += t.lv * 6; s.powerUse += t.lv * 3; s.comLv += t.lv; }
    else if (t.t === 'ind') { s.jobsInd += t.lv * 8; s.powerUse += t.lv * 4; s.indLv += t.lv; }
    else if (t.t === 'road') s.roads++;
    else if (t.t === 'park') s.parks++;
    else if (t.t === 'power') { s.plants++; s.powerCap += 60; }
  }
  s.jobs = s.jobsCom + s.jobsInd;
  s.income = s.pop * 1.2 + s.comLv * 6 + s.indLv * 8;
  s.expense = s.roads * 0.5 + s.plants * 20 + s.parks * 2;
  s.net = s.income - s.expense;
  const workD = clamp((s.pop + 12 - s.jobs) / 60, 0, 1);
  s.demand = {
    res: clamp((s.jobs + 16 - s.pop) / 60, 0, 1),
    com: workD,
    ind: workD * 0.8,
  };
  return s;
}

function tick() {
  const s = computeStats();
  const powered = s.powerCap > s.powerUse;

  // ช่องที่อยู่ใกล้สวน (รัศมี 3) โตเร็วขึ้น
  const nearPark = new Set();
  state.tiles.forEach((t, i) => {
    if (t?.t !== 'park') return;
    const px = i % N, pz = Math.floor(i / N);
    for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) {
      if (inBounds(px + dx, pz + dz)) nearPark.add(idx(px + dx, pz + dz));
    }
  });

  for (let z = 0; z < N; z++) {
    for (let x = 0; x < N; x++) {
      const i = idx(x, z);
      const t = state.tiles[i];
      if (!t || !ZONES.includes(t.t)) continue;

      if (!adjRoad(x, z)) {
        if (t.lv > 0) { t.lv = 0; buildTile(x, z); }
        continue;
      }
      if (!powered || t.lv >= 3) continue;

      let p = 0.04 + 0.22 * s.demand[t.t];
      if (t.t === 'res' && nearPark.has(i)) p += 0.05;
      if (Math.random() < p) { t.lv++; buildTile(x, z); }
    }
  }

  const s2 = computeStats();
  state.money += s2.net;
  state.day++;
  updateHUD(s2);
}

// ---------------------------------------------------------------
// HUD
// ---------------------------------------------------------------
const $ = id => document.getElementById(id);
function updateHUD(s = computeStats()) {
  $('money').textContent = '$' + Math.floor(state.money).toLocaleString();
  $('pop').textContent = s.pop.toLocaleString();
  $('jobs').textContent = s.jobs.toLocaleString();
  const pw = $('power');
  pw.textContent = `${s.powerUse}/${s.powerCap}`;
  pw.classList.toggle('bad', s.powerUse >= s.powerCap && s.powerUse > 0);
  const net = $('net');
  net.textContent = (s.net >= 0 ? '+' : '') + s.net.toFixed(1);
  net.classList.toggle('bad', s.net < 0);
  $('day').textContent = state.day;
  $('dR').style.height = s.demand.res * 100 + '%';
  $('dC').style.height = s.demand.com * 100 + '%';
  $('dI').style.height = s.demand.ind * 100 + '%';
}

// แถบเครื่องมือ
const toolbar = $('toolbar');
const toolBtns = {};
TOOL_KEYS.forEach((k, n) => {
  const b = document.createElement('button');
  b.className = 'tool';
  b.innerHTML = `${TOOLS[k].label}<small>${TOOLS[k].cost ? '$' + TOOLS[k].cost : 'ฟรี'} · ${n + 1}</small>`;
  b.onclick = () => selectTool(k);
  toolbar.appendChild(b);
  toolBtns[k] = b;
});
function selectTool(k) {
  currentTool = k;
  for (const key in toolBtns) toolBtns[key].classList.toggle('active', key === k);
  hoverMesh.visible = k !== 'select' && hoverTile !== null;
}

document.querySelectorAll('#speed button').forEach(b => {
  b.onclick = () => {
    speed = +b.dataset.s;
    document.querySelectorAll('#speed button').forEach(x => x.classList.toggle('active', x === b));
  };
});
$('reset').onclick = () => {
  if (!confirm('เริ่มเมืองใหม่? ข้อมูลเมืองเดิมจะหายทั้งหมด')) return;
  state = newState();
  for (let i = 0; i < N * N; i++) { if (meshes[i]) { tileGroup.remove(meshes[i]); meshes[i] = null; } }
  agents.clear();
  agents.invalidate();
  save();
  updateHUD();
};
window.addEventListener('keydown', e => {
  const n = parseInt(e.key, 10);
  if (n >= 1 && n <= TOOL_KEYS.length) selectTool(TOOL_KEYS[n - 1]);
  if (e.key === 'Escape') selectTool('select');
  if (e.key === ' ') { e.preventDefault(); const b = document.querySelector(`#speed button[data-s="${speed === 0 ? 1 : 0}"]`); b.click(); }
});

// ---------------------------------------------------------------
// เมาส์: ไฮไลต์ช่อง + ลากสร้าง
// ---------------------------------------------------------------
const hoverMesh = new THREE.Mesh(
  boxGeo,
  new THREE.MeshBasicMaterial({ color: 0x66ff88, transparent: true, opacity: 0.45, depthWrite: false, toneMapped: false })
);
hoverMesh.scale.set(1, 0.12, 1);
hoverMesh.visible = false;
scene.add(hoverMesh);

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const hit = new THREE.Vector3();
let hoverTile = null;
let painting = false;

function pickTile(e) {
  const rect = renderer.domElement.getBoundingClientRect();
  mouse.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
  raycaster.setFromCamera(mouse, camera);
  if (!raycaster.ray.intersectPlane(plane, hit)) return null;
  const x = Math.floor(hit.x + N / 2);
  const z = Math.floor(hit.z + N / 2);
  return inBounds(x, z) ? { x, z } : null;
}

function updateHover(e) {
  hoverTile = pickTile(e);
  if (!hoverTile || currentTool === 'select') { hoverMesh.visible = false; return; }
  const { x, z } = hoverTile;
  hoverMesh.visible = true;
  hoverMesh.position.set(x - N / 2 + 0.5, 0.08, z - N / 2 + 0.5);
  const cur = tileAt(x, z);
  const ok = currentTool === 'bulldoze' ? !!cur : !cur && state.money >= TOOLS[currentTool].cost;
  hoverMesh.material.color.set(currentTool === 'bulldoze' ? 0xff8844 : ok ? 0x66ff88 : 0xff5555);
}

const el = renderer.domElement;
el.addEventListener('contextmenu', e => e.preventDefault());
// หน้าจอสัมผัส: แตะนิ้วเดียว = สร้าง, สองนิ้ว = เลื่อน/ซูม (ไม่สร้าง)
let touchTap = null;
const touchIds = new Set();
el.addEventListener('pointerdown', e => {
  if (e.pointerType === 'touch') {
    touchIds.add(e.pointerId);
    if (touchIds.size === 1) touchTap = { x: e.clientX, y: e.clientY, t: performance.now(), ok: true };
    else if (touchTap) touchTap.ok = false;
    return;
  }
  if (e.button !== 0) return;
  painting = true;
  updateHover(e);
  if (hoverTile) applyTool(hoverTile.x, hoverTile.z);
});
el.addEventListener('pointermove', e => {
  if (e.pointerType === 'touch') {
    if (touchTap && Math.hypot(e.clientX - touchTap.x, e.clientY - touchTap.y) > 10) touchTap.ok = false;
    return;
  }
  updateHover(e);
  if (painting && hoverTile) applyTool(hoverTile.x, hoverTile.z);
});
const endPointer = e => {
  if (e.pointerType === 'touch') {
    touchIds.delete(e.pointerId);
    if (touchTap && touchTap.ok && e.type === 'pointerup' && touchIds.size === 0 && performance.now() - touchTap.t < 500) {
      const tile = pickTile(e);
      if (tile) applyTool(tile.x, tile.z);
    }
    if (touchIds.size === 0) touchTap = null;
    return;
  }
  painting = false;
};
window.addEventListener('pointerup', endPointer);
window.addEventListener('pointercancel', endPointer);
el.addEventListener('pointerleave', () => { hoverMesh.visible = false; });

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer?.setSize(window.innerWidth, window.innerHeight);
});

// ---------------------------------------------------------------
// กล้อง: ทัชแพด (สองนิ้ว) / เมาส์ / ปุ่ม / คีย์บอร์ด
// ---------------------------------------------------------------
const _off = new THREE.Vector3();
const _right = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _sph = new THREE.Spherical();

function panBy(dx, dy) {
  const k = camera.position.distanceTo(controls.target) * 0.0011;
  _right.setFromMatrixColumn(camera.matrix, 0); _right.y = 0; _right.normalize();
  camera.getWorldDirection(_fwd); _fwd.y = 0; _fwd.normalize();
  const mx = _right.x * dx * k - _fwd.x * dy * k;
  const mz = _right.z * dx * k - _fwd.z * dy * k;
  camera.position.x += mx; camera.position.z += mz;
  controls.target.x += mx; controls.target.z += mz;
}
function zoomBy(f) {
  _off.copy(camera.position).sub(controls.target);
  _off.setLength(THREE.MathUtils.clamp(_off.length() * f, controls.minDistance, controls.maxDistance));
  camera.position.copy(controls.target).add(_off);
}
function orbitBy(dTheta, dPhi = 0) {
  _off.copy(camera.position).sub(controls.target);
  _sph.setFromVector3(_off);
  _sph.theta += dTheta;
  _sph.phi = THREE.MathUtils.clamp(_sph.phi + dPhi, 0.15, controls.maxPolarAngle);
  _off.setFromSpherical(_sph);
  camera.position.copy(controls.target).add(_off);
}

// โหมดทัชแพด: สองนิ้วลาก = เลื่อนแผนที่, หนีบนิ้ว (pinch) / Ctrl+ล้อ = ซูม, Alt/Option+สองนิ้ว = หมุน
// ดักที่ window (capture) เพื่อให้ทำงานก่อน OrbitControls และไม่กระทบการซูมด้วยสองนิ้วบนหน้าจอสัมผัส
window.addEventListener('wheel', e => {
  if (e.target !== el) return;
  if (settings.mode !== 'trackpad') return; // โหมดเมาส์ให้ OrbitControls ซูมเอง
  e.preventDefault();
  e.stopPropagation();
  const k = e.deltaMode === 1 ? 16 : 1;
  const dx = e.deltaX * k, dy = e.deltaY * k;
  if (e.ctrlKey) zoomBy(Math.exp(THREE.MathUtils.clamp(dy, -40, 40) * 0.01));
  else if (e.altKey) orbitBy(-dx * 0.004, -dy * 0.004);
  else panBy(dx, dy);
}, { passive: false, capture: true });

$('camL').onclick = () => orbitBy(Math.PI / 8);
$('camR').onclick = () => orbitBy(-Math.PI / 8);
$('camIn').onclick = () => zoomBy(0.8);
$('camOut').onclick = () => zoomBy(1.25);
$('camHome').onclick = () => {
  camera.position.set(N * 0.55, N * 0.5, N * 0.55);
  controls.target.set(0, 0, 0);
};
window.addEventListener('keydown', e => {
  if (e.key === 'q' || e.key === 'Q') orbitBy(Math.PI / 16);
  if (e.key === 'e' || e.key === 'E') orbitBy(-Math.PI / 16);
  if (e.key === '+' || e.key === '=') zoomBy(0.85);
  if (e.key === '-' || e.key === '_') zoomBy(1.18);
});

// ---------------------------------------------------------------
// แผงตั้งค่า: กราฟิก / โหมดควบคุม
// ---------------------------------------------------------------
const HELP = {
  trackpad: 'ลากสองนิ้ว = เลื่อนแผนที่<br>หนีบนิ้ว (pinch) = ซูม<br>Alt/Option + ลากสองนิ้ว = หมุน<br>คลิก/ลากนิ้วเดียว = สร้าง<br>1–8 เลือกเครื่องมือ, Esc ยกเลิก, Space หยุด',
  mouse: 'ซ้าย (ลาก) = สร้าง<br>ขวา (ลาก) = หมุนกล้อง<br>ล้อเมาส์ = ซูม, ลูกศร = เลื่อน<br>1–8 เลือกเครื่องมือ, Esc ยกเลิก, Space หยุด',
};

function applyControlMode(m) {
  settings.mode = m;
  saveSettings();
  document.querySelectorAll('#mSeg button').forEach(b => b.classList.toggle('active', b.dataset.m === m));
  $('helpText').innerHTML = HELP[m];
}

function applyQuality(key) {
  const q = QUALITY[key];
  qualityKey = key;
  settings.quality = key;
  saveSettings();

  const ratio = Math.min(window.devicePixelRatio || 1, q.pixelRatio);
  renderer.setPixelRatio(ratio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  if (composer) { composer.setPixelRatio(ratio); composer.setSize(window.innerWidth, window.innerHeight); }

  sun.castShadow = q.shadows;
  if (q.shadows && sun.shadow.mapSize.x !== q.shadowSize) {
    sun.shadow.mapSize.set(q.shadowSize, q.shadowSize);
    if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
  }
  useBloom = q.bloom && !!composer;
  agents.setTargets(q);

  document.querySelectorAll('#qSeg button').forEach(b => b.classList.toggle('active', b.dataset.q === key));
  $('qDesc').textContent = q.desc;

  // รายละเอียดอาคาร/ไฟถนนเปลี่ยนตามระดับ ต้องสร้างใหม่
  if (lastDetails !== q.details) {
    lastDetails = q.details;
    rebuildAll();
  }
}

document.querySelectorAll('#qSeg button').forEach(b => { b.onclick = () => applyQuality(b.dataset.q); });
document.querySelectorAll('#mSeg button').forEach(b => { b.onclick = () => applyControlMode(b.dataset.m); });

// ---------------------------------------------------------------
// เริ่มเกม
// ---------------------------------------------------------------
load();
applyControlMode(settings.mode);
applyQuality(settings.quality); // สร้างเมืองครั้งแรกตามระดับกราฟิก
loadModels().then(n => {
  if (n > 0) { console.info(`โหลดโมเดล .glb แล้ว ${n} ไฟล์`); rebuildAll(); }
});
selectTool('road');
updateHUD();
updateSky(0);

let fpsFrames = 0;
let fpsTime = 0;
let acc = 0;
let saveAcc = 0;
let last = performance.now();
function loop(now) {
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;

  if (speed > 0) {
    acc += dt * speed;
    while (acc >= 1) { acc -= 1; tick(); }
  }
  saveAcc += dt;
  if (saveAcc > 5) { saveAcc = 0; save(); }

  const night = updateSky(dt);
  agents.update(dt, night, speed);

  // จำกัดไม่ให้กล้องเลื่อนออกนอกแผนที่มากเกินไป
  controls.target.x = clamp(controls.target.x, -N / 2, N / 2);
  controls.target.z = clamp(controls.target.z, -N / 2, N / 2);
  controls.target.y = 0;

  controls.update();
  if (useBloom) {
    bloomPass.strength = 0.15 + 0.7 * nightLevel;
    composer.render();
  } else {
    renderer.render(scene, camera);
  }

  // ตัวนับ FPS (ช่วยเลือกระดับกราฟิก)
  fpsFrames++;
  fpsTime += dt;
  if (fpsTime >= 0.5) {
    $('fps').textContent = `FPS ${Math.round(fpsFrames / fpsTime)}`;
    fpsFrames = 0; fpsTime = 0;
  }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
window.addEventListener('beforeunload', save);
