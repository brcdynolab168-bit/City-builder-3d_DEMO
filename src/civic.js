// ---------------------------------------------------------------
// ข้อมูลเมือง: ข่าว (เก็บเป็น key+พารามิเตอร์ เปลี่ยนภาษาแล้วข้อความเปลี่ยนตาม),
// โครงสร้างประชากร (เพศ/วัย), ความต้องการของประชาชน
// ---------------------------------------------------------------

export const PAGES = ['ข่าวเมือง 24', 'เมืองนี้ไม่หลับ', 'แฉทุกซอย', 'Drive Cam City', 'ซิ่งสุดซอย', 'ชาวบ้านรายงาน', 'CityBuzz'];
export const pickOf = arr => arr[Math.floor(Math.random() * arr.length)];

export function createNews(max = 40) {
  const items = [];
  const subs = [];
  let id = 0;
  return {
    items,
    // kind: bad | warn | info | good, parts: [[key, params], ...]
    add(kind, parts, stamp) {
      const it = { id: ++id, kind, parts, ...stamp };
      items.unshift(it);
      if (items.length > max) items.length = max;
      subs.forEach(f => f(it));
      return it;
    },
    on(f) { subs.push(f); },
    clear() { items.length = 0; },
  };
}

// สัดส่วนวัย [เด็ก 0-14, วัยรุ่น 15-24, วัยทำงาน 25-59, ผู้สูงอายุ 60+] และสัดส่วนหญิงตามประเภทที่อยู่
const AGE = {
  house: { a: [0.22, 0.13, 0.48, 0.17], f: 0.52 },
  twin:  { a: [0.19, 0.14, 0.54, 0.13], f: 0.51 },
  apt:   { a: [0.11, 0.2, 0.62, 0.07], f: 0.5 },
  condo: { a: [0.05, 0.14, 0.74, 0.07], f: 0.49 },
  tower: { a: [0.04, 0.13, 0.76, 0.07], f: 0.49 },
  sky:   { a: [0.03, 0.12, 0.79, 0.06], f: 0.49 },
};

// groups: [{ pop, kind }]
export function demographics(groups) {
  const d = { pop: 0, male: 0, female: 0, child: 0, youth: 0, adult: 0, elder: 0 };
  for (const g of groups) {
    const A = AGE[g.kind] || AGE.house;
    d.pop += g.pop;
    d.female += g.pop * A.f; d.male += g.pop * (1 - A.f);
    d.child += g.pop * A.a[0]; d.youth += g.pop * A.a[1]; d.adult += g.pop * A.a[2]; d.elder += g.pop * A.a[3];
  }
  for (const k of Object.keys(d)) d[k] = Math.round(d[k]);
  d.workers = Math.round(d.adult + d.youth * 0.4 + d.elder * 0.15);
  return d;
}

const clamp = (v, a = 0, b = 100) => Math.max(a, Math.min(b, v));

// inp: { pop, powerUse, powerCap, waterUse, waterCap, jobs, workers, hospitals, schools, universities, police, fire,
//        parks, roads, liveCars, kids, green (สัดส่วนไฟฟ้าสะอาด 0..1), chargers, evCars, shops (งานพาณิชย์) }
export function needs(inp) {
  const p = Math.max(1, inp.pop);
  const has = inp.pop > 0;
  const list = [
    ['power', inp.powerUse <= 0 ? 100 : clamp(100 * inp.powerCap / inp.powerUse)],
    ['water', inp.waterUse <= 0 ? 100 : clamp(100 * inp.waterCap / inp.waterUse)],
    ['jobs', !has ? 100 : clamp(100 * inp.jobs / Math.max(1, inp.workers))],
    ['health', !has ? 100 : clamp(15 + 100 * inp.hospitals * 3500 / p)],
    ['edu', !has ? 100 : clamp(15 + 100 * (inp.schools * 450 + inp.universities * 1500) / Math.max(50, inp.kids))],
    ['safety', !has ? 100 : clamp(15 + 100 * inp.police * 2500 / p)],
    ['fire', !has ? 100 : clamp(15 + 100 * inp.fire * 3000 / p)],
    ['leisure', !has ? 100 : clamp(10 + 100 * inp.parks * 150 / p)],
    // เมืองใหญ่ขึ้นคนเริ่มอยากได้อากาศสะอาด (ไฟฟ้าจากพลังงานสะอาด) และที่ชาร์จรถ EV ที่มีอยู่
    ['clean', inp.pop < 300 ? 100 : clamp(35 + 65 * (inp.green || 0) / 0.4)],
    ['charge', !inp.evCars ? 100 : clamp(100 * (inp.chargers || 0) * 8 / inp.evCars)],
    ['shops', !has ? 100 : clamp(100 * (inp.shops || 0) / Math.max(1, p * 0.3))],
    ['traffic', !inp.roads ? 100 : clamp(100 - 100 * Math.max(0, inp.liveCars / (inp.roads * 0.45) - 0.45) / 0.55 + 6 * (inp.transit || 0))],
  ].map(([k, v]) => ({ k, v: Math.round(v) }));
  const mood = has ? Math.round(list.reduce((a, n) => a + n.v, 0) / list.length) : 100;
  const asks = [...list].sort((a, b) => a.v - b.v).filter(n => n.v < 80).slice(0, 3).map(n => n.k);
  return { list, mood, asks };
}
