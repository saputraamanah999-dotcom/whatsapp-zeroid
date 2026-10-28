# Firebase Setup — Zeroid WhatsApp

Aplikasi ini **membutuhkan** Firebase yang dikonfigurasi. Tidak ada mode demo: tanpa konfigurasi, aplikasi menampilkan layar "Konfigurasi dibutuhkan" dengan langkah-langkahnya.

## 1. Kredensial Web App (wajib)

1. Buka [Firebase console](https://console.firebase.google.com/) → project **projekwhattsaf** (atau project kamu sendiri).
2. **Project settings → General → Your apps → Web app** (`</>`) → salin konfigurasinya.
3. Isi `.env` (salin dari `.env.example`):

```env
EXPO_PUBLIC_FIREBASE_API_KEY=AIza...
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=projekwhattsaf.firebaseapp.com
EXPO_PUBLIC_FIREBASE_PROJECT_ID=projekwhattsaf
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=projekwhattsaf.appspot.com
EXPO_PUBLIC_FIREBASE_SENDER_ID=1234567890
EXPO_PUBLIC_FIREBASE_APP_ID=1:1234567890:web:abcdef
```

> Nilai `apiKey` Firebase bukan rahasia — yang melindungi data adalah **Firestore/Storage Rules** dan konfigurasi authorized domain, bukan kerahasiaan key. Tetap jangan commit `.env`.

## 2. Aktifkan Authentication

Firebase console → **Authentication → Sign-in method**:

- **Email/Password** → Enable (wajib).
- **Google** → Enable (opsional; set `EXPO_PUBLIC_ENABLE_GOOGLE=1` untuk menampilkan tombolnya).
- **Phone** → Enable (opsional; banyak project butuh Blaze plan; set `EXPO_PUBLIC_ENABLE_PHONE=1`).
- **Authorized domains** → tambahkan domain Vercel kamu (mis. `zeroid-whatsapp.vercel.app` + custom domain).

## 3. Firestore

- **Create database** → mode produksi → mulai dari rules repo ini.
- Deploy rules & index:

```bash
npm i -g firebase-tools && firebase login
firebase use projekwhattsaf        # atau project kamu
firebase deploy --only firestore:rules,firestore:indexes
```

### Koleksi yang dipakai aplikasi

| Path | Isi |
|---|---|
| `users/{uid}` | profil, peran, VIP, privasi, kontak, blokir |
| `usernames/{username}` | reservasi username unik → `{ uid }` |
| `chats/{chatId}` | metadata chat; `members`, `admins`, `postPolicy`, `inviteCode`, `lastMsg` |
| `chats/{chatId}/messages/{mid}` | pesan (serverTimestamp, reaksi, receipts) |
| `stories/{sid}` | story 24 jam (`expiresAt`) |
| `calls/{callId}` + `/signals` | panggilan WebRTC + sinyal (auto-clean) |
| `notifications/{nid}` | pusat notifikasi per pengguna |
| `reports/{rid}` | laporan moderasi |
| `orders/{oid}` | pesanan premium (konfirmasi admin) |
| `stickers/{sid}` | stiker pribadi/global |
| `announcements/{aid}` | pengumuman admin |
| `audit_logs/{lid}` | jejak audit (append-only) |
| `config/platform` | mode pemeliharaan & feature flags |
| `fcm_tokens/{uid}` | token push FCM |
| `mail/{id}` | Trigger Email extension (OTP) |

## 4. Storage

Deploy rules storage:

```bash
firebase deploy --only storage
```

Struktur path yang diizinkan rules: `avatars/{uid}/`, `banners/{uid}/`, `chats/{chatId}/`, `stories/{uid}/`, `stickers/{uid}/`, `groups/`.

## 5. Cloud Functions (FCM + pembersihan terjadwal)

```bash
cd functions && npm i firebase-functions firebase-admin
cd .. && firebase deploy --only functions
```

Fungsi: `onMessageCreated`, `onCallCreated`, `onCallUpdated`, `onStoryCreated` (fan-out FCM), `cleanupExpired` (story >24 jam & sinyal WebRTC >2 jam, tiap 60 menit), `expireRingingCalls` (panggilan tak terjawab >45 dtk, tiap 2 menit).

> FCM web push memerlukan **VAPID key**: Project settings → Cloud Messaging → Web Push certificates → daftarkan key, lalu tambahkan ke konfigurasi jika ingin notifikasi web saat tab tidak aktif.

## 6. Trigger Email extension (OTP Gmail — opsional)

Panel admin dapat memverifikasi OTP Gmail pengguna lewat ekstensi resmi:

1. Firebase console → **Extensions** → install **Trigger Email from Firestore** (`firebase/firestore-send-email`).
2. Konfigurasikan SMTP Gmail (App Password) saat instalasi.
3. Aplikasi menulis dokumen ke koleksi `mail` — ekstensi mengirimkannya. Tanpa ekstensi, fitur OTP melaporkan "belum terpasang" secara jujur (tidak ada simulasi).

## 7. Provisioning role pertama

Setelah pengguna pertama mendaftar:

- Firestore → `users/{uid}` → add field `role` (string) = `admin`.
- Developer: `role` = `developer` (atau field `developer: true`).
- Moderator bisa diberikan lewat panel Admin oleh admin lain.

Ini satu-satunya langkah manual; sisanya dikelola panel dengan audit log.

## Checklist produksi

- [ ] Rules Firestore & Storage terdeploy (bukan mode test).
- [ ] Authorized domains berisi domain produksi.
- [ ] Cloud Functions terdeploy (notifikasi + TTL).
- [ ] Admin pertama sudah diprovisioning.
- [ ] `.env` tidak ikut ke git (`git check-ignore .env`).
- [ ] Backup otomatis Firestore diaktifkan (opsional tapi disarankan).
