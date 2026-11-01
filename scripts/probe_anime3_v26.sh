#!/bin/bash
# Probe 3: which image hosts work + otakudesu detail endpoint existence
TOK=$(cat /tmp/ztok)
BASE="https://whatsapp-zeroid.vercel.app"

echo "== HOST TESTS =="
for u in \
  "https://assets.animein.net/cuplix/thumbnail/1793518825_cc7663abb282.png" \
  "https://api.animein.net/assets_xyz/images/movie/episode/2ef84f3752af0f9a32b308faf08ef356.jpg" \
  "https://storages.animein.net/Yami%20Shibai%204%2F4-360p-1735569899974.mp4"; do
  echo -n "$u -> "
  curl -s -o /dev/null -w "%{http_code} %{content_type} %{size_download}B\n" --max-time 15 -r 0-2000 "$u"
done

probe() {
  local name="$1"; shift
  local body="$1"; shift
  echo "===== $name ====="
  curl -s -m 60 -X POST "$BASE/api/vanzz" -H "Authorization: Bearer $TOK" -H 'Content-Type: application/json' -d "$body" | head -c 700
  echo; echo
}

# try candidate otakudesu detail endpoint keys (FREE registry only has latest/ongoing)
# -> use raw upstream via browser? no. Probe via a nonexistent key returns "Endpoint tidak tersedia."
probe otd_detail_guess '{"action":"call","key":"otakudesu_detail","params":{"url":"https://otakudesu.or.at/kanojo-no-tomodachi-episode-5-subtitle-indonesia/"}}' 500
