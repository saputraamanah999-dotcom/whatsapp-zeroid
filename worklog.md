# WORKLOG — ZEROID WHATSAPP

## Ronde: Supabase × Firebase + Brat + Ban Grup/Saluran + Centang Biru Chat (2026-10-28)

### Masalah utama yang dijawab
1. **"Website masih lama padahal Vercel bilang deployed"** — push GitHub ternyata SUKSES
   (remote = lokal). Penyebab web tampil lama: Service Worker v1 tidak pernah bump versi +
   static cache stale-while-revalidate. Sekarang: SW **v2** + auto-reload saat ada versi baru
   + navigasi selalu network-first `no-store` + endpoint `/api/version` untuk memastikan
   commit yang LIVE (menampilkan VERCEL_GIT_COMMIT_SHA + status env).
2. **Media "missing semua"** — akar masalah kedua: host lama (litterbox 72 jam / tmpfiles
   1 jam) MENGHAPUS file. Solusi permanen: **Supabase Storage** (bucket `zeroid`, 100 MB/file)
   jadi host utama untuk video/audio/dokumen; foto ImgBB → Supabase → host lama sebagai
   rantai cadangan. File besar (>3.2 MB) diunggah LANGSUNG dari perangkat ke Supabase.
3. **Supabase digabung Firebase** — env lengkap dipasang (tanpa menghapus yang lama),
   tabel + bucket dibuat otomatis lewat seed.

### Fitur baru
- **Supabase**: `api/_supabase.ts` (helper server), `api/supabase-seed.ts` (DDL otomatis via
  pg, dilindungi token admin), `supabase/seed.sql` (cara manual), `lib/supabase.ts` (client),
  `docs/SUPABASE_SETUP.md` (panduan lengkap step-by-step).
- **Admin panel → tab Grup**: ban grup/saluran (alasan + durasi jam/hari/permanen), unban,
  pasang/cabut centang biru dengan masa aktif (7/30/90/180/365/permanen), tinjauan banding
  grup. Tombol **Seed Supabase** di tab Sistem.
- **Ban grup/saluran ala WhatsApp**: anggota melihat **ChatBannedScreen** (alasan + sisa
  durasi + form banding "grup ini di ban tolong tinjauan…"), admin tulis pesan alasan sendiri;
  banding masuk ke tab Grup; setuju → unban otomatis. Guard juga di rules v5.
- **Centang biru grup & saluran**: `verifiedUntil` (kadaluarsa otomatis), badge di ChatRow/
  ChatRoom/ChatInfo + bar pengaman "…terverifikasi centang biru — aman…"; pembelian lewat
  ChatInfo → order bluecheck `forChatId` → admin konfirmasi → centang aktif sesuai plan.
- **Stiker Brat** (sylvatica.my.id, key di server): panel stiker → "Stiker Brat dari teks" →
  ketik teks → stiker muncul → tambah favorit / kirim. Ukuran bubble stiker 120px (kecil ala
  WA). Proxy `/api/sylvatica` (brat + tiktok dl). Endpoint diverifikasi hidup (PNG 700×700).
- **AI fallback**: JERE limit/500 → otomatis pindah ke Sylvatica AI (`/api/ai/chatgpt`),
  persona Zeroid tetap dipakai (identitas SAPUTRA || DEV WEBSITE tetap konsisten).
- **Typing indicator**: komponen `TypingDots` (3 titik memantul beranimasi) di gelembung chat,
  header (TypingSubtitle), dan daftar chat — teks "sedang mengetik…".
- **Fix bug ban user**: initStore tidak lagi memaksa sign-out saat banned → BannedScreen +
  form banding benar-benar tampil.

### File utama yang berubah
- api/: `_supabase.ts` (BARU), `supabase-seed.ts` (BARU), `sylvatica.ts` (BARU),
  `version.ts` (BARU), `upload.ts` (+Supabase permanen), `ai.ts` (+fallback sylvatica)
- lib/: `supabase.ts` (BARU), `media.ts` (Supabase dulu), `store.ts` (ban chat, banding,
  verify chat, order forChat, guard kirim, fix initStore), `types.ts` (ChatAppeal,
  verifiedUntil, banned chat, forChatId)
- screens/: `ChatBannedScreen.tsx` (BARU), AdminScreen (+tab Grup + seed), ChatInfo
  (+centang biru beli), ChatRoom (+guard ban + verified bar + typing anim)
- components/: `TypingDots.tsx` (BARU), ChatRow (+typing anim + verified), Composer
  (+Brat maker), MessageBubble (stiker 120px), ui.tsx (Header subtitleNode)
- pwa/sw.js v2 + pwa-postbuild.js (auto-reload), firestore.rules **v5**,
  supabase/seed.sql, docs/SUPABASE_SETUP.md, .env/.env.example (+Supabase & Sylvatica)
- package.json: +pg (server seed)

### Wajib dilakukan user setelah deploy
1. Publish `firestore.rules` v5 di Firebase Console (seperti sebelumnya).
2. Pasang env Supabase + SYLVATICA_APIKEY di Vercel (lihat docs/SUPABASE_SETUP.md) → Redeploy.
3. Jalankan seed Supabase: Admin Panel → Sistem → "Seed Supabase sekarang"
   (atau paste supabase/seed.sql di SQL Editor).
4. Cek `/api/version` untuk memastikan commit & env live; bila web masih lama:
   clear site data sekali (Chrome → Application → Clear storage), setelah itu
   auto-update SW v2 yang bekerja.
