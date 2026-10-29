// ระบบโมเดล .glb ของ รถ/มอไซค์/รถเมล์/เรือ/หมา/แมว
// วางไฟล์ไว้ที่ src/models/{cars,bikes,buses,boats,dogs,cats}/*.glb  (ดู src/models/README.md)
import * as THREE from 'three';
import { clone as skClone } from 'three/addons/utils/SkeletonUtils.js';

// ความยาวเป้าหมายในหน่วยของเกม (ตัวถังด้านหน้า-หลัง)
export const VEH_LEN = { cars: 0.36, bikes: 0.22, buses: 0.58, boats: 1.3, dogs: 0.2, cats: 0.15 };
// ถ้าโมเดลหันหัวผิดทาง ให้ปรับค่านี้ (Math.PI = กลับหัว, ±Math.PI/2 = หันข้าง)
export const VEH_YAW = { cars: 0, bikes: 0, buses: 0, boats: 0, dogs: 0, cats: 0 };

const lib = { cars: [], bikes: [], buses: [], boats: [], dogs: [], cats: [] };
export const VEH_RE = /^\.\/models\/(cars|bikes|buses|boats|dogs|cats)\/[^/]+\.glb$/i;

// จัดโมเดล: กึ่งกลาง ฐานอยู่ y=0 แกนยาวหันไปทาง +Z และย่อ/ขยายให้ได้ความยาวเป้าหมาย
export function normalizeVehicle(root, cat) {
  root.updateMatrixWorld(true);
  let box = new THREE.Box3().setFromObject(root);
  let size = box.getSize(new THREE.Vector3());
  const wrap = new THREE.Group();
  const spin = new THREE.Group();
  spin.add(root);
  wrap.add(spin);
  if (size.x > size.z * 1.05) spin.rotation.y = Math.PI / 2;   // แกนยาวเป็น X -> หมุนให้เป็น Z
  spin.rotation.y += VEH_YAW[cat] || 0;
  wrap.updateMatrixWorld(true);
  box = new THREE.Box3().setFromObject(wrap);
  size = box.getSize(new THREE.Vector3());
  const c = box.getCenter(new THREE.Vector3());
  const s = VEH_LEN[cat] / Math.max(size.z, 1e-6);
  spin.position.set(-c.x, -box.min.y, -c.z);
  const out = new THREE.Group();
  out.add(wrap);
  out.scale.setScalar(s);
  out.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
  return out;
}

export function addVehicleModel(cat, gltfScene) {
  lib[cat].push(normalizeVehicle(gltfScene, cat));
}
export const hasVehicle = cat => lib[cat].length > 0;
export function pickVehicle(cat) {
  const l = lib[cat];
  if (!l.length) return null;
  return skClone(l[(Math.random() * l.length) | 0]);
}
export function vehicleCount() { let n = 0; for (const k in lib) n += lib[k].length; return n; }
