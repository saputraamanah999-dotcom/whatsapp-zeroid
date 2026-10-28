# Deployment — Zeroid WhatsApp

## A. Web (PWA) di Vercel

Aplikasi web dibangun dengan `expo export --platform web` lalu diberi lapisan PWA oleh `scripts/pwa-postbuild.js` (manifest, service worker, ikon, offline page, registrasi SW).

### 1. Instal Vercel CLI & login

```bash
npm i -g vercel
vercel login
```

### 2. Set environment variables (Project → Settings → Environment Variables)

**Client (dipakai saat build web):**

| Nama | Contoh |
|---|---|
| `EXPO_PUBLIC_FIREBASE_API_KEY` | `AIza...` |
| `EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN` | `projekwhattsaf.firebaseapp.com` |
| `EXPO_PUBLIC_FIREBASE_PROJECT_ID` | `projekwhattsaf` |
| `EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET` | `projekwhattsaf.appspot.com` |
| `EXPO_PUBLIC_FIREBASE_SENDER_ID` | `1234567890` |
| `EXPO_PUBLIC_FIREBASE_APP_ID` | `1:123:web:abc` |
| `EXPO_PUBLIC_ENABLE_GOOGLE` | `0` / `1` |
| `EXPO_PUBLIC_TURN_URL/USER/CRED` | opsional |

**Server (hanya runtime function):**

| Nama | Keterangan |
|---|---|
| `JEREXD_APIKEY` | kunci api.jerexd.my.id — **jangan pernah** pakai prefix EXPO_PUBLIC |
| `CATBOX_USERHASH` | opsional, untuk kebutuhan upload server-side |

### 3. Deploy

```bash
vercel --prod
```

`vercel.json` sudah mengatur: build command, output `dist/`, SPA rewrite (tanpa menimpa `/api`, `/sw.js`, aset PWA), cache immutable untuk `/_expo/*`, dan security headers (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, HSTS).

### 4. Route `/api/ai`

Folder `api/` otomatis dideploy Vercel sebagai Node serverless function. Uji:

```bash
curl https://<domain>.vercel.app/api/ai
# {"ok":true,"configured":true,"service":"zeroid-ai-proxy"}
```

Jika `configured:false` → `JEREXD_APIKEY` belum diset di environment Vercel.

### 5. Setelah deploy

- Tambahkan domain Vercel ke **Firebase Authentication → Authorized domains**.
- Deploy Firestore/Storage rules (lihat docs/FIREBASE_SETUP.md).
- Uji install PWA: buka di Chrome Android → menu → "Tambahkan ke layar utama" (atau banner Pasang di dalam aplikasi).

## B. APK Android (EAS Build)

Struktur Expo dipertahankan — APK dibangun dari project yang sama dengan web.

```bash
npm i -g eas-cli
eas login
eas build -p android --profile preview   # APK
eas build -p android --profile production # AAB untuk Play Store
```

`eas.json` sudah berisi profil. `app.json` memuat izin kamera/mikrofon/media, adaptive icon, splash, dan konfigurasi `@config-plugins/react-native-webrtc`.

**Catatan Firebase native:** untuk build native production, unduh `google-services.json` (Project settings → Android app) dan taruh di root project (lihat docs/ANDROID_FIREBASE.md). Google Sign-In native memerlukan SHA-1 debug+release yang terdaftar di Firebase + paket `@react-native-google-signin/google-signin` bila diaktifkan.

## C. Cloud Functions

```bash
cd functions && npm i && cd ..
firebase deploy --only functions
```

## C2. Seed koleksi & akun developer (seed.html)

File `pwa/seed.html` ikut ter-deploy ke `https://<domain>.vercel.app/seed.html` (atau buka langsung dari file). Fungsi:

1. Isi konfigurasi web app (Firebase Console → Project settings → Your apps → Config).
2. Klik **Buat koleksi & akun developer** — otomatis:
   - membuat/masuk akun **gedejulianto148@gmail.com** dan memberi `role: "developer"`;
   - membuat `config/bootstrap` (mengunci pintu bootstrap role permanen);
   - membuat `config/platform`, `chats/global` + pesan sambutan, `announcements/welcome`, `notifications/welcome`, `usernames/...`.
3. Klik **Verifikasi ulang** kapan saja untuk memeriksa ulang semua dokumen.

Syarat: **publish firestore.rules terbaru dulu** (ada klausa bootstrap). Jika provider Email/Password belum aktif, alat memberi tahu persis mana yang harus dinyalakan.

## D. Checklist pasca-deploy

- [ ] `/api/ai` merespons dan `configured:true`.
- [ ] Register + verifikasi email berjalan (cek folder spam).
- [ ] Upload foto profil sukses (rules storage benar).
- [ ] Notifikasi Android muncul (FCM token terkirim ke `fcm_tokens`).
- [ ] Panggilan dua perangkat terhubung (tanpa TURN bila jaringan ramah; dengan TURN untuk NAT ketat).
- [ ] Banner pengumuman admin tampil.
