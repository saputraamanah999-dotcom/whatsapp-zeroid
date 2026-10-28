-- ============================================================================
-- ZEROID WHATSAPP — SEED SUPABASE (idempotent: aman dijalankan berulang)
-- Cara pakai (pilih salah satu):
--   A. OTOMATIS: tombol "Seed Supabase" di Admin Panel (memanggil
--      /api/supabase-seed dengan token admin) — endpoint menjalankan SQL ini.
--   B. MANUAL : Supabase Dashboard → SQL Editor → New query → paste semua file
--      ini → Run. Selesai.
-- ============================================================================

-- 1) TABEL METADATA MEDIA (catatan semua unggahan ke Supabase Storage)
create table if not exists public.zeroid_media (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null default 'file',        -- images / files / sticker_brat / ...
  url         text not null,
  path        text,                                -- path di bucket zeroid
  mime        text,
  size        bigint,
  owner       text,                                -- firebase uid (bila diketahui)
  created_at  timestamptz not null default now()
);
create index if not exists zeroid_media_owner_idx on public.zeroid_media (owner);
create index if not exists zeroid_media_created_idx on public.zeroid_media (created_at desc);

-- 2) TABEL STIKER FAVORIT (stiker Brat & lainnya per pengguna)
create table if not exists public.zeroid_stickers (
  id          uuid primary key default gen_random_uuid(),
  owner       text not null,                       -- firebase uid
  url         text not null,
  source      text not null default 'brat',        -- brat / upload / giphy ...
  created_at  timestamptz not null default now(),
  unique (owner, url)
);
create index if not exists zeroid_stickers_owner_idx on public.zeroid_stickers (owner);

-- 3) TABEL LOG BAN (audit ban user / grup / saluran + banding)
create table if not exists public.zeroid_bans (
  id          uuid primary key default gen_random_uuid(),
  target_kind text not null check (target_kind in ('user', 'chat')),
  target_id   text not null,                       -- uid atau chatId
  reason      text not null default '',
  duration_ms bigint not null default 0,           -- 0 = permanen
  banned_by   text,                                -- uid admin
  created_at  timestamptz not null default now(),
  expires_at  timestamptz,                         -- null = permanen
  appeal      text,                                -- teks banding pengguna
  appeal_status text check (appeal_status in ('pending', 'approved', 'rejected')),
  appeal_note text,                                -- catatan admin saat memutus banding
  resolved_at timestamptz
);
create index if not exists zeroid_bans_target_idx on public.zeroid_bans (target_kind, target_id);

-- 4) BUCKET STORAGE PUBLIK `zeroid` (media permanen: foto/video/dokumen/stiker)
insert into storage.buckets (id, name, public, file_size_limit)
values ('zeroid', 'zeroid', true, 104857600)      -- 100 MB per file
on conflict (id) do nothing;

-- 4a) Policy Storage: semua orang boleh BACA (bucket publik), pengguna anon
--     boleh UNGGAH ke bucket zeroid (chat media), dan service role bebas penuh.
drop policy if exists "zeroid public read" on storage.objects;
create policy "zeroid public read"
  on storage.objects for select
  using (bucket_id = 'zeroid');

drop policy if exists "zeroid anon upload" on storage.objects;
create policy "zeroid anon upload"
  on storage.objects for insert
  to anon, authenticated
  with check (bucket_id = 'zeroid');

-- 5) RLS tabel aplikasi: publik hanya-baca ringkas; tulis hanya service role
--    (server). Ini menjaga tabel tetap bersih dari tulisan anon.
alter table public.zeroid_media   enable row level security;
alter table public.zeroid_stickers enable row level security;
alter table public.zeroid_bans    enable row level security;

drop policy if exists "zeroid_media read" on public.zeroid_media;
create policy "zeroid_media read" on public.zeroid_media for select using (true);

drop policy if exists "zeroid_stickers read" on public.zeroid_stickers;
create policy "zeroid_stickers read" on public.zeroid_stickers for select using (true);

drop policy if exists "zeroid_bans read" on public.zeroid_bans;
create policy "zeroid_bans read" on public.zeroid_bans for select using (true);
-- Tulis/ubah/hapus ketiga tabel ini TIDAK diberi policy publik → hanya service
-- role key (dipakai server Vercel) yang bisa menulis. Aman secara default.
