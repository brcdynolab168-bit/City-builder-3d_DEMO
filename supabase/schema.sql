-- ---------------------------------------------------------------
-- Mini City 3D: ฐานข้อมูลระบบดูเมืองเพื่อน (วางทั้งไฟล์ใน Supabase → SQL Editor แล้วกด Run)
--   profiles = ข้อมูลผู้เล่นที่ทุกคนเห็นได้ (ชื่อ รหัสเพื่อน สถิติเมืองคร่าวๆ)
--   cities   = ข้อมูลเมืองเต็ม อ่านได้ตามการตั้งค่าความเป็นส่วนตัวของเจ้าของ
--   friends  = owner เพิ่ม friend เป็นเพื่อน (= อนุญาตให้ friend ดูเมืองแบบ "เฉพาะเพื่อน")
-- ผู้เล่นล็อกอินแบบไม่ระบุตัวตน (anonymous) อัตโนมัติ ไม่ต้องสมัครสมาชิก
-- ---------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  code text unique not null check (char_length(code) between 4 and 12),
  name text not null default '' check (char_length(name) <= 20),
  privacy text not null default 'friends' check (privacy in ('public', 'friends', 'private')),
  city_name text not null default '' check (char_length(city_name) <= 40),
  pop integer not null default 0,
  level integer not null default 1,
  map text not null default 'river',
  updated_at timestamptz not null default now()
);

create table if not exists public.cities (
  id uuid primary key references public.profiles on delete cascade,
  data jsonb not null check (pg_column_size(data) < 600000),   -- กันข้อมูลใหญ่ผิดปกติ (~600 KB)
  updated_at timestamptz not null default now()
);

create table if not exists public.friends (
  owner uuid not null references public.profiles on delete cascade,
  friend uuid not null references public.profiles on delete cascade,
  created_at timestamptz not null default now(),
  primary key (owner, friend),
  check (owner <> friend)
);

alter table public.profiles enable row level security;
alter table public.cities enable row level security;
alter table public.friends enable row level security;

-- profiles: ผู้เล่นทุกคนอ่านได้ (ใช้ค้นหารหัสเพื่อน) แก้ได้เฉพาะของตัวเอง
drop policy if exists "profiles read" on public.profiles;
create policy "profiles read" on public.profiles for select to authenticated using (true);
drop policy if exists "profiles insert own" on public.profiles;
create policy "profiles insert own" on public.profiles for insert to authenticated with check (id = auth.uid());
drop policy if exists "profiles update own" on public.profiles;
create policy "profiles update own" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- friends: เห็นเฉพาะความสัมพันธ์ที่เกี่ยวกับตัวเอง เพิ่ม/ลบได้เฉพาะรายการของตัวเอง
drop policy if exists "friends read" on public.friends;
create policy "friends read" on public.friends for select to authenticated using (owner = auth.uid() or friend = auth.uid());
drop policy if exists "friends add" on public.friends;
create policy "friends add" on public.friends for insert to authenticated with check (owner = auth.uid());
drop policy if exists "friends remove" on public.friends;
create policy "friends remove" on public.friends for delete to authenticated using (owner = auth.uid());

-- cities: เจ้าของจัดการได้ทั้งหมด คนอื่นอ่านได้ตามความเป็นส่วนตัว
--   public  = ทุกคน, friends = เฉพาะคนที่เจ้าของเพิ่มเป็นเพื่อน, private = ไม่มีใคร
drop policy if exists "cities own" on public.cities;
create policy "cities own" on public.cities for all to authenticated using (id = auth.uid()) with check (id = auth.uid());
drop policy if exists "cities view" on public.cities;
create policy "cities view" on public.cities for select to authenticated using (
  exists (
    select 1 from public.profiles p
    where p.id = cities.id
      and (p.privacy = 'public'
           or (p.privacy = 'friends' and exists (select 1 from public.friends f where f.owner = p.id and f.friend = auth.uid())))
  )
);

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
