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
