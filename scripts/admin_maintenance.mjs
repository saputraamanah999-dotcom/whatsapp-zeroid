/**
 * ZEROID ADMIN MAINTENANCE (CI-only) — jalankan via GitHub Actions
 * (.github/workflows/maintenance.yml) memakai secret FIREBASE_SERVICE_ACCOUNT.
 *
 * TANPA dependency: JWT RS256 ditandatangani node:crypto (pola yang sama dengan
 * scripts/ci-deploy-rules.mjs). Semua output hanya berisi field NON-rahasia
 * (uid, email, flag ban, id dokumen ber-hash) — tidak pernah menampilkan kunci.
 *
 * Perintah:
 *   inspect                      — status ban: users, bans, banips, devices
 *   liftban --email=a@b --email=c@d [--uid=UID]...
 *                                — buka SEMUA ban akun tsb: users.banned=false,
 *                                  bans.active=false, HAPUS banips/devices miliknya
 *   setrole --email=a@b --role=developer
 *   verifyrules                  — RANGKAIAN UJI NYATA rules Firestore (REST,
 *                                  akun uji sementara, dibersihkan sesudahnya)
 *
 * PENTING: skrip ini HANYA dijalankan lewat GitHub Actions (rahasia tidak pernah
 * menyentuh repositori / log yang dicetak).
 */
import crypto from 'node:crypto';

const b64url = (b) => Buffer.from(b).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

function loadSA() {
  let raw = (process.env.FIREBASE_SERVICE_ACCOUNT || '').trim();
  if (!raw) { console.log('SECRET_FIREBASE_SERVICE_ACCOUNT=empty'); process.exit(1); }
  if (!raw.startsWith('{')) raw = Buffer.from(raw, 'base64').toString('utf8');
  return JSON.parse(raw);
}

async function accessToken(SA) {
  const now = Math.floor(Date.now() / 1000);
  const h = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const p = b64url(JSON.stringify({
    iss: SA.client_email, scope: 'https://www.googleapis.com/auth/cloud-platform https://www.googleapis.com/auth/firebase https://www.googleapis.com/auth/identitytoolkit',
    aud: SA.token_uri, iat: now, exp: now + 3600,
  }));
  const s = crypto.createSign('RSA-SHA256'); s.update(h + '.' + p);
  const jwt = h + '.' + p + '.' + b64url(s.sign(SA.private_key.replace(/\\n/g, '\n')));
  const r = await fetch(SA.token_uri, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }) });
  const j = await r.json();
  if (!j.access_token) throw new Error('oauth gagal: ' + JSON.stringify(j).slice(0, 200));
  return j.access_token;
}

const PROJ = loadSA().project_id;
const FS = `https://firestore.googleapis.com/v1/projects/${PROJ}/databases/(default)`;
let TOKEN = '';
const authHdr = () => ({ Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------- Firestore REST helpers ----------------

function typedValue(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  return { stringValue: String(v) };
}

/** commit beberapa write ATOMIK (transaksi) — returns array hasil per write */
async function commit(writes) {
  const r = await fetch(`${FS}/documents:commit`, { method: 'POST', headers: authHdr(), body: JSON.stringify({ writes }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j?.error?.message || `commit HTTP ${r.status}`), { status: r.status, body: j });
  return j;
}

function updateWrite(path, fields, { mask = null, currentDoc = null } = {}) {
  const w = {
    update: { name: `${FS}/documents/${path}`, fields },
  };
  if (mask) w.updateMask = { fieldPaths: mask };
  if (currentDoc) w.currentDoc = { exists: currentDoc };
  return w;
}

function deleteWrite(path) {
  return { delete: `${FS}/documents/${path}` };
}

async function patchDoc(path, fields, mask) {
  const fs = {};
  for (const [k, v] of Object.entries(fields)) fs[k] = typedValue(v);
  const maskQ = mask ? `?updateMask.fieldPaths=${mask.map(encodeURIComponent).join('&updateMask.fieldPaths=')}` : '';
  const r = await fetch(`${FS}/documents/${path}${maskQ}`, { method: 'PATCH', headers: authHdr(), body: JSON.stringify({ fields: fs }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j?.error?.message || `patch HTTP ${r.status}`), { status: r.status });
  return j;
}

async function getDoc(path) {
  const r = await fetch(`${FS}/documents/${path}`, { headers: authHdr() });
  if (r.status === 404) return null;
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j?.error?.message || `get HTTP ${r.status}`), { status: r.status });
  return j;
}

async function listDocs(collectionId, pageSize = 200) {
  const out = [];
  let pageToken = '';
  do {
    const r = await fetch(`${FS}/documents/${collectionId}?pageSize=${pageSize}${pageToken ? `&pageToken=${pageToken}` : ''}`, { headers: authHdr() });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`list ${collectionId}: ${j?.error?.message || r.status}`);
    for (const d of j.documents ?? []) out.push(d);
    pageToken = j.nextPageToken || '';
  } while (pageToken);
  return out;
}

async function runQuery(collectionId, filters = [], selectFields = []) {
  const body = {
    structuredQuery: {
      from: [{ collectionId, allDescendants: false }],
      where: filters.length === 1 ? filters[0] : filters.length ? { compositeFilter: { op: 'AND', filters } } : undefined,
      ...(selectFields.length ? { select: { fields: selectFields.map((f) => ({ fieldPath: f })) } } : {}),
      limit: { value: 400 },
    },
  };
  const r = await fetch(`${FS}/documents:runQuery`, { method: 'POST', headers: authHdr(), body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`query ${collectionId}: ${j?.error?.message || r.status}`);
  return (Array.isArray(j) ? j : []).filter((x) => x.document).map((x) => x.document);
}

const fieldFilter = (f, op, v) => ({ fieldFilter: { field: { fieldPath: f }, op, value: typedValue(v) } });
const docId = (d) => (d?.name ?? '').split('/documents/')[1] ?? '';
const fv = (d, f) => {
  const raw = d?.fields?.[f];
  if (!raw) return undefined;
  if ('stringValue' in raw) return raw.stringValue;
  if ('integerValue' in raw) return Number(raw.integerValue);
  if ('doubleValue' in raw) return Number(raw.doubleValue);
  if ('booleanValue' in raw) return raw.booleanValue;
  if ('nullValue' in raw) return null;
  return raw;
};

/** ID token akun uji (identitytoolkit) — dipakai untuk uji rules SEBENARNYA */
async function idTokenFor(email, password, apiKey, { signUp = false } = {}) {
  const ep = signUp ? 'accounts:signUp' : 'accounts:signInWithPassword';
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/${ep}?key=${apiKey}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j?.error?.message || `identitytoolkit HTTP ${r.status}`), { kind: 'identitytoolkit' });
  return { idToken: j.idToken, localId: j.localId };
}

/** uji operasi Firestore PAKAI ID TOKEN user (rules dievaluasi sungguhan) */
async function userFetch(idToken, path, method, body) {
  const r = await fetch(`${FS}/${path}`, {
    method, headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  let j = {};
  try { j = await r.json(); } catch { /* kosong */ }
  return { status: r.status, j };
}

// ---------------- commands ----------------

async function cmdInspect() {
  console.log('=== USERS (yang relevan ban) ===');
  const users = await listDocs('users');
  for (const u of users) {
    const banned = fv(u, 'banned');
    const banUntil = fv(u, 'banUntil') ?? 0;
    const susp = fv(u, 'suspendedUntil') ?? 0;
    if (banned || banUntil > Date.now() || susp > Date.now()) {
      console.log(`BANNED uid=${docId(u).replace('users/', '')} email=${fv(u, 'email')} role=${fv(u, 'role')} banned=${banned} banUntil=${banUntil} suspendedUntil=${susp} reason=${fv(u, 'banReason')}`);
    }
  }
  console.log('=== bans (buku admin) ===');
  const bans = await listDocs('bans');
  for (const b of bans) {
    console.log(`bans uid=${docId(b).replace('bans/', '')} active=${fv(b, 'active')} until=${fv(b, 'until')} reason=${fv(b, 'reason')} email=${fv(b, 'email')}`);
  }
  console.log('=== banips ===');
  try {
    const ips = await listDocs('banips');
    for (const i of ips) console.log(`banips id=${docId(i).replace('banips/', '').slice(0, 18)}… uid=${fv(i, 'uid')} email=${fv(i, 'email')} until=${fv(i, 'until')}`);
  } catch (e) { console.log('banips list gagal:', e.message); }
  console.log('=== devices ===');
  try {
    const devs = await listDocs('devices');
    for (const d of devs) console.log(`devices id=${docId(d).replace('devices/', '').slice(0, 18)}… uid=${fv(d, 'uid')} email=${fv(d, 'email')} until=${fv(d, 'until')}`);
  } catch (e) { console.log('devices list gagal:', e.message); }
  console.log('=== usermeta (hash terakhir per akun) ===');
  try {
    const metas = await listDocs('usermeta');
    for (const m of metas) console.log(`usermeta uid=${docId(m).replace('usermeta/', '')} lastDeviceHash=${String(fv(m, 'lastDeviceHash') ?? '').slice(0, 14)}… lastIpHash=${String(fv(m, 'lastIpHash') ?? '').slice(0, 14)}…`);
  } catch (e) { console.log('usermeta list gagal:', e.message); }
  console.log('INSPECT_DONE');
}

async function liftOne(uid) {
  const out = [];
  // 1. users/{uid}: hapus flag ban (banned=false; banReason dibersihkan lewat mask)
  const udoc = await getDoc(`users/${uid}`);
  if (udoc) {
    const mask = ['banned', 'suspendedUntil', 'banUntil', 'banReason'];
    await patchDoc(`users/${uid}`, { banned: false, suspendedUntil: 0, banUntil: 0, banReason: null }, mask);
    out.push(`users/${uid} banned→false`);
  } else out.push(`users/${uid} tidak ada (lewati)`);
  // 2. bans/{uid} → active=false + jejak
  const bdoc = await getDoc(`bans/${uid}`);
  if (bdoc) {
    await patchDoc(`bans/${uid}`, { active: false, openedAt: Date.now(), openedBy: 'ci-maintenance' }, ['active', 'openedAt', 'openedBy']);
    out.push(`bans/${uid} active→false`);
  }
  return out;
}

async function cmdLiftban(args) {
  const emails = args.filter((a) => a.startsWith('--email=')).map((a) => a.slice(8).toLowerCase());
  const uids = args.filter((a) => a.startsWith('--uid=')).map((a) => a.slice(6));
  const targets = new Set(uids);
  // email → uid
  for (const em of emails) {
    const hits = await runQuery('users', [fieldFilter('email', 'EQUAL', em)], []);
    for (const h of hits) targets.add(docId(h).replace('users/', ''));
  }
  if (!targets.size) { console.log('TIDAK ADA target — berikan --email atau --uid'); process.exit(2); }
  console.log(`Membuka ban untuk ${targets.size} akun: ${[...targets].join(', ')}`);
  const all = [];
  for (const uid of targets) all.push(...await liftOne(uid));
  // 3. hapus SEMUA banips & devices milik target (query by uid)
  for (const uid of targets) {
    for (const col of ['banips', 'devices']) {
      try {
        const hits = await runQuery(col, [fieldFilter('uid', 'EQUAL', uid)]);
        for (const h of hits) {
          const p = docId(h);
          await fetch(`${FS}/${p}`, { method: 'DELETE', headers: authHdr() });
          all.push(`HAPUS ${p.slice(0, 60)}`);
        }
      } catch (e) { all.push(`${col} query gagal: ${e.message}`); }
    }
    // 4. appeals pending miliknya tidak disentuh (jejak moderasi tetap ada)
  }
  console.log(all.join('\n'));
  console.log('LIFTBAN_DONE');
}

async function cmdSetrole(args) {
  const email = args.find((a) => a.startsWith('--email='))?.slice(8).toLowerCase();
  const role = args.find((a) => a.startsWith('--role='))?.slice(7);
  if (!email || !role) { console.log('perlu --email= --role='); process.exit(2); }
  const hits = await runQuery('users', [fieldFilter('email', 'EQUAL', email)]);
  if (!hits.length) { console.log('user tidak ditemukan'); process.exit(2); }
  const uid = docId(hits[0]).replace('users/', '');
  await patchDoc(`users/${uid}`, { role }, ['role']);
  console.log(`users/${uid} role→${role}`);
  console.log('SETROLE_DONE');
}

// ---------------- verifyrules: rangkaian uji rules NYATA ----------------

function resultsInit() { return { pass: [], fail: [] }; }
function record(res, name, ok, detail = '') {
  (ok ? res.pass : res.fail).push(name + (detail ? ` — ${detail}` : ''));
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`);
}

async function cmdVerifyrules(args) {
  const apiKey = process.env.EXPO_PUBLIC_FIREBASE_API_KEY || '';
  if (!apiKey) { console.log('SKIP: EXPO_PUBLIC_FIREBASE_API_KEY tidak tersedia sebagai secret'); return; }
  const res = resultsInit();
  const tag = crypto.randomBytes(3).toString('hex');
  const mkEmail = (n) => `zeroid-rules-${tag}-${n}@zeroid-tests.example`;
  const pass = 'ZeroidTest!' + crypto.randomBytes(4).toString('hex');
  let A = null, B = null, createdDocs = [];
  const track = (p) => createdDocs.push(p);
  try {
    // akun uji sementara
    A = await idTokenFor(mkEmail('a'), pass, apiKey, { signUp: true });
    B = await idTokenFor(mkEmail('b'), pass, apiKey, { signUp: true });
    const uidA = A.localId, uidB = B.localId;
    console.log(`akun uji: uidA=${uidA} uidB=${uidB}`);

    // 1. buat profil sendiri (role user) — jalur create users
    let r = await userFetch(A.idToken, 'documents/users/' + uidA, 'PATCH', {
      fields: {
        name: { stringValue: 'RulesTest A' }, email: { stringValue: mkEmail('a') }, role: { stringValue: 'user' },
        banned: { booleanValue: false }, points: { integerValue: '0' }, bestStreak: { integerValue: '0' },
        checkinStreak: { integerValue: '0' }, refCount: { integerValue: '0' }, referralCode: { stringValue: 'zrtest' + tag },
        blocked: { arrayValue: {} }, contacts: { arrayValue: {} },
      },
      currentDocument: { exists: false },
    });
    record(res, 'create users/{uid} sendiri (role user)', r.status === 200, r.status === 200 ? '' : String(r.j?.error?.message ?? r.status).slice(0, 120));
    track(`users/${uidA}`);
    r = await userFetch(B.idToken, 'documents/users/' + uidB, 'PATCH', {
      fields: {
        name: { stringValue: 'RulesTest B' }, email: { stringValue: mkEmail('b') }, role: { stringValue: 'user' },
        banned: { booleanValue: false }, points: { integerValue: '0' }, blocked: { arrayValue: {} }, contacts: { arrayValue: {} },
      },
      currentDocument: { exists: false },
    });
    record(res, 'create users/{uid} akun kedua', r.status === 200);
    track(`users/${uidB}`);

    // 2. GAYA BALON — update sendiri field bubble (selfProfileUpdate)
    r = await userFetch(A.idToken, `documents/users/${uidA}`, 'PATCH', {
      fields: { bubble: { stringValue: 'sketsa' } }, updateMask: { fieldPaths: ['bubble'] },
    });
    record(res, 'GAYA BALON: update users/{uid}.bubble oleh pemilik', r.status === 200, r.status === 200 ? '' : String(r.j?.error?.message ?? r.status).slice(0, 120));

    // 3. DILARANG: self-assign banned=true (selfProfileUpdate menolak)
    r = await userFetch(A.idToken, `documents/users/${uidA}`, 'PATCH', {
      fields: { banned: { booleanValue: true } }, updateMask: { fieldPaths: ['banned'] },
    });
    record(res, 'ANTI-ESKALASI: user biasa TIDAK bisa set banned=true', r.status === 403, r.status === 403 ? '' : `HTTP ${r.status} (harusnya 403)`);

    // 4. usermeta sendiri
    r = await userFetch(A.idToken, 'documents/usermeta/' + uidA, 'PATCH', {
      fields: { lastIpHash: { stringValue: 'hash-ip-tes' }, lastDeviceHash: { stringValue: 'hash-dev-tes' }, at: { integerValue: String(Date.now()) } },
      currentDocument: { exists: false },
    });
    record(res, 'usermeta: catat perangkat sendiri', r.status === 200);
    track(`usermeta/${uidA}`);

    // 5. CHECK-IN — satu commit: ledger bukti + users points+1000, lastCheckinAt
    const stamp = Date.now();
    r = await userFetch(A.idToken, 'documents:commit', 'POST', {
      writes: [
        {
          update: { name: `${FS}/documents/users/${uidA}`, fields: {
            points: { integerValue: '1000' }, checkinStreak: { integerValue: '1' },
            bestStreak: { integerValue: '1' }, lastCheckinAt: { integerValue: String(stamp) },
          } },
          updateMask: { fieldPaths: ['points', 'checkinStreak', 'bestStreak', 'lastCheckinAt'] },
        },
        {
          update: { name: `${FS}/documents/ledger/c_${uidA}_${stamp}`, fields: {
            uid: { stringValue: uidA }, kind: { stringValue: 'checkin' }, delta: { integerValue: '1000' },
            streak: { integerValue: '1' }, at: { integerValue: String(stamp) },
          } },
          currentDocument: { exists: false },
        },
      ],
    });
    record(res, 'CHECK-IN: koin +1000 dengan bukti ledger (1 transaksi)', r.status === 200, r.status === 200 ? '' : String(r.j?.error?.message ?? r.status).slice(0, 160));
    track(`ledger/c_${uidA}_${stamp}`);
    // 5b. spam tap → ditolak server (lastCheckinAt harus maju ≥19 jam)
    const stamp2 = stamp + 60_000;
    r = await userFetch(A.idToken, 'documents:commit', 'POST', {
      writes: [
        {
          update: { name: `${FS}/documents/users/${uidA}`, fields: { points: { integerValue: '2000' }, lastCheckinAt: { integerValue: String(stamp2) } } },
          updateMask: { fieldPaths: ['points', 'lastCheckinAt'] },
        },
        {
          update: { name: `${FS}/documents/ledger/c_${uidA}_${stamp2}`, fields: {
            uid: { stringValue: uidA }, kind: { stringValue: 'checkin' }, delta: { integerValue: '1000' }, at: { integerValue: String(stamp2) },
          } },
          currentDocument: { exists: false },
        },
      ],
    });
    record(res, 'ANTI-SPAM CHECK-IN: tap kedua 1 menit kemudian DITOLAK', r.status === 403, r.status === 403 ? '' : `HTTP ${r.status} (harusnya 403)`);

    // 6. ANTI CETAK KOIN: naikkan points tanpa bukti ledger → ditolak
    r = await userFetch(A.idToken, `documents/users/${uidA}`, 'PATCH', {
      fields: { points: { integerValue: '999999' } }, updateMask: { fieldPaths: ['points'] },
    });
    record(res, 'ANTI-CETAK-KOIN: points +999.999 tanpa bukti DITOLAK', r.status === 403, r.status === 403 ? '' : `HTTP ${r.status} (harusnya 403)`);

    // 7. CHAT + PESAN
    const chatId = 'rules_test_' + tag;
    r = await userFetch(A.idToken, `documents/chats/${chatId}`, 'PATCH', {
      fields: {
        type: { stringValue: 'direct' }, members: { arrayValue: { values: [{ stringValue: uidA }, { stringValue: uidB }] } },
        admins: { arrayValue: { values: [{ stringValue: uidA }] } }, createdBy: { stringValue: uidA },
        createdAt: { integerValue: String(Date.now()) },
      },
      currentDocument: { exists: false },
    });
    record(res, 'buat chat langsung (members memuat saya)', r.status === 200);
    track(`chats/${chatId}`);
    // 7b. kirim pesan normal
    const msgId = crypto.randomBytes(8).toString('hex');
    r = await userFetch(A.idToken, `documents/chats/${chatId}/messages/${msgId}`, 'PATCH', {
      fields: {
        chatId: { stringValue: chatId }, senderId: { stringValue: uidA }, type: { stringValue: 'text' },
        text: { stringValue: 'halo dari uji rules' }, clientTime: { integerValue: String(Date.now()) },
        deletedFor: { arrayValue: {} },
      },
      currentDocument: { exists: false },
    });
    record(res, 'KIRIM PESAN: teks normal tersimpan', r.status === 200, r.status === 200 ? '' : String(r.j?.error?.message ?? r.status).slice(0, 160));
    track(`chats/${chatId}/messages/${msgId}`);
    // 7c. VIRTEX: teks 8001 karakter → ditolak (cap 8000)
    const vx = 'a'.repeat(8001);
    r = await userFetch(A.idToken, `documents/chats/${chatId}/messages/${msgId}v`, 'PATCH', {
      fields: {
        chatId: { stringValue: chatId }, senderId: { stringValue: uidA }, type: { stringValue: 'text' },
        text: { stringValue: vx }, deletedFor: { arrayValue: {} },
      },
      currentDocument: { exists: false },
    });
    record(res, 'ANTI-VIRTEX: teks 8001 karakter DITOLAK', r.status === 403, r.status === 403 ? '' : `HTTP ${r.status} (harusnya 403)`);
    // 7d. B tidak bisa membaca chat orang lain
    const chatIdX = 'rules_test_private_' + tag;
    await userFetch(A.idToken, `documents/chats/${chatIdX}`, 'PATCH', {
      fields: { type: { stringValue: 'direct' }, members: { arrayValue: { values: [{ stringValue: uidA }] } }, createdAt: { integerValue: String(Date.now()) } },
      currentDocument: { exists: false },
    });
    track(`chats/${chatIdX}`);
    r = await userFetch(B.idToken, `documents/chats/${chatIdX}`, 'GET');
    record(res, 'PRIVASI: chat pribadi TIDAK terbaca non-anggota', r.status === 403, r.status === 403 ? '' : `HTTP ${r.status} (harusnya 403)`);
    track(`chats/${chatIdX}`);

    // 8. FEEDBACK (masukan)
    const fid = 'rules_fb_' + tag;
    r = await userFetch(A.idToken, `documents/feedback/${fid}`, 'PATCH', {
      fields: {
        uid: { stringValue: uidA }, name: { stringValue: 'RulesTest A' }, text: { stringValue: 'uji rules masukan' },
        kind: { stringValue: 'bug' }, status: { stringValue: 'open' }, reply: { stringValue: '' }, reward: { integerValue: '0' },
        readByUser: { booleanValue: true }, at: { integerValue: String(Date.now()) },
      },
      currentDocument: { exists: false },
    });
    record(res, 'MASUKAN: user kirim feedback', r.status === 200, r.status === 200 ? '' : String(r.j?.error?.message ?? r.status).slice(0, 140));
    track(`feedback/${fid}`);

    // 9. notifications (pusat notifikasi)
    r = await userFetch(A.idToken, 'documents:commit', 'POST', { writes: [{ update: { name: `${FS}/documents/notifications/ntest_${tag}`, fields: {
      userId: { stringValue: uidB }, kind: { stringValue: 'group' }, title: { stringValue: 'uji' }, body: { stringValue: 'uji rules' }, read: { booleanValue: false }, createdAt: { integerValue: String(Date.now()) },
    } }, currentDocument: { exists: false } }] });
    record(res, 'NOTIFIKASI: dokumen notifikasi dibuat anggota', r.status === 200);
    track(`notifications/ntest_${tag}`);

    // 10. STORY
    r = await userFetch(A.idToken, `documents/stories/stest_${tag}`, 'PATCH', {
      fields: { userId: { stringValue: uidA }, text: { stringValue: 'uji rules story' }, createdAt: { integerValue: String(Date.now()) }, expiresAt: { integerValue: String(Date.now() + 86400000) } },
      currentDocument: { exists: false },
    });
    record(res, 'STORY: kirim story 24 jam', r.status === 200);
    track(`stories/stest_${tag}`);

    // 11. ledger append + anti-timpa
    r = await userFetch(A.idToken, `documents/ledger/s_${uidA}_${tag}`, 'PATCH', {
      fields: { uid: { stringValue: uidA }, kind: { stringValue: 'spend' }, delta: { integerValue: '-100' }, at: { integerValue: String(Date.now()) } },
      currentDocument: { exists: false },
    });
    record(res, 'LEDGER: catat belanja koin', r.status === 200);
    track(`ledger/s_${uidA}_${tag}`);

    // 12. B tidak bisa menulis profil A (bukan referral pattern)
    r = await userFetch(B.idToken, `documents/users/${uidA}`, 'PATCH', {
      fields: { name: { stringValue: 'dirampok' } }, updateMask: { fieldPaths: ['name'] },
    });
    record(res, 'KEAMANAN: akun lain TIDAK bisa mengubah profil saya', r.status === 403, r.status === 403 ? '' : `HTTP ${r.status} (harusnya 403)`);
  } catch (e) {
    record(res, 'verifikasi berjalan', false, String(e?.message ?? e).slice(0, 200));
  } finally {
    // CLEANUP: hapus semua dokumen uji + akun uji (SA)
    console.log('--- cleanup ---');
    for (const p of [...createdDocs].reverse()) {
      await fetch(`${FS}/${p}`, { method: 'DELETE', headers: authHdr() }).catch(() => {});
    }
    for (const acc of [A, B]) {
      if (acc?.localId) {
        await fetch(`https://identitytoolkit.googleapis.com/v1/projects/${PROJ}/accounts:delete`, {
          method: 'POST', headers: authHdr(), body: JSON.stringify({ localId: acc.localId }),
        }).catch(() => {});
      }
    }
    console.log('cleanup selesai');
  }
  console.log(`=== HASIL: ${res.pass.length} PASS, ${res.fail.length} FAIL ===`);
  if (res.fail.length) { console.log('FAIL_LIST=' + res.fail.join(' | ')); process.exitCode = 1; }
  console.log('VERIFYRULES_DONE');
}

// ---------------- main ----------------

(async () => {
  const SA = loadSA();
  TOKEN = await accessToken(SA);
  console.log('token OK — project:', PROJ);
  const [cmd, ...args] = process.argv.slice(2);
  if (cmd === 'inspect') await cmdInspect();
  else if (cmd === 'liftban') await cmdLiftban(args);
  else if (cmd === 'setrole') await cmdSetrole(args);
  else if (cmd === 'verifyrules') await cmdVerifyrules(args);
  else { console.log('perintah tidak dikenal:', cmd); process.exit(2); }
})().catch((e) => { console.error('FATAL:', e?.message ?? e); process.exit(1); });
