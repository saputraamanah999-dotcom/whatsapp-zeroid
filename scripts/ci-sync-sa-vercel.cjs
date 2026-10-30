/**
 * ZEROID — sinkronkan FIREBASE_SERVICE_ACCOUNT (yang TERBUKTI jalan di CI)
 * ke env Vercel (PATCH env lama berdasarkan id), lalu picu redeploy production.
 * Dipanggil dari workflow (secrets FIREBASE_SERVICE_ACCOUNT + VERCEL_TOKEN).
 * Nilai SA tidak pernah dicetak ke log.
 */

(async () => {
  let raw = (process.env.FIREBASE_SERVICE_ACCOUNT || '').trim();
  if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT kosong');
  if (!raw.startsWith('{')) raw = Buffer.from(raw, 'base64').toString('utf8');
  const sa = JSON.parse(raw);
  const compact = JSON.stringify(sa);
  console.log('SA aktif:', String(sa.client_email ?? '?').split('@')[0] + '@…');

  const TOKEN = process.env.VERCEL_TOKEN || '';
  const PROJ = process.env.VERCEL_PROJ || '';
  const TEAM = process.env.VERCEL_TEAM || '';
  const qs = TEAM ? `?teamId=${TEAM}` : '';
  if (!TOKEN || !PROJ) throw new Error('VERCEL_TOKEN / VERCEL_PROJ belum di-set');
  const H = { Authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' };

  // 1) cari id env FIREBASE_SERVICE_ACCOUNT
  const lr = await fetch(`https://api.vercel.com/v9/projects/${PROJ}/env${qs}`, { headers: { Authorization: `Bearer ${TOKEN}` } });
  const lj = await lr.json();
  const cur = (lj.envs ?? []).find((e) => e.key === 'FIREBASE_SERVICE_ACCOUNT');
  if (!cur) throw new Error('env FIREBASE_SERVICE_ACCOUNT tidak ditemukan di Vercel');

  // 2) PATCH nilai env berdasarkan id
  const pr = await fetch(`https://api.vercel.com/v9/projects/${PROJ}/env/${cur.id}${qs}`, {
    method: 'PATCH', headers: H,
    body: JSON.stringify({ value: compact, type: 'encrypted', target: cur.target ?? ['production', 'preview'] }),
  });
  if (!pr.ok) throw new Error(`env patch gagal: HTTP ${pr.status} ${(await pr.text()).slice(0, 200)}`);
  console.log('✅ env FIREBASE_SERVICE_ACCOUNT diperbarui (PATCH id ' + cur.id + ')');

  // 3) picu deployment production dari branch main
  const d = await fetch(`https://api.vercel.com/v13/deployments${qs}`, {
    method: 'POST', headers: H,
    body: JSON.stringify({
      name: 'whatsapp-zeroid', project: PROJ, target: 'production',
      gitSource: { type: 'branch', org: 'saputraamanah999-dotcom', repo: 'whatsapp-zeroid', ref: 'main' },
    }),
  });
  const dj = await d.json().catch(() => ({}));
  console.log(d.ok ? `✅ redeploy dipicu: ${String(dj.uid ?? '').slice(0, 28)}…` : `redeploy: HTTP ${d.status} ${JSON.stringify(dj).slice(0, 200)}`);
})().catch((e) => { console.error('FATAL:', e?.message ?? e); process.exit(1); });
