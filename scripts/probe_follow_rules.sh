#!/usr/bin/env bash
# LIVE TEST: aturan self-join saluran (ikuti) + unfollow — bukti Firebase jalan.
# Buat akun sementara → join ch_zeroid_ai (members +1) → unfollow (members -1).
set -e
KEY="AIzaSyBiiwHAEY8nExO09bWkc5DAB-5lhUMWsMA"
PROJ="whatsapp-zeroid"
TS=$(date +%s)
EMAIL="probe_follow_${TS}@zeroid-test.dev"
PASS="Probe${TS}x!"

echo "== 1) daftar akun sementara =="
AUTH=$(curl -s -X POST "https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=$KEY" \
  -H 'Content-Type: application/json' -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\",\"returnSecureToken\":true}")
TOK=$(echo "$AUTH" | python3 -c "import sys,json;print(json.load(sys.stdin).get('idToken',''))")
UID2=$(echo "$AUTH" | python3 -c "import sys,json;print(json.load(sys.stdin).get('localId',''))")
[ -z "$TOK" ] && { echo "SIGNUP FAILED: $AUTH"; exit 1; }
echo "uid=$UID2"

CH="ch_zeroid_ai"
BASE="https://firestore.googleapis.com/v1/projects/$PROJ/databases/(default)/documents"

echo "== 2) baca members saluran =="
CUR=$(curl -s "$BASE/chats/$CH?mask.fieldPaths=members&mask.fieldPaths=type" -H "Authorization: Bearer $TOK")
echo "$CUR" | python3 -c "import sys,json;d=json.load(sys.stdin);f=d.get('fields',{});m=[x['stringValue'] for x in f.get('members',{}).get('arrayValue',{}).get('values',[])];print('members:',len(m))"

echo "== 3) self-join (ikuti saluran) =="
NEW=$(echo "$CUR" | python3 -c "
import sys, json
d = json.load(sys.stdin)
m = [x['stringValue'] for x in d.get('fields', {}).get('members', {}).get('arrayValue', {}).get('values', [])]
m.append('$UID2')
print(json.dumps({'fields': {'members': {'arrayValue': {'values': [{'stringValue': x} for x in m]}}}}))
")
CODE=$(curl -s -o /tmp/join.json -w "%{http_code}" -X PATCH "$BASE/chats/$CH?updateMask.fieldPaths=members" \
  -H "Authorization: Bearer $TOK" -H 'Content-Type: application/json' -d "$NEW")
echo "join HTTP $CODE"
[ "$CODE" = "200" ] && echo "JOIN OK — aturan self-join JALAN" || { echo "JOIN GAGAL:"; cat /tmp/join.json; }

echo "== 4) unfollow (members -1) =="
CODE2=$(curl -s -o /tmp/un.json -w "%{http_code}" -X PATCH "$BASE/chats/$CH?updateMask.fieldPaths=members" \
  -H "Authorization: Bearer $TOK" -H 'Content-Type: application/json' -d "$CUR")
echo "unfollow HTTP $CODE2"
[ "$CODE2" = "200" ] && echo "UNFOLLOW OK" || { echo "UNFOLLOW GAGAL:"; cat /tmp/un.json; }

echo "== 5) verifikasi members kembali semula =="
curl -s "$BASE/chats/$CH?mask.fieldPaths=members" -H "Authorization: Bearer $TOK" \
 | python3 -c "
import sys, json
d = json.load(sys.stdin)
m = [x['stringValue'] for x in d.get('fields', {}).get('members', {}).get('arrayValue', {}).get('values', [])]
print('members final:', len(m), '(harus tanpa $UID2)')"
echo "SELESAI — akun uji: $EMAIL (biarkan, tanpa profil, tak mengganggu)"
