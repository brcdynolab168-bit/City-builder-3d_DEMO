// ---------------------------------------------------------------
// อาคารขนาดใหญ่ที่กินพื้นที่หลายช่อง (วาดในพิกัดท้องถิ่น: ศูนย์กลาง = กลางพื้นที่ กว้าง W ช่อง × ลึก D ช่อง
// หน้าอาคาร = +Z พื้นสูง y=0.03) ทุกตัวสร้างจากโค้ดล้วนๆ
// ---------------------------------------------------------------
import * as THREE from 'three';

export const FOOT = {
  'service:bu': [3, 3], 'service:hospital': [2, 2], 'service:school': [3, 2],
  'service:temple': [3, 3], 'service:church': [2, 3], 'service:mosque': [3, 3],
  'com:mall': [3, 2], 'com:market': [2, 2], 'com:dealer': [2, 1], 'com:fishing': [1, 1],
  'farm:rice': [3, 2], 'farm:crop': [2, 2], 'farm:barn': [3, 2], 'farm:orchard': [2, 2],
  'park:plaza': [2, 2], 'park:play': [1, 1], 'park:sports': [2, 2], 'park:garden': [3, 3],
};

export function createBig(c) {
  const { put, boxGeo, cylGeo, coneGeo, icoGeo, planeGeo, M, FM, block, roofCap, signAt, shrub, addTree, band, std,
    gableGeo, facadeGeo, lot, t, facadeMats } = c;
  const y0 = 0.03;

  // ----- วัสดุเฉพาะ -----
  const MT = {
    wall: std(0xf4f3ee, { roughness: 0.5 }),
    gold: std(0xe2b232, { metalness: 0.85, roughness: 0.28, emissive: 0x3a2800, emissiveIntensity: 0.35 }),
    redRoof: std(0xc8402a, { roughness: 0.6 }),
    orangeRoof: std(0xe07a1f, { roughness: 0.6 }),
    greenDome: std(0x1f8a70, { metalness: 0.35, roughness: 0.4 }),
    slate: std(0x4a505a, { roughness: 0.75 }),
    wood: std(0x8b5a2b, { roughness: 0.9 }),
    woodDark: std(0x5b3a1e, { roughness: 0.9 }),
    barnRed: std(0xa3321f, { roughness: 0.85 }),
    hay: std(0xd9b24f, { roughness: 1 }),
    paddy: std(0x7cc243, { roughness: 1 }),
    paddy2: std(0x5aa535, { roughness: 1 }),
    paddyWater: std(0x7fb6c4, { roughness: 0.15, metalness: 0.2 }),
    soil: std(0x5b4631, { roughness: 1 }),
    crop: [0x4fa83d, 0x78b83c, 0x3f8f3a, 0xa8c43c].map(x => std(x, { roughness: 1 })),
    sand: std(0xe5d19a, { roughness: 1 }),
    pitch: std(0x3f9a46, { roughness: 1 }),
    track: std(0xc2553a, { roughness: 1 }),
    water: std(0x3b87a8, { roughness: 0.08, metalness: 0.35 }),
    pool: std(0x5aaed0, { roughness: 0.05, metalness: 0.5 }),
    glass: std(0x9cc3dc, { roughness: 0.1, metalness: 0.75, transparent: true, opacity: 0.55 }),
    cow: std(0xf3f1ea, { roughness: 0.9 }),
    cowDark: std(0x2b2b2b, { roughness: 0.9 }),
    buffalo: std(0x4a4a4e, { roughness: 0.9 }),
    fruit: [0xe53935, 0xff9800, 0xfdd835].map(x => std(x, { roughness: 0.6 })),
    flower: [0xe91e63, 0xffeb3b, 0xff7043, 0xab47bc, 0xffffff].map(x => std(x, { roughness: 0.8 })),
    tarp: [0xe53935, 0x1e88e5, 0x43a047, 0xfb8c00, 0x8e24aa, 0xfdd835].map(x => std(x, { roughness: 0.8, side: THREE.DoubleSide })),
    tire: std(0x1a1a1a, { roughness: 0.9 }),
  };
  const domeGeo = new THREE.SphereGeometry(0.5, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2);
  const sphereGeo = new THREE.SphereGeometry(0.5, 16, 10);

  // ----- ตัวช่วย -----
  // ปริซึมหลายเหลี่ยม (จุดเป็น [x,z] ท้องถิ่น) สูง h เริ่มที่ y
  function prism(bg, pts, y, h, mat) {
    const s = new THREE.Shape();
    pts.forEach(([px, pz], i) => (i ? s.lineTo(px, -pz) : s.moveTo(px, -pz)));
    s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: false });
    g.rotateX(-Math.PI / 2);
    const m = put(bg, g, mat, 0, y, 0);
    return m;
  }
  const centroid = pts => [pts.reduce((a, p) => a + p[0], 0) / pts.length, pts.reduce((a, p) => a + p[1], 0) / pts.length];
  // ผนังกระจก/ตารางหน้าต่างวางทาบบนขอบของปริซึม (หันออกนอก)
  function wallEdge(bg, pts, i, y, floors, mats, off = 0.014) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz);
    let nx = dz / len, nz = -dx / len;
    const [cx, cz] = centroid(pts);
    if (nx * (a[0] - cx) + nz * (a[1] - cz) < 0) { nx = -nx; nz = -nz; }
    const h = floors * 0.16;
    put(bg, facadeGeo(len - 0.02, h, 0.02), mats, (a[0] + b[0]) / 2 + nx * off, y + h / 2, (a[1] + b[1]) / 2 + nz * off, 1, 1, 1, Math.atan2(nx, nz));
  }
  const growPts = (pts, k) => { const [cx, cz] = centroid(pts); return pts.map(([x, z]) => [cx + (x - cx) * k, cz + (z - cz) * k]); };
  // ตึกเหลี่ยมมีหลังคายื่น และผนังกระจกบนขอบที่ระบุ
  function facetTower(bg, pts, floors, glassEdges, mats, base = y0) {
    const h = floors * 0.16;
    prism(bg, pts, base, h, MT.wall);
    for (const e of glassEdges) wallEdge(bg, pts, e, base, floors, mats);
    prism(bg, growPts(pts, 1.045), base + h, 0.03, MT.wall);
    return base + h + 0.03;
  }
  const hemi = (bg, mat, x, y, z, d, hgt) => put(bg, domeGeo, mat, x, y, z, d, hgt ?? d, d);
  const flag = (bg, x, z, col, h = 0.4) => {
    put(bg, cylGeo, M.metal, x, y0 + h / 2, z, 0.008, h, 0.008);
    put(bg, boxGeo, band(col), x + 0.04, y0 + h - 0.03, z, 0.07, 0.045, 0.004);
  };
  const lamp = (bg, x, z, h = 0.24) => {
    put(bg, cylGeo, M.pole, x, y0 + h / 2, z, 0.01, h, 0.01);
    put(bg, icoGeo, M.lamp, x, y0 + h + 0.01, z, 0.04, 0.03, 0.04);
  };
  const bench = (bg, x, z, ry = 0) => {
    put(bg, boxGeo, MT.wood, x, y0 + 0.035, z, 0.11, 0.012, 0.035, ry);
    put(bg, boxGeo, MT.woodDark, x, y0 + 0.055, z - 0.015 * Math.cos(ry), 0.11, 0.025, 0.006, ry);
  };
  const miniCar = (bg, x, z, ry, mat, s = 1) => {
    put(bg, boxGeo, mat, x, y0 + 0.035 * s, z, 0.09 * s, 0.035 * s, 0.19 * s, ry);
    const ox = Math.sin(ry) * -0.01 * s, oz = Math.cos(ry) * -0.01 * s;
    put(bg, boxGeo, M.glassShop, x + ox, y0 + 0.062 * s, z + oz, 0.078 * s, 0.03 * s, 0.1 * s, ry);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const lx = sx * 0.047 * s, lz = sz * 0.06 * s;
      put(bg, cylGeo, MT.tire, x + lx * Math.cos(ry) + lz * Math.sin(ry), y0 + 0.014 * s, z - lx * Math.sin(ry) + lz * Math.cos(ry), 0.026 * s, 0.014 * s, 0.026 * s, ry).rotation.z = Math.PI / 2;
    }
  };
  const tree = (bg, x, z, s, k) => addTree(bg, x, z, s, k);
  const ground = (bg, W, D, mat, y = y0) => put(bg, boxGeo, mat, 0, y - 0.005, 0, W - 0.04, 0.03, D - 0.04);
  const fence = (bg, x1, z1, x2, z2, mat = MT.wood) => {
    const dx = x2 - x1, dz = z2 - z1, len = Math.hypot(dx, dz);
    put(bg, boxGeo, mat, (x1 + x2) / 2, y0 + 0.05, (z1 + z2) / 2, len, 0.012, 0.012, Math.atan2(-dz, dx));
    put(bg, boxGeo, mat, (x1 + x2) / 2, y0 + 0.032, (z1 + z2) / 2, len, 0.01, 0.01, Math.atan2(-dz, dx));
    const n = Math.max(1, Math.round(len / 0.2));
    for (let k = 0; k <= n; k++) put(bg, boxGeo, mat, x1 + (dx * k) / n, y0 + 0.03, z1 + (dz * k) / n, 0.012, 0.06, 0.012);
  };
  const cow = (bg, x, z, ry, dark) => {
    const m = dark ? MT.cowDark : MT.cow;
    put(bg, boxGeo, m, x, y0 + 0.07, z, 0.07, 0.065, 0.15, ry);
    if (!dark) put(bg, boxGeo, MT.cowDark, x, y0 + 0.075, z, 0.072, 0.03, 0.05, ry);
    const hx = x + Math.sin(ry) * 0.095, hz = z + Math.cos(ry) * 0.095;
    put(bg, boxGeo, m, hx, y0 + 0.085, hz, 0.045, 0.045, 0.05, ry);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      put(bg, boxGeo, m, x + sx * 0.022 * Math.cos(ry) + sz * 0.055 * Math.sin(ry), y0 + 0.025, z - sx * 0.022 * Math.sin(ry) + sz * 0.055 * Math.cos(ry), 0.012, 0.05, 0.012);
    }
  };

  const GLASS = FM.glass;

  // =============================================================
  // มหาวิทยาลัยกรุงเทพ (3×3): อาคารเหลี่ยมสีขาว-กระจก สไตล์แฟนซี มีสระสะท้อนแสงหน้าอาคาร
  // =============================================================
  function university(bg) {
    ground(bg, 3, 3, M.concrete, y0);
    put(bg, boxGeo, M.park, 0, y0 + 0.002, 0, 2.94, 0.02, 2.94);
    put(bg, boxGeo, M.concrete, 0, y0 + 0.014, 0.3, 2.2, 0.012, 2.1);     // ลานปูพื้น
    // สระสะท้อนแสง
    put(bg, boxGeo, M.white, 0, y0 + 0.022, 0.78, 1.34, 0.014, 0.74);
    put(bg, boxGeo, MT.pool, 0, y0 + 0.03, 0.78, 1.24, 0.01, 0.64);
    // อาคารหลัก (บล็อกกลางด้านหลัง ปีกเฉียง)
    const A = [[-1.0, -1.35], [0.6, -1.35], [0.95, -0.55], [-0.65, -0.55]];
    facetTower(bg, A, 7, [2, 3, 1], GLASS[0]);
    // หอสูงเฉียงด้านซ้าย
    const B = [[-1.42, -0.95], [-0.75, -1.3], [-0.5, -0.1], [-1.3, 0.25]];
    const topB = facetTower(bg, B, 10, [1, 2, 3], GLASS[1]);
    put(bg, cylGeo, M.metal, -1.0, topB + 0.15, -0.65, 0.012, 0.3, 0.012);
    put(bg, boxGeo, M.beacon, -1.0, topB + 0.3, -0.65, 0.025, 0.025, 0.025);
    // ปีกขวา
    const C = [[0.75, -0.8], [1.42, -1.0], [1.42, 0.35], [0.7, 0.15]];
    facetTower(bg, C, 5, [3, 2, 0], GLASS[2]);
    // ห้องโถงกระจกสามเหลี่ยมตรงกลาง (แกนกลางของอาคาร)
    const D = [[-0.4, -0.55], [0.55, -0.55], [0.08, 0.05]];
    prism(bg, D, y0, 0.16 * 3, MT.glass);
    prism(bg, growPts(D, 1.06), y0 + 0.48, 0.025, MT.wall);
    for (const e of [0, 1, 2]) wallEdge(bg, D, e, y0, 3, GLASS[0], 0.012);
    // สะพานลอยเชื่อมอาคาร
    put(bg, boxGeo, MT.wall, -0.62, y0 + 0.5, -0.4, 0.95, 0.1, 0.12, -0.28);
    put(bg, boxGeo, MT.glass, -0.62, y0 + 0.5, -0.4 + 0.065, 0.95, 0.07, 0.01, -0.28);
    // ชายคาทางเข้าเอียง
    put(bg, boxGeo, MT.wall, 0.08, y0 + 0.2, 0.12, 0.7, 0.025, 0.32, 0.0).rotation.x = -0.14;
    for (const sx of [-0.28, 0.44]) put(bg, cylGeo, M.metal, sx, y0 + 0.1, 0.24, 0.016, 0.2, 0.016);
    // บันไดขึ้นลานหน้าตึก
    for (let k = 0; k < 3; k++) put(bg, boxGeo, M.concrete, 0.08, y0 + 0.02 + k * 0.012, 0.28 + k * 0.05, 0.8, 0.012, 0.05);
    // ป้ายชื่อ + เสาธง
    signAt(bg, t('sign.bu'), '#1b3d6e', '#ffffff', 0, y0 + 0.1, 1.2, 1.0, 0.14, 28);
    put(bg, boxGeo, MT.wall, 0, y0 + 0.05, 1.19, 1.04, 0.1, 0.03);
    for (const [fx, col] of [[-0.9, 0xc62828], [-0.78, 0xffffff], [-0.66, 0x1b3d6e]]) flag(bg, fx, 1.18, col, 0.42);
    // ต้นไม้ สวน และทางเดินรอบ
    for (const [x, z, s, k] of [[-1.35, 1.3, 1.1, 0.2], [-1.0, 1.35, 0.9, 0.5], [1.35, 1.3, 1.2, 0.1], [1.0, 1.38, 0.9, 0.6], [-1.35, 0.7, 1.0, 0.3], [1.38, 0.8, 1.0, 0.8], [-0.95, 0.55, 0.8, 0.9], [0.95, 0.5, 0.8, 0.4]]) tree(bg, x, z, s, k);
    for (const [x, z] of [[-0.8, 0.55], [0.8, 0.55], [-0.8, 1.0], [0.8, 1.0]]) lamp(bg, x, z);
    bench(bg, -0.45, 1.05); bench(bg, 0.45, 1.05);
    // รถจอดข้างตึก
    for (let k = 0; k < 5; k++) miniCar(bg, 1.05 + (k % 2) * 0.0, 0.8 + k * 0.12 - (k % 2) * 0, Math.PI / 2, M.carCols[k % M.carCols.length], 0.9);
  }

  // =============================================================
  // โรงพยาบาล (2×2)
  // =============================================================
  function hospital(bg) {
    ground(bg, 2, 2, M.concrete);
    const top = block(bg, 0.9, 8, 0.6, FM.res[2], 0, y0, -0.42);
    const tt = roofCap(bg, 0.9, 0.6, top);
    for (const sx of [-1, 1]) {
      const wt = block(bg, 0.56, 5, 0.5, FM.res[2], sx * 0.72, y0, -0.4);
      roofCap(bg, 0.56, 0.5, wt);
    }
    const pod = block(bg, 1.7, 2, 0.44, FM.glass[0], 0, y0, 0.0);
    roofCap(bg, 1.7, 0.44, pod);
    const fz = -0.42 + 0.3;
    put(bg, boxGeo, M.white, 0, y0 + 1.0, fz + 0.005, 0.26, 0.26, 0.008);
    put(bg, boxGeo, M.red, 0, y0 + 1.0, fz + 0.011, 0.05, 0.2, 0.006);
    put(bg, boxGeo, M.red, 0, y0 + 1.0, fz + 0.011, 0.2, 0.05, 0.006);
    signAt(bg, t('sign.hospital'), '#c62828', '#ffffff', 0, y0 + 0.62, 0.232, 0.8, 0.07, 30);
    // ทางเข้า/ที่จอดรถพยาบาล
    put(bg, boxGeo, M.white, 0, y0 + 0.2, 0.42, 0.9, 0.02, 0.36);
    for (const sx of [-0.4, 0.4]) put(bg, cylGeo, M.concrete, sx, y0 + 0.1, 0.56, 0.022, 0.2, 0.022);
    // ลานเฮลิคอปเตอร์
    put(bg, cylGeo, M.concrete, 0.0, tt + 0.012, -0.42, 0.34, 0.02, 0.34);
    put(bg, boxGeo, M.stopLine, 0, tt + 0.024, -0.42, 0.04, 0.004, 0.2);
    put(bg, boxGeo, M.stopLine, 0, tt + 0.024, -0.42, 0.14, 0.004, 0.04);
    for (const [x, z] of [[-0.8, 0.52], [-0.62, 0.52]]) miniCar(bg, x, z, 0, M.white);
    put(bg, boxGeo, M.red, -0.62, y0 + 0.07, 0.52, 0.095, 0.012, 0.19);
    lot(bg, 0.65, 0.68, 0.9, 0.28, 5, 1);
    for (const [x, z, s, k] of [[-0.9, 0.86, 1.0, 0.2], [0.9, 0.86, 1.0, 0.6], [-0.15, 0.88, 0.8, 0.4]]) tree(bg, x, z, s, k);
  }

  // =============================================================
  // โรงเรียน (3×2)
  // =============================================================
  function school(bg) {
    ground(bg, 3, 2, M.park);
    put(bg, boxGeo, M.concrete, -0.2, y0 + 0.012, -0.1, 2.0, 0.012, 0.5);
    const main = block(bg, 2.2, 3, 0.42, FM.res[0], -0.2, y0, -0.55);
    put(bg, gableGeo(0.5, 2.3, 0.1), M.roofTile, -0.2, main, -0.55, 1, 1, 1, Math.PI / 2);
    for (const sx of [-1, 1]) {
      const w = block(bg, 0.42, 3, 0.9, FM.res[0], -0.2 + sx * 0.9, y0, -0.2);
      put(bg, gableGeo(0.5, 0.95, 0.1), M.roofTile, -0.2 + sx * 0.9, w, -0.2, 1, 1, 1, 0);
    }
    // หอนาฬิกา
    const tw = block(bg, 0.26, 5, 0.26, FM.res[0], -0.2, y0, -0.78);
    put(bg, coneGeo, M.roofTile, -0.2, tw + 0.1, -0.78, 0.3, 0.2, 0.3);
    put(bg, cylGeo, M.white, -0.2, y0 + 0.62, -0.78 + 0.135, 0.12, 0.01, 0.12).rotation.x = Math.PI / 2;
    signAt(bg, t('sign.school'), '#2f6fb0', '#ffffff', -0.2, y0 + 0.26, -0.55 + 0.215, 0.8, 0.08, 30);
    put(bg, boxGeo, M.door, -0.2, y0 + 0.07, -0.55 + 0.215, 0.18, 0.14, 0.01);
    // สนามกีฬา + ลู่วิ่ง
    put(bg, cylGeo, MT.track, 0.7, y0 + 0.012, 0.52, 1.35, 0.012, 0.8);
    put(bg, cylGeo, MT.pitch, 0.7, y0 + 0.02, 0.52, 1.1, 0.012, 0.58);
    put(bg, boxGeo, M.stopLine, 0.7, y0 + 0.03, 0.52, 0.01, 0.002, 0.5);
    for (const sx of [-1, 1]) put(bg, boxGeo, M.stopLine, 0.7 + sx * 0.36, y0 + 0.05, 0.52, 0.01, 0.05, 0.14);
    // สนามเด็กเล่น + ที่จอดจักรยาน
    put(bg, boxGeo, MT.sand, -0.95, y0 + 0.02, 0.5, 0.6, 0.012, 0.5);
    put(bg, boxGeo, M.red, -0.95, y0 + 0.1, 0.5, 0.2, 0.012, 0.012);
    for (const sx of [-0.1, 0.1]) put(bg, cylGeo, M.metal, -0.95 + sx, y0 + 0.06, 0.5, 0.008, 0.12, 0.008);
    flag(bg, -0.2, -0.18, 0xc62828, 0.5);
    for (const [x, z, s, k] of [[-1.4, 0.85, 1.0, 0.3], [-0.6, 0.88, 0.9, 0.7], [1.4, -0.55, 1.0, 0.1], [1.35, 0.9, 1.0, 0.5], [-1.4, -0.3, 0.9, 0.8]]) tree(bg, x, z, s, k);
  }

  // =============================================================
  // ห้างสรรพสินค้า (3×2)
  // =============================================================
  function mall(bg) {
    ground(bg, 3, 2, M.asphalt);
    const top = block(bg, 2.5, 3, 0.8, FM.office[1], 0, y0, -0.5);
    roofCap(bg, 2.5, 0.8, top);
    put(bg, boxGeo, band(0x1f5fa8), 0, top - 0.06, -0.5, 2.54, 0.08, 0.84);
    // โถงกระจกทางเข้า
    put(bg, boxGeo, MT.glass, 0, y0 + 0.28, -0.04, 0.9, 0.56, 0.05);
    put(bg, boxGeo, MT.wall, 0, y0 + 0.58, -0.06, 1.0, 0.04, 0.2);
    signAt(bg, t('sign.mall'), '#c62828', '#ffffff', 0, y0 + 0.76, -0.095, 1.5, 0.15, 36);
    put(bg, boxGeo, M.white, -0.9, y0 + 0.34, -0.09, 0.5, 0.5, 0.01);
    put(bg, boxGeo, MT.glass, -0.9, y0 + 0.16, -0.09, 0.45, 0.2, 0.012);
    put(bg, boxGeo, M.white, 0.9, y0 + 0.34, -0.09, 0.5, 0.5, 0.01);
    put(bg, boxGeo, MT.glass, 0.9, y0 + 0.16, -0.09, 0.45, 0.2, 0.012);
    lot(bg, 0, 0.55, 2.7, 0.7, 14, 0);
    for (let k = -2; k <= 2; k++) lamp(bg, k * 0.6, 0.2, 0.3);
    for (const [x, z, s, k] of [[-1.4, 0.88, 0.9, 0.4], [1.4, 0.88, 0.9, 0.8]]) tree(bg, x, z, s, k);
  }

  // =============================================================
  // วัดไทย (3×3): โบสถ์หลังคาซ้อนชั้น + เจดีย์ทอง + ศาลาการเปรียญ + กำแพงแก้ว
  // =============================================================
  function templeRoof(bg, x, z, span, len, rise, mat) {
    put(bg, gableGeo(span, len, rise), mat, x, y0 + 0.26, z, 1, 1, 1, 0);
  }
  function temple(bg) {
    ground(bg, 3, 3, M.concrete);
    put(bg, boxGeo, M.park, 0, y0 + 0.002, 0, 2.9, 0.02, 2.9);
    put(bg, boxGeo, M.path, 0, y0 + 0.014, 0.2, 2.2, 0.01, 2.1);
    // กำแพงรอบวัด
    const wallY = y0 + 0.05;
    for (const [x, z, w, d] of [[0, -1.45, 2.9, 0.04], [-1.45, 0, 0.04, 2.9], [1.45, 0, 0.04, 2.9], [-0.85, 1.45, 1.2, 0.04], [0.85, 1.45, 1.2, 0.04]]) {
      put(bg, boxGeo, MT.wall, x, wallY, z, w, 0.1, d);
      put(bg, boxGeo, MT.gold, x, wallY + 0.055, z, w + 0.01, 0.01, d + 0.01);
    }
    for (const sx of [-0.28, 0.28]) { put(bg, boxGeo, MT.wall, sx, y0 + 0.12, 1.45, 0.08, 0.24, 0.08); put(bg, coneGeo, MT.gold, sx, y0 + 0.28, 1.45, 0.1, 0.12, 0.1); }
    // อุโบสถ
    const bx = -0.35, bz = -0.4;
    put(bg, boxGeo, M.concrete, bx, y0 + 0.03, bz, 1.2, 0.05, 1.7);                    // ฐาน
    put(bg, boxGeo, MT.wall, bx, y0 + 0.2, bz, 0.84, 0.3, 1.35);                       // ผนัง
    put(bg, boxGeo, MT.glass, bx, y0 + 0.18, bz + 0.678, 0.5, 0.16, 0.012);
    put(bg, boxGeo, M.door, bx, y0 + 0.14, bz + 0.678, 0.12, 0.2, 0.012);
    for (const sx of [-1, 1]) for (let k = 0; k < 4; k++) put(bg, boxGeo, MT.gold, bx + sx * 0.425, y0 + 0.2, bz - 0.5 + k * 0.33, 0.012, 0.22, 0.05);
    // หลังคาซ้อน 2 ชั้น สีส้ม-แดง ขอบทอง
    put(bg, gableGeo(1.06, 1.55, 0.2), MT.orangeRoof, bx, y0 + 0.35, bz, 1, 1, 1);
    put(bg, gableGeo(0.68, 1.3, 0.16), MT.redRoof, bx, y0 + 0.47, bz, 1, 1, 1);
    for (const sz of [-1, 1]) {
      put(bg, boxGeo, MT.gold, bx, y0 + 0.64, bz + sz * 0.66, 0.02, 0.06, 0.03);
      put(bg, coneGeo, MT.gold, bx, y0 + 0.69, bz + sz * 0.66, 0.025, 0.1, 0.025);       // ช่อฟ้า
      put(bg, coneGeo, MT.gold, bx, y0 + 0.47, bz + sz * 0.8, 0.02, 0.12, 0.02);
    }
    // เจดีย์ทอง
    const cx = 0.85, cz = -0.5;
    put(bg, boxGeo, MT.wall, cx, y0 + 0.04, cz, 0.6, 0.07, 0.6);
    put(bg, boxGeo, MT.wall, cx, y0 + 0.1, cz, 0.46, 0.06, 0.46);
    put(bg, cylGeo, MT.gold, cx, y0 + 0.18, cz, 0.34, 0.1, 0.34);
    put(bg, domeGeo, MT.gold, cx, y0 + 0.23, cz, 0.3, 0.3, 0.3);
    put(bg, cylGeo, MT.gold, cx, y0 + 0.42, cz, 0.12, 0.1, 0.12);
    put(bg, coneGeo, MT.gold, cx, y0 + 0.67, cz, 0.1, 0.46, 0.1);
    put(bg, sphereGeo, MT.gold, cx, y0 + 0.92, cz, 0.04, 0.04, 0.04);
    // ศาลาการเปรียญ (หลังคาจั่ว เสาไม้)
    const sx0 = -0.1, sz0 = 0.85;
    put(bg, boxGeo, M.concrete, sx0, y0 + 0.02, sz0, 1.1, 0.03, 0.6);
    for (const [px, pz] of [[-0.5, -0.25], [0.5, -0.25], [-0.5, 0.25], [0.5, 0.25]]) put(bg, cylGeo, MT.woodDark, sx0 + px, y0 + 0.15, sz0 + pz, 0.04, 0.26, 0.04);
    put(bg, gableGeo(0.72, 1.18, 0.14), MT.orangeRoof, sx0, y0 + 0.28, sz0, 1, 1, 1, Math.PI / 2);
    // ระฆัง/หอระฆัง + ต้นโพธิ์
    put(bg, boxGeo, MT.woodDark, 1.1, y0 + 0.2, 0.9, 0.18, 0.4, 0.18);
    put(bg, coneGeo, MT.orangeRoof, 1.1, y0 + 0.46, 0.9, 0.3, 0.16, 0.3);
    tree(bg, 1.15, 0.2, 2.0, 0.3); tree(bg, -1.2, 0.9, 1.4, 0.5); tree(bg, -1.2, -1.15, 1.3, 0.2); tree(bg, 0.2, -1.2, 1.1, 0.6);
    // พระพุทธรูปหน้าโบสถ์
    put(bg, boxGeo, MT.gold, -1.1, y0 + 0.05, 0.3, 0.06, 0.1, 0.05);
    put(bg, sphereGeo, MT.gold, -1.1, y0 + 0.12, 0.3, 0.04, 0.04, 0.04);
  }

  // =============================================================
  // โบสถ์คริสต์ (2×3): หอระฆังสูง หลังคาจั่วสีเข้ม กระจกสี
  // =============================================================
  function church(bg) {
    ground(bg, 2, 3, M.park);
    put(bg, boxGeo, M.path, 0, y0 + 0.012, 0.9, 0.3, 0.012, 1.3);
    put(bg, boxGeo, M.concrete, 0, y0 + 0.014, 1.35, 0.9, 0.012, 0.3);
    // ตัวโบสถ์
    put(bg, boxGeo, MT.wall, 0, y0 + 0.2, -0.15, 0.9, 0.4, 1.9);
    put(bg, gableGeo(1.0, 1.95, 0.4), MT.slate, 0, y0 + 0.4, -0.15, 1, 1, 1);
    for (const sx of [-1, 1]) for (let k = 0; k < 4; k++) {
      put(bg, boxGeo, MT.glass, sx * 0.456, y0 + 0.22, -0.8 + k * 0.45, 0.012, 0.2, 0.1);
      put(bg, boxGeo, MT.wall, sx * 0.47, y0 + 0.2, -0.57 + k * 0.45, 0.04, 0.4, 0.03);
    }
    // หอระฆังหน้าโบสถ์
    const tz = 0.88;
    put(bg, boxGeo, MT.wall, 0, y0 + 0.4, tz, 0.5, 0.8, 0.5);
    put(bg, boxGeo, MT.wall, 0, y0 + 0.84, tz, 0.54, 0.04, 0.54);
    put(bg, coneGeo, MT.slate, 0, y0 + 1.08, tz, 0.52, 0.5, 0.52).rotation.y = Math.PI / 4;
    put(bg, boxGeo, MT.gold, 0, y0 + 1.42, tz, 0.016, 0.16, 0.016);
    put(bg, boxGeo, MT.gold, 0, y0 + 1.44, tz, 0.09, 0.016, 0.016);
    for (const sx of [-1, 1]) put(bg, boxGeo, M.door, 0, y0 + 0.65, tz + sx * 0.255, 0.12, 0.2, 0.01);
    put(bg, cylGeo, MT.glass, 0, y0 + 0.5, tz + 0.255, 0.22, 0.01, 0.22).rotation.x = Math.PI / 2;      // หน้าต่างกุหลาบ
    put(bg, boxGeo, M.door, 0, y0 + 0.12, tz + 0.255, 0.18, 0.24, 0.012);
    // ไม้กางเขนที่จั่วท้ายโบสถ์
    put(bg, boxGeo, MT.gold, 0, y0 + 0.88, -1.12, 0.014, 0.12, 0.014);
    put(bg, boxGeo, MT.gold, 0, y0 + 0.9, -1.12, 0.07, 0.014, 0.014);
    for (const [x, z, s, k] of [[-0.85, 1.3, 1.1, 0.3], [0.85, 1.3, 1.1, 0.7], [-0.85, -1.3, 1.0, 0.5], [0.85, -1.3, 1.0, 0.1], [0.85, 0.2, 0.9, 0.9]]) tree(bg, x, z, s, k);
    for (const sx of [-0.55, 0.55]) lamp(bg, sx, 1.35);
  }

  // =============================================================
  // มัสยิด (3×3): โดมใหญ่กลางสีเขียว หออะซาน 4 มุม ลานกว้าง
  // =============================================================
  function mosque(bg) {
    ground(bg, 3, 3, M.concrete);
    put(bg, boxGeo, M.path, 0, y0 + 0.012, 0.9, 1.4, 0.01, 1.3);
    // อาคารละหมาด
    put(bg, boxGeo, MT.wall, 0, y0 + 0.25, -0.35, 1.5, 0.5, 1.3);
    put(bg, boxGeo, MT.gold, 0, y0 + 0.51, -0.35, 1.54, 0.025, 1.34);
    hemi(bg, MT.greenDome, 0, y0 + 0.52, -0.35, 0.95, 0.7);
    put(bg, cylGeo, MT.gold, 0, y0 + 1.14, -0.35, 0.012, 0.18, 0.012);
    put(bg, sphereGeo, MT.gold, 0, y0 + 1.25, -0.35, 0.05, 0.05, 0.05);
    for (const [x, z] of [[-0.55, 0.2], [0.55, 0.2]]) hemi(bg, MT.greenDome, x, y0 + 0.52, z, 0.38, 0.28);
    // ซุ้มโค้งด้านหน้า
    put(bg, boxGeo, MT.wall, 0, y0 + 0.17, 0.27, 1.5, 0.34, 0.1);
    for (let k = -2; k <= 2; k++) {
      put(bg, boxGeo, MT.glass, k * 0.28, y0 + 0.14, 0.325, 0.16, 0.22, 0.01);
      put(bg, domeGeo, MT.glass, k * 0.28, y0 + 0.25, 0.325, 0.16, 0.1, 0.01).rotation.x = Math.PI / 2;
    }
    // หออะซาน
    for (const [x, z] of [[-0.95, -0.95], [0.95, -0.95], [-0.95, 0.4], [0.95, 0.4]]) {
      put(bg, cylGeo, MT.wall, x, y0 + 0.45, z, 0.1, 0.9, 0.1);
      put(bg, cylGeo, MT.gold, x, y0 + 0.62, z, 0.14, 0.02, 0.14);
      put(bg, cylGeo, MT.gold, x, y0 + 0.92, z, 0.13, 0.02, 0.13);
      put(bg, coneGeo, MT.greenDome, x, y0 + 1.06, z, 0.12, 0.26, 0.12);
      put(bg, sphereGeo, MT.gold, x, y0 + 1.2, z, 0.03, 0.03, 0.03);
    }
    // ลานน้ำพุล้างหน้า
    put(bg, cylGeo, M.white, 0, y0 + 0.03, 1.0, 0.36, 0.04, 0.36);
    put(bg, cylGeo, MT.pool, 0, y0 + 0.052, 1.0, 0.32, 0.01, 0.32);
    put(bg, cylGeo, M.white, 0, y0 + 0.09, 1.0, 0.04, 0.1, 0.04);
    for (const [x, z, s, k] of [[-1.3, 1.3, 1.0, 0.4], [1.3, 1.3, 1.0, 0.7], [-1.3, 0.9, 0.9, 0.2], [1.3, 0.9, 0.9, 0.9]]) tree(bg, x, z, s, k);
  }

  // =============================================================
  // ตลาด (2×2): แผงขายของมีหลังคาผ้าใบหลากสี ผลไม้ ผัก
  // =============================================================
  function market(bg) {
    ground(bg, 2, 2, M.concrete);
    put(bg, boxGeo, M.path, 0, y0 + 0.008, 0, 1.92, 0.01, 1.92);
    let n = 0;
    for (const rz of [-0.6, 0.05, 0.7]) for (const rx of [-0.6, 0.0, 0.6]) {
      if (rz === 0.7 && rx === 0.0) continue;       // เว้นทางเข้า
      const mat = MT.tarp[n % MT.tarp.length];
      for (const [px, pz] of [[-0.2, -0.1], [0.2, -0.1], [-0.2, 0.1], [0.2, 0.1]]) put(bg, cylGeo, MT.wood, rx + px, y0 + 0.09, rz + pz, 0.012, 0.18, 0.012);
      put(bg, boxGeo, mat, rx, y0 + 0.2, rz, 0.5, 0.012, 0.34).rotation.x = 0.12;
      put(bg, boxGeo, MT.wood, rx, y0 + 0.07, rz, 0.4, 0.05, 0.14);
      for (let k = 0; k < 4; k++) put(bg, icoGeo, MT.fruit[(n + k) % 3], rx - 0.14 + k * 0.09, y0 + 0.11, rz, 0.07, 0.04, 0.07);
      n++;
    }
    for (const [x, z, s, k] of [[-0.9, 0.88, 1.0, 0.3], [0.9, 0.88, 1.0, 0.8]]) tree(bg, x, z, s, k);
    // ซุ้มประตูป้ายตลาด
    for (const sx of [-0.28, 0.28]) put(bg, cylGeo, MT.wood, sx, y0 + 0.17, 0.9, 0.03, 0.34, 0.03);
    signAt(bg, t('sign.market'), '#2e7d32', '#ffffff', 0, y0 + 0.36, 0.9, 0.7, 0.1, 34);
  }

  // =============================================================
  // ร้านขายรถ (2×1)
  // =============================================================
  function dealer(bg) {
    ground(bg, 2, 1, M.asphalt);
    put(bg, boxGeo, M.white, 0, y0 + 0.13, -0.28, 1.8, 0.26, 0.34);
    put(bg, boxGeo, MT.glass, 0, y0 + 0.12, -0.28 + 0.172, 1.7, 0.2, 0.012);
    put(bg, boxGeo, band(0x1f4fa8), 0, y0 + 0.28, -0.28, 1.84, 0.06, 0.38);
    signAt(bg, t('sign.dealer'), '#1f4fa8', '#ffffff', 0, y0 + 0.28, -0.28 + 0.2, 1.3, 0.06, 30);
    for (let k = 0; k < 3; k++) miniCar(bg, -0.5 + k * 0.5, -0.27, 0, M.carCols[(k + 1) % M.carCols.length]);
    for (let k = 0; k < 8; k++) miniCar(bg, -0.8 + k * 0.23, 0.22, 0, M.carCols[k % M.carCols.length], 0.95);
    for (let k = 0; k < 8; k++) put(bg, icoGeo, band([0xff5252, 0xffeb3b, 0x40c4ff, 0x69f0ae][k % 4]), -0.85 + k * 0.24, y0 + 0.2, 0.42, 0.04, 0.04, 0.04);
    for (const sx of [-0.9, 0.9]) flag(bg, sx, 0.38, 0xc62828, 0.34);
  }

  // =============================================================
  // ร้านอุปกรณ์ตกปลา (1×1)
  // =============================================================
  function fishing(bg) {
    ground(bg, 1, 1, M.walk);
    put(bg, boxGeo, MT.wood, 0, y0 + 0.1, -0.2, 0.7, 0.2, 0.36);
    put(bg, boxGeo, MT.woodDark, 0, y0 + 0.22, -0.2, 0.78, 0.03, 0.44).rotation.x = -0.1;
    put(bg, boxGeo, MT.glass, 0, y0 + 0.09, -0.2 + 0.182, 0.46, 0.12, 0.008);
    put(bg, boxGeo, M.door, 0.26, y0 + 0.08, -0.2 + 0.182, 0.1, 0.16, 0.01);
    signAt(bg, t('sign.fishing'), '#0d6e8a', '#ffffff', 0, y0 + 0.2, -0.2 + 0.23, 0.56, 0.05, 28);
    // ปลาขนาดใหญ่เป็นสัญลักษณ์
    put(bg, icoGeo, band(0x29b6f6), 0, y0 + 0.32, -0.2, 0.2, 0.08, 0.06);
    put(bg, coneGeo, band(0x0288d1), 0.12, y0 + 0.32, -0.2, 0.06, 0.07, 0.03).rotation.z = -Math.PI / 2;
    // คันเบ็ดพิงผนัง
    for (let k = 0; k < 4; k++) put(bg, cylGeo, MT.woodDark, -0.5 + k * 0.045, y0 + 0.22, 0.02, 0.006, 0.44, 0.006).rotation.z = 0.2;
    // เรือเล็กบนรถลาก
    put(bg, boxGeo, band(0xb23a2e), 0.28, y0 + 0.06, 0.3, 0.2, 0.05, 0.4);
    put(bg, boxGeo, M.white, 0.28, y0 + 0.095, 0.3, 0.18, 0.02, 0.36);
    for (const sx of [-1, 1]) put(bg, cylGeo, MT.tire, 0.28 + sx * 0.11, y0 + 0.025, 0.36, 0.05, 0.02, 0.05).rotation.z = Math.PI / 2;
    // ถังเหยื่อและอวน
    for (const [x, z] of [[-0.35, 0.3], [-0.25, 0.38]]) put(bg, cylGeo, band(0x1e88e5), x, y0 + 0.05, z, 0.08, 0.1, 0.08);
    put(bg, boxGeo, band(0x66bb6a), -0.1, y0 + 0.02, 0.35, 0.22, 0.01, 0.16);
    tree(bg, 0.42, -0.42, 0.7, 0.3);
  }

  // =============================================================
  // ฟาร์ม
  // =============================================================
  function rice(bg) {
    ground(bg, 3, 2, MT.soil);
    for (let k = 0; k < 5; k++) {
      const z = -0.7 + k * 0.32;
      put(bg, boxGeo, MT.soil, 0, y0 + 0.012, z, 2.7, 0.02, 0.05);
      put(bg, boxGeo, k % 2 ? MT.paddyWater : MT.paddy, 0, y0 + 0.016, z + 0.16, 2.6, 0.012, 0.24);
    }
    // ต้นข้าวเป็นกอ
    for (let k = 0; k < 40; k++) {
      const x = -1.2 + (k % 10) * 0.27, z = -0.55 + Math.floor(k / 10) * 0.64 + 0.16;
      put(bg, coneGeo, MT.paddy2, x, y0 + 0.04, z, 0.04, 0.06, 0.04);
    }
    // กระท่อมยกพื้น
    put(bg, boxGeo, MT.wood, 1.1, y0 + 0.22, -0.7, 0.3, 0.16, 0.26);
    put(bg, gableGeo(0.36, 0.34, 0.1), MT.hay, 1.1, y0 + 0.3, -0.7, 1, 1, 1, Math.PI / 2);
    for (const [px, pz] of [[-0.12, -0.1], [0.12, -0.1], [-0.12, 0.1], [0.12, 0.1]]) put(bg, cylGeo, MT.woodDark, 1.1 + px, y0 + 0.1, -0.7 + pz, 0.02, 0.2, 0.02);
    // ควาย + หุ่นไล่กา
    for (const [x, z, ry] of [[-0.6, 0.85, 0.6], [-0.35, 0.9, 1.2]]) {
      put(bg, boxGeo, MT.buffalo, x, y0 + 0.07, z, 0.08, 0.07, 0.17, ry);
      put(bg, boxGeo, MT.buffalo, x + Math.sin(ry) * 0.11, y0 + 0.09, z + Math.cos(ry) * 0.11, 0.05, 0.05, 0.06, ry);
    }
    put(bg, cylGeo, MT.wood, 0.3, y0 + 0.1, 0.3, 0.008, 0.2, 0.008);
    put(bg, boxGeo, MT.wood, 0.3, y0 + 0.15, 0.3, 0.14, 0.008, 0.008);
    put(bg, icoGeo, band(0xd9b24f), 0.3, y0 + 0.22, 0.3, 0.05, 0.05, 0.05);
    tree(bg, 1.35, 0.8, 1.4, 0.3); tree(bg, -1.35, -0.85, 1.2, 0.6);
  }
  function crop(bg) {
    ground(bg, 2, 2, MT.soil);
    for (let k = 0; k < 8; k++) {
      const x = -0.7 + k * 0.2;
      put(bg, boxGeo, MT.crop[k % 4], x, y0 + 0.028, 0.0 - 0.15, 0.08, 0.04, 1.0);
      put(bg, boxGeo, MT.crop[(k + 1) % 4], x, y0 + 0.028, 0.0 - 0.15, 0.05, 0.06, 0.96);
    }
    // โรงเรือน
    put(bg, boxGeo, MT.glass, 0, y0 + 0.1, 0.72, 1.5, 0.2, 0.44);
    put(bg, gableGeo(0.5, 1.5, 0.13), MT.glass, 0, y0 + 0.2, 0.72, 1, 1, 1, Math.PI / 2);
    for (let k = 0; k < 6; k++) put(bg, boxGeo, M.white, -0.75 + k * 0.3, y0 + 0.1, 0.72, 0.012, 0.2, 0.46);
    // รถแทรกเตอร์
    put(bg, boxGeo, band(0x2e7d32), -0.6, y0 + 0.07, 0.22, 0.14, 0.07, 0.2);
    put(bg, boxGeo, band(0x2e7d32), -0.6, y0 + 0.14, 0.2, 0.1, 0.07, 0.1);
    for (const sx of [-1, 1]) put(bg, cylGeo, MT.tire, -0.6 + sx * 0.085, y0 + 0.045, 0.27, 0.09, 0.03, 0.09).rotation.z = Math.PI / 2;
    for (const sx of [-1, 1]) put(bg, cylGeo, MT.tire, -0.6 + sx * 0.075, y0 + 0.03, 0.14, 0.06, 0.03, 0.06).rotation.z = Math.PI / 2;
    tree(bg, 0.9, 0.25, 1.1, 0.4);
  }
  function barn(bg) {
    ground(bg, 3, 2, M.park);
    put(bg, boxGeo, MT.barnRed, -0.8, y0 + 0.2, -0.4, 0.9, 0.4, 0.7);
    put(bg, gableGeo(1.0, 0.76, 0.3), MT.slate, -0.8, y0 + 0.4, -0.4, 1, 1, 1, Math.PI / 2);
    put(bg, boxGeo, M.white, -0.8, y0 + 0.17, -0.4 + 0.351, 0.3, 0.3, 0.008);
    put(bg, boxGeo, M.white, -0.8, y0 + 0.17, -0.4 + 0.356, 0.3, 0.02, 0.006).rotation.z = 0.7;
    put(bg, boxGeo, M.white, -0.8, y0 + 0.17, -0.4 + 0.356, 0.3, 0.02, 0.006).rotation.z = -0.7;
    // ไซโล
    put(bg, cylGeo, M.tank, -0.15, y0 + 0.3, -0.5, 0.2, 0.6, 0.2);
    put(bg, domeGeo, M.tank, -0.15, y0 + 0.6, -0.5, 0.2, 0.12, 0.2);
    // คอกสัตว์
    fence(bg, -0.3, 0.05, 1.45, 0.05); fence(bg, 1.45, 0.05, 1.45, 0.95); fence(bg, 1.45, 0.95, -0.3, 0.95); fence(bg, -0.3, 0.95, -0.3, 0.05);
    put(bg, boxGeo, M.park, 0.58, y0 + 0.012, 0.5, 1.7, 0.01, 0.85);
    for (const [x, z, ry, d] of [[0.2, 0.4, 0.5, 0], [0.7, 0.65, 2.0, 1], [1.1, 0.35, -0.8, 0], [0.45, 0.8, 1.2, 1]]) cow(bg, x, z, ry, d);
    // ฟางก้อนกลม
    for (const [x, z] of [[-1.3, 0.55], [-1.05, 0.7], [-1.35, 0.85]]) put(bg, cylGeo, MT.hay, x, y0 + 0.06, z, 0.12, 0.12, 0.12).rotation.z = Math.PI / 2;
    tree(bg, -1.35, -0.85, 1.3, 0.2); tree(bg, 1.35, -0.8, 1.4, 0.6);
    // รถบรรทุกเล็ก
    put(bg, boxGeo, band(0x1565c0), 0.85, y0 + 0.06, -0.55, 0.14, 0.08, 0.3);
  }
  function orchard(bg) {
    ground(bg, 2, 2, M.park);
    for (let ix = 0; ix < 4; ix++) for (let iz = 0; iz < 4; iz++) {
      const x = -0.68 + ix * 0.45, z = -0.68 + iz * 0.45, k = (ix * 7 + iz * 3) % 10 / 10;
      tree(bg, x, z, 1.0, k * 0.7);
      put(bg, icoGeo, MT.fruit[(ix + iz) % 3], x + 0.05, y0 + 0.2, z + 0.04, 0.03, 0.03, 0.03);
      put(bg, icoGeo, MT.fruit[(ix + iz + 1) % 3], x - 0.05, y0 + 0.17, z - 0.03, 0.03, 0.03, 0.03);
    }
    put(bg, boxGeo, MT.wood, 0.85, y0 + 0.05, 0.85, 0.2, 0.08, 0.14);        // ลังผลไม้
    put(bg, icoGeo, MT.fruit[0], 0.85, y0 + 0.1, 0.85, 0.15, 0.05, 0.1);
  }

  // =============================================================
  // สวนแบบต่างๆ
  // =============================================================
  function plaza(bg) {
    ground(bg, 2, 2, M.concrete);
    put(bg, boxGeo, M.path, 0, y0 + 0.006, 0, 1.9, 0.01, 1.9);
    put(bg, cylGeo, M.concrete, 0, y0 + 0.04, 0, 0.9, 0.06, 0.9);
    put(bg, cylGeo, MT.water, 0, y0 + 0.07, 0, 0.82, 0.012, 0.82);
    put(bg, cylGeo, M.concrete, 0, y0 + 0.12, 0, 0.12, 0.14, 0.12);
    put(bg, cylGeo, M.concrete, 0, y0 + 0.2, 0, 0.3, 0.02, 0.3);
    put(bg, coneGeo, M.white, 0, y0 + 0.28, 0, 0.05, 0.16, 0.05);
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      put(bg, cylGeo, M.white, Math.cos(a) * 0.22, y0 + 0.16, Math.sin(a) * 0.22, 0.01, 0.1, 0.01).rotation.set(Math.sin(a) * 0.6, 0, -Math.cos(a) * 0.6);
    }
    for (const [x, z, ry] of [[0, -0.62, 0], [0, 0.62, Math.PI], [-0.62, 0, Math.PI / 2], [0.62, 0, -Math.PI / 2]]) bench(bg, x, z, ry);
    for (const [x, z] of [[-0.75, -0.75], [0.75, -0.75], [-0.75, 0.75], [0.75, 0.75]]) {
      lamp(bg, x * 0.8, z * 0.8, 0.26);
      tree(bg, x, z, 1.2, (x + z + 3) % 1);
    }
    for (let k = 0; k < 8; k++) put(bg, icoGeo, MT.flower[k % 5], -0.35 + (k % 4) * 0.23, y0 + 0.03, k < 4 ? -0.88 : 0.88, 0.07, 0.04, 0.07);
  }
  function playground(bg) {
    ground(bg, 1, 1, M.park);
    put(bg, boxGeo, MT.sand, 0, y0 + 0.012, 0, 0.8, 0.012, 0.8);
    // สไลเดอร์
    put(bg, boxGeo, band(0xe53935), -0.18, y0 + 0.1, -0.2, 0.08, 0.012, 0.3).rotation.x = 0.7;
    for (const sx of [-0.04, 0.04]) put(bg, cylGeo, M.metal, -0.18 + sx, y0 + 0.1, -0.33, 0.01, 0.2, 0.01);
    put(bg, boxGeo, band(0x1e88e5), -0.18, y0 + 0.2, -0.34, 0.12, 0.02, 0.1);
    // ชิงช้า
    for (const sx of [-0.2, 0.2]) put(bg, cylGeo, M.metal, 0.12 + sx, y0 + 0.11, 0.1, 0.012, 0.22, 0.012);
    put(bg, boxGeo, M.metal, 0.12, y0 + 0.22, 0.1, 0.42, 0.012, 0.012);
    for (const sx of [-0.08, 0.08]) { put(bg, boxGeo, M.metal, 0.12 + sx, y0 + 0.14, 0.1, 0.004, 0.14, 0.004); put(bg, boxGeo, band(0xfdd835), 0.12 + sx, y0 + 0.07, 0.1, 0.08, 0.01, 0.04); }
    // กระดานหก + ม้าหมุน
    put(bg, boxGeo, band(0x43a047), -0.15, y0 + 0.045, 0.3, 0.3, 0.012, 0.05);
    put(bg, coneGeo, M.metal, -0.15, y0 + 0.025, 0.3, 0.05, 0.05, 0.05);
    put(bg, cylGeo, band(0xfb8c00), 0.3, y0 + 0.03, -0.25, 0.18, 0.02, 0.18);
    tree(bg, 0.4, 0.4, 0.9, 0.3); tree(bg, -0.42, -0.42, 0.8, 0.6);
  }
  function sports(bg) {
    ground(bg, 2, 2, M.park);
    put(bg, boxGeo, MT.track, 0, y0 + 0.01, 0, 1.8, 0.01, 1.4);
    put(bg, boxGeo, MT.pitch, 0, y0 + 0.018, 0, 1.55, 0.01, 1.15);
    put(bg, boxGeo, M.stopLine, 0, y0 + 0.026, 0, 0.012, 0.002, 1.1);
    put(bg, cylGeo, M.stopLine, 0, y0 + 0.026, 0, 0.3, 0.002, 0.3);
    for (const sx of [-1, 1]) {
      put(bg, boxGeo, M.stopLine, sx * 0.76, y0 + 0.026, 0, 0.012, 0.002, 1.1);
      put(bg, boxGeo, M.stopLine, sx * 0.62, y0 + 0.026, 0, 0.18, 0.002, 0.45);
      put(bg, boxGeo, M.white, sx * 0.78, y0 + 0.04, 0, 0.012, 0.05, 0.2);
    }
    // อัฒจันทร์
    put(bg, boxGeo, M.concrete, 0, y0 + 0.05, -0.85, 1.7, 0.1, 0.16);
    put(bg, boxGeo, band(0x1565c0), 0, y0 + 0.11, -0.88, 1.7, 0.04, 0.09);
    put(bg, boxGeo, MT.wall, 0, y0 + 0.22, -0.95, 1.8, 0.012, 0.22);
    for (const [x, z] of [[-0.9, -0.7], [0.9, -0.7], [-0.9, 0.7], [0.9, 0.7]]) {
      put(bg, cylGeo, M.pole, x, y0 + 0.2, z, 0.012, 0.4, 0.012);
      put(bg, boxGeo, M.lampGlow, x, y0 + 0.4, z, 0.08, 0.03, 0.04);
    }
  }
  function garden(bg) {
    ground(bg, 3, 3, M.park);
    // ทางเดินโค้ง + บ่อน้ำ
    put(bg, boxGeo, M.path, 0, y0 + 0.013, 0.35, 0.18, 0.008, 2.3);
    put(bg, boxGeo, M.path, 0, y0 + 0.013, 0.1, 2.3, 0.008, 0.16);
    put(bg, cylGeo, MT.water, -0.85, y0 + 0.012, 0.85, 0.9, 0.012, 0.7);
    put(bg, cylGeo, MT.water, 0.9, y0 + 0.012, -0.9, 0.7, 0.012, 0.55);
    // เรือนกระจก
    const gz = -0.75;
    put(bg, cylGeo, M.white, 0, y0 + 0.02, gz, 1.0, 0.04, 1.0);
    hemi(bg, MT.glass, 0, y0 + 0.04, gz, 0.9, 0.55);
    for (const [x, z, s] of [[-0.15, gz, 1.5], [0.15, gz + 0.1, 1.2], [0, gz - 0.2, 1.0]]) tree(bg, x, z, s, (x + 1) % 1);
    // แปลงดอกไม้
    for (let k = 0; k < 24; k++) {
      const a = k * 2.399, rr = 0.5 + (k % 5) * 0.12;
      put(bg, icoGeo, MT.flower[k % 5], Math.cos(a) * rr + 0.2, y0 + 0.025, Math.sin(a) * rr + 0.9, 0.07, 0.05, 0.07);
    }
    for (const [x, z, s, k] of [[-1.3, -1.3, 1.5, 0.2], [1.3, 1.3, 1.5, 0.6], [-1.3, 0.1, 1.2, 0.4], [1.3, -0.1, 1.2, 0.8], [0.5, 1.3, 1.0, 0.3], [-0.6, 1.35, 1.0, 0.75], [1.35, -1.35, 1.2, 0.5]]) tree(bg, x, z, s, k);
    bench(bg, 0.3, 0.55); bench(bg, -0.3, 0.55);
  }

  const MAP = {
    'service:bu': university, 'service:hospital': hospital, 'service:school': school,
    'service:temple': temple, 'service:church': church, 'service:mosque': mosque,
    'com:mall': mall, 'com:market': market, 'com:dealer': dealer, 'com:fishing': fishing,
    'farm:rice': rice, 'farm:crop': crop, 'farm:barn': barn, 'farm:orchard': orchard,
    'park:plaza': plaza, 'park:play': playground, 'park:sports': sports, 'park:garden': garden,
  };
  return { build(bg, type, v) { const f = MAP[type + ':' + v]; if (f) { f(bg); return true; } return false; } };
}
