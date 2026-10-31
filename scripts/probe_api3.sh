#!/bin/bash
# Probe part 3 — animein info/streams shapes
set -e
TOK=$(cat /tmp/ztok)
BASE="https://whatsapp-zeroid.vercel.app"
probe() { echo "===== $1 ====="; curl -s -m 75 -X POST "$BASE/api/vanzz" -H "Authorization: Bearer $TOK" -H 'Content-Type: application/json' -d "$2" | head -c "${3:-1000}"; echo; echo; }
probe anime_info   '{"action":"call","key":"anime_info","params":{"input":"one piece"}}' 1400
probe anime_info2  '{"action":"call","key":"anime_info","params":{"input":"426"}}' 1400
probe anime_streams '{"action":"call","key":"anime_streams","params":{"id":"426"}}' 1400
probe anikai_search '{"action":"call","key":"anikai_search","params":{"q":"one piece"}}' 800
probe otakudesu_ongoing '{"action":"call","key":"otakudesu_ongoing"}' 700
