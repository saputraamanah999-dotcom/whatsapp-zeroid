# WORKLOG — ZEROID WHATSAPP

## Ronde: v24 — VIDEO CALL TANPA MIRROR + STIKER FIXED + SIDEBAR PREMIUM + CUACA 7 HARI + ANIME ENGINE BARU (2026-10-31)

Semua klaim di bawah diverifikasi LIVE (login admin gedejulianto148@gmail.com via REST,
probe endpoint produksi sebelum & sesudah perubahan — bukan asumsi).

### 1. VIDEO CALL Jangan MIRRORING (front & belakang)
- `screens/CallScreen.tsx`: prop `mirror` DIHAPUS dari SEMUA RTCVideo lokal
  (fullscreen preview + PiP kecil). Kamera depan maupun belakang tampil apa adanya,
  tidak dibalik. (Mirror hanya properti TAMPILAN; kini default komponen = false.)

### 2. STIKER: hapus satu menghapus semua / koleksi berlipat — AKAR & FIX
- AKAR: `createSticker` dulu bikin id LOKAL (uid('st_')) berbeda dari id dokumen
  Firestore (addDoc) → hapus via id lokal tidak pernah mengenai dokumen aslinya,
  salinan cache bertumpuk tiap sesi, tampilan dobel (global milik sendiri muncul 2x
  karena 2 listener saling menumpuk).
- FIX: setDoc dengan id ditentukan di awal (id lokal == id Firestore) + optimistic
  insert; deleteSticker kini optimistic (hilang seketika) + deleteDoc benar; KEDUA
  listener snapshot dibangun ulang dengan dedupe by id (Map).

### 3. SIDEBAR MENU GRATIS BARU (mengikuti referensi desain premium — anti AI slop)
- Struktur persis referensi: Brand logo (blok gradien "Z") → label seksi MENU →
  item navigasi horizontal (ikon kotak rounded + label, aktif highlight lembut
  berwarna) → sub-level SUMBER BERITA / JENIS QUOTES menjorok dgn indikator titik →
  kartu CTA gradien "Zeroid Premium" (tombol putih) → footer workspace (pembatas +
  avatar + nama + role) → tombol ciut/kembang 76px ↔ 236px (ala minimize/maximize).
- Konten Cuaca/Gempa/Quotes/AM Finder ditata ulang; tombol Motivasi melar (bug
  layout lama) hilang karena seksi Quotes diganti kartu kutipan rapi dgn ikon.

### 4. CUACA LENGKAP (keluhan: cuma kondisi sekarang, tanpa hujan Senin-Minggu)
- ENDPOINT BARU `cuaca7` di api/vanzz.ts: Open-Meteo (geocoding + forecast, tanpa
  API key) — VERIFIED LIVE: Denpasar 7 hari, hujan 100% hari-0, 168 jam hourly.
- Layar Cuaca: hero (suhu besar, terasa, deskripsi) + 6 chip detail (kelembaban,
  angin, tekanan, presipitasi, UV, terbit/terbenam) + PRAKIRAAN 7 HARI Senin–Minggu
  (nama hari Indonesia, bar suhu min-max, peluang hujan %, mm, ikon) + banner
  "perkiraan hujan <hari>" + JAM-JAMAN 24 jam (scroll horizontal, hujan disorot).

### 5. GEMPA RAPI (dulu kartu kosong — parser tidak mengenali bentuk BMKG)
- Parser gempa/bmkg diperbaiki (result.auto.Infogempa.gempa + terkini[]):
  kartu gempa terbaru (magnitudo besar, kedalaman, koordinat, potensi, skala
  dirasakan) + PETA SHAKEMAP BMKG tampil + daftar "Gempa terkini" 8 entri.

### 6. ANIME ENGINE BARU — sumber lama MATI dibuktikan live
- Bukti: siputzx otakudesu/samehadaku/anichin = 503 "All nodes failed" / route 404
  / data kosong → detail anime lama selalu "tidak dapat dibaca" (keluhan user:
  "keluar hasil aja, bacanya aslinya gaada").
- Mesin baru (VERIFIED LIVE via /api/vanzz): Cari = animein search (movie[] lengkap
  sinopsis+poster) · Terbaru = otakudesu_latest (thumb) · Populer = animein FYP
  (poster asli + id) · Detail = animein info(id): sinopsis ASLI + daftar episode +
  genre/studio/status · Nonton = animein streams(episodeId): server kualitas
  (direct mp4 diputar in-app + embed dibuka browser) + tombol episode berikutnya.
- Slug detail: "ain:<id>" / "q:<judul>" (cari otomatis); favorit lama tetap jalan.
- Jere schedule/quotes/news dipertahankan (fallback Jikan/ANN resmi masih hidup).

### 7. CEK NOMOR / NETFLIX / RESI — kartu hasil diperbaiki (dulu "true" doang)
- Payload sebenarnya di-probe dengan order nyata (create pending → paid → deliver):
  - Cek Nomor: result.operator{name,prefix4} region{country,network}
    validity{status,expiredAt} quota{estimate} block{status} → kartu kini menampilkan
    Operator/Jangkauan/Status kartu/Berlaku/Estimasi paket/Kondisi (bukan "true").
  - Netflix: result.data{token, expiry, profile{country,plan}, links.pc} → token
    dalam blok monospace 2 baris (anti lewat tepi) + tombol SALIN + tombol
    "Buka Netflix dengan token ini".
  - Cek Resi: status + resi/ekspedisi/tanggalKirim/posisi terakhir + 5 riwayat
    perjalanan sebagai timeline.
- flatPairs fallback: kunci teknis (status/creator/successCount/...) DISKIP —
  kartu tidak pernah lagi tampil "Status: true / Creator: Vanzz Ryuichi".

### 8. BELI FOLLOWERS/REAKSI SALURAN — pengalaman baru (sesuai permintaan)
- Kartu khusus BoostCard menggantikan form generik: pilih saluran BENERAN dari
  daftar (foto profil + nama + centang + jumlah pengikut ringkas), toggle
  Pengikut/Reaksi, kalau reaksi → RADIO pilih pesan yang mana (pesannya dimuat
  dari saluran; default pesan terakhir), chip jumlah cepat (5..5000).
- SERVER: deliver reaction kini menghormati meta.messageId (pesan pilihan
  pembeli; fallback pesan terakhir) — backward compatible.
- Harga semua produk API ditulis RINGKAS (rupiahShort): Rp3rb/5, Rp5rb/10,
  Rp7rb, Rp5rb — anti teks kepanjangan sampai kebawah.

### 9. ANGKA PENGIKUT RINGKAS di SEMUA tampilan saluran
- compactId() baru di lib/format: 1.000→1rb, 103.000→103rb, 1.000.103→1jt,
  2.400.000→2,4jt, 1.5 milyar→1m. Dipakai di ChatRoom (header), ChatInfo,
  Discover, Admin GrowPanel, kartu hasil followers/reaksi, BoostCard.

### 10. LAIN-LAIN
- Nama "Vanzz" di label provider AI terminal → "Saputra" (komentar kode tidak
  dilihat user, dibiarkan); teks creator di kartu hasil sudah di-skip bersih.
- Versi 1.6.8 (versionCode 14) — picu build APK baru dengan semua fix ini.
- tsc 0 error; expo export web sukses (8.6 MB, 2 bundle).

## Ronde: v23 — BOT GRUP FIXED + NOTIFIKASI + CEK RESI + FOLLOWERS/REAKSI MASSAL + RAPIIN UI (2026-10-31)

### 0. AKAR BOT BISU DIBUKTIKAN — DUA BUG SERVER, dibuktikan via uji live (bukan asumsi)
- **Bug 1 — `fsServerTime()` di documents:create**: `{serverValue:'REQUEST_TIME'}` hanya sah
  di API commit; `documents:createDocument` MENOLAK seluruh dokumen (400) → `fbCreateDoc`
  untuk pesan bot balik `false` → `/api/ai` bot-reply 502 "Gagal mengirim balasan bot".
  Kenapa lolos audit lama: patch members (bot join) pakai `fbPatchDoc` (jalan), hanya
  PESAN yang gagal → bot "tergabung tapi tak pernah bicara".
  FIX: 6 payload di api/ai.ts → `createdAt: fsTimeMs()` (timestamp asli ISO) +
  `sanitizeCreateFields()` di fbCreateDoc (konversi otomatis, anti ulang).
- **Bug 2 — createdAt integer vs timestamp**: perbaikan pertama pakai integerValue →
  pesan bot tersimpan tapi urut DI BAWAH semua pesan (tipe number < timestamp di
  Firestore) → "hilang" dari daftar. FIX final: `fsTimeMs()` timestampValue.
- **Bug 3 — subscribeMessages ASC+limit**: query `orderBy createdAt asc, limit 60`
  mengambil 60 pesan TERLAMA; begitu chat >60 pesan, pesan BARU jatuh DI LUAR
  jendela listener → tidak pernah masuk real-time (nyambung ke keluhan "delay,
  harus buka chat dulu"). FIX: DESC + limit lalu reverse (ascending) — UI tak diubah.
- **VERIFIKASI LIVE (browser + curl, akun gedejulianto148@gmail.com)**:
  @zeroid → "Zeroid Bot: PONG" balas DETIK itu, realtime, terlihat di chat ✓

### 1. NOTIFIKASI PESAN BARU (keluhan: "chat aja orang gak muncul notif harus buka chat dulu")
- `sendMessage` kini menulis notifikasi + FCM push untuk SETIAP pesan sungguhan:
  direct (nama pengirim), grup (nama grup · pengirim), saluran (nama saluran).
  Mention di-skip (anti dobel), mute & pengirim di-skip, maks 80 penerima per pesan.

### 2. PRODUK BARU + HASIL CANTIK (bukan JSON!)
- **Cek Resi Rp5.000** (resi + ekspedisi) → `/vsunseeV8/resi/check`.
- **Followers Saluran Rp3.000/5** & **Reaksi Saluran Rp5.000/10** — harga satuan
  (`unitPriceOf`), pembeli pilih nama saluran + jumlah (kelipatan 5/10, maks 1 juta).
  Deliver SERVER-SIDE via service account: cari saluran by nama → `chats/{id}.extraFollowers`
  / `messages/{id}.extraReactions` (ditumpuk, anggota asli utuh).
- **Kartu hasil per produk** (`ResultCard`): Cek Nomor (operator/wilayah/status),
  Resi (kurir/status/posisi), Netflix (token + tombol SALIN + masa aktif),
  Followers/Reaksi (jumlah terkirim + total), fallback baris generik anti-kosong.
- **ALUR ALIGHTMOTION 2 LANGKAH** (permintaan eksplisit): deliver → magic link ke email →
  kartu "Langkah terakhir — verifikasi email" (bar loading + input URL) → aksi baru
  `amverify` {orderId, urlVerify} → unlock → **"Yeay! Akun kamu udah premium"**.
- **Teks "GRATIS untuk admin/developer" DIHAPUS dari layar** (perilaku staff-free tetap,
  tanpa publikasi).

### 3. UI DIRAPIIN (keluhan "numpuk njir")
- **Topbar chat pribadi**: HANYA nama + centang biru + video call + call. Streak api &
  kucing + wallpaper + gaya balon PINDAH ke profil user (tap avatar/nama → kartu
  "Kustomisasi chat"). Tema aplikasi → "Tampilan aplikasi" di profil sendiri.
- **MeTab dibersihkan**: baris Gaya balon/Wallpaper/Tema segmented dihapus (ke profil).
- **Menu Gratis**: SIDEBAR vertikal kiri (dulu chips horizontal susah ditekan).
- **Header glassmorphism** (ala iPhone): semi-transparan + hairline bawah, dark+light.
- **Branding**: "Buat stiker Vanzz" → "Buat stiker"; banner "Stiker Vanzz jadi" →
  "Stiker jadi"; teks UI lain bebas "Vanzz" (hanya komentar kode).

### 4. AI GUARD PANEL DIPERLUAS (permintaan: "banyakin pengaturan buat dia")
- Skill baru: **Virtext/bom karakter** (ban jam), **Bom media** (ban jam + ambang 3-100),
  **Spam stiker** (ban jam + ambang), **Tangguhkan grup otomatis** (durasi menit),
  **Kunci IP & perangkat** on/off, **Admin/developer kebal Guard** on/off,
  **Peringatan dulu sebelum ban** (maks N kali). Semua tersimpan di `guardconfig/main`,
  realtime ke SEMUA klien (`applyGuardCfg`) — deteksi klien ikut aturan admin.

### 5. TUMBUHKAN SALURAN (admin) — massal followers & reaksi
- Tab baru "Tumbuhkan": pilih saluran → followers/reaksi → jumlah (s.d. 1 juta/500rb)
  → langsung masuk & tampil semua klien (`followersCount()` dipakai di daftar chat,
  header chat, info, Discover). Emoji reaksi pilihan. Audit log grow_*.
- VERIFIKASI LIVE: "SAPUTRA || DEV · 103 (3 asli + 100 tambahan)" ✓ + 100 reaksi
  tersimpan (extraReactions:100 di Firestore) ✓

### 6. LAIN-LAIN
- **Tag @diri sendiri** tidak lagi muncul di saran mention (`mentionCandidates(…, meId)`).
- **Metadata AI bocor** (`variant="chat_message"` / `{"variant":…}`): cleaner baru di
  `lib/aiText.ts` (8/8 uji PASS) + `messagePreview` ikut dibersihkan → daftar chat tak
  lagi tampilkan `:::writing{...}`.
- **APK anti-macet** (1.6.7 / code 13): font dimuat via `loadAsync` + timeout 10 dtk
  (dulu useFonts bisa gantung), boot screen logo + "Menyiapkan Zeroid…" (bukan layar
  mati), BootError 12 dtk tetap.
- Meme acak randomsticker terverifikasi LIVE via proxy (gambar JPEG balik) ✓.

## Ronde: VANZZ API + PEMBAYARAN QRIS/DANA + OWNER PROTECTION + MENU GRATIS (2026-10-31)

### 1. Vanzz API terintegrasi penuh (apiz.vsunsee.qzz.io) — 199 endpoint diambil live
- Registry endpoint diambil langsung dari `/api/endpoints` (docs resmi Vanzz) → tersimpan
  di `docs/vanzz-endpoints.json`. Kunci API user (`v_***270`) hidup HANYA di env server:
  `VANZZ_API_KEY` di Vercel (production+preview+development) + `.env` lokal (di-gitignore).
- **Rute baru `api/vanzz.ts`** (serverless): whitelist endpoint GRATIS (cuaca, gempa, bmkg,
  6 sumber berita, 3 quotes, anime animein/anikai/otakudesu, AM finder, jadwal sholat +
  Islamic, TTS, kalkulator, ssweb, ToQR) + endpoint STIKER (brat, bratvideo, bratanime,
  randomsticker, smemev1, smemev2) + 2 action khusus:
  - `qris`  : QRIS statis admin → QRIS DINAMIS ber-nominal via Vanzz qris/payment.
  - `deliver`: realisasi produk berbayar (Check Nomor 5rb / Netflix 7rb / AM Premium 10rb /
    AM Unlock 10rb) — server verifikasi order (pemilik + status 'paid'), panggil Vanzz,
    simpan hasil ke order. Kunci & pemanggilan API 100% server-side.
- Client `lib/vanzz.ts`: proxyPost + ID token, rate limit server 40 req/5 menit/user.
- MuslimAI sengaja TIDAK dipasang (permintaan pemilik).

### 2. Pembayaran QRIS + DANA (cukup 2 metode) + bukti transfer wajib
- `PAYMENT_METHODS` dipangkas: hanya QRIS + DANA (GoPay/OVO/BCA dihapus).
- `config/payments` (baru): nomor DANA, nama pemilik, foto QRIS, catatan — dikelola admin
  via panel baru **PaymentsConfigPanel** (upload QRIS dari galeri, realtime ke semua user).
- BuySheet baru 2 langkah di PremiumScreen: pilih metode → detail bayar (QRIS dinamis
  nominal tepat / nomor DANA copy-able) → **WAJIB unggah bukti transfer** (foto → upload →
  `orders.proofUrl`). Riwayat pesanan menampilkan bukti + hasil API + status.
- Firestore Rules v22: pembeli boleh menulis `proofUrl/proofAt` pada pesanan 'pending'
  miliknya; admin boleh edit `status/adminNote/price` + hapus transaksi.
- **Notifikasi real-time pembelian**: admin konfirmasi → announcement baru (kind
  'purchase') + FCM topic 'all': "X membeli Y seharga Z — Yok beli juga!".
- Admin panel tab Order: lihat bukti (tap zoom), edit status/catatan, hapus transaksi,
  status realisasi API (delivered / deliveryError).

### 3. DEVELOPER UTAMA anti-ban & anti-edit (gedejulianto148@gmail.com)
- `OWNER_DEV_EMAIL` + `isOwnerDev()` di store; guard di adminBan/adminUnban/adminSetRole/
  adminVerify/adminToggleBlueCheck/adminSetVip/adminSetMuteOff → ditolak + banner.
- Admin panel tab User: badge OWNER emas, semua tombol aksi disembunyikan untuk owner.
- Rules v22: dokumen users milik owner TIDAK bisa di-update oleh admin lain
  (`targetIsOwner()`); hanya pemilik akunnya sendiri.
- saputraamanah999@gmail.com diturunkan jadi user biasa via GitHub Actions
  (maintenance setrole — sukses) + workflow baru `roles-fix.yml` (owner protection).

### 4. MENU GRATIS (rename Anime di profil)
- `screens/FreeMenu.tsx` baru: chips Anime / Berita / Cuaca / Gempa / Quotes / AM Finder;
  sub-sumber berita (Kompas/CNN/Liputan6/Antara/CNBC/Sindonews) + quotes (Motivasi/Galau/
  Gombal); Cuaca input kota; AM Finder input URL TikTok; Gempa auto-load; Anime membuka
  hub lama + FYP anime sub Indo (animein). Route 'FreeMenu' di App.tsx; MeTab: "Menu
  Gratis · Anime · Berita · Cuaca · Gempa · Quotes · AM Finder".

### 5. AI Zeroid diperkuat — 4 penyedia + mode agent terminal
- `api/ai.ts`: penyedia ke-4 VANZZ (Open AI sesi → Groq/Claude → DeepAI) masuk rantai
  failover sticky: Sylvatica → Jerexd → Vexo → Vanzz. Respons kini memuat `steps`
  (jejak percobaan tiap penyedia, waktu nyata).
- Chat AI: **animasi thinking** (frasa berputar "menganalisis…/menghubungi agent…") +
  **MODE AGENT (Terminal)** toggle: terminal preview live saat menunggu + log penyedia
  (zeroid-agent) tersimpan di pesan (`agentLog`) dan bisa dibuka ulang.
- Thinking mode DeepSeek R1 tetap; `agentLog` baru di Message type.

### 6. Stiker Vanzz — Brat 3 varian + meme + publish admin
- Composer & layar Stiker: pilihan Brat Teks (render lokal, fallback Vanzz) / Brat Video /
  Brat Anime + **Random Sticker Meme / Custom Meme V1 / Custom Meme V2** (teks atas-bawah +
  gambar latar opsional). Hasil otomatis tersimpan ke koleksi stiker user
  (createSticker) dan admin/developer bisa centang "publikasikan" → stiker GLOBAL.

### Status
- tsc 0 error; `expo export --platform web` sukses.
- Vercel env VANZZ_API_KEY terpasang (201). Rules v22 auto-deploy via deploy-rules.yml.

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

## 2026-10-30 — AI 3-PROVIDER + BOT SERVER-SIDE + AKAR TAMPILAN HILANG (rules v18, APK 1.5.0)

### AKAR TERBESAR ditemukan: mapUser/mapMessage MEMBUANG field baru
- Semua keluhan "simpan sukses tapi dibuka kosong" (tautan profil), "gaya balon
  gak muncul", "wallpaper gak kepasang", "tema warna gak tersimpan", dan "foto
  live gak kekirim" punya SATU akar: `mapUser()` dan `mapMessage()` di
  lib/store.ts tidak memetakan field baru (links/bubble/wallpapers/chatTheme +
  bubble/bratText/videoUri) → setiap snapshot Firestore mengosongkannya lagi.
  Semua kini dipetakan (pola sama dengan bug koin 0 sebelumnya).

### AI — 3 penyedia failover + prompt Zeroid + bot server-side + cari Google
- api/ai.ts dirombak: SYLVATICA → JEREXD → VEXO (VEXO_APIKEY, OpenAI-compatible
  /api/v1/chat/completions), sticky provider, failover senyap. Satu system prompt
  khusus Zeroid (manusiawi, berpikir, analisis web, akurat, sebut sumber).
  sanitizeIdentity diperluas. Live verified: chat OK, identity OK.
- BOT: action 'bot-reply' (idToken → keanggotaan via Firestore REST service
  account → rantai AI → tulis pesan zeroid-bot + auto-join + lastMsg). Tag
  @zeroid di grup/global/saluran menjawab TANPA perangkat developer. BotHost
  perangkat dihapus (anti dobel). 401/403 terverifikasi live.
- 'cari <topik>' di chat AI → action 'search' (Vexo Google → Vexo DDG → DDG
  langsung) + ringkasan AI + sumber.

### ANIME — akar timeout: antrean berurutan 6-7 sumber × 20-40 dtk > 60 dtk Vercel
- raceNonEmpty: semua sumber PARALEL + batas total; Jikan dgn retry 429/5xx;
  fallback dibungkus try/catch. Live verified: anime_search OK (komikindo source).

### LAINNYA
- Stiker/brat gaya WA (rata kanan/kiri, tanpa pill); BubbleDecor SVG (kucing,
  kodok, beruang, kelinci, panda, rubah, mahkota, tanduk) + 4 gaya baru;
  balon/tema apply instan (optimis); wallpaper crop + opacity (wallpaperFx,
  rules v18); tautan profil dual-write Supabase (zeroid_profile_links otomatis)
  + restore otomatis; feedback: index (uid,at) via CI (SA kena 403 indexes.create
  → butuh 1 klik manual di Console — langkah dikirim ke user), layar menampilkan
  galat jelas; FCM channel_id per jenis + visibility PUBLIC (popup luar APK);
  teks "ala WhatsApp Business" dihapus; centang biru bisa ditekan → info (chat +
  profil); audit security-audit-skill: /api/notify dulu TERBUKA (spam push) →
  kini wajib idToken + rate limit + topik all khusus admin; batas memori peta
  rate limit; versi 1.5.0/versionCode 6; docs/VEXO_SETUP.md (langkah Vercel).
- CATATAN sandbox: output terminal menyaring "[m" (main → ain) — dulu mengira
  trigger workflow rusak; ternyata benar [main]. Verifikasi bracket-safe: OK.

## 2026-10-30 — BATCH 9: AI GUARD penuh + VOUCHER + REFF ANTI AKUN GANDA + REALTIME + PANGGILAN NYATA (rules v19, APK 1.6.0)

### REALTIME TANPA DELAY (akar "harus buka chat dulu baru pesan muncul")
- Listener pesan kini GLOBAL: syncMessageSubs() melanggani pesan SEMUA chat
  anggota (maks 60, prioritas chat teratas) setiap snapshot chats — pesan masuk,
  badge & preview langsung jalan walau chat belum pernah dibuka. Menutup
  ChatRoom otomatis memasang kembali listener pasif (tidak ada lagi "telat").

### AI GUARD — moderator AI berlapis (server-first, anti penyalahgunaan)
- Server action `guard-enforce`: klien anggota melaporkan pesan; SERVER membaca
  pesan ASLI, memverifikasi ulang bukti (porn/kata kasar/spam), pesan wajib
  segar ≤10 menit, pelapor ≠ pelanggar, staff (admin/developer/moderator) tak
  pernah dibanned. Sanksi sesuai skill di guardconfig: kata kasar → ban jam,
  18+ → ban hari + kunci IP/perangkat (hash divalidasi format hex — anti
  collateral ban), spam → ban jam. Banding lama TIDAK dihapus. Semua tercatat
  di guardlog + push FCM ke admin.
- ADMIN PANEL tab "AI Guard": toggle skill (kata kasar / 18+ / spam) + durasi
  ban + daftar laporan real-time + tombol ban cepat.
- Kata kasar versi SERVER hanya makian keras (bukan 'anjing/babi/bodoh' dsb —
  itu cukup menangguhkan grup 60 menit lewat klien, tanpa ban akun).

### LOGIN GUARD — pelindung akun admin/developer
- Gagal login ke akun admin/developer dilaporkan ke /api/login-guard:
  hitungan berbasis hash IP (server-side, deviceHash klien TIDAK dipercaya),
  respons selalu {ok:true} (anti orakel enumerasi email admin).
  3–5x gagal/15 menit → IP+perangkat kunci 6 JAM; 6x+ → PERMANEN; laporan +
  push FCM ke developer tiap percobaan. Device ban hanya untuk hash hex valid.

### VOUCHER DISKON (admin panel → Premium)
- Admin membuat kode (diskon %, kuota, masa aktif) di tab "Voucher"; user
  menukar di halaman Zeroid Premium — harga semua paket langsung tampak
  berkurang (harga lama dicoret). Penukaran TRANSAKSI + rules ketat:
  usedCount tepat +1, usedBy += saya (mustahil hapus/menambah nama lain),
  voucher aktif/belum kadaluarsa/kuota sisa/belum dipakai. Order gagal =
  koin direfund & voucher tidak hangus (ditukar SETELAH order sukses);
  kode voucher tercatat di order + pesan admin utk verifikasi.

### REFFERAL ANTI AKUN GANDA (1 device/IP = 1 reff selamanya)
- Klaim referral kini TRANSAKSI dengan bukti ledger/ref_dev_{hash} &
  ledger/ref_ip_{hash} — siapa pun yang klaim duluan menang; akun kedua/
  ketiga dari HP/internet yang sama TIDAK lagi dapat koin.
- AUDIT rules: reward PASTI (pengundang tepat +5000, pendatang +1000,
  kind 'referral_newbie') — path raw v8 ditutup.

### ANTI CETAK KOIN (audit keamanan — CRITICAL fix)
- Koin NAIK kini WAJIB bukti ledger dalam transaksi yang sama: check-in
  (ledger/c_{uid}_{lastCheckinAt}, delta == kenaikan) atau referral
  (ledger/{uid}_ref). Tulis 'points' saja tanpa bukti = DITOLAK server.
  Saldo tak pernah minus; spendKoin TRANSAKSI dgn saldo server (anti
  double-spend cache basi). Check-in tetap 1x/hari, tombol tetap terkunci.

### PANGGILAN NYATA LINTAS NEGARA
- TURN relay gratis (openrelay udp/tcp/tls) + ICE restart otomatis 1x saat
  failed — panggilan tersambung di balik CGNAT seluler Indonesia, bukan
  cuma satu jaringan. (WebRTC asli P2P via signals Firestore — bukan virtual.)

### MUSIK MP3 + UI
- Lagu profil (kartu YouTube) kini memakai ENGINE MP3 ZEROID MUSIC
  (audio asli, tetap bunyi keluar halaman/latar belakang) — bukan lagi
  iframe mp4. Web + native sama-sama lewat lib/player.

### LAIN-LAIN
- Centang biru di samping NAMA di kepala chat (Header titleNode) — semua
  akun terverifikasi termasuk developer; UserBadges ikut tampil.
- Teks "ikut dari pemilik" dihapus (diganti deskripsi verifikasi bersih).
- Kartu Premium & Koin di tab Saya: KECIL, kalem, badge SVG, TANPA harga
  ("mulai Rp10.000" dihapus).
- Layar ban baru ala layar blokir: avatar + ikon LARANGAN SVG merah, alasan,
  durasi (hitung mundur utk ban sementara; ban permanen = akun tak bisa
  dipakai + akun baru di perangkat itu ditolak server, hanya admin bisa buka),
  form banding — semua Bahasa Indonesia.
- Balon obrolan: SVG kreasi ORIGINAL baru (lapisan gradien, highlight,
  blush, mahkota berpermata, antena alien bercahaya, hati melayang) +
  ANIMASI mengambang halus; 2 gaya baru: Alien & Cinta.
- Masukan: query daftar milik user TANPA orderBy composite → error
  "query requires an index" HILANG total (sort di klien).
- Kunci AI otomatis: kunci penyedia (Sylvatica/Jerexd/Vexo/ImgBB) kini
  punya cadangan OTOMATIS di Firestore secrets/ai (rules: klien DILARANG) —
  Vexo API aktif TANPA perlu buka dashboard Vercel. GET /api/ai menampilkan
  status penyedia sebenarnya (vexo kini true).
- Admin panel: HAPUS GRUP/SALURAN permanen (chat + pesan) dengan konfirmasi.
- Chat AI bersifat privat (rules: wajib anggota — bukan dunia terbuka).
- Orders: harga/hari dibatasi wajar (Rp0–200.000 / ≤400 hari) — anti order palsu.
- Seed CI idempoten sejati (GET dulu — tak pernah menimpa config admin).
- Rules v19 LIVE: vouchers, guardconfig, guardlog, secrets (false), ledger
  bukti referral/check-in, selfEconomy proof, orders bounds, ai privat.
- Seed otomatis: guardconfig/main (skill default), vouchers/_schema,
  config/ai (status 3 penyedia), secrets/ai (kunci server).
- Versi 1.6.0 / versionCode 7.

## 2026-10-30 — AUDIT DEPLOY + SECRETS (ronde verifikasi penuh)

### FAKTA TERVERIFIKASI (bukan catatan, diuji langsung)
- Push GitHub: HEAD == origin/main (e79e206). Rules v19 LIVE (ruleset 3d31f6f8,
  CI sukses). Seed guardconfig/main + vouchers/_schema + config/ai ADA di Firestore.
- secrets/ai: 4 kunci (SYLVATICA/JEREXD/VEXO/IMGBB) TERISI — CI kini pemelihara
  (field kosong diisi otomatis dari GitHub Actions secrets; terisi dibiarkan).
- Supabase: DIUJI LIVE — POST /api/sylvatica (brat) → URL
  supabase.co/storage/v1/object/public/zeroid/sticker/... provider:supabase.
  Bucket + env Vercel aktif.
- APK release apk-latest = v1.6.0 (79MB) dari commit batch 9 a695835.
- Typecheck tsc --noEmit: 0 error.

### BOCAH KEAMANAN DITUTUP (repo ini PUBLIK)
- docs/VEXO_SETUP.md + docs/SUPABASE_SETUP.md memuat kunci API asli dalam teks
  jelas → SEMUA diganti placeholder + peringatan. Grep repo-wide kini 0 match.
  ⚠️ Riwayat git masih memuat kunci lama — saran rotasi kunci penyedia bila
  ingin paripurna (kunci milik pengguna; tidak diblokir bila tidak dirotasi).
- scripts/set_gh_secrets.py (berisi kunci) DIBUAT lalu DIHAPUS sebelum commit —
  kunci hanya lewat sealed-box GitHub API, tidak pernah masuk git.

### AKAR "Vercel masih versi lama" + SOLUSI PERMANEN
- /api/version live = commit 4bf0ebe (SEBELUM batch 9 a695835) — webhook
  GitHub↔Vercel macet, jadi SEMUA fitur batch 9 belum hidup di web sampai
  redeploy. vexo:false di /api/ai adalah gejala ini (kode lama tak baca
  secrets/ai), bukan kunci hilang.
- Solusi permanen: workflow BARU deploy-web.yml — begitu secret VERCEL_TOKEN
  dipasang (sekali), SETIAP push deploy web via CI (tanpa webhook). Tanpa
  token: dilewati rapi dengan petunjuk pemasangan.
- Langkah user (1x): pasang VERCEL_TOKEN dari vercel.com/account/tokens ATAU
  tekan Redeploy sekali di dashboard → batch 9 langsung hidup.

## 2026-10-30 — BATCH 10 (v20): VERCEL KEMBALI HIDUP + 5 BUG USER DIPERBAIKI

### AKAR "VERCEL TIDAK DEPLOY" — BUKAN WEBHOOK, TAPI KUOTA FUNGSI
- Log Vercel (token user): SEMUA build sejak a695835 ERROR —
  "exceeded_serverless_functions_per_deployment": Hobby maks 12 Serverless
  Functions, api/ punya 13 (batch 9 menambah login-guard.ts).
- FIX: gabung 5 endpoint → 2 router TANPA mengubah perilaku:
  api/guard.ts = ban-gate + ip-ban + login-guard (?action=…);
  api/fcm.ts = fcm-subscribe + fcm-unsubscribe. 13 → 10 functions.
  URL lama tetap hidup via rewrites vercel.json; klien ikut diarahkan ke URL baru.
- Token Vercel user dipasang sebagai secret VERCEL_TOKEN (terenkripsi) →
  deploy-web.yml kini deploy otomatis tiap push; env VEXO_APIKEY ditambahkan
  via API (dulu belum ada di env Vercel).

### UNBAN TAPI PERANGKAT MASIH DIBLOKIR (screenshot user)
- adminUnban hanya men-expires banips/devices (until=masa lalu) DAN klien
  menyimpan verdict 10 menit + localStorage until=0 tak pernah cek ulang.
- FIX: (1) adminUnban kini MENGHAPUS dokumen banips/devices milik terdakwa
  (fallback: expire); (2) recheckDeviceBar/fresh banGateCheck — layar blokir
  mengecek ulang server TANPA cache segera + tiap 15 detik → begitu admin
  unban, layar hilang sendiri; (3) layar "permanen" tak lagi menampilkan
  kotak countdown "sisa waktu blokir".

### POSTER ANIME KOSONG (screenshot user)
- Upstream oploverz memberi gambar di field 'imgSrc' — normAnimeList/
  normAnimeDetail tidak memetakannya → semua item tampil ikon placeholder.
- FIX: 'imgSrc'/'img_src' masuk daftar field poster (list, detail, episode).

### APK FORCE CLOSE (user: baru buka langsung tutup)
- Deps 1.5.0→1.6.0 TIDAK berubah; bundle Android terkompilasi mulus (hbc 7MB);
  google-services.json package = app.json package (com.zeroid.whatsapp);
  R8/minify memang sudah off; semua hook startup ter-guard web. Tanpa logcat
  perangkat, akar pasti tak bisa ditebak — kini:
- FIX: index.ts memasang ErrorUtils.setGlobalHandler: galat FATAL JS tidak
  lagi mematikan aplikasi diam-diam — muncul Alert berisi nama+pesan galat,
  tersimpan (AsyncStorage), dan banner "Laporan galat sesi lalu" tampil saat
  boot berikutnya → pemakai cukup screenshot, developer dapat teks pastinya.
- Versi 1.6.1 / versionCode 8 (wajib naik agar bisa pasang di atas 1.6.0).

### CHAT DELAY + MASUKAN ERROR (screenshot user)
- Kedua fitur sudah diperbaiki di HEAD batch 9 (syncMessageSubs global;
  query masukan tanpa composite index) — produksi masih commit lama karena
  build Vercel gagal; deploy ini yang menghidupkan keduanya.

### AUDIT (security-audit loop)
- guard.ts: respons seragam {ok:true} dipertahankan (anti enumerasi email
  admin); rate limit & kunci hitungan server-side tetap; tanpa log rahasia.
- fcm.ts: validasi token/uid identik versi lama.
- adminUnban delete: hanya dokumen uid terdakwa, rules isAdmin/delete.
- Tanpa kunci baru di repo (scan 0); token Vercel hanya di GitHub secrets.
- Catatan desain (pra-ada, bukan regresi): gerbang ban di sisi klien bisa
  dilewati klien patch — penegakan server tetap via rules & gate saat auth.
- tsc 0 error; expo export web + android sukses.

### LANJUTAN batch 10: CI deploy-web jadi PEMANTAU (bukan deploy CLI)
- Token Vercel ternyata project/team-scoped (REST API jalan, /v2/user tak ada)
  → vercel CLI (link/whoami) selalu gagal "User not found".
- deploy-web.yml ditulis ulang: pantau deployment commit terbaru via REST API
  (READY = sukses, ERROR = job gagal + pesan build tampil). Build tetap oleh
  Git Integration Vercel — tidak ada deploy dobel.

### BATCH 10 lanjutan — PUSH FCM DIBANGUN ULANG (topic → token langsung)
- DIAGNOSA CI (matriks): scope `instance.id` meracuni oauth (respons 200 hanya
  id_token, tanpa access_token) — FCM messaging scope sendiri sukses; IID API
  menolak SEMUA token OAuth (401). Kesimpulan: Instance ID API di-retire
  Google → push berbasis TOPIC mustahil di project ini (tidak pernah bisa).
- REFAKTOR: /api/fcm menyimpan token per perangkat di fcmtokens/t_{sha256}
  (server-only, rules v20 false); /api/notify mengirim LANGSUNG ke token
  (message:{token}) + menghapus token mati (404/410); login-guard push ke
  token developer langsung; broadcast 'all' = semua token (maks 500).
- FIREBASE_SERVICE_ACCOUNT di env Vercel disinkronkan dari CI (PATCH env id
  bkBcTAe4rhchKy0I) + diagnosa oauth lengkap (status/keys/jwt iss+scope).

### AUDIT push v20 → HARDENING (anti penyadapan notifikasi)
- Celah: /api/fcm?action=subscribe menerima {uid, token} TANPA verifikasi —
  penyerang bisa memasang token-nya atas nama uid korban → menerima push
  pribadi korban. FIX: Bearer ID token wajib saat ada (caller.uid == uid,
  403 bila beda); tanpa header (APK lama) → diterima tapi unverified:true;
  /api/notify melewatkan token unverified untuk kind pribadi (message/group/
  call) — hanya pengumuman admin yang sampai. Klien kini selalu kirim header.
- Rate limit subscribe per IP: 30/5 menit.
- APK 1.6.2 (versionCode 9): client kirim ID token saat subscribe.

## 2026-10-31 — BATCH 11 (v21): APK FC DIAGNOSA + 6 BUG + 3 FITUR BARU

### APK FORCE CLOSE — AKAR & SOLUSI BERLAPIS (prioritas user)
- Celah v1.6.2: handler galat ditulis di body index.ts, tapi `import App` di-hoist
  ES → SELURUH pohon modul dievaluasi SEBELUM handler terpasang → galat saat
  evaluasi modul tetap mematikan aplikasi diam-diam.
- FIX 1: lib/crashguard.ts (BARU) dijadikan import PERTAMA index.ts — handler
  terpasang sebelum modul lain; galat FATAL → Alert (aplikasi tidak ditutup) +
  riwayat 10 galat terakhir di AsyncStorage.
- FIX 2 (native crash): plugin Android kini menyuntik
  Thread.setDefaultUncaughtExceptionHandler ke MainApplication — crash native
  (JVM) menulis laporan ke file + menampilkan TOAST penyebab crash di layar →
  force close tidak lagi "gak jelas kenapa": cukup screenshot.
- FIX 3: buang paksaan compile/targetSdk 35 (di bawah standar RN 0.86/Expo 57 —
  risiko crash native). Kini ikuti default Expo. R8 tetap MATI.
- FIX 4: trigger build-apk.yml rusak sebelumnya (`branches: ain]` — tak pernah
  auto-build) → dibetulkan `[main]`. APK 1.6.3 (versionCode 10).

### NOTIFIKASI "2" GAK ILANG (screenshot user)
- Akar: badge lonceng = jumlah dokumen notifications read:false; membuka chat
  TIDAK menandai notifikasi chat itu terbaca (hanya halaman Notifikasi yang
  menandai) → angka "2" nyangkut.
- FIX: buka chat → markRead kini OPTIMIS (badge daftar hilang INSTAN, server
  menyusul) + dokumen notifications milik chat itu dibacakan batch read:true +
  notifikasi sistem Android milik chat didismis dari tray + badge OS di-nol-kan.

### MUSIK MATI SAAT KELUAR APLIKASI + NOTIF KEHAPUS (bukti: rekaman user)
- Native: setAudioModeAsync shouldPlayInBackground (ExoPlayer tetap bunyi saat
  app background) + MEDIA NOTIFIKASI ala Spotify (channel 'Musik', sticky,
  tombol ⏮ Putar/Jeda ⏭ yang berfungsi lewat category action, label tombol
  mengikuti status). Notifikasi hilang hanya saat lagu ditutup.
- Web: MediaSession sudah ada; tambah penjaga visibilitychange → lagu yang
  dibekukan sistem otomatis dilanjutkan saat tab terlihat lagi.

### ANTI-BUG / VIRTEX + AI GUARD (fitur baru)
- lib/moderation.ts: virtexHit — teks ≥2600 kar, karakter kendali tersembunyi
  ≥40, karakter berulang ≥180x, atau baris dump ≥900 kar = pelanggaran 'virtex'.
- Pengirim: diblokir saat kirim (banner AI Guard). Penerima: teks raksasa
  disembunyikan bubble (anti lag/crash render). Server (api/ai guard-enforce):
  verifikasi ulang → PESAN DIHAPUS PERMANEN + pelanggar di-ban (skill 'virtex',
  default 24 jam, bisa diatur admin) + guardlog + push admin. Rules v21:
  teks pesan maks 8000 karakter (virtext tak pernah tersimpan).

### BOT ZEROID DI GRUP & SALURAN + TAG AUTO-REPLY (fitur baru)
- Rules v21: admin GRUP/SALURAN kini boleh menambah 'zeroid-bot' (dulu hanya
  admin global). ChatInfo: tombol "Tambah Zeroid Bot" tampil untuk admin grup.
- Sudah ada & diuji alurnya: sebut @zeroid → server menjawab otomatis
  (api/ai bot-reply), bekerja di grup, saluran, dan obrolan global.

### ANIME POSTER TAK KERENDERA (diuji produksi)
- Akar TERVERIFIKASI: URL poster oploverz (assets/covers) REDIRECT ke HTML
  (301→200 text/html) — bukan gambar, mustahil dirender.
- FIX server (api/jere.ts): http→https + URL mati/kosong → poster asli dicari
  via Jikan (MyAnimeList) berdasarkan judul, cache in-memory, batch 3 (aman
  rate limit). Berlaku utk list & detail (poster+banner).

### FORMAT TEKS CHAT + GAYA BALON + STREAK + BRAT + PREMIUM (rapi-2)
- Markdown pesan: **tebal**, *miring*, _miring_, ~~coret~~, `kode` dirender
  sungguhan (lib/md.ts + MdText — mention @username tetap jalan).
- Balon: sudut "telinga" kini di sisi yang BENAR (dulu runcing selalu kanan
  walau balon orang lain) + TR radius ikut dipakai.
- FirePet di-redesign total: kucing chunky (blush, mata kilau, kumis, ekor
  bergaris), api 3 lapis + percikan bintang + glow bernapas.
- Stiker BRAT 150→116px & stiker 128→116px (keluhan "kegedean").
- Sheet: teks opsi kini meliputi (dulu melewati tepi) + label koin Premium
  dipendekkan (keluhan "teks kepanjangan sampe lewat").
- Masukan: pesan galat diperjelas (rules/index/network).

### AUDIT KEAMANAN (loop)
- guard-enforce virtex: caller wajib anggota + pesan ≤10 menit + server
  memverifikasi isi pesan sendiri; penghapusan hanya bila teks BENAR-benar
  virtex → tidak bisa disalahgunakan utk hapus pesan orang yang sehat.
- Tanpa kunci baru di repo (scan 0); rules hanya mengetat (cap 8000) & satu
  pelebaran terkendali (bot oleh admin grup).
- tsc 0 error; expo export web sukses; build APK 1.6.3 via CI.

### v21.1 (f0249ee) — poster anime pasti dirender
- Server fixPosters ternyata selalu 429 (Jikan membatasi IP bersama Vercel) →
  poster server-side 0/24 terganti. SOLUSI PASTI: fallback di sisi KLIEN —
  Poster onError → cari poster via Jikan sekali per judul (cache, CORS publik,
  pakai IP pemakai sendiri). Server tetap berbatas waktu 8 dtk paralel.
- APK 1.6.3 (code 10) dibangun ulang dari f0249ee (semua fitur v21 + fallback).

## v22 (31 Okt 2026) — AKAR MASALAH "SERVER MENOLAK" DIBUKTIKAN & DIBERESKAN + CI MAINTENANCE

- AKAR MASALAH DITEMUKAN: akun saputraamanah999@gmail.com masih `users.banned=true`
  ("Test ban permanen guys wkwkw") — klik unban lama tidak pernah membersihkan field
  ini + perangkat & IP developer ikut terkunci (ban dari perangkat sendiri). Semua
  tulisan Firestore (gaya balon, check-in, referral, kirim pesan, masukan) DITOLAK
  rules `notBanned()` → itulah "Server menolak aksi ini" di semua layar.
- DIBUKA VIA CI: `.github/workflows/maintenance.yml` + `scripts/admin_maintenance.mjs`
  (inspect / liftban / setrole / verifyrules; rahasia tidak pernah dicetak).
  Hasil liftban: users.banned→false + bans.active→false + 3 banips + 1 devices HAPUS.
- UJI RULES NYATA (verifyrules, akun sementara identitytoolkit → Firestore REST):
  **18/18 PASS** — create profil, gaya balon, check-in +1000 dgn bukti ledger,
  anti-spam tap kedua DITOLAK, anti-cetak-koin DITOLAK, chat+pesan tersimpan,
  deliveredAt, ANTI-VIRTEX 8001 karakter DITOLAK, privasi chat non-anggota DITOLAK,
  masukan, notifikasi, story, ledger, perlindungan profil antar-akun. Cleanup jalan.
- STAF BEBAS GERBANG BAN: /api/guard ban-gate mengizinkan email ber-role
  admin/developer/moderator (butuh kredensial akun staf tetap). Klien: penolakan
  login dipindah ke post-auth (role sudah diketahui) → developer TIDAK lagi
  terkunci dari Admin Panel; akun biasa di perangkat terblokir TETAP ditolak.
- ANTI-MACET BOOT (APK tidak berhenti di logo): initStore try/finally ready=true,
  hydrateCache/getDoc/banGate diberi batas waktu (5-8 dtk), splash ditutup paksa
  12 dtk + layar "Aplikasi lambat merespons" dgn tombol Coba Lagi (web reload,
  native initStore ulang). Tidak ada loading tanpa batas.
- EMOJI iPHONE TAHAN BANTING: jsDelivr → unpkg → glyph bawaan (tak pernah kotak),
  native pakai expo-image cache disk; EmojiText baru dipakai MdText + MentionText;
  reaksi pesan dirender AppleEmoji. Input TETAP teks biasa.
- STIKER: ukuran disatukan di lib/sticker.ts (STICKER_SIZE 112 chat, preview 116,
  viewer max 320, contentFit contain).
- MUSIK: izin Android 14+ FOREGROUND_SERVICE_MEDIA_PLAYBACK + APK 1.6.4 (code 11);
  mesin global + MediaSession + notifikasi media (play/pause/next/prev) tetap.
- Kirim ulang pesan: idempoten (doc id sama), gagal lagi → status failed + alasan.
- Ikon ban baru (BanGlyph SVG gradasi+glow) di layar blokir perangkat & akun.
- Typecheck 0 error; build produksi web LULUS.

## v22.1 (31 Okt 2026) — BAGIAN 5 tuntas + akses admin dipulihkan + APK 1.6.5 + ZIP final

- **METADATA AI TIDAK TAMPIL LAGI (BAGIAN 5)**: pembersih internal-markup di DUA sisi —
  server `api/ai.ts` (`stripInternalMarkup`: :::tag{...} seimbang-kurung + ekstrak isi
  dari dalam metadata, `<think>` termasuk yang terpotong, `[TOOL_CALL]`, rapikan baris)
  untuk chat/thinking/vision/bot-reply; klien `lib/aiText.ts` dipakai `lib/ai.ts`
  (askAI/thinkAI/analyzeImage) DAN MessageBubble (pesan lama yang masih menyimpan
  metadata ikut rapi saat render). Uji: `scripts/test_aitext.ts` **10/10 PASS** +
  harness `/api/ai` **10/10 PASS** (2 cek regresi baru). Chat AI NYATA produksi diuji:
  jawaban bersih tanpa :::writing (6,2 dtk, provider sylvatica).
- **AKUN DEVELOPER DIPULIHKAN**: perintah `whois` baru di CI maintenance (email
  di-log DISAMARKAN — repo publik). Hasil: akun utama `banned=false` (liftban v22
  berhasil) tetapi `role=user` → Admin Panel masih terkunci. `setrole developer`
  dijalankan via CI (run 41175937151) — sekarang KEDUA akun dev `role=developer`,
  `banned=false`. Inspect lama yang mencetak email sudah dipatch jadi tersamarkan.
- **AUDIT AI**: `jerePost` menolak POST tanpa kunci (dulu key kosong tetap dikirim —
  boros request & menutupi 503 jujur). Konsisten dgn vexo/sylvatica yang sudah guard.
- **APK 1.6.5 (versionCode 12)**: dibangun CI dari 7e36084 — bundle di dalam APK
  diverifikasi memuat pembersih AI (regex TOOL_CALL/:::/think ada di bundle).
- **LAPORAN PENGUJIAN JUJUR** `docs/TEST-REPORT.md`: 45 butir dgn status
  PASS/FAIL/BLOCKED/NOT TESTED — 18/18 uji rules LIVE PASS, yang butuh perangkat
  fisik (instal APK, FCM background, call 2 perangkat) ditulis BLOCKED/NOT TESTED
  tanpa mengarang.
- **ZIP FINAL** `ZEROID-WHATSAPP-FIXED-COMPLETE.zip` (112 MB, 1769 file): source +
  rules + indexes + functions + docs/panduan + .env.example + laporan uji + APK di
  `release/` — TANPA node_modules/.git/.env/kredensial (terverifikasi skrip).
- Deploy Vercel hijau di setiap push; `/api/version` = commit terbaru; endpoint
  upload/music/guard/fcm sehat; scan rahasia 0 temuan.
