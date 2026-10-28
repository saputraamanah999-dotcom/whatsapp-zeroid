# Zeroid WhatsApp

Aplikasi chat realtime premium (Expo SDK 57 + TypeScript) yang berjalan sebagai **PWA web (deploy Vercel)** dan **APK Android (EAS Build)**. Seluruh data tersimpan di **Firebase** — Authentication, Firestore (realtime), Storage — tanpa mode demo, tanpa database lokal, tanpa akun palsu.

![stack](https://img.shields.io/badge/Expo-SDK%2057-1E6BFF) ![ts](https://img.shields.io/badge/TypeScript-strict-1E6BFF) ![firebase](https://img.shields.io/badge/Firebase-Auth%20%C2%B7%20Firestore%20%C2%B7%20Storage-FF9F0A)

---

## Fitur Utama

| Area | Fitur |
|---|---|
| **Autentikasi** | Register & login email/password, verifikasi email, reset password, Google Sign-In (opsional), Phone OTP (opsional), sesi persisten, hapus akun, proteksi halaman, gate akun dibanned/di-suspend |
| **Profil** | Foto profil & banner (upload ke Storage), username unik (reservasi unik lewat koleksi `usernames`), nama, bio, badge SVG (VIP, Member, Centang biru, Keamanan, Moderator, Admin, Developer), status online & last seen sesuai privasi, blokir, lapor |
| **Chat realtime** | Chat pribadi, grup, channel, global, asisten AI. Teks, emoji picker, stiker, foto (multi ≤4), video, dokumen, audio, voice note. Balas, edit (15 mnt), hapus untuk saya/semua, teruskan, bintangi, reaksi emoji, salin, lapor, pin/bisukan/arsip. Status **sending → sent → delivered → read** dengan optimistik UI + kirim ulang saat gagal. Typing indicator, online, pemisah tanggal, pagination (muat pesan lama), scroll-to-bottom |
| **Media** | Kompresi gambar di perangkat (resize ≤1600px, WebP/JPEG), unggah progres ke Firebase Storage, metadata lengkap (mime, ukuran, durasi, dimensi, path), thumbnail data-URL, validasi ukuran/tipe, preview + batal sebelum kirim |
| **Panggilan** | WebRTC voice & video call, signaling Firestore (dibersihkan otomatis), STUN Google + TURN opsional via env, layar panggilan masuk full-screen, mute/kamera/balik kamera, durasi, riwayat, tak-terjawab, deteksi sibuk, timeout 32 dtk, watchdog Cloud Function |
| **Story** | Teks berwarna & foto, aktif 24 jam (TTL dihitung server + pembersihan terjadwal), progress bar, viewer list, suka, balas ke DM, hapus, privasi balasan |
| **Grup & Channel** | Buat/edit grup & channel, undang anggota, link undangan (join by code), kelola admin grup, izin posting channel (`postPolicy: admins`), keluar/hapus anggota, daftar & cari grup/channel |
| **Notifikasi** | Banner in-app, pusat notifikasi per kategori (pesan/story/panggilan/admin), FCM via Cloud Functions (pesan, panggilan masuk high-priority, story), aksi Balas/Tandai dibaca/Terima/Tolak di notifikasi Android |
| **Pengumuman admin** | Banner global berwarna per level (info/penting/kritis), masa aktif, dismiss per pengguna, akhiri dari panel admin |
| **VIP & badge** | Badge SVG konsisten di profil/chat/anggota, halaman Premium dengan paket & pembayaran manual (pesanan dikonfirmasi admin), kelola VIP dari panel admin (grant/cabut per hari), masa aktif & kedaluwarsa otomatis |
| **Musik** | Pemutar **Spotify embed** (track/album/playlist) & **YouTube embed**, tempel link auto-deteksi, oEmbed resmi untuk judul/cover, jadikan lagu profil |
| **Asisten AI** | Panel AI di chat, dipanggil dari chat AI pribadi, ringkasan pesan terpilih, aksi cepat (terjemah, perbaiki tulisan, ringkas, bantu kode) — semua lewat **proxy server `/api/ai`** dengan rate-limit; kunci API **tidak pernah** berada di aplikasi |
| **Admin panel** | Dashboard statistik + grafik 7 hari, kelola pengguna (ban dengan alasan, peran user/moderator/admin, verifikasi, centang biru, OTP Gmail, VIP), pesanan, laporan pesan, konten (story/channel), pengumuman, mode pemeliharaan, **audit log** semua tindakan sensitif |
| **PWA** | Manifest, ikon maskable, service worker (cache statis + offline fallback, tanpa cache data privat), install prompt, tema warna, aman di-uninstall |
| **Keamanan** | Firestore & Storage rules ketat (field-level), role hanya lewat provisioning, audit log, rate-limit proxy AI, security headers, proteksi folder storage per kepemilikan |

## Struktur Project

```
├── App.tsx                  # Root: routing stack, gate auth/verifikasi/lock/ban/maintenance
├── api/ai.ts                # Vercel serverless proxy AI (kunci JEREXD server-side)
├── components/              # UI: Composer, MessageBubble, ChatRow, MediaPlayer, Hosts, ui.tsx, ...
├── screens/                 # Layar: Auth, Main (5 tab), ChatRoom, ChatInfo, Call, Story, Admin, ...
│   └── tabs/                # ChatsTab, CallsTab, StoriesTab, DiscoverTab, MeTab
├── lib/
│   ├── store.ts             # Store realtime Firestore (onSnapshot → snapshot, tulis optimistik)
│   ├── firebase.ts          # Init Firebase + layout koleksi
│   ├── media.ts             # Pipeline media: validasi → kompresi → upload progres → metadata
│   ├── webrtc.ts            # CallSession WebRTC + signaling Firestore + TURN
│   ├── ai.ts                # Klien proxy /api/ai (tanpa brain offline)
│   ├── icons.tsx            # Sistem ikon & badge SVG kustom (anti-emoji-icon)
│   ├── products.ts, spotify.ts, mail.ts, notify.ts, permissions.ts, theme.ts, types.ts, format.ts, bus.ts
├── functions/index.ts       # Cloud Functions: FCM fan-out + pembersihan terjadwal story/sinyal
├── firestore.rules          # Rules ketat (field-level, anti privilege-escalation)
├── storage.rules            # Rules per-path + batas ukuran/tipe
├── firestore.indexes.json   # Index query gabungan
├── pwa/                     # manifest, service worker, offline.html, ikon
├── scripts/                 # pwa-postbuild.js, gen_pwa_icons.py
├── docs/                    # FIREBASE_SETUP, DEPLOYMENT, TESTING, ANDROID_FIREBASE, FEATURE_LIST
└── vercel.json              # Build web, SPA rewrite, security headers
```

## Mulai Cepat

```bash
# 1. Install dependensi
npm install

# 2. Konfigurasi Firebase (wajib — aplikasi menolak jalan tanpa ini)
cp .env.example .env
#   → isi EXPO_PUBLIC_FIREBASE_* dari Firebase console (lihat docs/FIREBASE_SETUP.md)

# 3. Jalankan mode pengembangan
npx expo start --web        # PWA di browser
npx expo start --android    # di perangkat Android (Expo Go / dev build)
```

## Build & Deploy

```bash
npm run build:web           # expo export + injeksi PWA → dist/
npm run deploy              # vercel --prod (butuh vercel CLI + env server JEREXD_APIKEY)

# Android APK (EAS Build)
npm i -g eas-cli && eas login
eas build -p android --profile preview
```

Panduan lengkap: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) · [docs/FIREBASE_SETUP.md](docs/FIREBASE_SETUP.md) · [docs/ANDROID_FIREBASE.md](docs/ANDROID_FIREBASE.md)

## Konfigurasi Environment

Semua variabel, contoh, dan peringatan keamanan ada di [.env.example](.env.example). Ringkas:

- **EXPO_PUBLIC_FIREBASE_*** — wajib; kredensial web app Firebase (bukan rahasia, diproteksi rules).
- **EXPO_PUBLIC_ENABLE_GOOGLE / _PHONE** — opsional; tampilkan Google/Phone login.
- **EXPO_PUBLIC_TURN_*** — opsional; server TURN untuk WebRTC di jaringan NAT ketat.
- **JEREXD_APIKEY** — **server-side saja** (Vercel env); dipakai proxy `/api/ai`. Tidak boleh di-EXPO_PUBLIC.
- **CATBOX_USERHASH** — server-side; disiapkan untuk kebutuhan upload pihak ketiga bila diperlukan.

## Provisioning Role Admin & Developer

Role **tidak dapat** diberikan lewat form atau mengubah request frontend — Firestore rules memblokirnya. Cara provisioning:

1. **Admin pertama**: masuk dulu sebagai pengguna biasa, lalu di Firebase console → Firestore → `users/{uid}` → tambah field `role: "admin"`.
2. **Admin berikutnya**: berikan lewat panel Admin → tab User → pilih peran.
3. **Developer**: hanya lewat Firebase console (field `role: "developer"` atau `developer: true`) — sengaja tidak diekspos di panel agar provisioning tetap tepercaya.

Setiap tindakan sensitif admin tercatat di koleksi `audit_logs` (append-only).

## Pengujian

Lihat [docs/TESTING.md](docs/TESTING.md) untuk daftar pengujian yang **sudah dijalankan** (TypeScript strict, build produksi web, smoke test browser, uji PWA aset) dan yang **memerlukan kredensial/layanan eksternal** (realtime Firestore dengan kredensial nyata, FCM, WebRTC antar-perangkat, proxy AI dengan kunci aktif). Kami tidak mengarang hasil pengujian.

## Lisensi

Lihat [LICENSE](LICENSE).
