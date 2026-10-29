// ---------------------------------------------------------------
// ระดับเมือง: เลื่อนขั้นเมื่อเมืองโตพอ เวลาผ่านไปพอ (วันในเกม) ประชาชนพอใจ และมีบริการที่จำเป็น
// เลื่อนแล้วไม่ลดลง ระดับที่สูงขึ้นปลดล็อกอาคาร/ถนน/โรงไฟฟ้าใหม่ (ดู req.lv ใน VARIANTS)
// ---------------------------------------------------------------

//  need: เงื่อนไขบริการ (ctx.has[k] ต้องเป็นจริง)
//    util = ไฟและน้ำพอใช้, school, hospital, police, fire, transit = มีรถเมล์หรือรถไฟฟ้า,
//    bu = มหาวิทยาลัย, metro = รถไฟฟ้า, freight = สถานีขนส่งสินค้า, green = ไฟฟ้าจากพลังงานสะอาด ≥ 30%
export const LEVELS = [
  { n: 1, key: 'village' },
  { n: 2, key: 'town',    pop: 150,  day: 3,  mood: 0,  need: ['util'] },
  { n: 3, key: 'city',    pop: 600,  day: 8,  mood: 50, need: ['util', 'school'] },
  { n: 4, key: 'bigcity', pop: 1500, day: 15, mood: 55, need: ['hospital', 'police', 'fire'] },
  { n: 5, key: 'metro',   pop: 3000, day: 25, mood: 60, need: ['transit', 'bu'] },
  { n: 6, key: 'mega',    pop: 6000, day: 40, mood: 65, need: ['metro', 'freight', 'green'] },
];
export const MAX_LEVEL = LEVELS.length;

// รายการเงื่อนไขของระดับ L: [{ k, ok, cur, need }] (k = pop | day | mood | ชื่อบริการ)
export function levelChecks(L, ctx) {
  if (!L || !L.pop) return [];
  const out = [
    { k: 'pop', ok: ctx.pop >= L.pop, cur: ctx.pop, need: L.pop },
    { k: 'day', ok: ctx.day >= L.day, cur: ctx.day, need: L.day },
  ];
  if (L.mood) out.push({ k: 'mood', ok: ctx.mood >= L.mood, cur: ctx.mood, need: L.mood });
  for (const k of L.need) out.push({ k, ok: !!ctx.has[k] });
  return out;
}

// ระดับสูงสุดที่ผ่านเงื่อนไขได้ตอนนี้ (ไล่ทีละขั้น ข้ามขั้นไม่ได้)
export function reachableLevel(from, ctx) {
  let lv = Math.max(1, from);
  while (lv < MAX_LEVEL && levelChecks(LEVELS[lv], ctx).every(c => c.ok)) lv++;
  return lv;
}

// เซฟเก่าที่ยังไม่มีระดับ: ให้ระดับตามจำนวนประชากรอย่างเดียว ไม่ล็อกสิ่งที่ผู้เล่นเคยสร้างได้
export const levelFromPop = pop => LEVELS.reduce((lv, L) => (L.pop && pop >= L.pop ? L.n : lv), 1);
