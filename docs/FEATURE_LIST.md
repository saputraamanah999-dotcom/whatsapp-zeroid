# Daftar Fitur — status implementasi

Legenda: ✅ selesai & teruji (build/typecheck/smoke) · 🟠 selesai (implementasi penuh; uji runtime butuh kredensial/perangkat) · ⚙️ konfigurasi dibutuhkan · ❌ tidak diimplementasi (jujur)

## A. Platform & arsitektur
- 🟠 Website + PWA (manifest, SW, offline, install prompt) — build & aset teruji, runtime penuh butuh Firebase
- 🟠 Deployment Vercel (vercel.json + function /api/ai)
- 🟠 APK Android via EAS Build (struktur & konfigurasi dipertahankan)
- ✅ Tidak ada localStorage/AsyncStorage sebagai database (hanya tema & flag lock lokal)
- ✅ Tidak ada akun demo, seed, simulasi, tombol mati

## B. Autentikasi & akun
- 🟠 Register/login email+password (Firebase Auth)
- ⚙️ Google Sign-In (kode siap; aktifkan provider + `EXPO_PUBLIC_ENABLE_GOOGLE=1`)
- ⚙️ Phone OTP (kode siap; butuh provider phone aktif)
- 🟠 Verifikasi email, reset password, logout, sesi persisten
- 🟠 Hapus akun (re-auth + hapus profil/story/notifikasi sendiri)
- ✅ Gate: banned/suspended/verifikasi/username/PIN/maintenance
- ✅ Role via provisioning; rules memblokir self-escalation

## C. Profil
- 🟠 Foto profil & banner upload (Storage, kompresi)
- 🟠 Username unik, nama, bio, edit profil, preview publik
- ✅ Badge SVG (VIP/Premium/Verified/Moderator/Admin/Developer/Keamanan)
- 🟠 Online & last seen sesuai privasi, blokir, lapor
- 🟠 PIN kunci aplikasi (hash lokal, lock screen)

## D. Chat
- 🟠 Pribadi/grup/channel/global/AI — realtime Firestore
- 🟠 Teks, emoji, stiker, foto (multi ≤4), video, dokumen, audio, voice note
- 🟠 Reply, edit 15 mnt, hapus saya/semua, forward, pin (chat), star, reaksi, salin, lapor
- 🟠 Sending/sent/delivered/read + retry gagal + optimistik rollback
- 🟠 Typing, online, pemisah tanggal, pagination, scroll-to-bottom, unread
- 🟠 Pencarian di daftar chat & kontak (berdasarkan nama/username)

## E. Media
- 🟠 Validasi ukuran/tipe, preview + batal sebelum kirim
- 🟠 Kompresi gambar (≤1600px, WebP→JPEG fallback, alpha PNG dipertahankan di native path)
- 🟠 Upload Storage dengan progres + metadata (mime/size/duration/wh/path)
- 🟠 Video ≤60 MB tanpa transcode browser (transcoding backend = belum, ❌ dinyatakan jujur)

## F. Grup & channel
- 🟠 Buat/edit grup & channel, avatar, deskripsi
- 🟠 Undang anggota, join by invite code, regenerate link (cabut)
- 🟠 Admin grup, tambah/keluarkan anggota, keluar
- 🟠 postPolicy channel (admin-only posting) — ditegakkan client + rules
- 🟠 Daftar & cari grup/channel publik

## G. Panggilan (WebRTC)
- 🟠 Voice & video call 1:1, ringing/ongoing/ended/missed/declined/busy
- 🟠 Incoming call full-screen + notifikasi FCM high-priority
- 🟠 Mute, kamera on/off, balik kamera, durasi, riwayat
- 🟠 Signaling Firestore + cleanup saat selesai; TURN opsional via env
- ⚠️ Batas: popup OS saat app tertutup memakai FCM high-priority notification (PWA browser tidak bisa menjamin popup sistem — dijelaskan jujur)

## H. Story
- 🟠 Teks berwarna & foto, 24 jam (TTL server + cleanup terjadwal)
- 🟠 Progress, next/prev, viewer list, suka, balas ke DM, hapus, privasi balasan

## I. VIP & pembayaran
- 🟠 Halaman Premium, pesanan + invoice di chat admin, konfirmasi manual admin
- 🟠 Grant/cabut VIP dari panel (hari), kedaluwarsa otomatis (komparasi waktu)
- ❌ Gateway pembayaran otomatis (belum ada; tidak dibuat transaksi palsu)

## J. Musik
- 🟠 Spotify embed (track/album/playlist) + YouTube embed
- 🟠 Deteksi & resolve link via oEmbed resmi; jadikan lagu profil
- ⚠️ Batas: preview Spotify 30 dtk tanpa login (batas Spotify, bukan bug); audio berhenti saat keluar app (batas WebView/iframe)

## K. AI assistant
- 🟠 Chat AI pribadi via proxy `/api/ai` (kunci server-side), rate limit, timeout
- 🟠 Riwayat percakapan, ringkas pesan terpilih (aksi cepat: terjemah/perbaiki/ringkas/kode)
- ⚙️ Multimodal/gambar: ❌ belum (endpoint belum diverifikasi) — tidak diklaim

## L. Notifikasi & pengumuman
- 🟠 Pusat notifikasi kategori + belum dibaca + tandai/hapus
- 🟠 Banner in-app, FCM (pesan/panggilan/story) via Cloud Functions
- 🟠 Pengumuman admin: banner berwarna, level, masa aktif, dismiss, akhiri
- ⚙️ Web Push VAPID (sertifikat perlu dibuat di console)

## M. Admin panel
- 🟠 Statistik + grafik 7 hari; kelola user (ban+alasan, role, verifikasi, centang, OTP, VIP)
- 🟠 Pesanan, laporan, story/channel, pengumuman, maintenance mode, audit log
- ✅ Semua aksi sensitif lewat fungsi ber-guard + audit append-only

## N. Keamanan
- 🟠 Firestore rules field-level, storage rules per-path, security headers, rate limit AI
- 🟠 Audit log, reauth untuk aksi sensitif, cleanup data saat logout/lock
- ❌ Anti-DevTools sengaja tidak dipasang (tidak efektif & merusak aksesibilitas — sesuai catatan brief)
