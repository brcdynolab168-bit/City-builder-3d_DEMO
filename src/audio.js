// ---------------------------------------------------------------
// เสียงในเกม สร้างด้วย WebAudio ทั้งหมด (ไม่ต้องมีไฟล์เสียง)
//   พื้นหลัง: ลม ฝน น้ำ รถ ผู้คน เสียงเมือง จิ้งหรีดกลางคืน
//   เหตุการณ์: นก หมาเห่า แมวร้อง แตรรถ ไซเรนรถพยาบาล ฟ้าร้อง ระฆังโรงเรียน
//   ยิ่งซูมเข้าใกล้ ("prox" 0..1) เสียงรายละเอียดยิ่งดังและชัด ซูมออกไกลจะเบาลงและอู้อี้
//   พร้อมเอฟเฟกต์กดปุ่ม/วางของ/รื้อ และดนตรีเบาๆ สร้างสดตามเวลากลางวัน-กลางคืน
// ---------------------------------------------------------------

const rnd = Math.random;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function createAudio() {
  let ctx = null;
  let master, sfxG, musG, ambG, ambLP;
  const L = {};               // เลเยอร์เสียงต่อเนื่อง
  const vol = { master: 0.8, sfx: 0.8, music: 0.35, mute: false };
  const timers = { bird: 2, dog: 8, cat: 12, horn: 6, siren: 40, music: 1, cricket: 0.2, bell: 0 };
  let lastBellDay = -1;
  let musicStep = 0;

  // ---------- สร้างบัฟเฟอร์สัญญาณรบกวน ----------
  function noiseBuffer(kind) {
    const len = ctx.sampleRate * 3;
    const b = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = b.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = rnd() * 2 - 1;
      if (kind === 'brown') { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
      else d[i] = w;
    }
    return b;
  }
  function layer(kind, filters, gain0 = 0) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(kind);
    src.loop = true;
    let node = src;
    const fs = filters.map(f => {
      const n = ctx.createBiquadFilter();
      n.type = f[0]; n.frequency.value = f[1]; if (f[2]) n.Q.value = f[2];
      node.connect(n); node = n;
      return n;
    });
    const g = ctx.createGain();
    g.gain.value = gain0;
    node.connect(g);
    g.connect(ambLP);
    src.start(0, rnd() * 2);
    return { src, filters: fs, g };
  }
  function lfo(param, rate, depth, base) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.value = rate; g.gain.value = depth;
    o.connect(g); g.connect(param);
    param.value = base;
    o.start();
  }

  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain(); master.connect(ctx.destination);
    sfxG = ctx.createGain(); sfxG.connect(master);
    musG = ctx.createGain(); musG.connect(master);
    ambG = ctx.createGain(); ambG.connect(master);
    ambLP = ctx.createBiquadFilter(); ambLP.type = 'lowpass'; ambLP.frequency.value = 4000;
    ambLP.connect(ambG);

    L.wind = layer('white', [['lowpass', 500, 0.7], ['bandpass', 400, 0.5]]);
    lfo(L.wind.filters[1].frequency, 0.11, 160, 420);
    L.rain = layer('white', [['highpass', 1500], ['lowpass', 9000]]);
    L.water = layer('white', [['bandpass', 600, 0.8]]);
    lfo(L.water.filters[0].frequency, 0.35, 220, 650);
    L.traffic = layer('brown', [['lowpass', 380]]);
    L.crowd = layer('white', [['bandpass', 900, 1.2]]);
    L.hum = layer('brown', [['lowpass', 160]]);
    L.cricket = (() => {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = 4700;
      const am = ctx.createGain(); am.gain.value = 0;
      const mod = ctx.createOscillator(); mod.type = 'square'; mod.frequency.value = 14;
      const mg = ctx.createGain(); mg.gain.value = 0.5;
      mod.connect(mg); mg.connect(am.gain);
      const g = ctx.createGain(); g.gain.value = 0;
      o.connect(am); am.connect(g); g.connect(ambLP);
      o.start(); mod.start();
      return { g };
    })();
    applyVolumes();
  }

  function applyVolumes() {
    if (!ctx) return;
    const m = vol.mute ? 0 : vol.master;
    master.gain.setTargetAtTime(m, ctx.currentTime, 0.05);
    sfxG.gain.value = vol.sfx;
    ambG.gain.value = vol.sfx;
    musG.gain.value = vol.music * 0.6;
  }

  const smooth = (param, v, tc = 0.35) => param.setTargetAtTime(v, ctx.currentTime, tc);

  // ---------- เสียงเหตุการณ์ ----------
  function pan(g, p) {
    if (!ctx.createStereoPanner) return g;
    const s = ctx.createStereoPanner(); s.pan.value = p;
    g.connect(s); return s;
  }
  function chirp(v) {
    const t = ctx.currentTime;
    const n = 1 + Math.floor(rnd() * 3);
    const f0 = 2100 + rnd() * 1900, p = rnd() * 2 - 1;
    for (let i = 0; i < n; i++) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      const s = t + i * 0.16;
      o.type = 'sine';
      o.frequency.setValueAtTime(f0, s);
      o.frequency.exponentialRampToValueAtTime(f0 * (1.25 + rnd() * 0.4), s + 0.07);
      o.frequency.exponentialRampToValueAtTime(f0 * 0.92, s + 0.13);
      g.gain.setValueAtTime(0.0001, s);
      g.gain.linearRampToValueAtTime(v, s + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, s + 0.15);
      o.connect(g); pan(g, p).connect(ambLP);
      o.start(s); o.stop(s + 0.2);
    }
  }
  function bark(v) {
    const t = ctx.currentTime;
    const times = rnd() < 0.5 ? [0, 0.28] : [0];
    for (const dt of times) {
      const s = t + dt;
      const o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(260, s);
      o.frequency.exponentialRampToValueAtTime(130, s + 0.16);
      f.type = 'bandpass'; f.frequency.value = 700; f.Q.value = 1.2;
      g.gain.setValueAtTime(0.0001, s);
      g.gain.linearRampToValueAtTime(v, s + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, s + 0.2);
      o.connect(f); f.connect(g); pan(g, rnd() * 2 - 1).connect(ambLP);
      o.start(s); o.stop(s + 0.25);
    }
  }
  // หมาหอนตอนกลางคืน: เสียงยาวไล่ระดับขึ้นแล้วลง มีสั่น แล้วมีหมาตัวอื่นหอนตอบจากไกลๆ
  function howl(v, far = 1) {
    const t0 = ctx.currentTime + 0.02;
    const dur = 1.8 + rnd() * 1.4, base = 280 + rnd() * 120;
    const o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
    const vib = ctx.createOscillator(), vg = ctx.createGain();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(base * 0.8, t0);
    o.frequency.exponentialRampToValueAtTime(base * 1.55, t0 + dur * 0.35);
    o.frequency.setValueAtTime(base * 1.55, t0 + dur * 0.55);
    o.frequency.exponentialRampToValueAtTime(base * 1.05, t0 + dur);
    vib.frequency.value = 5.5; vg.gain.value = 9;
    vib.connect(vg); vg.connect(o.frequency);
    f.type = 'bandpass'; f.frequency.value = 650 + 250 * (1 - far); f.Q.value = 2.2;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(v, t0 + 0.35);
    g.gain.setValueAtTime(v, t0 + dur * 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(f); f.connect(g); pan(g, rnd() * 2 - 1).connect(ambLP);
    o.start(t0); vib.start(t0); o.stop(t0 + dur + 0.05); vib.stop(t0 + dur + 0.05);
    return dur;
  }
  function meow(v) {
    const t = ctx.currentTime;
    const o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
    o.type = 'triangle';
    o.frequency.setValueAtTime(520, t);
    o.frequency.linearRampToValueAtTime(950, t + 0.18);
    o.frequency.linearRampToValueAtTime(560, t + 0.55);
    f.type = 'bandpass'; f.frequency.value = 1400; f.Q.value = 1.5;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(v, t + 0.08);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
    o.connect(f); f.connect(g); pan(g, rnd() * 2 - 1).connect(ambLP);
    o.start(t); o.stop(t + 0.65);
  }
  function horn(v) {
    const t = ctx.currentTime;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1800;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(v, t + 0.02);
    g.gain.setValueAtTime(v, t + 0.22);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    for (const fr of [420, 530]) {
      const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = fr * (0.97 + rnd() * 0.06);
      o.connect(f); o.start(t); o.stop(t + 0.32);
    }
    f.connect(g); pan(g, rnd() * 2 - 1).connect(ambLP);
  }
  function siren(v) {
    const t = ctx.currentTime;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine';
    for (let i = 0; i < 10; i++) o.frequency.setValueAtTime(i % 2 ? 960 : 700, t + i * 0.55);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(v, t + 0.8);
    g.gain.setValueAtTime(v, t + 4.2);
    g.gain.linearRampToValueAtTime(0.0001, t + 5.5);
    o.connect(g); pan(g, rnd() * 2 - 1).connect(ambLP);
    o.start(t); o.stop(t + 5.6);
  }
  function bell(v) {
    const t = ctx.currentTime;
    for (let i = 0; i < 5; i++) {
      const s = t + i * 0.55;
      for (const fr of [880, 1320, 1780]) {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sine'; o.frequency.value = fr;
        g.gain.setValueAtTime(v / (fr / 880), s);
        g.gain.exponentialRampToValueAtTime(0.0001, s + 0.5);
        o.connect(g); g.connect(ambLP);
        o.start(s); o.stop(s + 0.55);
      }
    }
  }
  function thunder(prox = 0.5) {
    if (!ctx) return;
    const delay = 0.25 + rnd() * 1.6;
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer('brown');
    const f = ctx.createBiquadFilter(); f.type = 'lowpass';
    f.frequency.setValueAtTime(1100, t);
    f.frequency.exponentialRampToValueAtTime(90, t + 3.5);
    const g = ctx.createGain();
    const v = 0.9 * (0.5 + 0.5 * prox);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(v, t + 0.08);
    g.gain.setTargetAtTime(0.0001, t + 0.3, 1.0);
    src.connect(f); f.connect(g); g.connect(ambG);
    src.start(t, rnd()); src.stop(t + 4.5);
  }

  // ---------- เอฟเฟกต์ UI ----------
  function tone(freq, dur, type = 'sine', v = 0.2, slideTo = 0, when = 0) {
    const t = ctx.currentTime + when;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(v, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(sfxG);
    o.start(t); o.stop(t + dur + 0.02);
  }
  function noiseHit(dur, f0, f1, v) {
    const t = ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = noiseBuffer('white');
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 0.8;
    f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(sfxG);
    src.start(t, rnd()); src.stop(t + dur + 0.02);
  }
  const lastSfx = {};
  function sfx(name) {
    if (!ctx || vol.mute) return;
    const nowT = ctx.currentTime;
    if (nowT - (lastSfx[name] || 0) < 0.07) return;
    lastSfx[name] = nowT;
    if (ctx.state === 'suspended') ctx.resume();
    switch (name) {
      case 'click': tone(660, 0.07, 'triangle', 0.12); break;
      case 'select': tone(520, 0.06, 'triangle', 0.1); tone(780, 0.08, 'triangle', 0.08, 0, 0.05); break;
      case 'place': tone(170, 0.14, 'sine', 0.35, 90); noiseHit(0.08, 2500, 800, 0.12); break;
      case 'road': noiseHit(0.1, 900, 400, 0.12); tone(120, 0.08, 'sine', 0.2, 80); break;
      case 'bulldoze': noiseHit(0.35, 1800, 250, 0.35); tone(90, 0.3, 'sawtooth', 0.12, 40); break;
      case 'error': tone(150, 0.2, 'square', 0.1, 110); break;
      case 'money': tone(880, 0.1, 'sine', 0.12); tone(1320, 0.18, 'sine', 0.12, 0, 0.08); break;
      case 'crash': noiseHit(0.5, 3000, 300, 0.5); tone(70, 0.5, 'sawtooth', 0.3, 30); tone(1800, 0.25, 'square', 0.08, 600, 0.02); tone(1250, 0.4, 'triangle', 0.06, 300, 0.1); break;
      case 'menu': tone(440, 0.09, 'triangle', 0.12); tone(660, 0.12, 'triangle', 0.1, 0, 0.07); break;
    }
  }

  // ---------- ดนตรีสร้างสด ----------
  const SC_DAY = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21];     // เพนทาโทนิกเมเจอร์
  const SC_NIGHT = [0, 3, 5, 7, 10, 12, 15, 17, 19, 22];  // ไมเนอร์
  function musicNote(night) {
    const sc = night > 0.5 ? SC_NIGHT : SC_DAY;
    const root = night > 0.5 ? 196 : 220;
    const step = sc[Math.floor(rnd() * sc.length)];
    const f = root * Math.pow(2, step / 12);
    const t = ctx.currentTime;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'triangle'; o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.1, t + 0.4);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 3.5);
    o.connect(g); g.connect(musG);
    o.start(t); o.stop(t + 3.6);
    if (musicStep++ % 4 === 0) {                  // คอร์ดพื้นเบาๆ
      for (const k of [0, 7, 12]) {
        const p = ctx.createOscillator(), pg = ctx.createGain();
        p.type = 'sine'; p.frequency.value = root / 2 * Math.pow(2, (k + (night > 0.5 ? -2 : 0)) / 12);
        pg.gain.setValueAtTime(0.0001, t);
        pg.gain.linearRampToValueAtTime(0.06, t + 2);
        pg.gain.exponentialRampToValueAtTime(0.0001, t + 7);
        p.connect(pg); pg.connect(musG);
        p.start(t); p.stop(t + 7.2);
      }
    }
  }

  // ---------- อัปเดตทุกเฟรม (เรียกถี่ๆ ได้ ภายในจำกัดความถี่เอง) ----------
  let acc = 0;
  // env: { prox, wind, rain, cars, people, dogs, cats, night, waterNear, pop, hospital, school, tod, day, lightning }
  function update(dt, env) {
    if (!ctx || ctx.state !== 'running') return;
    acc += dt;
    const prox = env.prox;
    const near = prox * prox;
    // ซูมไกล = อู้อี้ ซูมใกล้ = ชัด
    smooth(ambLP.frequency, 700 + 15000 * Math.pow(prox, 1.6), 0.25);

    if (acc >= 0.1) {
      const step = acc; acc = 0;
      const day = 1 - env.night;
      smooth(L.wind.g.gain, (0.03 + 0.38 * env.wind + 0.12 * env.rain) * (0.55 + 0.45 * (1 - prox * 0.5)));
      smooth(L.wind.filters[0].frequency, 300 + 700 * env.wind);
      smooth(L.rain.g.gain, env.rain * (0.18 + 0.5 * prox));
      smooth(L.water.g.gain, env.waterNear * (0.04 + 0.4 * near) * (1 - 0.3 * env.rain));
      const carK = clamp(env.cars / 40, 0, 1);
      smooth(L.traffic.g.gain, carK * (0.05 + 0.5 * near));
      smooth(L.traffic.filters[0].frequency, 220 + 500 * prox);
      smooth(L.crowd.g.gain, clamp(env.people / 60, 0, 1) * 0.22 * near * (1 - 0.5 * env.rain));
      smooth(L.hum.g.gain, clamp(env.pop / 1500, 0, 1) * (0.1 + 0.18 * (1 - prox)));
      smooth(L.cricket.g.gain, env.night * (1 - env.rain) * 0.035 * (0.3 + 0.7 * near));

      // นก (กลางวัน ไม่ตกหนัก)
      timers.bird -= step;
      if (timers.bird <= 0) {
        const act = day * (1 - env.rain * 1.4);
        timers.bird = (1.5 + rnd() * 4.5) / Math.max(0.15, act);
        if (act > 0.25 && prox > 0.08) chirp(0.05 + 0.2 * near);
      }
      // หมา แมว
      timers.dog -= step;
      if (timers.dog <= 0) {
        timers.dog = 7 + rnd() * 16;
        if (env.dogs > 0 && prox > 0.45 && env.rain < 0.6) bark(0.08 + 0.22 * near);
      }
      // หมาหอน (ดึกๆ ยิ่งช่วงเที่ยงคืนยิ่งบ่อย) ตอบกันเป็นทอดๆ
      timers.howl = (timers.howl ?? 8) - step;
      if (timers.howl <= 0) {
        const mid = Math.exp(-Math.pow(((env.tod + 0.5) % 1 - 0.5) / 0.09, 2)); // 1 = เที่ยงคืนตรง
        timers.howl = (14 + rnd() * 26) / (0.5 + mid);
        if (env.dogs > 0 && env.night > 0.75 && prox > 0.3 && env.rain < 0.5) {
          const d = howl(0.05 + 0.14 * near, 0.5 + 0.5 * prox);
          if (rnd() < 0.7) setTimeout(() => { if (ctx.state === 'running') howl(0.03 + 0.07 * near, 0.2); }, (d * 0.6 + 0.5) * 1000);
        }
      }
      timers.cat -= step;
      if (timers.cat <= 0) {
        timers.cat = 12 + rnd() * 25;
        if (env.cats > 0 && prox > 0.55 && env.rain < 0.6) meow(0.06 + 0.16 * near);
      }
      // แตรรถ
      timers.horn -= step;
      if (timers.horn <= 0) {
        timers.horn = 6 + rnd() * 14;
        if (env.cars > 6 && prox > 0.4) horn(0.03 + 0.1 * near);
      }
      // รถพยาบาลที่กำลังไปช่วยอุบัติเหตุ ไซเรนดังต่อเนื่อง
      timers.amb = (timers.amb ?? 0) - step;
      if (env.ambulance && timers.amb <= 0 && prox > 0.2) { timers.amb = 5.4; siren(0.05 + 0.2 * near); }
      // ไซเรนรถพยาบาล
      timers.siren -= step;
      if (timers.siren <= 0) {
        timers.siren = 45 + rnd() * 60;
        if (env.hospital && prox > 0.3) siren(0.03 + 0.1 * near);
      }
      // ระฆังโรงเรียน 07:45
      if (env.school && env.tod > 0.322 && env.tod < 0.33 && lastBellDay !== env.day && prox > 0.25) {
        lastBellDay = env.day; bell(0.03 + 0.08 * near);
      }
      // ฟ้าร้อง
      if (env.lightning) thunder(prox);
    }

    // ดนตรี
    timers.music -= dt;
    if (timers.music <= 0 && vol.music > 0.01 && !vol.mute) {
      timers.music = 2.2 + rnd() * 3.2;
      musicNote(env.night);
    }
  }

  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    if (document.hidden) ctx.suspend(); else ctx.resume();
  });

  return {
    init, update, sfx, thunder,
    setVolume(k, v) { vol[k] = v; applyVolumes(); },
    setMute(m) { vol.mute = m; applyVolumes(); },
    get vol() { return vol; },
    get ready() { return !!ctx; },
  };
}
