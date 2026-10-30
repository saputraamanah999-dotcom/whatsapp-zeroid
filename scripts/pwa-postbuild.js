/**
 * Post-build step for `expo export --platform web`:
 *  1. Copies pwa/ assets (manifest, service worker, icons, offline page) into dist/.
 *  2. Injects PWA meta tags + service-worker registration into dist/index.html.
 *  3. SECURITY: strips sourcemaps (*.map) + injects early anti-devtools guard.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const PWA = path.join(ROOT, 'pwa');

if (!fs.existsSync(DIST)) {
  console.error('dist/ not found — run `expo export --platform web` first.');
  process.exit(1);
}

// 1) copy PWA assets
for (const f of fs.readdirSync(PWA)) {
  fs.copyFileSync(path.join(PWA, f), path.join(DIST, f));
}
console.log('PWA assets copied to dist/');

// 1b) SECURITY: hapus semua sourcemap agar source tidak bisa dibaca dari produksi
let maps = 0;
const walk = (dir) => {
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, f.name);
    if (f.isDirectory()) walk(p);
    else if (f.name.endsWith('.map')) { fs.unlinkSync(p); maps++; }
  }
};
walk(DIST);
console.log(`Sourcemaps stripped: ${maps} file dihapus`);
// jangan sertakan sourcemap comment
const stripMapRefs = (p) => {
  if (!fs.existsSync(p)) return;
  const code = fs.readFileSync(p, 'utf8').replace(/\/\/# sourceMappingURL=.*\n?/g, '');
  fs.writeFileSync(p, code);
};
fs.readdirSync(DIST).forEach((f) => { if (f.endsWith('.js')) stripMapRefs(path.join(DIST, f)); });

// 1c) SECURITY v16: rules.html & seed.html TIDAK LAGI di-deploy ke domain publik.
//     Dulu keduanya mengekspos isi Firestore Rules + alur seed ke SEMUA pengunjung —
//     itu celah keamanan (permintaan user: "hapus itu, nanti ada celah keamanan").
//     Rules kini dipasang otomatis oleh CI (.github/workflows/deploy-rules.yml).
const leftovers = ['rules.html', 'seed.html'].map((f) => path.join(DIST, f));
for (const f of leftovers) {
  if (fs.existsSync(f)) { fs.unlinkSync(f); console.log(`dihapus dari dist: ${path.basename(f)} (bukan bagian publik)`); }
}

// 2) inject meta + SW registration
const index = path.join(DIST, 'index.html');
let html = fs.readFileSync(index, 'utf8');

// 2b) SECURITY: anti-devtools early guard (jalan SEBELUM bundle React dimuat)
if (!html.includes('zeroid-devguard')) {
  const guard = `<script id="zeroid-devguard">
  /* Anti-inspeksi awal: blokir shortcut devtools + deteksi viewport. */
  (function () {
    try {
      var trip = function () {
        document.documentElement.style.filter = 'blur(18px)';
        if (!document.getElementById('zeroid-devguard-overlay')) {
          var o = document.createElement('div');
          o.id = 'zeroid-devguard-overlay';
          o.style.cssText = 'position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;background:#0D1117EE;color:#E6EDF3;font-family:system-ui,sans-serif;text-align:center;padding:24px;';
          o.innerHTML = '<div><div style="font-size:40px;margin-bottom:8px">🛡️</div><div style="font-weight:800;font-size:17px;margin-bottom:6px">Alat inspeksi terdeteksi</div><div style="color:#8B949E;font-size:13px;line-height:20px">Tutup DevTools, lalu muat ulang halaman untuk melanjutkan memakai Zeroid-whatsapp.</div></div>';
          document.body.appendChild(o);
        }
      };
      document.addEventListener('contextmenu', function (e) { e.preventDefault(); });
      document.addEventListener('keydown', function (e) {
        var k = (e.key || '').toUpperCase();
        if (k === 'F12' || (e.ctrlKey && e.shiftKey && ['I','J','C','K'].indexOf(k) >= 0) || (e.ctrlKey && k === 'U') || (e.metaKey && e.altKey && ['I','J','C','U'].indexOf(k) >= 0)) {
          e.preventDefault(); trip();
        }
      });
      var check = function () {
        var gap = Math.max(window.outerWidth - window.innerWidth, window.outerHeight - window.innerHeight);
        if (gap > 180 && !/Edg\\//.test(navigator.userAgent)) trip();
      };
      window.addEventListener('resize', check); check();
      console.log('%cZeroid-whatsapp', 'font-size:28px;font-weight:900;color:#1E6BFF');
      console.log('%cSTOP! Area ini hanya untuk pengembang. Menempel kode di sini dapat membocorkan akunmu.', 'font-size:14px;font-weight:700;color:#E02424');
    } catch (e) {}
  })();
  </script>`;
  html = html.replace('</head>', `${guard}\n  </head>`);
  fs.writeFileSync(index, html);
  console.log('Anti-devtools guard injected into dist/index.html');
}

// 2a) VIEWPORT PAS LAYAR + ANTI-ZOOM ala APK — jalan SEBELUM bundle JS dimuat:
//     - meta viewport: device-width, skala terkunci 1 (tidak bisa di-zoom/kegeser kekecilan)
//     - CSS: html/body penuh, overscroll-behavior none (tidak memantul/tertarik),
//       touch-action pan saja (pinch diblokir), #root setinggi layar nyata (100dvh)
if (!html.includes('zeroid-viewport-lock')) {
  // ganti meta viewport bawaan expo → versi terkunci
  html = html.replace(/<meta name="viewport" content="[^"]*"\s*\/?>/, '<meta name="viewport" content="width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover" />');
  if (!html.includes('user-scalable=no')) {
    html = html.replace('</head>', '<meta name="viewport" content="width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover" />\n  </head>');
  }
  const vpStyle = `<style id="zeroid-viewport-lock">
  html, body { margin:0; padding:0; width:100%; height:100%; overflow:hidden; overscroll-behavior:none; touch-action:pan-x pan-y; -webkit-tap-highlight-color:transparent; -webkit-text-size-adjust:100%; }
  #root { width:100%; height:100%; height:100dvh; }
  html { -webkit-user-zoom: fixed; }
  </style>
  <script id="zeroid-antizoom">
  /* Anti-zoom awal: pinch, double-tap, Ctrl+scroll — jalan sebelum React. */
  (function () {
    try {
      var prevent = function (e) { e.preventDefault(); };
      document.addEventListener('gesturestart', prevent, { passive: false });
      document.addEventListener('gesturechange', prevent, { passive: false });
      var lastTouch = 0;
      document.addEventListener('touchend', function (e) {
        var now = Date.now();
        if (now - lastTouch < 320) e.preventDefault();
        lastTouch = now;
      }, { passive: false });
      document.addEventListener('wheel', function (e) { if (e.ctrlKey || e.metaKey) e.preventDefault(); }, { passive: false });
      document.addEventListener('keydown', function (e) {
        if ((e.ctrlKey || e.metaKey) && ['+', '-', '=', '0'].indexOf(e.key) >= 0) e.preventDefault();
      });
    } catch (e) {}
  })();
  </script>`;
  html = html.replace('</head>', `${vpStyle}\n  </head>`);
  fs.writeFileSync(index, html);
  console.log('Viewport lock + anti-zoom injected into dist/index.html');
}

if (!html.includes('manifest.webmanifest')) {
  const meta = `
    <link rel="manifest" href="/manifest.webmanifest" />
    <meta name="theme-color" media="(prefers-color-scheme: light)" content="#1E6BFF" />
    <meta name="theme-color" media="(prefers-color-scheme: dark)" content="#1D222B" />
    <meta name="description" content="Zeroid WhatsApp — chat, panggilan suara & video, Story, dan musik." />
    <meta name="mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="default" />
    <meta name="apple-mobile-web-app-title" content="Zeroid" />
    <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
    <link rel="icon" type="image/png" href="/favicon-32.png" />
    <script>
      (function () {
        if (!('serviceWorker' in navigator)) return;
        window.addEventListener('load', function () {
          navigator.serviceWorker.register('/sw.js').then(function (reg) {
            // Deteksi SW baru → aktifkan segera → reload sekali agar user selalu
            // melihat versi terbaru setelah deploy (tidak ada lagi "web masih lama").
            reg.addEventListener('updatefound', function () {
              var nw = reg.installing;
              if (!nw) return;
              nw.addEventListener('statechange', function () {
                if (nw.state === 'installed' && navigator.serviceWorker.controller) {
                  nw.postMessage('SKIP_WAITING');
                }
              });
            });
          }).catch(function (e) { console.warn('SW registration failed', e); });
          var reloading = false;
          navigator.serviceWorker.addEventListener('controllerchange', function () {
            if (reloading) return;
            reloading = true;
            setTimeout(function () { window.location.reload(); }, 150);
          });
        });
      })();
    </script>`;
  html = html.replace('</head>', `${meta}\n  </head>`);
  fs.writeFileSync(index, html);
  console.log('PWA meta + SW registration injected into dist/index.html');
} else {
  console.log('index.html already patched');
}
