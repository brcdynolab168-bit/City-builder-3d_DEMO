// ---------------------------------------------------------------
// ระบบเซฟหลายช่อง เก็บใน localStorage ของเครื่องผู้เล่น (แต่ละเบราว์เซอร์แยกกัน)
//   index  : [{ id, name, map, created, updated, day, pop, money }]
//   ข้อมูลเมือง: key แยกต่อช่อง  mini-city-3d-slot-<id>
// ---------------------------------------------------------------

const INDEX_KEY = 'mini-city-3d-slots-v2';
const ACTIVE_KEY = 'mini-city-3d-active-slot';
const DATA_KEY = id => 'mini-city-3d-slot-' + id;
const OLD_KEY = 'mini-city-3d-save-v1';

const rd = k => { try { return localStorage.getItem(k); } catch { return null; } };
const wr = (k, v) => { try { localStorage.setItem(k, v); return true; } catch { return false; } };
const rm = k => { try { localStorage.removeItem(k); } catch {} };

function readIndex() {
  try {
    const a = JSON.parse(rd(INDEX_KEY) || '[]');
    return Array.isArray(a) ? a : [];
  } catch { return []; }
}
const writeIndex = a => wr(INDEX_KEY, JSON.stringify(a));

export const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

// ย้ายเซฟเก่า (ช่องเดียว) มาเป็นช่องแรก
export function migrateOld() {
  const old = rd(OLD_KEY);
  if (!old || readIndex().length) return;
  try {
    const s = JSON.parse(old);
    if (!s || !Array.isArray(s.tiles)) return;
    const id = newId();
    wr(DATA_KEY(id), old);
    writeIndex([{ id, name: 'City 1', map: 'river', created: Date.now(), updated: Date.now(), day: s.day || 0, pop: 0, money: Math.floor(s.money || 0) }]);
    wr(ACTIVE_KEY, id);
    rm(OLD_KEY);
  } catch {}
}

export const listSlots = () => readIndex().sort((a, b) => b.updated - a.updated);
export const getSlot = id => readIndex().find(s => s.id === id) || null;
export const getActiveId = () => {
  const id = rd(ACTIVE_KEY);
  return id && getSlot(id) ? id : null;
};
export const setActive = id => wr(ACTIVE_KEY, id);

export function createSlot(name, map) {
  const id = newId();
  const a = readIndex();
  a.push({ id, name, map, created: Date.now(), updated: Date.now(), day: 0, pop: 0, money: 0 });
  writeIndex(a);
  return id;
}

export const loadData = id => {
  try { return JSON.parse(rd(DATA_KEY(id)) || 'null'); } catch { return null; }
};

export function saveData(id, data, meta = {}) {
  if (!id) return false;
  const ok = wr(DATA_KEY(id), JSON.stringify(data));
  const a = readIndex();
  const s = a.find(x => x.id === id);
  if (s) { Object.assign(s, meta, { updated: Date.now() }); writeIndex(a); }
  return ok;
}

export function renameSlot(id, name) {
  const a = readIndex();
  const s = a.find(x => x.id === id);
  if (s) { s.name = name; writeIndex(a); }
}

export function deleteSlot(id) {
  writeIndex(readIndex().filter(s => s.id !== id));
  rm(DATA_KEY(id));
  if (rd(ACTIVE_KEY) === id) rm(ACTIVE_KEY);
}

export function duplicateSlot(id) {
  const s = getSlot(id);
  const data = rd(DATA_KEY(id));
  if (!s || !data) return null;
  const nid = newId();
  wr(DATA_KEY(nid), data);
  const a = readIndex();
  a.push({ ...s, id: nid, name: s.name + ' (2)', created: Date.now(), updated: Date.now() });
  writeIndex(a);
  return nid;
}

// ธงบอกให้เข้าเกมเลยหลังรีโหลด (ข้ามหน้าเมนู)
export const setAutoStart = () => { try { sessionStorage.setItem('mini-city-autostart', '1'); } catch {} };
export const takeAutoStart = () => {
  try {
    const v = sessionStorage.getItem('mini-city-autostart') === '1';
    sessionStorage.removeItem('mini-city-autostart');
    return v;
  } catch { return false; }
};

// โหมดเยี่ยมชมเมืองเพื่อน: เก็บเมืองที่กำลังดูไว้ใน sessionStorage ข้ามการรีโหลด (ไม่ปนกับเซฟของเรา)
const VISIT_KEY = 'mini-city-visit';
export const setVisit = v => { try { sessionStorage.setItem(VISIT_KEY, JSON.stringify(v)); return true; } catch { return false; } };
export const getVisit = () => { try { return JSON.parse(sessionStorage.getItem(VISIT_KEY) || 'null'); } catch { return null; } };
export const clearVisit = () => { try { sessionStorage.removeItem(VISIT_KEY); } catch {} };
