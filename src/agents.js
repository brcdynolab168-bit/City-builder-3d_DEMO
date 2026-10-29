import * as THREE from 'three';

// ---------------------------------------------------------------
// ตัวละครที่เคลื่อนไหวในเมือง: รถ (ขับชิดซ้ายแบบไทย), ผู้คน, หมา, แมว
// โมเดลทั้งหมดสร้างจากโค้ด เดินตามถนน (รถ) และถนน/สวน (คนและสัตว์)
// ---------------------------------------------------------------

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const clamp01 = v => Math.min(1, Math.max(0, v));
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const angLerp = (a, b, t) => {
  const d = ((((b - a + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) - Math.PI;
  return a + d * t;
};
const pick = arr => arr[(Math.random() * arr.length) | 0];

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
  const sphGeo = new THREE.SphereGeometry(0.5, 10, 8);
  const coneGeo = new THREE.ConeGeometry(0.5, 1, 4);

  const mat = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7, metalness: 0, ...o });
  const M = {
    car: [0xc0392b, 0x2e86c1, 0xecf0f1, 0x2c3e50, 0xf1c40f, 0x27ae60, 0x7f8c8d, 0xe67e22, 0x8e44ad, 0x111111]
      .map(c => mat(c, { roughness: 0.3, metalness: 0.55 })),
    glass: mat(0x1b2a38, { roughness: 0.1, metalness: 0.8 }),
    tire: mat(0x151515, { roughness: 0.9 }),
    head: mat(0xfff6d8, { emissive: 0xfff0c0, emissiveIntensity: 0 }),
    tail: mat(0xaa1111, { emissive: 0xff2200, emissiveIntensity: 0.2 }),
    skin: [0xf1c9a5, 0xd9a47c, 0xb07a52, 0x7a4e32].map(c => mat(c)),
    hair: [0x1b1410, 0x3a2a1c, 0x6b4a2b, 0x9a9a9a].map(c => mat(c)),
    cloth: [0xd9534f, 0x3b82c4, 0xf0ad4e, 0x5cb85c, 0xeeeeee, 0x7e57c2, 0x2f3e4e, 0xff8fab].map(c => mat(c)),
    pants: [0x2f3e4e, 0x3b3b3b, 0x6b5a45, 0x28455e].map(c => mat(c)),
    fur: [0x8b5a2b, 0x1d1d1d, 0xe8e0d0, 0xc99a5b, 0x7d7d7d].map(c => mat(c, { roughness: 1 })),
    furCat: [0xd9822b, 0x7d7d7d, 0x1a1a1a, 0xf0f0f0, 0x9b7b5a].map(c => mat(c, { roughness: 1 })),
    dark: mat(0x1a1a1a),
  };

  const mesh = (geo, m, sx, sy, sz, px, py, pz) => {
    const o = new THREE.Mesh(geo, m);
    o.scale.set(sx, sy, sz);
    o.position.set(px, py, pz);
    o.castShadow = true;
    o.receiveShadow = true;
    return o;
  };

  // ---------- โมเดล (หน้าตรงไปทาง +Z) ----------
  function makeCar() {
    const g = new THREE.Group();
    const body = pick(M.car);
    g.add(mesh(boxGeo, body, 0.15, 0.05, 0.33, 0, 0.056, 0));
    g.add(mesh(boxGeo, M.glass, 0.13, 0.045, 0.17, 0, 0.1, -0.02));
    g.add(mesh(boxGeo, body, 0.135, 0.008, 0.18, 0, 0.126, -0.02));
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const w = mesh(cylGeo, M.tire, 0.056, 0.022, 0.056, sx * 0.078, 0.028, sz * 0.105);
        w.rotation.z = Math.PI / 2;
        g.add(w);
      }
      g.add(mesh(boxGeo, M.head, 0.035, 0.014, 0.008, sx * 0.05, 0.06, 0.168));
      g.add(mesh(boxGeo, M.tail, 0.035, 0.014, 0.008, sx * 0.05, 0.06, -0.168));
    }
    return { obj: g };
  }

  function makePerson() {
    const g = new THREE.Group();
    const cloth = pick(M.cloth), pants = pick(M.pants), skin = pick(M.skin), hair = pick(M.hair);
    const legs = [], arms = [];
    for (const sx of [-1, 1]) {
      const leg = new THREE.Group();
      leg.position.set(sx * 0.012, 0.062, 0);
      leg.add(mesh(boxGeo, pants, 0.018, 0.062, 0.02, 0, -0.031, 0));
      g.add(leg); legs.push(leg);
      const arm = new THREE.Group();
      arm.position.set(sx * 0.033, 0.112, 0);
      arm.add(mesh(boxGeo, cloth, 0.014, 0.044, 0.016, 0, -0.022, 0));
      arm.add(mesh(sphGeo, skin, 0.014, 0.014, 0.014, 0, -0.049, 0));
      g.add(arm); arms.push(arm);
    }
    g.add(mesh(boxGeo, cloth, 0.05, 0.05, 0.028, 0, 0.087, 0));
    g.add(mesh(sphGeo, skin, 0.034, 0.036, 0.034, 0, 0.13, 0));
    g.add(mesh(sphGeo, hair, 0.037, 0.026, 0.037, 0, 0.14, -0.003));
    return { obj: g, legs, arms };
  }

  function makeDog() {
    const g = new THREE.Group();
    const fur = pick(M.fur);
    g.add(mesh(boxGeo, fur, 0.036, 0.036, 0.085, 0, 0.058, 0));
    const head = new THREE.Group();
    head.position.set(0, 0.078, 0.052);
    g.add(head);
    head.add(mesh(boxGeo, fur, 0.032, 0.03, 0.034, 0, 0, 0));
    head.add(mesh(boxGeo, fur, 0.018, 0.016, 0.022, 0, -0.005, 0.026));
    head.add(mesh(boxGeo, M.dark, 0.008, 0.006, 0.006, 0, -0.001, 0.038));
    for (const sx of [-1, 1]) head.add(mesh(boxGeo, M.dark, 0.009, 0.02, 0.012, sx * 0.014, 0.018, -0.004));
    const tail = mesh(boxGeo, fur, 0.008, 0.008, 0.038, 0, 0.074, -0.056);
    tail.rotation.x = -0.6;
    g.add(tail);
    const legs = [];
    for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
      const leg = new THREE.Group();
      leg.position.set(sx * 0.013, 0.042, sz * 0.03);
      leg.add(mesh(boxGeo, fur, 0.01, 0.042, 0.011, 0, -0.021, 0));
      g.add(leg); legs.push(leg);
    }
    return { obj: g, legs };
  }

  function makeCat() {
    const g = new THREE.Group();
    const fur = pick(M.furCat);
    g.add(mesh(boxGeo, fur, 0.028, 0.028, 0.062, 0, 0.046, 0));
    const head = new THREE.Group();
    head.position.set(0, 0.062, 0.04);
    g.add(head);
    head.add(mesh(sphGeo, fur, 0.03, 0.026, 0.028, 0, 0, 0));
    for (const sx of [-1, 1]) head.add(mesh(coneGeo, fur, 0.012, 0.016, 0.012, sx * 0.01, 0.016, 0));
    const tail = mesh(boxGeo, fur, 0.006, 0.006, 0.06, 0, 0.066, -0.05);
    tail.rotation.x = -0.9;
    g.add(tail);
    const legs = [];
    for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
      const leg = new THREE.Group();
      leg.position.set(sx * 0.01, 0.034, sz * 0.022);
      leg.add(mesh(boxGeo, fur, 0.008, 0.034, 0.009, 0, -0.017, 0));
      g.add(leg); legs.push(leg);
    }
    return { obj: g, legs };
  }

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
  let targets = { car: 0, person: 0, dog: 0, cat: 0 };

  function createAgent(type, x, z, d) {
    let made, kind = 'walker', speed, lat;
    if (type === 'car') { made = makeCar(); kind = 'car'; speed = 0.95 + Math.random() * 0.2; lat = 0.15; }
    else if (type === 'person') { made = makePerson(); speed = 0.26 + Math.random() * 0.08; lat = 0.43; }
    else if (type === 'dog') { made = makeDog(); speed = 0.42 + Math.random() * 0.1; lat = 0.4; }
    else { made = makeCat(); speed = 0.36 + Math.random() * 0.1; lat = 0.41; }
    const a = {
      type, kind, ...made, x, z, d, n: null,
      s: Math.random() * 0.9, speed, speedNow: speed, lat,
      side: type === 'car' ? 1 : (Math.random() < 0.5 ? -1 : 1), // รถชิดซ้าย
      phase: Math.random() * 10, bob: 0, dead: false,
    };
    a.n = pickNext(kind, x + d[0], z + d[1], d);
    root.add(a.obj);
    return a;
  }

  function spawn(type) {
    if (dirty) rebuildLists();
    const kind = type === 'car' ? 'car' : 'walker';
    const list = lists[kind];
    if (!list.length) return null;
    for (let tries = 0; tries < 12; tries++) {
      const [x, z] = list[(Math.random() * list.length) | 0];
      const opts = DIRS.filter(([dx, dz]) => walkable(kind, x + dx, z + dz));
      if (!opts.length) continue;
      return createAgent(type, x, z, opts[(Math.random() * opts.length) | 0]);
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
      for (let k = 0; k < 4 && arr.length < target; k++) {
        const a = spawn(type);
        if (a) arr.push(a);
      }
      for (let k = 0; k < 4 && arr.length > target; k++) removeAgent(arr.pop());
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
    a.obj.rotation.y = yaw;
  }

  // ---------- API ----------
  // ไฟจราจร: คืนตัวคูณความเร็ว (1 = ไปได้, 0 = หยุดรอที่เส้น)
  function signalFactor(a) {
    const bx = a.x + a.d[0], bz = a.z + a.d[1];
    const st = signal(bx, bz, a.d[0] !== 0 ? 'x' : 'z');
    if (!st || st === 'g') return 1;
    const line = a.kind === 'car' ? CAR_STOP : PED_STOP;
    if (a.s >= line) return 1;                       // ผ่านเส้นแล้ว
    if (st === 'y' && a.s > line - 0.1) return 1;    // ไฟเหลืองแต่ใกล้เกินจะเบรก
    const brake = a.kind === 'car' ? 0.22 : 0.1;
    return clamp01((line - a.s - 0.01) / brake);
  }

  function update(dt, night, gameSpeed, env = {}) {
    const rain = env.rain || 0;
    const lamp = Math.max(night, env.dark || 0);
    M.head.emissiveIntensity = lamp * 3;
    M.tail.emissiveIntensity = 0.15 + lamp * 1.6;

    adjustTimer += dt;
    if (adjustTimer > 0.4) { adjustTimer = 0; adjustCounts(); }

    const sdt = dt * gameSpeed;
    const wetSlow = 1 - 0.22 * rain; // ถนนลื่น รถช้าลงตอนฝนตก

    // รถเบรกเมื่อมีรถคันหน้าในเลนเดียวกัน
    const cars = agents.car;
    for (const a of cars) {
      a.speedNow = a.speed * wetSlow * signalFactor(a);
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
        if (a.kind !== 'car') a.speedNow = a.speed * signalFactor(a);
        if (sdt > 0 && !advance(a, sdt)) { removeAgent(a); removed = true; continue; }
        animate(a);
        place(a);
      }
      if (removed) agents[type] = arr.filter(a => !a.dead);
    }
  }

  return {
    // จำนวนเป้าหมายแต่ละชนิด (ผู้เรียกคำนวณจากประชากร/เวลา/อากาศ)
    setTargets({ car = 0, person = 0, dog = 0, cat = 0 }) {
      targets = { car, person, dog, cat };
    },
    counts() {
      return { car: agents.car.length, person: agents.person.length, dog: agents.dog.length, cat: agents.cat.length };
    },
    invalidate() { dirty = true; },
    update,
    clear() {
      for (const type of Object.keys(agents)) {
        for (const a of agents[type]) removeAgent(a);
        agents[type] = [];
      }
    },
  };
}
