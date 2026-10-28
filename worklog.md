# WORKLOG — ZEROID WHATSAPP

## Ronde: Fix WHITE SCREEN + Vercel build gagal + Seed v5 + Index sekali-klik (2026-10-28)

### Akar masalah ditemukan & dibuktikan langsung di browser (headless)
1. **WHITE SCREEN setelah login / setelah PIN** — AKAR: `components/MusicBar.tsx`
   memanggil `useNavigationState()` padahal komponen dipasang di **root App (di luar
   Stack.Navigator)** → hook melempar `Uncaught Error: Couldn't get the navigation state.
   Is your component inside a navigator?` → React **meng-unmount seluruh tree** → halaman
   putih total. Kenapa login page aman? Karena MusicBar hanya termount saat sudah masuk
   branch Main (login → PIN → username semua lolos = persis titik putih yang dilaporkan).
   **FIX:** route aktif kini dipublikasikan App lewat `onStateChange` →
   `lib/bus.ts` (`setActiveRouteName` + `useActiveRouteName` yang TIDAK pernah throw);
   MusicBar memakai hook aman itu.
2. **Vercel "deployed" tapi web tetap lama** — AKAR KEDUA: commit terakhir gagal BUILD
   di Vercel karena `lib/store.ts` me-require `@react-native-google-signin/google-signin`
   yang **tidak ada di package.json** (Metro gagal resolve → build exit 2 → deployment
   prod tidak berganti). **FIX:** paket dipasang; `npx expo export --platform web` kini
   SUKSES (diverifikasi lokal, bundel produksi diuji end-to-end).
3. **Jaring pengaman**: `components/ErrorBoundary.tsx` baru membungkus seluruh App —
   crash render apa pun kini menampilkan layar merah jelas + tombol "Muat ulang aplikasi"
   (bukan putih total tanpa pesan).
4. **Tombol Masuk tertutup banner** — `InstallBanner` ("Pasang Zeroid") muncul 6 detik
   setelah load dan MENUTUPI tombol Masuk di layar pendek. Kini tidak tampil di layar
   auth/lock (hanya setelah masuk aplikasi).
5. **Seed koleksi Firebase v5** (`pwa/seed.html`): kini **mematerialisasi SEMUA koleksi**
   yang belum ada: stories, calls, reports, orders, stickers, invites, audit_logs,
   anime_favs, bans, appeals, fcm_tokens (dokumen penanda `_schema` yang aman — tidak
   akan muncul di daftar user). Koleksi `mail` sengaja tak diisi (memicu email sungguhan
   extension Trigger Email). Idempotent — aman dijalankan ulang.
6. **4 composite index Firestore hilang** (notif/orders/calls masuk-keluar) — penyebab
   notifikasi real-time & riwayat panggilan diam (`failed-precondition` di konsol).
   seed.html kini punya **4 tombol sekali-klik** yang membuka Firebase Console dengan
   index sudah terisi — tinggal "Create index". `firestore.indexes.json` juga dilengkapi.

### Verifikasi (headless Chrome, bundel produksi)
- Login → PIN → Main: **sukses, 0 error konsol** (sebelumnya: putih).
- Reload dengan sesi aktif → Main langsung render (sebelumnya: putih).
- Tombol Masuk bisa diklik walau timer install banner lewat.
- `tsc --noEmit` 0 error; `expo export --platform web` + `pwa-postbuild` sukses.

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
