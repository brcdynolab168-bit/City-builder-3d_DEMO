// ---------------------------------------------------------------
// ภารกิจของเมือง: เป้าหมายให้ผู้เล่นทำ สำเร็จแล้วได้เงินและ XP (เก็บใน state.quests.done)
// ctx = { pop, level, money, day, mood, vc(จำนวนอาคารต่อแบบ เช่น 'farm:fish'), cc(civicCounts), cnt(ตัวนับสะสม), s(computeStats) }
// prog คืน [ค่าปัจจุบัน, เป้าหมาย]
// ---------------------------------------------------------------
const n = (v, goal) => [Math.min(v, goal), goal];
const have = (c, k) => c.vc[k] || 0;
const built = k => c => n(have(c, k), 1);

export const QUESTS = [
  // --- เริ่มต้น ---
  { id: 'pop100',   reward: { money: 1500, xp: 80 },   prog: c => n(c.pop, 100) },
  { id: 'fish',     reward: { money: 1800, xp: 120 },  prog: built('farm:fish') },
  { id: 'cricket',  reward: { money: 1200, xp: 100 },  prog: built('farm:cricket') },
  { id: 'pop500',   reward: { money: 4000, xp: 200 },  prog: c => n(c.pop, 500) },
  { id: 'parks10',  reward: { money: 2500, xp: 140 },  prog: c => n(c.cc.parks, 10) },
  { id: 'farms4',   reward: { money: 3000, xp: 160 },  prog: c => n(c.cc.farm, 4) },
  { id: 'worship',  reward: { money: 3000, xp: 150 },  prog: c => n(c.cc.temple + c.cc.mosque + c.cc.church, 1) },
  { id: 'solar3',   reward: { money: 3500, xp: 180 },  prog: c => n(have(c, 'power:solar'), 3) },
  { id: 'bank',     reward: { money: 4000, xp: 200 },  prog: built('com:bank') },
  { id: 'lv3',      reward: { money: 5000, xp: 250 },  prog: c => n(c.level, 3) },
  { id: 'rich',     reward: { money: 5000, xp: 300 },  prog: c => n(Math.round(c.money), 50000) },
  // --- กลางเกม ---
  { id: 'services', reward: { money: 6000, xp: 300 },  prog: c => n(['school', 'hospital', 'police', 'fire'].filter(k => have(c, 'service:' + k) > 0).length, 4) },
  { id: 'hospp',    reward: { money: 6000, xp: 300 },  prog: built('service:hospital_p') },
  { id: 'concert',  reward: { money: 6000, xp: 300 },  prog: built('service:concert') },
  { id: 'farms8',   reward: { money: 6000, xp: 300 },  prog: c => n(c.cc.farm, 8) },
  { id: 'export',   reward: { money: 7000, xp: 350 },  prog: c => n(Math.round(c.s.trade?.expValue || 0), 500) },
  { id: 'parks30',  reward: { money: 7000, xp: 350 },  prog: c => n(c.cc.parks, 30) },
  { id: 'freight',  reward: { money: 5000, xp: 250 },  prog: built('service:freight') },
  { id: 'transit',  reward: { money: 8000, xp: 400 },  prog: c => n(Math.round(100 * c.s.transitShare), 25) },
  { id: 'uni',      reward: { money: 8000, xp: 400 },  prog: built('service:bu') },
  { id: 'pop1500',  reward: { money: 12000, xp: 600 }, prog: c => n(c.pop, 1500) },
  { id: 'metro',    reward: { money: 10000, xp: 500 }, prog: built('service:metro') },
  { id: 'concerts3', reward: { money: 10000, xp: 500 }, prog: c => n(c.cnt.concerts || 0, 3) },
  { id: 'green50',  reward: { money: 9000, xp: 450 },  prog: c => n(Math.round(100 * c.s.green), 50) },
  // --- ปลายเกม ---
  { id: 'lv4',      reward: { money: 15000, xp: 800 }, prog: c => n(c.level, 4) },
  { id: 'pop3000',  reward: { money: 20000, xp: 900 }, prog: c => n(c.pop, 3000) },
  { id: 'stadium',  reward: { money: 12000, xp: 600 }, prog: built('service:stadium') },
  { id: 'happy80',  reward: { money: 12000, xp: 600 }, prog: c => n(Math.round(c.mood), 80) },
  { id: 'carcut40', reward: { money: 15000, xp: 700 }, prog: c => n(Math.round(100 * c.s.carCut), 40) },
  { id: 'port',     reward: { money: 15000, xp: 800 }, prog: built('service:port') },
  { id: 'rich200',  reward: { money: 20000, xp: 1000 }, prog: c => n(Math.round(c.money), 200000) },
  { id: 'pop5000',  reward: { money: 35000, xp: 1500 }, prog: c => n(c.pop, 5000) },
  { id: 'lv5',      reward: { money: 40000, xp: 2500 }, prog: c => n(c.level, 5) },
  { id: 'airport',  reward: { money: 30000, xp: 1500 }, prog: built('service:airport') },
  // --- เฉพาะแมปเชียงใหม่ ---
  { id: 'cmAttract', map: 'chiangmai', reward: { money: 12000, xp: 700 }, prog: c => n(['service:doisuthep', 'service:nightbazaar', 'service:tapae'].filter(k => have(c, k) > 0).length, 3) },
  { id: 'cmFest',    map: 'chiangmai', reward: { money: 15000, xp: 800 }, prog: c => n(c.cnt.fests || 0, 1) },
  { id: 'pop10000', reward: { money: 80000, xp: 3500 }, prog: c => n(c.pop, 10000) },
];

// ---------------------------------------------------------------
// ภารกิจรายวัน: สุ่ม 3 ข้อต่อวัน (ตามวันในเกม) เป้าหมายคิดจากค่าตอนเริ่มวัน (base) และเลเวลเมือง
// base = { pop, xp, placed, tool: {...}, concerts }  d(ctx, base) → ค่าที่ทำได้ในวันนี้
// ---------------------------------------------------------------
export const DAILY = [
  { id: 'build',   goal: L => 3 + L * 2,          d: (c, b) => c.cnt.placed - b.placed },
  { id: 'roads',   goal: L => 8 + L * 4,          d: (c, b) => (c.cnt.tool?.road || 0) - (b.tool.road || 0) },
  { id: 'homes',   goal: L => 4 + L * 2,          d: (c, b) => (c.cnt.tool?.res || 0) - (b.tool.res || 0) },
  { id: 'parks',   goal: () => 2,                 d: (c, b) => (c.cnt.tool?.park || 0) - (b.tool.park || 0) },
  { id: 'pop',     goal: L => 20 + L * 20,        d: (c, b) => c.pop - b.pop },
  { id: 'xp',      goal: L => 80 + L * 60,        d: (c, b) => (c.xp || 0) - b.xp },
  { id: 'concert', goal: () => 1, need: c => (c.vc['service:concert'] || 0) + (c.vc['service:stadium'] || 0) > 0, d: (c, b) => (c.cnt.concerts || 0) - b.concerts },
];
