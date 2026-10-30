# 📗 PANDUAN LENGKAP — Supabase × ZEROID WhatsApp

Supabase digabungkan dengan Firebase dengan pembagian tugas:

| Peran | Sebelumnya | Sekarang |
|---|---|---|
| Chat, user, notif realtime | Firebase Firestore | **Tetap Firestore** (realtime, tidak diubah) |
| Foto chat | ImgBB (permanen) | **Tetap ImgBB** → cadangan Supabase |
| Video / dokumen / VN | litterbox 72 jam → **HILANG** | **Supabase Storage — PERMANEN** ✅ |
| Stiker Brat | — | Dibuat via Sylvatica, disimpan **Supabase** |
| Database tambahan | — | Tabel `zeroid_media`, `zeroid_stickers`, `zeroid_bans` |

> Kenapa ini penting: dulu video/kirim file hanya bertahan 72 jam di litterbox
> (1 jam di tmpfiles) — itulah kenapa media terasa "missing semua". Setelah
> Supabase aktif, semua media baru **permanen dan tidak pernah kadaluarsa**.

---

## LANGKAH 1 — Ambil kunci Supabase (2 menit)

1. Buka https://supabase.com/dashboard → project kamu (`<project-ref>`) → **Project Settings → API**.
2. Salin 3 nilai:
   - **Project URL** → `https://<project-ref>.supabase.co`
   - **anon / public key** (aman di client)
   - **service_role key** (RAHASIA — jangan pernah di EXPO_PUBLIC_*)

## LANGKAH 2 — Pasang di Vercel (5 menit)

Vercel Dashboard → project ZEROID → **Settings → Environment Variables** → tambahkan SEMUA ini → **Production + Preview + Development**:

```
EXPO_PUBLIC_SUPABASE_URL      = https://<project-ref>.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY = <anon key kamu>
SUPABASE_URL                  = https://<project-ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY     = <service_role key kamu>
SYLVATICA_APIKEY              = <kunci dari dashboard Sylvatica — JANGAN ditulis di repo>
POSTGRES_URL_NON_POOLING      = postgres://postgres.<project-ref>:<PASSWORD>@aws-0-<region>.pooler.supabase.com:5432/postgres?sslmode=require
```

> `POSTGRES_URL_NON_POOLING` ada di **Project Settings → Database → Connection string → URI** (pilih **Direct connection / port 5432**, bukan pooler 6543). Password database ada di halaman yang sama.

Lalu **Deployments → tab terbaru → ⋯ → Redeploy** (wajib, supaya env baru kebaca).

## LANGKAH 3 — Buat tabel & bucket otomatis (1 menit, pilih salah satu)

**Cara A — dari aplikasi (paling gampang):**
1. Buka website ZEROID → login sebagai **admin** (`gedejulianto148@gmail.com`).
2. Buka **Admin Panel → tab Sistem** → tombol **“Seed Supabase”**.
3. Muncul “Seed Supabase selesai” → tabel + bucket sudah dibuat otomatis. ✅

**Cara B — manual via SQL Editor:**
1. Supabase Dashboard → **SQL Editor → New query**.
2. Buka file `supabase/seed.sql` di repo → **copy seluruh isinya** → paste → **Run**.
3. Cek **Table Editor** → muncul 3 tabel `zeroid_*`, dan **Storage** → bucket `zeroid`. ✅

> Kedua cara menjalankan SQL yang SAMA dan idempotent (aman diulang kapan saja).

## LANGKAH 4 — Verifikasi

- Buka `https://<domain-vercel>/api/version` → harus `supabase: true, sylvatica: true`.
- Kirim 1 video/dokumen di chat → buka **Supabase → Storage → zeroid/files** → file muncul = permanen. ✅
- Stiker Brat: **MeTab → Stiker → tab “Brat”** → ketik teks → simpan → kirim. ✅

---

## Yang otomatis berubah di aplikasi setelah env terpasang

1. **Video/audio/dokumen** diunggah ke Supabase Storage (permanen) dulu; bila gagal baru ke litterbox/tmpfiles (fallback lama).
2. **Foto** tetap ImgBB (CDN cepat) → gagal → Supabase → host lama.
3. **Stiker Brat** tersimpan permanen di Supabase, bisa difavoritkan & dikirim seperti stiker WhatsApp (ukuran kecil).
4. **AI** bila Jerexd limit/gagal → otomatis pindah ke Sylvatica AI tanpa perlu apa pun dari user.
5. **TikTok download** via Sylvatica siap dipakai (`/api/sylvatica?action=tiktok&url=`).

## Keamanan (penting)

- `service_role` & `SYLVATICA_APIKEY` **hanya di Vercel env** — tidak pernah masuk bundle client, tidak pernah di GitHub.
- `EXPO_PUBLIC_SUPABASE_ANON_KEY` memang dirancang publik — ditambah RLS: tabel hanya bisa ditulis service role, bucket boleh diupload anon tapi hanya ke bucket `zeroid`.
- Kalau service_role pernah ke-copy ke tempat publik: **rotate** di Supabase → Settings → API → lalu update env Vercel.
