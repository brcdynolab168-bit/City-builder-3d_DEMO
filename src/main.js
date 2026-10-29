import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { createAgents } from './agents.js';
import { createWeather } from './weather.js';
import { createWildlife } from './wildlife.js';
import { ICON, mountIcons } from './icons.js';
import { blob, broadleafCrown, coniferCrown, trunkGeo } from './trees.js';
import { terrainH, terrainColor, fbm, hash2, SEA_Y, WATER_LIMIT } from './terrain.js';

// ---------------------------------------------------------------
// ค่าตั้งต้น / เครื่องมือ
// ---------------------------------------------------------------
const N = 48; // ขนาดแผนที่ N x N ช่อง
const SAVE_KEY = 'mini-city-3d-save-v1';
const START_MONEY = 20000;
const DAY_LENGTH_SEC = 180; // เวลาจริงที่ใช้ต่อ 1 วัน (กลางวัน→กลางคืน)
const BRIDGE_Y = 0.5;       // ความสูงพื้นสะพาน

const TOOLS = {
  select:   { label: 'ดูเมือง',        cost: 0,   tip: 'เลื่อนดูเมือง ไม่สร้างอะไร' },
  road:     { label: 'ถนน',            cost: 10,  tip: 'ถนน (บนแม่น้ำ = สะพาน $40) ทางแยกมีไฟจราจรและทางม้าลายให้เอง' },
  res:      { label: 'ที่อยู่อาศัย',    cost: 20,  tip: 'โซนที่อยู่อาศัย ต้องติดถนน มีไฟและน้ำ' },
  com:      { label: 'พาณิชย์',         cost: 30,  tip: 'โซนร้านค้า/สำนักงาน' },
  ind:      { label: 'อุตสาหกรรม',      cost: 30,  tip: 'โซนโรงงาน' },
  power:    { label: 'โรงไฟฟ้า',        cost: 500, tip: 'ผลิตไฟ 120 หน่วย' },
  water:    { label: 'โรงประปา',        cost: 400, tip: 'ผลิตน้ำ 120 หน่วย ต้องตั้งใกล้แม่น้ำ/ทะเล (ภายใน 3 ช่อง)' },
  park:     { label: 'สวน',            cost: 50,  tip: 'สวนสาธารณะ ผู้คนมาเดินเล่น ที่อยู่อาศัยรอบๆโตเร็วขึ้น' },
  service:  { label: 'บริการ',          cost: 800, tip: 'โรงเรียน / โรงพยาบาล: จ้างงาน และทำให้บ้านรอบๆโตเร็วขึ้น' },
  bulldoze: { label: 'รื้อ',            cost: 5,   tip: 'รื้อถอน' },
};
const TOOL_KEYS = Object.keys(TOOLS);

// ตัวเลือกย่อยของแต่ละเครื่องมือ (เอาเมาส์ชี้ปุ่มบนแถบเครื่องมือเพื่อเลือก)
// pop=คนอยู่ jobs=งาน power/water=ใช้ไฟ/น้ำ cap=ผลิตได้ upkeep=ค่าดูแล/วัน
const VARIANTS = {
  res: [
    { k: 'zone',  label: 'โซนบ้าน (โตเอง)', cost: 20,   note: 'บ้านเล็กโตเป็นคอนโดเองตามความต้องการ' },
    { k: 'house', label: 'บ้านเดี่ยว',      cost: 150,  pop: 6,  power: 2,  water: 3 },
    { k: 'twin',  label: 'ทาวน์เฮาส์',      cost: 260,  pop: 15, power: 4,  water: 6 },
    { k: 'apt',   label: 'อพาร์ตเมนต์',     cost: 480,  pop: 36, power: 8,  water: 11 },
    { k: 'condo', label: 'คอนโด',           cost: 1000, pop: 90, power: 16, water: 25 },
  ],
  com: [
    { k: 'zone',  label: 'โซนพาณิชย์ (โตเอง)', cost: 30, note: 'ร้านค้า/สำนักงาน โตเองตามความต้องการ' },
    { k: 'seven', label: '7-Eleven',        cost: 160,  jobs: 6,   power: 3,  water: 2,  note: 'ร้านสะดวกซื้อ' },
    { k: 'cj',    label: 'CJ',              cost: 160,  jobs: 6,   power: 3,  water: 2,  note: 'ร้านสะดวกซื้อ' },
    { k: 'kfc',   label: 'KFC',             cost: 320,  jobs: 12,  power: 5,  water: 5,  note: 'ร้านอาหารจานด่วน' },
    { k: 'gas',   label: 'ปั๊มน้ำมัน',       cost: 450,  jobs: 9,   power: 4,  water: 3 },
    { k: 'lotus', label: 'โลตัส',           cost: 700,  jobs: 32,  power: 10, water: 8,  note: 'ซูเปอร์มาร์เก็ต' },
    { k: 'mall',  label: 'ห้างสรรพสินค้า',   cost: 1800, jobs: 100, power: 30, water: 22 },
  ],
  power: [
    { k: 'solar',   label: 'โซลาร์ฟาร์ม (เล็ก)',  cost: 220,  cap: 40,  upkeep: 6 },
    { k: 'gas',     label: 'โรงไฟฟ้าก๊าซ (กลาง)', cost: 500,  cap: 120, upkeep: 20 },
    { k: 'thermal', label: 'โรงไฟฟ้าใหญ่',        cost: 1150, cap: 300, upkeep: 45 },
  ],
  water: [
    { k: 'pump',  label: 'สถานีสูบน้ำ (เล็ก)',  cost: 200, cap: 50,  upkeep: 7 },
    { k: 'plant', label: 'โรงประปา (กลาง)',     cost: 400, cap: 120, upkeep: 15 },
    { k: 'big',   label: 'โรงประปาใหญ่',         cost: 850, cap: 270, upkeep: 32 },
  ],
  service: [
    { k: 'school',   label: 'โรงเรียน',      cost: 800,  jobs: 26, power: 6,  water: 6,  upkeep: 12, note: 'บ้านรอบๆโตเร็วขึ้น' },
    { k: 'hospital', label: 'โรงพยาบาล',     cost: 1500, jobs: 60, power: 18, water: 15, upkeep: 26, note: 'บ้านรอบๆโตเร็วขึ้น' },
  ],
};
const DEFAULT_V = { res: 'zone', com: 'zone', ind: 'zone', power: 'gas', water: 'plant', service: 'school' };
const currentVar = { ...DEFAULT_V };
const variantOf = t => VARIANTS[t.t]?.find(v => v.k === (t.v || DEFAULT_V[t.t]));
const fixedVariant = t => { const v = variantOf(t); return v && v.k !== 'zone' ? v : null; };
const toolCost = tool => VARIANTS[tool]?.find(v => v.k === currentVar[tool])?.cost ?? TOOLS[tool].cost;
const ZONES = ['res', 'com', 'ind'];

// ตารางตามระดับตึก (ดัชนี = เลเวล 0..3): คน / งาน / ไฟ / น้ำ ต่อช่อง
const POP_PER  = [0, 5, 28, 80];   // บ้านเดี่ยว → อพาร์ตเมนต์ → คอนโดสูง
const JOBS_COM = [0, 6, 20, 60];
const JOBS_IND = [0, 10, 28, 70];
const POWER_USE = { res: [0, 2, 6, 14], com: [0, 3, 8, 20], ind: [0, 4, 12, 30] };
const WATER_USE = { res: [0, 3, 9, 22], com: [0, 2, 6, 15], ind: [0, 4, 12, 28] };
const POWER_CAP = 120;
const WATER_CAP = 120;

// ถนนในเมืองตั้งชื่อตามแนวแถว/คอลัมน์ (ใช้บนป้ายชื่อถนน)
const STREET_NAMES = ['สุขุมวิท', 'พหลโยธิน', 'ราชดำเนิน', 'สีลม', 'สาทร', 'เพชรบุรี', 'รัชดาภิเษก', 'ลาดพร้าว',
  'พระราม 4', 'วิภาวดี', 'เจริญกรุง', 'พญาไท', 'อโศก', 'ศรีนครินทร์', 'บางนา', 'ทองหล่อ', 'นราธิวาส', 'ประชาชื่น'];
const rowName = z => STREET_NAMES[((z % STREET_NAMES.length) + STREET_NAMES.length) % STREET_NAMES.length];
const colName = x => STREET_NAMES[(((x * 5 + 3) % STREET_NAMES.length) + STREET_NAMES.length) % STREET_NAMES.length];

// ---------------------------------------------------------------
// ภูมิประเทศ: ความสูงที่มุมแต่ละช่อง (เหมือนกับ mesh พื้นดิน)
// ---------------------------------------------------------------
const GN = N + 1;
const vertH = new Float32Array(GN * GN);
for (let vz = 0; vz < GN; vz++) for (let vx = 0; vx < GN; vx++) vertH[vz * GN + vx] = terrainH(vx - N / 2, vz - N / 2);
const tileMaxH = new Float32Array(N * N);
const tileMinH = new Float32Array(N * N);
const tileIsWater = new Uint8Array(N * N);
for (let z = 0; z < N; z++) {
  for (let x = 0; x < N; x++) {
    const a = vertH[z * GN + x], b = vertH[z * GN + x + 1], c = vertH[(z + 1) * GN + x], d = vertH[(z + 1) * GN + x + 1];
    tileMaxH[z * N + x] = Math.max(a, b, c, d);
    tileMinH[z * N + x] = Math.min(a, b, c, d);
    tileIsWater[z * N + x] = (a + b + c + d) / 4 < WATER_LIMIT ? 1 : 0;
  }
}
const isWaterTile = (x, z) => x >= 0 && z >= 0 && x < N && z < N && tileIsWater[z * N + x] === 1;
// ความสูงพื้นสะพานคงที่ตลอดแนวแม่น้ำ และช่องริมฝั่ง (ติดน้ำ) ยกให้ไม่ต่ำกว่าระดับสะพาน
// เพื่อให้ถนนเชื่อมกับสะพานเรียบ ไม่เป็นขั้นบันได
const nearWater1 = new Uint8Array(N * N);
for (let z = 0; z < N; z++) {
  for (let x = 0; x < N; x++) {
    if (tileIsWater[z * N + x]) continue;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (isWaterTile(x + dx, z + dz)) nearWater1[z * N + x] = 1;
  }
}
// ความสูงพื้นของช่อง (ใช้วางอาคาร ถนน และตัวละคร)
function tileY(x, z) {
  if (x < 0 || z < 0 || x >= N || z >= N) return 0;
  const i = z * N + x;
  if (tileIsWater[i]) return BRIDGE_Y;
  return nearWater1[i] ? Math.max(tileMaxH[i], BRIDGE_Y) : tileMaxH[i];
}
function nearWater(x, z, r) {
  for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) if (isWaterTile(x + dx, z + dz)) return true;
  return false;
}

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
    if (!raw) { seedStarterCity(); return; }
    const s = JSON.parse(raw);
    if (s && Array.isArray(s.tiles) && s.tiles.length === N * N) {
      // เมืองที่เซฟจากรุ่นก่อน (พื้นราบ): อะไรที่ตกอยู่บนแม่น้ำใหม่ ให้ลบทิ้ง ยกเว้นถนน (กลายเป็นสะพาน)
      s.tiles.forEach((t, i) => { if (t && tileIsWater[i] && t.t !== 'road') s.tiles[i] = null; });
      state = s;
    }
  } catch {}
}

// เมืองตั้งต้น: ถนนตาราง ไฟจราจรตามทางแยก บ้าน ร้านค้า โรงงาน โรงไฟฟ้า โรงประปา สวน
// ให้เปิดเกมมาแล้วมีรถ คน สัตว์ เดินจริง ไม่ใช่แผนที่ว่าง
function seedStarterCity() {
  state = newState();
  const C = N / 2;                                   // พิกัดโลก 0 = ช่อง C
  const T = (wx, wz) => ({ x: wx + C, z: wz + C });
  const flat = (x, z) => inBounds(x, z) && !tileIsWater[idx(x, z)] && tileMaxH[idx(x, z)] - tileMinH[idx(x, z)] < 0.45;
  const put = (x, z, t, lv = 0) => { if (inBounds(x, z) && !state.tiles[idx(x, z)]) state.tiles[idx(x, z)] = { t, lv }; };

  const cols = [-8, -2, 4, 10], rows = [-3, 3, 9];
  const X0 = -8, X1 = 14, Z0 = -3, Z1 = 9;
  for (const wz of rows) for (let wx = X0; wx <= X1; wx++) { const p = T(wx, wz); if (flat(p.x, p.z)) put(p.x, p.z, 'road'); }
  for (const wx of cols) for (let wz = Z0; wz <= Z1; wz++) { const p = T(wx, wz); if (flat(p.x, p.z)) put(p.x, p.z, 'road'); }

  // โซนตามบล็อก: ใจกลางเป็นร้านค้า ตะวันออกเป็นโรงงาน ที่เหลือบ้าน
  for (let wz = Z0; wz <= Z1; wz++) {
    for (let wx = X0; wx <= 10; wx++) {
      const p = T(wx, wz);
      if (!flat(p.x, p.z) || state.tiles[idx(p.x, p.z)] || !adjRoad(p.x, p.z)) continue;
      const bx = wx < -2 ? 0 : wx < 4 ? 1 : 2, bz = wz < 3 ? 0 : 1;
      const h = hash(wx * 7 + 3, wz * 13 + 1);
      let t = 'res', lv = h < 0.35 ? 2 : 1;
      if (bx === 1 && bz === 0) { t = h < 0.5 ? 'com' : 'res'; lv = 1; }
      else if (bx === 1 && bz === 1) { t = h < 0.35 ? 'com' : 'res'; lv = 1; }
      else if (bx === 2 && bz === 1) { t = 'ind'; lv = 1; }
      if (t === 'res' && h > 0.9) { t = 'park'; lv = 0; }
      put(p.x, p.z, t, lv);
    }
  }

  // โรงไฟฟ้า/โรงประปา: หาช่องว่างติดถนนที่เหมาะ (ประปาต้องอยู่ใกล้น้ำ)
  const place = (type, ok, near, v) => {
    let best = null, bd = 1e9;
    for (let z = C - 14; z <= C + 16; z++) for (let x = C - 12; x <= C + 20; x++) {
      if (!flat(x, z) || state.tiles[idx(x, z)] || !adjRoad(x, z) || !ok(x, z)) continue;
      const d = Math.hypot(x - near.x, z - near.z);
      if (d < bd) { bd = d; best = { x, z }; }
    }
    if (best) { put(best.x, best.z, type); state.tiles[idx(best.x, best.z)].v = v; }
    return !!best;
  };
  const wp = T(-3, -6), pp = T(14, 4);
  place('water', (x, z) => nearWater(x, z, 3), wp, 'plant');
  place('water', (x, z) => nearWater(x, z, 3), T(5, -6), 'plant');
  place('power', () => true, pp, 'gas');
  place('power', () => true, T(14, 8), 'gas');
  // สวนตรงกลาง
  const pk = T(1, 6); if (flat(pk.x, pk.z)) { state.tiles[idx(pk.x, pk.z)] = null; put(pk.x, pk.z, 'park'); }
}

// ---------------------------------------------------------------
// Three.js: ฉาก กล้อง แสง
// ---------------------------------------------------------------
const app = document.getElementById('app');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
let gpuName = '';
try {
  const gl = renderer.getContext();
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  gpuName = (ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : '').replace(/ANGLE \((.*)\)/, '$1').replace(/Direct3D.*|\(0x.*$/g, '').trim();
} catch {}
renderer.toneMapping = THREE.NeutralToneMapping; // คงสีสดไม่ซีดเหมือน ACES
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
    // cars/people/pets = เพดานจำนวนสูงสุดของระดับนี้ (จำนวนจริงขึ้นกับประชากรเมือง)
    pixelRatio: 1, shadows: false, shadowSize: 0, bloom: false, cars: 14, people: 10, pets: 0, details: 0,
    rain: 800, forest: 0,
  },
  med: {
    label: 'กลาง', desc: 'สมดุล: เงานุ่ม ไฟจราจร ป้าย ฝน ป่าไม้ รถ ผู้คน และสัตว์เลี้ยงพอเหมาะ',
    pixelRatio: 1.5, shadows: true, shadowSize: 2048, bloom: false, cars: 60, people: 70, pets: 16, details: 1,
    rain: 3000, forest: 1800,
  },
  high: {
    label: 'สูง', desc: 'สมจริงสุด: เงาละเอียด แสงเรืองกลางคืน ฝนหนา ป่าเต็มภูเขา ไฟจราจรและป้ายครบ รถ คน หมา แมว จำนวนมาก',
    pixelRatio: 2, shadows: true, shadowSize: 4096, bloom: true, cars: 150, people: 160, pets: 40, details: 2,
    rain: 7000, forest: 4000,
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

// สภาพอากาศ: เมฆ ฝน ลม ฟ้าแลบ
const weather = createWeather({ scene, getFocus: () => controls.target, getCameraPos: () => camera.position });

// ---------------------------------------------------------------
// ไฟจราจร: ทางแยก (ถนนติดกัน 3 ทิศขึ้นไป) มีไฟ 3 ชุดเวลาเหลื่อมกัน
// รอบละ 21 วินาทีเกม: แนว x เขียว → แนว z เขียว สลับกัน มีไฟเหลืองและแดงทั้งหมดคั่น
// ---------------------------------------------------------------
const SIG_GREEN = 8, SIG_YELLOW = 1.5, SIG_ALLRED = 1;
const SIG_HALF = SIG_GREEN + SIG_YELLOW + SIG_ALLRED;
const SIG_CYCLE = SIG_HALF * 2;
const SIG_OFFSET = [0, 7, 14];
let sigClock = 0;
const sigGroup = (x, z) => (((x + 2 * z) % 3) + 3) % 3;

function roadArms(x, z) {
  let n = 0;
  if (isType(x + 1, z, 'road')) n++;
  if (isType(x - 1, z, 'road')) n++;
  if (isType(x, z + 1, 'road')) n++;
  if (isType(x, z - 1, 'road')) n++;
  return n;
}
const isJunction = (x, z) => isType(x, z, 'road') && roadArms(x, z) >= 3;

// สถานะไฟของแนว axis ('x' | 'z') ที่ทางแยก (x,z): 'g' เขียว, 'y' เหลือง, 'r' แดง, null = ไม่มีไฟ
function signalState(x, z, axis) {
  if (!isJunction(x, z)) return null;
  const p = (sigClock + SIG_OFFSET[sigGroup(x, z)]) % SIG_CYCLE;
  const first = p < SIG_HALF;
  if ((axis === 'x') !== first) return 'r';
  const q = first ? p : p - SIG_HALF;
  if (q < SIG_GREEN) return 'g';
  if (q < SIG_GREEN + SIG_YELLOW) return 'y';
  return 'r';
}

// รถ ผู้คน หมา แมว
// มีสะพานข้ามแม่น้ำที่คอลัมน์ x หรือไม่ (เรือจะไม่ชน)
function bridgeAtX(wx) {
  const tx = Math.floor(wx + N / 2);
  for (let dx = -1; dx <= 1; dx++) for (let z = 0; z < N; z++) {
    const i = z * N + tx + dx;
    if (tx + dx >= 0 && tx + dx < N && tileIsWater[i] && state.tiles[i]?.t === 'road') return true;
  }
  return false;
}
const wildlife = createWildlife({ scene, blocked: bridgeAtX });
const agents = createAgents({
  scene, N,
  tileType: (x, z) => tileAt(x, z)?.t ?? null,
  groundY: tileY,
  signal: signalState,
});

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
  plinth: std(0x8a8578, { roughness: 1 }),
  pole: std(0x4a4f55, { metalness: 0.6, roughness: 0.45 }),
  housing: std(0x181b1f, { roughness: 0.6 }),
  stopLine: std(0xf4f4f0, { roughness: 0.7 }),
  tank: std(0x9fb4c4, { metalness: 0.35, roughness: 0.45 }),
  glassShop: std(0x6f93ab, { metalness: 0.6, roughness: 0.15 }),
  lamp: std(0xcfe8ff, { emissive: 0xaad4ff, emissiveIntensity: 0.25 }),
  beacon: std(0xff3b30, { emissive: 0xff2010, emissiveIntensity: 1.2 }),
};

// หลอดไฟจราจร 3 กลุ่ม × 2 แนว × (แดง/เหลือง/เขียว) อัปเดตความสว่างทุกเฟรม
const SIG_COLORS = { r: [0xff3b30, 0x3a0a08], y: [0xffc021, 0x3a2b05], g: [0x2ee86b, 0x07351a] };
const signalMats = [0, 1, 2].map(() => ({
  x: Object.fromEntries(Object.entries(SIG_COLORS).map(([k, c]) => [k, new THREE.MeshStandardMaterial({ color: c[1], emissive: c[0], emissiveIntensity: 0, roughness: 0.4 })])),
  z: Object.fromEntries(Object.entries(SIG_COLORS).map(([k, c]) => [k, new THREE.MeshStandardMaterial({ color: c[1], emissive: c[0], emissiveIntensity: 0, roughness: 0.4 })])),
}));
function updateSignalLamps() {
  for (let g = 0; g < 3; g++) {
    for (const axis of ['x', 'z']) {
      const p = (sigClock + SIG_OFFSET[g]) % SIG_CYCLE;
      const first = p < SIG_HALF;
      let st = 'r';
      if ((axis === 'x') === first) {
        const q = first ? p : p - SIG_HALF;
        st = q < SIG_GREEN ? 'g' : q < SIG_GREEN + SIG_YELLOW ? 'y' : 'r';
      }
      const m = signalMats[g][axis];
      m.r.emissiveIntensity = st === 'r' ? 3.2 : 0;
      m.y.emissiveIntensity = st === 'y' ? 3.2 : 0;
      m.g.emissiveIntensity = st === 'g' ? 3.2 : 0;
    }
  }
}

// ป้ายจราจร/ป้ายชื่อถนน วาดจาก canvas (แคชไว้ใช้ซ้ำ)
const FONT = '"Leelawadee UI","Tahoma","Noto Sans Thai",sans-serif';
const signMatCache = new Map();
function signMat(key, draw, w = 128, h = 128) {
  let m = signMatCache.get(key);
  if (m) return m;
  const t = canvasTex(w, h, draw);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  m = new THREE.MeshStandardMaterial({ map: t, roughness: 0.55, metalness: 0.1, side: THREE.DoubleSide });
  signMatCache.set(key, m);
  return m;
}
const trafficSign = {
  speed(n) {
    return signMat('speed' + n, (g, w, h) => {
      g.fillStyle = '#fff'; g.fillRect(0, 0, w, h);
      g.beginPath(); g.arc(w / 2, h / 2, w * 0.46, 0, Math.PI * 2); g.fillStyle = '#d32f2f'; g.fill();
      g.beginPath(); g.arc(w / 2, h / 2, w * 0.34, 0, Math.PI * 2); g.fillStyle = '#fff'; g.fill();
      g.fillStyle = '#111'; g.font = `bold ${w * 0.36}px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(String(n), w / 2, h / 2 + 4);
    });
  },
  park() {
    return signMat('park', (g, w, h) => {
      g.fillStyle = '#1565c0'; g.fillRect(0, 0, w, h);
      g.strokeStyle = '#fff'; g.lineWidth = 6; g.strokeRect(5, 5, w - 10, h - 10);
      g.fillStyle = '#fff'; g.font = `bold ${w * 0.7}px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('P', w / 2, h / 2 + 6);
    });
  },
  ped() {
    return signMat('ped', (g, w, h) => {
      g.fillStyle = '#1565c0'; g.fillRect(0, 0, w, h);
      g.strokeStyle = '#fff'; g.lineWidth = 6; g.strokeRect(5, 5, w - 10, h - 10);
      // สามเหลี่ยมขาว + คนข้ามถนน
      g.beginPath(); g.moveTo(w / 2, 18); g.lineTo(w - 20, h - 22); g.lineTo(20, h - 22); g.closePath();
      g.fillStyle = '#fff'; g.fill();
      g.strokeStyle = '#111'; g.fillStyle = '#111'; g.lineWidth = 6; g.lineCap = 'round';
      g.beginPath(); g.arc(w / 2, 56, 6, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.moveTo(w / 2, 64); g.lineTo(w / 2, 88); g.moveTo(w / 2, 70); g.lineTo(w / 2 - 12, 82);
      g.moveTo(w / 2, 70); g.lineTo(w / 2 + 12, 80); g.moveTo(w / 2, 88); g.lineTo(w / 2 - 9, 104); g.moveTo(w / 2, 88); g.lineTo(w / 2 + 9, 102); g.stroke();
    });
  },
  name(text) {
    return signMat('name' + text, (g, w, h) => {
      g.fillStyle = '#0b6b3a'; g.fillRect(0, 0, w, h);
      g.strokeStyle = '#fff'; g.lineWidth = 4; g.strokeRect(4, 4, w - 8, h - 8);
      g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = `bold ${h * 0.42}px ${FONT}`;
      g.fillText('ถ.' + text, w / 2, h / 2 + 3);
    }, 320, 64);
  },
};
const planeGeo = new THREE.PlaneGeometry(1, 1);

// ทางม้าลาย: แถบขาวบนพื้นโปร่งใส (ใช้ซ้ำทุกทางแยก)
const zebraMat = new THREE.MeshStandardMaterial({
  map: canvasTex(128, 128, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = '#f4f4ee';
    const n = 7, bw = w / (n * 2 - 1);
    for (let i = 0; i < n; i++) g.fillRect(i * bw * 2, 0, bw, h);
  }),
  transparent: true, alphaTest: 0.5, roughness: 0.75, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
});
zebraMat.map.wrapS = zebraMat.map.wrapT = THREE.ClampToEdgeWrapping;

// ---------------------------------------------------------------
// ภูมิประเทศ: เนิน แม่น้ำ ทะเล ภูเขา (ทั้งหมดสร้างจากฟังก์ชัน terrainH)
// ---------------------------------------------------------------
const TERRAIN_SIZE = 200;
const detailTex = noiseTex('#ffffff', ['rgba(0,0,0,.10)', 'rgba(255,255,255,.12)', 'rgba(0,0,0,.06)'], 256, TERRAIN_SIZE / 6);
const terrainGeo = new THREE.PlaneGeometry(TERRAIN_SIZE, TERRAIN_SIZE, TERRAIN_SIZE, TERRAIN_SIZE);
terrainGeo.rotateX(-Math.PI / 2);
{
  const pos = terrainGeo.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const rgb = [0, 0, 0];
  for (let i = 0; i < pos.count; i++) {
    const wx = pos.getX(i), wz = pos.getZ(i);
    const h = terrainH(wx, wz);
    pos.setY(i, h);
    terrainColor(h, fbm(wx * 0.9 + 7, wz * 0.9 + 3, 2), rgb);
    // vertex color เป็นค่าเชิงเส้น: แปลงจาก sRGB ไม่งั้นสีจะซีดขาว
    col[i * 3] = Math.pow(rgb[0], 2.2); col[i * 3 + 1] = Math.pow(rgb[1], 2.2); col[i * 3 + 2] = Math.pow(rgb[2], 2.2);
  }
  terrainGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  terrainGeo.computeVertexNormals();
}
const ground = new THREE.Mesh(terrainGeo, new THREE.MeshStandardMaterial({ map: detailTex, vertexColors: true, roughness: 1 }));
ground.receiveShadow = true;
scene.add(ground);

// น้ำ (ทะเล + แม่น้ำ) ลายคลื่นเลื่อนตามลม
const waterTex = canvasTex(256, 256, (g, w, h) => {
  const r = mulberry32(4242);
  g.fillStyle = '#dfeef4'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 700; i++) {
    g.fillStyle = r() < 0.5 ? 'rgba(255,255,255,.55)' : 'rgba(110,160,190,.30)';
    g.fillRect(r() * w, r() * h, 6 + r() * 22, 1 + r() * 2);
  }
});
waterTex.repeat.set(110, 110);
const waterMat = new THREE.MeshStandardMaterial({
  color: 0x1c86b5, map: waterTex, roughness: 0.06, metalness: 0.15, transparent: true, opacity: 0.84,
});
// คลื่นน้ำ: เติมโค้ด shader ให้เส้นแสงสะท้อนระยิบเคลื่อนไหวตลอดเวลา
const waterTime = { value: 0 };
waterMat.onBeforeCompile = shader => {
  shader.uniforms.uTime = waterTime;
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWPos = (modelMatrix * vec4(position, 1.0)).xyz;');
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nuniform float uTime;')
    .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
      {
        vec2 p = vWPos.xz;
        float t = uTime;
        float a = sin(p.x * 1.3 + t * 1.4) + sin(p.y * 1.7 - t * 1.1) + 0.7 * sin((p.x + p.y) * 2.1 + t * 1.9);
        float b = cos(p.y * 1.5 + t * 1.2) + cos(p.x * 2.2 - t * 1.3) + 0.7 * cos((p.x - p.y) * 2.7 - t * 1.6);
        normal = normalize(normal + vec3(a, b, 0.0) * 0.05);
      }`);
};
const sea = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), waterMat);
sea.rotation.x = -Math.PI / 2;
sea.position.y = SEA_Y;
sea.receiveShadow = true;
scene.add(sea);

// เส้นตารางช่อง วิ่งตามความสูงพื้นดิน
{
  const pts = [];
  const H = (x, z) => vertH[z * GN + x] + 0.025;
  for (let z = 0; z <= N; z++) for (let x = 0; x < N; x++) pts.push(x - N / 2, H(x, z), z - N / 2, x + 1 - N / 2, H(x + 1, z), z - N / 2);
  for (let x = 0; x <= N; x++) for (let z = 0; z < N; z++) pts.push(x - N / 2, H(x, z), z - N / 2, x - N / 2, H(x, z + 1), z + 1 - N / 2);
  const gg = new THREE.BufferGeometry();
  gg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  const grid = new THREE.LineSegments(gg, new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.08 }));
  scene.add(grid);
}

// ป่าบนภูเขา/เนินรอบเมือง (instanced): สนบนที่สูง ไม้ใบกว้างบนที่ต่ำ จำนวนตามระดับกราฟิก
const forest = (() => {
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5a4126, roughness: 1 });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, vertexColors: true });
  const FMAX = 4000;
  const mk = (geo, mat) => new THREE.InstancedMesh(geo, mat, FMAX);
  const G = {
    con: { trunk: mk(trunkGeo(0.7, 0.07, 0.04), trunkMat), crown: mk(coniferCrown(2, 8, 1), leafMat), n: 0 },
    brd: { trunk: mk(trunkGeo(0.62, 0.09, 0.05), trunkMat), crown: mk(broadleafCrown(5, 1), leafMat), n: 0 },
  };
  const rnd = mulberry32(20241029);
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  let placed = 0;
  for (let tries = 0; tries < 80000 && placed < FMAX; tries++) {
    const x = (rnd() - 0.5) * 190, z = (rnd() - 0.5) * 190;
    if (Math.abs(x) < N / 2 + 1 && Math.abs(z) < N / 2 + 1) continue; // ไม่ปลูกในพื้นที่เมือง
    const h = terrainH(x, z);
    if (h < 0.35 || h > 9.5) continue;
    if (fbm(x * 0.08 + 5, z * 0.08 + 5, 3) < 0.42) continue;
    const conifer = rnd() < 0.25 + 0.75 * Math.min(1, Math.max(0, (h - 1.5) / 4));
    const g = conifer ? G.con : G.brd;
    const s = (conifer ? 0.9 : 0.8) + rnd() * 1.1;
    dummy.position.set(x, h - 0.05, z);
    dummy.rotation.set((rnd() - 0.5) * 0.08, rnd() * 6.28, (rnd() - 0.5) * 0.08);
    dummy.scale.set(s * (0.85 + rnd() * 0.3), s * (0.9 + rnd() * 0.4), s * (0.85 + rnd() * 0.3));
    dummy.updateMatrix();
    if (conifer) color.setRGB(0.09 + rnd() * 0.08, 0.30 + rnd() * 0.18, 0.13 + rnd() * 0.08, THREE.SRGBColorSpace);
    else if (rnd() < 0.08) color.setRGB(0.80 + rnd() * 0.15, 0.55 + rnd() * 0.2, 0.15, THREE.SRGBColorSpace);   // ใบเหลือง/ส้มประปราย
    else color.setRGB(0.20 + rnd() * 0.15, 0.50 + rnd() * 0.22, 0.14 + rnd() * 0.08, THREE.SRGBColorSpace);
    const i = g.n++;
    g.trunk.setMatrixAt(i, dummy.matrix);
    g.crown.setMatrixAt(i, dummy.matrix);
    g.crown.setColorAt(i, color);
    placed++;
  }
  for (const g of Object.values(G)) for (const m of [g.trunk, g.crown]) {
    m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.frustumCulled = false; m.count = g.n; scene.add(m);
  }
  return {
    setCount(n) {
      const f = placed ? Math.min(1, n / placed) : 0;
      for (const g of Object.values(G)) {
        const c = Math.floor(g.n * f);
        for (const m of [g.trunk, g.crown]) { m.count = c; m.visible = c > 0; }
      }
    },
  };
})();

// ---------------------------------------------------------------
// กลางวัน / กลางคืน
// ---------------------------------------------------------------
const C_DAY = new THREE.Color(0x8fc4ee);
const C_NIGHT = new THREE.Color(0x0a1124);
const C_WARM = new THREE.Color(0xff9a5c);
const tmpColor = new THREE.Color();
const facadeMats = []; // วัสดุหน้าต่างอาคาร (ไฟติดตอนกลางคืน)
let tod = 0.36; // เวลาในวัน 0..1 (0.5 = เที่ยง)

const C_GREY = new THREE.Color(0x7d8791);
const C_FLASH = new THREE.Color(0xdfe8ff);
let lampLevel = 0;   // ความสว่างของไฟ (กลางคืน หรือฟ้ามืดครึ้มตอนฝน)
let tempC = 30;      // อุณหภูมิ (°C)

function updateSky(dt) {
  tod = (tod + dt / DAY_LENGTH_SEC) % 1;
  const W = weather.state;
  const ang = (tod - 0.25) * Math.PI * 2;
  const elev = Math.sin(ang);
  sun.position.set(Math.cos(ang) * 40, Math.max(elev, 0.08) * 40 + 2, 16);
  const day = THREE.MathUtils.smoothstep(elev, -0.12, 0.28);

  // เมฆและฝนบังแสงอาทิตย์
  const dim = 1 - 0.55 * W.cloud - 0.2 * W.rain;
  sun.intensity = 2.3 * day * dim;
  hemi.intensity = (0.18 + 0.65 * day) * (1 + 0.15 * W.cloud) + W.flash * 2.5;
  scene.environmentIntensity = (0.12 + 0.45 * day) * (1 - 0.3 * W.cloud) + W.flash * 0.8;
  renderer.toneMappingExposure = 0.85 + 0.25 * day;

  tmpColor.copy(C_NIGHT).lerp(C_DAY, day);
  const warm = THREE.MathUtils.clamp(1 - Math.abs(elev) / 0.3, 0, 1) * 0.55;
  tmpColor.lerp(C_WARM, warm * (1 - 0.7 * W.cloud));
  // ท้องฟ้าเทาตามเมฆ/ฝน
  const grey = tmpColor2.copy(C_GREY).multiplyScalar(0.1 + 0.9 * day);
  tmpColor.lerp(grey, Math.min(0.85, W.cloud * 0.7 + W.rain * 0.25));
  tmpColor.lerp(C_FLASH, W.flash * 0.5);
  scene.background.copy(tmpColor);
  scene.fog.color.copy(tmpColor);
  scene.fog.near = 70 - 52 * W.rain;
  scene.fog.far = 170 - 80 * W.rain - 25 * W.cloud;
  sun.color.setHex(0xfff1d6).lerp(C_WARM, warm * 0.8);

  const night = 1 - day;
  lampLevel = Math.min(1, night + day * (0.35 * W.cloud + 0.45 * W.rain));
  for (const m of facadeMats) m.emissiveIntensity = lampLevel * 1.3;
  M.lampGlow.emissiveIntensity = lampLevel * 3;
  nightLevel = night;

  // ถนนเปียก: เข้มขึ้นและเงาสะท้อนมากขึ้น
  M.road.roughness = 0.95 - 0.6 * W.wet;
  M.road.color.setRGB(1 - 0.3 * W.wet, 1 - 0.3 * W.wet, 1 - 0.26 * W.wet);

  // อุณหภูมิ: ร้อนสุดบ่าย เย็นลงตอนฝน
  tempC = 26 + 9 * THREE.MathUtils.clamp(elev, 0, 1) - 4.5 * W.rain - 2 * W.cloud;
  return night;
}
const tmpColor2 = new THREE.Color();
const clockText = () => {
  const m = Math.floor(tod * 24 * 60);
  return String(Math.floor(m / 60) % 24).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
};

// ---------------------------------------------------------------
// หน้าต่างอาคาร: สร้างเท็กซ์เจอร์ผนัง + ไฟกลางคืนจากโค้ด
// ---------------------------------------------------------------
const FLOOR = 0.16; // ความสูงต่อชั้น
const BAY = 0.16;   // ความกว้างต่อช่องหน้าต่าง
const TEXN = 4;     // 1 เท็กซ์เจอร์ = 4x4 ช่องหน้าต่าง

function makeFacadeMat(o) {
  const S = 512, n = TEXN, cell = S / n;
  const rnd = mulberry32(o.seed);
  const lit = Array.from({ length: n * n }, () => rnd() < o.lit);
  const blind = Array.from({ length: n * n }, () => rnd());   // ม่าน/มู่ลี่สุ่มต่อบาน
  const ac = Array.from({ length: n * n }, () => rnd() < (o.ac ?? 0.12));
  const mx = o.mx * cell, my = o.my * cell;
  const cellRect = (r, c) => ({ x: c * cell + mx, y: r * cell + my, w: cell - 2 * mx, h: cell - 2 * my });

  const map = canvasTex(S, S, g => {
    g.fillStyle = o.wall; g.fillRect(0, 0, S, S);
    // ผิวผนัง: เม็ดทราย + คราบเปื้อนจางๆ แนวตั้ง
    for (let i = 0; i < 9000; i++) {
      g.fillStyle = rnd() < 0.5 ? 'rgba(0,0,0,.05)' : 'rgba(255,255,255,.06)';
      g.fillRect(rnd() * S, rnd() * S, 1 + rnd() * 2, 1 + rnd() * 2);
    }
    for (let i = 0; i < 26; i++) {
      const x = rnd() * S, w = 4 + rnd() * 10;
      const gr = g.createLinearGradient(0, 0, 0, S);
      gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(40,30,20,.07)');
      g.fillStyle = gr; g.fillRect(x, 0, w, S);
    }
    if (o.stripes) {
      g.fillStyle = 'rgba(0,0,0,0.11)';
      for (let y = 0; y < S; y += 12) g.fillRect(0, y, S, 3);
    }
    for (let r = 0; r < n; r++) {
      // แผ่นพื้น/คานคั่นชั้น
      g.fillStyle = 'rgba(0,0,0,.16)'; g.fillRect(0, r * cell, S, 3);
      g.fillStyle = 'rgba(255,255,255,.18)'; g.fillRect(0, r * cell + 3, S, 2);
      for (let c = 0; c < n; c++) {
        const { x, y, w, h } = cellRect(r, c);
        const k = r * n + c;
        // เงาวงกบด้านในช่องหน้าต่าง
        g.fillStyle = 'rgba(0,0,0,.28)'; g.fillRect(x - 4, y - 4, w + 8, h + 9);
        g.fillStyle = o.frame; g.fillRect(x - 3, y - 3, w + 6, h + 6);
        const grd = g.createLinearGradient(0, y, 0, y + h);
        grd.addColorStop(0, o.glassTop); grd.addColorStop(1, o.glassBot);
        g.fillStyle = grd; g.fillRect(x, y, w, h);
        // ม่าน/มู่ลี่ในห้อง
        if (!o.metal && blind[k] < 0.55) {
          g.fillStyle = blind[k] < 0.25 ? 'rgba(236,226,206,.55)' : 'rgba(190,120,100,.35)';
          g.fillRect(x, y, w, h * (0.35 + blind[k]));
        }
        // แสงสะท้อนเฉียงบนกระจก
        g.fillStyle = 'rgba(255,255,255,.16)';
        g.beginPath(); g.moveTo(x, y + h * 0.55); g.lineTo(x + w * 0.55, y); g.lineTo(x + w * 0.85, y); g.lineTo(x, y + h * 0.9); g.closePath(); g.fill();
        if (o.mullion) { g.fillStyle = o.frame; g.fillRect(x + w / 2 - 1.5, y, 3, h); }
        else { g.fillStyle = o.frame; g.fillRect(x, y + h * 0.5 - 1, w, 2.5); g.fillRect(x + w / 2 - 1, y, 2.5, h); }
        if (o.sill) { g.fillStyle = 'rgba(255,255,255,.4)'; g.fillRect(x - 5, y + h + 3, w + 10, 5); g.fillStyle = 'rgba(0,0,0,.22)'; g.fillRect(x - 5, y + h + 8, w + 10, 3); }
        if (ac[k] && o.sill) { g.fillStyle = '#d8dadc'; g.fillRect(x + w * 0.1, y + h + 10, w * 0.6, h * 0.22); g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(x + w * 0.1, y + h + 10 + h * 0.15, w * 0.6, 3); }
      }
    }
  });

  // แผนที่นูน: ช่องหน้าต่างลึก วงกบนูน ผนังเรียบ
  const bump = canvasTex(S, S, g => {
    g.fillStyle = '#9a9a9a'; g.fillRect(0, 0, S, S);
    for (let r = 0; r < n; r++) {
      g.fillStyle = '#c4c4c4'; g.fillRect(0, r * cell, S, 5);
      for (let c = 0; c < n; c++) {
        const { x, y, w, h } = cellRect(r, c);
        g.fillStyle = '#d6d6d6'; g.fillRect(x - 3, y - 3, w + 6, h + 6);
        g.fillStyle = '#4a4a4a'; g.fillRect(x, y, w, h);
        if (o.sill) { g.fillStyle = '#e4e4e4'; g.fillRect(x - 5, y + h + 3, w + 10, 5); }
      }
    }
  }, false);

  const emi = canvasTex(S, S, g => {
    g.fillStyle = '#000'; g.fillRect(0, 0, S, S);
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (!lit[r * n + c]) continue;
        const { x, y, w, h } = cellRect(r, c);
        const gr = g.createLinearGradient(0, y, 0, y + h);
        const warm = rnd() < 0.7;
        gr.addColorStop(0, warm ? '#ffe0a8' : '#fff1d6'); gr.addColorStop(1, warm ? '#ffb85c' : '#ffd9a0');
        g.fillStyle = gr; g.fillRect(x, y, w, h);
      }
    }
  });

  const mat = new THREE.MeshStandardMaterial({
    map, bumpMap: bump, bumpScale: 1.6, emissiveMap: emi, emissive: 0xffffff, emissiveIntensity: 0,
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
const coneGeo = new THREE.ConeGeometry(0.5, 1, 16);

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
  put(parent, boxGeo, M.roofFlat, 0, y + 0.012, 0, w, 0.024, d);
  // ขอบกันตก (parapet) รอบดาดฟ้า
  const t = 0.022, hh = 0.04;
  put(parent, boxGeo, M.concrete, 0, y + hh / 2 + 0.02, d / 2 - t / 2, w + 0.02, hh, t);
  put(parent, boxGeo, M.concrete, 0, y + hh / 2 + 0.02, -d / 2 + t / 2, w + 0.02, hh, t);
  put(parent, boxGeo, M.concrete, w / 2 - t / 2, y + hh / 2 + 0.02, 0, t, hh, d);
  put(parent, boxGeo, M.concrete, -w / 2 + t / 2, y + hh / 2 + 0.02, 0, t, hh, d);
  // ของบนดาดฟ้า: แอร์/ท่อระบายอากาศ (สุ่มคงที่ตามขนาด+ความสูง)
  const r = (Math.sin(w * 91.7 + y * 53.1 + d * 17.3) * 43758.5) % 1, q = Math.abs(r);
  if (w > 0.5) {
    put(parent, boxGeo, M.metal, w * 0.22, y + 0.055, -d * 0.18, 0.13, 0.07, 0.1);
    put(parent, cylGeo, M.metal, -w * 0.2, y + 0.07, d * 0.12, 0.05, 0.1, 0.05);
    if (q > 0.5) put(parent, boxGeo, M.concrete, -w * 0.18, y + 0.05, -d * 0.2, 0.12, 0.06, 0.12);
  }
  return y + 0.03;
}
// ฐาน บัวชายคา ประตูทางเข้า ให้ตึกไม่ดูเป็นกล่องเปล่า
function trim(bg, w, d, y0, top, door = true) {
  put(bg, boxGeo, M.plinth, 0, y0 + 0.025, 0, w + 0.03, 0.05, d + 0.03);
  put(bg, boxGeo, M.concrete, 0, top - 0.012, 0, w + 0.05, 0.024, d + 0.05);
  if (door) {
    put(bg, boxGeo, M.door, 0, y0 + 0.08, d / 2 + 0.006, 0.1, 0.15, 0.012);
    put(bg, boxGeo, M.metal, 0, y0 + 0.17, d / 2 + 0.045, 0.2, 0.012, 0.09);
  }
}
const shrubGeo = blob(0.5, 1, 0.75, 1, 4, 0.25, 1);
function shrub(bg, x, z, s, i = 0) {
  put(bg, shrubGeo, M.leaf[i % M.leaf.length], x, 0.03 + 0.5 * 0.75 * s, z, s, s, s, i * 1.7);
}
// ต้นไม้แกว่งตามลม: เก็บ pivot ไว้ต่อช่อง (ล้างทิ้งเมื่อช่องถูกสร้างใหม่)
const swayTiles = new Map();
let swayList = null;
const cityTrunkGeo = trunkGeo(0.3, 0.05, 0.03);
const cityBroad = broadleafCrown(11), cityConifer = coniferCrown(4);
const leafVC = [0x2f8a35, 0x3e9a40, 0x57a645, 0x6a9a2c, 0x2a7a3a].map(c => std(c, { roughness: 0.92, vertexColors: true }));
function addTree(parent, px, pz, s, r) {
  const pivot = new THREE.Group();
  pivot.position.set(px, 0, pz);
  parent.add(pivot);
  const conif = r > 0.72;
  const k = 0.32 * s;
  put(pivot, cityTrunkGeo, M.trunk, 0, 0.04, 0, k * 1.2, k * 1.1, k * 1.2, r * 6);
  put(pivot, conif ? cityConifer : cityBroad, conif ? leafVC[4] : pick(leafVC, r), 0, 0.04, 0, k, k * (0.95 + r * 0.2), k, r * 9);
  if (swayList) swayList.push({ obj: pivot, ph: r * 40, k: 0.6 + 0.8 * hash(Math.round(px * 100), Math.round(pz * 100)) });
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
      put(bg, boxGeo, M.concrete, -0.1, y0 + 0.012, d / 2 + 0.05, 0.16, 0.024, 0.1);           // ขั้นบันได
      put(bg, boxGeo, M.roofTile, -0.1, y0 + 0.175, d / 2 + 0.06, 0.2, 0.014, 0.13);           // กันสาดหน้าบ้าน
      put(bg, boxGeo, M.plinth, 0, y0 + 0.02, 0, w + 0.03, 0.04, d + 0.03);
      shrub(bg, 0.12, d / 2 + 0.07, 0.12, 0); shrub(bg, 0.24, d / 2 + 0.06, 0.1, 1); shrub(bg, -0.25, d / 2 + 0.07, 0.11, 2);
      put(bg, boxGeo, M.concrete, w / 2 + 0.01, y0 + 0.07, 0.0, 0.01, 0.14, 0.5);              // รั้วเตี้ยด้านข้าง
    } else if (lv === 2) {
      const w = 0.7, d = 0.58;
      const top = block(bg, w, 3 + (r2 < 0.5 ? 0 : 1), d, mats, 0, y0, 0);
      const t2 = roofCap(bg, w, d, top);
      trim(bg, w, d, y0, top);
      shrub(bg, -0.28, d / 2 + 0.07, 0.12, 1); shrub(bg, 0.28, d / 2 + 0.07, 0.12, 3);
    } else {
      const w = 0.72, d = 0.72;
      const top = block(bg, w, 6 + Math.floor(r2 * 3), d, mats, 0, y0, 0);
      const t2 = roofCap(bg, w, d, top);
      trim(bg, w, d, y0, top);
      put(bg, cylGeo, M.metal, -0.18, t2 + 0.09, -0.15, 0.16, 0.18, 0.16);
      put(bg, boxGeo, M.concrete, 0.18, t2 + 0.06, 0.15, 0.18, 0.12, 0.18);
    }
  } else if (type === 'com') {
    if (lv === 1) {
      const w = 0.7, d = 0.6;
      const top = block(bg, w, 2, d, pick(FM.office, r), 0, y0, 0);
      roofCap(bg, w, d, top);
      trim(bg, w, d, y0, top, false);
      put(bg, boxGeo, M.glassShop, 0, y0 + 0.08, d / 2 + 0.004, w * 0.85, 0.14, 0.012);      // กระจกหน้าร้าน
      put(bg, boxGeo, pick(M.awning, r2), 0, y0 + FLOOR * 0.95, d / 2 + 0.07, w * 0.9, 0.025, 0.14);
      put(bg, boxGeo, M.concrete, 0, y0 + FLOOR * 1.12, d / 2 + 0.012, w * 0.9, 0.05, 0.012);   // ป้ายชื่อร้าน
    } else if (lv === 2) {
      const t1 = block(bg, 0.78, 2, 0.78, pick(FM.office, r), 0, y0, 0);
      trim(bg, 0.78, 0.78, y0, t1);
      const t2 = block(bg, 0.58, 4 + Math.floor(r2 * 3), 0.58, pick(FM.glass, r), 0, t1, 0);
      const t3 = roofCap(bg, 0.58, 0.58, t2);
      put(bg, boxGeo, M.metal, 0.1, t3 + 0.05, 0.05, 0.18, 0.1, 0.18);
    } else {
      const t1 = block(bg, 0.82, 2, 0.82, pick(FM.office, r), 0, y0, 0);
      trim(bg, 0.82, 0.82, y0, t1);
      const t2 = block(bg, 0.64, 9 + Math.floor(r2 * 7), 0.64, pick(FM.glass, r), 0, t1, 0);
      const t3 = block(bg, 0.44, 2, 0.44, pick(FM.glass, r + 0.4), 0, t2, 0);
      const t4 = roofCap(bg, 0.44, 0.44, t3);
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) put(bg, boxGeo, M.concrete, sx * 0.325, y0 + (t2 - y0) / 2 + 0.2, sz * 0.325, 0.025, t2 - y0 - 0.4, 0.025); // เสาครีบมุมตึก
      put(bg, boxGeo, M.lamp, 0, t3 - 0.02, 0, 0.46, 0.02, 0.46);                              // แถบไฟบนยอด
      put(bg, cylGeo, M.metal, 0, t4 + 0.22, 0, 0.018, 0.44, 0.018);
      put(bg, icoGeo, M.beacon, 0, t4 + 0.45, 0, 0.04, 0.04, 0.04);
    }
  } else {
    const mats = pick(FM.ind, r);
    if (lv === 1) {
      const top = block(bg, 0.84, 2, 0.66, mats, 0, y0, 0);
      roofCap(bg, 0.84, 0.66, top);
      trim(bg, 0.84, 0.66, y0, top, false);
      put(bg, boxGeo, M.metal, 0, y0 + 0.11, 0.345, 0.48, 0.2, 0.012);                         // บานม้วนโรงงาน
      put(bg, cylGeo, M.metal, 0.38, y0 + 0.16, 0.0, 0.03, 0.32, 0.03);                         // ท่อ
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

function buildWaterPlant(bg) {
  const y0 = 0.03;
  // อาคารปั๊ม + ถังตกตะกอนทรงกลม + หอถังสูงขาตั้ง
  const top = block(bg, 0.5, 2, 0.4, FM.office[1], 0.2, y0, 0.28);
  roofCap(bg, 0.5, 0.4, top);
  put(bg, cylGeo, M.tank, -0.22, y0 + 0.06, 0.2, 0.46, 0.12, 0.46);
  put(bg, cylGeo, M.water, -0.22, y0 + 0.125, 0.2, 0.4, 0.012, 0.4);
  put(bg, cylGeo, M.tank, -0.24, y0 + 0.06, -0.26, 0.3, 0.12, 0.3);
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    put(bg, cylGeo, M.metal, 0.3 + sx * 0.07, y0 + 0.28, -0.26 + sz * 0.07, 0.016, 0.56, 0.016);
  }
  put(bg, cylGeo, M.tank, 0.3, y0 + 0.66, -0.26, 0.3, 0.2, 0.3);
  put(bg, coneGeo, M.tank, 0.3, y0 + 0.82, -0.26, 0.31, 0.12, 0.31);
}

// ---------------------------------------------------------------
// อาคารแบบเลือกเอง (ร้านค้า ปั๊ม โรงเรียน โรงพยาบาล โรงไฟฟ้า/ประปาหลายขนาด ฯลฯ)
// ---------------------------------------------------------------
Object.assign(M, {
  asphalt: std(0x3a3e44, { roughness: 0.95 }),
  white: std(0xf1efe8),
  red: std(0xc62828),
  solar: std(0x1b2a55, { metalness: 0.55, roughness: 0.22 }),
  schoolWall: std(0xecd9a6),
  carCols: [0xd33a2c, 0x2f6fb0, 0xe9e3d1, 0x333840, 0xd8a31a].map(c => std(c, { metalness: 0.4, roughness: 0.35 })),
});
const bandMats = {};
const band = c => (bandMats[c] ||= std(c, { roughness: 0.6 }));

// ป้ายตัวอักษร (วาดด้วย canvas เป็นข้อความธรรมดา)
const textMatCache = new Map();
function textMat(text, bgc, fg = '#ffffff', fs = 36) {
  const key = text + bgc + fg + fs;
  let m = textMatCache.get(key);
  if (m) return m;
  const tex = canvasTex(256, 64, (g, w, h) => {
    g.fillStyle = bgc; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(255,255,255,.5)'; g.lineWidth = 3; g.strokeRect(3, 3, w - 6, h - 6);
    g.fillStyle = fg;
    g.font = `bold ${fs}px "Segoe UI","Leelawadee UI","Noto Sans Thai",sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, w / 2, h / 2 + 2);
  });
  m = new THREE.MeshBasicMaterial({ map: tex });
  textMatCache.set(key, m);
  return m;
}
const signAt = (bg, text, bgc, fg, px, py, pz, w, h, fs, ry = 0) => put(bg, planeGeo, textMat(text, bgc, fg, fs), px, py, pz, w, h, 1, ry);

// ลานจอดรถ + รถจอด
function lot(bg, x, z, w, d, cars = 0, seed = 0) {
  put(bg, boxGeo, M.asphalt, x, 0.035, z, w, 0.01, d);
  const n = Math.max(2, Math.floor(w / 0.2));
  for (let k = 0; k <= n; k++) put(bg, boxGeo, M.stopLine, x - w / 2 + (k / n) * w, 0.042, z, 0.008, 0.002, d * 0.7);
  for (let k = 0; k < cars; k++) {
    const slot = (k * 2 + seed) % n;
    const cx = x - w / 2 + ((slot + 0.5) / n) * w;
    const cm = M.carCols[(k + seed) % M.carCols.length];
    put(bg, boxGeo, cm, cx, 0.065, z, 0.1, 0.04, 0.19);
    put(bg, boxGeo, M.glassShop, cx, 0.09, z - 0.01, 0.085, 0.03, 0.1);
  }
}

function buildConvenience(bg, name, col, r) {
  const y0 = 0.03, w = 0.66, d = 0.4, z0 = -0.2;
  put(bg, boxGeo, M.white, 0, y0 + 0.11, z0, w, 0.22, d);
  put(bg, boxGeo, M.glassShop, 0, y0 + 0.09, z0 + d / 2 + 0.004, w * 0.82, 0.13, 0.008);
  put(bg, boxGeo, band(col), 0, y0 + 0.24, z0, w + 0.02, 0.05, d + 0.02);
  signAt(bg, name, '#' + col.toString(16).padStart(6, '0'), '#ffffff', 0, y0 + 0.24, z0 + d / 2 + 0.016, w * 0.78, 0.042, 34);
  put(bg, boxGeo, M.concrete, 0, y0 + 0.275, z0, w + 0.02, 0.012, d + 0.02);
  put(bg, boxGeo, M.metal, 0.2, y0 + 0.31, z0 - 0.05, 0.12, 0.05, 0.1);
  lot(bg, 0, 0.28, 0.92, 0.4, 2, Math.floor(r * 4));
}
function buildKfc(bg, r) {
  const y0 = 0.03, w = 0.52, d = 0.36, z0 = -0.24;
  put(bg, boxGeo, M.white, 0, y0 + 0.1, z0, w, 0.2, d);
  put(bg, boxGeo, M.glassShop, 0, y0 + 0.085, z0 + d / 2 + 0.004, w * 0.8, 0.11, 0.008);
  put(bg, boxGeo, M.red, 0, y0 + 0.225, z0, w + 0.03, 0.05, d + 0.03);
  signAt(bg, 'KFC', '#c62828', '#ffffff', 0, y0 + 0.225, z0 + d / 2 + 0.02, 0.3, 0.042, 40);
  put(bg, boxGeo, M.red, 0, y0 + 0.26, z0, w + 0.03, 0.018, d + 0.03);
  put(bg, cylGeo, M.pole, 0.4, y0 + 0.2, 0.0, 0.015, 0.4, 0.015);                 // เสาป้ายหน้าร้าน
  signAt(bg, 'KFC', '#c62828', '#ffffff', 0.4, y0 + 0.4, 0.012, 0.2, 0.05, 40);
  put(bg, boxGeo, M.stopLine, -0.38, 0.042, 0.2, 0.01, 0.002, 0.55);            // ช่องไดรฟ์ทรู
  lot(bg, 0, 0.3, 0.9, 0.36, 2, Math.floor(r * 3));
}
function buildGasStation(bg, r) {
  const y0 = 0.03;
  put(bg, boxGeo, M.asphalt, 0, 0.035, 0.1, 0.94, 0.01, 0.76);
  put(bg, boxGeo, M.white, 0, y0 + 0.08, -0.36, 0.52, 0.16, 0.2);                 // ร้านสะดวกซื้อ
  put(bg, boxGeo, M.glassShop, 0, y0 + 0.07, -0.255, 0.4, 0.1, 0.008);
  put(bg, boxGeo, M.red, 0, y0 + 0.17, -0.36, 0.55, 0.025, 0.23);
  // หลังคาคลุมหัวจ่าย
  for (const sx of [-1, 1]) for (const sz of [0, 0.22]) put(bg, cylGeo, M.concrete, sx * 0.32, y0 + 0.1, sz, 0.025, 0.2, 0.025);
  put(bg, boxGeo, M.white, 0, y0 + 0.215, 0.11, 0.84, 0.03, 0.42);
  put(bg, boxGeo, M.red, 0, y0 + 0.2, 0.11 + 0.211, 0.84, 0.045, 0.008);
  put(bg, boxGeo, M.concrete, -0.17, y0 + 0.012, 0.11, 0.09, 0.024, 0.36);        // เกาะหัวจ่าย
  put(bg, boxGeo, M.concrete, 0.17, y0 + 0.012, 0.11, 0.09, 0.024, 0.36);
  for (const sx of [-0.17, 0.17]) for (const sz of [0.0, 0.22]) put(bg, boxGeo, band(0x2f6fb0), sx, y0 + 0.07, sz, 0.05, 0.09, 0.05);
  put(bg, cylGeo, M.pole, 0.42, y0 + 0.25, 0.4, 0.015, 0.5, 0.015);               // เสาป้ายราคา
  signAt(bg, 'น้ำมัน', '#1b3d6e', '#ffd54a', 0.42, y0 + 0.5, 0.4, 0.22, 0.06, 34);
  if (r > 0.4) put(bg, boxGeo, M.carCols[1], -0.17, 0.065, 0.3, 0.1, 0.04, 0.19);
}
function buildSupermarket(bg, r) {
  const y0 = 0.03;
  const top = block(bg, 0.88, 2, 0.5, FM.office[0], 0, y0, -0.22);
  roofCap(bg, 0.88, 0.5, top);
  put(bg, boxGeo, band(0x1e7b4a), 0, y0 + 0.285, -0.22 + 0.25 + 0.01, 0.9, 0.07, 0.025);
  signAt(bg, 'โลตัส', '#1e7b4a', '#ffffff', 0, y0 + 0.285, -0.22 + 0.25 + 0.024, 0.5, 0.058, 40);
  put(bg, boxGeo, M.glassShop, 0.0, y0 + 0.08, -0.22 + 0.25 + 0.004, 0.32, 0.14, 0.008);   // ทางเข้า
  put(bg, boxGeo, M.white, 0, y0 + 0.17, -0.22 + 0.25 + 0.05, 0.4, 0.014, 0.1);
  lot(bg, 0, 0.3, 0.92, 0.36, 3, Math.floor(r * 4));
}
function buildMall(bg, r) {
  const y0 = 0.03;
  const top = block(bg, 0.92, 4, 0.62, FM.office[1], 0, y0, -0.17);
  const t2 = roofCap(bg, 0.92, 0.62, top);
  put(bg, boxGeo, M.glassShop, 0, y0 + 0.17, -0.17 + 0.31 + 0.07, 0.36, 0.32, 0.14);        // อะเทรียมกระจกหน้าห้าง
  put(bg, boxGeo, M.white, 0, y0 + 0.34, -0.17 + 0.31 + 0.07, 0.4, 0.02, 0.18);
  signAt(bg, 'ห้างสรรพสินค้า', '#7a2f8f', '#ffffff', 0, y0 + 0.5, -0.17 + 0.31 + 0.012, 0.66, 0.08, 30);
  put(bg, boxGeo, band(0x7a2f8f), 0, top - 0.04, -0.17, 0.95, 0.03, 0.65);
  put(bg, cylGeo, M.metal, 0.3, t2 + 0.1, -0.2, 0.012, 0.2, 0.012);
  lot(bg, 0, 0.36, 0.92, 0.26, 3, Math.floor(r * 4));
}
function buildTownhouse(bg, r) {
  const y0 = 0.03, w = 0.25, d = 0.5;
  for (let k = -1; k <= 1; k++) {
    const mats = FM.res[(k + 1 + Math.floor(r * 4)) % FM.res.length];
    const x = k * w;
    block(bg, w - 0.006, 3, d, mats, x, y0, 0);
    put(bg, gableGeo(d + 0.04, w + 0.004, 0.14), M.roofTile, x, y0 + 3 * FLOOR, 0, 1, 1, 1, 0);
    put(bg, boxGeo, M.door, x + 0.05, y0 + 0.07, d / 2 + 0.003, 0.06, 0.13, 0.01);
    put(bg, boxGeo, M.concrete, x + 0.05, y0 + 0.012, d / 2 + 0.04, 0.1, 0.024, 0.06);
  }
  shrub(bg, -0.25, 0.56 - 0.04, 0.1, 0); shrub(bg, 0.25, 0.54 - 0.04, 0.1, 2);
}
function buildSchool(bg, r) {
  const y0 = 0.03;
  const wall = [M.schoolWall, M.schoolWall, M.roofFlat, M.roofFlat, M.schoolWall, M.schoolWall];
  const top = block(bg, 0.84, 2, 0.26, FM.res[0], 0, y0, -0.32);
  put(bg, gableGeo(0.3, 0.88, 0.1), M.roofTile, 0, top, -0.32, 1, 1, 1, Math.PI / 2);
  const top2 = block(bg, 0.26, 2, 0.36, FM.res[0], -0.29, y0, -0.01);
  put(bg, gableGeo(0.3, 0.4, 0.1), M.roofTile, -0.29, top2, -0.01, 1, 1, 1, 0);
  put(bg, boxGeo, M.door, 0.0, y0 + 0.07, -0.32 + 0.133, 0.1, 0.14, 0.01);
  signAt(bg, 'โรงเรียน', '#2f6fb0', '#ffffff', 0.0, y0 + 0.27, -0.32 + 0.14, 0.4, 0.05, 30);
  // สนามกีฬาลู่วิ่ง
  put(bg, cylGeo, M.path, 0.17, 0.036, 0.22, 0.6, 0.006, 0.4);
  put(bg, cylGeo, M.park, 0.17, 0.04, 0.22, 0.5, 0.006, 0.3);
  put(bg, boxGeo, M.stopLine, 0.17, 0.045, 0.22, 0.01, 0.002, 0.3);
  // เสาธง
  put(bg, cylGeo, M.metal, -0.1, y0 + 0.2, -0.1, 0.008, 0.4, 0.008);
  put(bg, boxGeo, M.red, -0.07, y0 + 0.36, -0.1, 0.06, 0.04, 0.004);
  shrub(bg, -0.38, 0.3, 0.1, 1); shrub(bg, -0.1, 0.4, 0.09, 3);
}
function buildHospital(bg, r) {
  const y0 = 0.03;
  const top = block(bg, 0.8, 5, 0.46, FM.res[2], 0, y0, -0.2);
  const t2 = roofCap(bg, 0.8, 0.46, top);
  const fz = -0.2 + 0.23;
  put(bg, boxGeo, M.white, 0.0, y0 + 0.68, fz + 0.005, 0.2, 0.2, 0.008);                    // ป้ายกากบาทแดง
  put(bg, boxGeo, M.red, 0.0, y0 + 0.68, fz + 0.011, 0.04, 0.15, 0.006);
  put(bg, boxGeo, M.red, 0.0, y0 + 0.68, fz + 0.011, 0.15, 0.04, 0.006);
  signAt(bg, 'โรงพยาบาล', '#c62828', '#ffffff', 0, y0 + 0.5, fz + 0.012, 0.5, 0.06, 30);
  put(bg, boxGeo, M.glassShop, 0, y0 + 0.08, fz + 0.004, 0.3, 0.14, 0.008);
  put(bg, boxGeo, M.white, 0, y0 + 0.17, fz + 0.09, 0.42, 0.018, 0.2);                      // หลังคาทางเข้า/รถพยาบาล
  for (const sx of [-0.18, 0.18]) put(bg, cylGeo, M.concrete, sx, y0 + 0.085, fz + 0.17, 0.02, 0.17, 0.02);
  put(bg, cylGeo, M.concrete, -0.2, t2 + 0.012, -0.2, 0.26, 0.02, 0.26);                     // ลานจอดเฮลิคอปเตอร์
  put(bg, boxGeo, M.stopLine, -0.2, t2 + 0.025, -0.2, 0.12, 0.004, 0.025);
  put(bg, boxGeo, M.white, 0.3, 0.07, 0.36, 0.11, 0.07, 0.22);                              // รถพยาบาล
  put(bg, boxGeo, M.red, 0.3, 0.075, 0.36, 0.115, 0.012, 0.22);
}
function buildSolar(bg) {
  const y0 = 0.03;
  put(bg, boxGeo, M.park, 0, 0.035, 0, 0.94, 0.01, 0.94);
  for (let row = 0; row < 3; row++) {
    const z = -0.3 + row * 0.27;
    for (let c = 0; c < 4; c++) {
      const x = -0.34 + c * 0.23;
      const p = put(bg, boxGeo, M.solar, x, y0 + 0.07, z, 0.2, 0.014, 0.14);
      p.rotation.x = -0.45;
      put(bg, boxGeo, M.metal, x, y0 + 0.032, z + 0.02, 0.012, 0.06, 0.012);
    }
  }
  put(bg, boxGeo, M.white, 0.38, y0 + 0.05, 0.42, 0.14, 0.1, 0.1);                           // ตู้อินเวอร์เตอร์
}
function buildBigPlant(bg) {
  const y0 = 0.03;
  const top = block(bg, 0.92, 3, 0.4, FM.ind[0], 0, y0, 0.28);
  roofCap(bg, 0.92, 0.4, top);
  for (const x of [-0.3, 0, 0.3]) put(bg, coolGeo, M.concrete, x, y0 + 0.4, -0.22, 0.4, 0.8, 0.4);
  put(bg, cylGeo, M.stack, -0.38, y0 + 0.75, 0.28, 0.07, 1.4, 0.07);
  put(bg, cylGeo, M.stack, 0.38, y0 + 0.75, 0.28, 0.07, 1.4, 0.07);
  put(bg, boxGeo, M.metal, 0.0, y0 + 0.05, 0.5 - 0.02, 0.5, 0.08, 0.04);
}
function buildGasPlant(bg) { buildPowerPlant(bg); }
function buildPump(bg) {
  const y0 = 0.03;
  const top = block(bg, 0.44, 2, 0.34, FM.office[1], 0.2, y0, 0.28);
  roofCap(bg, 0.44, 0.34, top);
  put(bg, cylGeo, M.tank, -0.25, y0 + 0.15, -0.1, 0.3, 0.3, 0.3);
  put(bg, coneGeo, M.tank, -0.25, y0 + 0.34, -0.1, 0.31, 0.1, 0.31);
  put(bg, cylGeo, M.metal, -0.06, y0 + 0.03, 0.2, 0.03, 0.06, 0.03);
  put(bg, boxGeo, M.water, 0.15, 0.036, -0.28, 0.6, 0.008, 0.26);
}
function buildBigWater(bg) {
  buildWaterPlant(bg);
  const y0 = 0.03;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) put(bg, cylGeo, M.metal, 0.02 + sx * 0.07, y0 + 0.28, -0.26 + sz * 0.07, 0.016, 0.56, 0.016);
  put(bg, cylGeo, M.tank, 0.02, y0 + 0.66, -0.26, 0.3, 0.2, 0.3);
  put(bg, coneGeo, M.tank, 0.02, y0 + 0.82, -0.26, 0.31, 0.12, 0.31);
}

function buildVariant(bg, type, v, r, r2) {
  if (type === 'res') {
    if (v === 'house') return buildZoneBuilding(bg, 'res', 1, r, r2);
    if (v === 'twin') return buildTownhouse(bg, r);
    if (v === 'apt') return buildZoneBuilding(bg, 'res', 2, r, r2);
    return buildZoneBuilding(bg, 'res', 3, r, r2);
  }
  if (type === 'com') {
    if (v === 'seven') return buildConvenience(bg, '7-ELEVEN', 0x1f7a4d, r);
    if (v === 'cj') return buildConvenience(bg, 'CJ', 0x2a62b0, r);
    if (v === 'kfc') return buildKfc(bg, r);
    if (v === 'gas') return buildGasStation(bg, r);
    if (v === 'lotus') return buildSupermarket(bg, r);
    return buildMall(bg, r);
  }
  if (type === 'service') return v === 'hospital' ? buildHospital(bg, r) : buildSchool(bg, r);
  if (type === 'power') return v === 'solar' ? buildSolar(bg) : v === 'thermal' ? buildBigPlant(bg) : buildGasPlant(bg);
  if (type === 'water') return v === 'pump' ? buildPump(bg) : v === 'big' ? buildBigWater(bg) : buildWaterPlant(bg);
}

// ---------------------------------------------------------------
// สร้าง mesh ของแต่ละช่อง
// ---------------------------------------------------------------
const tileGroup = new THREE.Group();
scene.add(tileGroup);
const meshes = new Array(N * N).fill(null);

// ---------------------------------------------------------------
// อุปกรณ์ถนน: ไฟจราจร ทางม้าลาย เส้นหยุด ป้ายจราจร/ป้ายชื่อถนน
// (พื้นผิวถนนอยู่สูง 0.06 จากฐานช่อง)
// ---------------------------------------------------------------
const DIRS4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const ROAD_TOP = 0.06;

function flatMesh(parent, mat, px, py, pz, sx, sz, ry = 0) {
  const m = new THREE.Mesh(planeGeo, mat);
  m.rotation.set(-Math.PI / 2, 0, ry);
  m.position.set(px, py, pz);
  m.scale.set(sx, sz, 1);
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

// เสาไฟจราจร 1 ต้นต่อทางเข้าแต่ละด้าน (ชิดซ้ายของรถที่วิ่งเข้ามา) หันหน้าไฟเข้าหารถ
function addSignalHeads(g, x, z, details) {
  const grp = sigGroup(x, z);
  for (const [dx, dz] of DIRS4) {
    if (!isType(x + dx, z + dz, 'road')) continue;
    const axis = dx !== 0 ? 'x' : 'z';
    const pole = new THREE.Group();
    pole.position.set(dx * 0.43 - dz * 0.455, ROAD_TOP, dz * 0.43 + dx * 0.455);
    pole.rotation.y = Math.atan2(dx, dz);
    g.add(pole);
    put(pole, cylGeo, M.pole, 0, 0.25, 0, 0.014, 0.5, 0.014);
    put(pole, boxGeo, M.housing, 0, 0.32, 0.012, 0.05, 0.15, 0.036);
    const lm = signalMats[grp][axis];
    put(pole, boxGeo, lm.r, 0, 0.365, 0.033, 0.03, 0.03, 0.008);
    put(pole, boxGeo, lm.y, 0, 0.32, 0.033, 0.03, 0.03, 0.008);
    put(pole, boxGeo, lm.g, 0, 0.275, 0.033, 0.03, 0.03, 0.008);
    if (details >= 1) {
      // ป้ายชื่อถนนที่กำลังจะตัดผ่าน
      const cross = axis === 'x' ? colName(x) : rowName(z);
      const blade = new THREE.Mesh(planeGeo, trafficSign.name(cross));
      blade.scale.set(0.27, 0.054, 1);
      blade.position.set(0, 0.545, 0);
      pole.add(blade);
    }
  }
}

// ทางม้าลายพาดผ่านถนนทุกด้านของทางแยก
function addCrosswalks(g, x, z) {
  for (const [dx, dz] of DIRS4) {
    if (!isType(x + dx, z + dz, 'road')) continue;
    const grp = new THREE.Group();
    if (dx !== 0) grp.rotation.y = Math.PI / 2;
    flatMesh(grp, zebraMat, 0, ROAD_TOP + 0.004, (dx !== 0 ? dx : dz) * 0.435, 0.7, 0.12);
    g.add(grp);
  }
}

// เส้นหยุดบนช่องถนนที่ติดทางแยก (เลนซ้ายของรถที่กำลังวิ่งเข้าทางแยก)
function addStopLines(g, x, z) {
  for (const [dx, dz] of DIRS4) {
    if (!isJunction(x + dx, z + dz)) continue;
    if (dx !== 0) put(g, boxGeo, M.stopLine, dx * 0.465, ROAD_TOP + 0.003, -dx * 0.2, 0.03, 0.004, 0.34);
    else put(g, boxGeo, M.stopLine, dz * 0.2, ROAD_TOP + 0.003, dz * 0.465, 0.34, 0.004, 0.03);
  }
}

function addSignPost(g, mat, px, pz, faceDx, faceDz) {
  const post = new THREE.Group();
  post.position.set(px, ROAD_TOP, pz);
  post.rotation.y = Math.atan2(faceDx, faceDz);
  g.add(post);
  put(post, cylGeo, M.pole, 0, 0.13, 0, 0.012, 0.26, 0.012);
  const board = new THREE.Mesh(planeGeo, mat);
  board.scale.set(0.11, 0.11, 1);
  board.position.set(0, 0.29, 0.01);
  post.add(board);
}

// ป้ายข้างทาง: ป้ายเตือนคนข้ามถนนก่อนถึงทางแยก, ป้ายจำกัดความเร็ว, ป้ายที่จอดรถ
function addRoadSigns(g, x, z, r, r2) {
  if (roadArms(x, z) !== 2) return;
  const h = isType(x + 1, z, 'road') && isType(x - 1, z, 'road');
  const v = isType(x, z + 1, 'road') && isType(x, z - 1, 'road');
  if (!h && !v) return; // ถนนเลี้ยว ไม่ตั้งป้าย
  // ติดทางแยก → ป้ายคนข้ามถนน สำหรับรถที่วิ่งเข้าหาทางแยก
  for (const [dx, dz] of DIRS4) {
    if (!isJunction(x + dx, z + dz)) continue;
    if (r < 0.7) addSignPost(g, trafficSign.ped(), dz * 0.455 - dx * 0.2, -dx * 0.455 - dz * 0.2, -dx, -dz);
  }
  // กลางช่วงถนน: จำกัดความเร็ว / ที่จอดรถ
  if (r2 < 0.14) {
    const dir = (r < 0.5 ? 1 : -1) * 1;
    const [dx, dz] = h ? [dir, 0] : [0, dir];
    const mat = r2 < 0.09 ? trafficSign.speed(r < 0.5 ? 40 : 60) : trafficSign.park();
    addSignPost(g, mat, dz * 0.455, -dx * 0.455, -dx, -dz);
  }
}

function buildTile(x, z) {
  if (!inBounds(x, z)) return;
  const i = idx(x, z);
  if (meshes[i]) { tileGroup.remove(meshes[i]); meshes[i] = null; }
  swayTiles.delete(i);
  const t = state.tiles[i];
  if (!t) return;

  const g = new THREE.Group();
  const ty = tileY(x, z);
  g.position.set(x - N / 2 + 0.5, ty, z - N / 2 + 0.5);
  swayList = [];
  const r = hash(x, z);

  // ฐานรองใต้ช่อง ปิดช่องว่างบนพื้นลาด / เสาสะพานเมื่ออยู่เหนือน้ำ
  if (tileIsWater[i]) {
    put(g, boxGeo, M.concrete, 0, -0.06, 0, 0.98, 0.12, 0.98); // พื้นสะพาน
    const pl = ty + 0.5; // เสาลงถึงท้องน้ำ
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) put(g, cylGeo, M.concrete, sx * 0.38, -pl / 2, sz * 0.38, 0.1, pl, 0.1);
  } else {
    const ph = Math.max(0.06, ty - tileMinH[i] + 0.08);
    put(g, boxGeo, M.plinth, 0, -ph / 2 + 0.005, 0, 0.99, ph, 0.99);
  }
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
    // ไฟจราจร + ทางม้าลายที่ทางแยก, เส้นหยุดและป้ายบนถนนที่ติดทางแยก
    if (isJunction(x, z)) {
      addCrosswalks(g, x, z);
      addSignalHeads(g, x, z, details);
    } else {
      addStopLines(g, x, z);
      if (details >= 1) addRoadSigns(g, x, z, r, r2);
    }
  } else if (t.t === 'water') {
    put(g, boxGeo, M.walk, 0, 0.015, 0, 0.96, 0.03, 0.96);
    const bg = new THREE.Group();
    bg.rotation.y = facing(x, z, r);
    g.add(bg);
    buildVariant(bg, 'water', t.v || DEFAULT_V.water, r, r2);
  } else if (t.t === 'service') {
    put(g, boxGeo, M.walk, 0, 0.015, 0, 0.96, 0.03, 0.96);
    const bg = new THREE.Group();
    bg.rotation.y = facing(x, z, r);
    g.add(bg);
    buildVariant(bg, 'service', t.v || DEFAULT_V.service, r, r2);
  } else if (ZONES.includes(t.t) && fixedVariant(t)) {
    put(g, boxGeo, M.walk, 0, 0.015, 0, 0.96, 0.03, 0.96);
    const bg = new THREE.Group();
    bg.rotation.y = facing(x, z, r);
    g.add(bg);
    buildVariant(bg, t.t, t.v, r, r2);
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
    const pm = (t.v && t.v !== 'gas') ? null : getModel('power', 0, r);
    if (pm) {
      const c = pm.clone(true);
      c.position.set(0, 0.03, 0);
      c.rotation.y = rot() + MODEL_YAW_OFFSET;
      g.add(c);
    } else {
      const bg = new THREE.Group();
      bg.rotation.y = rot();
      g.add(bg);
      buildVariant(bg, 'power', t.v || DEFAULT_V.power, r, r2);
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
  if (swayList.length) swayTiles.set(i, swayList);
  swayList = null;
}

function refresh(x, z) {
  agents.invalidate();
  buildTile(x, z);
  // สร้างช่องรอบๆ ใหม่ด้วย: ถนนต่อกัน, อาคารหันหน้าเข้าหาถนน, ทางแยกเกิดใหม่ (ไฟ ทางม้าลาย เส้นหยุด)
  // ระยะ 2 ช่อง เพราะเส้นหยุด/ป้ายอยู่บนช่องที่ติดกับทางแยก
  for (let dz = -2; dz <= 2; dz++) {
    for (let dx = -2; dx <= 2; dx++) {
      if ((dx === 0 && dz === 0) || Math.abs(dx) + Math.abs(dz) > 2) continue;
      buildTile(x + dx, z + dz);
    }
  }
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

// ราคาจริง: ถนนบนน้ำ = สะพานแพงกว่า
function buildCost(tool, x, z) {
  if (tool === 'road' && isWaterTile(x, z)) return 40;
  return toolCost(tool);
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
  const cost2 = buildCost(currentTool, x, z);
  if (isWaterTile(x, z) && currentTool !== 'road') return toast('สร้างบนน้ำไม่ได้ (ทำได้แค่สะพาน)');
  const CV = VARIANTS[currentTool] && currentVar[currentTool];
  if (CV && CV !== 'zone' && ['res', 'com', 'service'].includes(currentTool) && !adjRoad(x, z)) return toast('อาคารนี้ต้องตั้งติดถนน');
  if (currentTool === 'water' && !nearWater(x, z, 3)) return toast('โรงประปาต้องอยู่ใกล้แม่น้ำหรือทะเล (ภายใน 3 ช่อง)');
  if (state.money < cost2) return toast('เงินไม่พอ');
  state.money -= cost2;
  state.tiles[i] = VARIANTS[currentTool] ? { t: currentTool, lv: 0, v: currentVar[currentTool] } : { t: currentTool, lv: 0 };
  refresh(x, z);
  updateHUD();
}

// ---------------------------------------------------------------
// ระบบจำลองเมือง
// ---------------------------------------------------------------
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const adjRoad = (x, z) => isType(x + 1, z, 'road') || isType(x - 1, z, 'road') || isType(x, z + 1, 'road') || isType(x, z - 1, 'road');

function computeStats() {
  const s = {
    pop: 0, jobsCom: 0, jobsInd: 0, powerCap: 0, powerUse: 0, waterCap: 0, waterUse: 0,
    roads: 0, bridges: 0, parks: 0, plants: 0, wplants: 0, comLv: 0, indLv: 0, junctions: 0, upkeep: 0,
  };
  state.tiles.forEach((t, i) => {
    if (!t) return;
    const lv = t.lv || 0;
    const FV = (t.t === 'res' || t.t === 'com' || t.t === 'service') ? fixedVariant(t) : null;
    if (FV) {
      if (t.t === 'res') s.pop += FV.pop; else s.jobsCom += FV.jobs;
      s.powerUse += FV.power; s.waterUse += FV.water; s.upkeep += FV.upkeep || 0;
      return;
    }
    if (t.t === 'res') { s.pop += POP_PER[lv]; s.powerUse += POWER_USE.res[lv]; s.waterUse += WATER_USE.res[lv]; }
    else if (t.t === 'com') { s.jobsCom += JOBS_COM[lv]; s.powerUse += POWER_USE.com[lv]; s.waterUse += WATER_USE.com[lv]; s.comLv += lv; }
    else if (t.t === 'ind') { s.jobsInd += JOBS_IND[lv]; s.powerUse += POWER_USE.ind[lv]; s.waterUse += WATER_USE.ind[lv]; s.indLv += lv; }
    else if (t.t === 'road') { s.roads++; if (tileIsWater[i]) s.bridges++; if (isJunction(i % N, Math.floor(i / N))) s.junctions++; }
    else if (t.t === 'park') { s.parks++; s.waterUse += 1; }
    else if (t.t === 'power') { const V = variantOf(t); s.plants++; s.powerCap += V.cap; s.upkeep += V.upkeep; }
    else if (t.t === 'water') { const V = variantOf(t); s.wplants++; s.waterCap += V.cap * (1 + 0.15 * weather.state.rain); s.upkeep += V.upkeep; } // ฝนตก น้ำดิบมากขึ้น
  });
  // อากาศร้อนคนใช้น้ำมากขึ้น ฝนตกใช้น้อยลง
  s.waterUse = Math.round(s.waterUse * clamp(1 + (tempC - 30) * 0.02 - 0.15 * weather.state.rain, 0.7, 1.3));
  s.waterCap = Math.round(s.waterCap);
  s.jobs = s.jobsCom + s.jobsInd;
  s.income = s.pop * 0.45 + s.jobsCom * 0.9 + s.jobsInd * 0.8;
  s.expense = s.roads * 0.5 + s.bridges * 1.5 + s.upkeep + s.parks * 2 + s.junctions * 0.5;
  s.net = s.income - s.expense;
  const workD = clamp((s.pop + 20 - s.jobs) / 90, 0, 1);
  s.demand = {
    res: clamp((s.jobs + 25 - s.pop) / 90, 0, 1),
    com: workD,
    ind: workD * 0.8,
  };
  return s;
}

function tick() {
  const s = computeStats();
  const powered = s.powerCap > s.powerUse;
  const watered = s.waterCap > s.waterUse;

  // ช่องที่อยู่ใกล้สวน (รัศมี 3) โตเร็วขึ้น
  const nearPark = new Set();
  state.tiles.forEach((t, i) => {
    if (t?.t !== 'park' && t?.t !== 'service') return;
    const px = i % N, pz = Math.floor(i / N);
    for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) {
      if (inBounds(px + dx, pz + dz)) nearPark.add(idx(px + dx, pz + dz));
    }
  });

  for (let z = 0; z < N; z++) {
    for (let x = 0; x < N; x++) {
      const i = idx(x, z);
      const t = state.tiles[i];
      if (!t || !ZONES.includes(t.t) || fixedVariant(t)) continue;

      if (!adjRoad(x, z)) {
        if (t.lv > 0) { t.lv = 0; buildTile(x, z); }
        continue;
      }
      if (!powered || !watered || t.lv >= 3) continue;

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
  const hasZone = state.tiles.some(t => t && ZONES.includes(t.t));
  const pw = $('power');
  pw.textContent = `${s.powerUse}/${s.powerCap}`;
  pw.classList.toggle('bad', s.powerUse >= s.powerCap && (s.powerUse > 0 || hasZone));
  const wt = $('water');
  wt.textContent = `${s.waterUse}/${s.waterCap}`;
  wt.classList.toggle('bad', s.waterUse >= s.waterCap && (s.waterUse > 0 || hasZone));
  const net = $('net');
  net.textContent = (s.net >= 0 ? '+' : '') + s.net.toFixed(1);
  net.classList.toggle('bad', s.net < 0);
  $('day').textContent = state.day;
  $('dR').style.height = s.demand.res * 100 + '%';
  $('dC').style.height = s.demand.com * 100 + '%';
  $('dI').style.height = s.demand.ind * 100 + '%';
}

// แถบเครื่องมือ (เอาเมาส์ชี้ปุ่มที่มีตัวเลือกย่อยจะมีเมนูเด้งขึ้นมา)
const toolbar = $('toolbar');
const toolBtns = {};
const toolSmall = {};
const keyLabel = n => (n + 1) % 10;
function refreshToolSmall(k) {
  const n = TOOL_KEYS.indexOf(k);
  const V = VARIANTS[k]?.find(v => v.k === currentVar[k]);
  const c = V ? V.cost : TOOLS[k].cost;
  toolSmall[k].textContent = `${c ? '$' + c : 'ฟรี'} · ${keyLabel(n)}`;
  const lbl = toolBtns[k].querySelector('.lbl');
  lbl.textContent = V && V.k !== 'zone' && VARIANTS[k].length > 1 ? V.label.replace(/ \(.*\)/, '') : TOOLS[k].label;
}
TOOL_KEYS.forEach((k, n) => {
  const b = document.createElement('button');
  b.className = 'tool';
  b.title = VARIANTS[k] ? '' : TOOLS[k].tip;
  b.innerHTML = `<span class="ico">${ICON[k] || ICON.com}</span><span class="lbl">${TOOLS[k].label}</span><small></small>`;
  b.onclick = () => selectTool(k);
  toolbar.appendChild(b);
  toolBtns[k] = b;
  toolSmall[k] = b.querySelector('small');
  refreshToolSmall(k);
  if (VARIANTS[k]) {
    b.addEventListener('mouseenter', () => showFly(k));
    b.addEventListener('mouseleave', () => hideFly());
  }
});

const fly = document.createElement('div');
fly.id = 'fly';
document.body.appendChild(fly);
let flyTool = null, flyTimer = 0;
function variantStats(v) {
  const p = [];
  if (v.pop) p.push(`อยู่ได้ ${v.pop} คน`);
  if (v.jobs) p.push(`งาน ${v.jobs}`);
  if (v.cap) p.push(`ผลิต ${v.cap}`);
  if (v.power || v.water) p.push(`ใช้ไฟ ${v.power} · น้ำ ${v.water}`);
  if (v.upkeep) p.push(`ดูแล $${v.upkeep}/วัน`);
  return (p.join(' · ') || '') + (v.note ? (p.length ? ' — ' : '') + v.note : '');
}
function showFly(k) {
  clearTimeout(flyTimer);
  if (flyTool !== k || !fly.classList.contains('show')) {
    flyTool = k;
    fly.innerHTML = `<div class="ft">${TOOLS[k].label}</div>` + VARIANTS[k].map(v =>
      `<button class="fi${currentVar[k] === v.k ? ' on' : ''}" data-k="${v.k}"><span class="fn">${v.label}</span><span class="fc">$${v.cost.toLocaleString()}</span><span class="fs">${variantStats(v)}</span></button>`
    ).join('');
  }
  const r = toolBtns[k].getBoundingClientRect();
  fly.style.left = Math.max(8, Math.min(window.innerWidth - 308, r.left + r.width / 2 - 150)) + 'px';
  fly.style.bottom = (window.innerHeight - r.top + 6) + 'px';
  fly.classList.add('show');
}
function hideFly(delay = 180) {
  clearTimeout(flyTimer);
  flyTimer = setTimeout(() => fly.classList.remove('show'), delay);
}
fly.addEventListener('mouseenter', () => clearTimeout(flyTimer));
fly.addEventListener('mouseleave', () => hideFly());
fly.addEventListener('click', e => {
  const it = e.target.closest('.fi');
  if (!it || !flyTool) return;
  currentVar[flyTool] = it.dataset.k;
  refreshToolSmall(flyTool);
  selectTool(flyTool);
  fly.classList.remove('show');
});
document.addEventListener('pointerdown', e => { if (!fly.contains(e.target) && !toolbar.contains(e.target)) fly.classList.remove('show'); });
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
  seedStarterCity();
  for (let i = 0; i < N * N; i++) { if (meshes[i]) { tileGroup.remove(meshes[i]); meshes[i] = null; } }
  swayTiles.clear();
  agents.clear();
  agents.invalidate();
  rebuildAll();
  save();
  updateHUD();
};
window.addEventListener('keydown', e => {
  const n = parseInt(e.key, 10);
  if (n >= 1 && n <= 9 && n <= TOOL_KEYS.length) selectTool(TOOL_KEYS[n - 1]);
  if (e.key === '0') selectTool('bulldoze');
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
  // พื้นสูงต่ำ: เริ่มจากระนาบแล้วปรับตามความสูงช่องที่ชี้ ซ้ำ 4 รอบให้เข้าใกล้ตำแหน่งจริง
  let y = 0.3, x = 0, z = 0;
  for (let k = 0; k < 4; k++) {
    plane.constant = -y;
    if (!raycaster.ray.intersectPlane(plane, hit)) return null;
    x = Math.floor(hit.x + N / 2);
    z = Math.floor(hit.z + N / 2);
    if (!inBounds(x, z)) return null;
    y = tileY(x, z) + 0.05;
  }
  return { x, z };
}

function updateHover(e) {
  hoverTile = pickTile(e);
  if (!hoverTile || currentTool === 'select') { hoverMesh.visible = false; return; }
  const { x, z } = hoverTile;
  hoverMesh.visible = true;
  hoverMesh.position.set(x - N / 2 + 0.5, tileY(x, z) + 0.1, z - N / 2 + 0.5);
  const cur = tileAt(x, z);
  const wOk = isWaterTile(x, z) ? currentTool === 'road' : true;
  const ok = currentTool === 'bulldoze' ? !!cur : !cur && wOk && state.money >= buildCost(currentTool, x, z);
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
  trackpad: 'ลากสองนิ้ว = เลื่อนแผนที่<br>หนีบนิ้ว (pinch) = ซูม<br>Alt/Option + ลากสองนิ้ว = หมุน<br>คลิก/ลากนิ้วเดียว = สร้าง<br>1–9 เลือกเครื่องมือ, Esc ยกเลิก, Space หยุด',
  mouse: 'ซ้าย (ลาก) = สร้าง<br>ขวา (ลาก) = หมุนกล้อง<br>ล้อเมาส์ = ซูม, ลูกศร = เลื่อน<br>1–9 เลือกเครื่องมือ, Esc ยกเลิก, Space หยุด',
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
  forest.setCount(q.forest);
  weather.setRainCap(q.rain);
  lastTargetsAt = 0; // คำนวณจำนวนรถ/คนใหม่ทันที

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
let lastTargetsAt = 0;   // นับถอยหลังถึงรอบคำนวณจำนวนรถ/คน/สัตว์ครั้งถัดไป
let swayClock = 0;
mountIcons();

// ปุ่มเลือกสภาพอากาศ (อัตโนมัติ / แจ่มใส / เมฆ / ฝน / พายุ)
document.querySelectorAll('#wSeg button').forEach(b => {
  b.onclick = () => {
    weather.setMode(b.dataset.w);
    document.querySelectorAll('#wSeg button').forEach(x => x.classList.toggle('active', x === b));
  };
});

// ซ่อน/แสดง UI ทั้งหมด เพื่อดูภาพเมืองเต็มจอ (ปุ่มตา มุมขวาบน หรือกด H)
let uiHidden = false;
function setUiHidden(h) {
  uiHidden = h;
  document.body.classList.toggle('ui-hidden', h);
  const b = $('uiToggle');
  b.innerHTML = h ? ICON.eye : ICON.eyeOff;
  b.title = h ? 'แสดง UI (H)' : 'ซ่อน UI (H)';
}
$('uiToggle').onclick = () => setUiHidden(!uiHidden);
window.addEventListener('keydown', e => {
  if (e.key === 'h' || e.key === 'H') setUiHidden(!uiHidden);
});
setUiHidden(false);
// เลื่อนเก็บแผงข้าง / แถบเครื่องมือ
{
  const wire = (tabId, panelId, openCh, closeCh) => {
    const tab = $(tabId), panel = $(panelId);
    tab.onclick = () => {
      const c = panel.classList.toggle('closed');
      tab.classList.toggle('closed', c);
      tab.textContent = c ? openCh : closeCh;
    };
  };
  wire('sideTab', 'side', '‹', '›');
  wire('toolTab', 'toolbar', '⌃', '⌄');
}

// จำนวนรถ/คน/สัตว์ตามประชากรจริง และช่วงเวลา: เช้า-เย็นรถเยอะ, กลางคืนเงียบ, ฝนตกคนเดินน้อยลง
function updateAgentTargets() {
  const s = computeStats();
  const q = QUALITY[qualityKey];
  const W = weather.state;
  const h = tod * 24;
  const bump = (c, w) => Math.exp(-(((h - c) / w) ** 2));
  const sm = THREE.MathUtils.smoothstep;
  const rush = 1 + 0.9 * bump(8, 1.3) + 0.9 * bump(17.5, 1.6);
  const awake = 0.12 + 0.88 * (sm(h, 5, 8) - sm(h, 21.5, 24));
  const rainy = 1 - 0.7 * W.rain;

  const cars = (s.pop * 0.1 + s.jobsCom * 0.07 + s.jobsInd * 0.1 + Math.min(6, s.roads * 0.12)) * rush * (0.25 + 0.75 * awake);
  const people = (s.pop * 0.16 + s.jobs * 0.04 + s.parks * 1.5 + Math.min(4, s.roads * 0.08)) * awake * rainy;
  const dogs = s.pop * 0.02 * (0.4 + 0.6 * awake) * rainy;
  const cats = s.pop * 0.015 * (0.4 + 0.6 * awake) * (1 - 0.5 * W.rain);
  agents.setTargets({
    car: Math.min(Math.round(cars), q.cars),
    person: Math.min(Math.round(people), q.people),
    dog: Math.min(Math.round(dogs), Math.ceil(q.pets * 0.55)),
    cat: Math.min(Math.round(cats), Math.floor(q.pets * 0.45)),
  });
}

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
const FRAME_MS = 1000 / 144; // จำกัดสูงสุด 144 FPS
function loop(now) {
  if (now - last < FRAME_MS - 1) { requestAnimationFrame(loop); return; }
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;

  if (speed > 0) {
    acc += dt * speed;
    while (acc >= 1) { acc -= 1; tick(); }
  }
  saveAcc += dt;
  if (saveAcc > 5) { saveAcc = 0; save(); }

  weather.update(dt);
  const night = updateSky(dt);

  // ไฟจราจรเดินตามความเร็วเกม
  sigClock += dt * speed;
  updateSignalLamps();

  lastTargetsAt -= dt;
  if (lastTargetsAt <= 0) { lastTargetsAt = 1; updateAgentTargets(); }
  agents.update(dt, night, speed, { rain: weather.state.rain, dark: lampLevel });

  // ลม: ต้นไม้โยก, คลื่นน้ำไหลตามทิศลม
  const W = weather.state;
  swayClock += dt;
  const sw1 = swayClock * (1.3 + W.wind * 2.2), sw2 = swayClock * 1.1;
  const swA = 0.015 + 0.09 * W.wind, swB = 0.01 + 0.05 * W.wind;
  for (const arr of swayTiles.values()) {
    for (const s of arr) {
      s.obj.rotation.z = Math.sin(sw1 + s.ph) * swA * s.k;
      s.obj.rotation.x = Math.cos(sw2 + s.ph) * swB * s.k;
    }
  }
  const wvec = weather.windVec();
  wildlife.update(dt, { night: nightLevel, rain: W.rain, wind: wvec, windMag: W.wind });
  waterTime.value += dt * (1 + W.wind * 1.5);
  waterTex.offset.x = (waterTex.offset.x + wvec.x * dt * 0.03 * (1 + W.wind * 3)) % 1;
  waterTex.offset.y = (waterTex.offset.y + wvec.z * dt * 0.03 * (1 + W.wind * 3)) % 1;

  // จำกัดไม่ให้กล้องเลื่อนออกนอกแผนที่มากเกินไป
  controls.target.x = clamp(controls.target.x, -N / 2, N / 2);
  controls.target.z = clamp(controls.target.z, -N / 2, N / 2);
  controls.target.y = 0.4;

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
    const c = agents.counts();
    $('fps').textContent = `FPS ${Math.round(fpsFrames / fpsTime)}` + (gpuName ? ` · ${gpuName}` : '');
    $('live').textContent = `รถ ${c.car} · คน ${c.person} · หมา ${c.dog} · แมว ${c.cat}`;
    // นาฬิกา สภาพอากาศ อุณหภูมิ ลม
    $('clock').textContent = clockText();
    $('wxIcon').innerHTML = ICON[weather.iconKey()];
    $('wxText').textContent = weather.label();
    $('temp').textContent = Math.round(tempC) + '°C';
    $('windv').textContent = 'ลม ' + Math.round(8 + W.wind * 42) + ' กม./ชม.';
    fpsFrames = 0; fpsTime = 0;
  }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
window.addEventListener('beforeunload', save);
