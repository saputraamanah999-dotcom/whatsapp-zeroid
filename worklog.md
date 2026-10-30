# WORKLOG — ZEROID WHATSAPP

## Ronde: CHECK-IN 0 KOIN (2 lapis) + TYPING AI + APK v1.1.0 fix crash (2026-10-30)

### 1. CHECK-IN "berhasil tapi koin tetap 0" — DUA akar masalah, keduanya dibuktikan end-to-end
- **Lapis 1 (client):** `mapUser()` di `lib/store.ts` MEMBUANG field
  `points/checkinStreak/lastCheckinAt/bestStreak/referralCode/referredBy/refCount/fireRevives/lastCallsSeenAt`
  dari snapshot Firestore → server sudah mengkredit (leaderboard tampil 6.000 koin,
  dibuktikan langsung via service account: akun SAPUTRA WEB = zregfe1e punya points 6000,
  streak 1 di server) tapi layar Koin selalu 0. **FIX:** semua field ekonomi kini dimapping.
- **Lapis 2 (server, rules v14 → v15):** ditelusuri dengan probe user sungguhan
  (login password → Firestore REST). Commit transaksi check-in DITOLAK 403 untuk SEMUA
  user biasa. Akar: di rules, `request.resource.data` pada update ber-fieldMask =
  **dokumen gabungan** (hasil akhir), sehingga `'referralCode' in request.resource.data`
  selalu TRUE bagi user yang sudah punya kode referral → syarat "referralCode == ''"
  gagal → DENY. Yang lolos hanya developer (jalur isAdmin). **FIX v15:** semua syarat
  ekonomi berbasis `affectedKeys()` (hanya field yang benar-benar berubah), pola sama
  dibersihkan di `streakChatUpdate` + `hiddenFor` (calls). **v15 diterbitkan LIVE via
  Rules API** (ruleset e029dc15) sebelum commit.
- **Verifikasi penuh (bukti nyata, bukan asumsi):** probe user login via UI → tekan
  check-in → saldo 0 → **"1.000 koin ≈ Rp1.000"** + tombol terkunci + ledger terekam.
  Anti-spam tetap jalan: re-check-in <19j DITOLAK, +8.000 koin sekali tulis DITOLAK,
  ganti referralCode DITOLAK, fireRevives-only kini LOLOS (dulu ikut nyangkut).

### 2. TYPING ZEROID AI — animasi "sedang mengetik…" kini muncul
- Akar: AI bukan pengguna Firestore (tak bisa menulis `chat.typing`); indikator lama
  cuma gelembung `'…'` statis tanpa animasi. **FIX:** flag lokal `db.aiTyping[chatId]`
  (`aiTypingIn()`, auto-expire 2 menit) di-set `askAssistant` → ChatRoom (header
  TypingSubtitle + gelembung TypingDots "Zeroid sedang mengetik…") + ChatRow.
- Diverifikasi di browser: indikator MUNCUL saat AI menyusun jawaban dan HILANG saat
  jawaban datang (uji dengan hook delay inert `__AI_TEST_DELAY__` di lib/ai.ts).

### 3. APK v1.1.0 (versionCode 2) — crash AnyTypeProvider + "configuration required"
- **Crash `NoClassDefFoundError: expo.modules.kotlin.types.AnyTypeProvider`** (4 laporan
  "Kirim masukan" dari HP user): 15 modul native tidak selaras — `expo-location@19.0.8`
  tertinggal 3 major dari SDK 57. **FIX:** `npx expo install --fix` — semua modul
  dipaskan ke versi resmi SDK 57 (expo-location→57.0.22, async-storage 2.2.0,
  gesture-handler 2.32, reanimated 4.5.1, dst).
- **CI kini menulis .env** dari secret `ZEROID_WEB_ENV` (base64, dipasang via API) —
  tanpa ini APK tampil "configuration required" (terbukti di build lokal tanpa env).
  Hanya nilai PUBLIK (identik bundle web); kunci server tidak pernah masuk APK.
- **Terbit otomatis ke GitHub Releases** (tautan unduh publik tanpa login) + `permissions:
  contents: write` (dulu 403). Halaman **/apk.html** (cara pasang, update tanpa kehilangan
  data, riwayat fix) + pintasan "Unduh APK Android" di tab Saya (web saja).
- `app.json` → 1.1.0 / versionCode 2.

### File utama
- lib/store.ts (mapUser + aiTyping + askAssistant), lib/types.ts (DB.aiTyping),
  lib/ai.ts (hook uji inert), screens/ChatRoom.tsx, components/ChatRow.tsx,
  screens/tabs/MeTab.tsx, firestore.rules (v15), pwa/apk.html (BARU),
  .github/workflows/build-apk.yml, package.json/lock (deps selaras), app.json (1.1.0)

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

## Ronde: FIX crash halaman Panggilan + mention @username/@semua lengkap + emoji-status → SVG centang biru (2026-10-29)

### Bug yang diperbaiki
1. **CRASH "Invalid document reference ... notifications has 1"** saat membuka tab
   Panggilan — AKAR MASALAH: `rawDoc` menyebarkan `d.data()` SETELAH `id`, sehingga
   field `id:''` yang tersimpan di dokumen notifikasi (dari notifyFor) MENIMPA id
   snapshot → semua notifikasi punya `id:''` → `doc(db,'notifications','')` melempar
   error → ErrorBoundary. Fix: (a) rawDoc = `{ ...d.data(), id: d.id }` (id snapshot
   selalu menang, berlaku semua koleksi), (b) notifyFor tidak lagi menyimpan field
   `id:''`, (c) guard `n.id` + try/catch di markCallsSeen / markNotificationsRead /
   clearNotifications / deleteNotification.
   Efik samping: notifikasi panggilan kini BENAR-BENAR terbaca saat tab dibuka
   (dulu selalu crash → badge tidak pernah hilang).
2. **Emoji ✅ di pesan sistem "kini terverifikasi (permanen)"** → pesan sekarang
   tanpa emoji + field `verified:true` → MessageBubble merender ikon **centang biru
   SVG resmi** (VerifiedBadge) di samping teks pesan sistem.
3. Sapuan emoji-status lain: polling "📊" di preview → teks; tab leaderboard
   "🔥/🪙" → teks bersih; DevGuard "🛡️" → ikon SVG shield-check; share referral
   "🚀" dihapus; welcome message seed "🚀" dibersihkan + seed v9 MEMPERBAUI teks
   sambutan lama yang masih beremoji (regex emoji → merge set).

### Fitur BARU — mention lengkap (full stack)
- **lib/mentions.ts** (BARU): parser @handle, resolver @username → uid,
  dukungan **@semua/@all/@everyone/@sini** (tag semua anggota), splitMentionParts
  untuk render, mentionCandidates + activeMentionQuery + applyMention untuk popup.
- **components/MentionText.tsx** (BARU): teks dengan @username tersorot (aksen,
  tebal) — tap → buka profil. Dipakai MessageBubble + StoryViewer (teks & caption).
- **components/MentionSuggestions.tsx** (BARU): popup saran saat mengetik "@" —
  avatar + nama + @username, opsi **@semua** di atas (grup/global).
- **Composer**: deteksi token @ aktif → popup saran anggota; pilih → token diganti;
  grup/global/channel, reset saat kirim/record/pending.
- **store.ts**: pesan menyimpan `mentions:[{uid,name}]` + `mentionsAll` (optimis,
  persist, retry) → notifikasi realtime "· Menyebut kamu / Semua anggota disebut"
  ke tiap target (maks 30); SW: `postStory` menyimpan `mentions:[uid]` di story +
  notif "menyebut kamu di SW" (tanpa dobel utk story developer).
- **StoryCreate**: petunjuk "pakai @username untuk menyebut teman" + popup saran
  dari semua pengguna (tanpa @semua); StoryViewer: caption/teks SW tersorot &
  bisa ditap → profil.
- **ChatRoom**: `onOpenUser` → tap mention membuka UserProfile.

### Verifikasi
- tsc --noEmit: 0 error; expo export web + pwa-postbuild: OK (mention code ada di
  bundle); seed.html parse OK; smoke headless: app boot tanpa console error.

## Ronde: HAPUS RIWAYAT PANGGILAN (semua/pilih) + PROFIL ZEROID AI BISA DIEDIT DEVELOPER + rules & seed v10 (2026-10-29)

### Fitur BARU — riwayat panggilan bisa dihapus (ala WhatsApp "hapus untuk saya")
- **Tab Panggilan**: ikon tempah di header → **Hapus SEMUA riwayat** sekali tekan
  (dengan konfirmasi) — panggilan masuk + keluar + tak terjawab langsung hilang.
- **Hapus beberapa**: tekan lama baris → mode seleksi (kotak centang ala WhatsApp);
  tap pilih/lepas satu-satu, tombol pilih-semua, lalu tempah → **hapus terpilih**.
- **Teknis**: dokumen call di-share dua pihak → riwayat TIDAK dihard-delete; uid
  pencoret ditulis ke `hiddenFor` (arrayUnion) sehingga hilang dari daftar PEMILIK
  saja, riwayat pihak lain utuh. Notifikasi panggilan milikku terkait ikut dibersihkan.
- Optimis UI (hilang detik ini juga) + konfirmasi dialog + hint "tekan lama untuk pilih".

### Fitur BARU — profil Zeroid AI diubah developer (nama, bio, banner, foto)
- **Admin panel → tab "Zeroid AI"** (BARU): edit **nama**, **bio**, **foto AI**
  (pilih gambar → upload), **banner** (foto ATAU video loop) + pratinjau live
  seperti yang dilihat pengguna + tombol Simpan.
- **Firestore `config/ai_profile`** (BARU, realtime ke semua client): `{name, bio,
  avatar, banner, bannerType, updatedAt, updatedBy}` — read semua user, write
  developer/admin (rules config sudah menutup ini).
- **Tampil di SEMUA tempat**: header ChatRoom (nama + bio + avatar), ChatInfo
  (banner foto/video + avatar + nama + deskripsi), baris daftar chat (ChatRow),
  kartu Discover, nama pengirim balasan AI (MessageBubble).
- **Persona server-side ikut berubah**: klien mengirim `aiName`/`aiBio` ke
  `/api/ai`; server menyusun system prompt dinamis + jawaban identitas
  deterministik + sanitizeIdentity memakai nama baru. DISANITASI KETAT (tanpa
  baris baru/backtick, dibatasi 60/220 karakter) — anti prompt-injection; tanpa
  custom → persona bawaan "Zeroid AI".

### FIREBASE rules v10 + seed v10 (anti missing-field)
- **firestore.rules v10**: `calls.update` menerima field `hiddenFor` dengan rem
  satu-arah (hanya bertambah, wajib memuat uid sendiri) — sisanya tetap tertutup.
- **pwa/seed.html v10**: rules embedded di-sync ulang dari firestore.rules (terverifikasi identik),
  step BARU `config/ai_profile` (buat + PEMBENAHAN field kurang pada dokumen lama),
  marker `calls` kini menyertakan `hiddenFor: []`, baris tabel koleksi ditambah.

### Verifikasi
- tsc --noEmit: 0 error; expo export web + pwa-postbuild: OK; fitur baru ada di
  bundle (hapus riwayat + ai_profile); seed.html parse OK (node Function check);
  label "Firestore" di layanan user (ApiStatus/WebRTC) diganti "Basis data"/"Sinyal panggilan".

## 2026-10-30 — GRUP ANTI NYANGKUT + TAG ALL KHUSUS ADMIN (rules v17, APK 1.4.0)

### PENYEBAB UTAMA ditemukan
- **2 commit batch-6 (wallpaper/tema/balon/feedback/bot/links/brat/foto live + fix
  force-close APK) TERNYATA BELUM PERNAH ter-push** — origin/main masih dd867b9;
  push ini mengirim semuanya (Vercel live di commit ec52648).
- **Trigger workflow salah ketik `branches: ain]`** (deploy-rules.yml & build-apk.yml)
  → rules & APK tidak pernah otomatis jalan sejak commit 3a57180. Diperbaiki `[main]`
  (sebenarnya sudah dibereskan di 14551a2, ikut ter-push kali ini). Push pertama dengan
  trigger benar langsung membuktikan: Deploy Firebase Rules ✅ LIVE (ruleset b9afa0dc),
  Build APK Zeroid ✅ jalan otomatis.

### GRUP: keluar/kick/kepemilikan (rules v17 + client)
- **leaveGroup()**: server-first (getDoc terbaru) → transaksi atomik (update anggota +
  pesan sistem "X keluar" SEKALIGUS; gagal keluar = notif palsu tak pernah muncul) →
  UI optimistis → error jujur lewat banner. Grup ditangguhkan: jalur polos tanpa
  pesan sistem (rules melarang anggota menulis pesan di chat dibanned).
- **rules v17 jalur keluar**: 6a anggota biasa (members saja — sudah ada), 6b BARU
  admin keluar (members+admins sekaligus — dulu SELALU DITOLAK karena whitelist
  self-leave hanya 'members'), 6c BARU pemilik keluar + transfer admin utama
  (members+admins+createdBy; suksesor wajib anggota lama & terdaftar admin).
- **PEMILIK GRUP DILINDUNGI**: admin kedua/user lain tidak bisa menendang, menurunkan,
  atau mengalihkan kepemilikan (client guard + rules ownerTouched). Lencana "Pemilik";
  opsi kick/demote disembunyikan di lembar anggota (kecuali admin global).
- **Pemilik keluar → admin utama OTOMATIS pindah** (admin lain dulu, jika tidak ada
  anggota teratas) + pesan sistem "X sekarang admin utama grup" + notif suksesor.
- **kick (removeMember)**: server-first, tolak kick pemilik, sysMsg & notif HANYA
  sesudah sukses, error jujur. ChatRoom kini menampilkan layar jelas "Kamu keluar
  dari grup ini" saat dibuka setelah keluar/di-kick.
- Pesan di grup selalu menuntut keanggotaan (isMemberOf) → yang sudah keluar/di-kick
  tidak bisa mengirim lagi.

### MENTION
- **@semua/@all/@everyone/@sini KHUSUS ADMIN GRUP & ADMIN GLOBAL** (rules tidak mungkin
  menilai semantik tag-all → ditegakkan di klien: popup saran hanya admin + resolve
  menolak expand utk user biasa — diketik manual pun jadi teks biasa).
- **Tag individu bebas utk semua user, tanpa simpan kontak** — grup/saluran = anggota;
  **CHAT GLOBAL kini = SEMUA PENGGUNA** (dulu pool "anggota" global kosong → tak bisa
  tag siapa pun). SW ikut ditegakkan (alias tag-all hanya admin global).

### Lain-lain
- Fix t.card → t.bg2 (FeedbackScreen) — tsc bersih; expo export web OK.
- Versi **1.4.0 / versionCode 5** untuk batch APK baru (force-close R8 fix ikut
  terbang kali ini lewat trigger [main]).
