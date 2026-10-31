#!/bin/bash
# Probe deployed ZEROID APIs as admin (token kept in temp file, never printed)
set -e
KEY="AIzaSyBiiwHAEY8nExO09bWkc5DAB-5lhUMWsMA"
BASE="https://whatsapp-zeroid.vercel.app"
EMAIL="gedejulianto148@gmail.com"
PASS='saputra123@'

# 1. Firebase sign-in (email/password REST)
TOK=$(curl -s -m 30 -X POST "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=$KEY" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\",\"returnSecureToken\":true}" \
  | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('idToken','') if 'idToken' in d else 'ERR:'+d.get('error',{}).get('message','?'))")
if [[ "$TOK" == ERR* || -z "$TOK" ]]; then echo "LOGIN FAILED: $TOK"; exit 1; fi
echo "login: OK (${#TOK} chars)"
echo "$TOK" > /tmp/ztok

# 2. Probe helper
probe() {
  local name="$1"; shift
  local body="$1"; shift
  echo "===== $name ====="
  curl -s -m 70 -X POST "$BASE/api/vanzz" -H "Authorization: Bearer $TOK" -H 'Content-Type: application/json' -d "$body" | head -c "$1"
  echo; echo
}

probe cuaca    '{"action":"call","key":"cuaca","params":{"kota":"jakarta"}}' 1200
probe gempa    '{"action":"call","key":"gempa"}' 1200
probe bmkg     '{"action":"call","key":"bmkg"}' 1200
probe quotes   '{"action":"call","key":"quotes_motivasi"}' 600
