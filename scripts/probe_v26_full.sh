#!/bin/bash
# SELF-TEST v26 — deployed ZEROID (semua fitur baru)
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

vanzz() {
  curl -s -m 75 -X POST "$BASE/api/vanzz" -H "Authorization: Bearer $TOK" -H 'Content-Type: application/json' -d "$1"
}
jere() {
  curl -s -m 75 -X POST "$BASE/api/jere" -H "Authorization: Bearer $TOK" -H 'Content-Type: application/json' -d "$1"
}

echo "== 1. IPTRACK (alat developer) =="
vanzz '{"action":"iptrack","ip":"114.10.40.10"}' | head -c 420; echo; echo

echo "== 2. ANIME populer (Jikan di klien — cek fyp fallback tetap hidup) =="
vanzz '{"action":"call","key":"anime_fyp"}' | head -c 200; echo; echo

echo "== 3. MUSIK stream (harus host MP3 baru: 123tokyo/vexo dkk) =="
curl -s -m 75 "$BASE/api/music?action=stream&id=dQw4w9WgXcQ" -H "Authorization: Bearer $TOK" | head -c 420; echo; echo

echo "== 4. AI IMAGE gen (sylvatica flux) =="
vanzz '{"action":"img","prompt":"a cute orange cat mascot, flat vector, zeroid brand","provider":""}' | head -c 300; echo; echo

echo "== 5. YT SEARCH utk episode anime =="
jere '{"action":"yt_search","q":"Yami Shibai 4 episode 4 sub indo"}' | head -c 300; echo; echo

echo "== 6. CEK ceknomor fallback masih jalan =="
vanzz '{"action":"call","key":"cuaca7","params":{"kota":"medan"}}' | head -c 260; echo
