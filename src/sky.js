import * as THREE from 'three';

// ---------------------------------------------------------------
// ท้องฟ้า: โดมไล่สีตามช่วงเวลา + ดวงอาทิตย์ + ดวงจันทร์ + ดาว
// ช่วงเวลา: เช้า / สาย / เที่ยง / บ่าย / เย็น / มืด / กลางคืน / เที่ยงคืน / ก่อนรุ่งสาง
// ---------------------------------------------------------------

// คีย์เฟรมสีฟ้า [ชั่วโมง, สีเหนือหัว, สีขอบฟ้า]
const KEYS = [
  [0, 0x050a1c, 0x0b1530],
  [3, 0x070d22, 0x121c3a],
  [4.8, 0x141d48, 0x2c3560],
  [5.6, 0x3a4f8c, 0xe0805a],
  [6.2, 0x5073b8, 0xffa66e],
  [7.2, 0x6f9bd6, 0xffd5a6],
  [9, 0x5d9be6, 0xc2dcf5],
  [12, 0x3f86e8, 0xa8d0f5],
  [15, 0x4a8fe6, 0xb4d6f5],
  [16.8, 0x5f8fd6, 0xf2d6a6],
  [17.8, 0x5a63a8, 0xff9358],
  [18.4, 0x343c78, 0xd0605a],
  [19.2, 0x1a2250, 0x5a4470],
  [20.5, 0x0b1232, 0x1c2244],
  [24, 0x050a1c, 0x0b1530],
];

export function periodKey(h) {
  if (h >= 23 || h < 2) return 'midnight';
  if (h < 5) return 'predawn';
  if (h < 9) return 'morning';
  if (h < 11) return 'late';
  if (h < 13) return 'noon';
  if (h < 16.5) return 'afternoon';
  if (h < 18.5) return 'evening';
  if (h < 20) return 'dusk';
  return 'night';
}

const cA = new THREE.Color(), cB = new THREE.Color();
export function skyColors(h, zen, hor) {
  let i = 0;
  while (i < KEYS.length - 2 && h >= KEYS[i + 1][0]) i++;
  const a = KEYS[i], b = KEYS[i + 1];
  const k = THREE.MathUtils.clamp((h - a[0]) / (b[0] - a[0]), 0, 1);
  const s = k * k * (3 - 2 * k);
  zen.set(a[1]).lerp(cA.set(b[1]), s);
  hor.set(a[2]).lerp(cB.set(b[2]), s);
}

const VERT = /* glsl */`
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    vec4 p = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * p;
  }`;
const FRAG = /* glsl */`
  varying vec3 vDir;
  uniform vec3 uZen; uniform vec3 uHor; uniform vec3 uSunDir; uniform vec3 uSunCol; uniform float uSunAmt;
  uniform vec3 uGround;
  void main() {
    vec3 d = normalize(vDir);
    float h = clamp(d.y, -1.0, 1.0);
    vec3 col = mix(uHor, uZen, pow(clamp(h, 0.0, 1.0), 0.55));
    col = mix(col, uGround, smoothstep(0.0, -0.25, h));
    float c = max(dot(d, normalize(uSunDir)), 0.0);
    col += uSunCol * (pow(c, 6.0) * 0.18 + pow(c, 48.0) * 0.35) * uSunAmt;
    col += uSunCol * smoothstep(0.9985, 0.9997, c) * 4.0 * uSunAmt;
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

export function createSky(scene) {
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(300, 32, 16),
    new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: {
        uZen: { value: new THREE.Color(0x3f86e8) }, uHor: { value: new THREE.Color(0xa8d0f5) },
        uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunCol: { value: new THREE.Color(1, 0.9, 0.7) }, uSunAmt: { value: 1 },
        uGround: { value: new THREE.Color(0x8fa890) },
      },
    })
  );
  dome.renderOrder = -10;
  dome.frustumCulled = false;
  scene.add(dome);

  // ดวงจันทร์
  const moon = new THREE.Mesh(new THREE.SphereGeometry(5, 24, 16), new THREE.MeshBasicMaterial({ color: 0xf1ede0, fog: false, toneMapped: false }));
  moon.frustumCulled = false;
  scene.add(moon);
  const halo = new THREE.Mesh(new THREE.SphereGeometry(9, 24, 16), new THREE.MeshBasicMaterial({ color: 0x9fb6e8, fog: false, transparent: true, opacity: 0.12, depthWrite: false, toneMapped: false }));
  halo.frustumCulled = false;
  moon.add(halo);

  // ดาว
  const N_STARS = 900;
  const pos = new Float32Array(N_STARS * 3);
  for (let i = 0; i < N_STARS; i++) {
    const u = Math.random(), v = Math.random() * 0.95 + 0.02;
    const th = u * Math.PI * 2, ph = Math.acos(1 - v);
    const r = 280;
    pos[i * 3] = r * Math.sin(ph) * Math.cos(th); pos[i * 3 + 1] = r * Math.cos(ph); pos[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
  }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 1.8, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false, toneMapped: false });
  const stars = new THREE.Points(sg, starMat);
  stars.frustumCulled = false;
  scene.add(stars);

  const zen = new THREE.Color(), hor = new THREE.Color();
  const sunDir = new THREE.Vector3(), moonDir = new THREE.Vector3();
  const tmp = new THREE.Color(), grey = new THREE.Color();

  // h = ชั่วโมง, elev = ความสูงดวงอาทิตย์ (-1..1), W = สภาพอากาศ, focus = จุดที่ท้องฟ้าตามไป, sunWarm = สีดวงอาทิตย์
  function update(h, elev, ang, W, focus, sunColor) {
    skyColors(h, zen, hor);
    // เมฆ/ฝนทำให้ฟ้าเทา
    const dayK = THREE.MathUtils.smoothstep(elev, -0.12, 0.3);
    grey.setRGB(0.45, 0.48, 0.52).multiplyScalar(0.06 + 0.94 * dayK);
    const g = Math.min(0.88, W.cloud * 0.72 + W.rain * 0.25);
    zen.lerp(grey, g); hor.lerp(grey, g * 0.9);
    if (W.flash > 0) { tmp.set(0xdfe8ff); zen.lerp(tmp, W.flash * 0.5); hor.lerp(tmp, W.flash * 0.5); }
    const u = dome.material.uniforms;
    u.uZen.value.copy(zen); u.uHor.value.copy(hor);
    u.uGround.value.copy(hor).multiplyScalar(0.7);
    sunDir.set(Math.cos(ang), elev, 0.4).normalize();
    u.uSunDir.value.copy(sunDir);
    u.uSunCol.value.copy(sunColor);
    u.uSunAmt.value = THREE.MathUtils.smoothstep(elev, -0.08, 0.05) * (1 - 0.85 * W.cloud) * (1 - 0.6 * W.rain);
    dome.position.copy(focus);

    // ดวงจันทร์อยู่ตรงข้ามดวงอาทิตย์
    moonDir.set(-sunDir.x, -sunDir.y, -sunDir.z);
    moon.position.copy(focus).addScaledVector(moonDir, 250);
    const moonUp = THREE.MathUtils.smoothstep(moonDir.y, -0.05, 0.12);
    moon.visible = moonUp > 0.01 && W.cloud < 0.9;
    moon.material.opacity = 1;
    halo.material.opacity = 0.12 * (1 - W.cloud);

    const night = 1 - dayK;
    starMat.opacity = Math.pow(night, 1.6) * (1 - W.cloud) * (1 - W.rain);
    stars.visible = starMat.opacity > 0.01;
    stars.position.copy(focus);
    stars.rotation.y = h / 24 * Math.PI * 2;
    return { horizon: hor, zenith: zen, moonDir, sunDir };
  }
  return { update, dome };
}
