#!/bin/bash
# Probe 6: youtube search for official anime episodes (Muse Indonesia / Ani-One)
TOK=$(cat /tmp/ztok)
BASE="https://whatsapp-zeroid.vercel.app"

probe() {
  local name="$1"; shift
  local body="$1"; shift
  echo "===== $name ====="
  curl -s -m 60 -X POST "$BASE/api/jere" -H "Authorization: Bearer $TOK" -H 'Content-Type: application/json' -d "$body" | head -c 900
  echo; echo
}

probe yt_kanojo '{"action":"yt_search","q":"Kanojo no Tomodachi episode 5 sub indo"}'
probe yt_muse '{"action":"yt_search","q":"Muse Indonesia Kanojo no Tomodachi"}'
probe song_play '{"action":"song_play","q":"Yami Shibai 4 episode 4 sub indo"}'
