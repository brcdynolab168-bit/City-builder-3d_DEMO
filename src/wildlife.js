import * as THREE from 'three';
import { riverZ, SEA_Y } from './terrain.js';

// ---------------------------------------------------------------
// สิ่งมีชีวิตในธรรมชาติ ทำให้โลกไม่นิ่ง แม้ยังไม่มีใครสร้างเมือง
//   - ฝูงนกบินวนเหนือแม่น้ำและเนินเขา กระพือปีก เอียงตัวตอนเลี้ยว (นอนตอนกลางคืน/หลบพายุ)
//   - เรือใบ/เรือหางยาวแล่นตามแม่น้ำออกทะเล โคลงเคลงตามคลื่น มีรอยน้ำตามหลัง
// ---------------------------------------------------------------

const rnd = (a, b) => a + Math.random() * (b - a);

export function createWildlife({ scene, blocked = () => false }) {
  const root = new THREE.Group();
  root.name = 'wildlife';
  scene.add(root);

  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const icoGeo = new THREE.IcosahedronGeometry(0.5, 1);
  const cylGeo = new THREE.CylinderGeometry(0.5, 0.5, 1, 8);
  const planeGeo = new THREE.PlaneGeometry(1, 1);
  const mat = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.8, ...o });
  const M = {
    bird: [0xf4f4f0, 0xdcdcd6, 0x56657a, 0xefe3c8].map(c => mat(c)),
    beak: mat(0xf0a020),
    hull: [0xb23a2e, 0x2f6fb0, 0xe9e3d1, 0x2e8b57].map(c => mat(c, { roughness: 0.55 })),
    cabin: mat(0xf4f1e8),
    sail: mat(0xfaf7ee, { side: THREE.DoubleSide }),
    mast: mat(0x6b4a2b),
    wake: new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, depthWrite: false }),
  };
  const mesh = (geo, m, sx, sy, sz, px, py, pz) => {
    const o = new THREE.Mesh(geo, m);
    o.scale.set(sx, sy, sz); o.position.set(px, py, pz);
    o.castShadow = true;
    return o;
  };

  // ---------- นก ----------
  const birds = [];
  const FLOCKS = 4, PER = 5;
  for (let f = 0; f < FLOCKS; f++) {
    const flock = {
      cx: rnd(-18, 18), cz: rnd(-18, 18), r: rnd(6, 13), h: rnd(6, 10),
      w: rnd(0.12, 0.2) * (Math.random() < 0.5 ? -1 : 1),
    };
    for (let k = 0; k < PER; k++) {
      const g = new THREE.Group();
      const m = M.bird[f % M.bird.length];
      g.add(mesh(icoGeo, m, 0.2, 0.14, 0.46, 0, 0, 0));          // ลำตัว
      g.add(mesh(icoGeo, m, 0.12, 0.11, 0.14, 0, 0.03, 0.26));   // หัว
      g.add(mesh(boxGeo, M.beak, 0.03, 0.025, 0.08, 0, 0.025, 0.36));
      const wings = [];
      for (const s of [-1, 1]) {
        const pivot = new THREE.Group();
        pivot.position.set(s * 0.08, 0.02, 0.02);
        pivot.add(mesh(boxGeo, m, 0.55, 0.02, 0.26, s * 0.28, 0, 0));
        g.add(pivot);
        wings.push(pivot);
      }
      g.scale.setScalar(rnd(0.42, 0.6));
      root.add(g);
      birds.push({ g, wings, flock, a: Math.random() * Math.PI * 2, dr: rnd(-2, 2), dh: rnd(-1, 1), ph: Math.random() * 10 });
    }
  }

  // ---------- เรือ ----------
  const boats = [];
  const X0 = -30, X1 = 36;
  for (let i = 0; i < 3; i++) {
    const g = new THREE.Group();
    const inner = new THREE.Group();
    g.add(inner);
    const hullM = M.hull[i % M.hull.length];
    inner.add(mesh(boxGeo, hullM, 0.3, 0.1, 0.85, 0, 0.05, 0));
    inner.add(mesh(boxGeo, hullM, 0.2, 0.1, 0.2, 0, 0.05, 0.5));            // หัวเรือ
    inner.add(mesh(boxGeo, M.cabin, 0.2, 0.12, 0.26, 0, 0.16, -0.12));
    if (i % 2 === 0) {                                                       // เรือใบ
      inner.add(mesh(cylGeo, M.mast, 0.014, 0.5, 0.014, 0, 0.35, 0.1));
      const sail = new THREE.Mesh(planeGeo, M.sail);
      sail.rotation.y = Math.PI / 2;
      sail.scale.set(0.34, 0.42, 1);
      sail.position.set(0, 0.38, -0.08);
      inner.add(sail);
    } else {                                                                 // เรือหางยาว
      inner.add(mesh(cylGeo, M.mast, 0.02, 0.5, 0.02, 0, 0.12, -0.62)).rotation.x = 1.2;
    }
    const wake = new THREE.Mesh(planeGeo, M.wake);
    wake.rotation.x = -Math.PI / 2;
    wake.scale.set(0.34, 1.6, 1);
    wake.position.set(0, 0.012, -1.15);
    g.add(wake);
    g.scale.setScalar(1.5);
    root.add(g);
    boats.push({ g, inner, x: X0 + i * 23 + rnd(0, 6), speed: rnd(0.9, 1.5), dir: 1, ph: Math.random() * 10 });
  }

  let t = 0;

  // env: { night, rain, wind: {x,z}, windMag }
  function update(dt, env = {}) {
    t += dt;
    const night = env.night || 0, rain = env.rain || 0;
    const wv = env.wind || { x: 1, z: 0 }, wm = env.windMag || 0;

    // นกออกหากินช่วงกลางวัน และไม่บินตอนฝนแรง
    const birdsOut = night < 0.55 && rain < 0.5;
    for (const b of birds) {
      b.g.visible = birdsOut;
      if (!birdsOut) continue;
      const fl = b.flock;
      fl.cx += wv.x * wm * dt * 1.2; fl.cz += wv.z * wm * dt * 1.2;
      if (fl.cx > 36) fl.cx -= 72; else if (fl.cx < -36) fl.cx += 72;
      if (fl.cz > 36) fl.cz -= 72; else if (fl.cz < -36) fl.cz += 72;
      b.a += fl.w * dt;
      const rr = fl.r + b.dr;
      const x = fl.cx + Math.cos(b.a) * rr, z = fl.cz + Math.sin(b.a) * rr;
      const sgn = fl.w < 0 ? -1 : 1;
      const fx = -Math.sin(b.a) * sgn, fz = Math.cos(b.a) * sgn;
      b.g.position.set(x, fl.h + b.dh + Math.sin(t * 0.8 + b.ph) * 0.6, z);
      b.g.rotation.set(0, Math.atan2(fx, fz), -sgn * 0.35);
      const flap = Math.sin(t * (9 + wm * 4) + b.ph) * 0.75;
      b.wings[0].rotation.z = flap;
      b.wings[1].rotation.z = -flap;
    }

    // เรือแล่นตามแม่น้ำ (ซ้าย→ขวา) ออกสู่ทะเลแล้ววนกลับมาใหม่
    for (const b of boats) {
      // เจอสะพานข้างหน้า = กลับลำ (สะพานต่ำ เรือลอดไม่ได้)
      if (!blocked(b.x) && blocked(b.x + b.dir * 2.4)) b.dir = -b.dir;
      b.x += b.speed * b.dir * dt;
      if (b.x > X1) b.dir = -1; else if (b.x < X0) b.dir = 1;
      const x = b.x;
      const z = riverZ(x);
      const zp = 0.3 * Math.cos(x * 0.1 + 0.6) + 0.378 * Math.cos(x * 0.27 + 2); // อนุพันธ์ของ riverZ
      b.g.position.set(x, SEA_Y + 0.015 + Math.sin(t * 1.8 + b.ph) * 0.018, z);
      b.g.rotation.y = Math.atan2(b.dir, b.dir * zp);
      b.inner.rotation.z = Math.sin(t * 1.6 + b.ph) * (0.04 + 0.05 * wm + 0.05 * rain);
      b.inner.rotation.x = Math.sin(t * 1.2 + b.ph * 2) * 0.03;
    }
  }

  return { update };
}
