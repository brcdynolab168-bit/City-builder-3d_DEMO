import * as THREE from 'three';
import { pickVehicle } from './vehicles.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// ---------------------------------------------------------------
// ตัวละครที่เคลื่อนไหวในเมือง: รถ (ขับชิดซ้ายแบบไทย), ผู้คน, หมา, แมว, รถพยาบาล
// โมเดลสร้างจากโค้ด: รวมชิ้นส่วนเป็นก้อนเดียวต่อชนิด (ระบายสีที่จุดยอด) เพื่อให้ละเอียดแต่ยังเบา
// มีอุบัติเหตุรถชนเป็นครั้งคราว: ควัน ไฟฉุกเฉิน กรวยจราจร และรถพยาบาลมาช่วย
// ---------------------------------------------------------------

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const clamp01 = v => Math.min(1, Math.max(0, v));
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const angLerp = (a, b, t) => {
  const d = ((((b - a + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) - Math.PI;
  return a + d * t;
};
const pick = arr => arr[(Math.random() * arr.length) | 0];
const rng = seed => { let a = seed * 2654435761 >>> 0; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };

// จุดหยุดหน้าไฟแดง (หน่วย s: 0 = กลางช่อง, 0.5 = ขอบช่อง)
const CAR_STOP = 0.3;
const PED_STOP = 0.4;

// ---------- พลศาสตร์การขับ (หน่วย: ช่อง, วินาทีเกม) ----------
const KMH = 50;              // 50 กม./ชม. = 1 ช่อง/วินาที
const S0 = 0.05;             // ระยะห่างกันชนขั้นต่ำตอนจอดต่อคิว
const B_COMF = 0.7;          // เบรกปกติ
const B_MAX = 4;             // เบรกฉุกเฉินแรงสุด
const TURN_V = 0.5, UTURN_V = 0.25;   // ความเร็วเลี้ยว / กลับรถ
// ระยะจากกลางถนนถึงกลางเลน (ขับชิดซ้าย) ดัชนี 0 = เลนซ้าย (ช้า), 1 = เลนขวา (แซง)
const LANE_LAT = { soi: [0.12], street: [0.15], avenue: [0.32, 0.11], highway: [0.35, 0.14] };
const latHit = (p, q) => Math.abs(p - q) < 0.14;   // อยู่เลนเดียวกัน (ตัวรถกว้าง ~0.15)

export function createAgents({ scene, N, tileType, groundY = () => 0, signal = () => null, roadKind = () => 'street', speedLimit = () => 50 }) {
  const root = new THREE.Group();
  root.name = 'agents';
  scene.add(root);

  // ---------- เรขาคณิต / วัสดุที่ใช้ร่วมกัน ----------
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const cylGeo = new THREE.CylinderGeometry(0.5, 0.5, 1, 12);
  const sphGeo = new THREE.SphereGeometry(0.5, 12, 8);
  const coneGeo = new THREE.ConeGeometry(0.5, 1, 8);
  const skirtGeo = new THREE.CylinderGeometry(0.32, 0.5, 1, 10);

  const mat = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7, metalness: 0, ...o });
  const M = {
    car: [0xc0392b, 0x2e86c1, 0xecf0f1, 0x2c3e50, 0xf1c40f, 0x27ae60, 0x7f8c8d, 0xe67e22, 0x8e44ad, 0x111111, 0xf5f5f5, 0x9aa5ad]
      .map(c => new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.32, metalness: 0.5, clearcoat: 0.8, clearcoatRoughness: 0.12, vertexColors: true })),
    glass: new THREE.MeshStandardMaterial({ color: 0x14202c, roughness: 0.05, metalness: 0.85, vertexColors: true }),
    detail: new THREE.MeshStandardMaterial({ roughness: 0.75, metalness: 0.2, vertexColors: true }),
    head: new THREE.MeshStandardMaterial({ color: 0xfff6d8, emissive: 0xfff0c0, emissiveIntensity: 0, roughness: 0.2, vertexColors: true }),
    tail: new THREE.MeshStandardMaterial({ color: 0xaa1111, emissive: 0xff2200, emissiveIntensity: 0.2, roughness: 0.3, vertexColors: true }),
    haz: new THREE.MeshStandardMaterial({ color: 0xffb020, emissive: 0xff9a00, emissiveIntensity: 1, roughness: 0.3 }),
    vc: new THREE.MeshStandardMaterial({ roughness: 0.78, metalness: 0, vertexColors: true }),
    fur: new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0, vertexColors: true }),
    lamp: new THREE.MeshBasicMaterial({ vertexColors: true, color: 0x8c8c8c }),
    taxi: [0xf06292, 0xfdd835, 0x43a047, 0xf06292].map(c => new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.32, metalness: 0.5, clearcoat: 0.8, clearcoatRoughness: 0.12, vertexColors: true })),
    grab: new THREE.MeshPhysicalMaterial({ color: 0x00b14f, roughness: 0.32, metalness: 0.5, clearcoat: 0.8, clearcoatRoughness: 0.12, vertexColors: true }),
    roofSign: new THREE.MeshBasicMaterial({ color: 0xffe066 }),
    roofSignG: new THREE.MeshBasicMaterial({ color: 0xb9f6ca }),
    smoke: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(() => new THREE.MeshBasicMaterial({ color: 0x777777, transparent: true, opacity: 0.4, depthWrite: false })),
    cone: mat(0xff6a00, { roughness: 0.6 }),
    white: mat(0xf2f2f2, { roughness: 0.5 }),
    red: mat(0xd32f2f, { roughness: 0.5 }),
    strobeR: new THREE.MeshStandardMaterial({ color: 0xff2020, emissive: 0xff0000, emissiveIntensity: 1 }),
    strobeB: new THREE.MeshStandardMaterial({ color: 0x2060ff, emissive: 0x1040ff, emissiveIntensity: 1 }),
    strobeA: new THREE.MeshStandardMaterial({ color: 0xffb020, emissive: 0xff9a00, emissiveIntensity: 2.2 }),
    shroud: mat(0xfafafa, { roughness: 0.95 }),
    vest: mat(0xff7a1a, { roughness: 0.7 }),
    ev: [0xf5f7f8, 0x1fa5a0, 0x2b3a46].map(c => new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.25, metalness: 0.55, clearcoat: 1, clearcoatRoughness: 0.08, vertexColors: true })),
    evGlow: new THREE.MeshBasicMaterial({ color: 0x5ff5e0 }),
  };

  // รวมชิ้นส่วนเป็นเรขาคณิตเดียว (สีที่จุดยอด)
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
  function part(geo, color, px, py, pz, sx, sy, sz, rx = 0, ry = 0, rz = 0) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    _e.set(rx, ry, rz); _q.setFromEuler(_e); _p.set(px, py, pz); _s.set(sx, sy, sz);
    _m.compose(_p, _q, _s);
    g.applyMatrix4(_m);
    const n = g.attributes.position.count, c = new THREE.Color(color), arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv' && k !== 'color') g.deleteAttribute(k);
    return g;
  }
  const merge = list => mergeGeometries(list, false);
  const mesh = (geo, m, shadow = true) => {
    const o = new THREE.Mesh(geo, m);
    o.castShadow = shadow;
    o.receiveShadow = true;
    return o;
  };
  // ปริซึมจากโปรไฟล์ด้านข้าง [z, y] (ด้านหน้า = +z) ความกว้างตามแกน x
  function profile(pts, width, color = 0xffffff, bevel = 0.004) {
    const s = new THREE.Shape();
    pts.forEach(([z, y], i) => (i ? s.lineTo(-z, y) : s.moveTo(-z, y)));
    s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: width, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, steps: 1, curveSegments: 1 });
    g.rotateY(Math.PI / 2);
    g.translate(-width / 2, 0, 0);
    const n = g.attributes.position.count, c = new THREE.Color(color), arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv' && k !== 'color') g.deleteAttribute(k);
    return g.index ? g.toNonIndexed() : g;
  }

  // ---------- รถ: 4 รูปทรง (ซีดาน, แฮทช์แบ็ก, เอสยูวี, กระบะ) ----------
  const carCache = {};
  function carGeos(type) {
    if (carCache[type]) return carCache[type];
    const W = 0.15;
    const body = [], glass = [], detail = [], head = [], tail = [];
    let low, cab, roof, cabW = 0.136;
    if (type === 'suv') {
      low = [[-0.168, 0.032], [0.168, 0.032], [0.172, 0.07], [0.15, 0.092], [0.08, 0.1], [-0.16, 0.1], [-0.172, 0.08]];
      cab = [[-0.15, 0.1], [0.09, 0.1], [0.06, 0.152], [-0.15, 0.152]];
      roof = [[-0.152, 0.146], [0.062, 0.146], [0.06, 0.156], [-0.15, 0.156]];
    } else if (type === 'pickup') {
      low = [[-0.17, 0.032], [0.17, 0.032], [0.174, 0.065], [0.15, 0.088], [0.06, 0.095], [-0.17, 0.095]];
      cab = [[-0.02, 0.095], [0.085, 0.095], [0.05, 0.142], [-0.02, 0.142]];
      roof = [[-0.022, 0.136], [0.052, 0.136], [0.05, 0.146], [-0.02, 0.146]];
    } else if (type === 'hatch') {
      low = [[-0.16, 0.03], [0.16, 0.03], [0.164, 0.06], [0.145, 0.082], [0.07, 0.09], [-0.14, 0.09], [-0.162, 0.075]];
      cab = [[-0.145, 0.09], [0.07, 0.09], [0.035, 0.132], [-0.135, 0.138]];
      roof = [[-0.137, 0.13], [0.037, 0.126], [0.035, 0.136], [-0.135, 0.14]];
    } else {
      low = [[-0.168, 0.03], [0.168, 0.03], [0.172, 0.06], [0.155, 0.083], [0.085, 0.092], [-0.1, 0.092], [-0.158, 0.088], [-0.172, 0.066]];
      cab = [[-0.105, 0.09], [0.08, 0.09], [0.04, 0.13], [-0.07, 0.13]];
      roof = [[-0.072, 0.124], [0.042, 0.124], [0.04, 0.133], [-0.07, 0.133]];
    }
    body.push(profile(low, W), profile(roof, cabW + 0.002));
    glass.push(profile(cab, cabW, 0x1a2a38, 0.002));
    if (type === 'pickup') {
      for (const sx of [-0.071, 0.071]) body.push(part(boxGeo, 0xffffff, sx, 0.112, -0.105, 0.008, 0.035, 0.13));
      body.push(part(boxGeo, 0xffffff, 0, 0.112, -0.17, 0.15, 0.035, 0.008), part(boxGeo, 0xffffff, 0, 0.112, -0.04, 0.15, 0.035, 0.008));
      detail.push(part(boxGeo, 0x2a2a2a, 0, 0.098, -0.105, 0.134, 0.004, 0.126));
    }
    // ล้อ + ดุมล้อ
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      detail.push(part(cylGeo, 0x161616, sx * 0.078, 0.028, sz * 0.105, 0.056, 0.022, 0.056, 0, 0, Math.PI / 2));
      detail.push(part(cylGeo, 0xb8bec4, sx * 0.0885, 0.028, sz * 0.105, 0.032, 0.004, 0.032, 0, 0, Math.PI / 2));
    }
    const fz = type === 'pickup' ? 0.172 : 0.172;
    detail.push(part(boxGeo, 0x2b2b2b, 0, 0.042, fz, 0.152, 0.018, 0.012));              // กันชนหน้า
    detail.push(part(boxGeo, 0x2b2b2b, 0, 0.042, -fz - (type === 'sedan' ? 0 : 0), 0.152, 0.018, 0.012)); // กันชนหลัง
    detail.push(part(boxGeo, 0x111111, 0, 0.064, fz + 0.002, 0.05, 0.016, 0.006));        // กระจังหน้า
    detail.push(part(boxGeo, 0xf2f2f2, 0, 0.056, -fz - 0.008, 0.04, 0.014, 0.004));       // ป้ายทะเบียน
    for (const sx of [-0.052, 0.052]) {
      head.push(part(boxGeo, 0xfff6d8, sx, 0.066, fz + 0.001, 0.034, 0.014, 0.008));
      tail.push(part(boxGeo, 0xdd2a1a, sx, 0.066, -fz - 0.001, 0.034, 0.014, 0.008));
    }
    // กระจกมองข้าง (สีเทาเข้ม)
    for (const sx of [-1, 1]) detail.push(part(boxGeo, 0x222222, sx * 0.083, 0.098, type === 'pickup' ? 0.07 : 0.05, 0.012, 0.012, 0.02));
    const r = { body: merge(body), detail: merge([...glass, ...detail]), lamps: merge([...head, ...tail]) };  // รวมกระจก+ชิ้นส่วนเป็นก้อนเดียว ลด draw call
    carCache[type] = r;
    return r;
  }
  // ตัวแทนว่าง (ใช้กับโมเดล .glb ที่ไม่มีไฟ/ส่วนให้สลับวัสดุ)
  const dummyMesh = () => { const m = new THREE.Mesh(new THREE.BufferGeometry(), M.lamp); m.visible = false; return m; };
  function glbWrap(cat, extra = {}) {
    const v = pickVehicle(cat);
    if (!v) return null;
    try {
      const g = new THREE.Group();
      g.add(v);
      return { obj: g, headMesh: dummyMesh(), tailMesh: dummyMesh(), glb: true, ...extra };
    } catch (e) { console.warn('โมเดล', cat, e); return null; }
  }
  const CAR_TYPES = ['sedan', 'sedan', 'hatch', 'suv', 'pickup', 'hatch'];
  function makeCar(type = pick(CAR_TYPES), bodyMat = pick(M.car), glb = true) {
    const gm = glb && ((Math.random() < 0.09 ? glbWrap('sports') : null) || glbWrap('cars')); if (gm) return gm;
    const G = carGeos(type);
    const g = new THREE.Group();
    const bodyM = mesh(G.body, bodyMat);
    const lamps = mesh(G.lamps, M.lamp, false);
    g.add(bodyM, mesh(G.detail, M.detail), lamps);
    return { obj: g, headMesh: lamps, tailMesh: lamps };
  }
  // รถไฟฟ้า (EV): สีเฉพาะ + แถบไฟ LED หน้ารถสีฟ้าอมเขียว (ใช้โมเดลจากโค้ดเสมอ)
  function makeEV() {
    const made = makeCar(pick(['sedan', 'hatch', 'suv']), pick(M.ev), false);
    const led = mesh(boxGeo, M.evGlow, false);
    led.scale.set(0.12, 0.006, 0.006); led.position.set(0, 0.058, 0.172);
    made.obj.add(led);
    return { ...made, isEV: true };
  }


  // ---------- มอเตอร์ไซค์ (คนขับสวมหมวกกันน็อก) ----------
  const BIKE_COLS = [[0xd32f2f, 0x263238, 0xf5f5f5], [0x1565c0, 0x37474f, 0xffd54f], [0x212121, 0xc62828, 0x212121], [0xfdd835, 0x1b5e20, 0xffffff], [0xeeeeee, 0x6a1b9a, 0xfafafa], [0xef6c00, 0x263238, 0xf5f5f5]];
  const bikeCache = {};
  function bikeGeos(i, grab = false) {
    const key = grab ? 'g' + (i % 3) : i % BIKE_COLS.length;
    if (bikeCache[key]) return bikeCache[key];
    const [paint, jacket, helmet] = grab ? [0x00b14f, 0x00b14f, 0x00b14f] : BIKE_COLS[i % BIKE_COLS.length];
    const base = [], lamps = [], sit = [], lie = [];
    const PANTS_C = 0x2f3e4e;
    // ล้อ (ยาง + ดุม) ฐานล้อ 0.17
    for (const z of [-0.085, 0.088]) {
      base.push(part(cylGeo, 0x141414, 0, 0.03, z, 0.06, 0.02, 0.06, 0, 0, Math.PI / 2));
      base.push(part(cylGeo, 0xc3c9cf, 0, 0.03, z, 0.032, 0.024, 0.032, 0, 0, Math.PI / 2));
    }
    base.push(part(boxGeo, 0x8a9096, 0, 0.066, 0.082, 0.008, 0.08, 0.008, -0.3));           // โช้คหน้า
    base.push(part(boxGeo, paint, 0, 0.07, 0.09, 0.03, 0.008, 0.055));                      // บังโคลนหน้า
    base.push(part(boxGeo, paint, 0, 0.082, 0.05, 0.042, 0.075, 0.012, -0.3));              // บังลม/โล่หน้าขา
    base.push(part(boxGeo, paint, 0, 0.118, 0.062, 0.042, 0.032, 0.03));                    // หัวไฟ
    base.push(part(boxGeo, 0x202020, 0, 0.128, 0.04, 0.08, 0.008, 0.008));                  // แฮนด์
    for (const sx of [-1, 1]) {
      base.push(part(boxGeo, 0x202020, sx * 0.042, 0.128, 0.04, 0.012, 0.012, 0.014));      // กริป
      base.push(part(boxGeo, 0x9fb0bd, sx * 0.036, 0.15, 0.036, 0.016, 0.014, 0.004));      // กระจกมองข้าง
    }
    base.push(part(boxGeo, 0x252525, 0, 0.044, 0.0, 0.044, 0.008, 0.1));                    // พื้นวางเท้า
    base.push(part(boxGeo, paint, 0, 0.062, -0.052, 0.036, 0.04, 0.08));                    // ถัง/ตัวถังกลาง
    base.push(part(boxGeo, 0x222222, 0, 0.092, -0.05, 0.038, 0.016, 0.105));               // เบาะ
    base.push(part(boxGeo, paint, 0, 0.074, -0.098, 0.034, 0.034, 0.05));                   // ฝาท้าย
    base.push(part(boxGeo, 0x8a9096, 0, 0.098, -0.118, 0.034, 0.006, 0.04));                // ตะแกรงหลัง
    base.push(part(cylGeo, 0xb8bec4, 0.027, 0.043, -0.08, 0.014, 0.075, 0.014, Math.PI / 2)); // ท่อไอเสีย
    base.push(part(boxGeo, 0x303030, 0, 0.044, -0.03, 0.03, 0.03, 0.04));                   // เครื่องยนต์
    // คนขับนั่งปกติ
    sit.push(part(boxGeo, jacket, 0, 0.138, -0.048, 0.044, 0.066, 0.032, 0.28));            // ลำตัว
    sit.push(part(sphGeo, helmet, 0, 0.188, -0.026, 0.04, 0.04, 0.042));                    // หมวกกันน็อก
    sit.push(part(boxGeo, 0x1c1c1c, 0, 0.186, -0.007, 0.03, 0.012, 0.01));                  // กระจกหมวก
    for (const sx of [-1, 1]) {
      sit.push(part(boxGeo, jacket, sx * 0.032, 0.14, -0.0, 0.011, 0.011, 0.09, 0.12));      // แขน
      sit.push(part(boxGeo, PANTS_C, sx * 0.024, 0.1, -0.012, 0.016, 0.016, 0.075, -0.12));  // ต้นขา
      sit.push(part(boxGeo, PANTS_C, sx * 0.026, 0.066, 0.03, 0.015, 0.055, 0.015, 0.3));    // หน้าแข้ง
    }
    // คนขับนอนราบกับตัวรถ (ท่าซิ่ง)
    lie.push(part(boxGeo, jacket, 0, 0.122, -0.04, 0.044, 0.03, 0.115));                    // ลำตัวนอนราบ
    lie.push(part(sphGeo, helmet, 0, 0.135, 0.044, 0.04, 0.04, 0.042));                     // หัวยื่นไปหน้า
    lie.push(part(boxGeo, 0x1c1c1c, 0, 0.135, 0.062, 0.03, 0.012, 0.01));
    for (const sx of [-1, 1]) {
      lie.push(part(boxGeo, jacket, sx * 0.03, 0.124, 0.02, 0.011, 0.011, 0.1, 0.05));       // แขนเหยียดตรง
      lie.push(part(boxGeo, PANTS_C, sx * 0.02, 0.108, -0.125, 0.015, 0.015, 0.1, -0.08));   // ขาเหยียดไปข้างหลัง
    }
    lamps.push(part(boxGeo, 0xfff6d8, 0, 0.118, 0.079, 0.03, 0.02, 0.008));
    lamps.push(part(boxGeo, 0xdd2a1a, 0, 0.078, -0.125, 0.026, 0.014, 0.008));
    return (bikeCache[key] = { body: merge([...base, ...sit]), lie: merge([...base, ...lie]), bare: merge(base), lamps: merge(lamps) });
  }
  // คนขับที่กระเด็นมานอนบนถนนหลังล้ม (ใช้ตอนรถซิ่งล้ม)
  const riderCache = [];
  function riderLieGeo(i) {
    i %= BIKE_COLS.length;
    if (riderCache[i]) return riderCache[i];
    const [, jacket, helmet] = BIKE_COLS[i], L = [];
    L.push(part(boxGeo, jacket, 0, 0.012, 0, 0.044, 0.024, 0.1));
    L.push(part(sphGeo, helmet, 0, 0.02, 0.07, 0.04, 0.04, 0.042));
    for (const sx of [-1, 1]) {
      L.push(part(boxGeo, 0x2f3e4e, sx * 0.014, 0.01, -0.09, 0.016, 0.016, 0.085, 0, sx * 0.15));
      L.push(part(boxGeo, jacket, sx * 0.035, 0.012, 0.035, 0.011, 0.011, 0.08, 0, sx * -0.5));
    }
    return (riderCache[i] = merge(L));
  }
  function makeBike(grab = false, stunt = false) {
    const gm = glbWrap('bikes');
    if (gm) {
      const rig = new THREE.Group(); rig.position.set(0, 0.03, -0.085);
      const inner = new THREE.Group(); inner.position.set(0, -0.03, 0.085);
      inner.add(gm.obj.children[0]); rig.add(inner); gm.obj.add(rig);
      return { ...gm, rig, bodyMesh: dummyMesh(), lieMesh: null, bareMesh: null, isBike: true, pitch: 0 };
    }
    const G = bikeGeos((Math.random() * 12) | 0, grab);
    const g = new THREE.Group();
    const rig = new THREE.Group();          // จุดหมุนอยู่ที่ล้อหลัง (ไว้ยกหน้า)
    rig.position.set(0, 0.03, -0.085);
    const inner = new THREE.Group();
    inner.position.set(0, -0.03, 0.085);
    const lamps = mesh(G.lamps, M.lamp, false);
    const body = mesh(G.body, M.vc, false);
    inner.add(body, lamps);
    let lie = null;
    let bare = null;
    if (stunt) { lie = mesh(G.lie, M.vc, false); lie.visible = false; inner.add(lie); bare = mesh(G.bare, M.vc, false); bare.visible = false; inner.add(bare); }
    rig.add(inner); g.add(rig);
    return { obj: g, rig, bodyMesh: body, lieMesh: lie, bareMesh: bare, headMesh: lamps, tailMesh: lamps, isBike: true, pitch: 0 };
  }

  // ---------- รถเมล์ ----------
  const BUS_COLS = [[0xd32f2f, 0xf5f5f5], [0xef6c00, 0xf5f5f5], [0x1e88e5, 0xf5f5f5]];
  const busCache = [];
  function busGeos(i) {
    if (busCache[i]) return busCache[i];
    const [c1, c2] = BUS_COLS[i % BUS_COLS.length];
    const b = [], lamps = [];
    b.push(part(boxGeo, c1, 0, 0.085, 0, 0.15, 0.1, 0.58));
    b.push(part(boxGeo, c2, 0, 0.145, 0, 0.15, 0.036, 0.58));
    b.push(part(boxGeo, 0x14202c, 0, 0.12, 0, 0.152, 0.04, 0.5));                   // แถบกระจก
    b.push(part(boxGeo, 0x14202c, 0, 0.112, 0.292, 0.13, 0.05, 0.004));              // กระจกหน้า
    b.push(part(boxGeo, 0x222222, 0, 0.14, 0.294, 0.1, 0.014, 0.004));              // ป้ายสาย
    for (const sz of [-0.2, 0.2]) for (const sx of [-1, 1]) b.push(part(cylGeo, 0x161616, sx * 0.076, 0.03, sz, 0.06, 0.024, 0.06, 0, 0, Math.PI / 2));
    lamps.push(part(boxGeo, 0xfff6d8, -0.05, 0.05, 0.292, 0.03, 0.016, 0.006), part(boxGeo, 0xfff6d8, 0.05, 0.05, 0.292, 0.03, 0.016, 0.006));
    lamps.push(part(boxGeo, 0xdd2a1a, -0.05, 0.05, -0.292, 0.03, 0.016, 0.006), part(boxGeo, 0xdd2a1a, 0.05, 0.05, -0.292, 0.03, 0.016, 0.006));
    return (busCache[i] = { body: merge(b), lamps: merge(lamps) });
  }
  function makeBus() {
    const gm = glbWrap('buses'); if (gm) return gm;
    const G = busGeos((Math.random() * 3) | 0);
    const g = new THREE.Group();
    const lamps = mesh(G.lamps, M.lamp, false);
    g.add(mesh(G.body, M.vc), lamps);
    return { obj: g, headMesh: lamps, tailMesh: lamps };
  }
  // แท็กซี่/แกร็บ: รถปกติ + ป้ายไฟบนหลังคา
  function makeTaxiLike(grab) {
    if (!grab) { const tx = glbWrap('taxis'); if (tx) return tx; }
    const made = grab ? makeCar(pick(CAR_TYPES), M.grab) : makeCar('sedan', pick(M.taxi));
    if (made.glb) return made;
    const sign = new THREE.Mesh(boxGeo, grab ? M.roofSignG : M.roofSign);
    sign.scale.set(0.05, 0.02, 0.03); sign.position.set(0, 0.168, -0.01);
    made.obj.add(sign);
    return made;
  }

  // รถพยาบาล (แวนสีขาว แถบแดง ไฟสัญญาณ)
  let ambGeo = null;
  function makeAmbulance() {
    if (!ambGeo) {
      const body = [], glass = [], det = [];
      body.push(profile([[-0.19, 0.03], [0.17, 0.03], [0.176, 0.07], [0.15, 0.098], [0.1, 0.108], [0.085, 0.17], [-0.19, 0.17]], 0.16, 0xf6f6f6));
      glass.push(part(boxGeo, 0xffffff, 0, 0.14, 0.095, 0.15, 0.04, 0.03, -0.55, 0, 0));
      body.push(part(boxGeo, 0xd32f2f, 0, 0.09, 0, 0.162, 0.018, 0.34));
      det.push(part(boxGeo, 0xd32f2f, 0.081, 0.13, -0.05, 0.004, 0.06, 0.016), part(boxGeo, 0xd32f2f, 0.081, 0.13, -0.05, 0.004, 0.016, 0.06));
      det.push(part(boxGeo, 0xd32f2f, -0.081, 0.13, -0.05, 0.004, 0.06, 0.016), part(boxGeo, 0xd32f2f, -0.081, 0.13, -0.05, 0.004, 0.016, 0.06));
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) det.push(part(cylGeo, 0x161616, sx * 0.082, 0.03, sz * 0.11, 0.06, 0.024, 0.06, 0, 0, Math.PI / 2));
      det.push(part(boxGeo, 0x2b2b2b, 0, 0.042, 0.178, 0.158, 0.018, 0.012));
      ambGeo = { body: merge(body), glass: merge(glass), det: merge(det) };
    }
    const g = new THREE.Group();
    g.add(mesh(ambGeo.body, M.car[10]), mesh(ambGeo.glass, M.glass, false), mesh(ambGeo.det, M.detail));
    const lr = mesh(boxGeo, M.strobeR, false), lb = mesh(boxGeo, M.strobeB, false);
    lr.scale.set(0.06, 0.02, 0.03); lr.position.set(-0.04, 0.18, 0.05);
    lb.scale.set(0.06, 0.02, 0.03); lb.position.set(0.04, 0.18, 0.05);
    g.add(lr, lb);
    return { obj: g, lr, lb };
  }


  // รถยกลากรถเสีย (รถบรรทุกพื้นเรียบ ห้องคนขับสีส้ม ไฟหมุนสีเหลือง)
  let towGeo = null;
  function makeTow() {
    if (!towGeo) {
      const body = [], glass = [], det = [];
      body.push(part(boxGeo, 0xf28c1e, 0, 0.1, 0.2, 0.15, 0.1, 0.15));                 // ห้องคนขับ
      body.push(part(boxGeo, 0x3a3f46, 0, 0.055, -0.02, 0.15, 0.03, 0.62));          // แชสซีส์
      body.push(part(boxGeo, 0x6f7882, 0, 0.082, -0.1, 0.16, 0.022, 0.44));          // พื้นกระบะ
      body.push(part(boxGeo, 0xf28c1e, 0, 0.1, 0.1, 0.16, 0.06, 0.02));              // กั้นหลังห้องคนขับ
      glass.push(part(boxGeo, 0xffffff, 0, 0.125, 0.268, 0.13, 0.05, 0.012));
      det.push(part(boxGeo, 0x222222, 0, 0.042, 0.292, 0.15, 0.02, 0.016));
      det.push(part(boxGeo, 0xffd54a, 0.078, 0.07, -0.1, 0.004, 0.012, 0.44), part(boxGeo, 0xffd54a, -0.078, 0.07, -0.1, 0.004, 0.012, 0.44));
      for (const z of [-0.24, -0.06, 0.22]) for (const sx of [-1, 1]) det.push(part(cylGeo, 0x161616, sx * 0.082, 0.032, z, 0.064, 0.026, 0.064, 0, 0, Math.PI / 2));
      towGeo = { body: merge(body), glass: merge(glass), det: merge(det) };
    }
    const g = new THREE.Group();
    g.add(mesh(towGeo.body, M.car[10]), mesh(towGeo.glass, M.glass, false), mesh(towGeo.det, M.detail));
    const lr = mesh(boxGeo, M.strobeR, false), lb = mesh(boxGeo, M.strobeB, false);
    lr.scale.set(0.04, 0.025, 0.03); lr.position.set(0, 0.19, 0.2); lb.visible = false;
    g.add(lr);
    return { obj: g, lr, lb: lr };
  }

  // รถบริการ: rescue = รถกู้ภัยมูลนิธิ (รับร่างผู้เสียชีวิต), power = การไฟฟ้า (รถกระเช้า), water = การประปา (รถบรรทุกน้ำ/ซ่อมท่อ), road = กรมทางหลวง (รถซ่อมถนน)
  const truckGeo = {};
  function makeServiceTruck(kind) {
    let G = truckGeo[kind];
    if (!G) {
      const body = [], glass = [], det = [];
      body.push(part(boxGeo, 0x3a3f46, 0, 0.055, -0.02, 0.15, 0.03, 0.5));
      for (const z of [-0.2, -0.02, 0.17]) for (const sx of [-1, 1]) det.push(part(cylGeo, 0x161616, sx * 0.082, 0.032, z, 0.064, 0.026, 0.064, 0, 0, Math.PI / 2));
      det.push(part(boxGeo, 0x222222, 0, 0.042, 0.255, 0.15, 0.02, 0.016));
      if (kind === 'rescue') {
        body.push(part(boxGeo, 0xf4f4f4, 0, 0.115, -0.02, 0.155, 0.12, 0.46));
        body.push(part(boxGeo, 0xf4f4f4, 0, 0.098, 0.238, 0.15, 0.07, 0.04));
        glass.push(part(boxGeo, 0xffffff, 0, 0.14, 0.224, 0.13, 0.05, 0.012));
        for (const sx of [-1, 1]) {
          det.push(part(boxGeo, 0x1565c0, sx * 0.079, 0.1, -0.02, 0.004, 0.03, 0.46));
          det.push(part(boxGeo, 0xd32f2f, sx * 0.08, 0.14, -0.1, 0.004, 0.045, 0.014), part(boxGeo, 0xd32f2f, sx * 0.08, 0.14, -0.1, 0.004, 0.014, 0.045));
        }
        det.push(part(boxGeo, 0x2b2b2b, 0, 0.115, -0.252, 0.12, 0.09, 0.008));
      } else {
        const cab = kind === 'power' ? 0xf5f5f5 : kind === 'water' ? 0x1976d2 : kind === 'cargo' ? 0xe8e8e8 : 0x0d47a1;
        body.push(part(boxGeo, cab, 0, 0.1, 0.17, 0.15, 0.1, 0.13));
        glass.push(part(boxGeo, 0xffffff, 0, 0.122, 0.236, 0.13, 0.05, 0.012));
        if (kind === 'power') {
          body.push(part(boxGeo, 0x8a8f96, 0, 0.082, -0.1, 0.16, 0.022, 0.34));
          for (const sx of [-1, 1]) det.push(part(boxGeo, 0xf28c1e, sx * 0.077, 0.1, 0.17, 0.004, 0.03, 0.13));
          body.push(part(boxGeo, 0xf2a81d, 0, 0.12, -0.2, 0.05, 0.06, 0.05));
          body.push(part(boxGeo, 0xf2a81d, 0, 0.17, -0.08, 0.028, 0.028, 0.34, -0.3, 0, 0));
          body.push(part(boxGeo, 0xf2a81d, 0, 0.21, 0.07, 0.07, 0.05, 0.07));
        } else if (kind === 'water') {
          body.push(part(boxGeo, 0x6f7882, 0, 0.082, -0.1, 0.16, 0.022, 0.34));
          body.push(part(cylGeo, 0xe8f1fa, 0, 0.14, -0.1, 0.115, 0.32, 0.115, Math.PI / 2, 0, 0));
          for (const z of [-0.2, -0.04]) body.push(part(cylGeo, 0x1976d2, 0, 0.14, z, 0.12, 0.03, 0.12, Math.PI / 2, 0, 0));
        } else if (kind === 'cargo') {
          body.push(part(boxGeo, 0x1e5aa8, 0, 0.14, -0.08, 0.16, 0.14, 0.36));                                         // ตู้คอนเทนเนอร์
          for (let k = 0; k < 6; k++) det.push(part(boxGeo, 0x174a8c, 0, 0.14, -0.24 + k * 0.064, 0.164, 0.12, 0.01));   // ลอนตู้
        } else {
          body.push(part(boxGeo, 0xf9c80e, 0, 0.11, -0.1, 0.16, 0.07, 0.32));
          det.push(part(boxGeo, 0x222222, 0, 0.2, -0.265, 0.15, 0.08, 0.01), part(boxGeo, 0xffb020, 0, 0.2, -0.272, 0.1, 0.02, 0.004));
        }
      }
      G = truckGeo[kind] = { body: merge(body), glass: merge(glass), det: merge(det) };
    }
    const g = new THREE.Group();
    g.add(mesh(G.body, M.car[10]), mesh(G.glass, M.glass, false), mesh(G.det, M.detail));
    let lr, lb;
    if (kind === 'rescue') {
      lr = mesh(boxGeo, M.strobeR, false); lb = mesh(boxGeo, M.strobeB, false);
      lr.scale.set(0.05, 0.02, 0.03); lr.position.set(-0.04, 0.19, 0.04);
      lb.scale.set(0.05, 0.02, 0.03); lb.position.set(0.04, 0.19, 0.04);
      g.add(lr, lb);
    } else if (kind === 'cargo') {
      lr = lb = dummyMesh();   // รถบรรทุกสินค้าไม่มีไฟฉุกเฉิน
    } else {
      lr = mesh(boxGeo, M.strobeA, false); lr.scale.set(0.05, 0.024, 0.03); lr.position.set(0, 0.165, 0.17);
      g.add(lr); lb = lr;
    }
    return { obj: g, lr, lb };
  }

  // ---------- คน: 28 แบบ (ทรงผม เสื้อผ้า กระเป๋า หมวก) ----------
  const SKIN = [0xf1c9a5, 0xd9a47c, 0xb07a52, 0x7a4e32, 0xe8b894];
  const HAIR = [0x1b1410, 0x3a2a1c, 0x6b4a2b, 0x9a9a9a, 0x0e0e0e];
  const CLOTH = [0xd9534f, 0x3b82c4, 0xf0ad4e, 0x5cb85c, 0xeeeeee, 0x7e57c2, 0x2f3e4e, 0xff8fab, 0x1f8a70, 0xf2d03b];
  const PANTS = [0x2f3e4e, 0x3b3b3b, 0x6b5a45, 0x28455e, 0x1c1c1c, 0x8a7d62];
  const personCache = [];
  function personGeos(i) {
    if (personCache[i]) return personCache[i];
    const R = rng(i + 7);
    const pk = a => a[Math.floor(R() * a.length)];
    const skin = pk(SKIN), hair = pk(HAIR), cloth = pk(CLOTH), pants = pk(PANTS);
    const female = R() < 0.45, dress = female && R() < 0.5, longSleeve = R() < 0.35;
    const shoe = pk([0x1a1a1a, 0xf0f0f0, 0x5b3a1e]);
    const school = R() < 0.1;
    const shirt = school ? 0xf4f4f4 : cloth, bottom = school ? 0x1f2f5a : pants;
    const body = [];
    body.push(part(boxGeo, bottom, 0, 0.076, 0, 0.04, 0.016, 0.024));                    // สะโพก
    body.push(part(boxGeo, shirt, 0, 0.108, 0, 0.046, 0.052, 0.026));                    // ลำตัว
    body.push(part(boxGeo, shirt, 0, 0.133, 0, 0.056, 0.008, 0.028));                   // ไหล่
    if (dress) body.push(part(skirtGeo, shirt, 0, 0.07, 0, 0.056, 0.05, 0.04));
    if (female && !dress) body.push(part(skirtGeo, bottom, 0, 0.082, 0, 0.046, 0.022, 0.03));
    body.push(part(cylGeo, skin, 0, 0.14, 0, 0.012, 0.012, 0.012));                     // คอ
    body.push(part(sphGeo, skin, 0, 0.152, 0, 0.032, 0.036, 0.034));                     // หัว
    body.push(part(sphGeo, 0x222222, 0.007, 0.153, 0.016, 0.005, 0.005, 0.004), part(sphGeo, 0x222222, -0.007, 0.153, 0.016, 0.005, 0.005, 0.004));
    const hs = R();
    if (hs < 0.4) body.push(part(sphGeo, hair, 0, 0.16, -0.003, 0.036, 0.028, 0.038));  // ผมสั้น
    else if (hs < 0.75) { body.push(part(sphGeo, hair, 0, 0.16, -0.003, 0.037, 0.03, 0.04)); body.push(part(boxGeo, hair, 0, 0.142, -0.016, 0.032, 0.05, 0.012)); } // ผมยาว
    else body.push(part(sphGeo, hair, 0, 0.162, -0.002, 0.036, 0.022, 0.037));
    if (R() < 0.18) { body.push(part(coneGeo, pk([0xc0392b, 0xf1c40f, 0x2c3e50]), 0, 0.178, 0, 0.05, 0.026, 0.05)); }       // หมวก
    if (R() < 0.3) body.push(part(boxGeo, pk([0x2f3e4e, 0xc0392b, 0x1f8a70]), 0, 0.108, -0.02, 0.034, 0.042, 0.014));       // เป้
    else if (R() < 0.3) body.push(part(boxGeo, 0x6b4a2b, 0.034, 0.085, 0.004, 0.012, 0.022, 0.026));                     // กระเป๋าถือ
    const leg = merge([
      part(boxGeo, bottom, 0, -0.017, 0, 0.017, 0.036, 0.02),
      part(boxGeo, dress ? skin : bottom, 0, -0.05, 0.001, 0.014, 0.034, 0.017),
      part(boxGeo, shoe, 0, -0.072, 0.006, 0.016, 0.01, 0.032),
    ]);
    const sleeveC = longSleeve || school ? shirt : shirt;
    const arm = merge([
      part(boxGeo, sleeveC, 0, -0.015, 0, 0.012, 0.032, 0.014),
      part(boxGeo, longSleeve ? shirt : skin, 0, -0.043, 0.004, 0.011, 0.026, 0.012, -0.15),
      part(sphGeo, skin, 0, -0.06, 0.008, 0.012, 0.012, 0.012),
    ]);
    const at = (g, x, y, z) => { const c = g.clone(); c.translate(x, y, z); return c; };
    const bodyG = merge(body);
    const r = { body: bodyG, leg, arm, full: merge([bodyG, at(leg, -0.012, 0.074, 0), at(leg, 0.012, 0.074, 0), at(arm, -0.034, 0.131, 0), at(arm, 0.034, 0.131, 0)]) };
    personCache[i] = r;
    return r;
  }
  function makePerson() {
    const G = personGeos(Math.floor(Math.random() * 28));
    const g = new THREE.Group();
    const bodyM = mesh(G.body, M.vc, false);
    g.add(bodyM);
    const legs = [], arms = [], lodParts = [bodyM];
    for (const sx of [-1, 1]) {
      const leg = new THREE.Group();
      leg.position.set(sx * 0.012, 0.074, 0);
      leg.add(mesh(G.leg, M.vc, false));
      g.add(leg); legs.push(leg); lodParts.push(leg);
      const arm = new THREE.Group();
      arm.position.set(sx * 0.034, 0.131, 0);
      arm.add(mesh(G.arm, M.vc, false));
      g.add(arm); arms.push(arm); lodParts.push(arm);
    }
    // โมเดลไกล: รวมทั้งตัวเป็นชิ้นเดียว (ไม่แกว่งแขนขา) ใช้ draw call เดียว
    const full = mesh(G.full, M.vc, false); full.visible = false; g.add(full);
    return { obj: g, legs, arms, lodParts, full, near: true };
  }

  // ---------- หมา / แมว ----------
  const FUR = [[0x8b5a2b, 0xe3c9a0], [0x1d1d1d, 0x6a5a48], [0xe8e0d0, 0xbda684], [0xc99a5b, 0xf3e3c2], [0x7d7d7d, 0xdedede], [0xd8b27a, 0xffffff]];
  const dogCache = [], catCache = [];
  function dogGeos(i) {
    if (dogCache[i]) return dogCache[i];
    const R = rng(i + 91);
    const [c1, c2] = FUR[i % FUR.length];
    const floppy = R() < 0.5, big = R() < 0.4, k = big ? 1.1 : 0.9;
    const b = [];
    b.push(part(sphGeo, c1, 0, 0.06, 0, 0.04 * k, 0.042 * k, 0.09 * k));                 // ลำตัว
    b.push(part(sphGeo, c1, 0, 0.065, 0.032, 0.044 * k, 0.048 * k, 0.045 * k));          // อก
    b.push(part(sphGeo, c2, 0, 0.048, 0.0, 0.034 * k, 0.02, 0.07 * k));                  // ท้อง
    b.push(part(cylGeo, c1, 0, 0.076, 0.05 * k, 0.022, 0.03, 0.022, 0.5));                // คอ
    b.push(part(sphGeo, c1, 0, 0.088, 0.064 * k, 0.034, 0.032, 0.04));                   // หัว
    b.push(part(boxGeo, c2, 0, 0.08, 0.088 * k, 0.02, 0.016, 0.028));                    // จมูกยาว
    b.push(part(sphGeo, 0x111111, 0, 0.083, 0.102 * k, 0.009, 0.007, 0.007));            // จมูก
    for (const sx of [-1, 1]) {
      b.push(part(sphGeo, 0x111111, sx * 0.011, 0.093, 0.078 * k, 0.005, 0.005, 0.004));
      if (floppy) b.push(part(boxGeo, c1 === 0x1d1d1d ? 0x111111 : c1, sx * 0.019, 0.088, 0.058 * k, 0.006, 0.026, 0.016, 0, 0, sx * 0.25));
      else b.push(part(coneGeo, c1, sx * 0.012, 0.11, 0.056 * k, 0.014, 0.024, 0.01));
    }
    // หาง: ลูกกลมต่อกันเป็นเส้นโค้งชี้ขึ้น ติดกับก้นหมา
    [[0.07, -0.046, 0.016], [0.078, -0.058, 0.015], [0.088, -0.068, 0.014], [0.099, -0.075, 0.013], [0.11, -0.078, 0.012]]
      .forEach(([y, z, d], i, a) => b.push(part(sphGeo, i === a.length - 1 ? c2 : c1, 0, y, z * k, d * k, d * k, d * k * 1.2)));
    const leg = merge([
      part(boxGeo, c1, 0, -0.0125, 0, 0.012, 0.026, 0.014),
      part(boxGeo, c1, 0, -0.034, 0.001, 0.009, 0.022, 0.01),
      part(boxGeo, c2, 0, -0.046, 0.004, 0.011, 0.006, 0.016),
    ]);
    return (dogCache[i] = { body: merge(b), leg, k });
  }
  function catGeos(i) {
    if (catCache[i]) return catCache[i];
    const [c1, c2] = [[0xd9822b, 0xf0d0a0], [0x7d7d7d, 0xdddddd], [0x1a1a1a, 0x333333], [0xf0f0f0, 0xd8c8b0], [0x9b7b5a, 0xe8d8c0]][i % 5];
    const b = [];
    b.push(part(sphGeo, c1, 0, 0.048, 0, 0.03, 0.03, 0.07));
    b.push(part(sphGeo, c1, 0, 0.056, 0.028, 0.032, 0.034, 0.03));
    b.push(part(sphGeo, c1, 0, 0.066, 0.045, 0.03, 0.028, 0.028));                          // หัว
    b.push(part(sphGeo, c2, 0, 0.06, 0.058, 0.014, 0.01, 0.01));
    b.push(part(sphGeo, 0xe88a9a, 0, 0.063, 0.062, 0.005, 0.004, 0.004));
    for (const sx of [-1, 1]) {
      b.push(part(coneGeo, c1, sx * 0.011, 0.085, 0.043, 0.012, 0.018, 0.008));
      b.push(part(sphGeo, 0x9ad65a, sx * 0.008, 0.07, 0.057, 0.005, 0.006, 0.003));
    }
    // หาง: ลูกกลมต่อกันเป็นเส้นโค้งขึ้นแล้วม้วนปลาย ติดกับก้นแมว
    [[0.052, -0.036, 0.014], [0.058, -0.047, 0.013], [0.066, -0.057, 0.0125], [0.077, -0.064, 0.012], [0.09, -0.067, 0.0115], [0.102, -0.064, 0.011], [0.11, -0.057, 0.0105]]
      .forEach(([y, z, d], k, a) => b.push(part(sphGeo, k === a.length - 1 ? c2 : c1, 0, y, z, d, d, d * 1.25)));
    const leg = merge([
      part(boxGeo, c1, 0, -0.01, 0, 0.009, 0.02, 0.011),
      part(boxGeo, c1, 0, -0.027, 0.001, 0.007, 0.018, 0.008),
      part(boxGeo, c2, 0, -0.037, 0.003, 0.009, 0.005, 0.012),
    ]);
    return (catCache[i] = { body: merge(b), leg });
  }
  // ขนาดสัตว์เทียบกับคน (คนสูง ~0.17 หน่วย = 1.7 ม.): หมาไทยขนาดกลางสูงถึงหัว ~0.65 ม., แมว ~0.3 ม.
  // โมเดลจากโค้ดออกแบบไว้ใหญ่ (หมา ~1.1 ม., แมว ~0.9 ม.) จึงย่อทั้งตัว
  const DOG_SIZE = 0.58, CAT_SIZE = 0.36;
  function makeQuad(G, hipY, hx, hz, size = 1) {
    const g = new THREE.Group();
    const bodyM = mesh(G.body, M.fur, false);
    g.add(bodyM);
    const legs = [], lodParts = [bodyM];
    const spots = [[-1, 1], [1, 1], [-1, -1], [1, -1]];
    for (const [sx, sz] of spots) {
      const leg = new THREE.Group();
      leg.position.set(sx * hx, hipY, sz * hz);
      leg.add(mesh(G.leg, M.fur, false));
      g.add(leg); legs.push(leg); lodParts.push(leg);
    }
    if (!G.full) G.full = merge([G.body, ...spots.map(([sx, sz]) => { const c = G.leg.clone(); c.translate(sx * hx, hipY, sz * hz); return c; })]);
    const full = mesh(G.full, M.fur, false); full.visible = false; g.add(full);
    g.scale.setScalar(size);
    const obj = new THREE.Group(); obj.add(g);
    return { obj, legs, lodParts, full, near: true, size };
  }
  const glbAnimal = cat => {
    const v = pickVehicle(cat); if (!v) return null;
    const g = new THREE.Group(); g.add(v);
    return { obj: g, legs: [0, 1, 2, 3].map(() => new THREE.Group()), lodParts: [], full: null, near: true, glb: true };
  };
  const makeDog = () => glbAnimal('dogs') || makeQuad(dogGeos(Math.floor(Math.random() * 12)), 0.048, 0.014, 0.03, DOG_SIZE * (0.85 + Math.random() * 0.3));
  const makeCat = () => glbAnimal('cats') || makeQuad(catGeos(Math.floor(Math.random() * 10)), 0.038, 0.01, 0.022, CAT_SIZE * (0.9 + Math.random() * 0.2));

  // ---------- เส้นทาง ----------
  const walkable = (kind, x, z) => {
    if (x < 0 || z < 0 || x >= N || z >= N) return false;
    const t = tileType(x, z);
    if (kind === 'car') return t === 'road';
    return t === 'park' || (t === 'road' && roadKind(x, z) !== 'highway');   // คนเดินบนทางหลวงไม่ได้
  };

  let dirty = true;
  const lists = { car: [], walker: [] };
  function rebuildLists() {
    lists.car.length = 0;
    lists.walker.length = 0;
    for (let z = 0; z < N; z++) {
      for (let x = 0; x < N; x++) {
        const t = tileType(x, z);
        if (t === 'road') { lists.car.push([x, z]); if (roadKind(x, z) !== 'highway') lists.walker.push([x, z]); }
        else if (t === 'park') lists.walker.push([x, z]);
      }
    }
    dirty = false;
  }

  // เลือกทิศถัดไปที่ทางแยก (ชอบตรงไป ไม่ย้อนกลับ เว้นแต่ทางตัน)
  function pickNext(kind, bx, bz, d) {
    const opts = [];
    for (const nd of DIRS) {
      if (nd[0] === -d[0] && nd[1] === -d[1]) continue;
      if (walkable(kind, bx + nd[0], bz + nd[1])) opts.push(nd);
    }
    if (!opts.length) return [-d[0], -d[1]];
    const straight = opts.find(o => o[0] === d[0] && o[1] === d[1]);
    if (straight && Math.random() < 0.6) return straight;
    return opts[(Math.random() * opts.length) | 0];
  }

  // ---------- ตัวละคร ----------
  const agents = { car: [], person: [], dog: [], cat: [] };
  let targets = { car: 0, person: 0, dog: 0, cat: 0, bus: 0, taxi: 0, grab: 0, cargo: 0 };
  let evShare = 0;   // สัดส่วนรถยนต์ไฟฟ้าในรถทั่วไป (เมืองคำนวณจากสถานีชาร์จ/นโยบาย)

  const SPECIAL = ['bus', 'taxi', 'grab', 'rbike', 'rcar', 'cargo'];
  function createAgent(type, x, z, d, role = null) {
    let made, kind = 'walker', speed, lat;
    if (type === 'car') {
      kind = 'car'; lat = 0.15; speed = 0.95 + Math.random() * 0.2;
      if (role === 'bus') { made = makeBus(); speed = 0.7 + Math.random() * 0.1; }
      else if (role === 'taxi') { made = makeTaxiLike(false); speed = 0.9 + Math.random() * 0.15; }
      else if (role === 'grab') { const bk = Math.random() < 0.45; made = bk ? makeBike(true) : makeTaxiLike(true); speed = 1 + Math.random() * 0.2; if (bk) lat = 0.2; }
      else if (role === 'rbike') { made = makeBike(false, true); speed = 1.9 + Math.random() * 0.6; lat = 0.2; }
      else if (role === 'rcar') { made = glbWrap('sports') || makeCar(pick(['sedan', 'hatch'])); speed = 1.7 + Math.random() * 0.5; }
      else if (role === 'cargo') { const tk = makeServiceTruck('cargo'); made = { obj: tk.obj, headMesh: tk.lr, tailMesh: tk.lr }; }
      else if (Math.random() < 0.22) { made = makeBike(); role = 'bike'; speed = 1.1 + Math.random() * 0.25; lat = 0.2; }
      else if (Math.random() < evShare) { made = makeEV(); role = 'ev'; }
      else made = makeCar();
    }
    else if (type === 'person') { made = makePerson(); speed = 0.26 + Math.random() * 0.08; lat = 0.43; }
    else if (type === 'dog') { made = makeDog(); speed = 0.42 + Math.random() * 0.1; lat = 0.4; }
    else { made = makeCat(); speed = 0.36 + Math.random() * 0.1; lat = 0.41; }
    const a = {
      type, kind, ...made, x, z, d, n: null,
      s: Math.random() * 0.9, speed, speedNow: speed, lat,
      side: type === 'car' ? 1 : (Math.random() < 0.5 ? -1 : 1), // รถชิดซ้าย
      phase: Math.random() * 10, bob: 0, dead: false, crash: null,
      role, special: SPECIAL.includes(role), racer: role === 'rbike' || role === 'rcar', runRed: Math.random() < 0.75, ttl: 0,
    };
    a.n = pickNext(kind, x + d[0], z + d[1], d);
    if (kind === 'car') setupDriver(a, x, z);
    root.add(a.obj);
    return a;
  }

  // นิสัยคนขับ/สมรรถนะรถ: comply = ขับเทียบกับป้ายจำกัดความเร็ว, vmax = ความเร็วสูงสุดของรถ,
  // acc = อัตราเร่ง, T = ระยะเวลาเว้นห่างคันหน้า (วินาที), len = ความยาวรถ
  function setupDriver(a, x, z) {
    const r = Math.random();
    let comply = r < 0.1 ? 1.12 + Math.random() * 0.18 : 0.9 + Math.random() * 0.15;   // 10% ขับเร็วเกินป้าย
    let vmax = 2.6, acc = 0.45 + Math.random() * 0.15, T = 0.45 + Math.random() * 0.25, len = 0.34;
    if (a.role === 'bus') { comply = 0.85; vmax = 1.3; acc = 0.28; T = 0.7; len = 0.6; }
    else if (a.role === 'cargo') { comply = 0.85; vmax = 1.5; acc = 0.22; T = 0.8; len = 0.54; }   // รถบรรทุกหนัก เร่งช้า เว้นระยะมาก
    else if (a.role === 'ev') acc *= 1.35;                                                           // มอเตอร์ไฟฟ้าแรงบิดทันที
    else if (a.role === 'taxi') comply = 0.95 + Math.random() * 0.15;
    else if (a.role === 'grab') comply = 1 + Math.random() * 0.2;
    if (a.isBike) { vmax = 2; acc = 0.6; T = 0.35; len = 0.2; if (a.role === 'bike') comply = 0.95 + Math.random() * 0.25; }
    if (a.racer) { vmax = 3.2; acc = 1; T = 0.3; }
    Object.assign(a, { comply, vmax, acc, T, len, lane: 0, lcT: Math.random() * 0.4, blockT: 0, passing: null });
    a.obj.rotation.order = 'YXZ';   // หันหัวก่อน แล้วค่อยก้ม/เอียงตามตัวรถ
    a.lo = laneTarget(a, x, z);
    a.speedNow = Math.min(desiredSpeed(a, speedLimit(x, z) || KMH), 0.6);
  }
  const lanesAt = (x, z) => (LANE_LAT[roadKind(x, z)] || LANE_LAT.street).length;
  // ระยะจากกลางถนนถึงตำแหน่งที่รถควรอยู่บนช่อง (x,z) ตามเลนที่เลือก (lane -1 = ล้ำเลนสวนเพื่อแซง)
  function laneTarget(a, x, z) {
    const L = LANE_LAT[roadKind(x, z)] || LANE_LAT.street;
    if (a.lane < 0) return -L[0];
    const i = Math.min(a.lane, L.length - 1);
    return L[i] + (a.isBike && i === 0 ? 0.05 : 0);   // มอเตอร์ไซค์ชิดขอบทาง
  }
  const desiredSpeed = (a, lim) => (a.racer ? Math.max(a.speed, (lim / KMH) * 1.35) : Math.min((lim / KMH) * a.comply, a.vmax));

  function spawn(type, role = null) {
    if (dirty) rebuildLists();
    const kind = type === 'car' ? 'car' : 'walker';
    const list = lists[kind];
    if (!list.length) return null;
    for (let tries = 0; tries < 12; tries++) {
      const [x, z] = list[(Math.random() * list.length) | 0];
      const opts = DIRS.filter(([dx, dz]) => walkable(kind, x + dx, z + dz));
      if (!opts.length) continue;
      const d = opts[(Math.random() * opts.length) | 0];
      // รถเกิดใหม่ต้องไม่ซ้อนคันอื่น: ช่องนี้และช่องข้างหน้าต้องว่าง
      if (kind === 'car' && agents.car.some(o => (o.x === x && o.z === z) || (o.x === x + d[0] && o.z === z + d[1]))) continue;
      return createAgent(type, x, z, d, role);
    }
    return null;
  }

  function removeAgent(a) {
    if (a.visit && a.visit.phase === 1) a.visit.v.inside = Math.max(0, a.visit.v.inside - 1);   // คนที่อยู่ในร้านถูกลบ
    a.visit = null;
    root.remove(a.obj);
    a.dead = true;
  }

  // ---------- คนเดินเข้า-ออกสถานที่ (ร้าน วัด โรงพยาบาล ฯลฯ) ----------
  // venue = { x, z, fw, fd, w (น้ำหนักความนิยมตามเวลา), inside, visits } — ผู้เรียกเป็นเจ้าของอ็อบเจกต์ แล้วอ่านค่าสถิติไปแสดงผล
  let venueProvider = null, venuesDirty = true;
  let entr = new Map();   // key ช่องถนน -> [{ v, dx, dz }] (dx,dz = ทิศจากถนนเข้าหาอาคาร)
  function syncVenues() {
    venuesDirty = false;
    entr = new Map();
    if (!venueProvider) return;
    for (const v of venueProvider()) {
      const fw = v.fw || 1, fd = v.fd || 1;
      for (let dz = -1; dz <= fd; dz++) for (let dx = -1; dx <= fw; dx++) {
        const inX = dx >= 0 && dx < fw, inZ = dz >= 0 && dz < fd;
        if (inX === inZ) continue;
        const rx = v.x + dx, rz = v.z + dz;
        if (!walkable('car', rx, rz)) continue;
        const k = rx * 4096 + rz;
        let l = entr.get(k); if (!l) entr.set(k, l = []);
        l.push({ v, dx: inX ? 0 : dx < 0 ? 1 : -1, dz: inZ ? 0 : dz < 0 ? 1 : -1, rx, rz });
      }
    }
  }
  const VISIT_T = 2.6;
  function maybeVisit(a, sdt) {
    if (a.cool > 0) a.cool -= sdt;
    if (a.visit || a.s < 0.5 || !entr.size) return;
    const k = a.x * 4096 + a.z;
    if (a.lastEnt === k) return;
    a.lastEnt = k;
    const l = entr.get(k);
    if (!l || a.cool > 0) return;
    const e = l[(Math.random() * l.length) | 0];
    if (Math.random() >= 0.5 * e.v.w) return;
    const p = a.obj.position;
    a.visit = { v: e.v, dx: e.dx, dz: e.dz, t: 0, phase: 0, from: [p.x, p.y, p.z], to: [e.rx - N / 2 + 0.5 + e.dx * 0.86, p.y, e.rz - N / 2 + 0.5 + e.dz * 0.86], dwell: 8 + Math.random() * 24 };
  }
  // คืน true เมื่อควบคุมตำแหน่งตัวละครอยู่ (ข้ามการเดินปกติ)
  function updateVisit(a, sdt, env) {
    const V = a.visit, o = a.obj;
    V.t += sdt;
    if (V.phase === 1) {
      if (V.t >= V.dwell) { V.phase = 2; V.t = 0; o.visible = true; V.v.inside = Math.max(0, V.v.inside - 1); }
      return true;
    }
    const u = Math.min(1, V.t / VISIT_T), inn = V.phase === 0;
    const k = inn ? u : 1 - u;
    o.position.set(V.from[0] + (V.to[0] - V.from[0]) * k, V.from[1], V.from[2] + (V.to[2] - V.from[2]) * k);
    o.rotation.y = Math.atan2(inn ? V.dx : -V.dx, inn ? V.dz : -V.dz);
    o.scale.setScalar(k > 0.7 ? Math.max(0.001, 1 - (k - 0.7) / 0.3) : 1);
    a.speedNow = a.speed; a.phase += sdt * 7;
    if (inView(a, env.frustum)) animate(a);
    if (u >= 1) {
      if (inn) { V.phase = 1; V.t = 0; o.visible = false; V.v.inside++; V.v.visits++; }
      else { a.visit = null; a.cool = 25 + Math.random() * 40; o.scale.setScalar(1); o.visible = true; }
    }
    return true;
  }

  let adjustTimer = 0;
  function adjustCounts() {
    if (dirty) rebuildLists();
    const carCap = Math.floor(lists.car.length * 0.45);
    const walkCap = Math.floor(lists.walker.length * 0.5);
    for (const type of Object.keys(agents)) {
      const arr = agents[type];
      const cap = type === 'car' ? carCap : walkCap;
      const target = Math.min(targets[type], cap);
      const cnt = () => (type === 'car' ? arr.filter(a => !a.special).length : arr.length);
      for (let k = 0; k < 4 && cnt() < target; k++) {
        const a = spawn(type);
        if (a) arr.push(a);
      }
      // ไม่ลบรถที่ประสบอุบัติเหตุอยู่ (ให้ระบบอุบัติเหตุจัดการเอง) และไม่ลบรถประจำการ/กลุ่มรถซิ่ง
      for (let k = 0; k < 4 && cnt() > target; k++) {
        const idx = arr.findIndex(a => !a.crash && !a.special);
        if (idx < 0) break;
        removeAgent(arr.splice(idx, 1)[0]);
      }
    }
    // รถประจำการจากอู่: รถเมล์ แท็กซี่ แกร็บ
    for (const role of ['bus', 'taxi', 'grab', 'cargo']) {
      const tg = Math.min(targets[role] || 0, Math.floor(lists.car.length * 0.12));
      const have = agents.car.filter(a => a.role === role);
      if (have.length < tg) { const a = spawn('car', role); if (a) agents.car.push(a); }
      else if (have.length > tg) { const v = have.find(a => !a.crash); if (v) { removeAgent(v); agents.car = agents.car.filter(a => !a.dead); } }
    }
  }

  // ระยะห่างจากกลางถนน: รถใช้ตำแหน่งเลนปัจจุบัน (lo ค่อยๆ เลื่อนตอนเปลี่ยนเลน), คนเดินชิดทางเท้า
  const mag = (a, tx, tz) => {
    if (a.kind === 'car') return a.lo ?? a.lat;
    if (tileType(tx, tz) !== 'road') return 0;
    return roadKind(tx, tz) === 'avenue' ? Math.max(a.lat, 0.465) : a.lat;   // ถนนใหญ่ทางเท้าแคบลง
  };

  function advance(a, sdt) {
    a.s += a.speedNow * sdt;
    if (a.kind !== 'car') a.phase += sdt * a.speedNow * 22;
    while (a.s >= 1) {
      a.s -= 1;
      a.x += a.d[0]; a.z += a.d[1];
      a.d = a.n;
      if (!walkable(a.kind, a.x, a.z) || !walkable(a.kind, a.x + a.d[0], a.z + a.d[1])) return false;
      a.n = pickNext(a.kind, a.x + a.d[0], a.z + a.d[1], a.d);
    }
    return true;
  }

  const _vs = new THREE.Sphere();
  // อยู่ในมุมมองกล้องหรือไม่ (เผื่อขอบ) — นอกจอไม่ต้องคำนวณท่าเดิน
  function inView(a, fr) { if (!fr) return true; _vs.center.copy(a.obj.position); _vs.radius = 1.5; return fr.intersectsSphere(_vs); }

  function animate(a) {
    const s = Math.sin(a.phase);
    if (a.type === 'person') {
      a.legs[0].rotation.x = s * 0.7; a.legs[1].rotation.x = -s * 0.7;
      a.arms[0].rotation.x = -s * 0.6; a.arms[1].rotation.x = s * 0.6;
      a.bob = Math.abs(s) * 0.004;
    } else if (a.type === 'dog' || a.type === 'cat') {
      const k = 0.7;
      a.legs[0].rotation.x = s * k; a.legs[3].rotation.x = s * k;
      a.legs[1].rotation.x = -s * k; a.legs[2].rotation.x = -s * k;
      a.bob = Math.abs(s) * 0.003 * (a.size || 1);   // ตัวเล็กเด้งน้อยลง
    }
  }

  function place(a) {
    const bx = a.x + a.d[0], bz = a.z + a.d[1];
    const magA = mag(a, a.x, a.z), magB = mag(a, bx, bz);
    const b = smooth(0.6, 1, a.s);
    // ซ้ายของทิศ (dx,dz) = (dz,-dx)
    const lx = (a.d[1] * magA * (1 - b) + a.n[1] * magB * b) * a.side;
    const lz = (-a.d[0] * magA * (1 - b) + -a.n[0] * magB * b) * a.side;
    const px = a.x - N / 2 + 0.5 + a.d[0] * a.s + lx;
    const pz = a.z - N / 2 + 0.5 + a.d[1] * a.s + lz;
    const yaw = angLerp(Math.atan2(a.d[0], a.d[1]), Math.atan2(a.n[0], a.n[1]), b);
    let ground = 0.06;
    if (a.kind !== 'car') {
      const onRoad = a.s < 0.5 ? tileType(a.x, a.z) === 'road' : tileType(bx, bz) === 'road';
      ground = onRoad ? 0.04 : 0.045;
    }
    // ความสูงภูมิประเทศ: ไล่ระดับระหว่างกลางช่องปัจจุบันกับช่องถัดไป
    const gy = groundY(a.x, a.z) * (1 - a.s) + groundY(bx, bz) * a.s;
    a.obj.position.set(px, gy + ground + a.bob, pz);
    a.obj.rotation.y = yaw + (a.crash ? a.crash.yaw : 0);
    a.obj.rotation.z = a.crash ? a.crash.roll : 0;
    if (a.comply !== undefined && !a.crash) bodyMotion(a, b);
  }

  // ฟิสิกส์ตัวรถ (หมุนแบบ YXZ: หันหัว → ก้ม/เงย → เอียง): หน้าทิ่มตอนเบรก เชิดตอนเร่ง
  // รถยนต์เอียงออกนอกโค้ง มอเตอร์ไซค์เอียงเข้าโค้ง; ค่อยๆ เข้าหาค่าเป้าหมายเหมือนมีโช้ค
  function bodyMotion(a, b) {
    const v = a.speedNow, turning = (a.n[0] !== a.d[0] || a.n[1] !== a.d[1]) && !(a.n[0] === -a.d[0] && a.n[1] === -a.d[1]);
    const side = turning ? (a.n[0] === a.d[1] && a.n[1] === -a.d[0] ? 1 : -1) * b * (1 - b) * 4 : 0;   // +1 = เลี้ยวซ้าย
    const pitchT = Math.max(-0.035, Math.min(0.05, -(a.accNow || 0) * (a.len > 0.5 ? 0.02 : 0.035)));
    const rollT = a.isBike ? -side * Math.min(0.55, 0.15 + v * v * 0.5) : side * Math.min(0.07, v * v * 0.06);
    a.bPitch = (a.bPitch || 0) + (pitchT - (a.bPitch || 0)) * 0.15;
    a.bRoll = (a.bRoll || 0) + (rollT - (a.bRoll || 0)) * 0.2;
    a.obj.rotation.x = a.bPitch;
    a.obj.rotation.z = a.bRoll;
  }

  // ---------- API ----------
  // ไฟจราจร: คืนตัวคูณความเร็ว (1 = ไปได้, 0 = หยุดรอที่เส้น)
  function signalFactor(a) {
    if (a.racer && a.runRed) return 1;   // กลุ่มรถซิ่งฝ่าไฟแดง
    const bx = a.x + a.d[0], bz = a.z + a.d[1];
    const st = signal(bx, bz, a.d[0] !== 0 ? 'x' : 'z');
    if (!st || st === 'g') return 1;
    const line = a.kind === 'car' ? CAR_STOP : PED_STOP;
    if (a.s >= line) return 1;                       // ผ่านเส้นแล้ว
    if (st === 'y' && a.s > line - 0.1) return 1;    // ไฟเหลืองแต่ใกล้เกินจะเบรก
    const brake = a.kind === 'car' ? 0.22 : 0.1;
    return clamp01((line - a.s - 0.01) / brake);
  }

  // ---------- อุบัติเหตุ ----------
  const events = [];
  let accident = null;      // มีได้ครั้งละหนึ่งเหตุการณ์
  let accTimer = 50;        // วินาทีเกมถึงเหตุการณ์ถัดไป
  let accRate = 1;
  let lastEnv = { rain: 0, night: 0, hospital: false, police: 0 };
  const puffGeo = new THREE.SphereGeometry(0.5, 8, 6);
  const dirTo = (a, b) => [Math.sign(b[0] - a[0]), Math.sign(b[1] - a[1])];

  // หาเส้นทางสำหรับรถพยาบาลจากถนนที่ห่าง 8-18 ช่อง มายังจุดเกิดเหตุ (BFS บนช่องถนน)
  function ambulanceRoute(tx, tz) {
    const key = (x, z) => z * N + x;
    const prev = new Map([[key(tx, tz), -1]]);
    const dist = new Map([[key(tx, tz), 0]]);
    const q = [[tx, tz]];
    const far = [];
    for (let h = 0; h < q.length; h++) {
      const [x, z] = q[h], d = dist.get(key(x, z));
      if (d >= 8 && d <= 18) far.push([x, z]);
      if (d >= 18) continue;
      for (const [dx, dz] of DIRS) {
        const nx = x + dx, nz = z + dz;
        if (!walkable('car', nx, nz) || dist.has(key(nx, nz))) continue;
        dist.set(key(nx, nz), d + 1); prev.set(key(nx, nz), key(x, z)); q.push([nx, nz]);
      }
    }
    let start = far.length ? pick(far) : null;
    if (!start) { // ถนนสั้น: เอาจุดที่ไกลสุดเท่าที่มี
      let best = -1;
      for (const [x, z] of q) { const d = dist.get(key(x, z)); if (d > best) { best = d; start = [x, z]; } }
      if (best < 3) return null;
    }
    const route = [];
    let k = key(start[0], start[1]);
    while (k !== -1) { route.push([k % N, Math.floor(k / N)]); k = prev.get(k); }
    return route; // เริ่มที่ไกล จบที่จุดเกิดเหตุ
  }

  function startAccident(forceDead = 0) {
    if (accident) return false;
    if (dirty) rebuildLists();
    const cars = agents.car.filter(c => !c.crash && c.s > 0.42 && c.s < 0.78 && tileType(c.x, c.z) === 'road');
    if (cars.length < 1) return false;
    const racerCars = cars.filter(c => c.racer);
    const whRacers = racerCars.filter(c => c.stunt === 'wheelie');
    const a = whRacers.length && Math.random() < 0.8 ? pick(whRacers) : racerCars.length && Math.random() < 0.65 ? pick(racerCars) : pick(cars);
    // รถคันหลังที่ชนท้าย (ในช่องเดียวกัน เลนเดียวกัน)
    const b = agents.car.find(o => o !== a && !o.crash && o.d[0] === a.d[0] && o.d[1] === a.d[1] && o.x === a.x && o.z === a.z && o.s < a.s && o.s > a.s - 0.45 && latHit(o.lo * o.side, a.lo * a.side));
    const victims = [a];
    a.crash = { yaw: (Math.random() < 0.5 ? -1 : 1) * (0.15 + Math.random() * 0.2), roll: 0.03, t: 0 };
    a.lo += 0.04 * Math.sign(a.lo || 1);   // ไถลไปชิดขอบเลน
    const tipOver = v => {   // มอเตอร์ไซค์ซิ่งล้มคว่ำ คนขับหลุดจากรถ
      if (!(v.racer && v.isBike && v.bareMesh)) return false;
      v.flip = v.stunt === 'wheelie'; v.stunt = null;
      v.crash.roll = (Math.random() < 0.5 ? -1 : 1) * (1.15 + Math.random() * 0.3); v.crash.yaw *= 2;
      v.bodyMesh.visible = false; if (v.lieMesh) v.lieMesh.visible = false; v.bareMesh.visible = true;
      return true;
    };
    const teenBike = tipOver(a);
    if (b) { b.s = Math.max(0, a.s - 0.33); b.crash = { yaw: (Math.random() < 0.5 ? -1 : 1) * (0.1 + Math.random() * 0.25), roll: -0.03, t: 0 }; victims.push(b); tipOver(b); }
    // สาเหตุและผู้ได้รับผลกระทบ
    const rain = lastEnv.rain, night = lastEnv.night;
    let cause;
    if (b) { const p = Math.random(); cause = p < 0.12 + 0.28 * night ? 'race' : p < 0.5 ? 'cutoff' : 'rear'; }
    else cause = rain > 0.3 ? 'slip' : 'solo';
    if (!b && !a.racer && Math.random() < 0.3) cause = 'breakdown';
    if (!a.racer && cause !== 'breakdown' && lastEnv.drunk > 0 && Math.random() < 0.5 * lastEnv.drunk) cause = 'drunk';
    if (a.racer) cause = 'race';
    const pDead = ({ race: 0.42, cutoff: 0.12, rear: 0.06, solo: 0.14, slip: 0.1, breakdown: 0, drunk: 0.3 })[cause] * (1 + 0.6 * rain) * (lastEnv.hospital ? 0.7 : 1.4) * (a.isBike ? 1.5 : 1);
    const dead = forceDead ? forceDead : Math.random() < pDead ? (cause === 'race' && b && Math.random() < 0.3 ? 2 : 1) : 0;
    const injured = cause === 'breakdown' ? 0 : Math.floor(Math.random() * (cause === 'race' ? 4 : 3)) + (Math.random() < 0.4 ? 1 : 0);
    for (const v of victims) { v.speedNow = 0; v.headMesh.material = M.haz; v.tailMesh.material = M.haz; }
    place(a); if (b) place(b);
    // ควัน + กรวยจราจร + ป้ายสามเหลี่ยม
    const props = new THREE.Group();
    root.add(props);
    const base = (b || a).obj.position;
    const back = [-a.d[0], -a.d[1]];
    for (let k = 0; k < 3; k++) {
      const c = mesh(coneGeo, M.cone);
      c.scale.set(0.03, 0.05, 0.03);
      c.position.set(base.x + back[0] * (0.28 + k * 0.1) + a.d[1] * -0.12 * (k - 1) * 0.5, base.y - 0.03 + 0.025, base.z + back[1] * (0.28 + k * 0.1) - a.d[0] * -0.12 * (k - 1) * 0.5);
      props.add(c);
    }
    const tri = mesh(coneGeo, M.red); tri.scale.set(0.05, 0.03, 0.05); tri.position.set(base.x + back[0] * 0.5, base.y - 0.03 + 0.02, base.z + back[1] * 0.5); props.add(tri);
    const puffs = [];
    victims.forEach((v, vi) => {
      for (let k = 0; k < 5; k++) {
        const p = new THREE.Mesh(puffGeo, M.smoke[vi * 5 + k]);
        p.userData = { ph: k / 5, v };
        props.add(p); puffs.push(p);
      }
    });
    const brk = cause === 'breakdown';
    accident = { victims, props, puffs, t: 0, state: 'crash', amb: null, ambTimer: 6 + Math.random() * 6, tx: a.x, tz: a.z, hold: 0, noAmb: brk, tow: null, towAt: brk ? 7 + Math.random() * 5 : 18 + Math.random() * 8, towDone: false, noTow: false };
    accident.teen = teenBike;
    accident.dead = dead; accident.coronerAt = 10 + Math.random() * 5; accident.bodiesTaken = !dead;
    buildScene(accident, a, b, dead, injured);
    events.push({ e: 'crash', cause, injured, dead, x: a.x, z: a.z, axis: a.d[0] !== 0 ? 'row' : 'col', clip: Math.random() < 0.5, bike: !!a.isBike, racer: !!a.racer, teen: teenBike, wheelie: !!a.flip });
    return true;
  }

  function spawnAmbulance(acc) {
    const route = ambulanceRoute(acc.tx, acc.tz);
    if (!route || route.length < 3) { acc.noAmb = true; return; }
    const made = makeAmbulance();
    const a = {
      type: 'amb', kind: 'car', ...made, x: route[0][0], z: route[0][1], i: 0, route, s: 0, speed: 1.5, speedNow: 1.5,
      lat: 0, side: 1, phase: 0, bob: 0, dead: false, crash: null, arrived: false,
    };
    a.d = dirTo(route[0], route[1]);
    a.n = route.length > 2 ? dirTo(route[1], route[2]) : a.d;
    root.add(a.obj);
    acc.amb = a;
    events.push('ambulance');
  }

  function advanceAmbulance(a, sdt) {
    if (a.arrived) return;
    a.s += a.speedNow * sdt;
    while (a.s >= 1) {
      a.s -= 1; a.i++;
      if (a.i >= a.route.length - 1) { a.arrived = true; a.i = a.route.length - 2; a.s = 0.86; a.x = a.route[a.i][0]; a.z = a.route[a.i][1]; a.d = dirTo(a.route[a.i], a.route[a.i + 1]); a.n = a.d; return; }
      a.x = a.route[a.i][0]; a.z = a.route[a.i][1];
      a.d = dirTo(a.route[a.i], a.route[a.i + 1]);
      a.n = a.i + 2 < a.route.length ? dirTo(a.route[a.i + 1], a.route[a.i + 2]) : a.d;
    }
    // จอดก่อนถึงจุดเกิดเหตุ
    if (a.i === a.route.length - 2 && a.s >= 0.86) { a.arrived = true; a.s = 0.86; }
  }

  function spawnTow(acc) {
    let route = ambulanceRoute(acc.tx, acc.tz);
    if (route && route.length > 4) route = route.slice(0, -1); // จอดห่างถอยหลังหนึ่งช่อง แล้วใช้สลิงลากรถเข้ากระบะ
    if (!route || route.length < 3) { acc.noTow = true; return; }
    const made = makeTow();
    const a = {
      type: 'tow', kind: 'car', ...made, x: route[0][0], z: route[0][1], i: 0, route, s: 0, speed: 1.2, speedNow: 1.2,
      lat: 0, side: 1, phase: 0, bob: 0, dead: false, crash: null, arrived: false, hold: 0,
    };
    a.d = dirTo(route[0], route[1]);
    a.n = route.length > 2 ? dirTo(route[1], route[2]) : a.d;
    root.add(a.obj);
    acc.tow = a;
    events.push('tow');
  }

  // วางรถที่ถูกยกไว้บนกระบะ (u=0 อยู่ที่เดิม, u=1 อยู่บนกระบะ) ผู้ถูกลากคันที่สองห้อยท้าย
  function placeWreck(v, tw, u, k) {
    const yaw = tw.obj.rotation.y, sn = Math.sin(yaw), cs = Math.cos(yaw);
    const lz = k === 0 ? -0.12 : -0.62, ly = k === 0 ? 0.1 : 0;
    const tx = tw.obj.position.x + sn * lz, tz = tw.obj.position.z + cs * lz, ty = tw.obj.position.y + ly;
    const o = v.obj;
    if (v.from) { // ไล่จากตำแหน่งเดิมเข้าหากระบะ
      o.position.set(v.from.x + (tx - v.from.x) * u, v.from.y + (ty - v.from.y) * u + Math.sin(u * Math.PI) * 0.05, v.from.z + (tz - v.from.z) * u);
      let dy = yaw - v.from.ry; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      o.rotation.y = v.from.ry + dy * u;
      o.rotation.z = v.from.rz * (1 - u);
    } else { o.position.set(tx, ty, tz); o.rotation.y = yaw; o.rotation.z = 0; }
  }

  function updateTow(ac, sdt) {
    if (ac.towDone) return;
    if (!ac.tow && !ac.noTow && ac.t > ac.towAt && (ac.state === 'rescue' || ac.state === 'leave' || ac.noAmb)) spawnTow(ac);
    const w = ac.tow;
    if (!w) return;
    if (!w.leaving) {
      if (!w.arrived) { advanceAmbulance(w, sdt); w.speedNow = w.arrived ? 0 : w.speed; return; }
      if (ac.dead > 0 && !ac.bodiesTaken) return;   // รอรถกู้ภัยเก็บร่างผู้เสียชีวิตก่อน
      if (ac.amb && !ac.amb.leaving && ac.state !== 'leave') return; // รอให้รถพยาบาลช่วยผู้บาดเจ็บก่อน
      w.hold += sdt;
      if (w.hold >= 1 && !w.winched) {
        w.winched = true;
        ac.victims.forEach(v => { const o = v.obj; v.from = { x: o.position.x, y: o.position.y, z: o.position.z, ry: o.rotation.y, rz: o.rotation.z }; const k = agents.car.indexOf(v); if (k >= 0) agents.car.splice(k, 1); v.towed = true; });
      }
      if (w.winched) {
        const u = Math.min(1, (w.hold - 1) / 3.5);
        ac.victims.forEach((v, k) => placeWreck(v, w, u * u * (3 - 2 * u), k));
        if (u >= 1) {
          root.remove(ac.props);
          for (const v of ac.victims) { v.headMesh.material = M.haz; v.from = null; }
          w.leaving = true; w.arrived = false; w.route = null; w.speedNow = 1.1;
          events.push('cleared');
        }
      }
    } else {
      w.speedNow = 1.1;
      const ok = advance(w, sdt);
      place(w);
      ac.victims.forEach((v, k) => placeWreck(v, w, 1, k));
      if (!ok) { ac.victims.forEach(removeAgent); removeAgent(w); ac.tow = null; ac.towDone = true; }
    }
    if (w && !w.dead) {
      if (!w.leaving) place(w);
      const ph = Math.sin(performance.now() / 1000 * 10) > 0;
      w.lr.visible = ph;
    }
  }

  // ---------- รถบริการ / ทีมซ่อม (การไฟฟ้า การประปา กรมทางหลวง) ----------
  function spawnTruck(kind, tx, tz) {
    let route = ambulanceRoute(tx, tz);
    if (route && route.length > 4) route = route.slice(0, -1);   // จอดห่างจุดทำงานหนึ่งช่อง
    if (!route || route.length < 3) return null;
    const made = makeServiceTruck(kind);
    const a = {
      type: 'crew', ckind: kind, kind: 'car', ...made, x: route[0][0], z: route[0][1], i: 0, route, s: 0, speed: 1.3, speedNow: 1.3,
      lat: 0, side: 1, phase: 0, bob: 0, dead: false, crash: null, arrived: false, hold: 0, leaving: false, leaveT: 0,
    };
    a.d = dirTo(route[0], route[1]);
    a.n = route.length > 2 ? dirTo(route[1], route[2]) : a.d;
    root.add(a.obj);
    return a;
  }
  const crews = [];
  const hazards = new Map();   // ช่องที่มีหลุม/น้ำท่วม: ตัวคูณความเร็วรถ
  let crewSeq = 0;
  // ส่งทีมซ่อมไปที่ช่องถนน (tx,tz): ขับมาจอด ทำงาน work วินาทีเกม แล้วขับออก  เหตุการณ์ {e:'crew', phase:'arrive'|'done'} ส่งให้ main
  function dispatchCrew(ckind, tx, tz, work = 14) {
    const a = spawnTruck(ckind, tx, tz);
    if (!a) return 0;
    a.id = ++crewSeq; a.work = work;
    crews.push(a);
    return a.id;
  }
  function updateCrews(sdt, nowT) {
    for (const c of crews) {
      if (c.dead) continue;
      if (!c.leaving) {
        if (!c.arrived) {
          advanceAmbulance(c, sdt);
          c.speedNow = c.arrived ? 0 : c.speed;
          if (c.arrived) events.push({ e: 'crew', id: c.id, phase: 'arrive', ckind: c.ckind });
        } else {
          c.hold += sdt;
          if (c.hold >= c.work) {
            events.push({ e: 'crew', id: c.id, phase: 'done', ckind: c.ckind });
            c.leaving = true; c.arrived = false; c.route = null; c.speedNow = 1.2;
          }
        }
        place(c);
      } else {
        c.leaveT += sdt;
        if (!advance(c, sdt) || c.leaveT > 45) removeAgent(c); else place(c);
      }
      if (!c.dead) c.lr.visible = Math.sin(nowT * 10) > 0;
    }
    for (let i = crews.length - 1; i >= 0; i--) if (crews[i].dead) crews.splice(i, 1);
  }

  // ---------- ที่เกิดเหตุเสียชีวิต: ร่างคลุมผ้าขาว คนมุงดู รถกู้ภัยมาเก็บร่าง ----------
  function buildScene(ac, a, b, dead, injured) {
    const base = (b || a).obj.position, d = a.d, perp = [d[1], -d[0]];
    ac.base = base.clone();
    ac.sceneG = new THREE.Group(); root.add(ac.sceneG);
    ac.bodies = [];
    for (let k = 0; k < dead; k++) {
      const g = new THREE.Group();
      const sheet = mesh(boxGeo, M.shroud, false); sheet.scale.set(0.05, 0.012, 0.16); sheet.position.y = 0.006;
      const hd = mesh(boxGeo, M.shroud, false); hd.scale.set(0.04, 0.02, 0.05); hd.position.set(0, 0.012, 0.06);
      const kn = mesh(boxGeo, M.shroud, false); kn.scale.set(0.036, 0.016, 0.05); kn.position.set(0, 0.01, -0.03);
      g.add(sheet, hd, kn);
      const along = 0.3 + 0.12 * k, lat = (k % 2 ? -1 : 1) * 0.07;
      g.position.set(base.x + d[0] * along + perp[0] * lat, base.y - 0.03 + 0.002, base.z + d[1] * along + perp[1] * lat);
      g.rotation.y = Math.atan2(d[0], d[1]) + (Math.random() - 0.5) * 0.5;
      ac.sceneG.add(g);
      ac.bodies.push({ g, from: g.position.clone(), yaw: g.rotation.y });
    }
    // เด็กแว้นที่กระเด็นออกจากรถ นอนอยู่บนถนน (ผู้เสียชีวิตถูกคลุมผ้าขาวทีหลัง)
    ac.riders = [];
    if (ac.teen) {
      const nr = Math.min(3, dead + Math.min(2, injured));
      for (let k = 0; k < nr; k++) {
        const g = mesh(riderLieGeo((Math.random() * 12) | 0), M.vc, false);
        const along = 0.34 + 0.13 * k, lat = (k % 2 ? -1 : 1) * (0.05 + Math.random() * 0.04);
        const to = new THREE.Vector3(base.x + d[0] * along + perp[0] * lat, base.y - 0.03 + 0.003, base.z + d[1] * along + perp[1] * lat);
        g.position.set(base.x, to.y, base.z); g.rotation.y = Math.atan2(d[0], d[1]) + (Math.random() - 0.5) * 1.2;
        ac.sceneG.add(g);
        const isDead = k < dead;
        if (isDead && ac.bodies[k]) ac.bodies[k].g.visible = false;
        ac.riders.push({ g, from: new THREE.Vector3(base.x, to.y, base.z), to, dead: isDead, body: isDead ? ac.bodies[k] : null, swapped: false });
      }
    }
    // คนมุงดู: ยืนริมทางเท้าสองฝั่ง หันเข้าหาจุดเกิดเหตุ ทยอยมา
    ac.crowd = [];
    const n = Math.min(11, dead ? 6 + dead * 2 + Math.floor(Math.random() * 3) : (injured > 1 ? 3 : 1) + Math.floor(Math.random() * 3));
    for (let k = 0; k < n; k++) {
      const p = makePerson();
      const side = Math.random() < 0.5 ? -1 : 1, L = side * (0.37 + Math.random() * 0.08), sa = (Math.random() - 0.5) * 1.5;
      const px = base.x + d[0] * sa + perp[0] * L, pz = base.z + d[1] * sa + perp[1] * L;
      p.obj.position.set(px, base.y - 0.015, pz);
      p.obj.rotation.y = Math.atan2(base.x - px, base.z - pz) + (Math.random() - 0.5) * 0.3;
      p.obj.visible = false; p.obj.scale.setScalar(0.001);
      ac.sceneG.add(p.obj);
      ac.crowd.push({ p, delay: 1.5 + Math.random() * (dead ? 18 : 9), leaveAt: Math.random() * 8, shown: false, gone: false, ph: Math.random() * 6 });
    }
    // เจ้าหน้าที่กู้ภัย 2 คน (ใส่เสื้อกั๊กส้ม) โผล่มาเมื่อรถมูลนิธิถึง
    ac.workers = [];
    if (dead) for (let k = 0; k < 2; k++) {
      const p = makePerson();
      const vest = mesh(boxGeo, M.vest, false); vest.scale.set(0.05, 0.034, 0.034); vest.position.y = 0.108;
      p.obj.add(vest); p.obj.visible = false;
      ac.sceneG.add(p.obj);
      ac.workers.push(p);
    }
  }
  function clearScene(ac) {
    if (ac.sceneG) { root.remove(ac.sceneG); ac.sceneG = null; }
    ac.crowd = []; ac.bodies = []; ac.workers = [];
    if (ac.coroner) { removeAgent(ac.coroner); ac.coroner = null; }
  }
  function updateScene(ac, sdt, nowT) {
    if (!ac.sceneG) return;
    if (ac.riders) for (const r of ac.riders) {
      const u = clamp01(ac.t / 0.9), e = 1 - (1 - u) * (1 - u);
      r.g.position.set(r.from.x + (r.to.x - r.from.x) * e, r.to.y + Math.sin(u * Math.PI) * 0.12, r.from.z + (r.to.z - r.from.z) * e);
      r.g.rotation.x = u < 1 ? u * 6 : 0;
      if (r.dead && !r.swapped && ac.t > 7) { r.swapped = true; r.g.visible = false; if (r.body && !ac.bodiesTaken) r.body.g.visible = true; }
      if (!r.dead && ac.state === 'leave' && ac.hold > 1) r.g.visible = false;
    }
    for (const c of ac.crowd) {
      const o = c.p.obj;
      if (c.gone) continue;
      if (!c.shown) { if (ac.t > c.delay) { c.shown = true; o.visible = true; c.t0 = ac.t; } else continue; }
      const grow = Math.min(1, (ac.t - c.t0) / 0.5);
      let sc = grow;
      if (ac.dispersing) { const u = (ac.t - ac.dispT - c.leaveAt) / 0.5; if (u >= 1) { c.gone = true; o.visible = false; continue; } if (u > 0) sc *= 1 - u; }
      o.scale.setScalar(Math.max(0.001, sc));
      o.rotation.z = Math.sin(nowT * 1.3 + c.ph) * 0.02;
    }
  }
  function updateCoroner(ac, sdt, nowT) {
    if (!ac.coroner && !ac.noCoroner && !ac.bodiesTaken && ac.t > ac.coronerAt) {
      const v = spawnTruck('rescue', ac.tx, ac.tz);
      if (v) { ac.coroner = v; events.push('coroner'); }
      else { ac.noCoroner = true; ac.bodiesTaken = true; for (const b of ac.bodies) b.g.visible = false; return; }
    }
    const v = ac.coroner;
    if (!v) return;
    if (!v.leaving) {
      if (!v.arrived) { advanceAmbulance(v, sdt); v.speedNow = v.arrived ? 0 : v.speed; }
      else {
        v.hold += sdt;
        const yaw = v.obj.rotation.y, fx = Math.sin(yaw), fz = Math.cos(yaw);
        const rx = v.obj.position.x - fx * 0.3, rz = v.obj.position.z - fz * 0.3, ry = v.obj.position.y;
        const u1 = clamp01((v.hold - 0.3) / 1.4), u = clamp01((v.hold - 1.8) / 3.4), e = u * u * (3 - 2 * u);
        const S = ac.bodies[0].from;
        // เจ้าหน้าที่เดินจากท้ายรถไปที่ร่าง แล้วช่วยกันหามกลับ
        ac.workers.forEach((w, k) => {
          w.obj.visible = v.hold > 0.3 && u < 1;
          const bx = u1 < 1 ? rx + (S.x - rx) * u1 : S.x + (rx - S.x) * e, bz = u1 < 1 ? rz + (S.z - rz) * u1 : S.z + (rz - S.z) * e;
          const off = (k ? -1 : 1) * 0.07;
          w.obj.position.set(bx + fz * off, ry - 0.03, bz - fx * off);
          const tx = u1 < 1 ? S.x : rx, tz = u1 < 1 ? S.z : rz;
          w.obj.rotation.y = Math.atan2(tx - w.obj.position.x, tz - w.obj.position.z);
          const sw = Math.sin(v.hold * 9 + k * 3) * 0.5 * (u1 < 1 || (u > 0 && u < 1) ? 1 : 0);
          w.legs[0].rotation.x = sw; w.legs[1].rotation.x = -sw;
        });
        if (u > 0) ac.bodies.forEach((b, k) => {
          const F = b.from, tx = rx + fz * (k ? -0.04 : 0.04), tz = rz - fx * (k ? -0.04 : 0.04);
          b.g.position.set(F.x + (tx - F.x) * e, F.y + (ry + 0.1 - F.y) * e + Math.sin(e * Math.PI) * 0.05, F.z + (tz - F.z) * e);
          b.g.rotation.y = b.yaw + (yaw - b.yaw) * e;
        });
        if (u >= 1 && !ac.bodiesTaken) {
          ac.bodiesTaken = true; for (const b of ac.bodies) b.g.visible = false; for (const w of ac.workers) w.obj.visible = false;
          events.push('bodyTaken');
          v.leaving = true; v.arrived = false; v.route = null; v.speedNow = 1.2;
          ac.dispersing = true; ac.dispT = ac.t + 3;
        }
      }
      place(v);
    } else {
      v.leaveT += sdt;
      if (!advance(v, sdt) || v.leaveT > 45) { removeAgent(v); ac.coroner = null; } else place(v);
    }
    if (v && !v.dead) { const ph = Math.sin(nowT * 11) > 0; v.lr.visible = ph; v.lb.visible = !ph; }
  }

  function updateAccident(dt, sdt, nowT) {
    const ac = accident;
    if (!ac) return;
    ac.t += sdt;
    // ไฟฉุกเฉินกะพริบ
    const blink = Math.sin(nowT * 9) > 0 ? 1.6 : 0.1;
    M.haz.emissiveIntensity = blink;
    // ควันลอยขึ้น
    for (const p of ac.puffs) {
      const u = (ac.t * 0.35 + p.userData.ph) % 1, v = p.userData.v;
      const o = v.obj.position;
      p.position.set(o.x + Math.sin(u * 6 + p.userData.ph * 9) * 0.02, o.y + 0.1 + u * 0.28, o.z + Math.cos(u * 5 + p.userData.ph * 7) * 0.02);
      const sc = 0.04 + u * 0.1;
      p.scale.set(sc, sc, sc);
      p.material.opacity = (v.towed ? 0.15 : 0.42) * (1 - u) * smooth(0, 0.12, u);
    }
    if (ac.state === 'crash') {
      ac.ambTimer -= sdt;
      if (ac.ambTimer <= 0 && !ac.amb && !ac.noAmb) spawnAmbulance(ac);
      if (ac.amb) {
        advanceAmbulance(ac.amb, sdt);
        const a = ac.amb;
        a.speedNow = a.arrived ? 0 : a.speed;
        if (a.arrived) { ac.state = 'rescue'; ac.hold = 0; events.push('arrived'); }
      } else if (ac.noAmb && ac.t > 4) ac.state = 'rescue';
      else if (ac.noAmb === 'x') ac.state = 'rescue';
    } else if (ac.state === 'rescue') {
      ac.hold += sdt;
      if (ac.hold > 14) { ac.state = 'leave'; ac.hold = 0; }
    } else if (ac.state === 'leave') {
      ac.hold += sdt;
      if (ac.amb) {
        // รถพยาบาลออกไป (เดินหน้าต่อจนพ้นแผนที่/สุดถนน)
        const a = ac.amb;
        if (a.arrived) { a.arrived = false; a.route = null; a.leaving = true; a.speedNow = 1.3; }
        if (a.leaving) {
          if (!advance(a, sdt)) { removeAgent(a); ac.amb = null; }
        }
      }
    }
    updateTow(ac, sdt);
    if (!ac.dispersing && ac.state === 'leave' && ac.hold > 6 && ac.bodiesTaken) { ac.dispersing = true; ac.dispT = ac.t; }
    if (ac.dead > 0) updateCoroner(ac, sdt, nowT);
    updateScene(ac, sdt, nowT);
    // จบเหตุการณ์: รถพยาบาลออกไปแล้ว และรถยกเอารถเสียไปแล้ว (หรือไม่มีรถยก ก็เคลียร์ทิ้งหลังรอสักพัก)
    const ambGone = (!ac.amb || ac.amb.dead) && (!ac.coroner || ac.coroner.dead);
    const noTowFallback = ac.noTow && ac.state === 'leave' && ac.hold > 20;
    if (ambGone && (ac.towDone || noTowFallback) && (ac.state === 'leave' || ac.noAmb)) {
      if (noTowFallback) { for (const v of ac.victims) { const k = agents.car.indexOf(v); if (k >= 0) agents.car.splice(k, 1); removeAgent(v); } root.remove(ac.props); events.push('cleared'); }
      clearScene(ac);
      accident = null;
      accTimer = 70 + Math.random() * 110;
      return;
    }
    if (ac.state === 'leave' && ac.hold > 120) { // กันค้าง
      for (const v of ac.victims) { const k = agents.car.indexOf(v); if (k >= 0) agents.car.splice(k, 1); removeAgent(v); }
      if (ac.amb) removeAgent(ac.amb); if (ac.tow) removeAgent(ac.tow);
      root.remove(ac.props); clearScene(ac); accident = null; accTimer = 70;
      return;
    }
    // แสงสัญญาณรถพยาบาล
    const amb = ac.amb;
    if (amb && !amb.dead) {
      const ph = Math.sin(nowT * 12) > 0;
      amb.lr.visible = ph; amb.lb.visible = !ph;
      M.strobeR.emissiveIntensity = 2.2; M.strobeB.emissiveIntensity = 2.2;
    }
  }

  const NEAR2 = 24 * 24, HIDE2 = 62 * 62; // เกณฑ์ระยะ LOD ของคน/สัตว์เลี้ยง (หน่วยช่อง ยกกำลังสอง)


  // ---------- ด่านตรวจสุ่ม (ตำรวจตั้งด่านชั่วคราวบนถนนตรง รถผ่านช้าลง) ----------
  let checkpoint = null;
  function startCheckpoint() {
    if (checkpoint) return null;
    const cands = [];
    for (let z = 1; z < N - 1; z++) for (let x = 1; x < N - 1; x++) {
      if (tileType(x, z) !== 'road') continue;
      const h = tileType(x - 1, z) === 'road' && tileType(x + 1, z) === 'road' && tileType(x, z - 1) !== 'road' && tileType(x, z + 1) !== 'road';
      const v = tileType(x, z - 1) === 'road' && tileType(x, z + 1) === 'road' && tileType(x - 1, z) !== 'road' && tileType(x + 1, z) !== 'road';
      if (h || v) cands.push([x, z, h ? 'row' : 'col']);
    }
    if (!cands.length) return null;
    const [x, z, axis] = pick(cands);
    const g = new THREE.Group();
    const px = x - N / 2 + 0.5, pz = z - N / 2 + 0.5, py = groundY(x, z) + 0.06;
    g.position.set(px, py, pz);
    g.rotation.y = axis === 'row' ? Math.PI / 2 : 0;       // แกน local z = ทิศถนน
    for (const zz of [-0.36, 0.36]) for (let k = 0; k < 5; k++) {
      const c = mesh(coneGeo, M.cone); c.scale.set(0.03, 0.05, 0.03); c.position.set(-0.4 + k * 0.2, 0.025, zz); g.add(c);
    }
    const pc = glbWrap('police') || makeCar('sedan', M.car[10]);
    pc.obj.position.set(0.42, 0, 0.05); pc.obj.rotation.y = 0.1; g.add(pc.obj);
    const lr = mesh(boxGeo, M.strobeR, false), lb = mesh(boxGeo, M.strobeB, false);
    lr.scale.set(0.05, 0.02, 0.03); lr.position.set(0.39, 0.15, 0.05); lb.scale.set(0.05, 0.02, 0.03); lb.position.set(0.45, 0.15, 0.05);
    g.add(lr, lb);
    for (let k = 0; k < 2; k++) {
      const o = new THREE.Group(); o.position.set(-0.05 + k * 0.12, 0, 0.32 - k * 0.05);
      const cop = pickVehicle('cops');
      if (cop) { o.add(cop); o.rotation.y = Math.PI + (k ? 0.5 : -0.5); g.add(o); continue; }   // ตำรวจโมเดล .glb (สุ่ม 2 แบบ) หันหน้าเข้าหาถนน
      o.add(mesh(boxGeo, M.white, false)); o.children[0].scale.set(0.035, 0.07, 0.025); o.children[0].position.y = 0.035;
      const hd = mesh(sphGeo, M.white, false); hd.scale.setScalar(0.03); hd.position.y = 0.085; o.add(hd);
      const vest = mesh(boxGeo, M.cone, false); vest.scale.set(0.038, 0.03, 0.028); vest.position.y = 0.045; o.add(vest);
      g.add(o);
    }
    const sign = mesh(boxGeo, M.strobeB, false); sign.scale.set(0.12, 0.05, 0.01); sign.position.set(0, 0.16, 0.36); g.add(sign);
    root.add(g);
    checkpoint = { x, z, axis, g, lr, lb, t: 0, stopped: 0 };
    return { x, z, axis };
  }
  function endCheckpoint() {
    if (!checkpoint) return null;
    root.remove(checkpoint.g);
    const r = { x: checkpoint.x, z: checkpoint.z, axis: checkpoint.axis, stopped: checkpoint.stopped };
    checkpoint = null;
    return r;
  }

  // กลุ่มรถซิ่ง: kind = 'bike' | 'car' วิ่งเร็วเป็นขบวนชั่วคราว ฝ่าไฟแดง
  function startRacePack(kind = 'bike') {
    if (dirty) rebuildLists();
    const list = lists.car;
    if (!list.length || agents.car.some(a => a.racer)) return false;
    for (let tries = 0; tries < 12; tries++) {
      const [x, z] = list[(Math.random() * list.length) | 0];
      const opts = DIRS.filter(([dx, dz]) => walkable('car', x + dx, z + dz));
      if (!opts.length) continue;
      const d = opts[(Math.random() * opts.length) | 0];
      const n = kind === 'bike' ? 4 + Math.floor(Math.random() * 4) : 3 + Math.floor(Math.random() * 3);
      const ttl = 28 + Math.random() * 14;
      let prev = null;
      for (let i = 0; i < n; i++) {
        const a = createAgent('car', x, z, d, kind === 'bike' ? 'rbike' : 'rcar');
        a.ttl = ttl; a.stuntT = Math.random() * 3;
        if (kind === 'bike' && i % 2 === 1 && prev) {   // ขับคู่ ขนานกัน คนละฝั่งเลน ความเร็วเท่ากัน
          a.pair = prev; prev.pair = a; a.side = -1; a.s = prev.s; a.speed = prev.speed;
        } else a.s = Math.min(0.92, Math.floor(i / 2) * 0.3);
        prev = a;
        agents.car.push(a);
      }
      events.push({ e: 'pack', kind, x, z, axis: d[0] !== 0 ? 'row' : 'col', n });
      return true;
    }
    return false;
  }


  // ท่าโชว์ของเด็กแว้น: ยกหน้า (wheelie) / นอนขับ / ขับปกติ สลับกันเป็นช่วงๆ
  function stuntUpdate(a, dt, sdt) {
    if (a.crash) { a.rig.rotation.x = a.flip ? -1.15 : 0; return; }
    a.stuntT -= dt;
    if (a.stuntT <= 0) {
      if (a.stunt) { a.stunt = null; a.stuntT = 1.5 + Math.random() * 3; }
      else { const r = Math.random(); a.stunt = r < 0.5 ? 'wheelie' : r < 0.82 ? 'lying' : null; a.stuntT = a.stunt ? 2.5 + Math.random() * 2.2 : 1.2 + Math.random() * 2; }
      const lie = a.stunt === 'lying';
      if (a.lieMesh) { a.lieMesh.visible = lie; a.bodyMesh.visible = !lie; }
    }
    const target = a.stunt === 'wheelie' ? 0.62 : 0;
    a.pitch += (target - a.pitch) * Math.min(1, dt * 4.5);
    a.rig.rotation.x = -a.pitch;
  }

  // ---------- การขับรถ ----------
  // เส้นทางข้างหน้า 3 ช่อง: ช่องปัจจุบัน, ช่องถัดไป (เลี้ยวไปทาง n), ช่องถัดไปอีก (สมมติตรงไป)
  // off = ระยะจากรถถึงกลางช่องนั้นตามเส้นทาง
  const _path = [{}, {}, {}];
  function pathOf(a) {
    const p = _path;
    p[0].x = a.x; p[0].z = a.z; p[0].d = a.d; p[0].off = -a.s;
    p[1].x = a.x + a.d[0]; p[1].z = a.z + a.d[1]; p[1].d = a.n; p[1].off = 1 - a.s;
    p[2].x = p[1].x + a.n[0]; p[2].z = p[1].z + a.n[1]; p[2].d = a.n; p[2].off = 2 - a.s;
    return p;
  }
  const isJ = (x, z) => signal(x, z, 'x') !== null;   // มีไฟจราจร = ทางแยก
  const bucketAt = (bucket, x, z) => bucket.get(x * 4096 + z);

  // สิ่งกีดขวางบนเลนของเราตามเส้นทาง: รถคันหน้า, รถสวนที่อยู่ในเลนเรา (หรือเราล้ำไปเลนเขา), รถที่ยังขวางกลางแยก
  // ใส่ลง out เป็นชุดละ 4 ค่า [ระยะกันชน, ความเร็วตามทิศเรา, รถ, เป็นคันหน้าทิศเดียวกันไหม]
  function scanAhead(a, bucket, P, out) {
    out.length = 0;
    const me0 = a.lo * a.side;
    for (let k = 0; k < 3; k++) {
      const T = P[k], lst = bucketAt(bucket, T.x, T.z);
      if (!lst) continue;
      const meT = laneTarget(a, T.x, T.z) * a.side;
      for (const o of lst) {
        if (o === a || o.pair === a) continue;
        const ol = o.lo * o.side;
        let dist, vl, same = true;
        if (o.d[0] === T.d[0] && o.d[1] === T.d[1]) {
          // รวมคันที่กำลังเปลี่ยนเข้าเลนเรา (tlo = เลนเป้าหมาย) ให้คันหลังเว้นระยะให้แทรก
          // แต่ถ้าขนานกันอยู่แล้วไม่ต้องหยุด (ขับผ่านไปให้เขาแทรกข้างหลัง)
          const inLane = latHit(ol, me0) || latHit(ol, meT);
          if (!inLane && !latHit((o.tlo ?? o.lo) * o.side, me0)) continue;
          dist = T.off + o.s; vl = o.speedNow;
          if (!inLane && dist - (a.len + (o.len || 0.34)) / 2 < 0.02) continue;
        } else if (o.d[0] === -T.d[0] && o.d[1] === -T.d[1]) {
          if (a.side < 0 || o.side < 0) continue;   // คู่เด็กแว้นขี่เลนสวน: ต่างคนต่างหลบ (ไม่หยุดรอกัน)
          if (!latHit(-ol, me0) && !latHit(-ol, meT)) continue;
          dist = T.off - o.s; vl = -o.speedNow; same = false;
        } else if (k === 1 && o.d[0] === a.d[0] && o.d[1] === a.d[1] && o.s < 0.3) {
          dist = T.off + o.s; vl = 0; same = false;
        } else continue;
        if (dist <= 0.001) continue;
        out.push(dist - (a.len + (o.len || 0.34)) / 2, vl, o, same);
      }
    }
    return out;
  }

  // ระยะตามแนวถนนจากรถ a ถึงรถ o ที่วิ่งทิศเดียวกันในช่องข้างหลัง/ช่องนี้/ช่องหน้า (+ = อยู่ข้างหน้า, null = ไม่อยู่ใกล้)
  function relPos(a, o) {
    if (o.d[0] !== a.d[0] || o.d[1] !== a.d[1]) return null;
    for (let k = -1; k <= 1; k++) if (o.x === a.x + a.d[0] * k && o.z === a.z + a.d[1] * k) return k + o.s - a.s;
    return null;
  }
  // ช่องว่างรอบตัวรถในเลนที่ห่างกลางถนน lat: [ระยะถึงคันหน้า, ระยะถึงคันหลัง, ความเร็วคันหลัง]
  function laneGaps(a, bucket, lat) {
    let ahead = Infinity, behind = Infinity, vb = 0;
    for (let k = -1; k <= 1; k++) {
      const lst = bucketAt(bucket, a.x + a.d[0] * k, a.z + a.d[1] * k);
      if (!lst) continue;
      for (const o of lst) {
        if (o === a || !latHit(o.lo * o.side, lat)) continue;
        const rel = relPos(a, o);
        if (rel === null) continue;
        const g = Math.abs(rel) - (a.len + (o.len || 0.34)) / 2;
        if (rel >= 0) ahead = Math.min(ahead, g); else if (g < behind) { behind = g; vb = o.speedNow; }
      }
    }
    return [ahead, behind, vb];
  }
  // มีรถสวนมาในระยะ range ช่องข้างหน้าไหม (ใช้ตัดสินใจแซงบนถนน 2 เลน)
  function oncomingWithin(a, bucket, range) {
    for (let k = 0; k <= Math.ceil(range); k++) {
      const lst = bucketAt(bucket, a.x + a.d[0] * k, a.z + a.d[1] * k);
      if (!lst) continue;
      for (const o of lst) {
        if (o.d[0] !== -a.d[0] || o.d[1] !== -a.d[1]) continue;
        const rel = k - o.s - a.s;
        if (rel > -0.4 && rel < range) return true;
      }
    }
    return false;
  }

  // ตัดสินใจเปลี่ยนเลน (เรียกทุก ~0.3-0.6 วินาที)
  //  ถนน 4 เลน: แซงทางเลนขวาเมื่อคันหน้าช้า, กลับเลนซ้ายเมื่อว่าง, เข้าเลนตามทิศที่จะเลี้ยว, ถนนแคบลงข้างหน้าต้องรวมเลน
  //  ถนน 2 เลน/ซอย: แซงทางเลนสวนเมื่อคันหน้าจอด/ช้ามาก ทางตรง ไม่มีแยก และไม่มีรถสวน
  function laneLogic(a, bucket, P, v0) {
    const n0 = lanesAt(a.x, a.z), n1 = lanesAt(P[1].x, P[1].z);
    const turning = a.n[0] !== a.d[0] || a.n[1] !== a.d[1];
    const latOf = lane => { const keep = a.lane; a.lane = lane; const r = laneTarget(a, a.x, a.z) * a.side; a.lane = keep; return r; };
    const safe = (lane, need = 0.35) => { const [ah, bh, vb] = laneGaps(a, bucket, latOf(lane)); return ah > need && bh > 0.25 + Math.max(0, vb - a.speedNow) * 0.8; };

    if (a.lane < 0) {   // กำลังแซงอยู่ในเลนสวน
      const rp = a.passing && !a.passing.dead ? relPos(a, a.passing) : null;
      const done = rp === null || rp < -(a.len + (a.passing.len || 0.34)) / 2 - 0.1;
      const danger = turning || isJ(P[1].x, P[1].z) || oncomingWithin(a, bucket, 1.3);
      a.passT += 0.45;
      // แซงไม่พ้น/ติดอยู่นาน: เบียดกลับเลนตัวเอง (forceMerge ข้ามการรอข้างๆ กันรถล็อกกัน)
      const force = a.passT > 6 || (a.speedNow < 0.05 && a.passT > 1.5);
      if ((done || danger || force) && (safe(0, 0.15) || force)) { a.lane = 0; a.passing = null; a.forceMerge = force; }
      return;
    }
    if (isJ(a.x, a.z)) return;   // ไม่เปลี่ยนเลนกลางทางแยก
    if (n0 === 1) {
      if (a.lane > 0) a.lane = 0;
      const lead = a.lead;
      if (!lead || a.leadGap > 0.9 || turning || n1 !== 1) return;
      if (!(lead.crash || (lead.speedNow < 0.55 * v0 && a.blockT > 1))) return;
      if (lead.lane < 0 || lead.passing) return;                                   // ไม่แซงต่อท้ายคันที่กำลังแซง
      if (!lead.crash && lead.leadGap < a.len + 0.4) return;                       // คันหน้าติดคิว: แซงไปก็กลับเข้าเลนไม่ได้
      if (isJ(P[1].x, P[1].z) || isJ(P[2].x, P[2].z) || tileType(P[2].x, P[2].z) !== 'road' || lanesAt(P[2].x, P[2].z) !== 1) return;
      if (oncomingWithin(a, bucket, 3)) return;
      a.lane = -1; a.passing = lead; a.passT = 0;
      return;
    }
    let want = a.lane;
    if (n1 === 1) want = 0;                                              // ถนนแคบลงข้างหน้า
    else if (turning && isJ(P[1].x, P[1].z)) want = a.n[0] === a.d[1] && a.n[1] === -a.d[0] ? 0 : 1;   // เลี้ยวซ้ายชิดซ้าย / เลี้ยวขวาเลนขวา
    else if (a.lane === 0) { if (a.lead && a.leadGap < 1.4 && a.lead.speedNow < v0 * 0.85) want = 1; }
    else if (laneGaps(a, bucket, latOf(0))[0] > 1.2) want = 0;         // ขับชิดซ้ายเมื่อเลนซ้ายว่าง
    if (want !== a.lane && (safe(want) || (n1 === 1 && a.s > 0.5))) a.lane = want;
  }

  // ความเร็วรถแต่ละเฟรม: IDM (เร่งถึงความเร็วที่ต้องการ เว้นระยะตามความเร็ว เบรกนุ่มนวล) + ไฟแดง + ชะลอเข้าโค้ง
  const _obs = [];
  function drive(a, sdt, bucket, wetSlow, rain) {
    const P = pathOf(a), v = a.speedNow;
    let lim = speedLimit(a.x, a.z) || KMH;
    if (a.s > 0.4) lim = Math.min(lim, speedLimit(P[1].x, P[1].z) || lim);   // ใกล้เข้าเขตความเร็วต่ำกว่า: ชะลอก่อน
    let v0 = desiredSpeed(a, lim) * wetSlow;
    if (hazards.size) { const hz = hazards.get(a.x * 4096 + a.z) ?? (a.s > 0.5 ? hazards.get(P[1].x * 4096 + P[1].z) : undefined); if (hz) v0 *= hz; }   // ถนนพัง/ท่อแตก รถชะลอ
    if (checkpoint && a.x === checkpoint.x && a.z === checkpoint.z) { v0 *= 0.3; if (a.s > 0.4 && a.s < 0.5 && !a.chk) { a.chk = true; checkpoint.stopped++; } }
    v0 = Math.max(v0, 0.05);
    const A = a.acc * (1 - 0.25 * rain), B = B_COMF * (1 - 0.2 * rain), T = a.T * (1 + 0.4 * rain);   // ถนนเปียก: เร่ง/เบรกเบาลง เว้นระยะมากขึ้น
    const free = 1 - (v / v0) ** 4;
    let acc = A * free, minGap = Infinity;
    const follow = (gap, vl) => {
      const want = S0 + Math.max(0, v * T + (v * (v - vl)) / (2 * Math.sqrt(A * B)));
      acc = Math.min(acc, A * (free - (want / Math.max(gap, 0.005)) ** 2));
      if (gap < minGap) minGap = gap;
    };
    const obs = scanAhead(a, bucket, P, _obs);
    let lead = null, leadGap = Infinity;
    for (let i = 0; i < obs.length; i += 4) {
      follow(obs[i], obs[i + 1]);
      if (obs[i + 3] && obs[i] < leadGap) { leadGap = obs[i]; lead = obs[i + 2]; }
    }
    // ไฟเหลือง/แดง: หยุดที่เส้นหยุด มองล่วงหน้า 2 แยก (วิ่งเร็วต้องเริ่มเบรกไกลขึ้น)
    if (!(a.racer && a.runRed)) {
      for (let k = 0; k < 2; k++) {
        const S = P[k], st = signal(S.x + S.d[0], S.z + S.d[1], S.d[0] !== 0 ? 'x' : 'z');
        if (!st || st === 'g') continue;
        const dist = S.off + CAR_STOP;
        if (dist <= 0) continue;                       // ผ่านเส้นหยุดแล้ว
        const need = (v * v) / (2 * dist);             // แรงเบรกที่ต้องใช้หยุดให้ทัน
        if (st === 'y' && need > B * 1.4) continue;    // เหลืองแต่ใกล้เกินจะเบรก → ไปต่อ
        if (need > B_MAX * 0.8) continue;              // แดงแต่เบรกไม่ทันแล้ว
        follow(dist, 0);
        break;
      }
    }
    // ชะลอก่อนเลี้ยว/กลับรถ
    if (a.n[0] !== a.d[0] || a.n[1] !== a.d[1]) {
      const vc = a.n[0] === -a.d[0] && a.n[1] === -a.d[1] ? UTURN_V : TURN_V;
      const cap = Math.sqrt(vc * vc + 2 * B * Math.max(0, 0.6 - a.s));
      if (v > cap) acc = Math.min(acc, (cap - v) / 0.3);
    }
    acc = Math.max(acc, -B_MAX);
    let nv = Math.max(0, v + acc * sdt);
    if (minGap < Infinity) nv = Math.min(nv, Math.max(0, minGap - S0 * 0.5) / sdt);   // กันทะลุคันหน้าตอนเร่งเวลาเกม
    a.speedNow = nv;
    a.accNow = (nv - v) / sdt;   // ความเร่งจริง (ใช้ทำตัวรถก้ม/เงย)
    a.braking = acc < -0.35;
    a.lead = lead; a.leadGap = leadGap;
    a.blockT = lead && leadGap < 0.8 && nv < 0.75 * v0 ? a.blockT + sdt : 0;

    // เลื่อนไปยังเลนเป้าหมายอย่างนุ่มนวล (เลี้ยวเปลี่ยนเลนเร็วขึ้นตามความเร็ว)
    const ref = a.s < 0.5 ? P[0] : P[1];
    const tgt = laneTarget(a, ref.x, ref.z), rate = (0.12 + 0.3 * nv) * sdt;
    a.tlo = tgt;
    // มีรถอยู่ข้างๆ ในเลนที่จะเข้า: รอก่อน ไม่เบียด
    const moving = Math.abs(tgt - a.lo) > 0.03;
    if (!moving) a.forceMerge = false;
    const sideBlocked = moving && !a.forceMerge && (() => { const [ah, bh] = laneGaps(a, bucket, tgt * a.side); return ah < 0.02 || bh < 0.02; })();
    if (!sideBlocked) a.lo += Math.max(-rate, Math.min(rate, tgt - a.lo));
    a.lcT -= sdt;
    if (a.lcT <= 0 && !a.pair) { a.lcT = 0.3 + Math.random() * 0.3; laneLogic(a, bucket, P, v0); }
  }

  function update(dt, night, gameSpeed, env = {}) {
    const cam = env.cam || null;
    const rain = env.rain || 0;
    const lamp = Math.max(night, env.dark || 0);
    M.lamp.color.setScalar(0.5 + lamp * 1.8);
    accRate = env.accidentRate ?? 1;
    lastEnv = { rain, night, hospital: !!env.hospital, police: env.police || 0, drunk: env.drunk || 0 };
    const nowT = performance.now() / 1000;

    adjustTimer += dt;
    if (adjustTimer > 0.4) { adjustTimer = 0; adjustCounts(); }

    const sdt = dt * gameSpeed;
    if (venuesDirty) syncVenues();
    const wetSlow = 1 - 0.22 * rain; // ถนนลื่น รถช้าลงตอนฝนตก

    // เหตุการณ์อุบัติเหตุ: ฝนตกเกิดบ่อยขึ้น
    if (!accident && accRate > 0 && agents.car.length >= 5) {
      accTimer -= sdt * (1 + 1.6 * rain) * accRate;
      if (accTimer <= 0) { if (!startAccident()) accTimer = 6; }
    }

    // รถ: เร่ง/เบรกตามคันหน้า ไฟจราจร ทางโค้ง และเขตความเร็ว + เปลี่ยนเลน/แซง (ดู drive)
    const cars = agents.car;
    // แบ่งรถตามช่อง ให้เช็คเฉพาะรถในช่องใกล้ๆ (เดิมเทียบทุกคันกับทุกคัน O(n²))
    const bucket = new Map();
    for (const o of cars) { const k = o.x * 4096 + o.z; const l = bucket.get(k); if (l) l.push(o); else bucket.set(k, [o]); }
    for (const a of cars) {
      if (a.crash) { a.speedNow = 0; continue; }
      if (sdt > 0) drive(a, sdt, bucket, wetSlow, rain);
    }

    for (const type of Object.keys(agents)) {
      const arr = agents[type];
      let removed = false;
      for (const a of arr) {
        if (a.visit) { updateVisit(a, sdt, env); continue; }
        if (a.racer && !a.crash) { a.ttl -= dt; if (a.ttl <= 0) { removeAgent(a); removed = true; continue; } }
        if (a.kind !== 'car') a.speedNow = a.speed * signalFactor(a);
        if (!a.crash && sdt > 0 && !advance(a, sdt)) { removeAgent(a); removed = true; continue; }
        place(a);
        if (type === 'person' && sdt > 0) maybeVisit(a, sdt);
        if (a.role === 'rbike' && a.rig) stuntUpdate(a, dt, sdt);
        if (a.full && cam) {
          // ระยะจากกล้อง: ไกลมาก = ซ่อน, ไกล = โมเดลรวมชิ้นเดียว ไม่แกว่งแขนขา, ใกล้ = เคลื่อนไหวเต็ม
          const dx = a.obj.position.x - cam.x, dy = a.obj.position.y - cam.y, dz = a.obj.position.z - cam.z;
          const d2 = dx * dx + dy * dy + dz * dz;
          if (d2 > HIDE2) { a.obj.visible = false; continue; }
          a.obj.visible = true;
          const near = d2 < NEAR2;
          if (a.near !== near) { a.near = near; for (const p of a.lodParts) p.visible = near; a.full.visible = !near; }
          if (near && inView(a, env.frustum)) animate(a);
        } else if (inView(a, env.frustum)) animate(a);
      }
      if (removed) agents[type] = arr.filter(a => !a.dead);
    }

    updateAccident(dt, sdt, nowT);
    updateCrews(sdt, nowT);
    if (checkpoint) { checkpoint.t += sdt; const ph = Math.sin(nowT * 11) > 0; checkpoint.lr.visible = ph; checkpoint.lb.visible = !ph; }
    if (accident?.amb && !accident.amb.dead) place(accident.amb);
  }

  return {
    // จำนวนเป้าหมายแต่ละชนิด (ผู้เรียกคำนวณจากประชากร/เวลา/อากาศ)
    setTargets({ car = 0, person = 0, dog = 0, cat = 0, bus = 0, taxi = 0, grab = 0, cargo = 0, ev = 0 }) {
      targets = { car, person, dog, cat, bus, taxi, grab, cargo };
      evShare = ev;
    },
    counts() {
      return { car: agents.car.length, bike: agents.car.filter(a => a.isBike).length, bus: agents.car.filter(a => a.role === 'bus').length, taxi: agents.car.filter(a => a.role === 'taxi').length, grab: agents.car.filter(a => a.role === 'grab').length, ev: agents.car.filter(a => a.isEV).length, cargo: agents.car.filter(a => a.role === 'cargo').length, person: agents.person.length, dog: agents.dog.length, cat: agents.cat.length };
    },
    invalidate() { dirty = true; venuesDirty = true; },
    setVenueProvider(fn) { venueProvider = fn; venuesDirty = true; },
    startRacePack,
    startCheckpoint, endCheckpoint, checkpointActive: () => !!checkpoint, checkpointAge: () => (checkpoint ? checkpoint.t : 0),
    racers() { let n = 0, b = 0; for (const a of agents.car) if (a.racer && !a.crash) { n++; if (a.isBike) b++; } return { n, bike: b }; },
    update,
    // ทดสอบ/สั่งให้เกิดอุบัติเหตุทันที
    triggerAccident() { return startAccident(); },
    takeEvents() { return events.splice(0, events.length); },
    dispatchCrew, crewCount: () => crews.length, forceAccident: n => startAccident(n),
    setHazard(x, z, f) { if (f > 0 && f < 1) hazards.set(x * 4096 + z, f); else hazards.delete(x * 4096 + z); },
    emergency() { return !!(accident && accident.amb && !accident.amb.dead && !accident.amb.arrived); },
    accidentActive() { return !!accident; },
    clear() {
      for (const type of Object.keys(agents)) {
        for (const a of agents[type]) removeAgent(a);
        agents[type] = [];
      }
      if (checkpoint) endCheckpoint();
      for (const c of crews) removeAgent(c);
      crews.length = 0;
      if (accident) clearScene(accident);
      if (accident) { root.remove(accident.props); if (accident.amb) removeAgent(accident.amb); if (accident.tow) removeAgent(accident.tow); for (const v of accident.victims) removeAgent(v); accident = null; }
      accTimer = 50;
    },
  };
}
