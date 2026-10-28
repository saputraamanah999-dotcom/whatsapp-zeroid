/**
 * Post-build step for `expo export --platform web`:
 *  1. Copies pwa/ assets (manifest, service worker, icons, offline page) into dist/.
 *  2. Injects PWA meta tags + service-worker registration into dist/index.html.
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

// 2) inject meta + SW registration
const index = path.join(DIST, 'index.html');
let html = fs.readFileSync(index, 'utf8');

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
      if ('serviceWorker' in navigator) {
        window.addEventListener('load', function () {
          navigator.serviceWorker.register('/sw.js').catch(function (e) {
            console.warn('SW registration failed', e);
          });
        });
      }
    </script>`;
  html = html.replace('</head>', `${meta}\n  </head>`);
  fs.writeFileSync(index, html);
  console.log('PWA meta + SW registration injected into dist/index.html');
} else {
  console.log('index.html already patched');
}
