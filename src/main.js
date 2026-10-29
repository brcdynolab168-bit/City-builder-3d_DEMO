import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { createAgents } from './agents.js';
import { createWeather } from './weather.js';
import { createWildlife } from './wildlife.js';
import { VEH_RE, STATION_RE, addVehicleModel, addStationModel, pickStation, vehicleCount } from './vehicles.js';
import { ICON, mountIcons } from './icons.js';
import { createMinimap } from './minimap.js';
import { createDrag } from './dragrace.js';
import { blob, broadleafCrown, coniferCrown, trunkGeo } from './trees.js';
import { terrainH, terrainColor, fbm, hash2, SEA_Y, WATER_LIMIT, setMap, mapHasRiver } from './terrain.js';
import { t, hasKey, setLang, getLang, onLang, LANGS } from './i18n.js';
import * as Saves from './saves.js';
import { createAudio } from './audio.js';
import { createMenu } from './menu.js';
import { createBig, FOOT } from './big.js';
import { createSky, periodKey } from './sky.js';
import { createNews, demographics, needs as calcNeeds, PAGES, pickOf } from './civic.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// ---------------------------------------------------------------
// เริ่มเกม: อ่านช่องเซฟที่ใช้อยู่ แล้วเลือกแผนที่ก่อนสร้างภูมิประเทศ
// ---------------------------------------------------------------
Saves.migrateOld();
const AUTOSTART = Saves.takeAutoStart();
let activeId = Saves.getActiveId() || Saves.listSlots()[0]?.id || null;
if (activeId) Saves.setActive(activeId);
const MAP_ID = (activeId && Saves.getSlot(activeId)?.map) || 'river';
setMap(MAP_ID);
const audio = createAudio();
const ECON = 10; // 1 วันในเกมเท่ากับรายได้/รายจ่าย 10 หน่วยของตัวเลขสถิติ

// ---------------------------------------------------------------
// ค่าตั้งต้น / เครื่องมือ
// ---------------------------------------------------------------
const N = 48; // ขนาดแผนที่ N x N ช่อง
const START_MONEY = 20000;
const DAY_LENGTH_SEC = 300; // 1 วันในเกม = 5 นาทีจริง (ที่ความเร็ว 1x) ทั้งท้องฟ้า เงิน และตัวนับวันเดินพร้อมกัน
const BRIDGE_Y = 1.0;       // ความสูงพื้นสะพาน

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
  farm:     { label: 'ฟาร์ม',           cost: 300, tip: 'นา ไร่ ฟาร์มปศุสัตว์ สวนผลไม้ (ไม่ต้องติดถนน)' },
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
    { k: 'mall',  label: 'ห้างสรรพสินค้า',   cost: 2400, jobs: 100, power: 30, water: 22, note: '3×2 ช่อง' },
    { k: 'market',  label: 'ตลาด',            cost: 700,  jobs: 26, power: 4, water: 8, note: '2×2 ช่อง' },
    { k: 'dealer',  label: 'ร้านขายรถ',        cost: 900,  jobs: 18, power: 6, water: 3, note: '2×1 ช่อง' },
    { k: 'bank',    label: 'ธนาคาร',           cost: 900,  jobs: 22, power: 6, water: 3, tax: 16, note: '1×1 ช่อง ระวังโจร' },
    { k: 'gold',    label: 'ร้านทอง',          cost: 550,  jobs: 8, power: 3, water: 1, tax: 8, note: 'ร้านทองเยาวราช (ระวังโจร)' },
    { k: 'fishing', label: 'ร้านอุปกรณ์ตกปลา', cost: 240,  jobs: 5, power: 2, water: 1 },
    { k: 'pub',     label: 'สถานบันเทิง',      cost: 1300, jobs: 28, power: 12, water: 5, tax: 20, note: '2×1 ช่อง กลางคืนคึกคัก ระวังเมาแล้วขับ' },
    { k: 'tuner',   label: 'ร้านแต่งรถ',       cost: 850,  jobs: 12, power: 6, water: 2, tax: 9, note: '2×1 ช่อง รถซิ่งมารวมตัว' },
  ],
  park: [
    { k: 'park',   label: 'สวนเล็ก',          cost: 50,   upkeep: 1 },
    { k: 'play',   label: 'สนามเด็กเล่น',     cost: 180,  upkeep: 3 },
    { k: 'flowers', label: 'สวนดอกไม้',        cost: 90,   upkeep: 2 },
    { k: 'forest', label: 'สวนป่าเล็ก',        cost: 80,   upkeep: 1 },
    { k: 'fountain', label: 'น้ำพุเล็ก',        cost: 150,  upkeep: 2 },
    { k: 'pond',   label: 'สระบัว',            cost: 140,  upkeep: 2 },
    { k: 'pavilion', label: 'ศาลาในสวน',       cost: 160,  upkeep: 2 },
    { k: 'zen',    label: 'สวนหินญี่ปุ่น',      cost: 170,  upkeep: 2 },
    { k: 'picnic', label: 'ลานปิกนิก',         cost: 120,  upkeep: 2 },
    { k: 'basket', label: 'สนามบาสเก็ตบอล',   cost: 200,  upkeep: 3 },
    { k: 'fitness', label: 'ลานออกกำลังกาย',   cost: 190,  upkeep: 3 },
    { k: 'dog',    label: 'สวนสุนัข',           cost: 130,  upkeep: 2 },
    { k: 'plaza',  label: 'ลานน้ำพุ',          cost: 420,  upkeep: 6 },
    { k: 'sports', label: 'สนามกีฬา',          cost: 650,  upkeep: 9, jobs: 4 },
    { k: 'garden', label: 'สวนพฤกษศาสตร์',     cost: 1300, upkeep: 16, jobs: 8 },
  ],
  farm: [
    { k: 'rice',    label: 'นาข้าว',           cost: 300, jobs: 8,  power: 1, water: 6, upkeep: 2 },
    { k: 'crop',    label: 'ไร่ผักและโรงเรือน', cost: 380, jobs: 10, power: 2, water: 7, upkeep: 3 },
    { k: 'orchard', label: 'สวนผลไม้',         cost: 420, jobs: 9,  power: 1, water: 6, upkeep: 3 },
    { k: 'barn',    label: 'ฟาร์มปศุสัตว์',     cost: 650, jobs: 16, power: 3, water: 10, upkeep: 5 },
  ],
  power: [
    { k: 'solar',   label: 'โซลาร์ฟาร์ม (เล็ก)',  cost: 220,  cap: 150, upkeep: 4 },
    { k: 'gas',     label: 'โรงไฟฟ้าก๊าซ (กลาง)', cost: 500,  cap: 450, upkeep: 14 },
    { k: 'thermal', label: 'โรงไฟฟ้าใหญ่',        cost: 1150, cap: 1200, upkeep: 30 },
  ],
  water: [
    { k: 'pump',  label: 'สถานีสูบน้ำ (เล็ก)',  cost: 200, cap: 200, upkeep: 5 },
    { k: 'plant', label: 'โรงประปา (กลาง)',     cost: 400, cap: 500, upkeep: 11 },
    { k: 'big',   label: 'โรงประปาใหญ่',         cost: 850, cap: 1300, upkeep: 24 },
  ],
  service: [
    { k: 'school',   label: 'โรงเรียนรัฐ',   cost: 1100, jobs: 26, power: 6,  water: 6,  upkeep: 12, note: 'บ้านรอบๆโตเร็วขึ้น' },
    { k: 'school_p', label: 'โรงเรียนเอกชน', cost: 1800, jobs: 34, power: 8, water: 8, upkeep: 6, tax: 22, note: '3×2 ช่อง ค่าเทอมสร้างภาษี' },
    { k: 'hospital', label: 'โรงพยาบาลรัฐ',  cost: 1500, jobs: 60, power: 18, water: 15, upkeep: 26, note: 'บ้านรอบๆโตเร็วขึ้น' },
    { k: 'hospital_p', label: 'โรงพยาบาลเอกชน', cost: 2600, jobs: 70, power: 20, water: 16, upkeep: 10, tax: 38, note: '2×2 ช่อง ค่ารักษาสร้างภาษี' },
    { k: 'bu',       label: 'ม.กรุงเทพ',      cost: 3800, jobs: 130, power: 26, water: 22, upkeep: 45, note: 'มหาวิทยาลัย 3×3 ช่อง' },
    { k: 'police',   label: 'สถานีตำรวจ',     cost: 1000, jobs: 22, power: 8, water: 6, upkeep: 18, note: '2×2 ช่อง ลดอาชญากรรม/อุบัติเหตุ' },
    { k: 'fire',     label: 'สถานีดับเพลิง',  cost: 1100, jobs: 26, power: 8, water: 8, upkeep: 20, note: '2×2 ช่อง ดับไฟไหม้ไว' },
    { k: 'bus',      label: 'อู่รถเมล์',       cost: 1400, jobs: 30, power: 6, water: 6, upkeep: 20, tax: 12, note: '3×2 ช่อง มีรถเมล์วิ่ง ลดรถติด' },
    { k: 'taxi',     label: 'อู่แท็กซี่',      cost: 800,  jobs: 14, power: 3, water: 3, upkeep: 8, tax: 10, note: '2×2 ช่อง มีแท็กซี่วิ่ง' },
    { k: 'grab',     label: 'จุดรวมแกร็บ',    cost: 600,  jobs: 10, power: 3, water: 2, upkeep: 6, tax: 8, note: '2×1 ช่อง รถและมอไซค์แกร็บ' },
    { k: 'temple',   label: 'วัด',            cost: 1200, jobs: 8, power: 3, water: 4, upkeep: 8, note: '3×3 ช่อง' },
    { k: 'church',   label: 'โบสถ์คริสต์',     cost: 900,  jobs: 6, power: 3, water: 3, upkeep: 6, note: '2×3 ช่อง' },
    { k: 'drag',     label: 'สนามแข่งรถคลอง 5', cost: 3200, jobs: 30, power: 14, water: 6, upkeep: 22, tax: 30, note: '3×7 ช่อง สนามแข่งถูกกฎหมาย ลดรถซิ่งบนถนน' },
    { k: 'mosque',   label: 'มัสยิด',          cost: 1200, jobs: 6, power: 3, water: 4, upkeep: 8, note: '3×3 ช่อง' },
  ],
};
const DEFAULT_V = { res: 'zone', com: 'zone', ind: 'zone', power: 'gas', water: 'plant', service: 'school', park: 'park', farm: 'rice' };
const currentVar = { ...DEFAULT_V };
const variantOf = t => VARIANTS[t.t]?.find(v => v.k === (t.v || DEFAULT_V[t.t]));
const fixedVariant = t => { const v = variantOf(t); return v && v.k !== 'zone' ? v : null; };
const toolCost = tool => VARIANTS[tool]?.find(v => v.k === currentVar[tool])?.cost ?? TOOLS[tool].cost;
const ZONES = ['res', 'com', 'ind'];
const toolLabel = k => t('tool.' + k);
const toolTip = k => (hasKey('tip.' + k) ? t('tip.' + k) : '');
const vLabel = (tool, v) => t(`v.${tool}.${v.k}`);
const vNote = (tool, v) => (hasKey(`v.${tool}.${v.k}.note`) ? t(`v.${tool}.${v.k}.note`) : '');

// ตารางตามระดับตึก (ดัชนี = เลเวล 0..3): คน / งาน / ไฟ / น้ำ ต่อช่อง
const POP_PER  = [0, 5, 28, 80];   // บ้านเดี่ยว → อพาร์ตเมนต์ → คอนโดสูง
const JOBS_COM = [0, 6, 20, 60];
const JOBS_IND = [0, 10, 28, 70];
const TAX_GROUP = { pub: 'leisure', tuner: 'leisure', drag: 'leisure', bank: 'finance', gold: 'finance', hospital_p: 'health', school_p: 'edu', bus: 'transit', taxi: 'transit', grab: 'transit' };
const POWER_USE = { res: [0, 2, 6, 14], com: [0, 3, 8, 20], ind: [0, 4, 12, 30] };
const WATER_USE = { res: [0, 3, 9, 22], com: [0, 2, 6, 15], ind: [0, 4, 12, 28] };
const POWER_CAP = 200;
const WATER_CAP = 200;

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
// ความสูงพื้นสะพานคงที่ตลอดแนวแม่น้ำ ส่วนฝั่งดินที่อยู่ใกล้น้ำ (ภายใน RAMP_LEN ช่อง) ค่อยๆ ลาดขึ้นมาหาระดับสะพาน
// เหมือนทางลาดขึ้นสะพานจริง ไม่ให้ถนนโดดสูงทันที
const RAMP_LEN = 6;
const rampW = new Float32Array(N * N);
for (let z = 0; z < N; z++) {
  for (let x = 0; x < N; x++) {
    if (tileIsWater[z * N + x]) continue;
    let d = 99;
    for (let dz = -RAMP_LEN; dz <= RAMP_LEN; dz++) for (let dx = -RAMP_LEN; dx <= RAMP_LEN; dx++) {
      if (isWaterTile(x + dx, z + dz)) d = Math.min(d, Math.max(Math.abs(dx), Math.abs(dz)));
    }
    if (d <= RAMP_LEN) { const k = (RAMP_LEN + 1 - d) / RAMP_LEN; rampW[z * N + x] = k * k * (3 - 2 * k); }
  }
}
// ความสูงพื้นของช่อง (ใช้วางอาคาร ถนน และตัวละคร)
function tileY(x, z) {
  if (x < 0 || z < 0 || x >= N || z >= N) return 0;
  const i = z * N + x;
  if (tileIsWater[i]) return BRIDGE_Y;
  const h = tileMaxH[i], w = rampW[i];
  return w > 0 && BRIDGE_Y > h ? h + (BRIDGE_Y - h) * w : h;
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
  return { money: START_MONEY, day: 0, tod: 0.3, tiles: new Array(N * N).fill(null), stats: { acc: 0, inj: 0, dead: 0, fires: 0, crimes: 0 } };
}
const idx = (x, z) => z * N + x;
const inBounds = (x, z) => x >= 0 && z >= 0 && x < N && z < N;
const tileAt = (x, z) => (inBounds(x, z) ? state.tiles[idx(x, z)] : null);
const isType = (x, z, t) => tileAt(x, z)?.t === t;

function save() {
  if (!activeId) return;
  state.tod = tod;
  Saves.saveData(activeId, state, { day: state.day, pop: computeStats().pop, money: Math.floor(state.money) });
}
function load() {
  const data = activeId ? Saves.loadData(activeId) : null;
  if (data && Array.isArray(data.tiles) && data.tiles.length === N * N) {
    // ถ้ามีของที่ตกอยู่บนน้ำ (จากเซฟเก่า) ให้ลบทิ้ง ยกเว้นถนน (กลายเป็นสะพาน)
    data.tiles.forEach((tl, i) => { if (tl && tileIsWater[i] && tl.t !== 'road') data.tiles[i] = null; });
    data.tiles.forEach((tl, i) => { if (tl && tl.t === 'part' && (!data.tiles[tl.m] || data.tiles[tl.m].t === 'part')) data.tiles[i] = null; });
    state = data;
    if (typeof state.tod === 'number') tod = state.tod;
    return;
  }
  state = newState();   // เกมใหม่ = แผนที่ว่างเปล่า ไม่มีอะไรเลย
  tod = state.tod;
  save();
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
    for (let z = 1; z < N - 1; z++) for (let x = 1; x < N - 1; x++) {
      if (!flat(x, z) || state.tiles[idx(x, z)] || !ok(x, z)) continue;
      const d = Math.hypot(x - near.x, z - near.z);
      if (d < bd) { bd = d; best = { x, z }; }
    }
    if (best) { put(best.x, best.z, type); state.tiles[idx(best.x, best.z)].v = v; }
    return !!best;
  };
  const wp = T(-2, 3), pp = T(14, 4);
  place('water', (x, z) => nearWater(x, z, 3), wp, 'plant');
  place('water', (x, z) => nearWater(x, z, 3) && !isType(x, z, 'water') && Math.hypot(x - wp.x, z - wp.z) > 3, T(2, 3), 'plant');
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
renderer.shadowMap.autoUpdate = false; // อัปเดตเงาเป็นช่วงๆ (ดูใน loop) ลดภาระ GPU
let lastShadowAt = 0, baseRatio = 1, dynScale = 1, dynCool = 0;
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

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 560);
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
  rtx: {
    label: 'RTX', desc: 'RTX ON: เงาและแสงสมจริงสูงสุด (AO, ท้องฟ้า, แสงจันทร์, ไฟเรือง) กินการ์ดจอมาก',
    pixelRatio: 2, shadows: true, shadowSize: 4096, bloom: true, cars: 150, people: 160, pets: 40, details: 2,
    rain: 7000, forest: 4000, rtx: true,
  },
};
const settings = { quality: 'med', mode: 'trackpad', lang: 'th', master: 0.8, sfx: 0.8, music: 0.35, mute: false };
try { Object.assign(settings, JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}')); } catch {}
if (!QUALITY[settings.quality]) settings.quality = 'med';
if (settings.mode !== 'trackpad' && settings.mode !== 'mouse') settings.mode = 'trackpad';
if (!LANGS.some(l => l.id === settings.lang)) settings.lang = 'th';
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
const drag = createDrag({ scene, audio });
let dragKey = '', dragAt = null;
function syncDrag() {
  let found = null;
  state.tiles.forEach((tl, i) => { if (tl && tl.t === 'service' && tl.v === 'drag' && !tl.cs) found = [i, tl]; });
  const key = found ? found[0] + ':' + found[1].rot : '';
  if (key === dragKey) return;
  dragKey = key;
  if (!found) { dragAt = null; drag.setStrip(null); return; }
  const [i, tl] = found, x = i % N, z = Math.floor(i / N);
  dragAt = { x: x + Math.floor(tl.fw / 2), z: z + Math.floor(tl.fd / 2) };
  let base = -1e9; for (let dz = 0; dz < tl.fd; dz++) for (let dx = 0; dx < tl.fw; dx++) base = Math.max(base, tileY(x + dx, z + dz));
  drag.setStrip({ cx: x + tl.fw / 2 - N / 2, cz: z + tl.fd / 2 - N / 2, y: base + 0.06, rot: tl.rot || 0 });
}
const wildlife = createWildlife({ scene, blocked: bridgeAtX, boats: mapHasRiver() });
const agents = createAgents({
  scene, N,
  tileType: (x, z) => { const tl = tileAt(x, z); if (tl?.t === 'part') return state.tiles[tl.m]?.t === 'park' ? 'park' : 'part'; return tl?.t ?? null; },
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
const FONT = '"Leelawadee UI","Tahoma","Noto Sans Thai","Microsoft YaHei","PingFang SC","Noto Sans SC",sans-serif';
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
    return signMat('name' + getLang() + text, (g, w, h) => {
      g.fillStyle = '#0b6b3a'; g.fillRect(0, 0, w, h);
      g.strokeStyle = '#fff'; g.lineWidth = 4; g.strokeRect(4, 4, w - 8, h - 8);
      g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = `bold ${h * 0.42}px ${FONT}`;
      g.fillText(getLang() === 'th' ? 'ถ.' + text : getLang() === 'zh' ? text + ' ' + t('sign.road') : text + ' ' + t('sign.road'), w / 2, h / 2 + 3);
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

const skyBox = createSky(scene);
const moonLight = new THREE.DirectionalLight(0x9fb6ff, 0);
moonLight.position.set(-20, 30, -10);
scene.add(moonLight);
const C_HEMI_DAY = new THREE.Color(0xcfe6ff), C_HEMI_NIGHT = new THREE.Color(0x1b2747), C_HEMI_DUSK = new THREE.Color(0xe8b090);
const C_GR_DAY = new THREE.Color(0x6b7a5a), C_GR_NIGHT = new THREE.Color(0x10150f);
const sunTint = new THREE.Color();
let periodNow = 'morning';

function updateSky(dt) {
  const prevTod = tod;
  tod = (tod + dt / DAY_LENGTH_SEC) % 1;
  if (tod < prevTod && !menu.isOpen) state.day++; // ข้ามเที่ยงคืน = วันใหม่
  const W = weather.state;
  const hour = tod * 24;
  periodNow = periodKey(hour);
  const ang = (tod - 0.25) * Math.PI * 2;
  const elev = Math.sin(ang);
  sun.position.set(Math.cos(ang) * 40, Math.max(elev, 0.08) * 40 + 2, 16);
  const day = THREE.MathUtils.smoothstep(elev, -0.12, 0.28);

  // สีแสงอาทิตย์: ส้มแดงตอนเช้า/เย็น ขาวนวลตอนเที่ยง
  const kSun = THREE.MathUtils.smoothstep(elev, 0.0, 0.5);
  sunTint.setRGB(1, 0.5 + 0.47 * kSun, 0.26 + 0.66 * kSun);
  sun.color.copy(sunTint);

  // เมฆและฝนบังแสงอาทิตย์
  const dim = 1 - 0.55 * W.cloud - 0.2 * W.rain;
  sun.intensity = 2.3 * day * dim;
  const warm = THREE.MathUtils.clamp(1 - Math.abs(elev) / 0.3, 0, 1) * (1 - 0.7 * W.cloud);
  hemi.color.copy(C_HEMI_NIGHT).lerp(C_HEMI_DAY, day).lerp(C_HEMI_DUSK, warm * 0.45);
  hemi.groundColor.copy(C_GR_NIGHT).lerp(C_GR_DAY, day);
  hemi.intensity = (0.2 + 0.62 * day) * (1 + 0.15 * W.cloud) + W.flash * 2.5;
  scene.environmentIntensity = (0.14 + 0.43 * day) * (1 - 0.3 * W.cloud) + W.flash * 0.8;
  renderer.toneMappingExposure = 0.85 + 0.25 * day;

  // แสงจันทร์สีน้ำเงินอ่อน (สว่างเต็มดวงที่เที่ยงคืน)
  const nightK = 1 - day;
  moonLight.intensity = 0.34 * nightK * (1 - 0.6 * W.cloud) * (1 - 0.4 * W.rain);
  moonLight.position.set(-Math.cos(ang) * 40, Math.max(-elev, 0.15) * 40 + 4, -16);

  const sk = skyBox.update(hour, elev, ang, W, controls.target, sunTint);
  scene.background.copy(sk.horizon);
  scene.fog.color.copy(sk.horizon);
  scene.fog.near = 70 - 52 * W.rain;
  scene.fog.far = 170 - 80 * W.rain - 25 * W.cloud;

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
    { seed: 14, wall: '#4d6b5e', frame: '#25362f', glassTop: '#b4dccb', glassBot: '#6aa08c', mx: 0.05, my: 0.07, lit: 0.35, rough: 0.2, metal: 0.65, mullion: true },
    { seed: 15, wall: '#6a6f78', frame: '#30343a', glassTop: '#c4d4e4', glassBot: '#7b8ea4', mx: 0.05, my: 0.07, lit: 0.3, rough: 0.2, metal: 0.65, mullion: true },
  ],
  office: [
    { seed: 21, wall: '#bdb6a8', frame: '#8a8478', glassTop: '#7c9bb3', glassBot: '#4d6a82', mx: 0.16, my: 0.2, lit: 0.3, rough: 0.7, metal: 0.1, sill: true },
    { seed: 22, wall: '#d6d0c4', frame: '#9c968a', glassTop: '#86a4ba', glassBot: '#52708a', mx: 0.18, my: 0.2, lit: 0.3, rough: 0.7, metal: 0.1, sill: true },
    { seed: 23, wall: '#e9e3d3', frame: '#a6a090', glassTop: '#8fb0c6', glassBot: '#587690', mx: 0.17, my: 0.2, lit: 0.3, rough: 0.7, metal: 0.1, sill: true },
    { seed: 24, wall: '#c7b9a6', frame: '#7a6e5e', glassTop: '#7c9bb3', glassBot: '#4d6a82', mx: 0.16, my: 0.2, lit: 0.3, rough: 0.7, metal: 0.1, stripes: true },
  ],
  res: [
    { seed: 31, wall: '#ecdfc6', frame: '#f5f0e6', glassTop: '#7d9db5', glassBot: '#4f6f87', mx: 0.22, my: 0.2, lit: 0.4, rough: 0.9, metal: 0, sill: true },
    { seed: 32, wall: '#d9a58b', frame: '#f2e8de', glassTop: '#7d9db5', glassBot: '#4f6f87', mx: 0.22, my: 0.2, lit: 0.4, rough: 0.9, metal: 0, sill: true },
    { seed: 33, wall: '#cfd6d9', frame: '#8e979c', glassTop: '#8aa8bd', glassBot: '#557188', mx: 0.2, my: 0.18, lit: 0.45, rough: 0.8, metal: 0, sill: true },
    { seed: 34, wall: '#a65a45', frame: '#e8dccb', glassTop: '#7d9db5', glassBot: '#4f6f87', mx: 0.22, my: 0.2, lit: 0.4, rough: 0.9, metal: 0, stripes: true, sill: true },
    { seed: 35, wall: '#e8d8a8', frame: '#f5f0e6', glassTop: '#7d9db5', glassBot: '#4f6f87', mx: 0.22, my: 0.2, lit: 0.4, rough: 0.9, metal: 0, sill: true },
    { seed: 36, wall: '#b9c9a0', frame: '#f2e8de', glassTop: '#7d9db5', glassBot: '#4f6f87', mx: 0.22, my: 0.2, lit: 0.4, rough: 0.9, metal: 0, sill: true },
    { seed: 37, wall: '#e8c4c0', frame: '#f5f0e6', glassTop: '#7d9db5', glassBot: '#4f6f87', mx: 0.22, my: 0.2, lit: 0.4, rough: 0.9, metal: 0, stripes: true, sill: true },
    { seed: 38, wall: '#9fb8c8', frame: '#e8e8e8', glassTop: '#7d9db5', glassBot: '#4f6f87', mx: 0.2, my: 0.18, lit: 0.45, rough: 0.8, metal: 0, sill: true },
  ],
  ind: [
    { seed: 41, wall: '#9aa1a8', frame: '#4a5056', glassTop: '#6d7f8d', glassBot: '#3f4e59', mx: 0.3, my: 0.34, lit: 0.12, rough: 0.6, metal: 0.35, stripes: true },
    { seed: 42, wall: '#c9b27a', frame: '#5a5030', glassTop: '#6d7f8d', glassBot: '#3f4e59', mx: 0.3, my: 0.34, lit: 0.12, rough: 0.6, metal: 0.3, stripes: true },
    { seed: 43, wall: '#b5503c', frame: '#4a3a30', glassTop: '#6d7f8d', glassBot: '#3f4e59', mx: 0.3, my: 0.34, lit: 0.12, rough: 0.6, metal: 0.3, stripes: true },
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
    const sm = path.match(STATION_RE);
    if (sm) {
      jobs.push(loader.loadAsync(url).then(gltf => { addStationModel(sm[1].toLowerCase(), gltf.scene); ok++; })
        .catch(err => console.warn('โหลดโมเดลไม่สำเร็จ:', path, err)));
      continue;
    }
    const vm = path.match(VEH_RE);
    if (vm) {
      jobs.push(loader.loadAsync(url).then(gltf => { addVehicleModel(vm[1].toLowerCase(), gltf.scene); ok++; })
        .catch(err => console.warn('โหลดโมเดลไม่สำเร็จ:', path, err)));
      continue;
    }
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
const ROOFV = [0x9c4a3a, 0x5b6470, 0x3f6b4a, 0x7a5a3a, 0xb08d57, 0x8c3b3b, 0x34506e].map(c => std(c, { roughness: 0.8 }));
const pyrGeo = new THREE.ConeGeometry(0.7071, 1, 4);
pyrGeo.rotateY(Math.PI / 4);
const PAINT = [0xf3ead7, 0xe6c9a8, 0xcfe0d4, 0xd6dce8, 0xf0d98c, 0xe3a39a, 0xb9d3e0, 0xffffff].map(c => std(c, { roughness: 0.8 }));

// สร้างอาคารที่โตเองจากโซน: แต่ละตึกสุ่มรูปทรง ขนาด จำนวนชั้น สีผนัง สีหลังคา และส่วนประกอบ
// ให้ต่างกันไป (เมล็ดสุ่มมาจากตำแหน่งช่อง)
function buildZoneBuilding(bg, type, lv, r, r2) {
  const y0 = 0.03;
  const R = n => { const v = Math.sin((r * 12.9898 + r2 * 78.233 + n * 37.719 + lv * 5.31) * 43758.5453); return v - Math.floor(v); };
  const ox = (R(90) - 0.5) * 0.1, oz = (R(91) - 0.5) * 0.06;   // เยื้องตำแหน่งในช่องเล็กน้อย
  const inner = new THREE.Group();
  inner.position.set(ox, 0, oz);
  bg.add(inner);
  const g = inner; // วาดลงกลุ่มที่เยื้องแล้ว
  const roofM = pick(ROOFV, R(1));
  if (type === 'res') {
    const mats = pick(FM.res, R(2));
    if (lv === 1) {
      const kind = Math.floor(R(3) * 5);
      const w = 0.44 + R(4) * 0.2, d = 0.38 + R(5) * 0.16;
      const floors = R(6) < 0.35 ? 1 : 2;
      const top = block(g, w, floors, d, mats, 0, y0, 0);
      put(g, boxGeo, M.plinth, 0, y0 + 0.02, 0, w + 0.03, 0.04, d + 0.03);
      if (kind === 0) {                      // บ้านจั่ว ทรงไทยประยุกต์
        put(g, gableGeo(d + 0.08, w + 0.08, 0.14 + R(7) * 0.1), roofM, 0, top, 0, 1, 1, 1, Math.PI / 2);
        put(g, boxGeo, M.brick, w * 0.28, top + 0.1, 0.04, 0.07, 0.22, 0.07);
      } else if (kind === 1) {               // หลังคาปั้นหยา
        put(g, pyrGeo, roofM, 0, top + 0.09, 0, w + 0.1, 0.18, d + 0.1);
      } else if (kind === 2) {               // บ้านโมเดิร์นหลังคาแบน มีระเบียง
        roofCap(g, w, d, top);
        put(g, boxGeo, M.concrete, 0, y0 + FLOOR * 1.05, d / 2 + 0.04, w * 0.7, 0.014, 0.1);
        put(g, boxGeo, M.glassShop, w * 0.18, y0 + 0.08, d / 2 + 0.004, w * 0.4, 0.14, 0.01);
      } else if (kind === 3) {               // บ้านจั่วหันข้าง + ปีกต่อเติม
        put(g, gableGeo(w + 0.08, d + 0.08, 0.16), roofM, 0, top, 0, 1, 1, 1, 0);
        const wt = block(g, 0.24, 1, d * 0.8, mats, w / 2 + 0.1, y0, -0.02);
        put(g, boxGeo, roofM, w / 2 + 0.1, wt + 0.01, -0.02, 0.28, 0.02, d * 0.85);
      } else {                               // ทาวน์โฮมหลังคาเพิงหมาแหงน
        const rr = put(g, boxGeo, roofM, 0, top + 0.03, 0, w + 0.06, 0.025, d + 0.08);
        rr.rotation.x = 0.16 * (R(8) < 0.5 ? 1 : -1);
        put(g, boxGeo, M.brick, -w * 0.3, top + 0.1, -0.05, 0.06, 0.2, 0.06);
      }
      put(g, boxGeo, M.door, -w * 0.18, y0 + 0.07, d / 2 + 0.003, 0.08, 0.14, 0.01);
      put(g, boxGeo, M.concrete, -w * 0.18, y0 + 0.012, d / 2 + 0.05, 0.16, 0.024, 0.1);
      if (R(9) < 0.6) put(g, boxGeo, roofM, -w * 0.18, y0 + 0.175, d / 2 + 0.06, 0.2, 0.014, 0.13);
      if (R(10) < 0.5) put(g, boxGeo, M.concrete, 0, y0 + 0.06, d / 2 + 0.3, w + 0.1, 0.12, 0.01);   // รั้วหน้าบ้าน
      shrub(g, w * 0.2, d / 2 + 0.07, 0.12, 0); shrub(g, w * 0.4, d / 2 + 0.06, 0.1, 1); shrub(g, -w * 0.4, d / 2 + 0.07, 0.11, 2);
      if (R(11) < 0.35) addTree(g, -w / 2 - 0.1, 0.1, 0.9 + R(12) * 0.5, R(13));
      if (R(14) < 0.3) { put(g, boxGeo, M.asphalt, w / 2 + 0.05, y0 + 0.012, d / 2 + 0.1, 0.16, 0.01, 0.26); }  // ที่จอดรถ
    } else if (lv === 2) {
      const kind = Math.floor(R(3) * 4);
      const w = 0.6 + R(4) * 0.18, d = 0.5 + R(5) * 0.14;
      const fl = 3 + Math.floor(R(6) * 3);
      if (kind === 0) {                      // อพาร์ตเมนต์กล่องมีหลังคาแบน
        const top = block(g, w, fl, d, mats, 0, y0, 0);
        roofCap(g, w, d, top); trim(g, w, d, y0, top);
      } else if (kind === 1) {               // ส่วนบนร่น (setback)
        const t1 = block(g, w, fl - 1, d, mats, 0, y0, 0);
        const t2 = block(g, w * 0.7, 1, d * 0.8, mats, 0, t1, -0.03);
        roofCap(g, w * 0.7, d * 0.8, t2); trim(g, w, d, y0, t1);
        put(g, boxGeo, M.concrete, 0, t1 + 0.01, d / 2 - 0.05, w, 0.02, 0.12);
      } else if (kind === 2) {               // อาคารตัว L
        const t1 = block(g, w, fl, d * 0.5, mats, 0, y0, -d * 0.25);
        const t2 = block(g, w * 0.45, fl, d, mats, -w * 0.275, y0, 0);
        roofCap(g, w, d * 0.5, t1); roofCap(g, w * 0.45, d, t2);
        trim(g, w, d * 0.5, y0, t1, false);
      } else {                               // ตึกแถว/หลังคาจั่ว
        const top = block(g, w, fl - 1, d, mats, 0, y0, 0);
        put(g, gableGeo(d + 0.06, w + 0.06, 0.2), roofM, 0, top, 0, 1, 1, 1, Math.PI / 2);
        trim(g, w, d, y0, top);
      }
      for (let k = 0; k < 2; k++) if (R(20 + k) < 0.7) put(g, boxGeo, M.concrete, (k ? 1 : -1) * w * 0.28, y0 + FLOOR * 2.05, d / 2 + 0.04, 0.2, 0.014, 0.09);  // ระเบียง
      shrub(g, -0.28, d / 2 + 0.07, 0.12, 1); shrub(g, 0.28, d / 2 + 0.07, 0.12, 3);
    } else {
      const kind = Math.floor(R(3) * 4);
      const w = 0.6 + R(4) * 0.14, d = 0.6 + R(5) * 0.14;
      const fl = 6 + Math.floor(R(6) * 5);
      if (kind === 0) {                      // คอนโดเดี่ยว
        const top = block(g, w, fl, d, mats, 0, y0, 0);
        const t2 = roofCap(g, w, d, top); trim(g, w, d, y0, top);
        put(g, cylGeo, M.metal, -0.18, t2 + 0.09, -0.15, 0.16, 0.18, 0.16);
      } else if (kind === 1) {               // ตึกคู่
        const a1 = block(g, w * 0.46, fl, d * 0.8, mats, -w * 0.27, y0, 0);
        const a2 = block(g, w * 0.46, fl - 2, d * 0.8, pick(FM.res, R(30)), w * 0.27, y0, 0);
        roofCap(g, w * 0.46, d * 0.8, a1); roofCap(g, w * 0.46, d * 0.8, a2);
        put(g, boxGeo, M.concrete, 0, y0 + FLOOR * 3, 0, w * 0.2, 0.08, d * 0.5);
      } else if (kind === 2) {               // ฐานแล้วหอ
        const p = block(g, w + 0.1, 2, d + 0.06, pick(FM.office, R(31)), 0, y0, 0);
        const t = block(g, w * 0.7, fl, d * 0.7, mats, 0, p, 0);
        roofCap(g, w * 0.7, d * 0.7, t); trim(g, w + 0.1, d + 0.06, y0, p);
      } else {                               // ตึกสูงยอดเอียง
        const t = block(g, w, fl - 1, d, mats, 0, y0, 0);
        roofCap(g, w, d, t);
        const s = put(g, boxGeo, M.concrete, 0, t + 0.07, 0, w * 0.6, 0.12, d * 0.6);
        s.rotation.z = 0.1 * (R(32) < 0.5 ? -1 : 1);
        trim(g, w, d, y0, t);
      }
      put(g, boxGeo, M.concrete, 0.18, y0 + 0.05, 0.36, 0.18, 0.1, 0.18);
    }
  } else if (type === 'com') {
    const office = pick(FM.office, R(2)), glass = pick(FM.glass, R(33));
    if (lv === 1) {
      const kind = Math.floor(R(3) * 4);
      const w = 0.58 + R(4) * 0.18, d = 0.5 + R(5) * 0.14;
      const fl = 2 + Math.floor(R(6) * 2);
      const top = block(g, w, fl, d, office, 0, y0, 0);
      roofCap(g, w, d, top); trim(g, w, d, y0, top, false);
      put(g, boxGeo, M.glassShop, 0, y0 + 0.08, d / 2 + 0.004, w * 0.85, 0.14, 0.012);
      put(g, boxGeo, pick(M.awning, R(7)), 0, y0 + FLOOR * 0.95, d / 2 + 0.07, w * 0.9, 0.025, 0.14);
      if (kind === 0) put(g, boxGeo, M.concrete, 0, y0 + FLOOR * 1.12, d / 2 + 0.012, w * 0.9, 0.05, 0.012);
      else if (kind === 1) put(g, boxGeo, pick(M.awning, R(8)), -w * 0.3, top + 0.08, d / 2 - 0.03, 0.22, 0.14, 0.02);      // ป้ายตั้งบนหลังคา
      else if (kind === 2) { put(g, pyrGeo, roofM, 0, top + 0.07, 0, w * 0.9, 0.14, d * 0.9); }
      else put(g, boxGeo, M.metal, w * 0.28, top + 0.06, -0.05, 0.14, 0.08, 0.14);
      if (R(9) < 0.4) addTree(g, w / 2 + 0.08, d / 2 + 0.08, 0.7, R(10));
    } else if (lv === 2) {
      const kind = Math.floor(R(3) * 3);
      const pw = 0.7 + R(4) * 0.1, pd = 0.7 + R(5) * 0.1;
      const t1 = block(g, pw, 1 + Math.floor(R(6) * 2), pd, office, 0, y0, 0);
      trim(g, pw, pd, y0, t1);
      const tw = 0.44 + R(7) * 0.18, td = 0.44 + R(8) * 0.18;
      const tx = (R(9) - 0.5) * (pw - tw) * 0.8, tz = (R(10) - 0.5) * (pd - td) * 0.8;
      const t2 = block(g, tw, 3 + Math.floor(R(11) * 5), td, glass, tx, t1, tz);
      if (kind === 0) { const t3 = roofCap(g, tw, td, t2); put(g, boxGeo, M.metal, tx + 0.1, t3 + 0.05, tz, 0.18, 0.1, 0.18); }
      else if (kind === 1) { const t3 = block(g, tw * 0.6, 1, td * 0.6, glass, tx, t2, tz); roofCap(g, tw * 0.6, td * 0.6, t3); }
      else { put(g, pyrGeo, M.metal, tx, t2 + 0.1, tz, tw, 0.2, td); }
    } else {
      const kind = Math.floor(R(3) * 4);
      const pw = 0.76 + R(4) * 0.08;
      const t1 = block(g, pw, 2, pw, office, 0, y0, 0);
      trim(g, pw, pw, y0, t1);
      const tw = 0.5 + R(5) * 0.16;
      const t2 = block(g, tw, 9 + Math.floor(R(6) * 8), tw, glass, 0, t1, 0);
      if (kind === 0) {
        const t3 = block(g, tw * 0.68, 2, tw * 0.68, pick(FM.glass, R(34)), 0, t2, 0);
        const t4 = roofCap(g, tw * 0.68, tw * 0.68, t3);
        put(g, cylGeo, M.metal, 0, t4 + 0.22, 0, 0.018, 0.44, 0.018);
        put(g, icoGeo, M.beacon, 0, t4 + 0.45, 0, 0.04, 0.04, 0.04);
      } else if (kind === 1) {
        const s = put(g, boxGeo, M.glassShop, 0, t2 + 0.1, 0, tw, 0.2, tw);
        s.rotation.x = 0.0; put(g, pyrGeo, M.metal, 0, t2 + 0.3, 0, tw * 0.9, 0.3, tw * 0.9);
      } else if (kind === 2) {
        roofCap(g, tw, tw, t2);
        put(g, cylGeo, M.concrete, 0, t2 + 0.1, 0, tw * 0.5, 0.2, tw * 0.5);
        put(g, boxGeo, M.lamp, 0, t2 + 0.21, 0, tw * 0.52, 0.015, tw * 0.52);
      } else {
        const t3 = roofCap(g, tw, tw, t2);
        put(g, boxGeo, M.metal, 0, t3 + 0.03, 0, tw * 0.5, 0.06, tw * 0.5);
        put(g, cylGeo, M.metal, 0.05, t3 + 0.26, 0, 0.014, 0.4, 0.014);
      }
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) put(g, boxGeo, M.concrete, sx * (tw / 2 + 0.005), t1 + (t2 - t1) / 2, sz * (tw / 2 + 0.005), 0.025, t2 - t1 - 0.04, 0.025);
    }
  } else {
    const mats = pick(FM.ind, R(2));
    const kind = Math.floor(R(3) * 3);
    const w = 0.76 + R(4) * 0.16, d = 0.6 + R(5) * 0.18;
    if (lv === 1) {
      const top = block(g, w, 2, d, mats, 0, y0, 0);
      roofCap(g, w, d, top); trim(g, w, d, y0, top, false);
      if (kind === 0) {
        put(g, boxGeo, M.metal, 0, y0 + 0.11, d / 2 + 0.01, 0.48, 0.2, 0.012);
        put(g, cylGeo, M.metal, w / 2 - 0.04, y0 + 0.16, 0.0, 0.03, 0.32, 0.03);
      } else if (kind === 1) {
        put(g, gableGeo(d, w, 0.12), M.metal, 0, top, 0, 1, 1, 1, Math.PI / 2);
        for (let k = -1; k <= 1; k++) put(g, boxGeo, M.door, k * 0.24, y0 + 0.09, d / 2 + 0.005, 0.18, 0.18, 0.01);
      } else {
        put(g, cylGeo, M.tank, w * 0.28, y0 + 0.25, d / 2 + 0.12, 0.2, 0.5, 0.2);
        put(g, boxGeo, M.door, -0.15, y0 + 0.09, d / 2 + 0.005, 0.22, 0.18, 0.01);
      }
    } else if (lv === 2) {
      const top = block(g, w, 2, d, mats, 0, y0, 0);
      const t2 = roofCap(g, w, d, top);
      block(g, 0.28, 3, 0.28, pick(FM.office, R(35)), -w * 0.33, y0, -d * 0.3);
      const ns = 1 + Math.floor(R(6) * 2);
      for (let k = 0; k < ns; k++) put(g, cylGeo, M.stack, w * 0.28 - k * 0.14, t2 + 0.3, -0.15 + k * 0.06, 0.12 - k * 0.02, 0.6 - k * 0.12, 0.12 - k * 0.02);
      if (kind !== 1) put(g, cylGeo, M.concrete, 0.12, y0 + 0.2, d / 2 - 0.05, 0.22, 0.4, 0.22);
      else put(g, boxGeo, M.metal, 0.1, t2 + 0.07, 0.05, 0.3, 0.14, 0.2);
    } else {
      const top = block(g, w + 0.04, 3, d + 0.06, mats, 0, y0, 0);
      const t2 = roofCap(g, w + 0.04, d + 0.06, top);
      block(g, 0.3, 4, 0.3, pick(FM.office, R(36)), -0.3, y0, 0.18);
      const ns = 2 + Math.floor(R(7) * 3);
      for (let k = 0; k < ns; k++) put(g, cylGeo, M.stack, 0.3 - k * 0.12, t2 + 0.25 + R(40 + k) * 0.3, -0.2 + (k % 2) * 0.2, 0.1 + R(50 + k) * 0.04, 0.5 + R(60 + k) * 0.4, 0.1 + R(50 + k) * 0.04);
      if (kind === 2) put(g, cylGeo, M.tank, 0.28, y0 + 0.22, 0.32, 0.22, 0.44, 0.22);
      else put(g, cylGeo, M.concrete, 0.2, y0 + 0.2, 0.3, 0.2, 0.4, 0.2);
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
  const key = text + bgc + fg + fs;  // (ข้อความรวมภาษาแล้ว)
  let m = textMatCache.get(key);
  if (m) return m;
  const tex = canvasTex(256, 64, (g, w, h) => {
    g.fillStyle = bgc; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(255,255,255,.5)'; g.lineWidth = 3; g.strokeRect(3, 3, w - 6, h - 6);
    g.fillStyle = fg;
    g.font = `bold ${fs}px "Segoe UI","Leelawadee UI","Noto Sans Thai","Microsoft YaHei","PingFang SC","Noto Sans SC",sans-serif`;
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
  signAt(bg, t('sign.gas'), '#1b3d6e', '#ffd54a', 0.42, y0 + 0.5, 0.4, 0.22, 0.06, 34);
  if (r > 0.4) put(bg, boxGeo, M.carCols[1], -0.17, 0.065, 0.3, 0.1, 0.04, 0.19);
}
function buildSupermarket(bg, r) {
  const y0 = 0.03;
  const top = block(bg, 0.88, 2, 0.5, FM.office[0], 0, y0, -0.22);
  roofCap(bg, 0.88, 0.5, top);
  put(bg, boxGeo, band(0x1e7b4a), 0, y0 + 0.285, -0.22 + 0.25 + 0.01, 0.9, 0.07, 0.025);
  signAt(bg, t('sign.lotus'), '#1e7b4a', '#ffffff', 0, y0 + 0.285, -0.22 + 0.25 + 0.024, 0.5, 0.058, 40);
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
  signAt(bg, t('sign.mall'), '#7a2f8f', '#ffffff', 0, y0 + 0.5, -0.17 + 0.31 + 0.012, 0.66, 0.08, 30);
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
  signAt(bg, t('sign.school'), '#2f6fb0', '#ffffff', 0.0, y0 + 0.27, -0.32 + 0.14, 0.4, 0.05, 30);
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
  signAt(bg, t('sign.hospital'), '#c62828', '#ffffff', 0, y0 + 0.5, fz + 0.012, 0.5, 0.06, 30);
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

function buildUniversity(bg, r) {
  const y0 = 0.03;
  // ตึกหลักสูงกลาง + ปีกสองข้าง + ลานหน้าตึก (แบบจำลองสไตล์มหาวิทยาลัย ไม่ใช่แบบจำลองเหมือนจริง)
  const topC = block(bg, 0.36, 7, 0.4, FM.office[1], 0, y0, -0.2);
  const tC = roofCap(bg, 0.36, 0.4, topC);
  for (const sx of [-1, 1]) {
    const tw = block(bg, 0.3, 4, 0.34, FM.office[0], sx * 0.33, y0, -0.2);
    roofCap(bg, 0.3, 0.34, tw);
    put(bg, boxGeo, M.concrete, sx * 0.33, y0 + 0.04, -0.2 + 0.18, 0.3, 0.02, 0.02);
    block(bg, 0.28, 2, 0.2, FM.office[1], sx * 0.33, y0, 0.06);        // อาคารเรียนด้านหน้า
  }
  put(bg, boxGeo, M.glassShop, 0, y0 + 0.1, -0.2 + 0.2 + 0.004, 0.3, 0.18, 0.008);
  put(bg, boxGeo, band(0xc62828), 0, topC - 0.02, -0.2, 0.38, 0.03, 0.42);          // แถบสีที่ยอดตึก
  signAt(bg, t('sign.bu'), '#1b3d6e', '#ffffff', 0, y0 + 0.5, -0.2 + 0.2 + 0.014, 0.34, 0.05, 24);
  put(bg, cylGeo, M.metal, 0, tC + 0.14, -0.2, 0.012, 0.28, 0.012);
  put(bg, boxGeo, M.concrete, 0, y0 + 0.012, 0.3, 0.6, 0.024, 0.2);                // ลานบันได
  put(bg, boxGeo, M.stopLine, 0, y0 + 0.026, 0.3, 0.5, 0.004, 0.12);
  for (const sx of [-0.28, 0.28]) { put(bg, cylGeo, M.metal, sx, y0 + 0.16, 0.42, 0.008, 0.32, 0.008); put(bg, boxGeo, band(sx < 0 ? 0xc62828 : 0xffffff), sx + 0.04, y0 + 0.29, 0.42, 0.07, 0.04, 0.004); }
  shrub(bg, -0.42, 0.42, 0.11, 0); shrub(bg, 0.42, 0.42, 0.11, 2); shrub(bg, -0.18, 0.44, 0.09, 1); shrub(bg, 0.18, 0.44, 0.09, 3);
}

const BIG = createBig({ put, boxGeo, cylGeo, coneGeo, icoGeo, planeGeo, M, FM, block, roofCap, signAt, shrub, addTree, band, std, gableGeo, facadeGeo, lot, t, facadeMats, stationModel: pickStation });

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
  if (type === 'service') return v === 'hospital' ? buildHospital(bg, r) : v === 'bu' ? buildUniversity(bg, r) : buildSchool(bg, r);
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

// ไฟจราจรสไตล์ Econolite 3 ช่อง: ตัวถังดำ แผ่นหลังขอบสะท้อนแสง เลนส์กลม มีฮู้ดบังแดด แขนยึดเสา
const sigLensGeo = new THREE.CylinderGeometry(0.5, 0.5, 1, 14); sigLensGeo.rotateX(Math.PI / 2);                    // แกนตามแนว +z
const sigRingGeo = new THREE.CylinderGeometry(0.5, 0.5, 1, 14); sigRingGeo.rotateX(Math.PI / 2);
const sigVisorGeo = new THREE.CylinderGeometry(0.5, 0.5, 1, 10, 1, true, Math.PI / 2, Math.PI); sigVisorGeo.rotateX(Math.PI / 2);   // ครึ่งท่อด้านบน
const sigBorderMat = std(0xe8e2b4, { roughness: 0.5, emissive: 0x3a3820, emissiveIntensity: 0.25 });
const sigVisorMat = new THREE.MeshStandardMaterial({ color: 0x14171a, roughness: 0.7, side: THREE.DoubleSide });
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
    put(pole, cylGeo, M.pole, 0, 0.012, 0, 0.03, 0.024, 0.03);                       // ฐานเสา
    const lm = signalMats[grp][axis];
    const cy = 0.32;
    put(pole, boxGeo, M.pole, 0, cy + 0.058, 0.007, 0.01, 0.008, 0.018);              // แขนยึดบน
    put(pole, boxGeo, M.pole, 0, cy - 0.058, 0.007, 0.01, 0.008, 0.018);              // แขนยึดล่าง
    put(pole, boxGeo, M.housing, 0, cy, 0.022, 0.044, 0.15, 0.03);                    // ตัวถัง
    put(pole, boxGeo, M.housing, 0, cy, 0.0, 0.066, 0.176, 0.004);                    // แผ่นหลัง
    put(pole, boxGeo, sigBorderMat, 0, cy + 0.088, 0.0, 0.066, 0.004, 0.0045);        // ขอบสะท้อนแสง (บน/ล่าง/ซ้าย/ขวา)
    put(pole, boxGeo, sigBorderMat, 0, cy - 0.088, 0.0, 0.066, 0.004, 0.0045);
    put(pole, boxGeo, sigBorderMat, 0.031, cy, 0.0, 0.004, 0.176, 0.0045);
    put(pole, boxGeo, sigBorderMat, -0.031, cy, 0.0, 0.004, 0.176, 0.0045);
    [[lm.r, 0.045], [lm.y, 0], [lm.g, -0.045]].forEach(([mat, oy]) => {
      put(pole, sigRingGeo, M.housing, 0, cy + oy, 0.038, 0.036, 0.036, 0.006);       // ขอบเลนส์
      put(pole, sigLensGeo, mat, 0, cy + oy, 0.041, 0.029, 0.029, 0.006);             // เลนส์ (เปลี่ยนสีตามสัญญาณ)
      put(pole, sigVisorGeo, sigVisorMat, 0, cy + oy, 0.052, 0.04, 0.04, 0.03);       // ฮู้ดบังแดด
    });
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

// ---------------------------------------------------------------
// ลดจำนวน draw call: รวมชิ้นส่วนนิ่งของแต่ละช่องที่ใช้วัสดุเดียวกันเป็นก้อนเดียว
// (ข้ามต้นไม้ที่แกว่ง และชิ้นที่ใช้วัสดุหลายชั้น)
// ---------------------------------------------------------------
const _inv = new THREE.Matrix4(), _rel = new THREE.Matrix4();
function mergeStatic(g, skip) {
  g.updateMatrixWorld(true);
  _inv.copy(g.matrixWorld).invert();
  const groups = new Map();
  const dead = [];
  g.traverse(o => {
    if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || Array.isArray(o.material) || !o.geometry) return;
    for (let p = o; p && p !== g; p = p.parent) if (skip.has(p)) return;
    const key = o.material.uuid + (o.castShadow ? 'c' : '') + (o.receiveShadow ? 'r' : '');
    let e = groups.get(key);
    if (!e) groups.set(key, e = { mat: o.material, cast: o.castShadow, recv: o.receiveShadow, list: [] });
    e.list.push(o);
  });
  for (const e of groups.values()) {
    if (e.list.length < 2) continue;
    const geos = [];
    let indexed = e.list.every(o => o.geometry.index), ok = true;
    const attrs = Object.keys(e.list[0].geometry.attributes).sort().join();
    for (const o of e.list) {
      if (Object.keys(o.geometry.attributes).sort().join() !== attrs) { ok = false; break; }
    }
    if (!ok) continue;
    for (const o of e.list) {
      let geo = o.geometry.clone();
      if (!indexed && geo.index) geo = geo.toNonIndexed();
      _rel.multiplyMatrices(_inv, o.matrixWorld);
      geo.applyMatrix4(_rel);
      geos.push(geo);
    }
    const merged = mergeGeometries(geos, false);
    for (const geo of geos) geo.dispose();
    if (!merged) continue;
    const mm = new THREE.Mesh(merged, e.mat);
    mm.castShadow = e.cast; mm.receiveShadow = e.recv;
    mm.userData.merged = true;
    g.add(mm);
    dead.push(...e.list);
  }
  for (const o of dead) o.parent.remove(o);
}
function disposeTile(g) {
  g.traverse(o => { if (o.userData.merged) o.geometry.dispose(); });
}


// ---------------------------------------------------------------
// ระบบก่อสร้าง: รั้วไซต์งาน → ขุดฐาน → ตึกค่อยๆ สูงทีละชั้น พร้อมนั่งร้านคลุมตาข่าย เครนหอคอยหมุน ฝุ่นลอย → เสร็จแล้วนั่งร้านรื้อออก
// ---------------------------------------------------------------
const constructing = new Map(); // ดัชนีช่องหลัก -> ข้อมูลไซต์
const puffs = [];
const SM = {
  dirt: new THREE.MeshStandardMaterial({ color: 0x6e5a3e, roughness: 1 }),
  fence: new THREE.MeshStandardMaterial({ color: 0xff7a1a, roughness: 0.7 }),
  steel: new THREE.MeshStandardMaterial({ color: 0xaeb6bd, roughness: 0.5, metalness: 0.5 }),
  crane: new THREE.MeshStandardMaterial({ color: 0xf2c230, roughness: 0.6 }),
  load: new THREE.MeshStandardMaterial({ color: 0x8a5a3a, roughness: 0.8 }),
  puff: new THREE.MeshBasicMaterial({ color: 0xd8ccb8, transparent: true, opacity: 0.55, depthWrite: false }),
};
const siteNetGeo = new THREE.PlaneGeometry(1, 1);
const siteSph = new THREE.SphereGeometry(0.5, 8, 6);
const smooth01 = v => { v = Math.max(0, Math.min(1, v)); return v * v * (3 - 2 * v); };

function startZoneBuild(t, x, z) {
  const to = t.lv + 1;
  t.cs = { p: 0, dur: [0, 38, 65, 95][to], to };
  buildTile(x, z);
}

function setupSite(g, baseCount, t, i) {
  const body = new THREE.Group();
  g.children.slice(baseCount).forEach(k => body.add(k));
  g.add(body);
  const fw = t.fw || 1, fd = t.fd || 1;
  const cx = (fw - 1) / 2, cz = (fd - 1) / 2, hx = fw / 2 - 0.05, hz = fd / 2 - 0.05;
  let H = 1.2;
  try {
    g.updateMatrixWorld(true);
    const bb = new THREE.Box3().setFromObject(body);
    const h = bb.max.y - g.position.y;
    if (isFinite(h) && h > 0.3) H = Math.min(h, 4);
  } catch (e) {}
  const site = new THREE.Group();
  g.add(site);
  const mk = (geo, mat, px, py, pz, sx, sy, sz, parent = site) => { const m = new THREE.Mesh(geo, mat); m.position.set(px, py, pz); m.scale.set(sx, sy, sz); m.castShadow = true; parent.add(m); return m; };
  const dirt = mk(boxGeo, SM.dirt, cx, 0.045, cz, fw * 0.94, 0.03, fd * 0.94);
  const fence = new THREE.Group(); site.add(fence);
  mk(boxGeo, SM.fence, cx, 0.1, cz + hz, fw * 0.96, 0.1, 0.02, fence); mk(boxGeo, SM.fence, cx, 0.1, cz - hz, fw * 0.96, 0.1, 0.02, fence);
  mk(boxGeo, SM.fence, cx + hx, 0.1, cz, 0.02, 0.1, fd * 0.96, fence); mk(boxGeo, SM.fence, cx - hx, 0.1, cz, 0.02, 0.1, fd * 0.96, fence);
  // นั่งร้าน
  const sc = new THREE.Group(); sc.position.set(cx, 0, cz); site.add(sc);
  const sx = hx * 0.86, sz = hz * 0.86;
  const poles = [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([a, b]) => mk(boxGeo, SM.steel, a * sx, 0.5, b * sz, 0.022, 1, 0.022, sc));
  const spacing = Math.max(0.2, H / 11), ringN = Math.min(12, Math.ceil(H / spacing) + 1);
  const rings = [];
  for (let k = 0; k < ringN; k++) {
    const r = new THREE.Group(); r.position.y = 0.1 + k * spacing; sc.add(r);
    mk(boxGeo, SM.steel, 0, 0, sz, sx * 2, 0.016, 0.016, r); mk(boxGeo, SM.steel, 0, 0, -sz, sx * 2, 0.016, 0.016, r);
    mk(boxGeo, SM.steel, sx, 0, 0, 0.016, 0.016, sz * 2, r); mk(boxGeo, SM.steel, -sx, 0, 0, 0.016, 0.016, sz * 2, r);
    rings.push(r);
  }
  const netMat = new THREE.MeshBasicMaterial({ color: 0x3f9d5a, transparent: true, opacity: 0.36, side: THREE.DoubleSide, depthWrite: false });
  const nets = [[0, sz, 0, sx * 2], [0, -sz, 0, sx * 2], [sx, 0, Math.PI / 2, sz * 2], [-sx, 0, Math.PI / 2, sz * 2]].map(([a, b, ry, w]) => {
    const m = new THREE.Mesh(siteNetGeo, netMat); m.position.set(a, 0.5, b); m.rotation.y = ry; m.scale.set(w, 1, 1); sc.add(m); return m;
  });
  // เครนหอคอย
  const crane = new THREE.Group(); crane.position.set(cx - hx * 0.98 - 0.02, 0, cz - hz * 0.98 - 0.02); site.add(crane);
  const mast = mk(boxGeo, SM.crane, 0, 0.5, 0, 0.05, 1, 0.05, crane);
  const jib = new THREE.Group(); crane.add(jib);
  const jl = Math.max(0.8, Math.max(fw, fd) * 0.95);
  mk(boxGeo, SM.crane, jl * 0.3, 0, 0, jl, 0.04, 0.04, jib);
  mk(boxGeo, SM.steel, -0.22, -0.02, 0, 0.16, 0.09, 0.08, jib);
  mk(boxGeo, SM.crane, 0, 0.07, 0, 0.04, 0.12, 0.04, jib);
  const lamp = new THREE.Mesh(siteSph, M.lamp.clone ? M.lamp.clone() : M.lamp); lamp.scale.setScalar(0.04); lamp.position.set(0, 0.15, 0); jib.add(lamp);
  const cable = mk(boxGeo, SM.steel, 0, -0.1, 0, 0.008, 0.2, 0.008, jib);
  const lo = mk(boxGeo, SM.load, 0, -0.22, 0, 0.1, 0.06, 0.06, jib);
  // ฝุ่น
  const dust = [];
  for (let k = 0; k < 6; k++) { const d = new THREE.Mesh(siteSph, SM.puff); d.position.set(cx + (Math.sin(k * 2.3) * hx), 0.1, cz + (Math.cos(k * 1.7) * hz)); site.add(d); dust.push(d); }
  constructing.set(i, { i, t, body, H, F: Math.max(2, Math.min(9, Math.round(H / 0.3))), cx, cz, hx, hz, dirt, fence, sc, poles, rings, spacing, nets, netMat, crane, mast, jib, jl, cable, lo, lamp, dust, ph: i * 1.7 });
}

function updateSite(e, time) {
  const p = e.t.cs.p;
  const a = smooth01((p - 0.12) / 0.76) * 0 + Math.max(0, Math.min(1, (p - 0.12) / 0.76));
  const q = a * e.F, fl = Math.min(e.F - 1, Math.floor(q)), fr = q - fl;
  const hf = a >= 1 ? 1 : (fl + smooth01(fr / 0.65)) / e.F;
  e.body.visible = p > 0.12;
  e.body.scale.y = Math.max(0.001, hf);
  const cur = hf * e.H;
  e.dirt.visible = p < 0.2;
  e.fence.visible = p < 0.95;
  const scOn = p > 0.12 && p < 0.96;
  e.sc.visible = scOn;
  if (scOn) {
    const h = cur + 0.12;
    e.poles.forEach(m => { m.scale.y = h; m.position.y = h / 2; });
    e.rings.forEach((r, k) => { r.visible = r.position.y <= h - 0.03; });
    e.nets.forEach(m => { m.scale.y = cur + 0.1; m.position.y = (cur + 0.1) / 2; });
    e.netMat.opacity = 0.36 * (1 - smooth01((p - 0.88) / 0.08));
  }
  const cOn = p > 0.03 && p < 0.97;
  e.crane.visible = cOn;
  if (cOn) {
    const lower = 1 - 0.85 * smooth01((p - 0.9) / 0.07);
    const Hc = (0.6 + cur + 0.35) * lower;
    e.mast.scale.y = Hc; e.mast.position.y = Hc / 2;
    e.jib.position.y = Hc;
    e.jib.rotation.y = time * 0.28 + e.ph;
    const len = 0.2 + 0.12 * Math.sin(time * 0.8 + e.ph) + Hc * 0.15;
    const tr = e.jl * (0.45 + 0.3 * Math.sin(time * 0.35 + e.ph));
    e.cable.position.set(tr, -len / 2, 0); e.cable.scale.y = len;
    e.lo.position.set(tr, -len - 0.03, 0);
    e.lamp.visible = Math.floor(time * 1.4) % 2 === 0;
  }
  const dustOn = p < 0.97 && p > 0.05;
  e.dust.forEach((d, k) => {
    d.visible = dustOn;
    if (!dustOn) return;
    const ph = (time * 0.33 + k / 6) % 1;
    d.position.y = 0.08 + ph * 0.38;
    d.scale.setScalar((0.06 + ph * 0.16) * (a < 1 && fr < 0.7 ? 1 : 0.55));
  });
}

function addPuffs(wx, wy, wz, n = 9) {
  for (let k = 0; k < n; k++) {
    const m = new THREE.Mesh(siteSph, SM.puff);
    const ang = (k / n) * Math.PI * 2 + Math.random();
    m.position.set(wx, wy + 0.08, wz);
    scene.add(m);
    puffs.push({ m, t: 0, vx: Math.cos(ang) * (0.25 + Math.random() * 0.3), vz: Math.sin(ang) * (0.25 + Math.random() * 0.3), vy: 0.1 + Math.random() * 0.2 });
  }
}

function animateConstruction(dt, time) {
  if (constructing.size) {
    const done = [];
    for (const e of constructing.values()) {
      const cs = e.t.cs;
      if (!cs) { done.push(e); continue; }
      if (speed > 0 && !menu.isOpen) cs.p = Math.min(1, cs.p + dt * speed / cs.dur);
      if (cs.p >= 1) { done.push(e); continue; }
      updateSite(e, time);
    }
    for (const e of done) {
      const t = e.t;
      if (t.cs) { if (t.cs.to) t.lv = t.cs.to; delete t.cs; }
      const x = e.i % N, z = Math.floor(e.i / N);
      buildTile(x, z);
      addPuffs(x - N / 2 + e.cx + 0.5, tileY(x, z), z - N / 2 + e.cz + 0.5, 6 + Math.round((t.fw || 1) * (t.fd || 1)));
      if (speed > 0) audio.sfx('place');
      updateHUD();
    }
  }
  for (let k = puffs.length - 1; k >= 0; k--) {
    const f = puffs[k];
    f.t += dt;
    f.m.position.x += f.vx * dt; f.m.position.z += f.vz * dt; f.m.position.y += f.vy * dt;
    const u = f.t / 1.6;
    f.m.scale.setScalar(Math.max(0.001, (0.12 + 0.3 * u) * (1 - u * u)));
    if (u >= 1) { scene.remove(f.m); puffs.splice(k, 1); }
  }
}

function buildTile(x, z) {
  if (!inBounds(x, z)) return;
  const i = idx(x, z);
  if (meshes[i]) { disposeTile(meshes[i]); tileGroup.remove(meshes[i]); meshes[i] = null; }
  swayTiles.delete(i);
  constructing.delete(i);
  const t = state.tiles[i];
  if (!t) return;

  const g = new THREE.Group();
  const ty = tileY(x, z);
  g.position.set(x - N / 2 + 0.5, ty, z - N / 2 + 0.5);
  if (t.t === 'road') {
    // เอียงผิวถนนตามความลาดของช่องข้างเคียง (ทางลาดขึ้นสะพานต่อเนื่อง ไม่เป็นขั้นบันได)
    const ys = (dx, dz) => (inBounds(x + dx, z + dz) ? tileY(x + dx, z + dz) : ty);
    const sx = clamp((ys(1, 0) - ys(-1, 0)) / 2, -0.5, 0.5), sz = clamp((ys(0, 1) - ys(0, -1)) / 2, -0.5, 0.5);
    g.rotation.z = Math.atan(sx);
    g.rotation.x = -Math.atan(sz);
  }
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
  const baseCount = g.children.length;
  const r2 = hash(x * 3 + 1, z * 5 + 2);
  const rot = () => facing(x, z, r);

  if (t.t === 'part') {
    // ช่องที่เป็นส่วนหนึ่งของอาคารใหญ่: มีแต่ฐาน อาคารวาดโดยช่องหลัก
  } else if (t.fw && FOOT[t.t + ':' + t.v]) {
    buildBigTile(g, x, z, t, ty);
  } else if (t.t === 'road') {
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
    const lv = t.cs?.to ?? t.lv;
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

  if (t.cs && t.t !== 'road') {
    try { setupSite(g, baseCount, t, i); } catch (err) { console.warn('site ข้าม:', err); delete t.cs; }
  } else {
    try { mergeStatic(g, new Set(swayList.map(s => s.obj))); } catch (err) { console.warn('merge ข้าม:', err); }
  }
  meshes[i] = g;
  tileGroup.add(g);
  if (swayList.length) swayTiles.set(i, swayList);
  swayList = null;
}

function buildBigTile(g, x, z, tl, ty) {
  const fw = tl.fw, fd = tl.fd, rot = tl.rot || 0;
  const [W, D] = FOOT[tl.t + ':' + tl.v];
  let base = -1e9, low = 1e9;
  for (let dz = 0; dz < fd; dz++) for (let dx = 0; dx < fw; dx++) {
    const h = tileY(x + dx, z + dz);
    base = Math.max(base, h); low = Math.min(low, tileMinH[idx(x + dx, z + dz)]);
  }
  const wrap = new THREE.Group();
  wrap.position.set(x + fw / 2 - N / 2 - g.position.x, base - ty, z + fd / 2 - N / 2 - g.position.z);
  wrap.rotation.y = rot * Math.PI / 2;
  const sh = Math.max(0.2, base - low + 0.25);
  put(wrap, boxGeo, M.plinth, 0, 0.03 - sh / 2, 0, W - 0.01, sh, D - 0.01);
  BIG.build(wrap, tl.t, tl.v);
  g.add(wrap);
}

// ---------------------------------------------------------------
// วางอาคารหลายช่อง: พื้นที่ (footprint) หมุนได้ด้วยปุ่ม R (ค่าเริ่มต้น = หันหน้าเข้าถนนเอง)
// ช่องหลัก = มุมซ้ายบนของพื้นที่ ช่องอื่นเป็น {t:'part', m: ดัชนีช่องหลัก}
// ---------------------------------------------------------------
let placeRot = null;
const footFor = tool => FOOT[tool + ':' + currentVar[tool]] || null;
function rectFor(x, z, W, D, rot) {
  const fw = rot % 2 ? D : W, fd = rot % 2 ? W : D;
  return { x0: x - Math.floor((fw - 1) / 2), z0: z - Math.floor((fd - 1) / 2), fw, fd, rot };
}
function edgeRoads(R, side) { // side 0:+z 1:+x 2:-z 3:-x (ด้านหน้า/ด้านอื่น)
  let n = 0;
  const { x0, z0, fw, fd } = R;
  if (side === 0 || side === 2) for (let i = 0; i < fw; i++) { if (isType(x0 + i, side === 0 ? z0 + fd : z0 - 1, 'road')) n++; }
  else for (let j = 0; j < fd; j++) { if (isType(side === 1 ? x0 + fw : x0 - 1, z0 + j, 'road')) n++; }
  return n;
}
const perimRoads = R => edgeRoads(R, 0) + edgeRoads(R, 1) + edgeRoads(R, 2) + edgeRoads(R, 3);
function chooseRot(x, z, W, D) {
  if (placeRot !== null) return placeRot;
  let best = 0, bs = -1;
  for (let r = 0; r < 4; r++) {
    const R = rectFor(x, z, W, D, r);
    const s = edgeRoads(R, r);
    if (s > bs) { bs = s; best = r; }
  }
  return best;
}
// ตรวจว่าวางอาคารใหญ่ที่ตำแหน่งนี้ได้ไหม คืน {R, ok, reason}
function evalBig(tool, x, z) {
  const [W, D] = footFor(tool);
  const R = rectFor(x, z, W, D, chooseRot(x, z, W, D));
  let reason = null, lo = 1e9, hi = -1e9;
  for (let dz = 0; dz < R.fd && !reason; dz++) for (let dx = 0; dx < R.fw; dx++) {
    const px = R.x0 + dx, pz = R.z0 + dz;
    if (!inBounds(px, pz)) { reason = 'toast.bounds'; break; }
    if (state.tiles[idx(px, pz)]) { reason = 'toast.occupied'; break; }
    if (isWaterTile(px, pz)) { reason = 'toast.water'; break; }
    lo = Math.min(lo, tileMinH[idx(px, pz)]); hi = Math.max(hi, tileMaxH[idx(px, pz)]);
  }
  if (!reason && hi - lo > 1.3) reason = 'toast.slope';
  if (!reason && ['com', 'service'].includes(tool) && !perimRoads(R)) reason = 'toast.road';
  if (!reason && state.money < toolCost(tool)) reason = 'toast.nomoney';
  return { R, ok: !reason, reason };
}
function placeBig(tool) {
  /* ใช้ใน applyTool */
}
function masterOf(i) {
  const tl = state.tiles[i];
  if (!tl) return -1;
  return tl.t === 'part' ? tl.m : i;
}
function footprintTiles(mi) {
  const m = state.tiles[mi];
  const out = [];
  if (!m || m.t === 'part') return out;
  const mx = mi % N, mz = Math.floor(mi / N), fw = m.fw || 1, fd = m.fd || 1;
  for (let dz = 0; dz < fd; dz++) for (let dx = 0; dx < fw; dx++) out.push([mx + dx, mz + dz]);
  return out;
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
    if (state.money < cost) { audio.sfx('error'); return toast(t('toast.nomoney')); }
    state.money -= cost;
    const mi = masterOf(i);
    const tiles = footprintTiles(mi);
    if (tiles.length > 1 || cur.t === 'part') {
      for (const [px, pz] of tiles) state.tiles[idx(px, pz)] = null;
      audio.sfx('bulldoze');
      for (const [px, pz] of tiles) refresh(px, pz);
    } else {
      state.tiles[i] = null;
      audio.sfx('bulldoze');
      refresh(x, z);
    }
    updateHUD();
    return;
  }
  if (footFor(currentTool)) {
    if (cur) return;
    const e = evalBig(currentTool, x, z);
    if (!e.ok) { audio.sfx('error'); return toast(t(e.reason)); }
    state.money -= toolCost(currentTool);
    const { R } = e, mi = idx(R.x0, R.z0);
    for (let dz = 0; dz < R.fd; dz++) for (let dx = 0; dx < R.fw; dx++) state.tiles[idx(R.x0 + dx, R.z0 + dz)] = { t: 'part', m: mi };
    state.tiles[mi] = { t: currentTool, lv: 0, v: currentVar[currentTool], fw: R.fw, fd: R.fd, rot: R.rot, cs: { p: 0, dur: 30 + 9 * Math.sqrt(R.fw * R.fd) } };
    audio.sfx('place');
    for (let dz = 0; dz < R.fd; dz++) for (let dx = 0; dx < R.fw; dx++) refresh(R.x0 + dx, R.z0 + dz);
    updateHUD();
    return;
  }
  if (cur) return; // วางทับของเดิมไม่ได้ ต้องรื้อก่อน
  const cost2 = buildCost(currentTool, x, z);
  if (isWaterTile(x, z) && currentTool !== 'road') { audio.sfx('error'); return toast(t('toast.water')); }
  const CV = VARIANTS[currentTool] && currentVar[currentTool];
  if (CV && CV !== 'zone' && ['res', 'com', 'service'].includes(currentTool) && !adjRoad(x, z)) { audio.sfx('error'); return toast(t('toast.road')); }
  if (currentTool === 'water' && !nearWater(x, z, 3)) { audio.sfx('error'); return toast(t('toast.nearwater')); }
  if (state.money < cost2) { audio.sfx('error'); return toast(t('toast.nomoney')); }
  state.money -= cost2;
  state.tiles[i] = VARIANTS[currentTool] ? { t: currentTool, lv: 0, v: currentVar[currentTool] } : { t: currentTool, lv: 0 };
  if (['res', 'com', 'ind', 'service', 'power', 'water'].includes(currentTool) && (fixedVariant(state.tiles[i]) || currentTool === 'power' || currentTool === 'water')) state.tiles[i].cs = { p: 0, dur: currentTool === 'power' || currentTool === 'water' ? 45 : 28 };
  audio.sfx(currentTool === 'road' ? 'road' : 'place');
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
    extraTax: { finance: 0, health: 0, edu: 0, transit: 0, leisure: 0 },
  };
  state.tiles.forEach((t, i) => {
    if (!t) return;
    const lv = t.lv || 0;
    if (t.cs && !t.cs.to) { if (t.t === 'power' || t.t === 'water') return; if (t.t !== 'part') return; }
    const FV = (t.t === 'res' || t.t === 'com' || t.t === 'service' || t.t === 'farm') ? fixedVariant(t) : null;
    if (FV) {
      if (t.t === 'res') s.pop += FV.pop; else if (t.t === 'farm') s.jobsInd += FV.jobs; else s.jobsCom += FV.jobs;
      s.powerUse += FV.power; s.waterUse += FV.water; s.upkeep += FV.upkeep || 0;
      if (FV.tax) s.extraTax[TAX_GROUP[t.v] || 'finance'] += FV.tax;
      return;
    }
    if (t.t === 'res') { s.pop += POP_PER[lv]; s.powerUse += POWER_USE.res[lv]; s.waterUse += WATER_USE.res[lv]; }
    else if (t.t === 'com') { s.jobsCom += JOBS_COM[lv]; s.powerUse += POWER_USE.com[lv]; s.waterUse += WATER_USE.com[lv]; s.comLv += lv; }
    else if (t.t === 'ind') { s.jobsInd += JOBS_IND[lv]; s.powerUse += POWER_USE.ind[lv]; s.waterUse += WATER_USE.ind[lv]; s.indLv += lv; }
    else if (t.t === 'road') { s.roads++; if (tileIsWater[i]) s.bridges++; if (isJunction(i % N, Math.floor(i / N))) s.junctions++; }
    else if (t.t === 'park') { const PV = variantOf(t); s.parks += (t.fw || 1) * (t.fd || 1); s.waterUse += 1 + (t.fw ? t.fw * t.fd : 0); s.upkeep += PV?.upkeep ? PV.upkeep : 0; s.jobsCom += PV?.jobs || 0; }
    else if (t.t === 'power') { const V = variantOf(t); s.plants++; s.powerCap += V.cap; s.upkeep += V.upkeep; }
    else if (t.t === 'water') { const V = variantOf(t); s.wplants++; s.waterCap += V.cap * (1 + 0.15 * weather.state.rain); s.upkeep += V.upkeep; } // ฝนตก น้ำดิบมากขึ้น
  });
  // อากาศร้อนคนใช้น้ำมากขึ้น ฝนตกใช้น้อยลง
  s.waterUse = Math.round(s.waterUse * clamp(1 + (tempC - 30) * 0.02 - 0.15 * weather.state.rain, 0.7, 1.3));
  s.waterCap = Math.round(s.waterCap);
  s.jobs = s.jobsCom + s.jobsInd;
  // ภาษีแยกประเภท (รวมกันเท่ากับสูตรเดิม + ภาษีพิเศษของธุรกิจใหม่)
  s.taxes = {
    land: s.pop * 0.2, pit: s.pop * 0.25, vat: s.jobsCom * 0.5, corp: s.jobsCom * 0.4 + s.jobsInd * 0.5, ind: s.jobsInd * 0.3,
    vehicle: s.pop * 0.025, finance: s.extraTax.finance, health: s.extraTax.health, edu: s.extraTax.edu, transit: s.extraTax.transit, leisure: s.extraTax.leisure,
  };
  s.income = Object.values(s.taxes).reduce((a, b) => a + b, 0);
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

  let zoneN = 0;
  state.tiles.forEach(tt => { if (tt && ZONES.includes(tt.t)) zoneN++; });
  const siteCap = Math.min(12, 4 + Math.floor(zoneN / 30));
  for (let z = 0; z < N; z++) {
    for (let x = 0; x < N; x++) {
      const i = idx(x, z);
      const t = state.tiles[i];
      if (!t || !ZONES.includes(t.t) || fixedVariant(t)) continue;

          if (!adjRoad(x, z)) {
        if (t.lv > 0 || t.cs) { t.lv = 0; delete t.cs; buildTile(x, z); }
        continue;
      }
      if (t.cs || !powered || !watered || t.lv >= 3) continue;
      if (constructing.size >= siteCap) continue;

      let p = 0.012 + 0.05 * s.demand[t.t];
      if (t.t === 'res' && nearPark.has(i)) p += 0.015;
      if (Math.random() < p) { startZoneBuild(t, x, z); }
    }
  }

  const s2 = computeStats();
  state.money += s2.net * ECON / DAY_LENGTH_SEC; // รายได้ไหลเข้าต่อเนื่องตลอดวัน
  updateHUD(s2);
  cityEvents(s2);
}


// ---------------------------------------------------------------
// ข่าวเมือง / เหตุการณ์ (ไฟไหม้ ปล้นร้านทอง ไฟ-น้ำขาด ฯลฯ) / ข้อมูลประชากร
// ---------------------------------------------------------------
const news = createNews();
const ST = () => (state.stats ||= { acc: 0, inj: 0, dead: 0, fires: 0, crimes: 0 });
const newsText = it => it.parts.map(([k, p]) => t(k, p || {})).join('');
let curAt = null;
const withAt = (x, z, fn) => { const p = curAt; curAt = { x, z }; try { fn(); } finally { curAt = p; } };
function addNews(kind, ...parts) {
  const it = news.add(kind, parts, { day: state.day, clock: clockText() });
  if (curAt) it.at = curAt;
  if (kind === 'bad') toast(newsText(it));
  renderNews();
  return it;
}
const casPart = (inj, dead) => (dead ? ['news.cas.dead', { inj, dead }] : inj ? ['news.cas.inj', { inj }] : ['news.cas.none', {}]);

// ---------- ทะเบียนราษฎร์: เกิด / เสียชีวิต ----------
const REG = () => (state.registry ||= { births: 0, deaths: 0, byCause: {}, log: [], nid: 0 });
const nameOf = r => {
  const L = k => t(k).split('|');
  const f = L(r.sex === 'f' ? 'names.f' : 'names.m'), s = L('names.s');
  return `${f[r.fn % f.length]} ${s[r.sn % s.length]}`;
};
function regAdd(type, o = {}) {
  const R = REG();
  const rec = { id: ++R.nid, type, sex: o.sex || (Math.random() < 0.5 ? 'm' : 'f'), fn: (Math.random() * 997) | 0, sn: (Math.random() * 997) | 0,
    day: state.day, clock: clockText(), age: Math.round(o.age || 0), cause: o.cause || '', place: o.place || '', road: o.road || '' };
  if (type === 'birth') R.births++; else { R.deaths++; R.byCause[rec.cause] = (R.byCause[rec.cause] || 0) + 1; }
  R.log.unshift(rec);
  if (R.log.length > 300) R.log.length = 300;
  return rec;
}
const sched = [];
const later = (sec, fn) => { const at = curAt; sched.push({ t: sec, fn: at ? () => withAt(at.x, at.z, fn) : fn }); };
const roadAt = (x, z) => (Math.random() < 0.5 ? rowName(z) : colName(x));

function civicCounts() {
  const c = { hospital: 0, hospital_p: 0, school: 0, school_p: 0, bus: 0, taxi: 0, grab: 0, bank: 0, pub: 0, tuner: 0, drag: 0, bu: 0, police: 0, fire: 0, gold: [], flammable: [], temple: 0, mosque: 0, church: 0, market: 0, mall: 0, dealer: 0, fishing: 0, farm: 0, parks: 0 };
  state.tiles.forEach((tl, i) => {
    if (!tl || tl.t === 'part' || (tl.cs && !tl.cs.to)) return;
    if (tl.t === 'service') c[tl.v] = (c[tl.v] || 0) + 1;
    else if (tl.t === 'com' && (tl.v === 'gold' || tl.v === 'bank')) c.gold.push(i);
    else if (tl.t === 'com' && c[tl.v] !== undefined) c[tl.v]++;
    else if (tl.t === 'farm') c.farm++;
    else if (tl.t === 'park') c.parks += (tl.fw || 1) * (tl.fd || 1);
    if (['res', 'com', 'ind', 'farm'].includes(tl.t) && (fixedVariant(tl) || tl.lv > 0)) c.flammable.push(i);
  });
  return c;
}
let ccache = civicCounts();
const cover = (n, pop, per) => (pop <= 0 ? (n > 0 ? 1 : 0) : clamp(n * per / pop, 0, 1));
const policeCover = (pop = audioStats.pop) => cover(ccache.police, pop, 2500);
const fireCover = (pop = audioStats.pop) => cover(ccache.fire, pop, 3000);

function civicSnapshot() {
  const s = computeStats();
  const groups = [];
  state.tiles.forEach(tl => {
    if (!tl || tl.t !== 'res') return;
    const FV = fixedVariant(tl);
    groups.push({ pop: FV ? FV.pop : POP_PER[tl.lv || 0], kind: FV ? tl.v : ['house', 'house', 'apt', 'condo'][tl.lv || 0] });
  });
  const demo = demographics(groups);
  const cc = civicCounts();
  const ac = agents.counts();
  const nd = calcNeeds({
    pop: s.pop, powerUse: s.powerUse, powerCap: s.powerCap, waterUse: s.waterUse, waterCap: s.waterCap,
    jobs: s.jobs, workers: demo.workers, hospitals: cc.hospital + 0.6 * cc.hospital_p, schools: cc.school + 0.7 * cc.school_p, universities: cc.bu, transit: cc.bus * 2 + cc.taxi + cc.grab,
    police: cc.police, fire: cc.fire, parks: cc.parks, roads: s.roads, liveCars: ac.car, kids: demo.child + demo.youth,
  });
  return { s, demo, cc, ac, nd };
}

// ----- ไฟไหม้ -----
const fires = [];
const flameA = new THREE.MeshBasicMaterial({ color: 0xff5a14, toneMapped: false, transparent: true, opacity: 0.92 });
const flameB = new THREE.MeshBasicMaterial({ color: 0xffc431, toneMapped: false, transparent: true, opacity: 0.95 });
const smokeM = new THREE.MeshBasicMaterial({ color: 0x484848, transparent: true, opacity: 0.38, depthWrite: false });
const flameGeo = new THREE.ConeGeometry(0.5, 1, 6);
function startFire(mi) {
  const tl = state.tiles[mi];
  const mx = mi % N, mz = Math.floor(mi / N), fw = tl.fw || 1, fd = tl.fd || 1;
  const grp = new THREE.Group();
  grp.position.set(mx + fw / 2 - N / 2, tileY(mx, mz), mz + fd / 2 - N / 2);
  const flames = [], puffs = [];
  const nf = 5 + fw * fd * 2;
  for (let k = 0; k < nf; k++) {
    const m1 = new THREE.Mesh(flameGeo, k % 2 ? flameA : flameB);
    const px = (Math.random() - 0.5) * (fw * 0.7), pz = (Math.random() - 0.5) * (fd * 0.7);
    const py = 0.12 + Math.random() * (0.25 + 0.15 * (fw * fd > 1 ? 2 : 1));
    m1.position.set(px, py, pz);
    flames.push({ m: m1, ph: Math.random() * 10, base: 0.18 + Math.random() * 0.2, py });
    grp.add(m1);
  }
  for (let k = 0; k < 6; k++) { const p = new THREE.Mesh(sphG, smokeM); puffs.push({ m: p, ph: k / 6, px: (Math.random() - 0.5) * fw * 0.5, pz: (Math.random() - 0.5) * fd * 0.5 }); grp.add(p); }
  scene.add(grp);
  fires.push({ mi, t: 0, grp, flames, puffs, limit: 12 + Math.random() * 8 });
  ST().fires++;
}
const sphG = new THREE.SphereGeometry(0.5, 8, 6);
function destroyBuilding(mi) {
  const tiles = footprintTiles(mi);
  for (const [px, pz] of tiles) state.tiles[idx(px, pz)] = null;
  for (const [px, pz] of tiles) refresh(px, pz);
}
function removeFire(f) {
  scene.remove(f.grp);
  fires.splice(fires.indexOf(f), 1);
}
function animateFires(time) {
  for (const f of fires) {
    for (const fl of f.flames) {
      const k = 0.75 + 0.35 * Math.sin(time * 11 + fl.ph) + 0.15 * Math.sin(time * 23 + fl.ph * 2);
      fl.m.scale.set(fl.base * 0.7 * k, fl.base * 2.2 * k, fl.base * 0.7 * k);
      fl.m.position.y = fl.py + fl.base * 0.6;
    }
    for (const p of f.puffs) {
      const u = (time * 0.35 + p.ph) % 1;
      p.m.position.set(p.px + Math.sin(u * 5 + p.ph * 7) * 0.05, 0.6 + u * 0.9, p.pz);
      const sc = 0.12 + u * 0.35;
      p.m.scale.set(sc, sc, sc);
    }
  }
}
function tickFires() {
  for (const f of [...fires]) {
    f.t++;
    const tl = state.tiles[f.mi];
    if (!tl) { removeFire(f); continue; }
    const x = f.mi % N, z = Math.floor(f.mi / N);
    curAt = { x, z };
    if (ccache.fire > 0) {
      if (f.t === 3) addNews('warn', ['news.fire.truck', {}]);
      if (f.t >= f.limit) {
        removeFire(f);
        const inj = Math.random() < 0.2 ? 1 : 0;
        ST().inj += inj;
        addNews('good', ['news.fire.out', {}], casPart(inj, 0));
        audio.sfx('place');
      }
    } else if (f.t >= 38) {
      removeFire(f);
      const inj = Math.floor(Math.random() * 3), dead = Math.random() < 0.22 ? 1 : 0;
      ST().inj += inj; ST().dead += dead;
      if (dead) regAdd('death', { cause: 'fire', age: 8 + Math.random() * 75, road: roadAt(x, z) });
      destroyBuilding(f.mi);
      audio.sfx('bulldoze');
      addNews('bad', ['news.fire.destroyed', { road: roadAt(x, z) }], casPart(inj, dead));
      updateHUD();
    }
    curAt = null;
  }
}

// ----- เหตุการณ์สุ่มรายวินาที (เรียกจาก tick) -----
const flags = { power: false, water: false, jobs: 0, traffic: 0, flavor: 40, milestone: 0, pack: 90, bAcc: 0, dAcc: 0 };
const R_FIRST = { birth: true };
const MILES = [100, 300, 600, 1000, 2000, 4000, 8000, 15000];
function cityEvents(s) {
  // งานที่นัดไว้
  for (const q of [...sched]) { q.t--; if (q.t <= 0) { sched.splice(sched.indexOf(q), 1); q.fn(); } }
  tickFires();
  const pop = s.pop;
  if (pop <= 0) return;
  const W = weather.state;

  // ไฟ/น้ำขาด
  const pShort = s.powerUse > s.powerCap;
  if (pShort && !flags.power) { flags.power = true; addNews('bad', ['news.blackout', {}]); }
  else if (!pShort && flags.power) { flags.power = false; addNews('good', ['news.power.ok', {}]); }
  const wShort = s.waterUse > s.waterCap;
  if (wShort && !flags.water) { flags.water = true; addNews('bad', ['news.nowater', {}]); }
  else if (!wShort && flags.water) { flags.water = false; addNews('good', ['news.water.ok', {}]); }

  // เกิด/เสียชีวิตตามธรรมชาติ (บันทึกในทะเบียนราษฎร์)
  flags.bAcc += pop * 0.000033; flags.dAcc += pop * 0.000013;
  const hosp = ccache.hospital + ccache.hospital_p > 0;
  while (flags.bAcc >= 1) {
    flags.bAcc -= 1;
    const r = regAdd('birth', { age: 0, place: hosp && Math.random() < 0.75 ? 'hospital' : 'home' });
    if (R_FIRST.birth) { R_FIRST.birth = false; addNews('good', ['news.birth.first', { name: nameOf(r) }]); }
    else if (Math.random() < 0.03) addNews('good', ['news.birth.one', { name: nameOf(r) }]);
  }
  while (flags.dAcc >= 1) {
    flags.dAcc -= 1;
    const old = Math.random() < 0.7;
    const r = regAdd('death', { cause: old ? 'old' : 'illness', age: old ? 62 + Math.random() * 36 : 28 + Math.random() * 58, place: hosp && Math.random() < 0.5 ? 'hospital' : 'home' });
    if (Math.random() < 0.07) addNews('info', ['news.death.natural', { name: nameOf(r), age: r.age }], ...(ccache.temple + ccache.church + ccache.mosque > 0 ? [['news.funeral', {}]] : []));
  }

  flags.jobs--; flags.traffic--;
  const snap = pop > 40 ? civicSnapshot() : null;
  if (snap && flags.jobs <= 0 && s.jobs < snap.demo.workers * 0.65) { flags.jobs = 150; addNews('warn', ['news.jobs', {}]); }
  if (snap && flags.traffic <= 0 && s.roads > 6 && snap.ac.car / s.roads > 0.36) { flags.traffic = 160; addNews('warn', ['news.traffic', {}]); }

  // หลักไมล์ประชากร
  while (flags.milestone < MILES.length && pop >= MILES[flags.milestone]) { addNews('good', ['news.milestone', { n: MILES[flags.milestone].toLocaleString() }]); flags.milestone++; }

  // ไฟไหม้
  const flam = ccache.flammable.filter(i => !fires.some(f => f.mi === i));
  if (flam.length && fires.length < 2) {
    const p = 0.0028 * (1 - 0.55 * fireCover(pop)) * (W.cloud > 0.8 && W.rain > 0.6 ? 2.2 : 1);
    if (Math.random() < p) {
      const mi = pickOf(flam);
      startFire(mi);
      withAt(mi % N, Math.floor(mi / N), () => addNews('bad', ['news.fire.start', { road: roadAt(mi % N, Math.floor(mi / N)) }]));
      audio.sfx('error');
    }
  }

  // กลุ่มรถซิ่ง (มอไซค์/รถยนต์) ป่วนถนน โดยเฉพาะกลางคืน
  flags.pack--;
  if (flags.pack <= 0 && pop > 300 && snap && snap.ac.car >= 8) {
    const racePull = (1 + 0.7 * Math.min(3, ccache.tuner)) * (ccache.drag > 0 ? 0.45 : 1);   // ร้านแต่งรถดึงคนซิ่ง สนามคลอง 5 ดึงไปแข่งในสนาม
    if (Math.random() < 0.004 * racePull * (1 + 1.8 * nightLevel) * (1 - 0.6 * policeCover(pop))) { if (agents.startRacePack(Math.random() < 0.55 ? 'bike' : 'car')) flags.pack = 120; }
  }

  // งานแข่งแดร็กที่สนามคลอง 5: สุ่มวันจัดงาน (~40%) เริ่มช่วงเย็น มีผู้ชม รถต่อคิวแข่งจริง และจุดพลุ
  syncDrag();
  curAt = dragAt;
  if (state.day !== flags.dragChk) {
    flags.dragChk = state.day;
    flags.dragToday = ccache.drag > 0 && pop > 200 && Math.random() < 0.4;
    if (flags.dragToday) addNews('info', ['news.drag.today', {}]);
  }
  {
    const hr = tod * 24, want = !!flags.dragToday && ccache.drag > 0 && hr >= 17.5 && hr < 23;
    if (want && !drag.isActive()) { drag.setActive(true); flags.dragW0 = drag.wins(); addNews('good', ['news.drag.event', {}]); }
    else if (!want && drag.isActive()) {
      drag.setActive(false);
      const n = drag.wins() - (flags.dragW0 || 0), inc = 600 + n * 180;
      state.money += inc; flags.dragToday = false;
      addNews('good', ['news.drag.end', { n, inc: '$' + inc.toLocaleString() }]);
    }
  }
  curAt = null;

  // ด่านตรวจสุ่มของตำรวจ (ไม่บ่อย): ตั้งบนถนนตรง ~70 วินาที
  flags.cpCool = (flags.cpCool ?? 90) - 1;
  if (agents.checkpointActive()) {
    if (agents.checkpointAge() > 70) {
      const r = agents.endCheckpoint();
      if (r) {
        const road = r.axis === 'row' ? rowName(r.z) : colName(r.x);
        const drunkN = ccache.pub > 0 ? Math.round(Math.random() * (1 + 3 * nightLevel)) : (Math.random() < 0.12 ? 1 : 0);
        const fine = drunkN * 500;
        state.money += fine;
        withAt(r.x, r.z, () => addNews(drunkN ? 'good' : 'info', [drunkN ? 'news.checkpoint.caught' : 'news.checkpoint.clean', { road, n: Math.max(r.stopped, drunkN), c: drunkN, fine: '$' + fine.toLocaleString() }]));
        flags.cpCool = 220 + Math.random() * 200;
      }
    }
  } else if (ccache.police > 0 && pop > 150 && flags.cpCool <= 0 && Math.random() < 0.02 * (1 + 1.5 * nightLevel)) {
    const r = agents.startCheckpoint();
    if (r) withAt(r.x, r.z, () => addNews('info', ['news.checkpoint.start', { road: r.axis === 'row' ? rowName(r.z) : colName(r.x) }]));
    else flags.cpCool = 60;
  }

  // ปล้นร้านทอง/ธนาคาร
  for (const gi of ccache.gold) {
    if (Math.random() < 0.0011 * (1 - 0.75 * policeCover(pop))) {
      ST().crimes++;
      const gx = gi % N, gz = Math.floor(gi / N), road = roadAt(gx, gz);
      curAt = { x: gx, z: gz };
      addNews('bad', [state.tiles[gi]?.v === 'bank' ? 'news.robbery.bank' : 'news.robbery', { road }]);
      const caught = ccache.police > 0 && Math.random() < 0.55 + 0.4 * policeCover(pop);
      later(18 + Math.random() * 15, () => addNews(caught ? 'good' : 'warn', [caught ? 'news.robbery.caught' : (ccache.police > 0 ? 'news.robbery.escape' : 'news.robbery.nopolice'), {}]));
      curAt = null;
      break;
    }
  }

  // ข่าวทั่วไปตามสิ่งที่มีในเมือง
  flags.flavor--;
  if (flags.flavor <= 0) {
    flags.flavor = 45 + Math.random() * 60;
    const c = ccache, pool = [];
    for (const k of ['temple', 'mosque', 'church', 'market', 'mall', 'dealer', 'fishing', 'hospital', 'hospital_p', 'school', 'school_p', 'bu', 'farm', 'bank', 'bus', 'taxi', 'grab']) if (c[k] > 0) pool.push(['news.f.' + k, {}]);
    if (c.gold.length) pool.push(['news.f.gold', { price: Math.round(38000 + Math.random() * 9000).toLocaleString() }]);
    if (c.parks > 0) pool.push(['news.f.park', {}]);
    if (c.police > 0) pool.push(['news.f.police', {}]);
    if (c.fire > 0) pool.push(['news.f.fire', {}]);
    if (W.rain > 0.5) pool.push(['news.f.rain', {}]);
    pool.push(['news.f.generic', { pop: pop.toLocaleString() }]);
    const pk = pickOf(pool);
    addNews('info', pk);
  }
}

let lastAccAt = null;
function onAgentEvent(ev) {
  if (ev && ev.e === 'pack') {
    curAt = { x: ev.x, z: ev.z };
    const road = ev.axis === 'row' ? rowName(ev.z) : colName(ev.x);
    addNews('warn', ['news.pack.' + ev.kind, { road, n: ev.n }]);
    audio.sfx('error');
    later(30 + Math.random() * 14, () => addNews(ccache.police > 0 ? 'good' : 'info', [ccache.police > 0 ? 'news.pack.caught' : 'news.pack.gone', {}]));
    curAt = null;
    return;
  }
  if (typeof ev === 'string') {
    curAt = lastAccAt;
    if (ev === 'ambulance') addNews('warn', ['news.ambulance', {}]);
    else if (ev === 'tow') addNews('info', ['news.tow', {}]);
    else if (ev === 'cleared') addNews('good', ['news.cleared', {}]);
    curAt = null;
    return;
  }
  if (ev.e !== 'crash') return;
  curAt = lastAccAt = { x: ev.x, z: ev.z };
  const road = ev.axis === 'row' ? rowName(ev.z) : colName(ev.x);
  const S = ST();
  S.acc++; S.inj += ev.injured; S.dead += ev.dead;
  if (ev.cause !== 'breakdown') audio.sfx('crash');
  const deadRecs = [];
  for (let k = 0; k < ev.dead; k++) deadRecs.push(regAdd('death', { cause: ev.cause, age: ev.bike ? 16 + Math.random() * 30 : 18 + Math.random() * 52, road }));
  addNews('bad', [ev.cause === 'race' && ev.bike ? 'news.crash.racebike' : 'news.crash.' + ev.cause, { road }], casPart(ev.injured, ev.dead),
    ...(deadRecs.length ? [['news.dead.name', { name: nameOf(deadRecs[0]), age: deadRecs[0].age }]] : []));
  if (ev.clip) {
    later(5 + Math.random() * 6, () => addNews('info', [ev.cause === 'race' ? 'news.clip.race' : 'news.clip', { page: pickOf(PAGES), views: Math.round(12000 + Math.random() * 480000).toLocaleString() }]));
  }
  if (ev.cause === 'race' && ccache.police > 0) later(40 + Math.random() * 30, () => addNews('good', ['news.arrest', {}]));
  curAt = null;
}

// ----- UI: แผงข่าว + แผงข้อมูลประชากร -----
const newsEl = document.getElementById('news'), newsList = document.getElementById('newsList');
const KIND_DOT = { bad: '#ff5252', warn: '#ffb300', info: '#4fc3f7', good: '#66bb6a' };
const escH = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const newsRow = it => `<div class="ni${it.at ? ' go' : ''}"${it.at ? ` data-at="${it.at.x},${it.at.z}" title="${escH(t('news.goto'))}"` : ''}><i style="background:${KIND_DOT[it.kind]}"></i><div><small>${escH(t('news.time', { d: it.day, c: it.clock }))}${it.at ? ' · 📍' : ''}</small><span>${escH(newsText(it))}</span></div></div>`;
function renderNews() {
  if (!newsList) return;
  newsList.innerHTML = news.items.slice(0, 10).map(it =>
    newsRow(it)
  ).join('') || `<div class="ni dim">${escH(t('news.empty'))}</div>`;
}
const newsTab = document.getElementById('newsTab');
const setNewsClosed = c => {
  newsEl.classList.toggle('closed', c); newsTab.classList.toggle('closed', c);
  try { localStorage.setItem('newsClosed', c ? '1' : '0'); } catch (e) {}
};
document.getElementById('newsX')?.addEventListener('click', () => setNewsClosed(true));
newsTab?.addEventListener('click', () => setNewsClosed(false));
{ let c = false; try { c = localStorage.getItem('newsClosed') === '1'; } catch (e) {} setNewsClosed(c); }


// ดับเบิลคลิกรายการข่าวที่มีพิกัด → กล้องบินไปที่เกิดเหตุ พร้อมวงแหวนกะพริบ
let flyGoal = null;
const pingRing = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.5, 40), new THREE.MeshBasicMaterial({ color: 0xffc83b, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }));
pingRing.rotation.x = -Math.PI / 2; pingRing.visible = false; scene.add(pingRing);
let pingT = 0;
function focusTile(x, z) {
  const wx = x - N / 2 + 0.5, wz = z - N / 2 + 0.5;
  const dist = camera.position.distanceTo(controls.target);
  flyGoal = { x: wx, z: wz, dist: Math.min(dist, 22), t: 0 };
  pingRing.position.set(wx, tileY(x, z) + 0.12, wz); pingT = 3.2; pingRing.visible = true;
  audio.sfx('select');
}
function updateFly(dt) {
  if (flyGoal) {
    const k = Math.min(1, dt * 4.5);
    const dx = (flyGoal.x - controls.target.x) * k, dz = (flyGoal.z - controls.target.z) * k;
    controls.target.x += dx; controls.target.z += dz; camera.position.x += dx; camera.position.z += dz;
    const off = camera.position.clone().sub(controls.target);
    const d = off.length();
    if (d > flyGoal.dist + 0.2) { off.setLength(d + (flyGoal.dist - d) * k); camera.position.copy(controls.target).add(off); }
    flyGoal.t += dt;
    if (flyGoal.t > 1.6 || (Math.abs(flyGoal.x - controls.target.x) < 0.05 && Math.abs(flyGoal.z - controls.target.z) < 0.05)) flyGoal = null;
  }
  if (pingT > 0) {
    pingT -= dt;
    const u = 1 - pingT / 3.2;
    pingRing.scale.setScalar(0.8 + 1.6 * ((u * 2.2) % 1));
    pingRing.material.opacity = 0.9 * (1 - ((u * 2.2) % 1)) * (pingT > 0.4 ? 1 : pingT / 0.4);
    if (pingT <= 0) pingRing.visible = false;
  }
}
document.addEventListener('dblclick', e => {
  const row = e.target.closest?.('.ni.go');
  if (!row) return;
  const [x, z] = row.dataset.at.split(',').map(Number);
  focusTile(x, z);
});

const popPanel = document.getElementById('popPanel');
let popOpen = false, popTab = 'overview';
const bar = (label, pct, col, val) => `<div class="pb"><span>${escH(label)}</span><div class="pt"><i style="width:${clamp(pct, 0, 100)}%;background:${col}"></i></div><em>${escH(val ?? Math.round(pct) + '%')}</em></div>`;
const moodCol = v => (v >= 70 ? '#66bb6a' : v >= 45 ? '#ffb300' : '#ff5252');
const kv = (k, v, cls = '') => `<div class="kv ${cls}"><span>${escH(k)}</span><b>${v}</b></div>`;
const sec = (title, body) => `<div class="psec"><h4>${escH(title)}</h4>${body}</div>`;
const fmt = n => Math.round(n).toLocaleString();
const money = n => (n < 0 ? '−$' : '$') + fmt(Math.abs(n));

// รายละเอียดเมืองแยกหมวด: ใครใช้ไฟ/น้ำ, โรงผลิต, จำนวนอาคาร
function cityDetail() {
  const cats = ['res', 'com', 'ind', 'service', 'park'];
  const D = { use: { power: {}, water: {} }, plants: { power: {}, water: {} }, bld: {}, inc: { pop: 0, com: 0, ind: 0 }, n: 0 };
  for (const k of cats) { D.use.power[k] = 0; D.use.water[k] = 0; }
  const catOf = tt => (tt === 'farm' ? 'ind' : cats.includes(tt) ? tt : 'park');
  state.tiles.forEach((tl, i) => {
    if (!tl || tl.t === 'part' || tl.t === 'road') return;
    const lv = tl.lv || 0, FV = fixedVariant(tl), c = catOf(tl.t);
    if (tl.t === 'power' || tl.t === 'water') {
      const V = variantOf(tl); D.plants[tl.t][V.k] = (D.plants[tl.t][V.k] || 0) + 1;
      D.bld[tl.t + ':' + V.k] = (D.bld[tl.t + ':' + V.k] || 0) + 1; D.n++; return;
    }
    let pw = 0, wt = 0;
    if (FV) { pw = FV.power || 0; wt = FV.water || 0; }
    else if (tl.t === 'res' || tl.t === 'com' || tl.t === 'ind') { pw = POWER_USE[tl.t][lv]; wt = WATER_USE[tl.t][lv]; }
    else if (tl.t === 'park') wt = 1 + (tl.fw ? tl.fw * tl.fd : 0);
    D.use.power[c] += pw; D.use.water[c] += wt;
    const key = tl.t + ':' + (FV ? tl.v : tl.t === 'park' ? tl.v || 'park' : 'lv' + lv);
    D.bld[key] = (D.bld[key] || 0) + 1; D.n++;
  });
  return D;
}
const bldName = key => {
  const [tool, v] = key.split(':');
  if (v.startsWith('lv')) return t('tool.' + tool) + ' · ' + t('bld.lv', { n: v.slice(2) });
  return t('tool.' + tool) + ' · ' + t('v.' + tool + '.' + v);
};
const CAT_COL = { res: '#64b5f6', com: '#ffb74d', ind: '#a1887f', service: '#ba68c8', park: '#81c784' };

function tabOverview(P) {
  const { s, demo, cc, nd } = P;
  const S = ST();
  const pU = s.powerCap ? 100 * s.powerUse / s.powerCap : 0, wU = s.waterCap ? 100 * s.waterUse / s.waterCap : 0;
  const moodLbl = nd.mood >= 75 ? t('mood.great') : nd.mood >= 50 ? t('mood.ok') : t('mood.bad');
  const cards = [
    [t('hud.money'), money(state.money)], [t('pop.demo'), fmt(s.pop)], [t('ov.jobs'), fmt(s.jobs)],
    [t('fin.net'), (s.net >= 0 ? '+' : '') + fmt(s.net)], [t('ov.day'), state.day], [t('pop.mood'), moodLbl + ' ' + nd.mood + '%'],
  ].map(([k, v]) => `<div class="kc"><small>${escH(k)}</small><b>${escH(v)}</b></div>`).join('');
  return `<div class="kcs">${cards}</div>`
    + sec(t('ov.util'), bar(t('ut.power'), pU, pU > 100 ? '#ff5252' : pU > 85 ? '#ffb300' : '#66bb6a', fmt(s.powerUse) + ' / ' + fmt(s.powerCap))
      + bar(t('ut.water'), wU, wU > 100 ? '#ff5252' : wU > 85 ? '#ffb300' : '#4fc3f7', fmt(s.waterUse) + ' / ' + fmt(s.waterCap)))
    + sec(t('pop.needs'), nd.list.map(n => bar(t('need.' + n.k), n.v, moodCol(n.v))).join('')
      + `<div class="asks">${nd.asks.length ? escH(t('need.ask', { list: nd.asks.map(k => t('need.' + k)).join(' · ') })) : escH(t('need.none'))}</div>`)
    + sec(t('ov.cov'), kv(t('v.service.hospital'), cc.hospital) + kv(t('v.service.school') + ' / ' + t('v.service.bu'), cc.school + ' / ' + cc.bu)
      + kv(t('v.service.police'), cc.police) + kv(t('v.service.fire'), cc.fire) + kv(t('tool.park'), cc.parks))
    + sec(t('pop.stats'), kv(t('pop.acc'), S.acc) + kv(t('pop.inj'), S.inj) + kv(t('pop.dead'), S.dead) + kv(t('pop.fires'), S.fires) + kv(t('pop.crimes'), S.crimes))
    + sec(t('ov.latest'), news.items.slice(0, 4).map(it => `<div class="ni"><i style="background:${KIND_DOT[it.kind]}"></i><div><small>${escH(t('news.time', { d: it.day, c: it.clock }))}</small><span>${escH(newsText(it))}</span></div></div>`).join('') || `<div class="dim">${escH(t('news.empty'))}</div>`);
}
function tabPop(P) {
  const { s, demo, ac, nd } = P;
  const p = Math.max(1, demo.pop), pc = n => Math.round(100 * n / p);
  const emp = Math.min(s.jobs, demo.workers);
  const reg = { car: Math.round(s.pop * 0.32), dog: Math.round(s.pop * 0.09), cat: Math.round(s.pop * 0.07) };
  const g = (k, n, col) => bar(t(k), pc(n), col, fmt(n) + ' (' + pc(n) + '%)');
  return sec(t('pop.demo') + ' — ' + fmt(demo.pop), g('pop.male', demo.male, '#4fc3f7') + g('pop.female', demo.female, '#f06292')
      + g('age.child', demo.child, '#ffd54f') + g('age.youth', demo.youth, '#81c784') + g('age.adult', demo.adult, '#64b5f6') + g('age.elder', demo.elder, '#b39ddb'))
    + sec(t('pop.work'), bar(t('pop.employed'), demo.workers ? 100 * emp / demo.workers : 100, '#4db6ac', fmt(emp) + ' / ' + fmt(demo.workers))
      + kv(t('pop.jobsOpen'), fmt(Math.max(0, s.jobs - demo.workers))) + kv(t('pop.unemployed'), fmt(Math.max(0, demo.workers - s.jobs)))
      + kv(t('ov.jobsCom'), fmt(s.jobsCom)) + kv(t('ov.jobsInd'), fmt(s.jobsInd)))
    + sec(t('pop.vehicles'), kv(t('pop.car'), `${fmt(reg.car)} <small>(${escH(t('pop.onroad', { n: ac.car }))})</small>`)
      + kv(t('pop.dog'), `${fmt(reg.dog)} <small>(${escH(t('pop.onroad', { n: ac.dog }))})</small>`)
      + kv(t('pop.cat'), `${fmt(reg.cat)} <small>(${escH(t('pop.onroad', { n: ac.cat }))})</small>`)
      + kv(t('ov.walkers'), ac.person))
    + sec(t('pop.needs'), nd.list.map(n => bar(t('need.' + n.k), n.v, moodCol(n.v))).join(''));
}
function tabUtil(P, D) {
  const { s } = P;
  const one = (kind, cap, use, col) => {
    const cats = Object.keys(CAT_COL).filter(k => D.use[kind][k] > 0).sort((a, b) => D.use[kind][b] - D.use[kind][a]);
    const tot = Math.max(1, cats.reduce((a, k) => a + D.use[kind][k], 0));
    const plants = Object.entries(D.plants[kind]).map(([k, n]) => kv(t('v.' + kind + '.' + k), n + ' × ' + fmt(VARIANTS[kind].find(v => v.k === k).cap))).join('');
    return sec(t('ut.' + kind), bar(t('ut.use'), cap ? 100 * use / cap : 0, use > cap ? '#ff5252' : col, fmt(use) + ' / ' + fmt(cap))
      + kv(t('ut.spare'), `<span style="color:${cap >= use ? '#66bb6a' : '#ff5252'}">${cap >= use ? fmt(cap - use) : t('ut.short') + ' −' + fmt(use - cap)}</span>`)
      + `<h5>${escH(t('ut.plants'))}</h5>` + (plants || `<div class="dim">${escH(t('ut.none'))}</div>`)
      + `<h5>${escH(t('ut.consumers'))}</h5>` + cats.map(k => bar(t('cat.' + k), 100 * D.use[kind][k] / tot, CAT_COL[k], fmt(D.use[kind][k]))).join(''));
  };
  return one('power', s.powerCap, s.powerUse, '#ffd54f') + one('water', s.waterCap, s.waterUse, '#4fc3f7')
    + `<div class="dim">${escH(t('ut.weather', { t: Math.round(tempC), r: Math.round(weather.state.rain * 100) }))}</div>`;
}
function tabFin(P, D) {
  const { s } = P;
  const inc = Object.entries(s.taxes).map(([k, v]) => ['tax.' + k, v, k]);
  const bUp = s.upkeep - 0; // รวมค่าดูแลอาคาร/โรงผลิต/สวนที่มีค่าดูแลเอง
  const exp = [['fin.exp.road', s.roads * 0.5], ['fin.exp.bridge', s.bridges * 1.5], ['fin.exp.junc', s.junctions * 0.5], ['fin.exp.bld', bUp], ['fin.exp.park', s.parks * 2]];
  const ti = Math.max(1, s.income), te = Math.max(1, s.expense);
  return `<div class="kcs"><div class="kc"><small>${escH(t('hud.money'))}</small><b>${escH(money(state.money))}</b></div>`
    + `<div class="kc"><small>${escH(t('fin.income'))}</small><b style="color:#66bb6a">+${fmt(s.income)}</b></div>`
    + `<div class="kc"><small>${escH(t('fin.expense'))}</small><b style="color:#ff8a65">−${fmt(s.expense)}</b></div></div>`
    + sec(t('fin.taxes'), inc.map(([k, v, g]) => `<div class="tx"><div><b>${escH(t(k))}</b><small>${escH(t(k + '.d'))}</small></div><div class="tb"><div class="pt"><i style="width:${clamp(100 * v / ti, 0, 100)}%;background:#66bb6a"></i></div></div><em>+${fmt(v)}</em></div>`).join('')
      + kv(t('fin.income'), `<span style="color:#66bb6a">+${fmt(s.income)}</span>`))
    + sec(t('fin.expense'), exp.map(([k, v]) => bar(t(k), 100 * v / te, '#ff8a65', '−' + fmt(v))).join(''))
    + sec(t('fin.net'), kv(t('fin.net'), `<span style="color:${s.net >= 0 ? '#66bb6a' : '#ff5252'}">${s.net >= 0 ? '+' : '−'}${fmt(Math.abs(s.net))} / ${escH(t('ov.day'))}</span>`)
      + (s.net < 0 ? kv(t('fin.runway'), t('fin.days', { d: Math.floor(state.money / Math.max(1, -s.net)) })) : ''));
}
function tabBld(P, D) {
  const { s } = P;
  const rows = Object.entries(D.bld).sort((a, b) => a[0].localeCompare(b[0]));
  const groups = {};
  for (const [k, n] of rows) (groups[k.split(':')[0]] ||= []).push([k, n]);
  const order = ['res', 'com', 'ind', 'service', 'power', 'water', 'park', 'farm'];
  return sec(t('bld.total') + ' — ' + D.n, kv(t('bld.roads'), s.roads) + kv(t('bld.bridges'), s.bridges) + kv(t('bld.junc'), s.junctions))
    + order.filter(g => groups[g]).map(g => sec(t('tool.' + g) + ' (' + groups[g].reduce((a, [, n]) => a + n, 0) + ')', groups[g].map(([k, n]) => kv(bldName(k), n)).join(''))).join('')
    || `<div class="dim">${escH(t('ut.none'))}</div>`;
}
function tabNews() {
  return news.items.map(newsRow).join('') || `<div class="dim">${escH(t('news.empty'))}</div>`;
}

let regFilter = 'all';
function tabReg() {
  const R = REG();
  const sh = k => R.byCause[k] || 0;
  const causes = ['old', 'illness', 'rear', 'cutoff', 'race', 'solo', 'slip', 'drunk', 'fire'].filter(k => sh(k) > 0);
  const tot = Math.max(1, R.deaths);
  const ages = R.log.filter(r => r.type === 'death').map(r => r.age);
  const avg = ages.length ? Math.round(ages.reduce((a, b) => a + b, 0) / ages.length) : 0;
  const rows = R.log.filter(r => regFilter === 'all' || r.type === regFilter).slice(0, 60).map(r => {
    const place = r.place ? t('reg.place.' + r.place) : r.road;
    const detail = r.type === 'birth' ? t('reg.born', { place }) : t('reg.diedAt', { place }) + ' · ' + t('reg.cause.' + r.cause);
    return `<div class="rr"><span class="ri">${r.type === 'birth' ? '👶' : '🕊️'}</span><div><b>${escH(nameOf(r))}</b> <small>${r.sex === 'f' ? '♀' : '♂'}${r.type === 'death' ? ' · ' + escH(t('reg.age', { n: r.age })) : ''}</small>`
      + `<small class="rd">${escH(t('news.time', { d: r.day, c: r.clock }))} · ${escH(detail)}</small></div></div>`;
  }).join('') || `<div class="dim">${escH(t('reg.empty'))}</div>`;
  return `<div class="kcs"><div class="kc"><small>${escH(t('reg.births'))}</small><b style="color:#81c784">${fmt(R.births)}</b></div>`
    + `<div class="kc"><small>${escH(t('reg.deaths'))}</small><b style="color:#e57373">${fmt(R.deaths)}</b></div>`
    + `<div class="kc"><small>${escH(t('reg.net'))}</small><b>${R.births - R.deaths >= 0 ? '+' : '−'}${fmt(Math.abs(R.births - R.deaths))}</b></div>`
    + `<div class="kc"><small>${escH(t('reg.avgAge'))}</small><b>${avg || '-'}</b></div></div>`
    + (causes.length ? sec(t('reg.byCause'), causes.map(k => bar(t('reg.cause.' + k), 100 * sh(k) / tot, k === 'old' || k === 'illness' ? '#90a4ae' : '#e57373', fmt(sh(k)))).join('')) : '')
    + `<div class="ptabs sub">${['all', 'birth', 'death'].map(k => `<button data-reg="${k}" class="rf ${k === regFilter ? 'on' : ''}">${escH(t('reg.filter.' + k))}</button>`).join('')}</div>${rows}`;
}
const TABS = ['overview', 'pop', 'reg', 'util', 'fin', 'bld', 'news'];
function renderPop() {
  if (!popPanel || !popOpen) return;
  const keep = popPanel.querySelector('.pbody')?.scrollTop || 0;
  const P = civicSnapshot(), D = cityDetail();
  const body = { overview: tabOverview, pop: tabPop, reg: tabReg, util: tabUtil, fin: tabFin, bld: tabBld, news: tabNews }[popTab](P, D);
  popPanel.innerHTML = `
    <div class="dh"><b>${escH(t('city.title'))}</b><small>${escH(t('side.drag'))}</small><button class="x" id="popClose">${ICON.close}</button></div>
    <div class="ptabs">${TABS.map(k => `<button data-tab="${k}" class="${k === popTab ? 'on' : ''}">${escH(t('tab.' + k))}</button>`).join('')}</div>
    <div class="pbody">${body}</div>`;
  popPanel.querySelector('#popClose').onclick = () => setPopOpen(false);
  popPanel.querySelectorAll('.ptabs button[data-tab]').forEach(b => { b.onclick = () => { popTab = b.dataset.tab; renderPop(); }; });
  popPanel.querySelectorAll('button[data-reg]').forEach(b => { b.onclick = () => { regFilter = b.dataset.reg; renderPop(); }; });
  popPanel.querySelector('.pbody').scrollTop = keep;
}
// ลากหัวหน้าต่างไปทางซ้ายเพื่อเลื่อนปิด (ปล่อยเมื่อเลยครึ่งทางหรือเร็วพอ)
{
  let drag = null;
  popPanel.addEventListener('pointerdown', e => {
    const hd = e.target.closest('.dh');
    if (!hd || e.target.closest('button')) return;
    drag = { x0: e.clientX, t0: performance.now(), dx: 0, w: popPanel.offsetWidth };
    popPanel.classList.add('dragging');
    hd.setPointerCapture?.(e.pointerId);
  });
  popPanel.addEventListener('pointermove', e => {
    if (!drag) return;
    drag.dx = Math.min(0, e.clientX - drag.x0);
    popPanel.style.transform = `translateX(${drag.dx}px)`;
    popPanel.style.opacity = String(1 + drag.dx / (drag.w * 1.3));
  });
  const end = () => {
    if (!drag) return;
    const fast = drag.dx < -50 && (performance.now() - drag.t0) < 350;
    const far = drag.dx < -drag.w * 0.35;
    drag = null;
    popPanel.classList.remove('dragging');
    popPanel.style.transform = ''; popPanel.style.opacity = '';
    if (fast || far) setPopOpen(false);
  };
  popPanel.addEventListener('pointerup', end);
  popPanel.addEventListener('pointercancel', end);
}
function setPopOpen(v, tab) {
  popOpen = v;
  if (tab) popTab = tab;
  popPanel.classList.toggle('show', v);
  document.getElementById('popBtn')?.classList.toggle('closed', !v);
  if (v) renderPop();
}
document.getElementById('popBtn')?.addEventListener('click', () => setPopOpen(!popOpen));
document.getElementById('popCard')?.addEventListener('click', () => setPopOpen(true, 'pop'));
for (const [id, tab] of [['moneyCard', 'fin'], ['powerCard', 'util'], ['waterCard', 'util']]) document.getElementById(id)?.addEventListener('click', () => setPopOpen(true, tab));
window.addEventListener('keydown', e => {
  if (e.key === 'Escape' && popOpen) setPopOpen(false);
  if ((e.key === 'i' || e.key === 'I') && !e.ctrlKey && !e.metaKey && !/INPUT|TEXTAREA/.test(document.activeElement?.tagName || '')) setPopOpen(!popOpen);
});
let popRefresh = 0;
onLang(() => { renderNews(); renderPop(); });

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
  net.textContent = (s.net >= 0 ? '+' : '') + Math.round(s.net * ECON).toLocaleString();
  net.classList.toggle('bad', s.net < 0);
  $('day').textContent = state.day;
  $('powerBar').style.width = clamp(s.powerCap ? 100 * s.powerUse / s.powerCap : 0, 0, 100) + '%';
  $('powerBar').style.background = s.powerUse >= s.powerCap && s.powerUse > 0 ? 'var(--bad)' : s.powerUse > s.powerCap * 0.85 ? 'var(--warn)' : 'var(--good)';
  $('waterBar').style.width = clamp(s.waterCap ? 100 * s.waterUse / s.waterCap : 0, 0, 100) + '%';
  $('waterBar').style.background = s.waterUse >= s.waterCap && s.waterUse > 0 ? 'var(--bad)' : 'var(--teal)';
  { const cn = (activeId && Saves.getSlot(activeId)?.name) || 'Mini City'; if ($('cityName').textContent !== cn) $('cityName').textContent = cn; }
  $('dR').style.height = s.demand.res * 100 + '%';
  $('dC').style.height = s.demand.com * 100 + '%';
  $('dI').style.height = s.demand.ind * 100 + '%';
}

// แถบเครื่องมือ (เอาเมาส์ชี้ปุ่มที่มีตัวเลือกย่อยจะมีเมนูเด้งขึ้นมา)
const toolbar = $('toolbar');
const toolBtns = {};
const toolSmall = {};
const keyLabel = n => (TOOL_KEYS[n] === 'bulldoze' ? 'B' : (n + 1) % 10);
function refreshToolSmall(k) {
  const n = TOOL_KEYS.indexOf(k);
  const V = VARIANTS[k]?.find(v => v.k === currentVar[k]);
  const c = V ? V.cost : TOOLS[k].cost;
  toolSmall[k].textContent = `${c ? '$' + c : t('free')} · ${keyLabel(n)}`;
  const lbl = toolBtns[k].querySelector('.lbl');
  lbl.textContent = V && V.k !== 'zone' && VARIANTS[k].length > 1 ? vLabel(k, V).replace(/ ?[（(].*[）)]/, '') : toolLabel(k);
}
TOOL_KEYS.forEach((k, n) => {
  const b = document.createElement('button');
  b.className = 'tool';
  b.title = VARIANTS[k] ? '' : toolTip(k);
  b.innerHTML = `<span class="ico">${ICON[k] || ICON.com}</span><span class="lbl">${toolLabel(k)}</span><small></small>`;
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
function variantStats(tool, v) {
  const p = [];
  if (v.pop) p.push(t('st.pop', { n: v.pop }));
  if (v.jobs) p.push(t('st.jobs', { n: v.jobs }));
  if (v.cap) p.push(t('st.cap', { n: v.cap }));
  if (v.power || v.water) p.push(t('st.use', { p: v.power, w: v.water }));
  if (v.upkeep) p.push(t('st.upkeep', { n: v.upkeep }));
  if (v.tax) p.push(t('st.tax', { n: v.tax }));
  const note = vNote(tool, v);
  return (p.join(' · ') || '') + (note ? (p.length ? ' — ' : '') + note : '');
}
function showFly(k) {
  clearTimeout(flyTimer);
  if (flyTool !== k || !fly.classList.contains('show')) {
    flyTool = k;
    fly.innerHTML = `<div class="ft">${toolLabel(k)}</div>` + VARIANTS[k].map(v =>
      `<button class="fi${currentVar[k] === v.k ? ' on' : ''}" data-k="${v.k}"><span class="fn">${vLabel(k, v)}</span><span class="fc">$${v.cost.toLocaleString()}</span><span class="fs">${variantStats(k, v)}</span></button>`
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
  placeRot = null;
  refreshToolSmall(flyTool);
  selectTool(flyTool);
  fly.classList.remove('show');
});
document.addEventListener('pointerdown', e => { if (!fly.contains(e.target) && !toolbar.contains(e.target)) fly.classList.remove('show'); });
function rotatePlacement() {
  if (!footFor(currentTool)) return;
  placeRot = placeRot === null ? 0 : (placeRot + 1) % 4;
  audio.sfx('click');
  toast(t('toast.rot', { n: placeRot * 90 }));
  if (lastHoverEvent) updateHover(lastHoverEvent);
}
function selectTool(k) {
  placeRot = null;
  currentTool = k;
  for (const key in toolBtns) toolBtns[key].classList.toggle('active', key === k);
  hoverMesh.visible = k !== 'select' && hoverTile !== null;
  hoverFront.visible = false;
}

document.querySelectorAll('#speed button').forEach(b => {
  b.onclick = () => {
    speed = +b.dataset.s;
    document.querySelectorAll('#speed button').forEach(x => x.classList.toggle('active', x === b));
  };
});
$('reset').onclick = () => {
  if (!confirm(t('confirm.reset'))) return;
  state = newState();
  for (const f of [...fires]) removeFire(f);
  news.clear(); renderNews();
  for (let i = 0; i < N * N; i++) { if (meshes[i]) { disposeTile(meshes[i]); tileGroup.remove(meshes[i]); meshes[i] = null; } }
  swayTiles.clear();
  agents.clear();
  agents.invalidate();
  rebuildAll();
  save();
  updateHUD();
};
window.addEventListener('keydown', e => {
  if (document.body.classList.contains('menu-open')) {
    if (e.key === 'Escape' && menu.inGame) { menu.hide(); resumeFromMenu(); }
    return;
  }
  const n = parseInt(e.key, 10);
  if (n >= 1 && n <= 9 && n <= TOOL_KEYS.length) selectTool(TOOL_KEYS[n - 1]);
  if (e.key === '0') selectTool('farm');
  if (e.key === 'b' || e.key === 'B') selectTool('bulldoze');
  if (e.key === 'r' || e.key === 'R') rotatePlacement();
  if (e.key === 'Escape' && popOpen) { setPopOpen(false); return; }
  if (e.key === 'Escape') { if (currentTool === 'select') openMenu(); else selectTool('select'); }
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

let lastHoverEvent = null;
const hoverFront = new THREE.Mesh(boxGeo, new THREE.MeshBasicMaterial({ color: 0xffe066, transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false }));
hoverFront.visible = false;
scene.add(hoverFront);
function updateHover(e) {
  lastHoverEvent = e;
  hoverTile = pickTile(e);
  hoverFront.visible = false;
  if (!hoverTile || currentTool === 'select') { hoverMesh.visible = false; return; }
  const { x, z } = hoverTile;
  hoverMesh.visible = true;
  if (footFor(currentTool)) {
    const ev = evalBig(currentTool, x, z), R = ev.R;
    let base = 0;
    for (let dz = 0; dz < R.fd; dz++) for (let dx = 0; dx < R.fw; dx++) base = Math.max(base, tileY(R.x0 + dx, R.z0 + dz));
    hoverMesh.scale.set(R.fw, 0.12, R.fd);
    hoverMesh.position.set(R.x0 + R.fw / 2 - N / 2, base + 0.1, R.z0 + R.fd / 2 - N / 2);
    hoverMesh.material.color.set(ev.ok ? 0x66ff88 : 0xff5555);
    // แถบสีเหลืองบอกด้านหน้าอาคาร
    const fx = [0, 1, 0, -1][R.rot], fz = [1, 0, -1, 0][R.rot];
    const along = R.rot % 2 ? R.fd : R.fw;
    hoverFront.visible = true;
    hoverFront.scale.set(R.rot % 2 ? 0.08 : along * 0.6, 0.14, R.rot % 2 ? along * 0.6 : 0.08);
    hoverFront.position.set(hoverMesh.position.x + fx * (R.rot % 2 ? R.fw : R.fd) / 2, base + 0.12, hoverMesh.position.z + fz * (R.rot % 2 ? R.fw : R.fd) / 2);
    return;
  }
  hoverMesh.scale.set(1, 0.12, 1);
  hoverMesh.position.set(x - N / 2 + 0.5, tileY(x, z) + 0.1, z - N / 2 + 0.5);
  if (currentTool === 'bulldoze') {
    const cur = tileAt(x, z);
    if (cur) { // ไฮไลต์ทั้งหลังของอาคารใหญ่
      const mi = masterOf(idx(x, z)), tl = footprintTiles(mi);
      if (tl.length > 1) {
        const mx = mi % N, mz = Math.floor(mi / N), m = state.tiles[mi];
        hoverMesh.scale.set(m.fw, 0.12, m.fd);
        hoverMesh.position.set(mx + m.fw / 2 - N / 2, tileY(x, z) + 0.1, mz + m.fd / 2 - N / 2);
      }
    }
    hoverMesh.material.color.set(cur ? 0xff8844 : 0xff5555);
    return;
  }
  const cur = tileAt(x, z);
  const wOk = isWaterTile(x, z) ? currentTool === 'road' : true;
  const ok = !cur && wOk && state.money >= buildCost(currentTool, x, z);
  hoverMesh.material.color.set(ok ? 0x66ff88 : 0xff5555);
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
  if (currentTool === 'select') boatClick(e);
  if (hoverTile && currentTool === 'select') mosqueClick(hoverTile.x, hoverTile.z);
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
el.addEventListener('pointerleave', () => { hoverMesh.visible = false; hoverFront.visible = false; });

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
const minimap = createMinimap($('minimap'), {
  N, isWater: (x, z) => !!tileIsWater[idx(x, z)], heightAt: (x, z) => tileMaxH[idx(x, z)],
  onPick: (wx, wz) => { const dx = wx - controls.target.x, dz = wz - controls.target.z; controls.target.x += dx; controls.target.z += dz; camera.position.x += dx; camera.position.z += dz; },
});
let mmClock = 0;
function updateMinimap(dt) {
  mmClock -= dt;
  if (mmClock > 0) return;
  mmClock = 0.5;
  if (!state.tiles) return;
  mmDirty -= 1; if (mmDirty <= 0) { mmDirty = 3; minimap.drawTiles(state.tiles); }
  const ox = camera.position.x - controls.target.x, oy = camera.position.y - controls.target.y, oz = camera.position.z - controls.target.z;
  minimap.render({ x: controls.target.x, z: controls.target.z, size: Math.max(3, Math.hypot(ox, oy, oz) * 0.28), ang: Math.atan2(-ox, -oz) + Math.PI });
}
let mmDirty = 0;
$('camOut').onclick = () => zoomBy(1.25);
$('camHome').onclick = () => {
  camera.position.set(N * 0.55, N * 0.5, N * 0.55);
  controls.target.set(0, 0, 0);
};
window.addEventListener('keydown', e => {
  if (document.body.classList.contains('menu-open')) return;
  if (e.key === 'q' || e.key === 'Q') orbitBy(Math.PI / 16);
  if (e.key === 'e' || e.key === 'E') orbitBy(-Math.PI / 16);
  if (e.key === '+' || e.key === '=') zoomBy(0.85);
  if (e.key === '-' || e.key === '_') zoomBy(1.18);
});

// ---------------------------------------------------------------
// แผงตั้งค่า: กราฟิก / โหมดควบคุม
// ---------------------------------------------------------------
const HELP = {
  trackpad: 'ลากสองนิ้ว = เลื่อนแผนที่<br>หนีบนิ้ว (pinch) = ซูม<br>Alt/Option + ลากสองนิ้ว = หมุน<br>คลิก/ลากนิ้วเดียว = สร้าง<br>1–9 เลือกเครื่องมือ, 0 ฟาร์ม, B รื้อ, R หมุนอาคาร, Esc ยกเลิก, Space หยุด',
  mouse: 'ซ้าย (ลาก) = สร้าง<br>ขวา (ลาก) = หมุนกล้อง<br>ล้อเมาส์ = ซูม, ลูกศร = เลื่อน<br>1–9 เลือกเครื่องมือ, 0 ฟาร์ม, B รื้อ, R หมุนอาคาร, Esc ยกเลิก, Space หยุด',
};

function applyControlMode(m) {
  settings.mode = m;
  saveSettings();
  document.querySelectorAll('#mSeg button').forEach(b => b.classList.toggle('active', b.dataset.m === m));
  $('helpText').innerHTML = t('help.' + m);
}

let gtaoPass = null;
function setRtx(on) {
  if (on && !gtaoPass && composer) {
    try {
      gtaoPass = new GTAOPass(scene, camera, window.innerWidth, window.innerHeight);
      gtaoPass.output = GTAOPass.OUTPUT.Default;
      gtaoPass.updateGtaoMaterial({ radius: 0.45, distanceExponent: 1.4, thickness: 1.2, scale: 1.1, samples: 16, distanceFallOff: 1, screenSpaceRadius: false });
      gtaoPass.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, radiusExponent: 1, rings: 2, samples: 16 });
      gtaoPass.blendIntensity = 1.0;
      composer.insertPass(gtaoPass, 1);
    } catch (err) {
      console.warn('เปิด AO ไม่ได้ ข้ามไป:', err);
      gtaoPass = null;
    }
  }
  if (gtaoPass) gtaoPass.enabled = on;
}
function applyQuality(key) {
  const q = QUALITY[key];
  qualityKey = key;
  settings.quality = key;
  saveSettings();

  const ratio = Math.min(window.devicePixelRatio || 1, q.pixelRatio);
  baseRatio = ratio; dynScale = 1;
  renderer.setPixelRatio(ratio);
  renderer.shadowMap.needsUpdate = true;
  renderer.setSize(window.innerWidth, window.innerHeight);
  if (composer) { composer.setPixelRatio(ratio); composer.setSize(window.innerWidth, window.innerHeight); }

  sun.castShadow = q.shadows;
  if (q.shadows && sun.shadow.mapSize.x !== q.shadowSize) {
    sun.shadow.mapSize.set(q.shadowSize, q.shadowSize);
    if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
  }
  useBloom = q.bloom && !!composer;
  setRtx(!!q.rtx && !!composer);
  forest.setCount(q.forest);
  weather.setRainCap(q.rain);
  lastTargetsAt = 0; // คำนวณจำนวนรถ/คนใหม่ทันที

  document.querySelectorAll('#qSeg button').forEach(b => b.classList.toggle('active', b.dataset.q === key));
  $('qDesc').textContent = t('q.' + key + '.desc');

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
  b.title = h ? t('ui.show') : t('ui.hide');
}
$('uiToggle').onclick = () => setUiHidden(!uiHidden);
window.addEventListener('keydown', e => {
  if (document.body.classList.contains('menu-open')) return;
  if (e.key === 'h' || e.key === 'H') setUiHidden(!uiHidden);
});
setUiHidden(false);
// ลิ้นชักตั้งค่า (ขวา) และแถบเครื่องมือ (ล่าง)
{
  const side = $('side'), sideTab = $('sideTab'), dock = $('dock'), toolTab = $('toolTab');
  const setSide = open => { side.classList.toggle('closed', !open); sideTab.classList.toggle('closed', !open); };
  sideTab.onclick = () => setSide(side.classList.contains('closed'));
  $('sideX').onclick = () => setSide(false);
  const setDock = open => { dock.classList.toggle('closed', !open); toolTab.classList.toggle('closed', !open); toolTab.textContent = open ? '⌄' : '⌃'; };
  toolTab.onclick = () => setDock(dock.classList.contains('closed'));
  setSide(false);
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
  const transitCut = 1 - Math.min(0.2, ccache.bus * 0.04);
  agents.setTargets({
    bus: Math.min(ccache.bus * 3, 9), taxi: Math.min(ccache.taxi * 4, 12), grab: Math.min(ccache.grab * 5, 12),
    car: Math.min(Math.round(cars * transitCut), q.cars),
    person: Math.min(Math.round(people), q.people),
    dog: Math.min(Math.round(dogs), Math.ceil(q.pets * 0.55)),
    cat: Math.min(Math.round(cats), Math.floor(q.pets * 0.45)),
  });
}

// ---------------------------------------------------------------
// เมนู / ภาษา / เสียง
// ---------------------------------------------------------------
let pausedSpeed = null;
function resumeFromMenu() { if (pausedSpeed !== null) { speed = pausedSpeed; pausedSpeed = null; } audio.sfx('menu'); }
function openMenu() {
  if (document.body.classList.contains('menu-open')) return;
  save();
  pausedSpeed = speed; speed = 0;
  fly.classList.remove('show');
  menu.show('main', true);
}
function startGame() { audio.init(); }
function setSetting(k, v) {
  switch (k) {
    case 'lang': settings.lang = v; setLang(v); break;
    case 'master': case 'sfx': case 'music': settings[k] = +v; audio.setVolume(k, +v); break;
    case 'mute': settings.mute = !!v; audio.setMute(!!v); break;
    case 'quality': applyQuality(v); break;
    case 'mode': applyControlMode(v); break;
  }
  saveSettings();
}
const menu = createMenu({
  getActive: () => (activeId ? Saves.getSlot(activeId) : null),
  settings: { get: () => settings, set: setSetting },
  sfx: n => audio.sfx(n),
  onResume: resumeFromMenu,
  onContinue: () => { if (pausedSpeed !== null) resumeFromMenu(); else startGame(); },
  onNew: (name, map) => {
    if (activeId) save();
    const id = Saves.createSlot(name, map);
    Saves.setActive(id); Saves.setAutoStart(); location.reload();
  },
  onLoad: id => { if (activeId) save(); Saves.setActive(id); Saves.setAutoStart(); location.reload(); },
  onDeleted: id => { if (id === activeId) { activeId = null; location.reload(); } },
});
$('menuBtn').onclick = openMenu;

onLang(() => {
  TOOL_KEYS.forEach(k => { refreshToolSmall(k); if (!VARIANTS[k]) toolBtns[k].title = toolTip(k); });
  fly.classList.remove('show'); flyTool = null;
  $('qDesc').textContent = t('q.' + qualityKey + '.desc');
  $('helpText').innerHTML = t('help.' + settings.mode);
  setUiHidden(uiHidden);
  rebuildAll(); // ป้ายบนอาคารเปลี่ยนภาษา
  menu.refresh();
});
audio.setVolume('master', settings.master); audio.setVolume('sfx', settings.sfx); audio.setVolume('music', settings.music); audio.setMute(settings.mute);
// เบราว์เซอร์อนุญาตให้เล่นเสียงหลังผู้ใช้กดอะไรสักอย่างเท่านั้น
const unlockAudio = () => { audio.init(); if (audio.ready) { window.removeEventListener('pointerdown', unlockAudio); window.removeEventListener('keydown', unlockAudio); } };
window.addEventListener('pointerdown', unlockAudio);
window.addEventListener('keydown', unlockAudio);

load();
applyControlMode(settings.mode);
applyQuality(settings.quality); // สร้างเมืองครั้งแรกตามระดับกราฟิก
loadModels().then(n => {
  if (n > 0) {
    console.info(`โหลดโมเดล .glb แล้ว ${n} ไฟล์`);
    if (vehicleCount() > 0) { try { wildlife.useModels(); agents.clear(); } catch (e) { console.warn('ใช้โมเดลยานพาหนะไม่สำเร็จ', e); } }
    rebuildAll();
  }
});
selectTool('road');
updateHUD();
updateSky(0);
setLang(settings.lang);
if (!AUTOSTART) menu.show('main', false);

let audioStatsT = 0, prevFlash = 0;
const audioStats = { waterNear: 0, pop: 0, hospital: false, school: false, spots: {} };
function refreshAudioStats() {
  let hospital = false, school = false;
  for (const tl of state.tiles) if (tl && tl.t === 'service') { if (tl.v === 'hospital' || tl.v === 'hospital_p') hospital = true; else if (tl.v === 'school' || tl.v === 'school_p') school = true; }
  const tx = Math.floor(controls.target.x + N / 2), tz = Math.floor(controls.target.z + N / 2);
  let best = 99;
  for (let dz = -12; dz <= 12; dz++) for (let dx = -12; dx <= 12; dx++) if (isWaterTile(tx + dx, tz + dz)) best = Math.min(best, Math.hypot(dx, dz));
  audioStats.waterNear = clamp(1 - best / 12, 0, 1);
  audioStats.pop = computeStats().pop;
  audioStats.hospital = hospital; audioStats.school = school;
  ccache = civicCounts();
  // ความใกล้ของกล้องกับสถานที่ที่มีเสียงประจำตัว (ตำรวจ ดับเพลิง วัด โบสถ์ ตลาด/ห้าง)
  const sp = {};
  const fx = controls.target.x, fz = controls.target.z;
  state.tiles.forEach((tl, i) => {
    if (!tl || tl.t === 'part') return;
    const k = tl.v === 'police' ? 'police' : tl.v === 'fire' ? 'fire' : tl.v === 'temple' ? 'temple' : tl.v === 'church' ? 'church' : tl.v === 'mosque' ? 'mosque' : (tl.v === 'market' || tl.v === 'mall') ? 'market' : null;
    if (!k || (tl.t !== 'service' && tl.t !== 'com')) return;
    const cx = (i % N) + (tl.fw || 1) / 2 - N / 2, cz = Math.floor(i / N) + (tl.fd || 1) / 2 - N / 2;
    const d = Math.hypot(cx - fx, cz - fz);
    const w = 1 - THREE.MathUtils.smoothstep(d, 2.5, 13);
    if (w > (sp[k] || 0)) sp[k] = w;
  });
  audioStats.spots = sp;
  updateAzan(sp.mosque || 0);
}

// เสียงจาก YouTube (ฝังเครื่องเล่นซ่อนไว้ ไม่ได้ดาวน์โหลดไฟล์): อาซานที่มัสยิด / เสียงเรือ
const yt = { loading: false, queue: [] };
function ytWhenReady(cb) {
  if (window.YT && window.YT.Player) { cb(); return; }
  yt.queue.push(cb);
  if (yt.loading) return;
  yt.loading = true;
  try {
    window.onYouTubeIframeAPIReady = () => { yt.queue.splice(0).forEach(f => f()); };
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(s);
  } catch (e) { /* ออฟไลน์/ถูกบล็อก = ข้ามไป */ }
}
function makeYTSound(videoId, hostId) {
  const o = { player: null, ready: false, started: false, on: false };
  o.ensure = () => {
    if (o.started) return;
    o.started = true;
    try {
      const host = document.createElement('div');
      host.id = hostId;
      host.style.cssText = 'position:fixed;width:2px;height:2px;left:-10px;bottom:-10px;opacity:0;pointer-events:none';
      document.body.appendChild(host);
      ytWhenReady(() => {
        o.player = new window.YT.Player(hostId, { videoId, playerVars: { controls: 0, loop: 1, playlist: videoId, playsinline: 1, disablekb: 1 }, events: { onReady: () => { o.ready = true; } } });
      });
    } catch (e) {}
  };
  o.sync = vol => {          // vol 0..1
    if (o.on && !menu.isOpen) o.ensure();
    if (!o.ready) return;
    try {
      if (o.on && !menu.isOpen) {
        o.player.setVolume(Math.round(Math.max(0, Math.min(1, vol)) * 80));
        if (o.player.getPlayerState() !== 1) { if (o.seekRand) { o.player.seekTo(Math.random() * 20, true); o.seekRand = false; } o.player.playVideo(); }
      } else if (o.player.getPlayerState() === 1) o.player.pauseVideo();
    } catch (e) {}
  };
  return o;
}
const azan = makeYTSound('6R44AxFn1p4', 'ytAzan');
const boatSnd = makeYTSound('4kMJYNKc77w', 'ytBoat');
function updateAzan(w) {
  azan.sync(Math.max(0.25, Math.min(1, w)));   // ซูมใกล้มัสยิดจะดังขึ้น
  boatSnd.sync(0.65);
}
// กดมัสยิด 3 ครั้งติดกัน (โหมดดูเมือง) = เปิดเสียงอาซาน, กดอีกครั้ง = ปิด
const mq = { n: 0, t: 0, mi: -1 };
function mosqueClick(x, z) {
  const mi = masterOf(idx(x, z)), tl = state.tiles[mi];
  if (!tl || tl.t !== 'service' || tl.v !== 'mosque') { mq.n = 0; return; }
  if (azan.on) { azan.on = false; mq.n = 0; addNews('info', ['azan.off', {}]); return; }
  const now = performance.now();
  mq.n = (mq.mi === mi && now - mq.t < 800) ? mq.n + 1 : 1;
  mq.mi = mi; mq.t = now;
  if (mq.n >= 3) { mq.n = 0; azan.on = true; azan.ensure(); addNews('info', ['azan.on', {}]); }
}
// กดเรือ 3 ครั้งติดกัน = เปิดเสียงเรือ (เริ่มจากจุดสุ่ม), กดเรือ 1 ครั้ง = ปิด
const bq = { n: 0, t: 0 };
function boatClick(e) {
  const rect = renderer.domElement.getBoundingClientRect();
  mouse.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
  raycaster.setFromCamera(mouse, camera);
  if (!wildlife.hit(raycaster)) { bq.n = 0; return false; }
  if (boatSnd.on) { boatSnd.on = false; bq.n = 0; addNews('info', ['boat.off', {}]); return true; }
  const now = performance.now();
  bq.n = now - bq.t < 800 ? bq.n + 1 : 1; bq.t = now;
  if (bq.n >= 3) { bq.n = 0; boatSnd.on = true; boatSnd.seekRand = true; boatSnd.ensure(); addNews('info', ['boat.on', {}]); }
  return true;
}

let swayFrame = 0;
let fpsAvg = 60;
let cntCache = null, cntT = 0;
const agentCounts = dt => { cntT -= dt; if (!cntCache || cntT <= 0) { cntT = 0.25; cntCache = agents.counts(); } return cntCache; };
const txt = new WeakMap();
const setTxt = (el, v) => { if (txt.get(el) !== v) { txt.set(el, v); el.textContent = v; } };
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

  if (speed > 0 && !menu.isOpen) {
    acc += dt * speed;
    while (acc >= 1) { acc -= 1; tick(); }
  }
  saveAcc += dt;
  if (saveAcc > 5) { saveAcc = 0; if (!menu.isOpen) save(); }

  weather.update(dt);
  const night = updateSky(dt * speed);

  // ไฟจราจรเดินตามความเร็วเกม
  sigClock += dt * speed;
  updateSignalLamps();

  lastTargetsAt -= dt;
  if (lastTargetsAt <= 0) { lastTargetsAt = 1; updateAgentTargets(); }
  agents.update(dt, night, speed, { rain: weather.state.rain, dark: lampLevel, hospital: ccache.hospital + ccache.hospital_p > 0, police: policeCover(), accidentRate: 1 - 0.3 * policeCover(), drunk: ccache.pub > 0 ? clamp(nightLevel * 1.2, 0, 1) * Math.min(1, 0.4 + 0.3 * ccache.pub) * (agents.checkpointActive() ? 0.3 : 1) : 0, cam: camera.position });
  for (const ev of agents.takeEvents()) onAgentEvent(ev);
  animateFires(performance.now() / 1000);
  updateMinimap(dt);
  updateFly(dt);
  drag.update(speed > 0 && !menu.isOpen ? dt * Math.min(speed, 2) : 0);
  animateConstruction(dt, performance.now() / 1000);
  popRefresh -= dt;
  if (popRefresh <= 0) { popRefresh = 1; if (popOpen) renderPop(); }

  // ลม: ต้นไม้โยก, คลื่นน้ำไหลตามทิศลม
  const W = weather.state;
  swayClock += dt;
  const sw1 = swayClock * (1.3 + W.wind * 2.2), sw2 = swayClock * 1.1;
  const swA = 0.015 + 0.09 * W.wind, swB = 0.01 + 0.05 * W.wind;
  swayFrame ^= 1;
  if (swayFrame) for (const arr of swayTiles.values()) {   // อัปเดตต้นไม้สลับเฟรม (ตาแยกไม่ออก แต่เบาลงครึ่งหนึ่ง)
    for (const s of arr) {
      s.obj.rotation.z = Math.sin(sw1 + s.ph) * swA * s.k;
      s.obj.rotation.x = Math.cos(sw2 + s.ph) * swB * s.k;
    }
  }
  const wvec = weather.windVec();
  wildlife.update(dt, { night: nightLevel, rain: W.rain, wind: wvec, windMag: W.wind });
  // เสียง: ยิ่งซูมเข้าใกล้ ยิ่งได้ยินรายละเอียดชัด
  audioStatsT -= dt;
  if (audioStatsT <= 0) { audioStatsT = 0.5; refreshAudioStats(); }
  const camDist = camera.position.distanceTo(controls.target);
  const lightning = W.flash > 0.85 && prevFlash <= 0.85;
  prevFlash = W.flash;
  {
    const ac = agentCounts(dt);
    audio.update(dt, {
      racers: agents.racers(), prox: 1 - THREE.MathUtils.smoothstep(camDist, 9, 52),
      wind: W.wind, rain: W.rain, cars: ac.car, people: ac.person, dogs: ac.dog, cats: ac.cat,
      night: nightLevel, waterNear: audioStats.waterNear, pop: audioStats.pop,
      hospital: audioStats.hospital, school: audioStats.school, spots: audioStats.spots, tod, day: state.day, lightning, ambulance: agents.emergency(),
    });
  }
  controls.autoRotate = menu.isOpen && !menu.inGame;
  waterTime.value += dt * (1 + W.wind * 1.5);
  waterTex.offset.x = (waterTex.offset.x + wvec.x * dt * 0.03 * (1 + W.wind * 3)) % 1;
  waterTex.offset.y = (waterTex.offset.y + wvec.z * dt * 0.03 * (1 + W.wind * 3)) % 1;

  // จำกัดไม่ให้กล้องเลื่อนออกนอกแผนที่มากเกินไป
  controls.target.x = clamp(controls.target.x, -N / 2, N / 2);
  controls.target.z = clamp(controls.target.z, -N / 2, N / 2);
  controls.target.y = 0.4;

  controls.update();
  if (now - lastShadowAt > (fpsAvg < 40 ? 120 : 66)) { lastShadowAt = now; renderer.shadowMap.needsUpdate = true; }
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
    const c = agentCounts(0.5);
    $('fps').textContent = `FPS ${Math.round(fpsFrames / fpsTime)}` + (gpuName ? ` · ${gpuName}` : '');
    setTxt($('live'), t('live', c));
    // นาฬิกา สภาพอากาศ อุณหภูมิ ลม
    setTxt($('clock'), clockText());
    setTxt($('period'), t('tod.' + periodNow));
    { const ik = weather.iconKey(); if (txt.get($('wxIcon')) !== ik) { txt.set($('wxIcon'), ik); $('wxIcon').innerHTML = ICON[ik]; } }
    setTxt($('wxText'), t('wx.' + weather.label()));
    setTxt($('temp'), Math.round(tempC) + '°C');
    setTxt($('windv'), t('wind', { n: Math.round(8 + W.wind * 42) }));
    // ปรับความละเอียดภาพอัตโนมัติ: ถ้า FPS ตก ลดความละเอียดลงทีละนิด ถ้าเหลือแรงก็เพิ่มกลับ
    const fpsNow = fpsFrames / fpsTime;
    fpsAvg = fpsNow;
    dynCool -= fpsTime;
    if (dynCool <= 0 && !menu.isOpen) {
      let ns = dynScale;
      if (fpsNow < 38 && dynScale > 0.55) ns = Math.max(0.55, dynScale - 0.15);
      else if (fpsNow > 58 && dynScale < 1) ns = Math.min(1, dynScale + 0.1);
      if (ns !== dynScale) {
        dynScale = ns; dynCool = 2;
        const r = Math.max(0.6, baseRatio * dynScale);
        renderer.setPixelRatio(r); renderer.setSize(window.innerWidth, window.innerHeight);
        if (composer) { composer.setPixelRatio(r); composer.setSize(window.innerWidth, window.innerHeight); }
      }
    }
    fpsFrames = 0; fpsTime = 0;
  }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
window.addEventListener('beforeunload', save);
