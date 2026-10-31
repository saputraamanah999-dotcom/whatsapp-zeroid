#!/bin/bash
# ZIP AKHIR — ZEROID-WHATSAPP-FIXED-COMPLETE.zip
# Isi: source + rules + indexes + functions + docs + .env.example + laporan
#      + APK (folder release/). TANPA node_modules, .git, rahasia, cache build.
set -eu
cd /home/z/my-project

OUT="/home/z/my-project/download/ZEROID-WHATSAPP-FIXED-COMPLETE.zip"
STAGE=$(mktemp -d)
trap 'rm -rf "$STAGE"' EXIT

# 1. salin pohon proyek TANPA yang dilarang
rsync -a --exclude 'node_modules' --exclude '.git' --exclude 'dist' \
      --exclude '.expo' --exclude 'download' --exclude 'tool-results' \
      --exclude '*.log' --exclude '.DS_Store' \
      /home/z/my-project/ "$STAGE/ZEROID-WHATSAPP-FIXED-COMPLETE/"

# 2. jangan ikutkan file berisi kredensial (jaga-jaga genap bila berubah nama)
find "$STAGE" -iname '*service-account*' -o -iname '*-sa.json' -o -iname 'secrets' -type d | xargs -r rm -rf
rm -f "$STAGE/ZEROID-WHATSAPP-FIXED-COMPLETE/.env" 2>/dev/null || true

# 3. APK hasil build CI ke folder release/
mkdir -p "$STAGE/ZEROID-WHATSAPP-FIXED-COMPLETE/release"
# pakai APK TERBARU (versi dari app.json) di download/release/
LATEST_APK=$(ls -t /home/z/my-project/download/release/zeroid-*.apk 2>/dev/null | head -1 || true)
if [ -n "$LATEST_APK" ]; then
  VER=$(node -p "require('/home/z/my-project/app.json').expo.version")
  cp "$LATEST_APK" "$STAGE/ZEROID-WHATSAPP-FIXED-COMPLETE/release/zeroid-whatsapp-${VER}.apk"
fi

# 4. sanity: pastikan tidak ada file >20MB selain APK
find "$STAGE" -type f -size +20M ! -name '*.apk' -print

cd "$STAGE"
zip -qr "$OUT" ZEROID-WHATSAPP-FIXED-COMPLETE
echo "ZIP OK: $OUT ($(du -h "$OUT" | cut -f1))"
unzip -l "$OUT" | tail -3
