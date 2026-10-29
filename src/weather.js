import * as THREE from 'three';

// ---------------------------------------------------------------
// สภาพอากาศ: เมฆลอยตามลม, ฝนตก, พายุฟ้าแลบ, ความเปียกของถนน
// สถานะค่อยๆ เปลี่ยนต่อเนื่อง (ไม่สลับแบบกระตุก) สุ่มเปลี่ยนเองทุก 1-3 นาที
// ---------------------------------------------------------------

export const WEATHER_LABEL = {
  clear: 'แจ่มใส',
  cloudy: 'เมฆมาก',
  rain: 'ฝนตก',
  storm: 'พายุฝนฟ้าคะนอง',
};

const KINDS = {
  clear:  { cloud: 0.12, rain: 0,   storm: 0, wind: 0.22 },
  cloudy: { cloud: 0.75, rain: 0,   storm: 0, wind: 0.4 },
  rain:   { cloud: 0.92, rain: 0.6, storm: 0, wind: 0.5 },
  storm:  { cloud: 1,    rain: 1,   storm: 1, wind: 0.9 },
};
const NEXT = {
  clear: ['clear', 'cloudy', 'cloudy', 'rain'],
  cloudy: ['clear', 'rain', 'cloudy', 'rain'],
  rain: ['cloudy', 'rain', 'storm', 'clear'],
  storm: ['rain', 'cloudy'],
};

const rnd = (a, b) => a + Math.random() * (b - a);
const sstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export function createWeather({ scene, getFocus, getCameraPos = () => ({ x: 0, y: 0, z: 0 }) }) {
  const state = {
    mode: 'auto',      // auto | clear | cloudy | rain | storm
    kind: 'clear',     // สภาพปัจจุบัน (ป้ายที่แสดง)
    cloud: 0.12,       // 0..1 ความหนาเมฆ
    rain: 0,           // 0..1 ความแรงฝน
    storm: 0,          // 0..1 พายุ
    wind: 0.22,        // 0..1 ความแรงลม
    windAng: 0.6,      // ทิศลม (เรเดียน)
    flash: 0,          // แสงฟ้าแลบ
    wet: 0,            // ความเปียกของพื้น 0..1
  };
  const goal = { ...KINDS.clear };
  let timer = 50;
  let flashTimer = 6;
  let clock = 0;

  // ---------- เมฆ ----------
  const puffGeo = new THREE.IcosahedronGeometry(1, 1);
  const cloudMat = new THREE.MeshStandardMaterial({
    color: 0xffffff, roughness: 1, metalness: 0, transparent: true, opacity: 0.93,
  });
  const CLOUDS = 20;
  const clouds = [];
  const cloudGroup = new THREE.Group();
  scene.add(cloudGroup);
  for (let i = 0; i < CLOUDS; i++) {
    const g = new THREE.Group();
    const n = 5 + Math.floor(Math.random() * 3);
    for (let k = 0; k < n; k++) {
      const m = new THREE.Mesh(puffGeo, cloudMat);
      const s = rnd(0.7, 1.4);
      m.scale.set(s * 1.5, s * 0.8, s);
      m.position.set((k - n / 2) * 1.5 + rnd(-0.4, 0.4), rnd(-0.2, 0.5), rnd(-1.2, 1.2));
      g.add(m);
    }
    const base = rnd(4.5, 8);
    g.position.set(rnd(-130, 130), rnd(26, 36), rnd(-130, 130));
    g.userData = { base, threshold: i / CLOUDS, speed: rnd(0.8, 1.25) };
    g.scale.setScalar(base);
    cloudGroup.add(g);
    clouds.push(g);
  }

  // ---------- ฝน ----------
  const MAXR = 7000;
  const RX = 90, RY = 40, RZ = 90;
  const drops = new Float32Array(MAXR * 3);
  for (let i = 0; i < MAXR; i++) {
    drops[i * 3] = rnd(-RX / 2, RX / 2);
    drops[i * 3 + 1] = rnd(0, RY);
    drops[i * 3 + 2] = rnd(-RZ / 2, RZ / 2);
  }
  const rainPos = new Float32Array(MAXR * 6);
  const rainAttr = new THREE.BufferAttribute(rainPos, 3);
  rainAttr.setUsage(THREE.DynamicDrawUsage);
  const rainGeo = new THREE.BufferGeometry();
  rainGeo.setAttribute('position', rainAttr);
  const rainMat = new THREE.LineBasicMaterial({ color: 0xbcd0e4, transparent: true, opacity: 0.4, depthWrite: false });
  const rainLines = new THREE.LineSegments(rainGeo, rainMat);
  rainLines.frustumCulled = false;
  rainLines.visible = false;
  scene.add(rainLines);
  let rainCap = 2500;

  function applyGoal(kind) {
    Object.assign(goal, KINDS[kind]);
    goal.wind = KINDS[kind].wind * rnd(0.7, 1.2);
  }

  function setMode(m) {
    state.mode = m;
    if (m === 'auto') { timer = 20; return; }
    applyGoal(m);
    state.kind = m;
  }

  function update(dt) {
    clock += dt;

    // เปลี่ยนสภาพอากาศอัตโนมัติ
    if (state.mode === 'auto') {
      timer -= dt;
      if (timer <= 0) {
        const opts = NEXT[state.kind];
        state.kind = opts[Math.floor(Math.random() * opts.length)];
        applyGoal(state.kind);
        timer = rnd(60, 160);
      }
    }

    // ค่อยๆ เข้าหาเป้าหมาย
    const kc = 1 - Math.exp(-dt * 0.35);
    state.cloud += (goal.cloud - state.cloud) * kc;
    state.rain += (goal.rain - state.rain) * (1 - Math.exp(-dt * 0.25));
    state.storm += (goal.storm - state.storm) * (1 - Math.exp(-dt * 0.3));
    state.wind += (goal.wind - state.wind) * (1 - Math.exp(-dt * 0.2));
    state.windAng += dt * 0.012 * Math.sin(clock * 0.07);

    const wetGoal = Math.min(1, state.rain * 1.6);
    state.wet += (wetGoal - state.wet) * (1 - Math.exp(-dt * (wetGoal > state.wet ? 0.35 : 0.04)));

    // ฟ้าแลบ
    state.flash *= Math.exp(-dt * 7);
    if (state.storm > 0.5) {
      flashTimer -= dt;
      if (flashTimer <= 0) { state.flash = 1; flashTimer = rnd(3, 11); }
    }

    // เมฆลอยตามลม
    const wx = Math.cos(state.windAng), wz = Math.sin(state.windAng);
    const sp = 1.2 + state.wind * 8;
    const tint = 0.78 - 0.4 * Math.min(1, state.rain + state.cloud * 0.2);
    cloudMat.color.setRGB(tint + 0.22, tint + 0.22, tint + 0.25);
    const cp = getCameraPos();
    for (const c of clouds) {
      const u = c.userData;
      c.position.x += wx * sp * u.speed * dt;
      c.position.z += wz * sp * u.speed * dt;
      if (c.position.x > 140) c.position.x -= 280;
      if (c.position.x < -140) c.position.x += 280;
      if (c.position.z > 140) c.position.z -= 280;
      if (c.position.z < -140) c.position.z += 280;
      // เมฆที่อยู่ใกล้กล้องจะค่อยๆ หายไป ไม่ให้บังภาพเมือง
      const dx = c.position.x - cp.x, dy = c.position.y - cp.y, dz = c.position.z - cp.z;
      const near = sstep(22, 60, Math.sqrt(dx * dx + dy * dy + dz * dz));
      const vis = sstep(u.threshold, u.threshold + 0.18, state.cloud) * near;
      c.visible = vis > 0.02;
      c.scale.setScalar(u.base * Math.max(vis, 0.001) * (1 + 0.25 * state.storm));
    }

    // ฝน
    const cnt = Math.floor(rainCap * Math.min(1, state.rain * 1.1));
    rainLines.visible = cnt > 20;
    if (rainLines.visible) {
      const f = getFocus();
      rainLines.position.set(f.x, 0, f.z);
      rainMat.opacity = 0.2 + 0.35 * state.rain;
      const fall = 26 + 10 * state.rain;
      const push = state.wind * 5;
      const len = 0.8 + 0.5 * state.rain;
      const tx = wx * push / fall * len, tz = wz * push / fall * len;
      for (let i = 0; i < cnt; i++) {
        const o = i * 3;
        let x = drops[o] + wx * push * dt;
        let y = drops[o + 1] - fall * dt;
        let z = drops[o + 2] + wz * push * dt;
        if (y < 0) { y += RY; x = rnd(-RX / 2, RX / 2); z = rnd(-RZ / 2, RZ / 2); }
        if (x > RX / 2) x -= RX; else if (x < -RX / 2) x += RX;
        if (z > RZ / 2) z -= RZ; else if (z < -RZ / 2) z += RZ;
        drops[o] = x; drops[o + 1] = y; drops[o + 2] = z;
        const p = i * 6;
        rainPos[p] = x; rainPos[p + 1] = y; rainPos[p + 2] = z;
        rainPos[p + 3] = x - tx; rainPos[p + 4] = y + len; rainPos[p + 5] = z - tz;
      }
      rainGeo.setDrawRange(0, cnt * 2);
      rainAttr.needsUpdate = true;
    }
  }

  return {
    state,
    update,
    setMode,
    setRainCap(n) { rainCap = Math.min(MAXR, Math.max(0, n)); },
    windVec() { return { x: Math.cos(state.windAng), z: Math.sin(state.windAng) }; },
    // ชื่อสภาพอากาศตามค่าจริงขณะนั้น
    label() {
      if (state.storm > 0.5) return WEATHER_LABEL.storm;
      if (state.rain > 0.25) return WEATHER_LABEL.rain;
      if (state.cloud > 0.5) return WEATHER_LABEL.cloudy;
      return WEATHER_LABEL.clear;
    },
    iconKey() {
      if (state.storm > 0.5) return 'storm';
      if (state.rain > 0.25) return 'rain';
      if (state.cloud > 0.5) return 'cloud';
      return 'sun';
    },
  };
}
