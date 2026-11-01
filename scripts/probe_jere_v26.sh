#!/bin/bash
# Probe 5: deployed jere anime actions (siputzx chain) — did they recover?
TOK=$(cat /tmp/ztok)
BASE="https://whatsapp-zeroid.vercel.app"

jere() {
  local name="$1"; shift
  local body="$1"; shift
  echo "===== $name ====="
  curl -s -m 70 -X POST "$BASE/api/jere" -H "Authorization: Bearer $TOK" -H 'Content-Type: application/json' -d "$body" | head -c 600
  echo; echo
}

jere latest '{"action":"anime_latest"}'
jere hot '{"action":"anime_hot"}'
jere search '{"action":"anime_search","q":"kanojo no tomodachi"}'
jere detail '{"action":"anime_detail","slug":"https://otakudesu.or.at/kanojo-no-tomodachi-episode-5-subtitle-indonesia/"}'
