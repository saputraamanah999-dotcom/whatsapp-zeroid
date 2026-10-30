/**
 * ZEROID — sinkronkan FIREBASE_SERVICE_ACCOUNT (yang TERBUKTI jalan di CI)
 * ke env Vercel, lalu picu redeploy production supaya fungsi memakai SA baru.
 * Dipanggil dari workflow (butuh secrets FIREBASE_SERVICE_ACCOUNT + VERCEL_TOKEN).
 * Nilai SA tidak pernah dicetak ke log.
 */
const fs = require('node:fs');

function loadSA() {
  let raw = (process.env.FIREBASE_SERVICE_ACCOUNT || '').trim();
  if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT kosong');
  if (!raw.startsWith('{')) raw = Buffer.from(raw, 'base64').toString('utf8');
  const sa = JSON.parse(raw);
  return { compact: JSON.stringify(sa), email: String(sa.client_email ?? '') };
}

(async () => {
  const SA = loadSA();
  const TOKEN = process.env.VERCEL_TOKEN || '';
  const PROJ = process.env.VERCEL_PROJ || '';
  const TEAM = process.env.VERCEL_TEAM || '';
  const qs = TEAM ? `?teamId=${TEAM}` : '';
  if (!TOKEN || !PROJ) throw new Error('VERCEL_TOKEN / VERCEL_PROJ belum di-set');
  console.log('SA aktif:', SA.email.split('@')[0] + '@… (client email pertama 20 char)');

  // 1) upsert env FIREBASE_SERVICE_ACCOUNT (encrypted, production+preview)
  const r = await fetch(`https://api.vercel.com/v10/projects/${PROJ}/env?upsert=true${qs}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify({ key: 'FIREBASE_SERVICE_ACCOUNT', value: SA.compact, type: 'encrypted', target: ['production', 'preview'] }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok && !(j?.error?.code === 'ENV_ALREADY_EXISTS')) {
    throw new Error(`env upsert gagal: HTTP ${r.status} ${JSON.stringify(j).slice(0, 200)}`);
  }
  console.log(r.ok ? '✅ env FIREBASE_SERVICE_ACCOUNT diperbarui di Vercel' : `env upsert: ${j?.error?.code ?? r.status}`);

  // 2) picu deployment production dari branch main (fungsi membaca env baru)
  const d = await fetch(`https://api.vercel.com/v13/deployments${qs}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      name: 'whatsapp-zeroid', project: PROJ, target: 'production',
      gitSource: { type: 'branch', org: 'saputraamanah999-dotcom', repo: 'whatsapp-zeroid', ref: 'main' },
    }),
  });
  const dj = await d.json().catch(() => ({}));
  console.log(d.ok ? `✅ redeploy dipicu: ${String(dj.url ?? dj.uid ?? '').slice(0, 60)}` : `redeploy: HTTP ${d.status} ${JSON.stringify(dj).slice(0, 200)}`);
})().catch((e) => { console.error('FATAL:', e?.message ?? e); process.exit(1); });
