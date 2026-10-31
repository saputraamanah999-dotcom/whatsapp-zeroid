/**
 * Vercel serverless proxy — VANZZ API (apiz.vsunsee.qzz.io).
 *
 * Kunci API Vanzz HANYA hidup di env server (VANZZ_API_KEY) — tidak pernah
 * dikirim ke browser/APK. Semua request client memakai format:
 *
 *   POST /api/vanzz   { action: 'call', key: '<registryKey>', params: {...} }
 *   Authorization: Bearer <Firebase ID token>   (WAJIB)
 *
 * Actions:
 *  - 'call'    : endpoint GRATIS dari whitelist (cuaca, berita, quotes, anime,
 *                gempa, AM finder, brat/smeme stiker, dll). Rate limit per user.
 *  - 'deliver' : { orderId } — REALISASI pesanan produk berbayar yang SUDAH
 *                dikonfirmasi admin (status 'paid'): Check Nomor, Netflix
 *                Premium, AlightMotion Premium, AM Unlock. Server memverifikasi
 *                kepemilikan order, memanggil endpoint Vanzz, lalu MENYIMPAN
 *                hasil ke dokumen order (delivered+result) — hasil bisa dibaca
 *                ulang kapan pun oleh pembeli, tidak bisa dipanggil ulang
 *                tanpa order valid.
 *  - 'qris'    : { amount } — QRIS dinamis dari QRIS statis admin (config/
 *                payments) via endpoint qris/payment Vanzz.
 *
 * Respons endpoint gambar (brat/stiker PNG) dikonversi otomatis menjadi
 * data URL base64 agar bisa langsung dipreview & dikirim di chat.
 */
export const config = { runtime: 'nodejs' };
export const maxDuration = 60;

import { verifyIdToken, fbGetDoc, fbPatchDoc, fbQuery, apiKey } from './_fbrest';

const VANZZ_BASE = 'https://apiz.vsunsee.qzz.io';
const PROJECT = process.env.FIREBASE_PROJECT_ID || 'whatsapp-zeroid';

// ---------------------------------------------------------------------------
// REGISTRY — whitelist endpoint. Path tanpa apikey (ditambah server).
// params: daftar nama param yang diambil dari body (string, dibatasi panjang).
// ---------------------------------------------------------------------------
type Ep = { path: string; params?: string[]; img?: boolean; timeout?: number };

const FREE: Record<string, Ep> = {
  // Check / info publik
  cuaca: { path: '/vsunseeV8/cuaca/check', params: ['kota'] },
  gempa: { path: '/vsunseeV8/gempa/check' },
  bmkg: { path: '/vsunseeV8/bmkg/check' },
  jadwaltv: { path: '/vsunseeV8/jadwaltv/check', params: ['channel'] },
  // Berita
  berita_liputan6: { path: '/vsunseeV8/berita/liputan6' },
  berita_cnbc: { path: '/vsunseeV8/berita/cnbc' },
  berita_cnn: { path: '/vsunseeV8/berita/cnn' },
  berita_antara: { path: '/vsunseeV8/berita/antara' },
  berita_kompas: { path: '/vsunseeV8/berita/kompas' },
  berita_sindonews: { path: '/vsunseeV8/berita/sindonews' },
  // Quotes
  quotes_galau: { path: '/vsunseeV8/quotesgalau' },
  quotes_gombal: { path: '/vsunseeV8/quotesgombal' },
  quotes_motivasi: { path: '/vsunseeV8/quotesmotivasi' },
  // Anime (animein + anikai + otakudesu)
  anime_search: { path: '/vsunseeV8/animein/search', params: ['keyword'] },
  anime_fyp: { path: '/vsunseeV8/animein/fyp' },
  anime_info: { path: '/vsunseeV8/animein/info', params: ['input'] },
  anime_streams: { path: '/vsunseeV8/animein/streams', params: ['id'] },
  anikai_search: { path: '/vsunseeV8/anikai/search', params: ['q'] },
  anikai_detail: { path: '/vsunseeV8/anikai/detail', params: ['slug'] },
  otakudesu_latest: { path: '/vsunseeV8/otakudesu/latest' },
  otakudesu_ongoing: { path: '/vsunseeV8/otakudesu/ongoing' },
  // Tools gratis
  amfinder: { path: '/vsunseeV8/amfinder/search', params: ['url'], timeout: 45000 },
  toqr: { path: '/vsunseeV8/qris/custom', params: ['query'], img: true },
  tts: { path: '/vsunseeV8/tts/tools', params: ['text'], timeout: 45000 },
  kalkulator: { path: '/vsunseeV8/kalkulator/tools', params: ['q'] },
  ssweb: { path: '/vsunseeV8/ssweb/tools', params: ['url'], timeout: 45000 },
  // Stiker (Brat 3 varian + meme 3 varian) — SEMUA balas gambar biner
  // (PNG/JPEG/GIF animasi) → server konversi ke data URL (img: true).
  brat: { path: '/vsunseeV8/brat', params: ['text'], img: true },
  bratvideo: { path: '/vsunseeV8/bratvideo', params: ['text'], img: true, timeout: 55000 },
  bratanime: { path: '/vsunseeV8/bratanime', params: ['text'], img: true },
  randomsticker: { path: '/vsunseeV8/randomsticker', img: true },
  smemev1: { path: '/vsunseeV8/smemev1', params: ['top', 'bottom', 'link'], img: true },
  smemev2: { path: '/vsunseeV8/smemev2', params: ['top', 'bottom', 'link'], img: true },
  // Islamic (gratis, tanpa MuslimAI chat)
  jadwalsholat: { path: '/vsunseeV8/jadwalsholat', params: ['kota'] },
  asmaulhusna: { path: '/vsunseeV8/asmaulhusna' },
  ayatkursi: { path: '/vsunseeV8/ayatkursi' },
  niatsholat: { path: '/vsunseeV8/niatsholat', params: ['sholat'] },
  bacaansholat: { path: '/vsunseeV8/bacaansholat' },
  kisahnabi: { path: '/vsunseeV8/kisahnabi', params: ['nabi'] },
};

/** Produk berbayar — HANYA bisa lewat action 'deliver' dengan order 'paid'.
 *  followers/reaction dipenuhi SERVER langsung (tanpa API luar). */
const PAID: Record<string, Ep> = {
  checknomor: { path: '/vsunseeV8/nomor/check', params: ['nomor'] },
  cekresi: { path: '/vsunseeV8/resi/check', params: ['noresi', 'ekspedisi'] },
  netflix: { path: '/vsunseeV8/netflix/token' },
  amp: { path: '/vsunseeV8/alightmotion/send-link', params: ['email'], timeout: 45000 },
  amunlock: { path: '/vsunseeV8/alightmotion/unlockVip', params: ['email', 'urlVerify'], timeout: 45000 },
};

const ALL = { ...FREE, ...PAID };

// ---------------------------------------------------------------------------
// Rate limit per user (in-memory per instance) — 40 panggilan / 5 menit.
// ---------------------------------------------------------------------------
const RL_WINDOW = 5 * 60_000;
const RL_MAX = 40;
const rl = new Map<string, number[]>();
function rateLimited(uid: string): boolean {
  const now = Date.now();
  const arr = (rl.get(uid) ?? []).filter((t) => now - t < RL_WINDOW);
  if (arr.length >= RL_MAX) { rl.set(uid, arr); return true; }
  arr.push(now);
  rl.set(uid, arr);
  return false;
}

const clean = (v: any, max = 400) => String(v ?? '').slice(0, max).trim();

/** Panggil endpoint Vanzz; gambar → data URL (maks ~6 MB). */
async function vanzzGet(ep: Ep, params: Record<string, string>, key: string): Promise<{ ok: boolean; status: number; data?: any; dataUrl?: string; mime?: string; error?: string }> {
  const url = new URL(VANZZ_BASE + ep.path);
  url.searchParams.set('apikey', key);
  for (const p of ep.params ?? []) {
    const v = clean(params[p], p === 'link' || p === 'url' || p === 'urlVerify' ? 2000 : 300);
    if (v) url.searchParams.set(p, v);
  }
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ep.timeout ?? 35000);
  try {
    const r = await fetch(url.toString(), { signal: ctl.signal });
    const mime = String(r.headers.get('content-type') ?? '');
    if (r.ok && mime.startsWith('image/')) {
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length > 6_500_000) return { ok: false, status: 413, error: 'Gambar hasil terlalu besar.' };
      return { ok: true, status: 200, dataUrl: `data:${mime};base64,${buf.toString('base64')}`, mime };
    }
    const text = await r.text();
    let data: any = null;
    try { data = JSON.parse(text); } catch { data = text.slice(0, 4000); }
    return { ok: r.ok, status: r.status, data };
  } catch (e: any) {
    return { ok: false, status: 0, error: e?.name === 'AbortError' ? 'Waktu tunggu habis.' : 'Gagal menghubungi layanan.' };
  } finally {
    clearTimeout(timer);
  }
}

/** Ambil URL gambar dari berbagai bentuk respons JSON Vanzz. */
function pickImage(data: any): string | null {
  if (!data || typeof data !== 'object') return null;
  const cands = [data.url, data.image, data.result, data.img, data.thumbnail, data?.data?.url, data?.data?.image];
  for (const c of cands) if (typeof c === 'string' && /^https?:\/\//.test(c)) return c;
  return null;
}

/** Ambil pesan galat manusiawi dari respons JSON Vanzz. */
function pickMsg(data: any): string {
  if (data && typeof data === 'object') {
    const m = data.message ?? data.msg ?? data.error ?? data.pesan;
    if (typeof m === 'string' && m.trim()) return m.trim().slice(0, 300);
  }
  return '';
}

async function readBody(req: any): Promise<any> {
  try {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const raw = Buffer.concat(chunks).toString('utf8');
    return JSON.parse(raw);
  } catch { return null; }
}

export default async function handler(req: any, res: any) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Metode tidak didukung.' });

  const auth = String(req.headers?.authorization ?? '');
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const who = await verifyIdToken(token);
  if (!who) return res.status(401).json({ error: 'Masuk dulu untuk memakai fitur ini.' });
  if (rateLimited(who.uid)) return res.status(429).json({ error: 'Terlalu banyak permintaan — tunggu beberapa menit.' });

  const key = (process.env.VANZZ_API_KEY || '').trim();
  if (!key) return res.status(503).json({ error: 'Layanan Vanzz belum dikonfigurasi di server (VANZZ_API_KEY).' });

  const body = await readBody(req);
  const action = String(body?.action ?? 'call');

  // ---------------- QRIS dinamis (pembayaran) ----------------
  if (action === 'qris') {
    const amount = Math.max(1000, Math.min(5_000_000, Math.round(Number(body?.amount) || 0)));
    const cfg = await fbGetDoc(PROJECT, 'config/payments');
    const staticQris = cfg ? String((cfg.qrisImage ?? cfg.qrisStatic ?? '') as string) : '';
    if (!staticQris || !/^https?:\/\//.test(staticQris)) return res.status(404).json({ error: 'QRIS belum diatur admin.' });
    const r = await vanzzGet({ path: '/vsunseeV8/qris/payment', params: ['amount', 'url', 'name'] }, { amount: String(amount), url: staticQris, name: 'ZEROID' }, key);
    if (!r.ok) return res.status(502).json({ error: pickMsg(r.data) || 'Gagal membuat QRIS dinamis.' });
    const img = r.dataUrl ?? pickImage(r.data);
    if (!img) return res.status(502).json({ error: 'QRIS tidak terbaca — pakai QRIS statis di layar pembayaran.' });
    return res.status(200).json({ ok: true, image: img });
  }

  // ---------------- Realisasi pesanan berbayar ----------------
  if (action === 'deliver') {
    const orderId = clean(body?.orderId, 80);
    if (!orderId) return res.status(400).json({ error: 'orderId wajib.' });
    const doc = await fbGetDoc(PROJECT, `orders/${orderId}`);
    if (!doc) return res.status(404).json({ error: 'Pesanan tidak ditemukan.' });
    // fbGetDoc SUDAH mengembalikan fields ter-decode (nilai JS biasa)
    const o: any = doc;
    if (String(o.userId ?? '') !== who.uid) return res.status(403).json({ error: 'Bukan pesanan kamu.' });
    if (String(o.status ?? '') !== 'paid') return res.status(409).json({ error: 'Pesanan belum dikonfirmasi admin.' });
    const product = String(o.product ?? '');
    if (o.delivered) return res.status(200).json({ ok: true, delivered: true, result: o.result ?? null, deliveredAt: o.deliveredAt ?? 0 });
    const meta = (o.meta && typeof o.meta === 'object') ? o.meta : {};

    // ---- PRODUK INTERNAL (tanpa API luar): followers & reaksi saluran ----
    if (product === 'followers' || product === 'reaction') {
      const amount = Math.max(1, Math.round(Number((meta as any).amount) || 0));
      const chName = clean((meta as any).channel, 80);
      if (!amount) return res.status(400).json({ error: 'Jumlah belum valid pada pesanan ini.' });
      if (!chName) return res.status(400).json({ error: 'Nama saluran belum tercatat pada pesanan.' });
      // cari saluran berdasarkan nama (persis dulu; salah kaprah huruf besar-kecil)
      let chatDoc: { id: string; fields: any } | null = null;
      try {
        const exact = await fbQuery(PROJECT, 'chats', [{ field: 'name', op: 'EQUAL', value: chName }], 5);
        chatDoc = (exact ?? []).find((c) => String(c.fields?.type ?? '') === 'channel') ?? (exact ?? [])[0] ?? null;
      } catch { /* lanjut fallback */ }
      if (!chatDoc) {
        try {
          const all = await fbQuery(PROJECT, 'chats', [{ field: 'type', op: 'EQUAL', value: 'channel' }], 100);
          const low = chName.toLowerCase();
          chatDoc = (all ?? []).find((c) => String(c.fields?.name ?? '').toLowerCase() === low) ?? null;
        } catch { /* tetap null */ }
      }
      const chatId = chatDoc?.id ?? '';
      if (!chatId) {
        await fbPatchDoc(PROJECT, `orders/${orderId}`, {
          deliveryError: { stringValue: `Saluran "${chName.slice(0, 60)}" tidak ditemukan — hubungi admin untuk penyesuaian.` },
          deliveryTriedAt: { integerValue: String(Date.now()) },
        } as any);
        return res.status(404).json({ error: `Saluran "${chName}" tidak ditemukan.` });
      }
      if (product === 'followers') {
        const cur = Number(chatDoc?.fields?.extraFollowers ?? 0);
        const next = cur + amount;
        const okp = await fbPatchDoc(PROJECT, `chats/${chatId}`, { extraFollowers: { integerValue: String(next) } } as any);
        if (!okp) return res.status(502).json({ error: 'Gagal menambahkan followers — coba lagi.' });
        const at2 = Date.now();
        await fbPatchDoc(PROJECT, `orders/${orderId}`, {
          delivered: { booleanValue: true },
          deliveredAt: { integerValue: String(at2) },
          result: { mapValue: { fields: { json: { stringValue: JSON.stringify({ kind: 'followers', channel: chName, added: amount, total: next }).slice(0, 4000) } } } },
          deliveryError: { nullValue: null },
        } as any);
        return res.status(200).json({ ok: true, delivered: true, result: { kind: 'followers', channel: chName, added: amount, total: next }, deliveredAt: at2 });
      }
      // product === 'reaction' → tumpuk reaksi ke PESAN TERAKHIR saluran
      let lastMsgId = '';
      let lastExtra = 0;
      try {
        const msgs = await fbQuery(PROJECT, `chats/${chatId}/messages`, [], 1, { field: 'createdAt', desc: true });
        lastMsgId = (msgs ?? [])[0]?.id ?? '';
        lastExtra = Number((msgs ?? [])[0]?.fields?.extraReactions ?? 0);
      } catch { /* tetap kosong */ }
      if (!lastMsgId) return res.status(404).json({ error: 'Belum ada pesan di saluran itu untuk direaksi.' });
      const okp = await fbPatchDoc(PROJECT, `chats/${chatId}/messages/${lastMsgId}`, { extraReactions: { integerValue: String(lastExtra + amount) } } as any);
      if (!okp) return res.status(502).json({ error: 'Gagal menambahkan reaksi — coba lagi.' });
      const at2 = Date.now();
      await fbPatchDoc(PROJECT, `orders/${orderId}`, {
        delivered: { booleanValue: true },
        deliveredAt: { integerValue: String(at2) },
        result: { mapValue: { fields: { json: { stringValue: JSON.stringify({ kind: 'reaction', channel: chName, added: amount }).slice(0, 4000) } } } },
        deliveryError: { nullValue: null },
      } as any);
      return res.status(200).json({ ok: true, delivered: true, result: { kind: 'reaction', channel: chName, added: amount }, deliveredAt: at2 });
    }

    const params: Record<string, string> = {
      nomor: clean((meta as any).nomor, 30),
      email: clean((meta as any).email, 120),
      urlVerify: clean((meta as any).urlVerify, 500),
      noresi: clean((meta as any).resi, 60),
      ekspedisi: clean((meta as any).ekspedisi, 40).toLowerCase().replace(/\s+/g, '-'),
    };
    // AM Premium: kalau pembeli sudah menempel URL verifikasi → pakai jalur unlock
    const epAdj = (product === 'amp' && params.urlVerify) ? PAID.amunlock : PAID[product];
    if (!epAdj) return res.status(400).json({ error: 'Produk ini tidak butuh realisasi API.' });
    const r = await vanzzGet(epAdj, params, key);
    if (!r.ok) {
      const msg = pickMsg(r.data) || r.error || `Layanan ${product} sedang tidak bisa dihubungi (HTTP ${r.status}).`;
      await fbPatchDoc(PROJECT, `orders/${orderId}`, {
        deliveryError: { stringValue: msg.slice(0, 300) },
        deliveryTriedAt: { integerValue: String(Date.now()) },
      } as any);
      return res.status(502).json({ error: msg });
    }
    const result = r.data ?? { image: r.dataUrl };
    if (r.dataUrl) (result as any).image = r.dataUrl;
    const at = Date.now();
    await fbPatchDoc(PROJECT, `orders/${orderId}`, {
      delivered: { booleanValue: true },
      deliveredAt: { integerValue: String(at) },
      result: { mapValue: { fields: { json: { stringValue: JSON.stringify(result).slice(0, 12000) } } } },
      deliveryError: { nullValue: null },
    } as any);
    return res.status(200).json({ ok: true, delivered: true, result, deliveredAt: at });
  }

  // ---------------- VERIFIKASI ALIGHTMOTION (langkah 2) ----------------
  /**
   * Pembeli tempel URL verifikasi dari email (termasuk folder SPAM) → server
   * memanggil endpoint unlock AlightMotion (email + urlVerify) → hasil "Yeay!
   * Akun kamu udah premium" tersimpan ke pesanan. Order tetap milik pembeli;
   * untuk order 'amp' yang sudah delivered pun boleh diverifikasi (link sudah
   * dikirim dulu lewat deliver).
   */
  if (action === 'amverify') {
    const orderId = clean(body?.orderId, 80);
    const urlVerify = clean(body?.urlVerify, 500);
    if (!orderId) return res.status(400).json({ error: 'orderId wajib.' });
    if (!/^https?:\/\//i.test(urlVerify)) return res.status(400).json({ error: 'Tempel URL verifikasi dari email kamu (diawali https://).' });
    const doc = await fbGetDoc(PROJECT, `orders/${orderId}`);
    if (!doc) return res.status(404).json({ error: 'Pesanan tidak ditemukan.' });
    const o: any = doc;
    if (String(o.userId ?? '') !== who.uid) return res.status(403).json({ error: 'Bukan pesanan kamu.' });
    if (String(o.status ?? '') !== 'paid') return res.status(409).json({ error: 'Pesanan belum dikonfirmasi admin.' });
    const product = String(o.product ?? '');
    if (product !== 'amp' && product !== 'amunlock') return res.status(400).json({ error: 'Verifikasi hanya untuk produk AlightMotion.' });
    const meta = (o.meta && typeof o.meta === 'object') ? o.meta : {};
    const email = clean((meta as any).email, 120);
    if (!email) return res.status(400).json({ error: 'Email belum tercatat pada pesanan.' });
    // tandai urlVerify di order (jejak) lalu panggil endpoint unlock
    const newMeta: Record<string, any> = {};
    for (const [k, v] of Object.entries(meta)) {
      if (v == null) continue;
      if (typeof v === 'number') newMeta[k] = { integerValue: String(v) };
      else if (typeof v === 'boolean') newMeta[k] = { booleanValue: v };
      else newMeta[k] = { stringValue: String(v).slice(0, 500) };
    }
    newMeta.urlVerify = { stringValue: urlVerify.slice(0, 500) };
    await fbPatchDoc(PROJECT, `orders/${orderId}`, {
      meta: { mapValue: { fields: newMeta } },
    } as any).catch(() => {});
    const r = await vanzzGet(PAID.amunlock, { email, urlVerify }, key);
    const at = Date.now();
    if (!r.ok) {
      const msg = pickMsg(r.data) || r.error || `Verifikasi gagal (HTTP ${r.status}) — pastikan URL-nya persis dari email.`;
      await fbPatchDoc(PROJECT, `orders/${orderId}`, {
        deliveryError: { stringValue: msg.slice(0, 300) },
        deliveryTriedAt: { integerValue: String(at) },
      } as any);
      return res.status(502).json({ error: msg });
    }
    const result = r.data ?? {};
    (result as any).verifyDone = true;
    await fbPatchDoc(PROJECT, `orders/${orderId}`, {
      delivered: { booleanValue: true },
      deliveredAt: { integerValue: String(at) },
      result: { mapValue: { fields: { json: { stringValue: JSON.stringify(result).slice(0, 12000) } } } },
      deliveryError: { nullValue: null },
    } as any);
    return res.status(200).json({ ok: true, delivered: true, result, deliveredAt: at });
  }

  // ---------------- Endpoint gratis (whitelist) ----------------
  const key2 = clean(body?.key, 40);
  const ep = FREE[key2];
  if (!ep) return res.status(404).json({ error: 'Endpoint tidak tersedia.' });
  const rawParams = (body?.params && typeof body.params === 'object') ? body.params : {};
  const params: Record<string, string> = {};
  for (const p of ep.params ?? []) params[p] = clean((rawParams as any)[p], p === 'link' || p === 'url' ? 2000 : 400);
  const r = await vanzzGet(ep, params, key);
  if (!r.ok) return res.status(502).json({ error: pickMsg(r.data) || r.error || `Layanan sedang tidak tersedia (HTTP ${r.status}).` });
  if (ep.img || r.dataUrl) {
    const img = r.dataUrl ?? pickImage(r.data);
    if (img) return res.status(200).json({ ok: true, image: img });
    return res.status(502).json({ error: pickMsg(r.data) || 'Gambar tidak berhasil dibuat.' });
  }
  return res.status(200).json({ ok: true, data: r.data });
}

// apiKey() diimpor hanya untuk kompatibilitas pola lama; tidak dipakai langsung.
void apiKey;
