#!/bin/bash
# Probe 2: poster URL accessibility + detail flow for the exact broken title
set -e
TOK=$(cat /tmp/ztok)
BASE="https://whatsapp-zeroid.vercel.app"

probe() {
  local name="$1"; shift
  local body="$1"; shift
  local len="${1:-1500}"
  echo "===== $name ====="
  curl -s -m 70 -X POST "$BASE/api/vanzz" -H "Authorization: Bearer $TOK" -H 'Content-Type: application/json' -d "$body" | head -c "$len"
  echo; echo
}

# poster from fyp + thumb from otakudesu
echo "== POSTER fyp =="
curl -s -o /dev/null -w "%{http_code} %{content_type} %{size_download}B\n" --max-time 15 "https://api.animein.net//assets/images/movie/poster/98706d9520d869de340a2419b26d2421.jpg"
echo "== THUMB otakudesu =="
curl -s -o /dev/null -w "%{http_code} %{content_type} %{size_download}B\n" --max-time 15 "https://i0.wp.com/otakudesu.or.at/wp-content/uploads/2026/10/1791114639-8562-159862.jpg?resize=246,350"

probe anime_search_kanojo '{"action":"call","key":"anime_search","params":{"keyword":"kanojo no tomodachi"}}' 600
probe anime_info_426 '{"action":"call","key":"anime_info","params":{"input":"426"}}' 800
probe anime_streams_18889 '{"action":"call","key":"anime_streams","params":{"id":"18889"}}' 900
