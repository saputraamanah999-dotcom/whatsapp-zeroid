/**
 * ZEROID — CI deploy rules TANPA firebase-tools (cukup izin firebaserules saja).
 * Terbukti jalan dengan SA standar "Firebase Admin SDK":
 *   rulesets.create + releases.update(cloud.firestore) — via REST API.
 * Dipakai oleh .github/workflows/deploy-rules.yml.
 * Env: FIREBASE_SERVICE_ACCOUNT (JSON raw atau base64).
 */
import fs from 'node:fs';
import crypto from 'node:crypto';

function b64url(b) { return Buffer.from(b).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_'); }

function loadSA() {
  let raw = (process.env.FIREBASE_SERVICE_ACCOUNT || '').trim();
  if (!raw) { console.log('⚠️ Secret FIREBASE_SERVICE_ACCOUNT kosong — deploy dilewati.'); process.exit(0); }
  if (!raw.startsWith('{')) raw = Buffer.from(raw, 'base64').toString('utf8');
  return JSON.parse(raw);
}

async function accessToken(SA) {
  const now = Math.floor(Date.now() / 1000);
  const h = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const p = b64url(JSON.stringify({ iss: SA.client_email, scope: 'https://www.googleapis.com/auth/cloud-platform https://www.googleapis.com/auth/firebase', aud: SA.token_uri, iat: now, exp: now + 3600 }));
  const s = crypto.createSign('RSA-SHA256'); s.update(h + '.' + p);
  const jwt = h + '.' + p + '.' + b64url(s.sign(SA.private_key.replace(/\\n/g, '\n')));
  const r = await fetch(SA.token_uri, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }) });
  const j = await r.json();
  if (!j.access_token) throw new Error('token gagal: ' + JSON.stringify(j).slice(0, 200));
  return j.access_token;
}

async function publish(token, project, release, fileName, filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const mk = await fetch(`https://firebaserules.googleapis.com/v1/projects/${project}/rulesets`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ source: { files: [{ name: fileName, content }] } }),
  });
  const mkj = await mk.json();
  if (!mkj.name) throw new Error(`ruleset ${release} gagal: ` + JSON.stringify(mkj).slice(0, 400));
  const rel = await fetch(`https://firebaserules.googleapis.com/v1/projects/${project}/releases/${release}?updateMask=rulesetName`, {
    method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ release: { name: `projects/${project}/releases/${release}`, rulesetName: mkj.name } }),
  });
  const relj = await rel.json();
  if (!relj.name && !relj.rulesetName) throw new Error(`release ${release} gagal: ` + JSON.stringify(relj).slice(0, 400));
  console.log(`✅ ${release} → ${mkj.name} (${fileName})`);
}

(async () => {
  const SA = loadSA();
  const proj = SA.project_id;
  const token = await accessToken(SA);
  console.log('token OK — project:', proj);
  await publish(token, proj, 'cloud.firestore', 'firestore.rules', new URL('../firestore.rules', import.meta.url));
  try {
    await publish(token, proj, 'firebase.storage', 'storage.rules', new URL('../storage.rules', import.meta.url));
  } catch (e) {
    console.log('⚠️ Storage rules dilewati (SA belum berizin membuat release storage) — upload tetap aman:', String(e.message).slice(0, 160));
  }
  // ---- SEED OTOMATIS (idempoten — hanya buat bila BELUM ada) ----
  await seedIfMissing(token, proj, 'guardconfig/main', {
    profanity: { mapValue: { fields: { on: { booleanValue: true }, hours: { integerValue: '2' } } } },
    porn: { mapValue: { fields: { on: { booleanValue: true }, days: { integerValue: '7' } } } },
    spam: { mapValue: { fields: { on: { booleanValue: true }, hours: { integerValue: '24' } } } },
    note: { stringValue: 'Skill AI Guard — diatur ulang dari Admin Panel kapan pun.' },
  });
  await seedIfMissing(token, proj, 'vouchers/_schema', {
    code: { stringValue: 'CONTOH10' }, percent: { integerValue: '10' },
    maxUses: { integerValue: '50' }, usedCount: { integerValue: '0' },
    usedBy: { arrayValue: {} }, expiresAt: { integerValue: '0' }, active: { booleanValue: false },
    note: { stringValue: 'Penanda skema koleksi voucher — voucher asli dibuat dari Admin Panel.' },
  });
  await seedIfMissing(token, proj, 'config/ai', {
    providers: { stringValue: 'sylvatica,jerexd,vexo' },
    order: { stringValue: 'sylvatica (utama) → jerexd (cadangan) → vexo (ketiga)' },
    failover: { stringValue: 'otomatis, senyap, sticky-provider' },
    search: { stringValue: 'vexo-google → vexo-ddg → ddg-langsung' },
    prompt: { stringValue: 'Zeroid persona v3 — manusiawi, berpikir, analisis web, akurat, sebut sumber' },
  });
  // ---- SEED KUNCI SERVER (secrets/ai) — hanya field yang MASIH KOSONG ----
  // Kunci datang dari GitHub Actions secrets (terenkripsi) — TIDAK pernah
  // ditulis di repo. Field yang sudah terisi TIDAK ditimpa (admin bisa saja
  // me-rotate kunci langsung di Firestore). Nilai kunci tidak pernah di-log.
  await seedServerSecrets(token, proj, {
    SYLVATICA_APIKEY: process.env.SYLVATICA_APIKEY || '',
    JEREXD_APIKEY: process.env.JEREXD_APIKEY || '',
    VEXO_APIKEY: process.env.VEXO_APIKEY || '',
    IMGBB_KEY: process.env.IMGBB_KEY || '',
  });
  console.log('✅ DEPLOY RULES + SEED SELESAI.');
})().catch((e) => { console.error('FATAL:', e?.message ?? e); process.exit(1); });

/** Isi field kunci yang kosong di dokumen secrets/ai (PATCH per field —
 *  field terisi dibiarkan; nilai tidak pernah dicetak ke log). */
async function seedServerSecrets(token, project, kv) {
  const docUrl = `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents/secrets/ai`;
  let existing = {};
  try {
    const g = await fetch(docUrl, { headers: { Authorization: `Bearer ${token}` } });
    if (g.ok) existing = (await g.json())?.fields ?? {};
  } catch { /* dokumen mungkin belum ada */ }
  const updates = {};
  const mask = [];
  for (const [k, v] of Object.entries(kv)) {
    if (!v) continue;
    const cur = existing[k]?.stringValue;
    if (typeof cur === 'string' && cur.trim()) { console.log(`↷ secrets/ai.${k} sudah terisi — dilewati.`); continue; }
    updates[k] = { stringValue: v.trim() };
    mask.push(`updateMask.fieldPaths=${encodeURIComponent(k)}`);
  }
  if (!mask.length) { console.log('↷ secrets/ai: tidak ada field baru untuk diisi.'); return; }
  const r = await fetch(`${docUrl}?${mask.join('&')}`, {
    method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: updates }),
  });
  if (r.ok) console.log(`✅ secrets/ai: ${mask.length} kunci server terisi (nama field saja yang di-log).`);
  else console.log(`⚠️ secrets/ai gagal (HTTP ${r.status}) — kunci tetap aman di env Vercel.`);
}

/** Buat dokumen seed HANYA bila BELUM ada (GET dulu — jangan pernah menimpa
 *  pengaturan yang sudah diubah admin dari panel, mis. guardconfig). */
async function seedIfMissing(token, project, path, fields) {
  try {
    const g = await fetch(`https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents/${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (g.ok) { console.log(`↷ seed ${path} sudah ada — dilewati (tidak menimpa).`); return; }
  } catch { /* lanjut coba buat */ }
  const r = await fetch(`https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents/${path}`, {
    method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields }),
  });
  if (r.ok) console.log(`✅ seed ${path} dibuat.`);
  else console.log(`↷ seed ${path} gagal dibuat (HTTP ${r.status}).`);
}

/**
 * COMPOSITE INDEX — dibuat otomatis di langkah yang sama (token cloud-platform
 * mencakup datastore). Index yang hilang = query user SELALU error diam-diam
 * (contoh nyata: feedback "Masukan saya (0)" karena index uid+at tidak ada).
 */
async function ensureIndex(token, project, spec) {
  // PENTING: endpoint v1 lama /databases/(default)/indexes sudah 404 —
  // path yang benar: /databases/(default)/collectionGroups/{koleksi}/indexes
  const base = `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/collectionGroups/${spec.collectionGroup}/indexes`;
  let exists = false;
  try {
    const lr = await fetch(base, { headers: { Authorization: `Bearer ${token}` } });
    const ct = lr.headers.get('content-type') ?? '';
    if (!ct.includes('json')) throw new Error(`HTTP ${lr.status} ${ct.slice(0, 60)}`);
    const list = await lr.json();
    const same = (a, b) => a.length === b.length && a.every((f, i) => f.fieldPath === b[i].fieldPath && (f.order ?? 'ASCENDING') === (b[i].order ?? 'ASCENDING'));
    exists = (list.indexes ?? []).some((ix) => same(ix.fields ?? [], spec.fields));
  } catch (e) {
    console.log(`↷ daftar index tak terbaca (${String(e.message).slice(0, 80)}) — langsung coba buat.`);
  }
  if (exists) { console.log(`↷ index ${spec.collectionGroup} (${spec.fields.map((f) => f.fieldPath).join(',')}) sudah ada.`); return; }
  const r = await fetch(base, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    // bentuk body untuk endpoint collectionGroups: TANPA collectionGroup di body
    body: JSON.stringify({ queryScope: spec.queryScope, fields: spec.fields }),
  });
  if (r.ok) console.log(`✅ index ${spec.collectionGroup} dibuat (menyiapkan 1-2 menit).`);
  else {
    const body = await r.text();
    console.log(`⚠️ index ${spec.collectionGroup} gagal: HTTP ${r.status} ${body.slice(0, 220)}`);
  }
}

// tambahan opsional — dijalankan hanya bila dipanggil sebagai bagian deploy
if (process.env.CREATE_INDEXES !== '0' && (process.env.FIREBASE_SERVICE_ACCOUNT ?? '').trim()) {
  (async () => {
    try {
      const SA = loadSA();
      const token = await accessToken(SA);
      // DIAGNOSTIK: apakah SA boleh baca Firestore documents sama sekali?
      try {
        const dr = await fetch(`https://firestore.googleapis.com/v1/projects/${SA.project_id}/databases/(default)/documents/config/bootstrap`, { headers: { Authorization: `Bearer ${token}` } });
        console.log(`↷ diag documents: HTTP ${dr.status} (${dr.status === 200 || dr.status === 403 || dr.status === 404 ? 'json/datastore' : 'aneh'})`);
      } catch (e) { console.log('↷ diag documents gagal:', String(e.message).slice(0, 80)); }
      await ensureIndex(token, SA.project_id, {
        collectionGroup: 'feedback',
        queryScope: 'COLLECTION',
        fields: [
          { fieldPath: 'uid', order: 'ASCENDING' },
          { fieldPath: 'at', order: 'DESCENDING' },
        ],
      });
    } catch (e) {
      console.log('⚠️ langkah index dilewati:', String(e?.message ?? e).slice(0, 160));
    }
  })();
}
