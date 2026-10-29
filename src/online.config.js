// ---------------------------------------------------------------
// ตั้งค่าเซิร์ฟเวอร์ออนไลน์ (Supabase) สำหรับระบบดูเมืองเพื่อน
// เว้นว่างไว้ = ปิดระบบออนไลน์ (เกมเล่นได้ปกติ ไม่มีเมนูเมืองเพื่อน)
//
// วิธีเปิดใช้ (ดูรายละเอียดใน README หัวข้อ "ดูเมืองเพื่อน"):
//   1. สร้างโปรเจกต์ฟรีที่ https://supabase.com
//   2. Authentication → Sign In / Providers → เปิด "Allow anonymous sign-ins"
//   3. SQL Editor → วางไฟล์ supabase/schema.sql แล้วกด Run
//   4. Project Settings → API → คัดลอก Project URL และ anon public key มาใส่ด้านล่าง
// anon key เปิดเผยได้ (ออกแบบมาให้อยู่ในเว็บ) สิทธิ์การอ่าน/เขียนถูกคุมด้วย RLS ใน schema.sql
// ---------------------------------------------------------------
export const ONLINE = {
  url: '',       // เช่น 'https://abcdefgh.supabase.co'
  anonKey: '',   // เช่น 'eyJhbGciOi...'
};
