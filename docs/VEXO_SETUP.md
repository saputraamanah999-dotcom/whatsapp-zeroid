# Vexo API — pasang kunci & langkah Vercel (ditulis otomatis)

Penyedia AI/brat/search ke-3 sudah digabung ke Zeroid: rantai failover sekarang
**Sylvatica → JEREXD → Vexo** (penyedia yang terakhir berhasil dicoba lebih dulu).
Stiker Brat memakai urutan **Vexo → siputzx → Sylvatica**.

## Kunci (hanya server — JANGAN pernah EXPO_PUBLIC_)

```
VEXO_APIKEY=l3-Kb-aRMGFeb_Kv
```

Sudah ditulis di `.env` lokal dan `.env.example` repo.

## Langkah memasang di Vercel (±2 menit)

1. Buka https://vercel.com → project **whatsapp-zeroid** (atau nama project-mu).
2. Tab **Settings** → menu kiri **Environment Variables**.
3. Klik **Add New**:
   - Name: `VEXO_APIKEY`
   - Value: `l3-Kb-aRMGFeb_Kv`
   - Environments: centang **Production**, **Preview**, **Development**
   - Save.
4. (Cek sekaligus variabel lama masih ada:) `SYLVATICA_APIKEY`, `JEREXD_APIKEY`,
   `IMGBB_KEY`, `FIREBASE_SERVICE_ACCOUNT`, `SUPABASE_URL`,
   `SUPABASE_SERVICE_ROLE_KEY`, `POSTGRES_URL_NON_POOLING`,
   `EXPO_PUBLIC_FIREBASE_API_KEY` (dipakai server untuk verifikasi sesi bot).
5. Tab **Deployments** → cari deployment teratas → menu ⋯ → **Redeploy**
   (centang *Use existing Build Cache* boleh). Tanpa redeploy, kunci baru belum
   terbaca server.
6. Verifikasi: buka `https://whatsapp-zeroid.vercel.app/api/ai` — bagian
   `providers` harus menampilkan `"vexo": true`.

> Saya tidak menyimpan kredensial Vercel-mu, jadi langkah ini sekali jalan dari
> HP/laptop saja. Setelah itu semua update berikutnya otomatis memakai kunci itu.

## Apa yang didapat setelah aktif

- **AI Zeroid anti-limit**: satu penyedia limit/500/timeout → otomatis pindah
  penyedia berikutnya tanpa pesan apa pun ke pengguna (sticky: yang sehat diingat).
- **Bot Zeroid di grup**: sebut `@zeroid` (atau mention) → bot menjawab dari
  SERVER, walaupun tidak ada perangkat developer yang online dan walaupun
  developer sudah keluar grup. Bot masuk sendiri ke grup saat pertama disebut.
- **Cari di Google**: di chat AI ketik `cari <topik>` → hasil + ringkasan AI +
  daftar sumber.
- **Brat**: pembuatan stiker memakai Vexo lebih dulu (endpoint terverifikasi),
  dengan cadangan otomatis.
