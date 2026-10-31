#!/bin/bash
# Probe part 2 — anime, amfinder, checknomor, netflix shapes
set -e
TOK=$(cat /tmp/ztok)
BASE="https://whatsapp-zeroid.vercel.app"

probe() {
  local name="$1"; local body="$2"; local max="${3:-1500}"
  echo "===== $name ====="
  curl -s -m 75 -X POST "$BASE/api/vanzz" -H "Authorization: Bearer $TOK" -H 'Content-Type: application/json' -d "$body" | head -c "$max"
  echo; echo
}

probe anime_fyp    '{"action":"call","key":"anime_fyp"}' 900
probe anime_search '{"action":"call","key":"anime_search","params":{"keyword":"one piece"}}' 900
probe otakudesu    '{"action":"call","key":"otakudesu_latest"}' 900
probe amfinder     '{"action":"call","key":"amfinder","params":{"url":"https://www.tiktok.com/@zeroid"}}' 900
probe checknomor   '{"action":"call","key":"checknomor","params":{"nomor":"081234567890"}}' 1500
