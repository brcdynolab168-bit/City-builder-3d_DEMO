import * as THREE from 'three';

// ---------------------------------------------------------------
// สนามแข่งแดร็กคลอง 5: รถต่อแถวเข้าสนาม → จับคู่ขึ้นเส้นสตาร์ท → ไฟต้นคริสต์มาส → ออกตัวแข่งจริง → ข้ามเส้นชัย → ออกจากสนาม
// ในวันงานมีผู้ชมแน่นอัฒจันทร์ และจุดพลุฉลอง
// ---------------------------------------------------------------
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = a => a[(Math.random() * a.length) | 0];
const COLS = [0xff6d00, 0x7e57c2, 0xe53935, 0x1e88e5, 0xfdd835, 0x00c853, 0xeceff1, 0xff4081, 0x26c6da];

export function createDrag({ scene, audio = null }) {
  const root = new THREE.Group();
  root.name = 'dragrace';
  scene.add(root);
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const sphGeo = new THREE.SphereGeometry(0.5, 8, 6);
  const cylGeo = new THREE.CylinderGeometry(0.5, 0.5, 1, 10);
  const std = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.4, metalness: 0.4, ...o });
  const MT = {
    glass: std(0x1b2733, { roughness: 0.1, metalness: 0.8 }),
    tire: std(0x151515, { roughness: 0.9, metalness: 0 }),
    black: std(0x101010, { roughness: 0.6 }),
    neon: new THREE.MeshBasicMaterial({ color: 0x35e0ff }),
    head: new THREE.MeshBasicMaterial({ color: 0xfff6d0 }),
    tail: new THREE.MeshBasicMaterial({ color: 0xff2020 }),
    smoke: new THREE.MeshBasicMaterial({ color: 0xdddddd, transparent: true, opacity: 0.5, depthWrite: false }),
    treeOff: new THREE.MeshBasicMaterial({ color: 0x2a2a2a }),
    red: new THREE.MeshBasicMaterial({ color: 0xff2a2a }), yel: new THREE.MeshBasicMaterial({ color: 0xffd02a }), grn: new THREE.MeshBasicMaterial({ color: 0x20ff70 }),
  };
  const FW = [0xff3b3b, 0xffc83b, 0x3bff8a, 0x3bb8ff, 0xd23bff, 0xffffff, 0xff8a3b].map(c => { const m = new THREE.MeshBasicMaterial({ color: c }); m.color.multiplyScalar(2.4); return m; });

  let strip = null;            // { cx, cz, y, th, sn, cs }
  let active = false, clock = 0;
  const cars = [];
  const tree = new THREE.Group(); root.add(tree);
  const lamps = [0, 1, 2].map(k => { const m = new THREE.Mesh(sphGeo, MT.treeOff); m.scale.setScalar(0.06); m.position.y = 0.26 - k * 0.07; tree.add(m); return m; });
  { const pole = new THREE.Mesh(cylGeo, MT.black); pole.scale.set(0.025, 0.3, 0.025); pole.position.set(0, 0.15, 0); tree.add(pole); }
  tree.visible = false;

  // local (lx,lz) ของสนาม → โลก
  const toWorld = (lx, lz) => new THREE.Vector3(strip.cx + lx * strip.cs + lz * strip.sn, strip.y, strip.cz - lx * strip.sn + lz * strip.cs);
  const yawOf = (dx, dz) => Math.atan2(dx, dz);

  function makeCar() {
    const g = new THREE.Group();
    const col = pick(COLS);
    const body = std(col, { roughness: 0.28, metalness: 0.55 });
    const mk = (geo, m, x, y, z, sx, sy, sz) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.scale.set(sx, sy, sz); o.castShadow = true; g.add(o); return o; };
    mk(boxGeo, body, 0, 0.075, 0, 0.15, 0.055, 0.36);
    mk(boxGeo, body, 0, 0.05, 0.17, 0.14, 0.03, 0.08);
    mk(boxGeo, MT.glass, 0, 0.12, -0.02, 0.125, 0.05, 0.16);
    mk(boxGeo, MT.black, 0, 0.145, -0.19, 0.17, 0.012, 0.045);          // ปีกหลัง
    for (const sx of [-1, 1]) mk(boxGeo, MT.black, sx * 0.055, 0.12, -0.19, 0.01, 0.05, 0.012);
    mk(boxGeo, MT.neon, 0, 0.03, 0, 0.13, 0.006, 0.3);                  // นีออนใต้ท้องรถ
    for (const sx of [-1, 1]) { mk(boxGeo, MT.head, sx * 0.055, 0.08, 0.182, 0.035, 0.018, 0.006); mk(boxGeo, MT.tail, sx * 0.055, 0.085, -0.182, 0.04, 0.016, 0.006); }
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const w = mk(cylGeo, MT.tire, sx * 0.085, 0.03, sz * 0.115, 0.06, 0.03, 0.06); w.rotation.z = Math.PI / 2; }
    g.userData.col = col;
    return g;
  }

  // ---------- ผู้ชม ----------
  const CROWD = 64;
  const bodyI = new THREE.InstancedMesh(boxGeo, new THREE.MeshStandardMaterial({ roughness: 0.8 }), CROWD);
  const headI = new THREE.InstancedMesh(sphGeo, new THREE.MeshStandardMaterial({ roughness: 0.8 }), CROWD);
  bodyI.frustumCulled = headI.frustumCulled = false;
  root.add(bodyI, headI);
  const crowd = [];
  const SHIRT = [0xe53935, 0x1e88e5, 0xfdd835, 0x43a047, 0xeeeeee, 0xab47bc, 0xff7043], SKIN = [0xf1c9a5, 0xd9a47c, 0xb07a52, 0x7a4e32];
  for (let k = 0; k < CROWD; k++) {
    const gs = k < 40;  // อัฒจันทร์ 40, ริมสนาม 24
    crowd.push({ lx: gs ? 0.95 + (k % 3) * 0.1 : 0.78 + (k % 2) * 0.04, lz: gs ? -2.0 + Math.floor(k / 3) * 0.24 : -2.6 + (k - 40) * 0.22, ly: gs ? 0.14 + (k % 3) * 0.05 : 0.02, ph: Math.random() * 10, appear: k / CROWD });
    bodyI.setColorAt(k, new THREE.Color(pick(SHIRT))); headI.setColorAt(k, new THREE.Color(pick(SKIN)));
  }
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _e = new THREE.Euler();
  let crowdTick = 0;
  let crowdLevel = 0;      // 0..1 ผู้ชมทยอยมา
  function updateCrowd(dt) {
    const target = active ? 1 : 0;
    crowdLevel += (target - crowdLevel) * Math.min(1, dt * 0.35);
    bodyI.visible = headI.visible = !!strip && crowdLevel > 0.01;
    if (!strip || !bodyI.visible) return;
    if ((crowdTick ^= 1)) return;   // ผู้ชมอัปเดตสลับเฟรม (ตาแยกไม่ออก)
    const cheerK = cheerBoost > 0 ? 1 : 0.35;
    crowd.forEach((c, k) => {
      const here = crowdLevel > c.appear;
      const bob = here ? Math.max(0, Math.sin(clock * (4 + cheerK * 6) + c.ph)) * 0.025 * (0.5 + cheerK) : 0;
      const sc = here ? 1 : 0.001;
      const w = toWorld(c.lx, c.lz);
      _e.set(0, strip.th, 0); _q.setFromEuler(_e);
      _s.set(0.035 * sc, 0.07 * sc, 0.026 * sc); _p.set(w.x, w.y + c.ly + 0.035 * sc + bob, w.z);
      _m.compose(_p, _q, _s); bodyI.setMatrixAt(k, _m);
      _s.setScalar(0.034 * sc); _p.set(w.x, w.y + c.ly + 0.085 * sc + bob, w.z);
      _m.compose(_p, _q, _s); headI.setMatrixAt(k, _m);
    });
    bodyI.instanceMatrix.needsUpdate = headI.instanceMatrix.needsUpdate = true;
    if (bodyI.instanceColor) bodyI.instanceColor.needsUpdate = headI.instanceColor.needsUpdate = true;
  }
  let cheerBoost = 0;

  // ---------- พลุ ----------
  const parts = [];
  const rockets = [];
  const FWN = 160;
  const pool = [];
  for (let k = 0; k < FWN; k++) { const m = new THREE.Mesh(sphGeo, FW[0]); m.visible = false; root.add(m); pool.push({ m, life: 0, v: new THREE.Vector3(), max: 1 }); }
  function launchRocket(lx, lz) {
    if (!strip) return;
    const w = toWorld(lx, lz);
    const mesh = new THREE.Mesh(sphGeo, FW[5]); mesh.scale.setScalar(0.035); mesh.position.copy(w); root.add(mesh);
    rockets.push({ mesh, x: w.x, z: w.z, y: w.y, top: w.y + rnd(1.3, 2.3), t: 0, col: (Math.random() * FW.length) | 0 });
    audio?.firework?.(0.5);
  }
  function burst(r) {
    const n = 34, ring = Math.random() < 0.4;
    let used = 0;
    for (const p of pool) {
      if (used >= n) break;
      if (p.life > 0) continue;
      const a = (used / n) * Math.PI * 2, b = ring ? 0 : (Math.random() - 0.5) * 2.4;
      const sp = rnd(0.7, 1.15);
      p.m.material = FW[(r.col + (used % 3 === 0 ? 1 : 0)) % FW.length];
      p.v.set(Math.cos(a) * Math.cos(b * 0.6) * sp, ring ? Math.sin(a * 2) * 0.3 : Math.sin(b * 0.6) * sp, Math.sin(a) * Math.cos(b * 0.6) * sp);
      p.m.position.set(r.x, r.mesh.position.y, r.z); p.life = p.max = rnd(1.1, 1.7); p.m.visible = true; p.m.scale.setScalar(0.03);
      used++;
    }
  }
  function updateFireworks(dt) {
    for (let k = rockets.length - 1; k >= 0; k--) {
      const r = rockets[k]; r.t += dt;
      const u = Math.min(1, r.t / 0.9);
      r.mesh.position.y = r.y + (r.top - r.y) * (1 - (1 - u) * (1 - u));
      if (u >= 1) { burst(r); root.remove(r.mesh); rockets.splice(k, 1); }
    }
    for (const p of pool) {
      if (p.life <= 0) continue;
      p.life -= dt; p.v.y -= 0.9 * dt;
      p.m.position.x += p.v.x * dt; p.m.position.y += p.v.y * dt; p.m.position.z += p.v.z * dt;
      const k = Math.max(0, p.life / p.max);
      p.m.scale.setScalar(0.012 + 0.03 * k);
      if (p.life <= 0) p.m.visible = false;
    }
  }

  // ---------- ควันยาง ----------
  const smokes = [];
  function tireSmoke(w, n = 6) {
    for (let k = 0; k < n; k++) {
      const m = new THREE.Mesh(sphGeo, MT.smoke); m.position.copy(w); m.position.y += 0.04; m.position.x += rnd(-0.06, 0.06); m.position.z += rnd(-0.06, 0.06);
      root.add(m); smokes.push({ m, t: 0, vx: rnd(-0.1, 0.1), vz: rnd(-0.1, 0.1) });
    }
  }
  function updateSmoke(dt) {
    for (let k = smokes.length - 1; k >= 0; k--) {
      const s = smokes[k]; s.t += dt;
      s.m.position.x += s.vx * dt; s.m.position.z += s.vz * dt; s.m.position.y += 0.09 * dt;
      const u = s.t / 1.4; s.m.scale.setScalar(Math.max(0.001, (0.06 + 0.22 * u) * (1 - u * u)));
      if (u >= 1) { root.remove(s.m); smokes.splice(k, 1); }
    }
  }

  // ---------- รถ + คิว ----------
  const QX = 0.45, QZ0 = 2.5, QGAP = 0.42, LANES = [-0.58, -0.12], START_Z = 2.75, FINISH_Z = -2.9, ENTER_Z = 4.8, EXIT_Z = -5.2;
  let spawnT = 0, pairState = null;   // pairState: { cars:[a,b], phase:'stage'|'tree'|'run', t }
  let wins = 0;
  const queue = () => cars.filter(c => c.st === 'queue' || c.st === 'enter');
  function spawnCar() {
    const o = makeCar();
    const c = { o, lx: QX, lz: ENTER_Z, yaw: 0, v: 0, st: 'enter', accel: rnd(0.42, 0.62), lane: 0, hd: null, finished: false, vel: 0 };
    root.add(o); cars.push(c);
    place(c);
    return c;
  }
  function place(c) {
    const w = toWorld(c.lx, c.lz);
    c.o.position.copy(w);
    if (c.hd == null) c.hd = strip.th + Math.PI;
    c.o.rotation.y = c.hd;
  }
  function steerTo(c, tx, tz, spd, dt) {
    const dx = tx - c.lx, dz = tz - c.lz, d = Math.hypot(dx, dz);
    if (d < 0.01) return true;
    const st = Math.min(d, spd * dt);
    c.lx += dx / d * st; c.lz += dz / d * st;
    // ทิศหัวรถ (local) → ทิศโลก
    const wx = (dx / d) * strip.cs + (dz / d) * strip.sn, wz = -(dx / d) * strip.sn + (dz / d) * strip.cs;
    let want = yawOf(wx, wz), dh = want - c.hd; dh = Math.atan2(Math.sin(dh), Math.cos(dh));
    c.hd += dh * Math.min(1, dt * 6);
    return d <= st + 1e-4;
  }

  function updateCars(dt) {
    // คิว
    const q = queue().sort((a, b) => a.lz - b.lz);
    q.forEach((c, k) => {
      const tz = QZ0 + k * QGAP;
      if (steerTo(c, QX, tz, c.lz > tz + 0.8 ? 1.2 : 0.7, dt) && c.st === 'enter') c.st = 'queue';
      c.o.rotation.y = c.hd; place(c);
    });
    // จับคู่ขึ้นเส้นสตาร์ท
    if (!pairState) {
      const ready = q.filter(c => c.st === 'queue').slice(0, 2);
      if (ready.length === 2 && active) {
        pairState = { cars: ready, phase: 'stage', t: 0, win: null };
        ready.forEach((c, i) => { c.st = 'stage'; c.lane = i; });
      }
    }
    if (pairState) {
      const P = pairState; P.t += dt;
      if (P.phase === 'stage') {
        let all = true;
        P.cars.forEach(c => { const ok = steerTo(c, LANES[c.lane], START_Z, 0.9, dt); if (!ok) all = false; place(c); });
        if (all) { P.cars.forEach(c => { c.hd = strip.th + Math.PI; place(c); }); P.phase = 'tree'; P.t = 0; tree.visible = true; lamps.forEach(l => { l.material = MT.treeOff; }); }
      } else if (P.phase === 'tree') {
        // ไฟต้นคริสต์มาส: เหลือง 3 ดวงทีละดวง แล้วเขียว
        const t = P.t;
        lamps.forEach((l, k) => { l.material = t > 0.6 + k * 0.5 ? MT.yel : MT.treeOff; });
        if (t > 0.9 && !P.rev) { P.rev = true; audio?.dragLaunch?.(0.5); }
        if (t > 2.4) {
          lamps.forEach(l => { l.material = MT.grn; });
          P.phase = 'run'; P.t = 0;
          P.cars.forEach(c => { c.st = 'run'; c.v = 0; c.react = rnd(0.05, 0.28); c.top = rnd(3.4, 4.2); tireSmoke(toWorld(c.lx, c.lz), 7); });
        }
      } else if (P.phase === 'run') {
        P.cars.forEach(c => {
          if (c.react > 0) { c.react -= dt; return; }
          if (c.st === 'run') {
            c.v = Math.min(c.top, c.v + c.accel * (c.v < 1.2 ? 2.2 : 1) * dt * 2.2);
            c.lz -= c.v * dt;
            if (Math.random() < dt * 8 && c.lz > 1.2) tireSmoke(toWorld(c.lx, c.lz + 0.15), 1);
            if (c.lz <= FINISH_Z) {
              c.st = 'out';
              if (!P.win) { P.win = c; wins++; burstAt(c.lx, FINISH_Z); cheerBoost = 3; audio?.cheer?.(0.5); }
            }
          }
          c.o.rotation.x = -0.05 * Math.min(1, (c.top - c.v) / 2);
          place(c); c.o.rotation.x = -0.05 * Math.min(1, (c.top - c.v) / 2);
        });
        if (P.cars.every(c => c.st === 'out')) { pairState = null; tree.visible = false; }
      }
    }
    // รถที่แข่งเสร็จวิ่งออกจากสนาม แล้วหายไป
    for (let k = cars.length - 1; k >= 0; k--) {
      const c = cars[k];
      if (c.st === 'out') {
        c.v = Math.max(1.0, c.v - 1.3 * dt); c.lz -= c.v * dt; c.o.rotation.x = 0; place(c);
        if (c.lz < EXIT_Z) { root.remove(c.o); cars.splice(k, 1); }
      }
    }
  }
  function burstAt(lx, lz) { launchRocket(lx, lz - 0.3); }

  // ---------- API ----------
  let fwT = 0, cheerT = 0;
  function update(dt) {
    if (!strip) return;
    clock += dt;
    cheerBoost = Math.max(0, cheerBoost - dt);
    tree.position.copy(toWorld(0.2, 2.9));
    tree.rotation.y = strip.th;
    if (active) {
      spawnT -= dt;
      if (spawnT <= 0 && queue().length < 6) { spawnCar(); spawnT = rnd(1.8, 3.5); }
      fwT -= dt;
      if (fwT <= 0) { fwT = rnd(4, 9); const n = 1 + (Math.random() < 0.4 ? 1 : 0); for (let k = 0; k < n; k++) launchRocket(rnd(-1.2, 1.4), rnd(-3, 2.5)); }
      cheerT -= dt;
      if (cheerT <= 0) { cheerT = rnd(6, 11); audio?.cheer?.(0.35); }
    } else {
      // เลิกงาน: รถที่ยังต่อคิวอยู่ขับออก
      for (const c of queue()) c.st = 'out';
      if (pairState && pairState.phase === 'stage') { pairState.cars.forEach(c => { c.st = 'out'; }); pairState = null; tree.visible = false; }
    }
    updateCars(dt);
    updateCrowd(dt);
    updateFireworks(dt);
    updateSmoke(dt);
  }
  function setStrip(s) {  // s = { cx, cz, y, rot } หรือ null
    if (!s) { strip = null; active = false; cars.splice(0).forEach(c => root.remove(c.o)); tree.visible = false; bodyI.visible = headI.visible = false; return; }
    const th = s.rot * Math.PI / 2;
    strip = { cx: s.cx, cz: s.cz, y: s.y, th, sn: Math.sin(th), cs: Math.cos(th) };
  }
  function setActive(v) {
    if (v === active) return;
    active = v;
    if (v && strip) { for (let k = 0; k < 4; k++) setTimeout(() => launchRocket(rnd(-1, 1.2), rnd(-2.5, 2)), k * 450); audio?.cheer?.(0.5); }
  }
  return { update, setStrip, setActive, isActive: () => active, wins: () => wins, busy: () => !!strip && (cars.length > 0 || crowdLevel > 0.05) };
}
