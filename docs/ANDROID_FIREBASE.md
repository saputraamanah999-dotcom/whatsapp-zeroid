# Android, Firebase & panggilan — Zeroid WhatsApp

## Identitas
* Nama / label: **Zeroid-whatsapp**
* applicationId / package: **com.zeroid.whatsapp** (`app.json` + `plugins/withZeroidAndroid.js` memaksa `applicationId` di `app/build.gradle`)
* Icon adaptif: `assets/android-icon-*.png`, splash: `assets/splash-icon.png` (bg `#E9EDF3`, dark `#151A22`)
* Gradle (via config plugin): minSdk 24, compile/target 35, Hermes, R8 + shrinkResources, `org.gradle.jvmargs=-Xmx4096m`

## Firebase existing (projectId `projekwhattsaf`)
1. Taruh **`google-services.json`** milik project `projekwhattsaf` (package `com.zeroid.whatsapp`) di root project. Plugin otomatis memasang `android.googleServicesFile` — konfigurasi native tetap dipertahankan.
2. Isi `.env` dari `.env.example` (kunci Web App Firebase) untuk Auth/Firestore/Storage JS.
3. Deploy rules: `firebase deploy --only firestore:rules,storage` (file `firestore.rules`, `storage.rules`).
4. Deploy Cloud Functions FCM: `functions/index.ts`.

Tanpa kunci, aplikasi **tidak akan masuk** — ia menampilkan layar "Konfigurasi dibutuhkan". Tidak ada mode lokal/offline: semua data wajib berada di Firebase.

### Struktur Firestore
```
users/{uid}                      profil, privacy, role
fcm_tokens/{uid}                 token FCM device
chats/{chatId}                   direct | group | channel | global | bot
chats/{chatId}/messages/{id}     text | image | video | audio | document | call | system
stories/{id}                     kedaluwarsa 24 jam
calls/{callId}                   status ringing/ongoing/ended/missed/declined
calls/{callId}/signals/{id}      signaling WebRTC (offer/answer/ice/ready/bye)
reports/{id}                     laporan pesan untuk admin
```

## WebRTC
* Web: API browser. Android/iOS: `react-native-webrtc` + `@config-plugins/react-native-webrtc` (butuh **development build**, bukan Expo Go: `eas build --profile development -p android`).
* Alur: callee menerima → kirim `ready` → caller `createOffer` → callee `answer` → trickle ICE → `connected`. `bye` saat ditutup.
* STUN Google default; tambahkan TURN di `lib/webrtc.ts` (`ICE_SERVERS`) untuk jaringan seluler/NAT simetris.

## Incoming call saat aplikasi tertutup
1. Caller membuat `calls/{id}` (status `ringing`).
2. Function `onCallCreated` mengirim FCM **priority high** ke channel `calls` (importance MAX, lockscreen PUBLIC, bypass DND, vibrasi panjang) dengan kategori aksi **Terima / Tolak**.
3. Activity utama memiliki `showWhenLocked` + `turnScreenOn`, izin `USE_FULL_SCREEN_INTENT`, serta izin `FOREGROUND_SERVICE_PHONE_CALL/MICROPHONE/CAMERA` yang dibutuhkan Android 14+ untuk layanan panggilan latar belakang (mis. ConnectionService/CallKeep bila ditambahkan).
4. Ketuk notifikasi / "Terima" → `acceptCall` → layar Call; "Tolak" → status `declined` tanpa membuka app.
5. `onCallUpdated` mengirim `call_ended` untuk menghentikan dering di perangkat lain.

Catatan kebijakan: sejak Android 14, Play Store hanya mengizinkan `USE_FULL_SCREEN_INTENT` default untuk aplikasi panggilan/alarm — Zeroid termasuk kategori calling. Pengguna dapat mencabutnya; layar Izin aplikasi menautkan ke Pengaturan.

## Permission Manager (`lib/permissions.ts`)
Kamera, mikrofon, notifikasi (POST_NOTIFICATIONS Android 13+), media (READ_MEDIA_IMAGES/VIDEO/AUDIO + Selected Photos Android 14). Selalu: dialog rasional in-app → popup sistem → jika "jangan tanya lagi" → tombol buka Pengaturan. `READ/WRITE_EXTERNAL_STORAGE` dan `SYSTEM_ALERT_WINDOW` diblokir.

## Build APK
```
npx eas-cli@latest build -p android --profile preview
```

## OTP ke Gmail lewat Firebase
Pasang ekstensi **Trigger Email from Firestore** (`firebase ext:install firebase/firestore-send-email`) dengan SMTP Gmail
(`smtps://<akun>@gmail.com:<app-password>@smtp.gmail.com:465`, koleksi `mail`). Aplikasi menulis dokumen `mail` berisi kode OTP
(`lib/mail.ts`) sehingga email masuk ke inbox Gmail pengguna. Tanpa Firebase, OTP dikirim ke notifikasi dalam aplikasi.

## Spotify
Diputar lewat Spotify Embed (`react-native-webview` di Android, iframe di web) — tanpa membuka aplikasi Spotify.
