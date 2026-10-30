# Vexo API + kunci server otomatis (ditulis ulang batch 9)

Penyedia AI/brat/search ke-3 sudah digabung ke Zeroid: rantai failover sekarang
**Sylvatica → JEREXD → Vexo** (penyedia yang terakhir berhasil dicoba lebih dulu).
Stiker Brat memakai urutan **Vexo → siputzx → Sylvatica**.

## Kunci (hanya server — JANGAN pernah EXPO_PUBLIC_)

```
SYLVATICA_APIKEY=sylva-630679ece126c6283d0f42c4da6cce53
JEREXD_APIKEY=jere_ebhzcs-KVLg2
VEXO_APIKEY=l3-Kb-aRMGFeb_Kv
IMGBB_KEY=ae271538eef73c1305493b82bf34b9d5
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
   - Name: `VEXO_APIKEY`, Value: `l3-Kb-aRMGFeb_Kv`, Environments: Production
   - (sama untuk `SYLVATICA_APIKEY` bila belum ada)
3. **Deployments → Redeploy** (centang "Use existing build cache" bebas).

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
