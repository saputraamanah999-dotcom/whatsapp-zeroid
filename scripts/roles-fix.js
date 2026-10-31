/**
 * PERBAIKAN ROLE (permintaan pemilik):
 *  - gedejulianto148@gmail.com  → DEVELOPER UTAMA (owner): role=developer, developer=true, ownerDev=true
 *  - saputraamanah999@gmail.com → USER BIASA: role=user, developer=false (hapus dari admin panel)
 * Menulis langsung ke Firestore via REST (service account) — tidak butuh app online.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SA_PATH = '/home/z/my-project/secrets/firebase-service-account.json';
// Di GitHub Actions: SA lewat env FIREBASE_SERVICE_ACCOUNT (raw/base64).
// Lokal: file secrets/firebase-service-account.json.
const PROJECT = 'whatsapp-zeroid';
const OWNER = 'gedejulianto148@gmail.com';
const DEMOTE = 'saputraamanah999@gmail.com';

function saJson() {
  const env = (process.env.FIREBASE_SERVICE_ACCOUNT || '').trim();
  if (env) return JSON.parse(env.startsWith('{') ? env : Buffer.from(env, 'base64').toString('utf8'));
  return JSON.parse(require('fs').readFileSync(SA_PATH, 'utf8'));
}
async function token() {
  const sa = saJson();
  const iat = Math.floor(Date.now() / 1000);
  const claims = {
    iss: sa.client_email, scope: 'https://www.googleapis.com/auth/datastore',
    aud: 'https://oauth2.googleapis.com/token', iat, exp: iat + 3600,
  };
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(`${header}.${payload}`);
  const sig = signer.sign(sa.private_key).toString('base64url');
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${header}.${payload}.${sig}`,
  });
  const j = await r.json();
  if (!j.access_token) throw new Error('no token: ' + JSON.stringify(j));
  return j.access_token;
}

async function findUser(tok, email) {
  const r = await fetch(`https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents:runQuery`, {
    method: 'POST',
    headers: { authorization: `Bearer ${tok}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: 'users' }],
        where: { fieldFilter: { field: { fieldPath: 'email' }, op: 'EQUAL', value: { stringValue: email.toLowerCase() } } },
        limit: 3,
      },
    }),
  });
  const j = await r.json();
  for (const row of j) if (row.document) return row.document;
  return null;
}

async function patch(tok, path_, fields) {
  const mask = Object.keys(fields).map((f) => `updateMask.fieldPaths=${f}`).join('&');
  const r = await fetch(`https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/${path_}?${mask}`, {
    method: 'PATCH',
    headers: { authorization: `Bearer ${tok}`, 'content-type': 'application/json' },
    body: JSON.stringify({ fields }),
  });
  const j = await r.json();
  if (j.error) throw new Error(JSON.stringify(j.error));
  return j;
}

(async () => {
  const tok = await token();
  // 1) owner
  const od = await findUser(tok, OWNER);
  if (od) {
    const id = od.name.split('/documents/')[1];
    await patch(tok, id, {
      role: { stringValue: 'developer' },
      developer: { booleanValue: true },
      ownerDev: { booleanValue: true },
      blueCheck: { booleanValue: true },
      banned: { booleanValue: false },
      banReason: { nullValue: null },
      suspendedUntil: { integerValue: '0' },
      banUntil: { integerValue: '0' },
    });
    console.log('OWNER OK:', id);
  } else console.log('OWNER NOT FOUND:', OWNER);
  // 2) demote
  const dd = await findUser(tok, DEMOTE);
  if (dd) {
    const id = dd.name.split('/documents/')[1];
    await patch(tok, id, { role: { stringValue: 'user' }, developer: { booleanValue: false }, ownerDev: { booleanValue: false } });
    console.log('DEMOTE OK:', id);
  } else console.log('DEMOTE NOT FOUND:', DEMOTE);
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
