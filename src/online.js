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
    return me;
  })().finally(() => { connecting = null; }));
}
export const myProfile = () => me;

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
export async function fetchCity(id) {
  await connect();
  const c = await client();
  const [city, prof] = await Promise.all([
    c.from('cities').select('data').eq('id', id).maybeSingle(),
    c.from('profiles').select('*').eq('id', id).maybeSingle(),
  ]);
  const d = fail(city);
  return d ? { data: d.data, profile: fail(prof) } : null;
}
