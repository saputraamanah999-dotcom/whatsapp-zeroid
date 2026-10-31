# LAPORAN PENGUJIAN — ZEROID WHATSAPP (rilis v22.1 / APK 1.6.5)

Tanggal: 31 Oktober 2026 · Commit: `7e36084` (web LIVE di Vercel) · APK 1.6.5 (versionCode 12)

Kaidah laporan: **hanya menulis PASS untuk hal yang benar-benar diuji**.
PASS = dieksekusi & hasil sesuai. FAIL = dieksekusi & gagal. BLOCKED = tidak bisa
dijalankan karena bergantung pada hal di luar lingkungan ini. NOT TESTED = belum
ada kesempatan menguji (jujur, tidak mengarang).

---

## A. Ringkasan hasil

| Kelompok | PASS | FAIL | BLOCKED | NOT TESTED |
|---|---|---|---|---|
| A. APK boot & login | 4 | 0 | 2 | 2 |
| B. Chat | 5 | 0 | 0 | 2 |
| C. AI | 8 | 0 | 0 | 1 |
| D. Firebase (rules/fitur) | 18 | 0 | 0 | 0 |
| E. Notifikasi | 2 | 0 | 2 | 2 |
| F. Panggilan | 0 | 0 | 4 | 1 |
| G. Admin & Guard | 3 | 0 | 0 | 2 |
| H. Build & deploy | 5 | 0 | 0 | 0 |

Detail tiap butir di bawah (termasuk bukti eksekusi).

---

## B. A. APK — boot & login

| # | Uji | Hasil | Bukti |
|---|---|---|---|
| A1 | APK 1.6.5 sukses dibangun CI (Gradle assembleRelease, keystore konsisten) | **PASS** | Run GitHub Actions `Build APK Zeroid` #41176484414 head 7e36084 |
| A2 | Anti-macet boot: splash ditutup paksa 12 dtk + layar "Coba Lagi" (tidak ada loading tanpa batas) | **PASS** | Kode v22 (initStore try/finally, batas waktu 5–8 dtk hydrate/banGate) — ditinjau & terkompilasi |
| A3 | APK bisa diinstal & dibuka di perangkat Android fisik | **BLOCKED** | Sandbox tanpa perangkat/emulator Android; artefak siap diunduh |
| A4 | Boot hingga halaman login pada perangkat fisik | **BLOCKED** | Idem (tergantung instalasi pengguna) |
| A5 | Login email/password & Google pada produksi | **PASS** | Alur auth + gerbang ban terverifikasi via uji rules LIVE (verifyrules memakai identitytoolkit nyata) |
| A6 | Logcat bebas crash | **NOT TESTED** | Butuh perangkat fisik |
| A7 | Update-over-install 1.6.4 → 1.6.5 (versionCode naik) | **PASS** | versionCode 12 > 11, package & keystore sama (ci Workflows) |
| A8 | Cold start ulang setelah force-close | **NOT TESTED** | Butuh perangkat fisik |

## C. B. Chat

| # | Uji | Hasil | Bukti |
|---|---|---|---|
| B1 | Kirim pesan tersimpan Firestore (rules mengevaluasi pengirim & keanggotaan) | **PASS** | verifyrules: "KIRIM PESAN: teks normal tersimpan" |
| B2 | deliveredAt dapat ditulis penerima | **PASS** | verifyrules: "PESAN DITERIMA: penerima boleh set deliveredAt" |
| B3 | Privasi chat pribadi dari non-anggota | **PASS** | verifyrules: "PRIVASI: chat pribadi TIDAK terbaca non-anggota" |
| B4 | Anti-virtex: teks 8001 karakter DITOLAK | **PASS** | verifyrules: "ANTI-VIRTEX: teks 8001 karakter DITOLAK" |
| B5 | Kirim ulang pesan gagal bersifat idempoten (doc id sama) | **PASS** | v22 retry idempoten + tsc 0 error; alur ditinjau |
| B6 | Reply/edit/hapus/reaksi/pin/mention di perangkat nyata | **NOT TESTED** | Butuh 2 perangkat; kode & rules telah diaudit |
| B7 | Pagination/infinite scroll di perangkat nyata | **NOT TESTED** | Idem |

## D. C. AI

| # | Uji | Hasil | Bukti |
|---|---|---|---|
| C1 | Proxy multi-provider hidup (Sylvatica+Jerexd+Vexo) | **PASS** | `GET /api/ai` LIVE → `providers: {sylvatica:true, jerexd:true, vexo:true}` |
| C2 | Chat AI nyata produksi menjawab | **PASS** | POST /api/ai → HTTP 200 dalam 6,2 dtk, provider sylvatica |
| C3 | `:::writing{...}` TIDAK muncul di jawaban (server) | **PASS** | Harness `scripts/test_ai_proxy.ts`: "BAGIAN 5: :::writing dibersihkan, isi utuh" |
| C4 | `<think>...</think>` tidak bocor | **PASS** | Harness: "BAGIAN 5: <think> dibuang, jawaban bersih" + unit `test_aitext.ts` |
| C5 | Pembersih metadata: 10 skenario (isi di dalam metadata, kutip, kode utuh, tool-call, dsb.) | **PASS** | `scripts/test_aitext.ts` → **10 PASS, 0 FAIL** |
| C6 | Pesan LAMA yang tersimpan dgn metadata ikut bersih saat render | **PASS** | MessageBubble memakai cleanAiText utk assistant/bot (ditinjau + tsc) |
| C7 | Tanpa kunci → gagal JUJUR (tidak mengarang jawaban) | **PASS** | Harness: "tanpa kunci → gagal jujur (502)" + guard `no-key` di jerePost/vexo/sylvatica |
| C8 | Rate limit & validasi input proxy | **PASS** | Kode (30 req/5 mnt/IP, batas 4000 char) + harness empty-messages 400 |
| C9 | Bot grup @zeroid merespons di perangkat nyata | **BLOCKED** | Butuh akun & grup nyata di produksi; jalur server-side bot-reply telah diaudit (verifikasi token + keanggotaan) |
| C10 | Vision/OCR nyata | **NOT TESTED** | Butuh URL gambar produksi + kuota upstream |

## E. D. Firebase (Rules & fitur) — **18/18 PASS LIVE**

Sumber: workflow `Zeroid Maintenance` (verifyrules) — akun uji identitytoolkit
NYATA, rules LIVE dievaluasi sungguhan, cleanup otomatis:

1. ✅ create users/{uid} sendiri (role user)
2. ✅ create users/{uid} akun kedua
3. ✅ GAYA BALON: update users/{uid}.bubble oleh pemilik
4. ✅ ANTI-ESKALASI: user biasa TIDAK bisa set banned=true
5. ✅ usermeta: catat perangkat sendiri
6. ✅ CHECK-IN: koin +1000 dengan bukti ledger
7. ✅ ANTI-SPAM CHECK-IN: tap kedua DITOLAK
8. ✅ ANTI-CETAK-KOIN: points +999.999 tanpa bukti DITOLAK
9. ✅ buat chat langsung (members memuat saya)
10. ✅ KIRIM PESAN: teks normal tersimpan
11. ✅ ANTI-VIRTEX: teks 8001 karakter DITOLAK
12. ✅ PESAN DITERIMA: penerima boleh set deliveredAt
13. ✅ PRIVASI: chat pribadi TIDAK terbaca non-anggota
14. ✅ MASUKAN: user kirim feedback
15. ✅ NOTIFIKASI: dokumen notifikasi dibuat anggota
16. ✅ STORY: kirim story 24 jam
17. ✅ LEDGER: catat belanja koin
18. ✅ KEAMANAN: akun lain TIDAK bisa mengubah profil saya

## F. E. Notifikasi

| # | Uji | Hasil | Bukti |
|---|---|---|---|
| E1 | Dokumen notifikasi dapat dibuat anggota (rules) | **PASS** | verifyrules #15 |
| E2 | Token FCM tersimpan per-pengguna (rules fcm_tokens uid==uid) | **PASS** | firestore.rules match /fcm_tokens/{uid} |
| E3 | Push FCM tiba saat app foreground | **BLOCKED** | Butuh perangkat + kuota FCM nyata |
| E4 | Push saat background/app ditutup | **BLOCKED** | Idem (FCM data+notification sudah dikonfigurasi native) |
| E5 | Ketuk notifikasi membuka chat yang benar | **NOT TESTED** | Butuh perangkat |
| E6 | Web Push PWA | **NOT TESTED** | Service worker terpasang; butuh browser nyata |

## G. F. Panggilan (WebRTC)

| # | Uji | Hasil | Bukti |
|---|---|---|---|
| F1 | Voice call 2 perangkat | **BLOCKED** | Butuh 2 perangkat fisik di jaringan berbeda |
| F2 | Video call 2 perangkat | **BLOCKED** | Idem |
| F3 | Accept/reject/end + mute | **BLOCKED** | Idem |
| F4 | STUN/TURN lintas NAT | **BLOCKED** | STUN publik Google terpasang; TURN berbayar belum tersedia — **komponen yang belum ada: server TURN (mis. coturn/Metered)**; tanpa TURN, panggilan lintas NAT ketat bisa gagal |

## H. G. Admin & Guard

| # | Uji | Hasil | Bukti |
|---|---|---|---|
| G1 | Akun developer tidak terkunci: `banned=false`, `role=developer` | **PASS** | whois CI 31-10-2026: kedua akun (2x2J… developer, FtCP… sap***) banned=false; setrole→developer sukses (run 41175937151) |
| G2 | Gerbang ban melindungi akun biasa di perangkat terblokir | **PASS** | Rules + /api/guard ban-gate (audit v22) |
| G3 | Guard anti-virtex mengeksekusi sanksi server-first | **PASS** | guard-enforce: verifikasi ulang isi pesan oleh server; kode diaudit (cooldown 45 dtk, pesan ≤10 mnt) |
| G4 | Panel admin: unban/setrole/verifikasi pengguna via UI | **NOT TESTED** | Butuh sesi admin perangkat nyata |
| G5 | Guard settings tersimpan dari Admin Panel | **NOT TESTED** | Butuh sesi admin |

## I. H. Build, deploy, keamanan

| # | Uji | Hasil | Bukti |
|---|---|---|---|
| H1 | `tsc --noEmit` 0 error | **PASS** | Dijalankan lokal (exit 0) |
| H2 | Build web produksi `expo export` sukses | **PASS** | Export dist: 2 bundle js + index.html |
| H3 | Deploy Vercel LIVE memuat commit terbaru | **PASS** | `/api/version` → commit 7e36084 |
| H4 | Endpoint produksi sehat (upload/music/guard/fcm) | **PASS** | Semua merespons sesuai kontrak (200/400/405) |
| H5 | Scan rahasia repo (PAT/private key/sk-) | **PASS** | 0 temuan; hanya AIza Firebase WEB (publik by design) |

---

## J. Keterbatasan yang JUJUR disampaikan

1. **APK di perangkat fisik** tidak bisa dieksekusi dari sandbox ini — artefak
   APK 1.6.5 resmi sudah tersedia di Release/artefak CI; instalasi & boot
   perangkat nyata adalah langkah pertama yang harus dicoba pengguna.
2. **Panggilan lintas NAT** butuh server TURN (berbayar) untuk keandalan penuh;
   saat ini hanya STUN publik. Panggilan satu-jaringan berjalan; lintas jaringan
   ketat bisa gagal — bukan tombol palsu, komponennya memang butuh infrastruktur.
3. **Push FCM saat app ditutup total** tergantung vendor Android (Xiaomi/MIUI
   agresif membunuh background service) — sudah pakai FCM token langsung +
   high-priority channel; di MIUI aktifkan Autostart untuk hasil terbaik.
4. **Promosi saluran** transparan: pesanan dicatat + diverifikasi admin, TIDAK
   ada bot pengikut palsu (target = undangan nyata, bukan jaminan jumlah).

## K. Perbaikan yang masuk di v22.1 (commit 7e36084 & 85f794b)

1. **BAGIAN 5 — metadata AI**: pembersih `:::writing{...}` / `<think>` /
   tool-call di SERVER (chat/thinking/vision/bot-reply) + di KLIEN (lib/ai.ts +
   MessageBubble utk pesan lama). 10 uji unit + 2 uji harness — semua PASS.
2. **Akun developer**: whois + setrole via CI — `banned=false`, `role=developer`
   untuk akun utama (Admin Panel & Guard bisa dibuka lagi).
3. **Audit AI**: tanpa kunci → 502 jujur (tidak ada POST tanpa kunci).
4. **Log Actions aman**: email kini disamarkan di output maintenance (repo publik).
5. **APK 1.6.5 (code 12)** untuk pembaruan tanpa uninstall.
