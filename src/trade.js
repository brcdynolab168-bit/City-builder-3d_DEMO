// ---------------------------------------------------------------
// การค้า: สินค้าที่ฟาร์ม/โรงงานในเมืองผลิต และวัตถุดิบที่ต้องใช้ (ต่อวันเกม)
// ของที่ผลิตในเมืองใช้กันเองก่อน (เช่น กล่อง ECU จาก Keihin/Shindengen ส่งให้ Honda) ส่วนเกินส่งออก ส่วนขาดนำเข้า
// สถานีขนส่งสินค้าทำให้ขาย/ซื้อได้ราคาเต็ม และเมืองเก็บภาษีส่งออก/อากรนำเข้าได้
// ---------------------------------------------------------------

// [สินค้า, จำนวนต่อวัน, มูลค่าต่อหน่วย]
export const GOODS = {
  'farm:rice':      { out: [['rice', 40, 1.2]], in: [['fert', 4, 1]] },
  'farm:crop':      { out: [['veg', 30, 1.4]], in: [['fert', 3, 1]] },
  'farm:orchard':   { out: [['fruit', 26, 2.2]], in: [['fert', 2, 1]] },
  'farm:barn':      { out: [['meat', 12, 3], ['milk', 20, 1.2]], in: [['feed', 10, 0.8]] },
  'ind:lv1':        { out: [['goods', 6, 2]], in: [['steel', 2, 1.5]] },
  'ind:lv2':        { out: [['goods', 14, 2]], in: [['steel', 5, 1.5]] },
  'ind:lv3':        { out: [['goods', 30, 2]], in: [['steel', 10, 1.5], ['chip', 4, 2]] },
  // ค่ายรถ: ประกอบรถจักรยานยนต์/รถยนต์ ใช้เหล็ก + ชิ้นส่วนอิเล็กทรอนิกส์/เครื่องยนต์
  'ind:honda':      { out: [['moto', 18, 9], ['car_h', 4, 30]], in: [['steel', 20, 1.5], ['ecu', 10, 6], ['inj', 10, 4], ['rect', 18, 1.2]] },
  'ind:toyota':     { out: [['pickup', 8, 32]], in: [['steel', 34, 1.5], ['ac', 8, 5], ['alt', 8, 3], ['ecu', 8, 6]] },
  'ind:bmw':        { out: [['lux', 3, 80]], in: [['steel', 14, 1.5], ['ecu', 6, 6], ['ac', 3, 5], ['plug', 24, 0.3]] },
  // ซัพพลายเออร์: Shindengen = เซมิคอนดักเตอร์กำลัง/เรกูเลเตอร์-เรกติไฟเออร์ และกล่อง ECU รถจักรยานยนต์
  //              Keihin = ระบบหัวฉีดเชื้อเพลิง ลิ้นปีกผีเสื้อ กล่อง ECU   Denso = คอมเพรสเซอร์แอร์ ไดชาร์จ หัวเทียน
  'ind:shindengen': { out: [['rect', 60, 1.2], ['ecu', 24, 6]], in: [['chip', 30, 2]] },
  'ind:keihin':     { out: [['inj', 40, 4], ['ecu', 20, 6], ['throttle', 20, 3]], in: [['chip', 20, 2], ['alu', 20, 1.5]] },
  'ind:denso':      { out: [['ac', 30, 5], ['alt', 30, 3], ['plug', 200, 0.3]], in: [['chip', 20, 2], ['copper', 30, 1.5]] },
};

export const STATION_CAP = 500;   // หน่วยสินค้าต่อวันที่สถานีขนส่ง 1 แห่งรับได้ (ส่งออก+นำเข้า)
const NO_STATION = 0.4;           // ไม่มีสถานี: ขายผ่านพ่อค้าคนกลางได้ 40% ของราคา
const IMPORT_MARKUP = 1.4;        // ไม่มีสถานี: วัตถุดิบนำเข้าแพงขึ้น 40%
const EXPORT_TAX = 0.12, IMPORT_DUTY = 0.04;

// producers: [{ key: 'ind:honda', mul }]  (mul = กำลังผลิตจริง เช่น ขาดแรงงานมีฝีมือ)
// คืน { rows: [{ g, made, used, exp, imp, v }], expValue, impValue, units, cap, income, extraCost }
export function trade(producers, stations) {
  const made = {}, used = {}, val = {};
  for (const { key, mul = 1 } of producers) {
    const G = GOODS[key];
    if (!G) continue;
    for (const [g, q, v] of G.out) { made[g] = (made[g] || 0) + q * mul; val[g] = v; }
    for (const [g, q, v] of G.in) { used[g] = (used[g] || 0) + q * mul; val[g] = v; }
  }
  const rows = [];
  let expUnits = 0, impUnits = 0, expRaw = 0, impRaw = 0;
  for (const g of new Set([...Object.keys(made), ...Object.keys(used)])) {
    const m = made[g] || 0, u = used[g] || 0, exp = Math.max(0, m - u), imp = Math.max(0, u - m);
    rows.push({ g, made: m, used: u, exp, imp, v: val[g] });
    expUnits += exp; impUnits += imp; expRaw += exp * val[g]; impRaw += imp * val[g];
  }
  rows.sort((a, b) => (b.exp + b.imp) * b.v - (a.exp + a.imp) * a.v);
  // สถานีรับได้จำกัด: ส่วนที่เกินขีดจำกัดคิดแบบไม่มีสถานี
  const cap = stations * STATION_CAP, units = expUnits + impUnits, cov = units ? Math.min(1, cap / units) : 1;
  const expValue = expRaw * (cov + (1 - cov) * NO_STATION);
  const impValue = impRaw * (cov + (1 - cov) * IMPORT_MARKUP);
  return {
    rows, units, cap, cov, expValue, impValue,
    income: expRaw * cov * EXPORT_TAX + impRaw * cov * IMPORT_DUTY,   // เมืองเก็บภาษีได้เฉพาะของที่ผ่านสถานี
    extraCost: impRaw * (1 - cov) * (IMPORT_MARKUP - 1),               // ต้นทุนวัตถุดิบที่แพงขึ้น (กดกำไรโรงงาน)
  };
}
