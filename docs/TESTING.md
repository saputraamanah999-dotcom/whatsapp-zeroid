# Pengujian — Zeroid WhatsApp

> Prinsip: **hanya melaporkan yang benar-benar dijalankan.** Pengujian yang membutuhkan kredensial nyata, perangkat fisik, atau layanan eksternal dicantumkan apa adanya di bagian "Belum dapat diuji di lingkungan pengerjaan".

## 1. Yang sudah dijalankan dan LULUS ✅

| Pengujian | Perintah / cara | Hasil |
|---|---|---|
| TypeScript strict (`tsc`) | `npm run typecheck` (`tsc --noEmit`) | **0 error** (seluruh app, api/, components/, screens/, lib/) |
| Build produksi web | `npx expo export --platform web` | **LULUS** — 1252 modul, bundle 3.5 MB, 12 aset |
| Post-build PWA | `node scripts/pwa-postbuild.js` | manifest + SW + ikon tersalin, meta & registrasi SW terinjeksi ke `dist/index.html` |
| Aset PWA ter-serve | `http.server` + curl | `/` 200, `/manifest.webmanifest` 200, `/sw.js` 200, `/offline.html` 200, `/icon-192.png` 200 |
| Smoke test runtime browser | headless Chromium (agent-browser) | App render, layar konfigurasi tampil benar (Firebase env memang kosong di lingkungan ini), **tanpa error console** |
| Responsif & overflow | viewport 360×740 | `scrollWidth` tidak melebihi viewport — **tidak ada horizontal overflow** |
| Install prompt PWA | headless + `beforeinstallprompt` | Banner "Pasang Zeroid" muncul, tombol Pasang memanggil prompt, tombol X menutup (state disimpan) |
| Audit kode statis | grep menyeluruh | 0 referensi seed/demo/simulasi; 0 `localStorage`-sebagai-DB; 0 emoji sebagai ikon UI; 0 kredensial keras |
| Proxy `/api/jere` end-to-end (handler asli) | `node scripts/test_jere_proxy.ts` | **28/28 PASS** — lagu/lirik/YouTube/anime/quotes/berita/detail/unduh + error mapping |
| Proxy `/api/ai` end-to-end (handler asli) | `node scripts/test_ai_proxy.ts` | **8/8 PASS** — models/chat(session)/thinking(reasoning)/vision, validasi & 503 |
| Bug setDoc undefined | review `lib/store.ts` | `clean()` menghapus field `undefined` sebelum semua penulisan — penyebab "Pesan gagal terkirim (Unsupported field)" |
| seed.html | buka halaman → jalankan | membuat koleksi + akun developer otomatis; idempotent |
| Ikon SVG | review `lib/icons.tsx` | 70+ ikon stroke konsisten + 8 badge SVG kustom (VIP, Verified, Admin, Developer, Moderator, Premium, Security, Logo) |

## 2. Yang memerlukan kredensial/layanan — BELUM dapat diuji di sini ⏳

Lingkungan pengerjaan **tidak memiliki** kredensial Firebase/API/perangkat. Item berikut terimplementasi penuh di kode tetapi harus diuji ulang setelah konfigurasi (lihat docs/FIREBASE_SETUP.md):

| Area | Yang harus diuji | Cara |
|---|---|---|
| Auth nyata | register/login/verifikasi/reset/Google/OTP | jalankan app dengan `.env` terisi |
| Firestore realtime | pesan lintas perangkat, typing, receipts, presence | 2 browser/perangkat |
| Storage & kompresi | upload gambar/video/audio/dokumen + progres | akun uji + file nyata |
| Panggilan WebRTC | offer/answer/ICE antar jaringan; TURN | 2 perangkat/jaringan |
| FCM | push saat app background | Cloud Functions terdeploy + perangkat Android |
| Proxy AI `/api/ai` | jawaban AI nyata dengan `JEREXD_APIKEY` | deploy Vercel + set env server |
| OTP Gmail | pengiriman lewat Trigger Email extension | pasang ekstensi + SMTP |
| APK | build EAS + instalasi perangkat | `eas build -p android` |

## 2b. Batch v22 — hasil uji di CI (GitHub Actions, project LIVE) ✅

Dijalankan lewat workflow `Zeroid Maintenance` (workflow_dispatch, hanya pemilik repo) memakai akun uji sementara yang dibuat & dihapus otomatis. Sumber hasil: log run Actions (jejak audit permanen).

| Uji (Firestore REST dgn ID token akun nyata → rules dievaluasi sungguhan) | Hasil |
|---|---|
| Create profil sendiri (role user) — 2 akun | ✅ PASS |
| **GAYA BALON** — update `users/{uid}.bubble` oleh pemilik | ✅ PASS |
| ANTI-ESKALASI — user biasa set `banned=true` sendiri | ✅ DITOLAK (403) |
| usermeta — catat perangkat sendiri | ✅ PASS |
| **CHECK-IN** — koin +1.000 + bukti ledger dalam 1 transaksi | ✅ PASS |
| ANTI-SPAM CHECK-IN — tap kedua 1 menit kemudian | ✅ DITOLAK (403) |
| ANTI-CETAK-KOIN — `points +999.999` tanpa bukti ledger | ✅ DITOLAK (403) |
| Buat chat langsung (members memuat saya) | ✅ PASS |
| **KIRIM PESAN** — teks normal tersimpan | ✅ PASS |
| ANTI-VIRTEX — teks 8.001 karakter | ✅ DITOLAK (403) |
| Receipt — penerima set `deliveredAt` | ✅ PASS |
| PRIVASI — chat pribadi dibaca non-anggota | ✅ DITOLAK (403) |
| **MASUKAN** — user kirim feedback | ✅ PASS |
| NOTIFIKASI — dokumen notifikasi dibuat anggota | ✅ PASS |
| STORY — kirim story 24 jam | ✅ PASS |
| LEDGER — catat belanja koin | ✅ PASS |
| KEAMANAN — akun lain mengubah profil saya | ✅ DITOLAK (403) |

**Total: 18 PASS / 0 FAIL.** Pembersihan pasca-uji: semua dokumen uji + kedua akun uji DIHAPUS (terverifikasi di log).

Perbaikan ikut batch v22 yang teruji typecheck + build produksi:
- Typecheck `tsc --noEmit`: **0 error**; build web `npm run build:web`: **LULUS**.
- Lift ban nyata via CI (inspect → liftban): users.banned→false, bans.active→false, 3 banips + 1 devices dihapus — log run tersimpan.

Belum dapat diuji di sini (butuh perangkat fisik): instal APK 1.6.4 di HP, background music saat layar terkunci (implementasi: expo-audio `shouldPlayInBackground` + `FOREGROUND_SERVICE_MEDIA_PLAYBACK` — butuh uji di Android nyata), push FCM di APK, WebRTC antar jaringan.

## 3. Pengujian negatif yang diverifikasi lewat kode/rules

- **Privilege escalation**: rules `users/{uid}` membatasi field self-write; `role`, `vipUntil`, `blueCheck`, `banned` hanya lewat `isAdmin()`.
- **Username ganda**: koleksi `usernames` menolak `create` bila dokumen sudah ada (atomic).
- **Channel read-only**: `messages.create` menolak anggota biasa bila `postPolicy == 'admins'`.
- **Upload liar**: storage rules membatasi path per kepemilikan + ukuran (avatar 5 MB, chat 60 MB, story 30 MB, stiker 2 MB) + tipe konten.
- **Pesan gagal**: `sendMessage` optimistik menandai `failed` dan menampilkan bar "kirim ulang".
- **Rate limit AI**: 20 permintaan / 5 menit / IP di proxy server.

## 4. Cara mengulang pengujian

```bash
npm run typecheck        # TypeScript
npm run build:web        # build + PWA
npx serve dist           # atau python3 -m http.server di dist/
# smoke browser manual: buka http://localhost:3000
```
