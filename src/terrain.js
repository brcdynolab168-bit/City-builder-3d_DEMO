// ---------------------------------------------------------------
// ภูมิประเทศ (ฟังก์ชันล้วน ไม่พึ่ง Three.js)
// พิกัดโลก: เมืองอยู่กลางแผนที่ (0,0) ช่องละ 1 หน่วย
//   - เนินเขาเตี้ยๆ ในพื้นที่สร้างเมือง
//   - แม่น้ำไหลจากทิศตะวันตกไปทะเลทางตะวันออก
//   - ภูเขาล้อมรอบทิศเหนือ ใต้ ตะวันตก ส่วนตะวันออกเป็นหาดและทะเล
// ค่าคงที่ ไม่สุ่มใหม่ทุกครั้ง เพื่อให้เมืองที่เซฟไว้ตรงกับแผนที่เสมอ
// ---------------------------------------------------------------

export const SEA_Y = 0;          // ระดับผิวน้ำ
export const WATER_LIMIT = 0.04; // ช่องที่ความสูงเฉลี่ยต่ำกว่านี้ = น้ำ (สร้างได้แค่สะพาน)

export function hash2(ix, iz) {
  let h = (Math.imul(ix | 0, 374761393) ^ Math.imul(iz | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const sm = t => t * t * (3 - 2 * t);
export const ss = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const lerp = (a, b, t) => a + (b - a) * t;

export function vnoise(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const a = hash2(ix, iz), b = hash2(ix + 1, iz), c = hash2(ix, iz + 1), d = hash2(ix + 1, iz + 1);
  const u = sm(fx), v = sm(fz);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

export function fbm(x, z, oct = 4) {
  let s = 0, a = 0.5, f = 1, n = 0;
  for (let i = 0; i < oct; i++) {
    s += a * vnoise(x * f, z * f);
    n += a; a *= 0.5; f *= 2.03;
  }
  return s / n; // 0..1
}

// เส้นกลางแม่น้ำ (z ที่ตำแหน่ง x)
export function riverZ(wx) {
  return -9 + 3 * Math.sin(wx * 0.1 + 0.6) + 1.4 * Math.sin(wx * 0.27 + 2);
}

export function terrainH(wx, wz) {
  const rC = Math.max(Math.abs(wx), Math.abs(wz));

  // เนินเขาเตี้ย + ผิวหยาบเล็กน้อย
  let h = 0.55 + (fbm(wx * 0.05 + 11.3, wz * 0.05 + 4.7, 3) - 0.5) * 0.9;
  h += (fbm(wx * 0.25 + 3, wz * 0.25 + 9, 2) - 0.5) * 0.1;

  // กลางแผนที่ราบขึ้น เพื่อให้เริ่มเมืองง่าย
  const cen = 1 - ss(3, 13, Math.hypot(wx, wz));
  h = lerp(h, 0.6, cen * 0.6);

  // บนบกไม่ให้เกิดหนองน้ำโดยบังเอิญ
  h = Math.max(h, 0.14);

  // ภูเขาล้อมรอบ ลดลงทางตะวันออก
  const ring = ss(26, 56, rC);
  const east = 1 - ss(8, 30, wx);
  h += (3.5 + 13 * fbm(wx * 0.04 + 50, wz * 0.04 + 50, 4)) * ring * east;

  // ทะเลทางตะวันออก
  h = lerp(h, -1.4, ss(25, 40, wx));

  // แม่น้ำ (เริ่มจากเชิงเขาทางตะวันตก)
  const rw = ss(-36, -24, wx);
  if (rw > 0) {
    const d = Math.abs(wz - riverZ(wx));
    const t = 1 - ss(0.7, 3.8, d);
    h = lerp(h, -0.35, t * rw);
  }
  return h;
}

// สีพื้นดินตามความสูง: ทรายริมน้ำ → หญ้า → ป่า → หิน → หิมะ
export function terrainColor(h, noise, out) {
  const n = (noise - 0.5) * 0.12;
  let r, g, b;
  if (h < -0.15) { r = 0.16; g = 0.30; b = 0.34; }                  // ใต้น้ำ
  else if (h < 0.3) {                                               // หาดทราย → หญ้า
    const t = ss(0.02, 0.32, h);
    r = lerp(0.78, 0.46, t); g = lerp(0.70, 0.66, t); b = lerp(0.50, 0.36, t);
  } else if (h < 5) {                                               // หญ้า
    r = 0.46; g = 0.66; b = 0.36;
  } else if (h < 9) {                                               // ป่าทึบ
    const t = ss(5, 9, h);
    r = lerp(0.46, 0.27, t); g = lerp(0.66, 0.42, t); b = lerp(0.36, 0.25, t);
  } else if (h < 13) {                                              // หิน
    const t = ss(9, 12, h);
    r = lerp(0.27, 0.52, t); g = lerp(0.42, 0.49, t); b = lerp(0.25, 0.45, t);
  } else {                                                          // หิมะ
    const t = ss(13, 15.5, h);
    r = lerp(0.52, 0.94, t); g = lerp(0.49, 0.95, t); b = lerp(0.45, 0.97, t);
  }
  out[0] = Math.min(1, Math.max(0, r + n));
  out[1] = Math.min(1, Math.max(0, g + n));
  out[2] = Math.min(1, Math.max(0, b + n));
  return out;
}
