/**
 * Vercel serverless — info versi yang LIVE di deployment ini.
 * Buka https://<domain>/api/version di browser untuk memastikan commit mana
 * yang benar-benar ter-deploy (menjawab "vercel bilang deployed tapi web lama").
 * Vercel otomatis menyuntikkan VERCEL_GIT_COMMIT_SHA pada Git integrations.
 */
export const config = { runtime: 'nodejs' };

export default async function handler(_req: any, res: any) {
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({
    ok: true,
    service: 'zeroid-whatsapp',
    commit: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
    commitMsg: process.env.VERCEL_GIT_COMMIT_MESSAGE ?? null,
    branch: process.env.VERCEL_GIT_COMMIT_REF ?? null,
    deployedAt: process.env.VERCEL_DEPLOYMENT_CREATED_AT ?? null,
    buildStamp: '2026-10-28-ronde-supabase-brat-banchat',
    env: {
      jere: !!process.env.JEREXD_APIKEY,
      imgbb: !!process.env.IMGBB_KEY,
      sylvatica: !!process.env.SYLVATICA_APIKEY,
      supabase: !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY),
    },
  });
}
