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
