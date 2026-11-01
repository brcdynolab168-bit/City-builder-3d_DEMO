// ---------------------------------------------------------------
// ระบบออนไลน์: โปรไฟล์ผู้เล่น รหัสเพื่อน อัปโหลดเมือง และดูเมืองเพื่อน (Supabase)
// โหลดไลบรารี Supabase เฉพาะตอนใช้งานครั้งแรก (ไม่เพิ่มขนาดตอนเปิดเกม)
// ผู้เล่นล็อกอินแบบไม่ระบุตัวตนอัตโนมัติ ตัวตนผูกกับเบราว์เซอร์นี้
// ---------------------------------------------------------------
import { ONLINE } from './online.config.js';

export const onlineEnabled = () => !!(ONLINE.url && ONLINE.anonKey);

let sb = null, me = null, connecting = null;
async function client() {
  if (!sb) {
    const { createClient } = await import('@supabase/supabase-js');
    sb = createClient(ONLINE.url, ONLINE.anonKey, { auth: { persistSession: true, autoRefreshToken: true, storageKey: 'mini-city-online' } });
  }
  return sb;
}
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // ไม่มี I O 0 1 ที่สับสนง่าย
const makeCode = () => Array.from({ length: 6 }, () => CODE_CHARS[(Math.random() * CODE_CHARS.length) | 0]).join('');
const fail = r => { if (r.error) throw r.error; return r.data; };

// เชื่อมต่อ + สร้างโปรไฟล์ครั้งแรก คืนโปรไฟล์ของเรา { id, code, name, privacy, ... }
export function connect(name, privacy) {
  if (me) return Promise.resolve(me);
  return (connecting ||= (async () => {
    const c = await client();
    let { data: { session } } = await c.auth.getSession();
    if (!session) session = fail(await c.auth.signInAnonymously()).session;
    const id = session.user.id;
    let prof = fail(await c.from('profiles').select('*').eq('id', id).maybeSingle());
    for (let tries = 0; !prof && tries < 5; tries++) {   // รหัสเพื่อนซ้ำ (โอกาสน้อยมาก) ลองใหม่
      const r = await c.from('profiles').insert({ id, code: makeCode(), name: name || '', privacy }).select().single();
      if (!r.error) prof = r.data; else if (r.error.code !== '23505') throw r.error;
    }
    me = prof;
    trackMe();
    return me;
  })().finally(() => { connecting = null; }));
}
export const myProfile = () => me;

// ---------- ใครกำลังเล่นอยู่ (Supabase Realtime Presence: ไม่ต้องมีตารางเพิ่ม) ----------
// ทุกแท็บที่เปิดเกมอยู่นับเป็น 1 คน (ผู้เล่นคนเดียวเปิดหลายแท็บก็นับแยกตามแท็บ แต่ถ้าล็อกอินแล้วจะนับตามตัวตน)
let ch = null, presenceStarted = false;
const presence = { count: 0, ids: new Set() };
const presenceCbs = new Set();
function trackMe() { if (ch && ch.state === 'joined') ch.track({ uid: me?.id || null }); }
export function startPresence() {
  if (presenceStarted || !onlineEnabled()) return;
  presenceStarted = true;
  client().then(c => {
    const key = (crypto.randomUUID?.() || String(Math.random()).slice(2));
    ch = c.channel('mini-city-presence', { config: { presence: { key } } });
    ch.on('presence', { event: 'sync' }, () => {
      const st = ch.presenceState(), ids = new Set(), anon = new Set();
      for (const [k, arr] of Object.entries(st)) for (const m of arr) (m.uid ? ids : anon).add(m.uid || k);
      presence.ids = ids; presence.count = ids.size + anon.size;
      presenceCbs.forEach(f => { try { f(presence); } catch {} });
    });
    ch.subscribe(s => { if (s === 'SUBSCRIBED') trackMe(); });
  }).catch(() => { presenceStarted = false; });
}
export const getPresence = () => presence;
export function onPresence(fn) { presenceCbs.add(fn); return () => presenceCbs.delete(fn); }

export async function updateProfile(fields) {
  const p = await connect();
  const c = await client();
  me = fail(await c.from('profiles').update({ ...fields, updated_at: new Date().toISOString() }).eq('id', p.id).select().single());
  return me;
}

// อัปโหลดเมืองปัจจุบัน (ส่วนตัว = ลบข้อมูลเมืองบนเซิร์ฟเวอร์ทิ้ง เหลือแค่โปรไฟล์)
export async function publishCity(meta, data) {
  const p = await connect();
  const c = await client();
  await updateProfile(meta);
  if ((meta.privacy ?? p.privacy) === 'private') fail(await c.from('cities').delete().eq('id', p.id));
  else fail(await c.from('cities').upsert({ id: p.id, data, updated_at: new Date().toISOString() }));
}

// เพิ่มเพื่อนด้วยรหัส คืนโปรไฟล์เพื่อน
export async function addFriend(code) {
  const p = await connect();
  const c = await client();
  const f = fail(await c.from('profiles').select('*').eq('code', code.trim().toUpperCase()).maybeSingle());
  if (!f) throw new Error('notfound');
  if (f.id === p.id) throw new Error('self');
  const r = await c.from('friends').insert({ owner: p.id, friend: f.id });
  if (r.error && r.error.code !== '23505') throw r.error;   // เพิ่มซ้ำ = ไม่เป็นไร
  return f;
}
export async function removeFriend(id) {
  const p = await connect();
  const c = await client();
  fail(await c.from('friends').delete().eq('owner', p.id).eq('friend', id));
}

// รายชื่อเพื่อนที่เราเพิ่มไว้ + เปิดเมืองให้เราดูได้ไหม (canView) + เขาเพิ่มเรากลับหรือยัง (mutual)
export async function listFriends() {
  const p = await connect();
  const c = await client();
  const rows = fail(await c.from('friends').select('owner, friend').or(`owner.eq.${p.id},friend.eq.${p.id}`));
  const mine = rows.filter(r => r.owner === p.id).map(r => r.friend);
  const back = new Set(rows.filter(r => r.friend === p.id).map(r => r.owner));
  if (!mine.length) return [];
  const profs = fail(await c.from('profiles').select('*').in('id', mine));
  const open = new Set(fail(await c.from('cities').select('id').in('id', mine)).map(r => r.id));   // RLS กรองให้เหลือเฉพาะที่ดูได้
  return profs.map(f => ({ ...f, canView: open.has(f.id), mutual: back.has(f.id) })).sort((a, b) => b.updated_at.localeCompare(a.updated_at));
}
// เมืองที่เปิดให้ทุกคนดู (อัปเดตล่าสุดก่อน)
export async function listPublic(limit = 15) {
  const p = await connect();
  const c = await client();
  return fail(await c.from('profiles').select('*').eq('privacy', 'public').neq('id', p.id).order('updated_at', { ascending: false }).limit(limit));
}
// ข้อมูลเมืองของผู้เล่น id (null = ไม่มีสิทธิ์ดู/ยังไม่เคยอัปโหลด)
export async function fetchCity(id, adminPass) {
  await connect();
  const c = await client();
  const [city, prof] = await Promise.all([
    adminPass ? c.rpc('admin_city', { pass: adminPass, target: id }).then(r => (r.error ? r : { data: r.data ? { data: r.data } : null, error: null })) : c.from('cities').select('data').eq('id', id).maybeSingle(),
    c.from('profiles').select('*').eq('id', id).maybeSingle(),
  ]);
  const d = fail(city);
  return d ? { data: d.data, profile: fail(prof) } : null;
}

// ---------- คอมเมนต์สถานที่ (ตาราง place_comments ใน supabase/schema.sql) ----------
// ownerId = null → เมืองของเราเอง
export async function listPlaceComments(ownerId, tile, kind) {
  const p = await connect();
  const c = await client();
  return fail(await c.from('place_comments').select('id, author, author_name, stars, body, created_at').eq('city_id', ownerId || p.id).eq('tile', tile).eq('kind', kind || '').order('created_at', { ascending: false }).limit(30));
}
export async function postPlaceComment(ownerId, tile, kind, stars, body, name) {
  const p = await connect();
  const c = await client();
  fail(await c.from('place_comments').insert({ city_id: ownerId || p.id, tile, kind: kind || '', author: p.id, author_name: (name || p.name || '').slice(0, 20), stars, body: body.slice(0, 200) }));
}
export async function deletePlaceComment(id) {
  await connect();
  const c = await client();
  fail(await c.from('place_comments').delete().eq('id', id));
}

// ---------- โหมดแอดมิน: รหัสลับตรวจที่เซิร์ฟเวอร์ (ฟังก์ชัน admin_ok / admin_city ใน supabase/schema.sql) ไม่ได้เก็บรหัสไว้ในเกม ----------
export async function adminCheck(pass) {
  await connect();
  const c = await client();
  const r = await c.rpc('admin_ok', { pass });
  if (r.error) throw new Error(r.error.code === 'PGRST202' ? 'admin-sql' : r.error.message);   // ฟังก์ชันยังไม่ถูกสร้างบนเซิร์ฟเวอร์ (ยังไม่ได้รัน SQL)
  return r.data === true;
}
// โปรไฟล์ของผู้เล่นที่ออนไลน์อยู่ตอนนี้ (ids มาจาก presence)
export async function profilesByIds(ids) {
  if (!ids.length) return [];
  await connect();
  const c = await client();
  return fail(await c.from('profiles').select('*').in('id', ids.slice(0, 100)));
}

// แอดมินลบคอมเมนต์ของใครก็ได้ (ตรวจรหัสที่เซิร์ฟเวอร์ ฟังก์ชัน admin_del_comment)
export async function adminDeleteComment(pass, id) {
  await connect();
  const c = await client();
  fail(await c.rpc('admin_del_comment', { pass, cid: id }));
}
