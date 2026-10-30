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
  console.log('✅ DEPLOY RULES SELESAI.');
})().catch((e) => { console.error('FATAL:', e?.message ?? e); process.exit(1); });

/**
 * COMPOSITE INDEX — dibuat otomatis di langkah yang sama (token cloud-platform
 * mencakup datastore). Index yang hilang = query user SELALU error diam-diam
 * (contoh nyata: feedback "Masukan saya (0)" karena index uid+at tidak ada).
 */
async function ensureIndex(token, project, spec) {
  const base = `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/indexes`;
  const list = await fetch(base, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json());
  const same = (a, b) => a.length === b.length && a.every((f, i) => f.fieldPath === b[i].fieldPath && (f.order ?? 'ASCENDING') === (b[i].order ?? 'ASCENDING'));
  const exists = (list.indexes ?? []).some((ix) => ix.collectionGroup === spec.collectionGroup && same(ix.fields ?? [], spec.fields));
  if (exists) { console.log(`↷ index ${spec.collectionGroup} (${spec.fields.map((f) => f.fieldPath).join(',')}) sudah ada.`); return; }
  const r = await fetch(base, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(spec),
  });
  if (r.ok) console.log(`✅ index ${spec.collectionGroup} dibuat (menyiapkan 1-2 menit).`);
  else console.log(`⚠️ index ${spec.collectionGroup} gagal: ${JSON.stringify(await r.json()).slice(0, 200)}`);
}

// tambahan opsional — dijalankan hanya bila dipanggil sebagai bagian deploy
if (process.env.CREATE_INDEXES !== '0' && (process.env.FIREBASE_SERVICE_ACCOUNT ?? '').trim()) {
  (async () => {
    try {
      const SA = loadSA();
      const token = await accessToken(SA);
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
