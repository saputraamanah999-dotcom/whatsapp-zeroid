#!/bin/bash
# Probe deployed ZEROID anime endpoints as admin (token kept in temp file, never printed)
set -e
KEY="AIzaSyBiiwHAEY8nExO09bWkc5DAB-5lhUMWsMA"
BASE="https://whatsapp-zeroid.vercel.app"
EMAIL="gedejulianto148@gmail.com"
PASS='saputra123@'

TOK=$(curl -s -m 30 -X POST "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=$KEY" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\",\"returnSecureToken\":true}" \
  | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('idToken','') if 'idToken' in d else 'ERR:'+d.get('error',{}).get('message','?'))")
if [[ "$TOK" == ERR* || -z "$TOK" ]]; then echo "LOGIN FAILED: $TOK"; exit 1; fi
echo "login: OK"
echo "$TOK" > /tmp/ztok

probe() {
  local name="$1"; shift
  local body="$1"; shift
  local len="${1:-1500}"; shift || true
  echo "===== $name ====="
  curl -s -m 70 -X POST "$BASE/api/vanzz" -H "Authorization: Bearer $TOK" -H 'Content-Type: application/json' -d "$body" | head -c "$len"
  echo; echo
}

probe anime_fyp '{"action":"call","key":"anime_fyp"}' 900
probe otakudesu_latest '{"action":"call","key":"otakudesu_latest"}' 700
probe anime_search '{"action":"call","key":"anime_search","params":{"keyword":"one piece"}}' 700
