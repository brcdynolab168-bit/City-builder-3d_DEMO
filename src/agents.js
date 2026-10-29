import * as THREE from 'three';
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

export function createAgents({ scene, N, tileType, groundY = () => 0, signal = () => null }) {
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
  const CAR_TYPES = ['sedan', 'sedan', 'hatch', 'suv', 'pickup', 'hatch'];
  function makeCar(type = pick(CAR_TYPES), bodyMat = pick(M.car)) {
    const G = carGeos(type);
    const g = new THREE.Group();
    const bodyM = mesh(G.body, bodyMat);
    const lamps = mesh(G.lamps, M.lamp, false);
    g.add(bodyM, mesh(G.detail, M.detail), lamps);
    return { obj: g, headMesh: lamps, tailMesh: lamps };
  }


  // ---------- มอเตอร์ไซค์ (คนขับสวมหมวกกันน็อก) ----------
  const BIKE_COLS = [[0xd32f2f, 0x263238, 0xf5f5f5], [0x1565c0, 0x37474f, 0xffd54f], [0x212121, 0xc62828, 0x212121], [0xfdd835, 0x1b5e20, 0xffffff], [0xeeeeee, 0x6a1b9a, 0xfafafa], [0xef6c00, 0x263238, 0xf5f5f5]];
  const bikeCache = {};
  function bikeGeos(i, grab = false) {
    const key = grab ? 'g' + (i % 3) : i % BIKE_COLS.length;
    if (bikeCache[key]) return bikeCache[key];
    const [paint, jacket, helmet] = grab ? [0x00b14f, 0x00b14f, 0x00b14f] : BIKE_COLS[i % BIKE_COLS.length];
    const b = [], lamps = [];
    for (const z of [-0.07, 0.07]) {
      b.push(part(cylGeo, 0x161616, 0, 0.026, z, 0.052, 0.014, 0.052, 0, 0, Math.PI / 2));
      b.push(part(cylGeo, 0xb8bec4, 0, 0.026, z, 0.026, 0.016, 0.026, 0, 0, Math.PI / 2));
    }
    b.push(part(boxGeo, paint, 0, 0.056, -0.005, 0.034, 0.05, 0.13));              // ตัวถัง/ถัง
    b.push(part(boxGeo, 0x222222, 0, 0.088, -0.03, 0.034, 0.014, 0.075));          // เบาะ
    b.push(part(boxGeo, paint, 0, 0.065, -0.085, 0.032, 0.03, 0.04));              // ท้าย
    b.push(part(boxGeo, 0x888888, 0, 0.06, 0.06, 0.01, 0.075, 0.012, 0.35));       // โช้คหน้า
    b.push(part(boxGeo, 0x222222, 0, 0.1, 0.07, 0.075, 0.009, 0.009));             // แฮนด์
    // คนขับ
    b.push(part(boxGeo, jacket, 0, 0.128, -0.025, 0.044, 0.06, 0.03, 0.35));       // ลำตัว
    b.push(part(sphGeo, helmet, 0, 0.178, 0.0, 0.036, 0.038, 0.04));               // หมวกกันน็อก
    b.push(part(boxGeo, 0x222222, 0, 0.176, 0.016, 0.03, 0.014, 0.01));            // กระจกหมวก
    for (const sx of [-1, 1]) {
      b.push(part(boxGeo, jacket, sx * 0.026, 0.12, 0.02, 0.012, 0.012, 0.075, 0.2));  // แขน
      b.push(part(boxGeo, 0x2f3e4e, sx * 0.024, 0.088, -0.02, 0.014, 0.014, 0.07, -0.4)); // ขา
    }
    lamps.push(part(boxGeo, 0xfff6d8, 0, 0.09, 0.082, 0.026, 0.02, 0.01));
    lamps.push(part(boxGeo, 0xdd2a1a, 0, 0.066, -0.108, 0.026, 0.014, 0.008));
    return (bikeCache[key] = { body: merge(b), lamps: merge(lamps) });
  }
  function makeBike(grab = false) {
    const G = bikeGeos((Math.random() * 12) | 0, grab);
    const g = new THREE.Group();
    const lamps = mesh(G.lamps, M.lamp, false);
    g.add(mesh(G.body, M.vc, false), lamps);
    return { obj: g, headMesh: lamps, tailMesh: lamps, isBike: true };
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
    const G = busGeos((Math.random() * 3) | 0);
    const g = new THREE.Group();
    const lamps = mesh(G.lamps, M.lamp, false);
    g.add(mesh(G.body, M.vc), lamps);
    return { obj: g, headMesh: lamps, tailMesh: lamps };
  }
  // แท็กซี่/แกร็บ: รถปกติ + ป้ายไฟบนหลังคา
  function makeTaxiLike(grab) {
    const made = grab ? makeCar(pick(CAR_TYPES), M.grab) : makeCar('sedan', pick(M.taxi));
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
  function makeQuad(G, hipY, hx, hz) {
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
    return { obj: g, legs, lodParts, full, near: true };
  }
  const makeDog = () => makeQuad(dogGeos(Math.floor(Math.random() * 12)), 0.048, 0.014, 0.03);
  const makeCat = () => makeQuad(catGeos(Math.floor(Math.random() * 10)), 0.038, 0.01, 0.022);

  // ---------- เส้นทาง ----------
  const walkable = (kind, x, z) => {
    if (x < 0 || z < 0 || x >= N || z >= N) return false;
    const t = tileType(x, z);
    return kind === 'car' ? t === 'road' : (t === 'road' || t === 'park');
  };

  let dirty = true;
  const lists = { car: [], walker: [] };
  function rebuildLists() {
    lists.car.length = 0;
    lists.walker.length = 0;
    for (let z = 0; z < N; z++) {
      for (let x = 0; x < N; x++) {
        const t = tileType(x, z);
        if (t === 'road') { lists.car.push([x, z]); lists.walker.push([x, z]); }
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
  let targets = { car: 0, person: 0, dog: 0, cat: 0, bus: 0, taxi: 0, grab: 0 };

  const SPECIAL = ['bus', 'taxi', 'grab', 'rbike', 'rcar'];
  function createAgent(type, x, z, d, role = null) {
    let made, kind = 'walker', speed, lat;
    if (type === 'car') {
      kind = 'car'; lat = 0.15; speed = 0.95 + Math.random() * 0.2;
      if (role === 'bus') { made = makeBus(); speed = 0.7 + Math.random() * 0.1; }
      else if (role === 'taxi') { made = makeTaxiLike(false); speed = 0.9 + Math.random() * 0.15; }
      else if (role === 'grab') { const bk = Math.random() < 0.45; made = bk ? makeBike(true) : makeTaxiLike(true); speed = 1 + Math.random() * 0.2; if (bk) lat = 0.2; }
      else if (role === 'rbike') { made = makeBike(); speed = 1.9 + Math.random() * 0.6; lat = 0.2; }
      else if (role === 'rcar') { made = makeCar(pick(['sedan', 'hatch'])); speed = 1.7 + Math.random() * 0.5; }
      else if (Math.random() < 0.22) { made = makeBike(); role = 'bike'; speed = 1.1 + Math.random() * 0.25; lat = 0.2; }
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
    root.add(a.obj);
    return a;
  }

  function spawn(type, role = null) {
    if (dirty) rebuildLists();
    const kind = type === 'car' ? 'car' : 'walker';
    const list = lists[kind];
    if (!list.length) return null;
    for (let tries = 0; tries < 12; tries++) {
      const [x, z] = list[(Math.random() * list.length) | 0];
      const opts = DIRS.filter(([dx, dz]) => walkable(kind, x + dx, z + dz));
      if (!opts.length) continue;
      return createAgent(type, x, z, opts[(Math.random() * opts.length) | 0], role);
    }
    return null;
  }

  function removeAgent(a) {
    root.remove(a.obj);
    a.dead = true;
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
    for (const role of ['bus', 'taxi', 'grab']) {
      const tg = Math.min(targets[role] || 0, Math.floor(lists.car.length * 0.12));
      const have = agents.car.filter(a => a.role === role);
      if (have.length < tg) { const a = spawn('car', role); if (a) agents.car.push(a); }
      else if (have.length > tg) { const v = have.find(a => !a.crash); if (v) { removeAgent(v); agents.car = agents.car.filter(a => !a.dead); } }
    }
  }

  const mag = (a, tx, tz) => (a.kind === 'car' ? a.lat : (tileType(tx, tz) === 'road' ? a.lat : 0));

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
      a.bob = Math.abs(s) * 0.003;
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

  function startAccident() {
    if (accident) return false;
    if (dirty) rebuildLists();
    const cars = agents.car.filter(c => !c.crash && c.s > 0.42 && c.s < 0.78 && tileType(c.x, c.z) === 'road');
    if (cars.length < 1) return false;
    const racerCars = cars.filter(c => c.racer);
    const a = racerCars.length && Math.random() < 0.65 ? pick(racerCars) : pick(cars);
    // รถคันหลังที่ชนท้าย (ในช่องเดียวกัน เลนเดียวกัน)
    const b = agents.car.find(o => o !== a && !o.crash && o.d[0] === a.d[0] && o.d[1] === a.d[1] && o.x === a.x && o.z === a.z && o.s < a.s && o.s > a.s - 0.45);
    const victims = [a];
    a.crash = { yaw: (Math.random() < 0.5 ? -1 : 1) * (0.15 + Math.random() * 0.2), roll: 0.03, t: 0 };
    a.lat = 0.19;
    if (b) { b.s = Math.max(0, a.s - 0.33); b.crash = { yaw: (Math.random() < 0.5 ? -1 : 1) * (0.1 + Math.random() * 0.25), roll: -0.03, t: 0 }; victims.push(b); }
    // สาเหตุและผู้ได้รับผลกระทบ
    const rain = lastEnv.rain, night = lastEnv.night;
    let cause;
    if (b) { const p = Math.random(); cause = p < 0.12 + 0.28 * night ? 'race' : p < 0.5 ? 'cutoff' : 'rear'; }
    else cause = rain > 0.3 ? 'slip' : 'solo';
    if (!b && !a.racer && Math.random() < 0.3) cause = 'breakdown';
    if (!a.racer && cause !== 'breakdown' && lastEnv.drunk > 0 && Math.random() < 0.5 * lastEnv.drunk) cause = 'drunk';
    if (a.racer) cause = 'race';
    const pDead = ({ race: 0.42, cutoff: 0.12, rear: 0.06, solo: 0.14, slip: 0.1, breakdown: 0, drunk: 0.3 })[cause] * (1 + 0.6 * rain) * (lastEnv.hospital ? 0.7 : 1.4) * (a.isBike ? 1.5 : 1);
    const dead = Math.random() < pDead ? (cause === 'race' && b && Math.random() < 0.3 ? 2 : 1) : 0;
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
    events.push({ e: 'crash', cause, injured, dead, x: a.x, z: a.z, axis: a.d[0] !== 0 ? 'row' : 'col', clip: Math.random() < 0.5, bike: !!a.isBike, racer: !!a.racer });
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
    // จบเหตุการณ์: รถพยาบาลออกไปแล้ว และรถยกเอารถเสียไปแล้ว (หรือไม่มีรถยก ก็เคลียร์ทิ้งหลังรอสักพัก)
    const ambGone = !ac.amb || ac.amb.dead;
    const noTowFallback = ac.noTow && ac.state === 'leave' && ac.hold > 20;
    if (ambGone && (ac.towDone || noTowFallback) && (ac.state === 'leave' || ac.noAmb)) {
      if (noTowFallback) { for (const v of ac.victims) { const k = agents.car.indexOf(v); if (k >= 0) agents.car.splice(k, 1); removeAgent(v); } root.remove(ac.props); events.push('cleared'); }
      accident = null;
      accTimer = 70 + Math.random() * 110;
      return;
    }
    if (ac.state === 'leave' && ac.hold > 120) { // กันค้าง
      for (const v of ac.victims) { const k = agents.car.indexOf(v); if (k >= 0) agents.car.splice(k, 1); removeAgent(v); }
      if (ac.amb) removeAgent(ac.amb); if (ac.tow) removeAgent(ac.tow);
      root.remove(ac.props); accident = null; accTimer = 70;
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
    const pc = makeCar('sedan', M.car[10]);
    pc.obj.position.set(0.42, 0, 0.05); pc.obj.rotation.y = 0.1; g.add(pc.obj);
    const lr = mesh(boxGeo, M.strobeR, false), lb = mesh(boxGeo, M.strobeB, false);
    lr.scale.set(0.05, 0.02, 0.03); lr.position.set(0.39, 0.15, 0.05); lb.scale.set(0.05, 0.02, 0.03); lb.position.set(0.45, 0.15, 0.05);
    g.add(lr, lb);
    for (let k = 0; k < 2; k++) {
      const o = new THREE.Group(); o.position.set(-0.05 + k * 0.12, 0, 0.32 - k * 0.05);
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
      for (let i = 0; i < n; i++) {
        const a = createAgent('car', x, z, d, kind === 'bike' ? 'rbike' : 'rcar');
        a.s = Math.min(0.92, i * 0.17); a.ttl = ttl;
        agents.car.push(a);
      }
      events.push({ e: 'pack', kind, x, z, axis: d[0] !== 0 ? 'row' : 'col', n });
      return true;
    }
    return false;
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
    const wetSlow = 1 - 0.22 * rain; // ถนนลื่น รถช้าลงตอนฝนตก

    // เหตุการณ์อุบัติเหตุ: ฝนตกเกิดบ่อยขึ้น
    if (!accident && accRate > 0 && agents.car.length >= 5) {
      accTimer -= sdt * (1 + 1.6 * rain) * accRate;
      if (accTimer <= 0) { if (!startAccident()) accTimer = 6; }
    }

    // รถเบรกเมื่อมีรถคันหน้าในเลนเดียวกัน (รวมรถที่จอดเสียหลังอุบัติเหตุ)
    const cars = agents.car;
    for (const a of cars) {
      if (a.crash) { a.speedNow = 0; continue; }
      a.speedNow = a.speed * wetSlow * signalFactor(a);
      if (checkpoint && a.x === checkpoint.x && a.z === checkpoint.z) { a.speedNow *= 0.3; if (a.s > 0.4 && a.s < 0.5 && !a.chk) { a.chk = true; checkpoint.stopped++; } }
      for (const o of cars) {
        if (o === a || o.d[0] !== a.d[0] || o.d[1] !== a.d[1]) continue;
        let gap = null;
        if (o.x === a.x && o.z === a.z && o.s > a.s) gap = o.s - a.s;
        else if (o.x === a.x + a.d[0] && o.z === a.z + a.d[1]) gap = 1 - a.s + o.s;
        if (gap !== null && gap < 0.6) a.speedNow = Math.min(a.speedNow, a.speed * clamp01((gap - 0.36) / 0.24));
      }
    }

    for (const type of Object.keys(agents)) {
      const arr = agents[type];
      let removed = false;
      for (const a of arr) {
        if (a.racer && !a.crash) { a.ttl -= dt; if (a.ttl <= 0) { removeAgent(a); removed = true; continue; } }
        if (a.kind !== 'car') a.speedNow = a.speed * signalFactor(a);
        if (!a.crash && sdt > 0 && !advance(a, sdt)) { removeAgent(a); removed = true; continue; }
        place(a);
        if (a.full && cam) {
          // ระยะจากกล้อง: ไกลมาก = ซ่อน, ไกล = โมเดลรวมชิ้นเดียว ไม่แกว่งแขนขา, ใกล้ = เคลื่อนไหวเต็ม
          const dx = a.obj.position.x - cam.x, dy = a.obj.position.y - cam.y, dz = a.obj.position.z - cam.z;
          const d2 = dx * dx + dy * dy + dz * dz;
          if (d2 > HIDE2) { a.obj.visible = false; continue; }
          a.obj.visible = true;
          const near = d2 < NEAR2;
          if (a.near !== near) { a.near = near; for (const p of a.lodParts) p.visible = near; a.full.visible = !near; }
          if (near) animate(a);
        } else animate(a);
      }
      if (removed) agents[type] = arr.filter(a => !a.dead);
    }

    updateAccident(dt, sdt, nowT);
    if (checkpoint) { checkpoint.t += sdt; const ph = Math.sin(nowT * 11) > 0; checkpoint.lr.visible = ph; checkpoint.lb.visible = !ph; }
    if (accident?.amb && !accident.amb.dead) place(accident.amb);
  }

  return {
    // จำนวนเป้าหมายแต่ละชนิด (ผู้เรียกคำนวณจากประชากร/เวลา/อากาศ)
    setTargets({ car = 0, person = 0, dog = 0, cat = 0, bus = 0, taxi = 0, grab = 0 }) {
      targets = { car, person, dog, cat, bus, taxi, grab };
    },
    counts() {
      return { car: agents.car.length, bike: agents.car.filter(a => a.isBike).length, bus: agents.car.filter(a => a.role === 'bus').length, taxi: agents.car.filter(a => a.role === 'taxi').length, grab: agents.car.filter(a => a.role === 'grab').length, person: agents.person.length, dog: agents.dog.length, cat: agents.cat.length };
    },
    invalidate() { dirty = true; },
    startRacePack,
    startCheckpoint, endCheckpoint, checkpointActive: () => !!checkpoint, checkpointAge: () => (checkpoint ? checkpoint.t : 0),
    racers() { let n = 0, b = 0; for (const a of agents.car) if (a.racer && !a.crash) { n++; if (a.isBike) b++; } return { n, bike: b }; },
    update,
    // ทดสอบ/สั่งให้เกิดอุบัติเหตุทันที
    triggerAccident() { return startAccident(); },
    takeEvents() { return events.splice(0, events.length); },
    emergency() { return !!(accident && accident.amb && !accident.amb.dead && !accident.amb.arrived); },
    accidentActive() { return !!accident; },
    clear() {
      for (const type of Object.keys(agents)) {
        for (const a of agents[type]) removeAgent(a);
        agents[type] = [];
      }
      if (checkpoint) endCheckpoint();
      if (accident) { root.remove(accident.props); if (accident.amb) removeAgent(accident.amb); if (accident.tow) removeAgent(accident.tow); for (const v of accident.victims) removeAgent(v); accident = null; }
      accTimer = 50;
    },
  };
}
