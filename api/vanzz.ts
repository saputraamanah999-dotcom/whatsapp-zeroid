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

// ---------------------------------------------------------------------------
// CUACA 7 HARI (Open-Meteo, tanpa API key) — prakiraan LENGKAP Senin–Minggu:
// suhu max/min, peluang hujan %, volume hujan, angin, UV, matahari terbit/ter-
// benam + jam-jaman (hujan mulai jam berapa). Sumber lebih kaya daripada wttr
// (yang cuma kondisi sekarang) untuk layar Cuaca Menu Gratis.
// ---------------------------------------------------------------------------
const WMO: Record<number, [string, string]> = {
  0: ['Cerah', 'sunny'], 1: ['Cerah Berawan', 'partly-sunny'], 2: ['Berawan Sebagian', 'partly-sunny'],
  3: ['Berawan', 'cloud'], 45: ['Berkabut', 'cloud'], 48: ['Kabut Beku', 'cloud'],
  51: ['Gerimis Ringan', 'rainy'], 53: ['Gerimis', 'rainy'], 55: ['Gerimis Lebat', 'rainy'],
  56: ['Gerimis Beku', 'rainy'], 57: ['Gerimis Beku Lebat', 'rainy'],
  61: ['Hujan Ringan', 'rainy'], 63: ['Hujan', 'rainy'], 65: ['Hujan Lebat', 'rainy'],
  66: ['Hujan Beku', 'rainy'], 67: ['Hujan Beku Lebat', 'rainy'],
  71: ['Salju Ringan', 'snow'], 73: ['Salju', 'snow'], 75: ['Salju Lebat', 'snow'], 77: ['Butiran Salju', 'snow'],
  80: ['Hujan Lokal Ringan', 'rainy'], 81: ['Hujan Lokal', 'rainy'], 82: ['Hujan Lokal Deras', 'thunderstorm'],
  85: ['Hujan Salju Ringan', 'snow'], 86: ['Hujan Salju Lebat', 'snow'],
  95: ['Hujan Badai Petir', 'thunderstorm'], 96: ['Badai Petir + Hail', 'thunderstorm'], 99: ['Badai Petir Hebat', 'thunderstorm'],
};
const wmo = (c: any): [string, string] => WMO[Number(c)] ?? ['Berawan', 'cloud'];

async function openMeteo(kota: string): Promise<any> {
  const gc = new AbortController();
  const gt = setTimeout(() => gc.abort(), 12000);
  let place: any = null;
  try {
    const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(kota)}&count=1&language=id&format=json`, { signal: gc.signal });
    const j = await r.json().catch(() => null);
    place = j?.results?.[0] ?? null;
  } catch { /* null */ } finally { clearTimeout(gt); }
  if (!place) return { error: `Kota "${kota.slice(0, 40)}" tidak ditemukan — coba nama kota lain.` };

  const fc = new AbortController();
  const ft = setTimeout(() => fc.abort(), 15000);
  try {
    const u = new URL('https://api.open-meteo.com/v1/forecast');
    u.searchParams.set('latitude', String(place.latitude));
    u.searchParams.set('longitude', String(place.longitude));
    u.searchParams.set('current', 'temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,wind_direction_10m,pressure_msl');
    u.searchParams.set('hourly', 'temperature_2m,precipitation_probability,precipitation,weather_code');
    u.searchParams.set('daily', 'weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,uv_index_max,precipitation_sum,precipitation_probability_max,wind_speed_10m_max');
    u.searchParams.set('timezone', 'auto');
    u.searchParams.set('forecast_days', '7');
    const r = await fetch(u.toString(), { signal: fc.signal });
    const j = await r.json().catch(() => null);
    if (!j?.daily?.time) return { error: 'Prakiraan cuaca tidak tersedia saat ini.' };
    const cur = j.current ?? {};
    const curCode = wmo(cur.weather_code);
    const daily = (j.daily.time as string[]).map((d: string, i: number) => {
      const code = wmo(j.daily.weather_code?.[i]);
      return {
        date: d,
        desc: code[0],
        icon: code[1],
        tmax: Math.round(j.daily.temperature_2m_max?.[i] ?? 0),
        tmin: Math.round(j.daily.temperature_2m_min?.[i] ?? 0),
        rainMm: Math.round((j.daily.precipitation_sum?.[i] ?? 0) * 10) / 10,
        rainProb: Math.round(j.daily.precipitation_probability_max?.[i] ?? 0),
        wind: Math.round(j.daily.wind_speed_10m_max?.[i] ?? 0),
        uv: Math.round((j.daily.uv_index_max?.[i] ?? 0) * 10) / 10,
        sunrise: String(j.daily.sunrise?.[i] ?? '').slice(11, 16),
        sunset: String(j.daily.sunset?.[i] ?? '').slice(11, 16),
      };
    });
    // jam-jaman 24 jam ke depan: hujan mulai jam berapa (fokus permintaan user)
    const nowIso = new Date().toISOString().slice(0, 13);
    const times: string[] = j.hourly?.time ?? [];
    let start = times.findIndex((t) => t.slice(0, 13) >= nowIso);
    if (start < 0) start = 0;
    const hourly = times.slice(start, start + 24).map((t: string, k: number) => {
      const idx = start + k;
      const code = wmo(j.hourly.weather_code?.[idx]);
      return {
        time: t.slice(11, 16),
        temp: Math.round(j.hourly.temperature_2m?.[idx] ?? 0),
        rainProb: Math.round(j.hourly.precipitation_probability?.[idx] ?? 0),
        rainMm: Math.round((j.hourly.precipitation?.[idx] ?? 0) * 10) / 10,
        desc: code[0],
      };
    });
    return {
      place: place.name,
      region: [place.admin1, place.country].filter(Boolean).join(', '),
      current: {
        desc: curCode[0], icon: curCode[1],
        temp: Math.round(cur.temperature_2m ?? 0),
        feels: Math.round(cur.apparent_temperature ?? 0),
        humidity: Math.round(cur.relative_humidity_2m ?? 0),
        wind: Math.round(cur.wind_speed_10m ?? 0),
        windDir: Math.round(cur.wind_direction_10m ?? 0),
        pressure: Math.round(cur.pressure_msl ?? 0),
        precip: Math.round((cur.precipitation ?? 0) * 10) / 10,
      },
      daily,
      hourly,
      source: 'Open-Meteo',
    };
  } catch (e: any) {
    return { error: e?.name === 'AbortError' ? 'Waktu tunggu cuaca habis — coba lagi.' : 'Gagal mengambil data cuaca.' };
  } finally { clearTimeout(ft); }
}

// ---------------------------------------------------------------------------
// QUOTES FALLBACK — endpoint Vanzz quotes kadang 404 (terbukti live). Cadangan
// kutipan Indonesia bawaan server agar fitur Quotes TETAP hidup (acak tiap minta).
// ---------------------------------------------------------------------------
const QUOTES_POOL: Record<string, string[]> = {
  motivasi: [
    'Hidup bukan soal menunggu badai berlalu, tapi belajar menari di tengah hujan.',
    'Gagal itu bukan akhir; berhenti mencoba barulah akhir sejati.',
    'Kejar apa yang benar-benar kamu mau, sisanya akan mengikuti.',
    'Perubahan tidak pernah datang dari kenyamanan.',
    'Kerja keras mengalahkan bakat ketika bakat tidak mau bekerja keras.',
    'Sedikit demi sedikit, lama-lama menjadi bukit.',
    'Kecewa itu wajar, tapi jangan menyerah sebelum mencoba lagi.',
    'Bermimpilah setinggi langit; jika gagal, kamu jatuh di antara bintang-bintang.',
    'Disiplin adalah jembatan antara tujuan dan pencapaian.',
    'Jangan bandingkan awalmu dengan milik orang lain yang sudah jauh berjalan.',
    'Setiap ahli dulunya pemula yang tidak menyerah.',
    'Hari yang berat hari ini adalah latihan untuk besok yang lebih kuat.',
    'Fokus pada langkah kecil yang berulang setiap hari.',
    'Waktu terbaik untuk mulai adalah sekarang.',
    'Sukses bukan milik yang pintar, tapi milik yang konsisten.',
    'Kegagalan adalah data, bukan identitas.',
    'Belajar hari ini, kuat esok hari.',
    'Resapi prosesnya, nikmati hasilnya nanti.',
    'Pikiran yang tenang menyelesaikan masalah lebih cepat.',
    'Jadikan rasa takut sebagai bahan bakar, bukan tembok.',
    'Kamu tidak butuh sempurna untuk memulai, kamu butuh mulai untuk jadi sempurna.',
    'Istirahat boleh, berhenti jangan.',
    'Kebaikan kecil hari ini adalah cerita besar di masa depan.',
    'Yang membuatmu lelah bukan beban, tapi cara kamu membawanya.',
  ],
  galau: [
    'Kadang yang paling menyakitkan bukan perpisahan, tapi harapan yang tak pernah sampai.',
    'Aku baik-baik saja, cuma sedikit kelelahan berpura-pura kuat.',
    'Chat yang tak pernah dibalas itu seperti menunggu hujan di musim kemarau.',
    'Rindu boleh jalan sendiri, ternyata hati belum ikut pulang.',
    'Bukan tak sayang, cuma lelah jadi satu-satunya yang berjuang.',
    'Kenangan paling manis kadang jadi racun paling pahit.',
    'Cukup satu nama untuk bikin semalaman tak bisa tidur.',
    'Pernah jadi segalanya, sekarang cuma jadi bagian dari masa lalu.',
    'Lelah itu bukan karena jarak, tapi karena bertanya dalam hati tanpa jawaban.',
    'Tersenyumlah, walau hati sedang tidak sejalan dengan bibir.',
    'Kadang dipendamkan lebih tenang daripada diceritakan.',
    'Hujan turun membawa cerita yang tak sempat terucap.',
    'Yang hilang tidak kembali, tapi kenangannya suka mampir.',
    'Punya banyak teman tapi tak punya tempat bercerita.',
    'Statusnya update, hatinya diam-diam sedang hancur.',
    'Tunggu itu nggak capek, yang capek itu harapan yang selalu tertunda.',
    'Maaf ya, aku mundur bukan karena tak cinta, tapi karena tak dipilih.',
    'Beda cerita, beda pula ending-nya.',
  ],
  gombal: [
    'Kamu tahu gak bedanya kamu sama bintang? Kalau bintang di langit, kamu di hati.',
    'Pulsa habis karena telepon, baterai habis karena chat, kalau hati habis karena kamu.',
    'Papa kamu tukang sulap ya? Kok papamu bisa bikin muncul malaikat kayak kamu?',
    'Kalau kamu bertanya sejauh mana sayangku, coba hitung air di lautan.',
    'Jangan deket-deket asap rokok, nanti kebawa. Jangan juga deket-deket aku, nanti cinta.',
    'Kamu itu seperti garam, kalau tidak ada kamu semua terasa hambar.',
    'Kamu dari planet mana? Karena manisnya kayaknya bukan dari bumi.',
    'Kamu pernah dikejar zombie belum? Kok aku pernah, dikejar pikirannya kamu terus.',
    'Apakah kamu tired? Karena kamu telah berjalan sepanjang hari di pikiranku.',
    'Roti bantu deng? Sama kaya hatiku yang terbantukan sejak lihat kamu.',
    'Aku pengen jadi vitamin kamu, biar kamu cari aku tiap hari.',
    'Kalau cinta itu pelanggaran, bersediakah kamu jadi korban bersama?',
    'Matahari terbit dari timur, tapi hari terbit sejak kamu membalas chat.',
    'Aku bukan peminum kopi, tapi kok tiap lihat kamu jadi meleleh.',
    'Nomor darurat 112 ya? Karena setiap dekat kamu, jantungku darurat.',
    'Kamu benturan terus ya? Karena hatiku setiap ketemu kamu benturan.',
  ],
};
function quotesFallback(kind: string): string[] {
  const pool = QUOTES_POOL[kind] ?? QUOTES_POOL.motivasi;
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, 3);
}

// ---------------------------------------------------------------------------
// GEMPA FALLBACK LANGSUNG BMKG — endpoint Vanzz gempa/bmkg kadang 404/503
// (terbukti live). Sumber resmi BMKG publik & tanpa kunci; bentuk respons
// dibuat sama seperti Vanzz agar parser klien tidak berubah.
// ---------------------------------------------------------------------------
async function bmkgDirect(): Promise<{ data?: any; error?: string }> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 12000);
  try {
    const get = (u: string) => fetch(u, { signal: ctl.signal, headers: { accept: 'application/json' } }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    const [auto, terkini, dirasakan] = await Promise.all([
      get('https://data.bmkg.go.id/DataMKG/TEWS/autogempa.json'),
      get('https://data.bmkg.go.id/DataMKG/TEWS/gempaterkini.json'),
      get('https://data.bmkg.go.id/DataMKG/TEWS/gempadirasakan.json'),
    ]);
    const g = auto?.Infogempa?.gempa;
    if (!g) return { error: 'Data gempa BMKG tidak terbaca — coba lagi sebentar.' };
    return {
      data: {
        status: true,
        result: {
          auto: { Infogempa: { gempa: g } },
          terkini: terkini?.Infogempa?.gempa ? terkini : null,
          dirasakan: dirasakan?.Infogempa?.gempa ? dirasakan : null,
        },
      },
    };
  } catch {
    return { error: 'Gagal menghubungi BMKG — coba lagi sebentar.' };
  } finally {
    clearTimeout(timer);
  }
}


// ---------------------------------------------------------------------------
// BERITA FALLBACK RSS — endpoint Vanzz berita ikut flaky (404 terbukti live).
// Cadangan: RSS resmi tiap media (publik, tanpa kunci) → bentuk respons sama
// seperti Vanzz ({status, result:[{title,url,image,snippet,date}]}).
// ---------------------------------------------------------------------------
const BERITA_RSS: Record<string, string> = {
  berita_kompas: 'https://www.kompas.com/feed/rss.xml',
  berita_cnn: 'https://www.cnnindonesia.com/rss',
  berita_liputan6: 'https://www.liputan6.com/rss/feed',
  berita_antara: 'https://www.antaranews.com/rss/news',
  berita_cnbc: 'https://www.cnbcindonesia.com/site/rss/news',
  berita_sindonews: 'https://www.sindonews.com/feed',
};
function rssTag(block: string, tag: string): string {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return m ? m[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim() : '';
}
async function beritaRss(feed: string): Promise<{ data?: any; error?: string }> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 12000);
  try {
    const xml = await fetch(feed, { signal: ctl.signal, headers: { accept: 'application/rss+xml,application/xml,text/xml', 'user-agent': 'Mozilla/5.0 zeroid-news/1.0' } }).then((x) => x.text());
    const items = xml.match(/<item[\s\S]*?<\/item>/gi) ?? [];
    const list = items.slice(0, 30).map((it) => {
      const title = rssTag(it, 'title');
      const link = rssTag(it, 'link');
      const desc = rssTag(it, 'description').replace(/<[^>]+>/g, '').slice(0, 180);
      const pub = rssTag(it, 'pubDate');
      const imgM = it.match(/<enclosure[^>]*url="([^"]+)"|<media:content[^>]*url="([^"]+)"|<image[^>]*url="([^"]+)"/i);
      const img = imgM ? (imgM[1] || imgM[2] || imgM[3] || '') : '';
      return { title, url: link, snippet: desc, image: /^https?:/.test(img) ? img : undefined, date: pub };
    }).filter((x) => x.title && x.url);
    if (!list.length) return { error: 'Berita tidak terbaca dari sumbernya.' };
    return { data: { status: true, result: list } };
  } catch {
    return { error: 'Gagal menghubungi sumber berita — coba lagi.' };
  } finally {
    clearTimeout(timer);
  }
}

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

/** params object aman dari body luar. */
function rawParams0(body: any): Record<string, any> {
  return (body?.params && typeof body.params === 'object') ? body.params : {};
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
      // PENTING: Firestore REST butuh NILAI BERTIPE ({stringValue}) — dulu string
      // mentah dikirim → query 400 → kedua pencarian balik [] → deliver selalu
      // "Saluran tidak ditemukan" walau salurannya ada (bug v23).
      let chatDoc: { id: string; fields: any } | null = null;
      try {
        const exact = await fbQuery(PROJECT, 'chats', [{ field: 'name', op: 'EQUAL', value: { stringValue: chName } }], 5);
        chatDoc = (exact ?? []).find((c) => String(c.fields?.type ?? '') === 'channel') ?? (exact ?? [])[0] ?? null;
      } catch { /* lanjut fallback */ }
      if (!chatDoc) {
        try {
          const all = await fbQuery(PROJECT, 'chats', [{ field: 'type', op: 'EQUAL', value: { stringValue: 'channel' } }], 100);
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
      // product === 'reaction' → tumpuk reaksi ke pesan saluran: PILIHAN pembeli
      // (meta.messageId) bila valid, kalau tidak ke PESAN TERAKHIR saluran.
      let targetMsgId = '';
      let targetExtra = 0;
      const wanted = clean((meta as any).messageId, 80);
      try {
        if (wanted) {
          const d = await fbGetDoc(PROJECT, `chats/${chatId}/messages/${wanted}`);
          if (d) { targetMsgId = wanted; targetExtra = Number((d as any).extraReactions ?? 0); }
        }
      } catch { /* jatuh ke pesan terakhir */ }
      if (!targetMsgId) {
        try {
          const msgs = await fbQuery(PROJECT, `chats/${chatId}/messages`, [], 1, { field: 'createdAt', desc: true });
          targetMsgId = (msgs ?? [])[0]?.id ?? '';
          targetExtra = Number((msgs ?? [])[0]?.fields?.extraReactions ?? 0);
        } catch { /* tetap kosong */ }
      }
      if (!targetMsgId) return res.status(404).json({ error: 'Belum ada pesan di saluran itu untuk direaksi.' });
      const okp = await fbPatchDoc(PROJECT, `chats/${chatId}/messages/${targetMsgId}`, { extraReactions: { integerValue: String(targetExtra + amount) } } as any);
      if (!okp) return res.status(502).json({ error: 'Gagal menambahkan reaksi — coba lagi.' });
      const at2 = Date.now();
      await fbPatchDoc(PROJECT, `orders/${orderId}`, {
        delivered: { booleanValue: true },
        deliveredAt: { integerValue: String(at2) },
        result: { mapValue: { fields: { json: { stringValue: JSON.stringify({ kind: 'reaction', channel: chName, added: amount, messageId: targetMsgId }).slice(0, 4000) } } } },
        deliveryError: { nullValue: null },
      } as any);
      return res.status(200).json({ ok: true, delivered: true, result: { kind: 'reaction', channel: chName, added: amount, messageId: targetMsgId }, deliveredAt: at2 });
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
  // CUACA LENGKAP 7 HARI — Open-Meteo via server (tanpa kunci), params: { kota }
  if (key2 === 'cuaca7') {
    const kota = clean(rawParams0(body)?.kota, 60);
    if (!kota) return res.status(400).json({ error: 'Tulis nama kotanya dulu.' });
    const out = await openMeteo(kota);
    if (out.error) return res.status(404).json({ error: out.error });
    return res.status(200).json({ ok: true, data: out });
  }
  const ep = FREE[key2];
  if (!ep) return res.status(404).json({ error: 'Endpoint tidak tersedia.' });
  const rawParams = (body?.params && typeof body.params === 'object') ? body.params : {};
  const params: Record<string, string> = {};
  for (const p of ep.params ?? []) params[p] = clean((rawParams as any)[p], p === 'link' || p === 'url' ? 2000 : 400);
  const r = await vanzzGet(ep, params, key);
  // GEMPA/BMKG: Vanzz flaky (404/503 terbukti live) → fallback LANGSUNG BMKG
  if (!r.ok && (key2 === 'gempa' || key2 === 'bmkg')) {
    const b = await bmkgDirect();
    if (b.data) return res.status(200).json({ ok: true, data: b.data });
    return res.status(502).json({ error: b.error ?? 'Gempa sedang tidak tersedia.' });
  }
  // QUOTES: Vanzz flaky (404 terbukti live) → cadangan kutipan bawaan server
  if (!r.ok && key2.startsWith('quotes_')) {
    const kind = key2.replace('quotes_', '');
    return res.status(200).json({ ok: true, data: { status: true, quotes: quotesFallback(kind) } });
  }
  // BERITA: Vanzz flaky → RSS resmi media
  if (!r.ok && BERITA_RSS[key2]) {
    const b = await beritaRss(BERITA_RSS[key2]);
    if (b.data) return res.status(200).json({ ok: true, data: b.data });
    return res.status(502).json({ error: b.error ?? 'Berita sedang tidak tersedia.' });
  }
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
