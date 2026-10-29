import * as THREE from 'three';
import { pickVehicle, hasVehicle } from './vehicles.js';
import { riverZ, SEA_Y } from './terrain.js';

// ---------------------------------------------------------------
// สิ่งมีชีวิตในธรรมชาติ ทำให้โลกไม่นิ่ง แม้ยังไม่มีใครสร้างเมือง
//   - ฝูงนกบินวนเหนือแม่น้ำและเนินเขา กระพือปีก เอียงตัวตอนเลี้ยว (นอนตอนกลางคืน/หลบพายุ)
//   - เรือใบ/เรือหางยาวแล่นตามแม่น้ำออกทะเล โคลงเคลงตามคลื่น มีรอยน้ำตามหลัง
// ---------------------------------------------------------------

const rnd = (a, b) => a + Math.random() * (b - a);

export function createWildlife({ scene, blocked = () => false, boats: withBoats = true }) {
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

  // ---------- เรือหลายแบบ: ประมง / หางยาว / เรือใบ / เรือพายชาวบ้าน / เรือบรรทุก / เรือโดยสาร ----------
  const boats = [];
  const X0 = -17, X1 = 36;
  let wakeTex = null;
  try {
    const cv = document.createElement('canvas'); cv.width = 64; cv.height = 128;
    const c = cv.getContext('2d');
    const gr = c.createLinearGradient(0, 128, 0, 0);
    gr.addColorStop(0, 'rgba(255,255,255,0.8)'); gr.addColorStop(0.4, 'rgba(255,255,255,0.32)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = gr;
    c.beginPath(); c.moveTo(32 - 5, 128); c.lineTo(32 + 5, 128); c.lineTo(64, 0); c.lineTo(0, 0); c.closePath(); c.fill();
    wakeTex = new THREE.CanvasTexture(cv);
  } catch (e) { wakeTex = null; }
  const wakeMat = wakeTex ? new THREE.MeshBasicMaterial({ map: wakeTex, transparent: true, depthWrite: false }) : M.wake;
  const mat2 = (c, o) => mat(c, { roughness: 0.6, ...o });
  const C = {
    deck: mat2(0xc9a46a), wood: mat2(0x8a5a35), woodD: mat2(0x5e3d22), white: mat2(0xf1efe6), blue: mat2(0x2f6fb0), red: mat2(0xb23a2e), green: mat2(0x2e8b57),
    yellow: mat2(0xe8b92c), grey: mat2(0x6d7680), dark: mat2(0x2a2f36), glass: mat2(0x9fd4e8, { roughness: 0.2 }),
    cont: [0xc0392b, 0x2e86c1, 0xe1b12c, 0x27ae60].map(c => mat2(c)),
    skin: mat2(0xe0b48c), shirt: mat2(0x3b8f6a), lamp: new THREE.MeshBasicMaterial({ color: 0xffe8a0 }),
  };
  const sph = new THREE.SphereGeometry(0.5, 8, 6);
  const A = (g, geo, m, sx, sy, sz, px, py, pz) => { const o = mesh(geo, m, sx, sy, sz, px, py, pz); g.add(o); return o; };
  function hull(g, L, W, mat, tall = 0.12) {
    A(g, boxGeo, mat, W, tall, L * 0.72, 0, tall / 2, -L * 0.06);
    const d = W * 0.7071;
    A(g, boxGeo, mat, d, tall, d, 0, tall / 2, L * 0.3).rotation.y = Math.PI / 4;   // หัวเรือแหลม
    A(g, boxGeo, C.deck, W * 0.86, 0.012, L * 0.66, 0, tall + 0.006, -L * 0.05);   // พื้นดาดฟ้า
  }
  const TYPES = {
    fishing(g, o) { // เรือประมง: ท้องเรือไม้ ห้องคนขับหน้า เสาและแขนอวน ไฟตกปลา
      hull(g, 1.5, 0.46, C.blue, 0.16);
      A(g, boxGeo, C.white, 0.36, 0.2, 0.34, 0, 0.26, 0.2);
      A(g, boxGeo, C.glass, 0.3, 0.07, 0.02, 0, 0.3, 0.375);
      A(g, boxGeo, C.red, 0.42, 0.03, 0.4, 0, 0.37, 0.2);
      A(g, cylGeo, C.woodD, 0.03, 0.55, 0.03, 0, 0.42, -0.2);
      for (const sd of [-1, 1]) { const boom = A(g, cylGeo, C.woodD, 0.016, 0.42, 0.016, sd * 0.13, 0.5, -0.2); boom.rotation.z = -sd * 0.75; }   // แขนอวนสองข้าง
      A(g, boxGeo, C.grey, 0.3, 0.02, 0.36, 0, 0.17, -0.4);
      o.lamp = A(g, sph, C.lamp, 0.07, 0.07, 0.07, 0, 0.42, 0.2);
      o.len = 1.5;
    },
    longtail(g, o) { // เรือหางยาว
      hull(g, 1.35, 0.26, C.wood, 0.1);
      A(g, boxGeo, C.red, 0.3, 0.025, 0.7, 0, 0.3, -0.05);
      A(g, cylGeo, C.woodD, 0.012, 0.2, 0.012, -0.12, 0.2, 0.1); A(g, cylGeo, C.woodD, 0.012, 0.2, 0.012, 0.12, 0.2, 0.1);
      A(g, cylGeo, C.woodD, 0.012, 0.2, 0.012, -0.12, 0.2, -0.2); A(g, cylGeo, C.woodD, 0.012, 0.2, 0.012, 0.12, 0.2, -0.2);
      A(g, boxGeo, C.dark, 0.1, 0.1, 0.12, 0, 0.16, -0.45);
      const pole = A(g, cylGeo, C.grey, 0.022, 0.8, 0.022, 0, 0.17, -0.82); pole.rotation.x = 1.25;
      o.len = 1.35; o.fast = true;
    },
    sail(g, o) { // เรือใบ
      hull(g, 1.3, 0.34, C.white, 0.12);
      A(g, boxGeo, C.blue, 0.32, 0.03, 0.88, 0, 0.12, -0.04);
      A(g, boxGeo, C.white, 0.22, 0.1, 0.26, 0, 0.17, -0.2);
      A(g, cylGeo, C.woodD, 0.014, 0.85, 0.014, 0, 0.5, 0.1);
      const sail = new THREE.Mesh(planeGeo, M.sail); sail.rotation.y = Math.PI / 2; sail.scale.set(0.56, 0.72, 1); sail.position.set(0, 0.52, -0.2); g.add(sail);
      const jibS = new THREE.Mesh(planeGeo, M.sail); jibS.rotation.y = Math.PI / 2; jibS.scale.set(0.32, 0.5, 1); jibS.position.set(0, 0.42, 0.42); g.add(jibS);
      o.len = 1.3;
    },
    row(g, o) { // เรือพายชาวบ้าน มีคนพาย
      hull(g, 0.9, 0.24, C.wood, 0.09);
      A(g, boxGeo, C.woodD, 0.2, 0.02, 0.05, 0, 0.1, -0.05);
      A(g, boxGeo, C.shirt, 0.1, 0.14, 0.08, 0, 0.17, -0.05);
      A(g, sph, C.skin, 0.08, 0.08, 0.08, 0, 0.29, -0.05);
      A(g, cylGeo, C.yellow, 0.14, 0.02, 0.14, 0, 0.34, -0.05);   // หมวกสาน
      o.oars = [-1, 1].map(sd => { const p = new THREE.Group(); p.position.set(sd * 0.1, 0.14, -0.05); A(p, boxGeo, C.woodD, 0.012, 0.012, 0.5, sd * 0.02, 0, 0); g.add(p); return p; });
      o.len = 0.9; o.small = true;
    },
    barge(g, o) { // เรือลากจูงพ่วงเรือบรรทุกตู้คอนเทนเนอร์
      A(g, boxGeo, C.dark, 0.5, 0.12, 2.4, 0, 0.06, -0.3);
      A(g, boxGeo, C.red, 0.4, 0.2, 0.34, 0, 0.2, 0.7); A(g, boxGeo, C.white, 0.36, 0.14, 0.28, 0, 0.36, 0.7);
      A(g, cylGeo, C.dark, 0.05, 0.2, 0.05, 0, 0.5, 0.64);
      for (let k = 0; k < 4; k++) A(g, boxGeo, C.cont[(k + (o.seed | 0)) % 4], 0.38, 0.18, 0.44, 0, 0.21, -0.2 - k * 0.5);
      o.len = 2.4; o.big = true;
    },
    ferry(g, o) { // เรือโดยสาร
      hull(g, 1.7, 0.5, C.white, 0.14);
      A(g, boxGeo, C.blue, 0.5, 0.05, 1.3, 0, 0.14, -0.1);
      A(g, boxGeo, C.white, 0.44, 0.2, 1.0, 0, 0.27, -0.1);
      A(g, boxGeo, C.glass, 0.46, 0.08, 0.86, 0, 0.3, -0.1);
      A(g, boxGeo, C.blue, 0.5, 0.025, 1.06, 0, 0.39, -0.1);
      o.lamp = A(g, sph, C.lamp, 0.07, 0.07, 0.07, 0, 0.44, 0.42);
      o.len = 1.7;
    },
  };
  const PLAN = [
    ['fishing', 1.25, 0.9], ['row', 1.3, 0.4], ['longtail', 1.1, 1.8], ['barge', 1, 0.55], ['sail', 1.35, 0.9], ['ferry', 1.15, 1.1],
  ];
  const LANES = [0.85, 1.25, 0.4, 0.4, 0.85, 1.25];   // ระยะจากกลางแม่น้ำ (เรือเดินสวนกันคนละฝั่ง)
  PLAN.forEach(([kind, sc, sp], i) => {
    if (!withBoats) return;
    const g = new THREE.Group(), inner = new THREE.Group();
    g.add(inner);
    const o = { seed: i };
    TYPES[kind](inner, o);
    const wake = new THREE.Mesh(planeGeo, wakeMat);
    wake.rotation.x = -Math.PI / 2;
    const wl = o.len * (o.fast ? 1.8 : o.small ? 0.8 : 1.3);
    wake.scale.set(o.len * (o.big ? 0.6 : 0.45) + 0.2, wl, 1);
    wake.position.set(0, 0.012, -o.len * 0.42 - wl / 2);
    g.add(wake);
    g.scale.setScalar(sc);
    root.add(g);
    const dir = i % 2 ? -1 : 1;
    const bx = X0 + 4 + (i * 5.3) % (X1 - X0 - 8), zp0 = 0.3 * Math.cos(bx * 0.1 + 0.6) + 0.378 * Math.cos(bx * 0.27 + 2);
    boats.push({ ...o, kind, g, inner, wake, x: bx, speed: sp * rnd(0.9, 1.1), v: sp, dir, hd: Math.atan2(dir, dir * zp0), laneAbs: LANES[i], lat: LANES[i] * dir, ph: Math.random() * 10, cool: 0 });
  });

  // เรือจอดริมตลิ่ง: สุ่มตำแหน่ง/ชนิดใหม่ทุกครั้งที่เริ่มเกม
  const docked = [];
  if (withBoats) {
    const kinds = ['fishing', 'longtail', 'row', 'row', 'longtail', 'fishing'];
    const used = [];
    for (let k = 0; k < 2 + (Math.random() < 0.4 ? 1 : 0); k++) {
      let x = 0, ok = false;
      for (let tries = 0; tries < 20 && !ok; tries++) {
        x = rnd(X0 + 3, X1 - 6);
        ok = !blocked(x) && !blocked(x + 1.5) && !blocked(x - 1.5) && used.every(u => Math.abs(u - x) > 4.5);
      }
      if (!ok) continue;
      used.push(x);
      const kind = kinds[(Math.random() * kinds.length) | 0];
      const g = new THREE.Group(), inner = new THREE.Group();
      g.add(inner);
      const o = { seed: k + 20 };
      TYPES[kind](inner, o);
      const side = Math.random() < 0.5 ? -1 : 1;
      const zp = 0.3 * Math.cos(x * 0.1 + 0.6) + 0.378 * Math.cos(x * 0.27 + 2);
      g.scale.setScalar(kind === 'row' ? 1.3 : 1.2);
      g.rotation.y = Math.atan2(1, zp) + (Math.random() < 0.5 ? 0 : Math.PI);
      root.add(g);
      docked.push({ g, inner, x, z: riverZ(x) + side * 1.5, ph: Math.random() * 10, oars: o.oars });
    }
  }
  // ใช้เฉพาะโมเดล .glb (เรือที่สร้างจากโค้ดถูกเอาออก) ขนาดเล็กลง ใหญ่กว่ารถนิดหน่อย (รถยาว ~0.36)
  const BOAT_LEN = { fishing: 0.72, longtail: 0.62, sail: 0.68, row: 0.5 };
  function useModels() {
    if (!hasVehicle('boats')) return 0;
    let n = 0;
    const fitWake = (b, L) => {
      if (!b.wake) return;
      const wl = L * (b.fast ? 1.8 : b.small ? 0.8 : 1.3);
      b.wake.scale.set(L * 0.45 + 0.1, wl, 1);
      b.wake.position.set(0, 0.012, -L * 0.42 - wl / 2);
    };
    for (const b of [...boats]) {
      if (!BOAT_LEN[b.kind]) {   // เรือลากจูง/เรือโดยสาร (โมเดลโค้ด) เอาออก
        root.remove(b.g); boats.splice(boats.indexOf(b), 1);
        continue;
      }
    }
    for (const b of [...boats, ...docked]) {
      const v = pickVehicle('boats');
      if (!v) continue;
      while (b.inner.children.length) b.inner.remove(b.inner.children[0]);
      const L = BOAT_LEN[b.kind] || 0.6;
      v.scale.multiplyScalar(L / 1.3);
      b.inner.add(v);
      b.g.scale.setScalar(1);
      b.len = L;
      fitWake(b, L);
      b.oars = null; b.lamp = null;
      n++;
    }
    return n;
  }
  function hit(raycaster) { const pk = [...boats.map(b => b.g), ...docked.map(b => b.g)]; return pk.length > 0 && raycaster.intersectObjects(pk, true).length > 0; }

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

    // เรือแล่นตามแม่น้ำ ออกทะเลแล้ววนกลับ; เจอสะพานต่ำ = กลับลำช้าๆ (หมุนหัวเรือนุ่มนวล ไม่กระตุก)
    for (const b of boats) {
      b.cool -= dt;
      if (b.cool <= 0 && blocked(b.x + b.dir * (1.2 + b.len * 0.8))) { b.dir = -b.dir; b.cool = 4; }
      if (b.x > X1) { b.dir = -1; b.cool = 2; } else if (b.x < X0) { b.dir = 1; b.cool = 2; }
      let v = b.speed;
      for (const o of boats) {   // ตามเรือคันหน้าในเลนเดียวกัน ไม่ให้ทับกัน
        if (o === b || o.dir !== b.dir || Math.abs(o.laneAbs - b.laneAbs) > 0.3) continue;
        const gap = (o.x - b.x) * b.dir;
        if (gap > 0 && gap < 0.9 + (o.len + b.len) * 0.55) v = Math.min(v, o.speed * 0.9);
      }
      b.v += (v - b.v) * Math.min(1, dt * 1.5);
      b.x += b.v * b.dir * dt;
      b.lat += (b.laneAbs * b.dir - b.lat) * Math.min(1, dt * 0.8);
      const x = b.x;
      const zp = 0.3 * Math.cos(x * 0.1 + 0.6) + 0.378 * Math.cos(x * 0.27 + 2); // อนุพันธ์ของ riverZ
      const z = riverZ(x) + b.lat;
      const want = Math.atan2(b.dir, b.dir * zp);
      let dh = want - b.hd; dh = Math.atan2(Math.sin(dh), Math.cos(dh));
      b.hd += dh * Math.min(1, dt * 1.8);
      b.g.position.set(x, SEA_Y + 0.015 + Math.sin(t * 1.8 + b.ph) * 0.018, z);
      b.g.rotation.y = b.hd;
      const sway = b.big ? 0.4 : b.small ? 1.6 : 1;
      b.inner.rotation.z = Math.sin(t * 1.6 + b.ph) * (0.03 + 0.05 * wm + 0.05 * rain) * sway;
      b.inner.rotation.x = Math.sin(t * 1.2 + b.ph * 2) * 0.03 * sway;
      if (b.lamp) b.lamp.visible = night > 0.5;
      if (b.oars) { const sw = Math.sin(t * 2.2 + b.ph) * 0.5; b.oars[0].rotation.y = 0.5 + sw; b.oars[1].rotation.y = -0.5 - sw; }
    }
  }

  function updateDocked() {
    for (const d of docked) {
      d.g.position.set(d.x, SEA_Y + 0.012 + Math.sin(t * 1.4 + d.ph) * 0.012, d.z);
      d.inner.rotation.z = Math.sin(t * 1.1 + d.ph) * 0.03;
      d.inner.rotation.x = Math.sin(t * 0.9 + d.ph * 2) * 0.02;
    }
  }
  return { update: (dt, env) => { update(dt, env); updateDocked(); }, hit, useModels };
}
