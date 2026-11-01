-- วางทั้งไฟล์นี้ใน Supabase → SQL Editor แล้วกด Run (รันซ้ำได้ ไม่เสียหาย)
-- ได้ 2 ฟีเจอร์: คอมเมนต์สถานที่ออนไลน์ + โหมดแอดมิน (ต้องมีตาราง profiles/cities จาก schema.sql ตัวหลักอยู่แล้ว)

-- ---------------------------------------------------------------
-- คอมเมนต์/รีวิวสถานที่ (เพื่อนที่เข้ามาดูเมืองเขียนได้) — รันส่วนนี้เพิ่มถ้าใช้ schema เดิมอยู่แล้ว
--   city_id = เจ้าของเมือง, tile = ช่องหลักของอาคาร, kind = ชนิดอาคาร (กันคอมเมนต์เก่าติดอาคารใหม่ที่ถูกสร้างทับ)
--   อ่านได้ถ้าเป็นเจ้าของ หรือดูเมืองนั้นได้ (ผ่าน RLS ของ cities)
--   เขียนได้ถ้าดูเมืองนั้นได้ ลบได้เฉพาะคนเขียนหรือเจ้าของเมือง จำกัด 5 ข้อความต่อนาทีต่อคน
-- ---------------------------------------------------------------
create table if not exists public.place_comments (
  id bigint generated always as identity primary key,
  city_id uuid not null references public.profiles on delete cascade,
  tile integer not null check (tile between 0 and 4095),
  kind text not null default '' check (char_length(kind) <= 40),
  author uuid not null references public.profiles on delete cascade,
  author_name text not null default '' check (char_length(author_name) <= 20),
  stars integer not null check (stars between 1 and 5),
  body text not null check (char_length(body) between 1 and 200),
  created_at timestamptz not null default now()
);
create index if not exists place_comments_lookup on public.place_comments (city_id, tile, created_at desc);
alter table public.place_comments enable row level security;

drop policy if exists "pc read" on public.place_comments;
create policy "pc read" on public.place_comments for select to authenticated using (
  city_id = auth.uid() or exists (select 1 from public.cities c where c.id = place_comments.city_id)
);
drop policy if exists "pc write" on public.place_comments;
create policy "pc write" on public.place_comments for insert to authenticated with check (
  author = auth.uid() and (city_id = auth.uid() or exists (select 1 from public.cities c where c.id = place_comments.city_id))
);
drop policy if exists "pc delete" on public.place_comments;
create policy "pc delete" on public.place_comments for delete to authenticated using (author = auth.uid() or city_id = auth.uid());

create or replace function public.place_comments_rate() returns trigger language plpgsql as $$
begin
  if (select count(*) from public.place_comments where author = new.author and created_at > now() - interval '1 minute') >= 5 then
    raise exception 'too many comments';
  end if;
  return new;
end $$;
drop trigger if exists place_comments_rate on public.place_comments;
create trigger place_comments_rate before insert on public.place_comments for each row execute function public.place_comments_rate();

-- ---------------------------------------------------------------
-- โหมดแอดมิน: ดูเมืองของใครก็ได้ (รวมเมืองที่ตั้งเป็นเฉพาะเพื่อน) โดยพิมพ์รหัสลับในช่องรหัสเพื่อน
-- เก็บเฉพาะค่าแฮช SHA-256 ของรหัสไว้ที่เซิร์ฟเวอร์ ตารางนี้เปิด RLS ไว้และไม่มี policy จึงอ่านผ่าน API ไม่ได้
-- เมืองที่ตั้งเป็น "ไม่ให้ใครดู" ถูกลบออกจากเซิร์ฟเวอร์อยู่แล้ว แอดมินจึงดูไม่ได้เช่นกัน
-- เปลี่ยนรหัส: update public.admin_secret set hash = encode(digest('รหัสใหม่', 'sha256'), 'hex');
-- ---------------------------------------------------------------
create extension if not exists pgcrypto with schema extensions;
create table if not exists public.admin_secret (hash text primary key);
alter table public.admin_secret enable row level security;
insert into public.admin_secret (hash) values ('ce2b42575de6f97f6706ad088c76f90ce69fe3d79b1b6931935bd5818293ffda') on conflict do nothing;

create or replace function public.admin_ok(pass text) returns boolean
language sql security definer set search_path = public, extensions stable as $$
  select exists (select 1 from public.admin_secret where hash = encode(digest(pass, 'sha256'), 'hex'));
$$;
create or replace function public.admin_city(pass text, target uuid) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not public.admin_ok(pass) then raise exception 'denied'; end if;
  return (select data from public.cities where id = target);
end $$;
revoke all on function public.admin_ok(text) from public, anon;
revoke all on function public.admin_city(text, uuid) from public, anon;
grant execute on function public.admin_ok(text) to authenticated;
grant execute on function public.admin_city(text, uuid) to authenticated;

-- แอดมินลบคอมเมนต์สถานที่ของใครก็ได้ (ตรวจรหัสด้วย admin_ok)
create or replace function public.admin_del_comment(pass text, cid bigint) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not public.admin_ok(pass) then raise exception 'denied'; end if;
  delete from public.place_comments where id = cid;
end $$;
revoke all on function public.admin_del_comment(text, bigint) from public, anon;
grant execute on function public.admin_del_comment(text, bigint) to authenticated;

-- แมปใหม่ใหญ่ขึ้น (80×80) ข้อมูลเมืองที่อัปโหลดจึงใหญ่ขึ้น: ขยายเพดานจาก ~600 KB เป็น ~1.5 MB
alter table public.cities drop constraint if exists cities_data_check;
alter table public.cities add constraint cities_data_check check (pg_column_size(data) < 1500000);
