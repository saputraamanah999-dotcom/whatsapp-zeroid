# VERIFIKASI DEVELOPER ANDROID — Zeroid (com.zeroid.whatsapp)

> Dibuat v29 sesuai permintaan pemilik. Sumber resmi: https://developer.android.com/developer-verification
> Prinsip: TIDAK ADA bypass keamanan Android, TIDAK ADA sertifikat palsu, TIDAK ADA
> klaim "terverifikasi" sebelum proses resmi selesai. Semua tahap yang butuh aksi
> pemilik akun ditandai 👤 **AKSI PEMILIK**.

---

## 1. Arti peringatan yang kamu lihat (bukan aplikasinya yang rusak)

Peringatan **"Tidak dapat memverifikasi developer aplikasi"** (Keamanan & Privasi
Android) muncul saat instal APK dari luar Play Store karena Android 16+ (gelombang
2026) kini **memeriksa identitas DEVELOPER**, bukan cuma APK-nya. Indonesia adalah
bagian **gelombang pertama penegakan mulai 30 September 2026** — jadi peringatan ini
NORMAL untuk semua APK sideload dari developer yang belum mendaftar resmi.

- Ini BUKAN berarti APK berbahaya, dan BUKAN karena sertifikat kita salah.
- Sementara proses resmi belum selesai, pengguna tetap bisa memasang lewat tombol
  **"Tetap instal"** pada dialog tersebut.
- Peringatan akan hilang secara resmi HANYA setelah tahap 👤 di bagian 4 selesai.

## 2. Hasil audit APK & tanda tangan (terverifikasi, bukan asumsi)

Diperiksa langsung pada `release/zeroid-whatsapp-1.8.0.apk` (scripts/audit_apk.py):

| Butir | Hasil |
| --- | --- |
| Package name | `com.zeroid.whatsapp` — TIDAK berubah sejak v1 ✔ |
| Nama aplikasi | `Zeroid` ✔ |
| versionName / versionCode | 1.8.0 / 18 (naik monoton dari 1.6.9/15 → 1.7.x/16-17 → 1.8.0/18) ✔ |
| Signature scheme | **v2 (APK Signature Scheme)** ✔ — sah untuk Android 7.0+ (minSdk 24) |
| SHA-256 sertifikat | `91A6D6998BE0395CB70C4109BA96E74F3C93FB1A56E3F9221DD8E8112CA7C759` |
| Konsistensi sertifikat | Keystore dari **GitHub Secrets** (workflow build-apk.yml) → SEMUA build memakai kunci yang sama; update tidak perlu uninstall ✔ |
| targetSdk / compileSdk | 36 (sesuai kebijakan Google Play 2026+) ✔ |
| Izin (permissions) | Semua wajar (internet, kamera/media, mikrofon, notifikasi, biometrik, FCM) — tidak ada izin aneh ✔ |

**Catatan Play App Signing:** kita TIDAK memakai Play App Signing (APK didistribusi
di luar Play), jadi tidak ada konsep upload key vs app signing key yang terpisah —
satu keystore konsisten dari secrets adalah pola yang benar. Kunci TIDAK diganti.

## 3. Ketentuan resmi Google (ringkasan berdasar dokumen di atas)

- Dua jalur pendaftaran: **Android Developer Console** (khusus distribusi di luar
  Play — cocok untuk Zeroid) atau **Google Play Console** (kalau nanti juga terbit di Play).
- **Distribusi lewat website sendiri TETAP BOLEH** selama developernya terverifikasi.
- **Akun distribusi terbatas (gratis, tanpa KTP):** untuk pelajar/hobi — maks **20
  perangkat**, tanpa biaya pendaftaran.
- **Advanced flow "power user"**: pengguna lanjutan bisa mengaktifkan izin sideload
  aplikasi belum-verifikasi (menunggu 24 jam sekali pengaturan).
- Linimasa: Jun 2026 layanan sistem disebar → Jul/Agu 2026 API + akun terbatas
  global → **30 Sep 2026 penegakan: Brasil, Indonesia, Singapura, Thailand** →
  2027+ global.

## 4. Langkah resmi menghilangkan peringatan (urutan pasti)

### 👤 AKSI PEMILIK 1 — Buat akun Android Developer Console
1. Buka https://play.google.com/console/android-developer-console (jalur "distribusi
   hanya di luar Google Play").
2. Masuk dengan akun Google milikmu (yang sama dengan pemilik project Firebase
   `whatsapp-zeroid` — jangan campur akun).
3. Verifikasi identitas: nama legal + alamat + email + nomor telepon, lalu verifikasi
   email/telepon. (Identitas ini DILINDUNGI Google — tidak dipublikasikan.)

### 👤 AKSI PEMILIK 2 — Daftarkan aplikasi
1. Di console: **All apps → Register new app** (kategori: distribusi di luar Play).
2. Isi:
   - **Package name**: `com.zeroid.whatsapp` (persis — tidak boleh beda satu huruf)
   - **App name**: `Zeroid`
   - **Signing key**: unggah/tempel **SHA-256** sertifikat release kita:
     `91A6D6998BE0395CB70C4109BA96E74F3C93FB1A56E3F9221DD8E8112CA7C759`
     (ambil ulang kapan pun dengan: `python3 scripts/audit_apk.py <apk>` — bagian SERTIFIKAT)
3. Pilih **First sets / limited**: kalau pengguna < 20 perangkat → pakai akun
   distribusi terbatas gratis. Kalau mau publik untuk siapa pun → pilih verifikasi
   penuh (butuh verifikasi identitas, gratis untuk jalur luar-Play).

### 👤 AKSI PEMILIK 3 — Cek status & uji
1. Dashboard console menampilkan status: `Pending → Verified` (biasanya cepat;
   tandai email dari Google).
2. Setelah **Verified**: build APK BARU (Actions → Build APK Zeroid → Run workflow)
   lalu pasang di HP — dialog verifikasi developer tidak lagi muncul pada perangkat
   dengan layanan sistem Google terbaru; pada perangkat lama, aplikasi masuk daftar
   developer tepercaya.
3. Uji ulang: uninstal → instal ulang APK terbaru dari https://whatsapp-zeroid.vercel.app/apk.html

### Pengguna lain (selain pemilik) — sementara menunggu verifikasi
- Opsi A: tekan **"Tetap instal"** pada dialog (cara sekarang).
- Opsi B (Android 16+, tanpa menunggu): Pengaturan → **Keamanan & privasi →
  Pemblokiran instal (lebih banyak kontrol)** → aktifkan izin sideload aplikasi
  belum-verifikasi → **tunggu 24 jam** → instal. Sekali setel, berlaku terus.

## 5. Yang TIDAK kami lakukan (komitmen keamanan)

- ❌ Tidak memodifikasi sistem keamanan perangkat pengguna.
- ❌ Tidak memakai sertifikat palsu / debug yang di-cosplay sebagai release.
- ❌ Tidak mengklaim "developer terverifikasi" sebelum console Google menyatakan Verified.
- ❌ Tidak mengganti signing key (merusak update: Android menolak APK dengan
  sertifikat beda di atas instalasi lama).

## 6. Perbandingan APK lama vs baru

| | 1.6.9 (code 15, per laporan pemilik) | 1.8.0 (code 18, saat ini) |
| --- | --- | --- |
| Package | com.zeroid.whatsapp | com.zeroid.whatsapp (sama) ✔ |
| Sertifikat | Keystore CI (konsisten) | Keystore CI — SHA-256 di atas (sama) ✔ |
| Signature scheme | v2 | v2 ✔ |
| Anti-macet splash | timer JS 12 dtk | timer JS 12 dtk + **watchdog NATIVE 12 dtk** (lepas splash walau JS mati) ✔ |
| Diagnostik boot | laporan crash saja | **[ZEROID_BOOT]** 10 fase + file boot native ✔ |
| targetSdk | 36 | 36 ✔ |

Kesimpulan: identitas & tanda tangan KONSISTEN — peringatan verifikasi bukan karena
perbedaan sertifikat, melainkan karena pendaftaran developer resmi belum selesai
(lihat bagian 4).
