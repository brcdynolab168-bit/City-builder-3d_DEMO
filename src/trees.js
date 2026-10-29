import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

// ---------------------------------------------------------------
// ต้นไม้แบบโพรซีเดอร์ให้ดูเป็นธรรมชาติ: พุ่มไม้ผิวขรุขระเรียบนุ่ม ไล่เฉดสีมืดล่าง-สว่างบน
// (สีไล่เฉดอยู่ใน vertex color; สีเขียวของแต่ละต้นมาจาก instance color / material)
// ---------------------------------------------------------------

const n3 = (x, y, z, s) =>
  Math.sin(x * 3.1 + s) * Math.sin(y * 2.7 + s * 1.7) * 0.5 +
  Math.sin(x * 6.3 + y * 5.1 + s * 2.3) * Math.sin(z * 6.9 - s) * 0.5;

// ใส่ vertex color ตามความสูง (ล่างมืด บนสว่าง) + นุ่มนวลด้วย normal
function shade(geo, y0, y1, dark = 0.5, light = 1.08) {
  const p = geo.attributes.position;
  const c = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const t = Math.min(1, Math.max(0, (p.getY(i) - y0) / (y1 - y0)));
    const k = dark + (light - dark) * t;
    c[i * 3] = c[i * 3 + 1] = c[i * 3 + 2] = k;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return geo;
}

function smooth(geo) {
  geo.deleteAttribute('normal');
  geo.deleteAttribute('uv');
  const g = mergeVertices(geo, 1e-4);
  return g;
}

// ก้อนพุ่มไม้ทรงกลมขรุขระ
export function blob(r, sx = 1, sy = 0.85, sz = 1, seed = 0, amp = 0.22, detail = 2) {
  const g = smooth(new THREE.IcosahedronGeometry(1, detail));
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = 1 + amp * n3(x, y, z, seed);
    p.setXYZ(i, x * k * r * sx, y * k * r * sy, z * k * r * sz);
  }
  g.computeVertexNormals();
  return g;
}

function moved(g, x, y, z) { g.translate(x, y, z); return g; }

// ต้นไม้ใบกว้าง: ลำต้นแยกต่างหาก (ผู้เรียกทำเอง) ส่งคืนเฉพาะเรือนยอด สูงประมาณ 0.5..1.6
export function broadleafCrown(seed = 1, d = 2) {
  const parts = [
    moved(blob(0.50, 1, 0.82, 1, seed, 0.22, d), 0, 0.88, 0),
    moved(blob(0.36, 1, 0.85, 1, seed + 3, 0.22, d), 0.30, 0.78, 0.12),
    moved(blob(0.38, 1, 0.85, 1, seed + 5, 0.22, d), -0.28, 0.84, -0.10),
    moved(blob(0.32, 1, 0.85, 1, seed + 7, 0.22, d), 0.05, 0.80, -0.30),
    moved(blob(0.34, 1, 0.85, 1, seed + 9, 0.22, d), 0.06, 1.28, 0.02),
  ];
  const m = mergeGeometries(parts, false);
  return shade(m, 0.45, 1.6, 0.52, 1.1);
}

// สน: ชั้นกรวยขรุขระซ้อนกัน 5 ชั้น เอียงโค้งตกเล็กน้อย
export function coniferCrown(seed = 1, rad = 10, hs = 2) {
  const parts = [];
  const tiers = 5;
  for (let i = 0; i < tiers; i++) {
    const t = i / (tiers - 1);
    const r = 0.56 - 0.38 * t, h = 0.62 - 0.12 * t;
    let g = smooth(new THREE.ConeGeometry(r, h, rad, hs));
    const p = g.attributes.position;
    for (let k = 0; k < p.count; k++) {
      const x = p.getX(k), y = p.getY(k), z = p.getZ(k);
      const rr = Math.hypot(x, z);
      const j = 1 + 0.16 * n3(x * 2, y * 2, z * 2, seed + i * 3);
      const droop = -0.10 * (rr / r) * (rr / r);       // ปลายกิ่งตกลง
      p.setXYZ(k, x * j, y + droop, z * j);
    }
    g.computeVertexNormals();
    g.translate(0, 0.42 + 0.30 * i, 0);
    parts.push(g);
  }
  const m = mergeGeometries(parts, false);
  return shade(m, 0.3, 2.0, 0.42, 1.12);
}

export function trunkGeo(h = 0.55, r0 = 0.085, r1 = 0.05) {
  const g = new THREE.CylinderGeometry(r1, r0, h, 7);
  g.translate(0, h / 2, 0);
  return g;
}
