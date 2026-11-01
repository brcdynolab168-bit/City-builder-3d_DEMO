// ---------------------------------------------------------------
// ภารกิจของเมือง: เป้าหมายให้ผู้เล่นทำ สำเร็จแล้วได้เงินและ XP (เก็บใน state.quests.done)
// ctx = { pop, level, money, day, vc(จำนวนอาคารต่อแบบ เช่น 'farm:fish'), cc(civicCounts), s(computeStats) }
// prog คืน [ค่าปัจจุบัน, เป้าหมาย]
// ---------------------------------------------------------------
const n = (v, goal) => [Math.min(v, goal), goal];
const have = (ctx, k) => ctx.vc[k] || 0;

export const QUESTS = [
  { id: 'pop100',   reward: { money: 1500, xp: 80 },   prog: c => n(c.pop, 100) },
  { id: 'pop500',   reward: { money: 4000, xp: 200 },  prog: c => n(c.pop, 500) },
  { id: 'pop1500',  reward: { money: 12000, xp: 600 }, prog: c => n(c.pop, 1500) },
  { id: 'lv3',      reward: { money: 5000, xp: 250 },  prog: c => n(c.level, 3) },
  { id: 'fish',     reward: { money: 1800, xp: 120 },  prog: c => n(have(c, 'farm:fish'), 1) },
  { id: 'cricket',  reward: { money: 1200, xp: 100 },  prog: c => n(have(c, 'farm:cricket'), 1) },
  { id: 'farms4',   reward: { money: 3000, xp: 160 },  prog: c => n(c.cc.farm, 4) },
  { id: 'services', reward: { money: 6000, xp: 300 },  prog: c => n(['school', 'hospital', 'police', 'fire'].filter(k => have(c, 'service:' + k) > 0).length, 4) },
  { id: 'parks10',  reward: { money: 2500, xp: 140 },  prog: c => n(c.cc.parks, 10) },
  { id: 'transit',  reward: { money: 8000, xp: 400 },  prog: c => n(Math.round(100 * c.s.transitShare), 25) },
  { id: 'export',   reward: { money: 7000, xp: 350 },  prog: c => n(Math.round(c.s.trade?.expValue || 0), 500) },
  { id: 'rich',     reward: { money: 5000, xp: 300 },  prog: c => n(Math.round(c.money), 50000) },
];
