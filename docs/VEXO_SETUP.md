# Vexo API + kunci server otomatis (ditulis ulang batch 9)

Penyedia AI/brat/search ke-3 sudah digabung ke Zeroid: rantai failover sekarang
**Sylvatica → JEREXD → Vexo** (penyedia yang terakhir berhasil dicoba lebih dulu).
Stiker Brat memakai urutan **Vexo → siputzx → Sylvatica**.

## Kunci (hanya server — JANGAN pernah EXPO_PUBLIC_, JANGAN pernah ditulis di repo)

> ⚠️ KEAMANAN: kunci TIDAK PERNAH ditulis di file repo apa pun (repo ini publik).
> Kunci hidup di dua tempat: env Vercel (server) dan Firestore `secrets/ai`
> (dibaca service account; rules melarang total klien). Isi kunci via
> GitHub Actions secrets (SYLVATICA_APIKEY, JEREXD_APIKEY, VEXO_APIKEY,
> IMGBB_KEY) — CI otomatis menyemaimya ke `secrets/ai`.

```
SYLVATICA_APIKEY=<lihat GitHub Actions secrets / dashboard penyedia>
JEREXD_APIKEY=<lihat GitHub Actions secrets / dashboard penyedia>
VEXO_APIKEY=<lihat GitHub Actions secrets / dashboard penyedia>
IMGBB_KEY=<lihat GitHub Actions secrets / dashboard penyedia>
```

## BARU (batch 9): kunci kini punya CADANGAN OTOMATIS — tidak wajib isi Vercel

Semua `/api/*` membaca kunci dengan urutan:

1. **env Vercel** (jika pernah diisi), lalu
2. **Firestore `secrets/ai`** (dibaca service account; rules melarang TOTAL
   klien membaca/menulis koleksi `secrets`).

Koleksi `secrets/ai` SUDAH DIISI otomatis via service account (seed batch 9)
dengan keempat kunci di atas → begitu web ter-deploy, Vexo langsung hidup
**tanpa menyentuh dashboard Vercel sama sekali**. Cek status:
`GET /api/ai` → `providers: { sylvatica, jerexd, vexo }`.

Menambah/berganti kunci di masa depan: jalankan ulang seed (atau tulis dokumen
`secrets/ai` lewat service account) — tidak perlu buka Vercel.

## Opsional: tetap ingin isi env Vercel? (±2 menit)

1. Buka https://vercel.com → project **whatsapp-zeroid**.
2. **Settings → Environment Variables → Add New**:
   - Name: `VEXO_APIKEY`, Value: (kunci dari dashboard Vexo), Environments: Production
   - (sama untuk `SYLVATICA_APIKEY` bila belum ada)
3. **Deployments → Redeploy** (centang "Use existing build cache" bebas).

> Cara LEBIH MUDAH & aman: cukup taruh kunci di GitHub Actions secrets —
> CI menyemaimya ke Firestore `secrets/ai` otomatis, tanpa buka Vercel.

## WAJIB setelah batch 9: Redeploy web sekali

Deployment Vercel terakhir masih commit lama (webhook GitHub↔Vercel tidak
menembak untuk push batch 9 — sudah dicoba picu ulang via push kosong).
Satu langkah manual:

1. https://vercel.com → project **whatsapp-zeroid** → tab **Deployments**.
2. Cari build teratas → kalau status **Error/Cancelled**, lihat lognya;
   kalau tidak ada build baru sama sekali → **Settings → Git** → pastikan
   repo `saputraamanah999-dotcom/whatsapp-zeroid` branch `main` terhubung.
3. Klik **⋯ → Redeploy** pada commit teratas ("BATCH 9…") → tunggu ±3 menit.

Setelah itu: AI 3 penyedia + guard-enforce + login-guard + bot-welcome +
voucher + semua fitur batch 9 langsung aktif di web & APK (APK 1.6.0 sudah
terbit di GitHub Release `apk-latest` dan mengarah ke domain ini).
