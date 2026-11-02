// ---------------------------------------------------------------
// โมเดลโรงงาน โรงไฟฟ้า โรงประปา ฟาร์มโซลาร์ และลานตกปลา แบบละเอียด (ปั้นจากโค้ดล้วน)
// หน่วยเป็นช่อง: พื้นที่ใช้ได้ราว ±0.47 รอบกลางช่อง หน้าอาคาร = +Z ฐานพื้นอยู่ที่ y0
// ctx ต้องมี: put(parent, geo, mat, x, y, z, sx, sy, sz, ry), boxGeo, cylGeo, coneGeo, band(color), M (วัสดุร่วม), signAt, tree, gableGeo, t
// ---------------------------------------------------------------
import * as THREE from 'three';

export function createIndustry(c) {
  const { put, boxGeo, cylGeo, coneGeo, band, M, signAt, tree, gableGeo, t } = c;
  const y0 = c.y0 ?? 0.03;

  // ---------- เรขาคณิตและวัสดุร่วม ----------
  const sphereGeo = new THREE.SphereGeometry(0.5, 20, 14);
  const ringGeo = new THREE.TorusGeometry(0.5, 0.09, 8, 24);
  const tcache = new Map();
  const taper = (dTop, dBot, h, seg = 16) => {   // ทรงกระบอกเรียว (ปล่องควัน ปลายเสา)
    const k = dTop + '|' + dBot + '|' + h + '|' + seg;
    let g = tcache.get(k);
    if (!g) tcache.set(k, g = new THREE.CylinderGeometry(dTop / 2, dBot / 2, h, seg));
    return g;
  };
  const coolGeo = (() => {   // หอหล่อเย็นไฮเพอร์โบลิก (เปลือกบาง สองด้าน)
    const pts = [];
    for (let i = 0; i <= 14; i++) {
      const u = i / 14, r = 0.5 - 0.17 * Math.sin(Math.min(1, u * 1.08) * Math.PI * 0.92) + 0.015 * u;
      pts.push(new THREE.Vector2(r, u));
    }
    return new THREE.LatheGeometry(pts, 28);
  })();
  const mat = (color, o = {}) => band(color);   // วัสดุทึบตามสี (cache ใน band)
  const conc = band(0xcfcdc7), concD = band(0x8f8e8a), concL = band(0xe3e1da);
  const steel = band(0x9aa3ab), steelD = band(0x5c656d), steelL = band(0xc3cad0);
  const white = band(0xf4f4f0), blue = band(0x1976d2), blueD = band(0x0d47a1), red = band(0xc62828);
  const yellow = band(0xf9c80e), green = band(0x2e7d32), orange = band(0xef6c00), black = band(0x1d1f22);
  const gravel = band(0x8a867c), asph = M.asphalt || band(0x3a3e44), glass = M.glassShop || band(0x6f93ab);
  const water = new THREE.MeshStandardMaterial({ color: 0x4aa8d4, roughness: 0.05, metalness: 0.35, transparent: true, opacity: 0.88 });
  const waterPale = new THREE.MeshStandardMaterial({ color: 0x8fd0e8, roughness: 0.05, metalness: 0.3, transparent: true, opacity: 0.85 });
  const shell = new THREE.MeshStandardMaterial({ color: 0xd9d7d0, roughness: 0.9, side: THREE.DoubleSide });
  const steam = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, transparent: true, opacity: 0.55, depthWrite: false });
  const panelM = new THREE.MeshStandardMaterial({ color: 0x14224a, metalness: 0.6, roughness: 0.18 });
  const corrCache = new Map();
  const corr = color => {   // สังกะสีลูกฟูก: ลอนตั้งสลับสว่าง-มืด
    let m = corrCache.get(color);
    if (m) return m;
    const cv = document.createElement('canvas'); cv.width = 64; cv.height = 16;
    const g = cv.getContext('2d'), base = new THREE.Color(color);
    for (let i = 0; i < 16; i++) { const k = 0.82 + 0.2 * Math.abs(Math.sin((i / 16) * Math.PI)); g.fillStyle = '#' + base.clone().multiplyScalar(k).getHexString(); g.fillRect(i * 4, 0, 4, 16); }
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(3, 1);
    corrCache.set(color, m = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55, metalness: 0.25 }));
    return m;
  };

  // ---------- ตัวช่วยวางชิ้นส่วน (yb = ระดับล่างสุดของชิ้น) ----------
  const bx = (g, m, x, yb, z, w, h, d, ry = 0) => put(g, boxGeo, m, x, yb + h / 2, z, w, h, d, ry);
  const cy = (g, m, x, yb, z, dia, h) => put(g, cylGeo, m, x, yb + h / 2, z, dia, h, dia);
  const tc = (g, m, x, yb, z, dBot, dTop, h, seg) => put(g, taper(dTop, dBot, h, seg), m, x, yb + h / 2, z, 1, 1, 1);
  const sph = (g, m, x, y, z, d) => put(g, sphereGeo, m, x, y, z, d, d, d);
  const pipeX = (g, m, x, y, z, len, dia) => { const p = put(g, cylGeo, m, x, y, z, dia, len, dia); p.rotation.z = Math.PI / 2; return p; };
  const pipeZ = (g, m, x, y, z, len, dia) => { const p = put(g, cylGeo, m, x, y, z, dia, len, dia); p.rotation.x = Math.PI / 2; return p; };
  const strut = (g, m, x1, y1, z1, x2, y2, z2, th = 0.008) => {   // แท่งเอียงเชื่อมสองจุด (โครงถัก สายไฟ ท่อเอียง)
    const dx = x2 - x1, dy = y2 - y1, dz = z2 - z1, L = Math.hypot(dx, dy, dz);
    const p = put(g, boxGeo, m, (x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2, th, th, L);
    p.rotation.order = 'YXZ'; p.rotation.set(-Math.asin(dy / L), Math.atan2(dx, dz), 0);
    return p;
  };
  const pad = (g, m, w, d, x = 0, z = 0, h = 0.008) => bx(g, m, x, y0, z, w, h, d);
  const kerb = (g, w, d, x = 0, z = 0) => {   // ขอบคันหินรอบลาน
    for (const s of [-1, 1]) { bx(g, concD, x, y0, z + s * d / 2, w, 0.02, 0.016); bx(g, concD, x + s * w / 2, y0, z, 0.016, 0.02, d); }
  };
  const fence = (g, x1, z1, x2, z2, h = 0.085) => {   // รั้วลวดตาข่ายมีเสาเหล็ก
    const L = Math.hypot(x2 - x1, z2 - z1), n = Math.max(2, Math.round(L / 0.16));
    const ry = Math.atan2(-(z2 - z1), x2 - x1);
    put(g, boxGeo, steelL, (x1 + x2) / 2, y0 + h * 0.55, (z1 + z2) / 2, L, h * 0.8, 0.003, ry).material = band(0xb9c0c6);
    for (let k = 0; k <= n; k++) bx(g, steelD, x1 + ((x2 - x1) * k) / n, y0, z1 + ((z2 - z1) * k) / n, 0.01, h, 0.01);
    put(g, boxGeo, steelD, (x1 + x2) / 2, y0 + h, (z1 + z2) / 2, L, 0.008, 0.012, ry);
  };
  const lampPost = (g, x, z, h = 0.2) => { cy(g, steelD, x, y0, z, 0.012, h); bx(g, steelD, x, y0 + h, z + 0.025, 0.012, 0.01, 0.06); bx(g, M.lamp || white, x, y0 + h - 0.008, z + 0.05, 0.035, 0.012, 0.025); };
  const stripedStack = (g, x, z, h, dBot, dTop, bands = 5) => {   // ปล่องควันลายแดง-ขาว มีไฟเตือนอากาศยานบนยอด
    const hs = h / bands;
    for (let i = 0; i < bands; i++) {
      const d0 = dBot + (dTop - dBot) * (i / bands), d1 = dBot + (dTop - dBot) * ((i + 1) / bands);
      tc(g, i % 2 ? white : red, x, y0 + i * hs, z, d0, d1, hs);
    }
    cy(g, steelD, x, y0 + h, z, dTop + 0.01, 0.012);
    put(g, sphereGeo, M.beacon || red, x, y0 + h + 0.02, z, 0.025, 0.025, 0.025);
  };
  const ladder = (g, x, yb, z, h, ry = 0) => {
    for (const s of [-1, 1]) put(g, boxGeo, steelD, x + Math.cos(ry) * s * 0.012, yb + h / 2, z - Math.sin(ry) * s * 0.012, 0.004, h, 0.004, ry);
    for (let k = 1; k * 0.035 < h; k++) put(g, boxGeo, steelD, x, yb + k * 0.035, z, 0.028, 0.003, 0.004, ry);
  };
  const hvac = (g, x, yb, z, w = 0.08, d = 0.06) => { bx(g, steelL, x, yb, z, w, 0.04, d); cy(g, steelD, x - w * 0.22, yb + 0.04, z, 0.034, 0.006); cy(g, steelD, x + w * 0.22, yb + 0.04, z, 0.034, 0.006); };
  const crate = (g, x, z, k = 0) => { bx(g, band([0x8d6e63, 0xa1887f, 0x6d4c41][k % 3]), x, y0, z, 0.06, 0.04, 0.05); bx(g, band([0x8d6e63, 0xa1887f, 0x6d4c41][(k + 1) % 3]), x, y0 + 0.04, z, 0.06, 0.04, 0.05); };
  const truck = (g, x, z, ry, col = 0xe0e3e6) => {   // รถบรรทุกตู้เล็กจอดที่ท่าขนถ่าย
    const gg = new THREE.Group(); gg.position.set(x, 0, z); gg.rotation.y = ry; g.add(gg);
    bx(gg, band(col), 0, y0 + 0.025, -0.06, 0.1, 0.09, 0.2);
    bx(gg, band(0x1565c0), 0, y0 + 0.025, 0.08, 0.09, 0.065, 0.075);
    bx(gg, glass, 0, y0 + 0.055, 0.12, 0.08, 0.03, 0.004);
    for (const sx of [-1, 1]) for (const sz of [-0.1, 0.09]) put(gg, cylGeo, black, sx * 0.05, y0 + 0.018, sz, 0.036, 0.016, 0.036).rotation.z = Math.PI / 2;
    return gg;
  };
  const pylon = (g, x, z, h = 0.36, w = 0.1) => {   // เสาไฟแรงสูงโครงถัก
    const levels = [0, 0.3, 0.6, 0.82, 1];
    const wd = k => w * (1 - 0.62 * k);
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    for (let i = 0; i < levels.length - 1; i++) {
      const a = levels[i], b2 = levels[i + 1], w1 = wd(a) / 2, w2 = wd(b2) / 2;
      for (const [sx, sz] of corners) strut(g, steelD, x + sx * w1, y0 + a * h, z + sz * w1, x + sx * w2, y0 + b2 * h, z + sz * w2, 0.007);
      for (const [[ax, az], [bx2, bz]] of [[[-1, -1], [1, -1]], [[1, -1], [1, 1]], [[1, 1], [-1, 1]], [[-1, 1], [-1, -1]]]) {
        strut(g, steelD, x + ax * w1, y0 + a * h, z + az * w1, x + bx2 * w2, y0 + b2 * h, z + bz * w2, 0.004);   // ไขว้กากบาท
        strut(g, steelD, x + bx2 * w1, y0 + a * h, z + bz * w1, x + ax * w2, y0 + b2 * h, z + az * w2, 0.004);
      }
    }
    for (const lv of [0.8, 0.93]) {   // แขนยื่นรับสายและลูกถ้วยฉนวนห้อย
      const yy = y0 + lv * h, L = 0.15 * (lv === 0.8 ? 1 : 0.75);
      bx(g, steelD, x, yy, z, L * 2, 0.008, 0.012);
      for (const s of [-1, 1]) { cy(g, band(0xb6d7c8), x + s * L, yy - 0.03, z, 0.012, 0.03); cy(g, band(0xb6d7c8), x + s * L, yy - 0.045, z, 0.02, 0.012); }
    }
    return { top: y0 + 0.8 * h, arm: 0.15 };
  };
  const wire = (g, x1, y1, z1, x2, y2, z2) => strut(g, black, x1, y1, z1, x2, y2, z2, 0.0035);
  const transformer = (g, x, z, ry = 0) => {
    bx(g, band(0x8fa79a), x, y0 + 0.014, z, 0.09, 0.07, 0.07, ry);
    for (let k = -3; k <= 3; k++) bx(g, band(0x7a9387), x + Math.cos(ry) * k * 0.012, y0 + 0.02, z - Math.sin(ry) * k * 0.012 - 0.04, 0.006, 0.05, 0.022, ry);   // ครีบระบายความร้อน
    for (const s of [-1, 0, 1]) { cy(g, band(0xb6d7c8), x + s * 0.025, y0 + 0.084, z, 0.012, 0.03); put(g, coneGeo, band(0xb6d7c8), x + s * 0.025, y0 + 0.125, z, 0.02, 0.025, 0.02); }
    bx(g, concD, x, y0, z, 0.11, 0.014, 0.09, ry);
  };
  const waterTower = (g, x, z, k = 1) => {   // หอถังสูง: ขาโครงเหล็กไขว้ ถังรูปทรงหยดน้ำ บันไดและราวระเบียง
    const h = 0.44 * k, rt = 0.09 * k;
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) strut(g, steelD, x + sx * rt * 1.15, y0, z + sz * rt * 1.15, x + sx * rt * 0.9, y0 + h, z + sz * rt * 0.9, 0.012);
    for (const lv of [0.35, 0.68]) {
      const w = rt * (1.15 - 0.25 * lv) * 2;
      for (const s of [-1, 1]) { bx(g, steelD, x, y0 + lv * h, z + s * w / 2, w, 0.008, 0.008); bx(g, steelD, x + s * w / 2, y0 + lv * h, z, 0.008, 0.008, w); }
      for (const [[ax, az], [bx2, bz]] of [[[-1, -1], [1, -1]], [[1, -1], [1, 1]], [[1, 1], [-1, 1]], [[-1, 1], [-1, -1]]]) strut(g, steelD, x + ax * w / 2, y0 + (lv - 0.34) * h, z + az * w / 2, x + bx2 * w / 2, y0 + lv * h, z + bz * w / 2, 0.004);
    }
    cy(g, steelD, x, y0 + h - 0.01, z, rt * 0.5, 0.02);                                                  // ท่อขึ้นถัง
    tc(g, steelD, x, y0, z, 0.02, 0.02, h);
    cy(g, steelL, x, y0 + h, z, rt * 2.1, 0.012);                                                         // ฐานถัง
    put(g, taper(rt * 2.2, rt * 2.2, 0.15 * k, 24), band(0xe6edf2), x, y0 + h + 0.012 + 0.075 * k, z, 1, 1, 1);
    put(g, taper(rt * 2.24, rt * 2.24, 0.03 * k, 24), blue, x, y0 + h + 0.05 * k, z, 1, 1, 1);          // แถบสีน้ำเงิน
    put(g, taper(rt * 2.24, rt * 2.24, 0.03 * k, 24), blue, x, y0 + h + 0.115 * k, z, 1, 1, 1);
    put(g, taper(0.01, rt * 2.2, 0.075 * k, 24), band(0xdfe7ee), x, y0 + h + 0.012 + 0.15 * k + 0.0375 * k, z, 1, 1, 1);   // หลังคากรวย
    cy(g, steelD, x, y0 + h + 0.2 * k, z, 0.008, 0.04 * k);
    ladder(g, x + rt * 1.15, y0, z + rt * 1.15, h + 0.12 * k);
    sph(g, white, x, y0 + h + 0.085 * k, z + rt * 1.12 + 0.005, 0.05 * k).material = white;           // โลโก้หยดน้ำ
  };
  const fishHang = (g, x, y, z) => { put(g, boxGeo, band(0xc9d6df), x, y, z, 0.03, 0.012, 0.008); bx(g, band(0xb0bec5), x + 0.017, y - 0.005, z, 0.01, 0.01, 0.006); };

  // =================================================================
  // โรงประปา: ถังตกตะกอนกลมมีสะพานกวาด, บ่อกรองทราย 3 บ่อ, อาคารสูบน้ำ, ถังสารเคมี, หอถังสูง, ท่อ-วาล์ว, รั้วและประตู
  // =================================================================
  function waterPlant(bg, big = false) {
    pad(bg, gravel, 0.94, 0.94); kerb(bg, 0.94, 0.94);
    pad(bg, asph, 0.94, 0.14, 0, 0.4);                                                                      // ลานรถด้านหน้า
    for (let k = -3; k <= 3; k++) bx(bg, white, k * 0.12, y0 + 0.008, 0.4, 0.05, 0.002, 0.012);             // เส้นจอดรถ
    // ถังตกตะกอนกลม 2 ถัง: ผนังคอนกรีต ผิวน้ำ รางน้ำล้น เสากลาง สะพานกวางตะกอน
    for (const [x, z, d] of [[-0.04, -0.3, 0.34], [0.33, -0.3, 0.26]]) {
      cy(bg, conc, x, y0 + 0.008, z, d, 0.09);
      cy(bg, concD, x, y0 + 0.098, z, d + 0.012, 0.012);
      cy(bg, water, x, y0 + 0.095, z, d - 0.03, 0.006);
      cy(bg, concL, x, y0 + 0.08, z, d - 0.06, 0.016).material = waterPale;
      cy(bg, steelD, x, y0 + 0.008, z, 0.035, 0.14);                                                         // เสากลาง
      bx(bg, steel, x, y0 + 0.14, z, d - 0.01, 0.012, 0.022, 0.5);                                           // สะพานกวาดตะกอน
      bx(bg, steelD, x + (d - 0.01) / 2 * Math.cos(0.5), y0 + 0.152, z - (d - 0.01) / 2 * Math.sin(0.5), 0.01, 0.022, 0.01);
      cy(bg, white, x, y0 + 0.152, z, 0.03, 0.02);                                                           // กล่องมอเตอร์
    }
    // บ่อกรอง 3 บ่อ: ผนังคอนกรีต น้ำฟ้าอ่อน ทางเดินตะแกรง
    for (let i = 0; i < 3; i++) {
      const x = -0.3 + i * 0.3;
      bx(bg, conc, x, y0 + 0.008, 0.0, 0.25, 0.06, 0.2);
      bx(bg, waterPale, x, y0 + 0.058, 0.0, 0.21, 0.006, 0.16);
      bx(bg, steelL, x, y0 + 0.068, 0.0, 0.015, 0.004, 0.2);
      for (let k = -2; k <= 2; k++) bx(bg, steelD, x + k * 0.04, y0 + 0.068, 0.07, 0.004, 0.006, 0.05);
    }
    // อาคารสูบน้ำและห้องควบคุม: ผนังสังกะสีสองสี หน้าต่างแถบ ประตูม้วน หลังคาจั่วต่ำ ป้าย
    const bxX = -0.12, bxZ = 0.3;
    bx(bg, corr(0xe8edf0), bxX, y0 + 0.008, bxZ - 0.02, 0.54, 0.15, 0.2);
    bx(bg, blue, bxX, y0 + 0.008, bxZ - 0.02, 0.545, 0.03, 0.205);                                          // แถบสีน้ำเงินด้านล่าง
    put(bg, gableGeo(0.24, 0.58, 0.05), steel, bxX, y0 + 0.158, bxZ - 0.02, 1, 1, 1, Math.PI / 2);          // หลังคาจั่วต่ำ
    bx(bg, glass, bxX - 0.1, y0 + 0.08, bxZ + 0.081, 0.22, 0.05, 0.004);                                    // แถบหน้าต่าง
    bx(bg, band(0xb0bec5), bxX + 0.17, y0 + 0.008, bxZ + 0.081, 0.12, 0.1, 0.004);                          // ประตูม้วน
    for (let k = 0; k < 5; k++) bx(bg, band(0x90a4ae), bxX + 0.17, y0 + 0.02 + k * 0.02, bxZ + 0.084, 0.115, 0.003, 0.002);
    bx(bg, glass, bxX - 0.26, y0 + 0.03, bxZ + 0.081, 0.04, 0.09, 0.004);                                   // ประตูเดิน
    bx(bg, blue, bxX - 0.05, y0 + 0.125, bxZ + 0.085, 0.3, 0.032, 0.006);
    signAt(bg, t('v.water.plant').replace(/\s*[（(].*$/, '') || 'WATERWORKS', '#0d47a1', '#ffffff', bxX - 0.05, y0 + 0.125, bxZ + 0.09, 0.3, 0.032, 24);
    hvac(bg, bxX + 0.15, y0 + 0.19, bxZ - 0.04);
    // ท่อจ่ายน้ำและวาล์ว: ท่อหลักสีน้ำเงินเชื่อมถัง-บ่อกรอง-อาคาร พร้อมหน้าแปลนและล้อวาล์ว
    pipeZ(bg, band(0x2a7fc5), -0.18, y0 + 0.022, -0.1, 0.34, 0.03);
    pipeX(bg, band(0x2a7fc5), 0.08, y0 + 0.022, 0.16, 0.7, 0.03);
    pipeZ(bg, band(0x2a7fc5), 0.3, y0 + 0.022, 0.0, 0.36, 0.026);
    for (const [px, pz, rz] of [[-0.18, -0.2, 0], [-0.18, -0.02, 0], [0.3, -0.1, 0], [0.3, 0.1, 0]]) { cy(bg, steelD, px, y0 + 0.008, pz, 0.044, 0.012); cy(bg, red, px, y0 + 0.032, pz, 0.025, 0.006); }
    for (const px of [-0.3, -0.05, 0.2]) { cy(bg, steelD, px, y0 + 0.037, 0.16, 0.022, 0.012); bx(bg, steelD, px, y0 + 0.05, 0.16, 0.012, 0.012, 0.012); }
    // ถังสารเคมี (คลอรีน/สารส้ม) และถังแนวนอน
    for (const [x, z, col] of [[0.38, 0.28, 0xf1f1ec], [0.28, 0.28, 0xe0e6ea]]) { cy(bg, band(col), x, y0 + 0.008, z, 0.1, 0.14); put(bg, taper(0.02, 0.1, 0.03), band(col), x, y0 + 0.17, z, 1, 1, 1); bx(bg, yellow, x, y0 + 0.06, z + 0.052, 0.03, 0.03, 0.004); }
    waterTower(bg, big ? -0.36 : -0.38, big ? -0.3 : -0.3, big ? 1.1 : 0.9);
    if (big) {   // โรงประปาใหญ่: เพิ่มหอถังที่สอง ถังเก็บน้ำใสทรงกลมบนพื้น และบ่อเพิ่ม
      waterTower(bg, 0.41, 0.03, 0.85);
      cy(bg, conc, 0.38, y0 + 0.008, 0.32, 0.2, 0.12); put(bg, taper(0.04, 0.2, 0.04, 24), conc, 0.38, y0 + 0.14, 0.32, 1, 1, 1);
    }
    fence(bg, -0.46, -0.46, 0.46, -0.46); fence(bg, -0.46, -0.46, -0.46, 0.46); fence(bg, 0.46, -0.46, 0.46, 0.46);
    fence(bg, -0.46, 0.46, 0.1, 0.46); fence(bg, 0.28, 0.46, 0.46, 0.46);                                    // รั้วด้านหน้าเว้นประตู
    for (const s of [-1, 1]) bx(bg, steelD, 0.19 + s * 0.095, y0, 0.46, 0.015, 0.1, 0.015);                // เสาประตู
    lampPost(bg, -0.44, 0.44); lampPost(bg, 0.44, 0.44);
  }

  // =================================================================
  // สถานีสูบน้ำ (เล็ก): บ่อพัก ปั๊ม อาคารจั่ว ถังเก็บน้ำทรงตั้งหลังคาโดม ตู้ควบคุม รั้ว
  // =================================================================
  function pump(bg) {
    pad(bg, gravel, 0.94, 0.94); kerb(bg, 0.94, 0.94);
    // บ่อพักน้ำดิบ มีขอบคอนกรีตและตะแกรงเหล็ก
    bx(bg, conc, 0.2, y0 + 0.008, -0.27, 0.52, 0.04, 0.3); bx(bg, water, 0.2, y0 + 0.046, -0.27, 0.46, 0.004, 0.24);
    for (let k = 0; k < 6; k++) bx(bg, steelD, 0.02 + k * 0.07, y0 + 0.05, -0.27, 0.01, 0.004, 0.26);
    // อาคารสูบน้ำ จั่วหลังคาแผ่นเหล็ก หน้าต่าง ประตู
    bx(bg, corr(0xe3e9ec), -0.15, y0 + 0.008, 0.12, 0.38, 0.14, 0.26);
    bx(bg, blue, -0.15, y0 + 0.008, 0.12, 0.385, 0.028, 0.265);
    put(bg, gableGeo(0.3, 0.42, 0.075), band(0x607d8b), -0.15, y0 + 0.148, 0.12, 1, 1, 1, Math.PI / 2);
    bx(bg, glass, -0.26, y0 + 0.07, 0.253, 0.1, 0.045, 0.004); bx(bg, band(0xb0bec5), -0.07, y0 + 0.008, 0.253, 0.1, 0.1, 0.004);
    bx(bg, black, -0.07, y0 + 0.108, 0.255, 0.11, 0.008, 0.006);
    // ถังเก็บน้ำทรงตั้ง มีบันไดและราวกันตก
    cy(bg, band(0xe6edf2), 0.32, y0 + 0.008, 0.16, 0.26, 0.3);
    for (const hh of [0.05, 0.26]) cy(bg, blue, 0.32, y0 + 0.008 + hh, 0.16, 0.268, 0.02);
    put(bg, taper(0.02, 0.26, 0.06, 24), band(0xdfe7ee), 0.32, y0 + 0.338, 0.16, 1, 1, 1);
    ladder(bg, 0.32 + 0.14, y0, 0.16 + 0.02, 0.32, Math.PI / 2);
    // ท่อและปั๊มกลางแจ้ง (มอเตอร์สีฟ้า ท่อจ่ายน้ำ วาล์ว)
    pipeX(bg, band(0x2a7fc5), 0.1, y0 + 0.03, -0.12, 0.34, 0.032);
    pipeZ(bg, band(0x2a7fc5), 0.27, y0 + 0.03, 0.0, 0.3, 0.032);
    for (const x of [0.0, 0.14]) { bx(bg, blueD, x, y0 + 0.008, -0.1, 0.07, 0.05, 0.05); cy(bg, steelL, x, y0 + 0.058, -0.1, 0.045, 0.014); cy(bg, red, x + 0.04, y0 + 0.05, -0.12, 0.028, 0.006); }
    bx(bg, white, 0.4, y0 + 0.008, -0.04, 0.08, 0.12, 0.06); bx(bg, yellow, 0.4, y0 + 0.1, -0.007, 0.02, 0.02, 0.003);   // ตู้ควบคุมไฟฟ้า
    fence(bg, -0.46, -0.46, 0.46, -0.46); fence(bg, -0.46, -0.46, -0.46, 0.46); fence(bg, 0.46, -0.46, 0.46, 0.46);
    fence(bg, -0.46, 0.46, -0.1, 0.46); fence(bg, 0.1, 0.46, 0.46, 0.46);
    lampPost(bg, 0.0, 0.42, 0.18);
  }

  // =================================================================
  // โรงไฟฟ้าก๊าซ: โรงเครื่องกังหันหลังคาโค้งสังกะสี, หม้อไอน้ำคืนความร้อน, ปล่องลายแดง-ขาว, ถังก๊าซทรงกลม,
  // ลานหม้อแปลงพร้อมเสาไฟแรงสูงและสายไฟ, ท่อเรียงชั้น, อาคารควบคุม
  // =================================================================
  function gasPlant(bg) {
    pad(bg, gravel, 0.94, 0.94); kerb(bg, 0.94, 0.94);
    pad(bg, asph, 0.94, 0.1, 0, 0.42);
    // โรงเครื่องกังหัน: ผนังสังกะสี หน้าต่างแถบสูง หลังคาโค้งเป็นซี่
    const hx = -0.18, hz = 0.0;
    bx(bg, corr(0xdde3e7), hx, y0 + 0.008, hz, 0.52, 0.17, 0.28);
    bx(bg, steelD, hx, y0 + 0.008, hz, 0.525, 0.03, 0.285);
    put(bg, gableGeo(0.3, 0.54, 0.07), band(0x8f9aa2), hx, y0 + 0.178, hz, 1, 1, 1, Math.PI / 2);
    for (let k = -4; k <= 4; k++) bx(bg, steelD, hx + k * 0.06, y0 + 0.177, hz, 0.006, 0.006, 0.3).rotation.y = 0;
    bx(bg, glass, hx, y0 + 0.12, 0.141, 0.46, 0.035, 0.004); bx(bg, glass, hx, y0 + 0.12, -0.141, 0.46, 0.035, 0.004);
    bx(bg, band(0x607d8b), hx - 0.15, y0 + 0.008, 0.141, 0.14, 0.11, 0.004);                                   // ประตูบานใหญ่
    for (let k = 0; k < 6; k++) bx(bg, band(0x90a4ae), hx - 0.15, y0 + 0.018 + k * 0.017, 0.144, 0.135, 0.003, 0.002);
    // เครนเหนือโรงเครื่อง + หลอดไอเสียแนวนอน
    pipeX(bg, steelL, hx + 0.1, y0 + 0.215, hz, 0.28, 0.03);
    // หม้อไอน้ำ (HRSG) สองหน่วย + ปล่องควัน
    for (const [x, z] of [[0.24, -0.2], [0.24, 0.02]]) {
      bx(bg, band(0xc9ced2), x, y0 + 0.008, z, 0.2, 0.28, 0.16);
      for (let k = 0; k < 5; k++) bx(bg, steelD, x, y0 + 0.04 + k * 0.05, z + 0.082, 0.2, 0.01, 0.004);
      bx(bg, steelD, x, y0 + 0.288, z, 0.2, 0.012, 0.16);
      ladder(bg, x + 0.103, y0 + 0.008, z + 0.05, 0.28, Math.PI / 2);
    }
    stripedStack(bg, 0.3, -0.2, 0.62, 0.09, 0.06, 6); stripedStack(bg, 0.3, 0.02, 0.62, 0.09, 0.06, 6);
    pipeZ(bg, steel, 0.12, y0 + 0.15, -0.09, 0.3, 0.035);                                                      // ท่อเชื่อมโรงเครื่อง-หม้อไอน้ำ
    pipeX(bg, steel, 0.0, y0 + 0.18, -0.15, 0.22, 0.035);
    // ถังก๊าซทรงกลมบนขาตั้ง 2 ใบ
    for (const [x, z] of [[-0.3, -0.34], [-0.06, -0.36]]) {
      sph(bg, band(0xdfe3e6), x, y0 + 0.14, z, 0.17);
      cy(bg, steelD, x, y0 + 0.14 - 0.08, z, 0.17, 0.004);
      for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) bx(bg, steelD, x + sx * 0.055, y0, z + sz * 0.055, 0.012, 0.1, 0.012);
      bx(bg, red, x, y0 + 0.14, z + 0.087, 0.07, 0.012, 0.003);
    }
    pipeX(bg, band(0xf9a825), -0.18, y0 + 0.03, -0.26, 0.26, 0.022);                                          // ท่อก๊าซสีเหลือง
    // ลานหม้อแปลง + เสาไฟแรงสูง + สายไฟ
    transformer(bg, 0.12, 0.35, 0); transformer(bg, 0.24, 0.35, 0); transformer(bg, 0.36, 0.35, 0);
    const p1 = pylon(bg, -0.08, 0.34, 0.36, 0.1);
    wire(bg, -0.08 - p1.arm, p1.top - 0.01, 0.34, 0.12, y0 + 0.13, 0.35);
    wire(bg, -0.08 + p1.arm, p1.top - 0.01, 0.34, 0.24, y0 + 0.13, 0.35);
    wire(bg, -0.08, p1.top + 0.01, 0.34, 0.36, y0 + 0.13, 0.35);
    // อาคารควบคุม + อุปกรณ์ระบายอากาศ ลานจอด
    bx(bg, concL, -0.38, y0 + 0.008, 0.36, 0.16, 0.1, 0.12); bx(bg, glass, -0.38, y0 + 0.05, 0.421, 0.12, 0.035, 0.004);
    bx(bg, band(0x546e7a), -0.38, y0 + 0.108, 0.36, 0.17, 0.012, 0.13);
    hvac(bg, -0.34, y0 + 0.12, 0.36, 0.06, 0.05);
    for (const x of [-0.2, -0.12]) { bx(bg, band(0xe0e0e0), x, y0 + 0.008, -0.2, 0.06, 0.05, 0.06); cy(bg, steelD, x, y0 + 0.058, -0.2, 0.05, 0.008); }   // พัดลมระบายความร้อน
    fence(bg, -0.46, -0.46, 0.46, -0.46); fence(bg, -0.46, -0.46, -0.46, 0.46); fence(bg, 0.46, -0.46, 0.46, 0.46);
    lampPost(bg, 0.44, 0.44); lampPost(bg, -0.44, 0.44);
  }

  // =================================================================
  // โรงไฟฟ้าพลังความร้อนขนาดใหญ่: หอหล่อเย็นไฮเพอร์โบลิก 3 หอ + ไอน้ำ, อาคารหม้อไอน้ำสูง, ปล่องสูง 2 ปล่อง,
  // สายพานลำเลียงถ่านหินเอียง+กองถ่าน, ลานสวิตช์ยาร์ดมีเสาไฟ, เครนเหนือศีรษะ
  // =================================================================
  function bigPlant(bg) {
    pad(bg, gravel, 0.94, 0.94); kerb(bg, 0.94, 0.94);
    // หอหล่อเย็น 3 หอ
    for (const [x, z, h, d] of [[-0.3, -0.3, 0.52, 0.34], [0.0, -0.34, 0.56, 0.36], [0.3, -0.3, 0.5, 0.32]]) {
      put(bg, coolGeo, shell, x, y0 + h / 2 * 0 + 0.0, z, d, h, d).position.y = y0;   // วางฐานที่พื้น
      bx(bg, concD, x, y0, z, d * 1.02, 0.03, d * 1.02).scale.set(1, 1, 1);
      // ไอน้ำลอยจากปากหอ (ก้อนกลมจางซ้อนกันขยายขึ้น)
      for (let k = 0; k < 4; k++) sph(bg, steam, x + k * 0.012, y0 + h + 0.05 + k * 0.07, z - k * 0.008, 0.14 + k * 0.07);
    }
    // อาคารหม้อไอน้ำสูง (ตั้งฉาก) มีหน้าต่างแถวและโครงเหล็กภายนอก
    const bxx = -0.08, bzz = 0.1;
    bx(bg, band(0xc8cdd1), bxx, y0 + 0.008, bzz, 0.36, 0.42, 0.24);
    for (let k = 0; k < 7; k++) bx(bg, glass, bxx, y0 + 0.05 + k * 0.052, bzz + 0.122, 0.32, 0.018, 0.004);
    bx(bg, steelD, bxx, y0 + 0.43, bzz, 0.38, 0.016, 0.26);
    for (const sx of [-1, 1]) for (let k = 0; k < 6; k++) strut(bg, steelD, bxx + sx * 0.185, y0 + k * 0.07, bzz + 0.125, bxx + sx * 0.185, y0 + (k + 1) * 0.07, bzz + 0.125, 0.006);
    bx(bg, band(0xb7bec3), bxx + 0.27, y0 + 0.008, bzz, 0.18, 0.26, 0.2);                                       // โรงเครื่องกังหันต่ำ ต่อด้านข้าง
    put(bg, gableGeo(0.2, 0.2, 0.05), steel, bxx + 0.27, y0 + 0.268, bzz, 1, 1, 1, Math.PI / 2);
    // ปล่องสูง 2 ปล่อง ลายแดง-ขาว
    stripedStack(bg, -0.28, 0.14, 0.92, 0.1, 0.06, 8); stripedStack(bg, 0.12, -0.04, 0.88, 0.1, 0.06, 8);
    // สายพานลำเลียงถ่านหิน: ทางเอียงมีหลังคาจากพื้นขึ้นอาคาร + กองถ่าน + ท่อลำเลียง
    strut(bg, band(0xaab1b7), 0.32, y0 + 0.02, 0.42, 0.04, y0 + 0.4, 0.14, 0.05);
    strut(bg, steelD, 0.32, y0 + 0.05, 0.42, 0.04, y0 + 0.43, 0.14, 0.012);
    for (let k = 0; k < 4; k++) { const u = 0.15 + k * 0.22; bx(bg, steelD, 0.32 - 0.28 * u, y0, 0.42 - 0.28 * u, 0.012, 0.02 + 0.38 * u, 0.012); }
    put(bg, coneGeo, band(0x2b2d30), 0.36, y0 + 0.07, 0.4, 0.24, 0.14, 0.2);                                    // กองถ่านหิน
    put(bg, coneGeo, band(0x383b3f), 0.28, y0 + 0.045, 0.34, 0.15, 0.09, 0.13);
    // ลานสวิตช์ยาร์ด: หม้อแปลงใหญ่ + เสาไฟแรงสูง + สาย
    transformer(bg, -0.3, 0.38, 0); transformer(bg, -0.18, 0.38, 0);
    const p1 = pylon(bg, -0.42, 0.3, 0.42, 0.11);
    wire(bg, -0.42 + p1.arm, p1.top - 0.01, 0.3, -0.3, y0 + 0.13, 0.38);
    wire(bg, -0.42 - p1.arm, p1.top - 0.01, 0.3, -0.18, y0 + 0.13, 0.38);
    // ถังน้ำมัน/สารเคมี + อาคารบริหาร
    cy(bg, band(0xe8eaec), 0.4, y0, 0.0, 0.1, 0.1); cy(bg, band(0xe8eaec), 0.4, y0, -0.1, 0.1, 0.1);
    bx(bg, concL, 0.03, y0, 0.4, 0.2, 0.09, 0.1); bx(bg, glass, 0.03, y0 + 0.04, 0.451, 0.16, 0.03, 0.004); bx(bg, band(0x455a64), 0.03, y0 + 0.09, 0.4, 0.21, 0.012, 0.11);
    fence(bg, -0.46, -0.46, 0.46, -0.46); fence(bg, -0.46, -0.46, -0.46, 0.46); fence(bg, 0.46, -0.46, 0.46, 0.46);
    lampPost(bg, 0.44, 0.44, 0.22);
  }

  // =================================================================
  // ฟาร์มโซลาร์: แผงเอียงมีกรอบอลูมิเนียมและเส้นเซลล์, ขาตั้งเหล็ก, ตู้อินเวอร์เตอร์และหม้อแปลง, ถนนในไซต์, รั้ว
  // =================================================================
  function solar(bg) {
    pad(bg, band(0x8c8a7e), 0.94, 0.94); kerb(bg, 0.94, 0.94);
    for (let row = 0; row < 4; row++) {
      const z = -0.36 + row * 0.2;
      for (let col = 0; col < 3; col++) {
        const x = -0.28 + col * 0.285;
        // โต๊ะแผงหนึ่งชุด = 2 แผงต่อกัน เอียงรับแดดทางทิศใต้ (หน้า +Z ต่ำ)
        const tilt = -0.42;
        const tab = new THREE.Group(); tab.position.set(x, y0 + 0.07, z); tab.rotation.x = tilt; bg.add(tab);
        put(tab, boxGeo, band(0xd0d4d8), 0, 0, 0, 0.27, 0.008, 0.13);                                              // กรอบ
        put(tab, boxGeo, panelM, 0, 0.005, 0, 0.255, 0.004, 0.118);                                               // กระจกเซลล์
        for (let k = -2; k <= 2; k++) put(tab, boxGeo, band(0x3b4f8a), k * 0.05, 0.0075, 0, 0.002, 0.001, 0.118);  // เส้นแบ่งเซลล์
        for (let k = -1; k <= 1; k += 2) put(tab, boxGeo, band(0x3b4f8a), 0, 0.0075, k * 0.03, 0.255, 0.001, 0.002);
        for (const sx of [-1, 1]) bx(bg, steelL, x + sx * 0.1, y0, z - 0.02, 0.01, 0.06, 0.01);                    // ขาตั้งหลัง
        for (const sx of [-1, 1]) bx(bg, steelL, x + sx * 0.1, y0, z + 0.05, 0.01, 0.022, 0.01);                   // ขาตั้งหน้า
      }
    }
    // ตู้อินเวอร์เตอร์/หม้อแปลงแบบคอนเทนเนอร์ + เสาล่อฟ้า + สถานีตรวจอากาศ
    bx(bg, white, 0.36, y0, 0.42, 0.14, 0.09, 0.07); bx(bg, band(0x90a4ae), 0.36, y0 + 0.09, 0.42, 0.145, 0.008, 0.075); bx(bg, red, 0.36, y0 + 0.04, 0.457, 0.05, 0.03, 0.003);
    transformer(bg, 0.14, 0.42, 0);
    tc(bg, steelL, -0.38, y0, 0.4, 0.012, 0.006, 0.2); sph(bg, band(0xf9a825), -0.38, y0 + 0.2, 0.4, 0.02);
    bx(bg, white, -0.28, y0, 0.42, 0.04, 0.05, 0.03); bx(bg, steelL, -0.28, y0 + 0.05, 0.42, 0.02, 0.01, 0.02);
    fence(bg, -0.46, -0.46, 0.46, -0.46); fence(bg, -0.46, -0.46, -0.46, 0.46); fence(bg, 0.46, -0.46, 0.46, 0.46);
    fence(bg, -0.46, 0.46, -0.05, 0.46); fence(bg, 0.12, 0.46, 0.46, 0.46);
  }

  // =================================================================
  // โรงงานทั่วไป 3 ระดับ (ใช้ R เป็นตัวสุ่มซ้ำได้): ผนังสังกะสี โรงรูปฟันเลื่อย ปล่อง ท่อเรียง ไซโล ท่าขนถ่าย รถบรรทุก
  // =================================================================
  function factory(g, lv, R) {
    const palette = [[0xcfd8dc, 0x37474f], [0xe3e0d4, 0x6d4c41], [0xd4e0d0, 0x2e7d32], [0xdde3ec, 0x1565c0]];
    const [wall, trim] = palette[Math.floor(R(3) * palette.length)];
    const w = 0.66 + 0.04 * lv + R(4) * 0.08, d = 0.46 + 0.04 * lv + R(5) * 0.08, hh = 0.13 + 0.035 * lv;
    pad(g, concL, 0.9, 0.86); kerb(g, 0.9, 0.86);
    const zb = -0.04 - (lv - 1) * 0.02, xb = -0.02;
    // ตัวโรงงาน: ผนังสังกะสี + ฐานคอนกรีต + แถบสี + หน้าต่างริบบิ้นสูง
    bx(g, corr(wall), xb, y0 + 0.01, zb, w, hh, d);
    bx(g, conc, xb, y0 + 0.01, zb, w + 0.005, 0.03, d + 0.005);
    bx(g, band(trim), xb, y0 + 0.01 + hh - 0.026, zb, w + 0.008, 0.026, d + 0.008);
    bx(g, glass, xb, y0 + 0.01 + hh * 0.62, zb + d / 2 + 0.002, w * 0.82, 0.026, 0.004);
    // หลังคา: lv1 ฟันเลื่อยมีช่องแสง / lv2-3 จั่วต่ำ มีช่องระบายอากาศ
    const ry = y0 + 0.01 + hh;
    if (lv === 1) {
      const n = 4;
      for (let k = 0; k < n; k++) {
        const z = zb - d / 2 + (k + 0.5) * (d / n);
        put(g, boxGeo, steel, xb, ry + 0.02, z - 0.005, w, 0.04, 0.003).rotation.x = 0;
        bx(g, band(0x90a4ae), xb, ry, z + 0.012, w, 0.012, d / n * 0.7).rotation.x = -0.16;
        bx(g, glass, xb, ry + 0.012, z - d / n * 0.34, w * 0.96, 0.022, 0.004);                                  // ช่องรับแสงฟันเลื่อย
      }
      bx(g, steelD, xb, ry - 0.002, zb, w + 0.01, 0.004, d + 0.01);
    } else {
      put(g, gableGeo(d + 0.02, w + 0.02, 0.05 + 0.01 * lv), band(0x78909c), xb, ry, zb, 1, 1, 1, Math.PI / 2);
      for (let k = 0; k < 3; k++) bx(g, steelL, xb - w * 0.28 + k * w * 0.28, ry + 0.045, zb, 0.07, 0.016, 0.025);   // ช่องระบายอากาศบนสันหลังคา
    }
    hvac(g, xb + w * 0.28, ry + (lv === 1 ? 0.04 : 0.06), zb + 0.05); hvac(g, xb - w * 0.2, ry + (lv === 1 ? 0.04 : 0.06), zb - 0.08, 0.07, 0.05);
    // ท่าขนถ่ายสินค้า: ประตูม้วน 2-3 ช่อง หลังคาคลุมคอนกรีต เสากันชน รถบรรทุกจอดถอยเข้าท่า
    const docks = lv === 1 ? 2 : 3, fz = zb + d / 2;
    bx(g, steelD, xb + w * 0.2, y0 + 0.01 + hh - 0.004, fz + 0.045, w * 0.5, 0.01, 0.09);                         // กันสาด
    for (let k = 0; k < docks; k++) {
      const dx = xb + w * 0.2 + (k - (docks - 1) / 2) * 0.13;
      bx(g, band(0xb0bec5), dx, y0 + 0.01, fz + 0.002, 0.1, 0.09, 0.005);
      for (let j = 0; j < 4; j++) bx(g, band(0x90a4ae), dx, y0 + 0.02 + j * 0.02, fz + 0.005, 0.097, 0.003, 0.002);
      bx(g, black, dx, y0 + 0.01, fz + 0.045, 0.1, 0.012, 0.09);                                                // ลานท่า
      bx(g, yellow, dx - 0.055, y0 + 0.01, fz + 0.09, 0.008, 0.035, 0.008); bx(g, yellow, dx + 0.055, y0 + 0.01, fz + 0.09, 0.008, 0.035, 0.008);
    }
    truck(g, xb + w * 0.2 - 0.065 * (docks - 1) / 2 * 0 + (docks > 2 ? -0.065 : 0), fz + 0.18, Math.PI, [0xe0e3e6, 0xf9c80e, 0xc62828][Math.floor(R(30) * 3)]);
    // อาคารสำนักงาน: กระจกริบบิ้น ทางเข้ามีกันสาด ป้ายชื่อโรงงาน
    const ox = xb - w / 2 - 0.0, oz = zb + d / 2 - 0.05;
    bx(g, concL, xb - w * 0.34, y0 + 0.01, fz + 0.1, 0.2, 0.1 + 0.02 * lv, 0.12);
    bx(g, glass, xb - w * 0.34, y0 + 0.04, fz + 0.162, 0.17, 0.03, 0.004);
    if (lv > 1) bx(g, glass, xb - w * 0.34, y0 + 0.085, fz + 0.162, 0.17, 0.025, 0.004);
    bx(g, band(trim), xb - w * 0.34, y0 + 0.01 + 0.1 + 0.02 * lv, fz + 0.1, 0.22, 0.012, 0.14);
    bx(g, steelD, xb - w * 0.34, y0 + 0.055, fz + 0.18, 0.1, 0.008, 0.05);
    // ปล่องควัน + ท่อเรียง + ไซโล/ถังเก็บ ตามระดับ
    if (lv >= 2) {
      const n = lv === 2 ? 1 : 2;
      for (let k = 0; k < n; k++) stripedStack(g, xb + w * 0.3 - k * 0.14, zb - d * 0.3, 0.36 + 0.08 * k + 0.04 * lv, 0.07, 0.05, 4);
      bx(g, steelD, xb + w * 0.3, ry + 0.02, zb - d * 0.3, 0.1, 0.03, 0.08);
      pipeX(g, steel, xb + 0.1, ry + 0.05, zb - d * 0.3, 0.34, 0.025);                                          // ท่อลำเลียงบนหลังคา
      for (let k = 0; k < 3; k++) bx(g, steelD, xb - 0.04 + k * 0.12, ry, zb - d * 0.3, 0.008, 0.045, 0.008);
    }
    if (lv >= 2) {   // ถังเก็บแนวตั้ง ล้อมคันดินกันรั่ว
      bx(g, concD, xb + w / 2 + 0.1, y0 + 0.01, zb + 0.08, 0.2, 0.025, 0.2);
      for (const [x, z, h] of [[0.02, 0.05, 0.16], [-0.04, -0.05, 0.12]]) { cy(g, band(0xeceff1), xb + w / 2 + 0.1 + x, y0 + 0.035, zb + 0.08 + z, 0.08, h); tc(g, steelL, xb + w / 2 + 0.1 + x, y0 + 0.035 + h, zb + 0.08 + z, 0.08, 0.01, 0.02); }
    }
    if (lv === 3) {   // ไซโล 3 ถังติดกันพร้อมสะพานเดินด้านบนและบันได + ท่อ conveyor
      for (let k = 0; k < 3; k++) { const x = xb - 0.2 + k * 0.12; cy(g, band(0xb0bec5), x, y0 + 0.01, zb - d / 2 - 0.09, 0.1, 0.34 + (k % 2) * 0.04); tc(g, steel, x, y0 + 0.35 + (k % 2) * 0.04, zb - d / 2 - 0.09, 0.1, 0.02, 0.04); }
      bx(g, steelD, xb - 0.08, y0 + 0.4, zb - d / 2 - 0.09, 0.36, 0.01, 0.022);
      strut(g, band(0xb0bec5), xb - 0.02, y0 + 0.4, zb - d / 2 - 0.09, xb + 0.0, ry, zb - d * 0.1, 0.03);
      ladder(g, xb - 0.27, y0 + 0.01, zb - d / 2 - 0.145, 0.38);
    }
    // ลานเก็บของ: ลังไม้ซ้อน พาเลท ป้ายโรงงาน
    for (const [x, z, k] of [[xb + w / 2 + 0.07, zb + d / 2 + 0.14, 0], [xb + w / 2 + 0.07 + 0.065, zb + d / 2 + 0.14, 1], [xb + w / 2 + 0.07, zb + d / 2 + 0.2, 2]]) crate(g, x, z, k);
    bx(g, white, xb + w * 0.42, y0 + 0.01, fz + 0.002, 0.0001, 0.0001, 0.0001);
    signAt(g, t('tool.ind'), '#37474f', '#ffd54f', xb - w * 0.34, y0 + 0.01 + 0.1 + 0.02 * lv + 0.03, fz + 0.1, 0.2, 0.04, 24);
    lampPost(g, 0.42, 0.4, 0.2); lampPost(g, -0.42, 0.4, 0.2);
  }

  // =================================================================
  // ลานตกปลาริมน้ำ: สะพานไม้ยื่นออกไปเหนือน้ำ มีเสาตอม่อ ราวเชือก คนตกปลานั่งเก้าอี้ ร้านขายเหยื่อ ถังน้ำแข็ง ห่วงชูชีพ
  // ด้านหน้า +Z ต้องหันไปทางน้ำ
  // =================================================================
  function fishspot(bg) {
    pad(bg, band(0xa9bf7c), 0.94, 0.94);                                                                       // ลานหญ้า
    pad(bg, band(0xcdbf9a), 0.46, 0.92, 0.0, -0.0);                                                           // ทางเดินดินอัดแน่น
    // ท่าเทียบไม้: ยื่นพ้นขอบน้ำ ปูแผ่นไม้สลับสี เสาตอม่อเป็นคู่ คานขวาง
    const pierZ0 = 0.4, pierZ1 = 1.7, pw = 0.5;
    for (let i = 0; i < 13; i++) { const z = pierZ0 + i * 0.1; bx(bg, i % 3 ? band(0x9a6b3d) : band(0x866037), 0, y0 + 0.008, z, pw, 0.022, 0.092); }
    for (const s of [-1, 1]) bx(bg, band(0x6d4c2a), s * (pw / 2 - 0.02), y0 - 0.012, 1.05, 0.03, 0.03, 1.4);        // คานยาวใต้สะพาน
    for (let i = 0; i < 6; i++) for (const s of [-1, 1]) { const z = pierZ0 + 0.15 + i * 0.25; cy(bg, band(0x4e3620), s * (pw / 2 - 0.02), y0 - 0.2, z, 0.04, 0.23); bx(bg, band(0x6d4c2a), 0, y0 - 0.002, z, pw, 0.022, 0.03); }
    // ราวกันตกเชือกมะนิลา: เสา 2 ฝั่ง มีเชือกพาดสองเส้น
    for (const s of [-1, 1]) {
      for (let i = 0; i < 6; i++) { const z = pierZ0 + 0.08 + i * 0.25; bx(bg, band(0x6d4c2a), s * (pw / 2 - 0.005), y0 + 0.03, z, 0.02, 0.1, 0.02); sph(bg, band(0xc9a66b), s * (pw / 2 - 0.005), y0 + 0.135, z, 0.026); }
      for (const hy of [0.07, 0.1]) bx(bg, band(0xd8bd85), s * (pw / 2 - 0.005), y0 + hy, pierZ0 + 0.08 + 1.25 / 2, 0.006, 0.006, 1.25);
      bx(bg, band(0x6d4c2a), s * (pw / 2 + 0.03), y0 - 0.02, pierZ0 + 1.28, 0.012, 0.012, 0.0001);
    }
    // หัวสะพานรูปตัว T มีม้านั่งและไฟ
    bx(bg, band(0x9a6b3d), 0, y0 + 0.008, pierZ1 + 0.09, 0.8, 0.022, 0.18);
    for (const s of [-1, 1]) cy(bg, band(0x4e3620), s * 0.34, y0 - 0.2, pierZ1 + 0.12, 0.04, 0.23);
    // คนตกปลา 3 คน: นั่งเก้าอี้พับ ใส่หมวก มีคันเบ็ดโค้ง สายเบ็ด ทุ่น และถังปลา
    const people = [{ x: -0.3, z: pierZ1 + 0.1, shirt: 0x1e88e5, hat: 0xf2d472 }, { x: 0.05, z: pierZ1 + 0.12, shirt: 0xe53935, hat: 0xffffff }, { x: 0.32, z: pierZ1 + 0.1, shirt: 0x43a047, hat: 0xf2d472 }, { x: -0.12, z: pierZ0 + 0.55, shirt: 0xf9a825, hat: 0x6d4c41 }];
    const skin = [0xe0ac84, 0xc68642, 0xf1c9a0, 0xd9a47c];
    people.forEach((p, i) => {
      const st = y0 + 0.02;
      bx(bg, band(0x546e7a), p.x, st + 0.025, p.z - 0.005, 0.055, 0.006, 0.05);                                // เก้าอี้พับ
      for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) bx(bg, steelD, p.x + sx * 0.022, st, p.z - 0.005 + sz * 0.02, 0.005, 0.03, 0.005);
      bx(bg, band(p.shirt), p.x, st + 0.04, p.z - 0.012, 0.05, 0.065, 0.032);                                    // ลำตัว
      bx(bg, band(0x37474f), p.x, st + 0.026, p.z + 0.012, 0.05, 0.02, 0.05);                                     // ต้นขา
      bx(bg, band(0x37474f), p.x - 0.014, st + 0.0, p.z + 0.04, 0.02, 0.05, 0.02); bx(bg, band(0x37474f), p.x + 0.014, st + 0.0, p.z + 0.04, 0.02, 0.05, 0.02);   // ขา
      sph(bg, band(skin[i % 4]), p.x, st + 0.093, p.z - 0.008, 0.04);
      put(bg, coneGeo, band(p.hat), p.x, st + 0.115, p.z - 0.008, 0.08, 0.03, 0.08);                              // หมวกกรวย
      bx(bg, band(p.shirt), p.x - 0.03, st + 0.055, p.z + 0.012, 0.016, 0.016, 0.05);                             // แขนยื่นถือคัน
      bx(bg, band(p.shirt), p.x + 0.03, st + 0.055, p.z + 0.012, 0.016, 0.016, 0.05);
      strut(bg, band(0x2b2b2b), p.x, st + 0.07, p.z + 0.05, p.x + 0.02, st + 0.2, p.z + 0.3, 0.007);              // คันเบ็ด
      strut(bg, band(0xf1f1f1), p.x + 0.02, st + 0.2, p.z + 0.3, p.x + 0.02, y0 - 0.02, p.z + 0.36, 0.0025);        // สายเบ็ดลงน้ำ
      sph(bg, red, p.x + 0.02, y0 - 0.03, p.z + 0.36, 0.022);                                                    // ทุ่น
      cy(bg, band(0x1565c0), p.x + 0.07, y0 + 0.02, p.z - 0.01, 0.05, 0.05); bx(bg, band(0xb0bec5), p.x + 0.07, y0 + 0.068, p.z - 0.01, 0.02, 0.004, 0.006);   // ถังปลา
    });
    // ร้านขายเหยื่อและอุปกรณ์: ห้องไม้หลังคาสังกะสีลูกฟูก มีเคาน์เตอร์ ชั้นวางคันเบ็ด ตาข่าย ปลาแห้งแขวน
    const sx = -0.3, sz = 0.05;
    bx(bg, band(0x8d6e63), sx, y0 + 0.008, sz, 0.4, 0.15, 0.3);
    for (let k = -3; k <= 3; k++) bx(bg, band(0x6d4c41), sx + k * 0.055, y0 + 0.008, sz + 0.151, 0.004, 0.15, 0.003);   // รอยต่อแผ่นไม้
    put(bg, gableGeo(0.34, 0.46, 0.08), corr(0x607d8b), sx, y0 + 0.158, sz, 1, 1, 1, Math.PI / 2);
    bx(bg, band(0x4e342e), sx - 0.12, y0 + 0.008, sz + 0.152, 0.08, 0.11, 0.004);                                   // ประตู
    bx(bg, glass, sx + 0.08, y0 + 0.07, sz + 0.152, 0.14, 0.06, 0.004);
    bx(bg, band(0x00796b), sx, y0 + 0.14, sz + 0.158, 0.4, 0.028, 0.012);                                             // ป้ายหน้าร้าน
    signAt(bg, t('sign.fishspot'), '#00695c', '#ffffff', sx, y0 + 0.14, sz + 0.166, 0.38, 0.026, 22);
    bx(bg, band(0xa1887f), sx + 0.08, y0 + 0.008, sz + 0.2, 0.15, 0.05, 0.05);                                       // เคาน์เตอร์นอกร้าน
    for (let k = 0; k < 3; k++) { fishHang(bg, sx + 0.17, y0 + 0.13 - k * 0.012, sz + 0.2 + k * 0.012); }
    for (let k = 0; k < 4; k++) strut(bg, band(0x2b2b2b), sx - 0.2 - 0.02 * k, y0 + 0.008, sz - 0.1 + k * 0.045, sx - 0.2 - 0.02 * k - 0.03, y0 + 0.19, sz - 0.1 + k * 0.045, 0.006);   // ชั้นวางคันเบ็ดข้างร้าน
    bx(bg, band(0xeceff1), 0.0, y0 + 0.008, 0.6, 0.07, 0.05, 0.05); bx(bg, band(0x1976d2), 0.0, y0 + 0.058, 0.6, 0.072, 0.008, 0.052);   // ถังแช่น้ำแข็งสีขาวฝาน้ำเงิน
    // ห่วงชูชีพบนเสา + ป้ายกฎ
    cy(bg, steelD, 0.22, y0, 0.46, 0.012, 0.16); put(bg, ringGeo, band(0xff7043), 0.22, y0 + 0.13, 0.4, 0.07, 0.07, 0.07).rotation.x = 0;
    bx(bg, band(0x1565c0), 0.31, y0 + 0.13, 0.46, 0.08, 0.06, 0.006); signAt(bg, t('sign.fishspot'), '#1565c0', '#ffffff', 0.31, y0 + 0.13, 0.466, 0.08, 0.05, 18);
    cy(bg, steelD, 0.31, y0, 0.46, 0.01, 0.1);
    // ม้านั่งสวน ต้นไม้ โคมไฟ แมวนั่งรอปลา
    bx(bg, band(0x8d6e63), 0.36, y0 + 0.03, 0.1, 0.04, 0.01, 0.14); bx(bg, band(0x6d4c41), 0.385, y0 + 0.05, 0.1, 0.008, 0.05, 0.14);
    for (const z of [0.04, 0.16]) bx(bg, steelD, 0.36, y0, z, 0.012, 0.03, 0.012);
    tree(bg, 0.38, -0.34, 1.3, 0.4); tree(bg, -0.38, -0.36, 1.2, 0.7); tree(bg, 0.36, 0.36, 1.0, 0.2);
    lampPost(bg, 0.24, 0.62, 0.2); lampPost(bg, -0.24, 1.2, 0.2); lampPost(bg, 0.24, 1.7, 0.2);
  }

  return { waterPlant, pump, gasPlant, bigPlant, solar, factory, fishspot };
}
