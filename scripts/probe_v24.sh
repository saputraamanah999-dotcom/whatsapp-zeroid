#!/bin/bash
# LIVE verification of v24 on production
TOK=$(cat /tmp/ztok)
BASE="https://whatsapp-zeroid.vercel.app"
probe() { echo "===== $1 ====="; curl -s -m 70 -X POST "$BASE/api/vanzz" -H "Authorization: Bearer $TOK" -H 'Content-Type: application/json' -d "$2" | head -c "${3:-700}"; echo; echo; }

probe cuaca7      '{"action":"call","key":"cuaca7","params":{"kota":"Denpasar"}}' 800
probe anime_search '{"action":"call","key":"anime_search","params":{"keyword":"jujutsu kaisen"}}' 400
probe otakudesu_latest '{"action":"call","key":"otakudesu_latest"}' 300
probe anime_fyp   '{"action":"call","key":"anime_fyp"}' 300
probe gempa       '{"action":"call","key":"gempa"}' 300
probe quotes_gombal '{"action":"call","key":"quotes_gombal"}' 300
probe amfinder    '{"action":"call","key":"amfinder","params":{"url":"https://www.tiktok.com/@zeroid"}}' 300
