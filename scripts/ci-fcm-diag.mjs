/**
 * ZEROID — CI diagnosa & perbaikan FCM (HTTP v1).
 * Masalah teramati produksi: /api/fcm → "oauth gagal" padahal SA valid
 * (ban-gate dengan scope datastore sukses). Dugaan kuat: API Firebase Cloud
 * Messaging (fcm.googleapis.com) BELUM DIENABLE di project → oauth2 menolak
 * scope firebase.messaging (invalid_scope) → fcmAccessToken() null → push
 * mati total (notif chat, admin, login-guard).
 *
 * Script ini (jalankan via Actions, butuh secret FIREBASE_SERVICE_ACCOUNT):
 *  1. minta access token dgn scope firebase.messaging + instance.id,
 *  2. kalau gagal → tampilkan HTTP status + potongan body (diagnosis jelas),
 *  3. coba ENABLE kan fcm.googleapis.com via Service Usage API,
 *  4. minta token lagi; sukses = push hidup.
 * Tidak ada kunci yang dicetak ke log.
 */
import crypto from 'node:crypto';

function b64url(b) { return Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function loadSA() {
  let raw = (process.env.FIREBASE_SERVICE_ACCOUNT || '').trim();
  if (!raw) { console.log('⚠️ FIREBASE_SERVICE_ACCOUNT kosong'); process.exit(0); }
  if (!raw.startsWith('{')) raw = Buffer.from(raw, 'base64').toString('utf8');
  return JSON.parse(raw);
}
async function token(SA, scope) {
  const iat = Math.floor(Date.now() / 1000);
  const h = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const p = b64url(JSON.stringify({ iss: SA.client_email, sub: SA.client_email, aud: 'https://oauth2.googleapis.com/token', iat, exp: iat + 3600, scope }));
  const s = crypto.createSign('RSA-SHA256'); s.update(h + '.' + p);
  const jwt = `${h}.${p}.${b64url(s.sign(SA.private_key.replace(/\\n/g, '\n')))}`;
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
  });
  const j = await r.json();
  return { ok: r.ok, status: r.status, body: j };
}
async function enableApi(SA, serviceName) {
  const t = await token(SA, 'https://www.googleapis.com/auth/cloud-platform');
  if (!t.ok) { console.log(`⚠️ token cloud-platform gagal: HTTP ${t.status}`); return false; }
  const proj = SA.project_id;
  const r = await fetch(`https://serviceusage.googleapis.com/v1/projects/${proj}/services/${serviceName}:enable`, {
    method: 'POST', headers: { Authorization: `Bearer ${t.body.access_token}` },
  });
  console.log(`enable ${serviceName}: HTTP ${r.status} ${r.ok ? '(OK / sudah aktif)' : (await r.text()).slice(0, 200)}`);
  return r.ok || r.status === 400 || r.status === 409;
}

(async () => {
  const SA = loadSA();
  console.log('SA project:', SA.project_id, '| client:', String(SA.client_email).split('@')[0]);
  const FCM_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging https://www.googleapis.com/auth/instance.id';
  let t = await token(SA, FCM_SCOPE);
  if (t.ok) { console.log('✅ token FCM v1 SUKSES — push seharusnya hidup.'); return; }
  console.log(`⚠️ token FCM gagal: HTTP ${t.status} — body: ${JSON.stringify(t.body).slice(0, 300)}`);
  console.log('→ mencoba meng-enable fcm.googleapis.com …');
  await enableApi(SA, 'fcm.googleapis.com');
  await new Promise((r) => setTimeout(r, 5000)); // propagasi
  t = await token(SA, FCM_SCOPE);
  if (t.ok) { console.log('✅ token FCM v1 SUKSES setelah enable — push hidup.'); return; }
  console.log(`⚠️ masih gagal: HTTP ${t.status} — body: ${JSON.stringify(t.body).slice(0, 300)}`);
  console.log('→ langkah manual: Firebase Console → Project settings → Cloud Messaging API (v1) harus "Enabled".');
})().catch((e) => { console.error('FATAL:', e?.message ?? e); process.exit(1); });
