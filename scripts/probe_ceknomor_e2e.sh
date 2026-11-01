#!/usr/bin/env bash
# E2E TEST: order Cek Nomor → approve (paid) → deliver via /api/vanzz → baca hasil
# → hapus order uji. Membuktikan fitur cek nomor TIDAK lagi 404 (fallback jalan).
set -e
KEY="AIzaSyBiiwHAEY8nExO09bWkc5DAB-5lhUMWsMA"
PROJ="whatsapp-zeroid"
BASE="https://firestore.googleapis.com/v1/projects/$PROJ/databases/(default)/documents"
API="https://whatsapp-zeroid.vercel.app/api/vanzz"

TOK=$(curl -s -X POST "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=$KEY" \
  -H 'Content-Type: application/json' -d '{"email":"gedejulianto148@gmail.com","password":"saputra123@","returnSecureToken":true}' \
  | python3 -c "import sys,json;print(json.load(sys.stdin).get('idToken',''))")
[ -z "$TOK" ] && { echo "LOGIN GAGAL"; exit 1; }
UID2=$(python3 -c "
import base64, json
t = '$TOK'.split('.')[1]
t += '=' * (-len(t) % 4)
print(json.loads(base64.urlsafe_b64decode(t))['user_id'])")
echo "admin uid: $UID2"

NOW=$(date +%s000)
echo "== 1) buat order ceknomor =="
ORD=$(curl -s -X POST "$BASE/orders" -H "Authorization: Bearer $TOK" -H 'Content-Type: application/json' -d "{
  \"fields\": {
    \"userId\": {\"stringValue\": \"$UID2\"},
    \"product\": {\"stringValue\": \"checknomor\"},
    \"plan\": {\"stringValue\": \"Sekali bayar\"},
    \"price\": {\"integerValue\": \"5000\"},
    \"listPrice\": {\"integerValue\": \"5000\"},
    \"days\": {\"integerValue\": \"0\"},
    \"status\": {\"stringValue\": \"pending\"},
    \"method\": {\"stringValue\": \"QRIS\"},
    \"chatId\": {\"stringValue\": \"d_${UID2}_${UID2}\"},
    \"createdAt\": {\"integerValue\": \"$NOW\"},
    \"delivered\": {\"booleanValue\": false},
    \"meta\": {\"mapValue\": {\"fields\": {\"nomor\": {\"stringValue\": \"081234567890\"}}}}
  }
}")
OID=$(echo "$ORD" | python3 -c "import sys,json;u=json.load(sys.stdin).get('name','');print(u.split('/')[-1] if u else '')")
[ -z "$OID" ] && { echo "ORDER GAGAL: $ORD"; exit 1; }
echo "order id: $OID"

echo "== 2) approve (status=paid) sebagai admin =="
CODE=$(curl -s -o /tmp/o2.json -w "%{http_code}" -X PATCH "$BASE/orders/$OID?updateMask.fieldPaths=status&updateMask.fieldPaths=decidedAt" \
  -H "Authorization: Bearer $TOK" -H 'Content-Type: application/json' \
  -d '{"fields": {"status": {"stringValue": "paid"}, "decidedAt": {"integerValue": "'$NOW'"}}}')
echo "approve HTTP $CODE"

echo "== 3) deliver via /api/vanzz =="
curl -s --max-time 90 "$API" -X POST -H "Authorization: Bearer $TOK" -H 'Content-Type: application/json' \
  -d "{\"action\":\"deliver\",\"orderId\":\"$OID\"}" > /tmp/deliver.json
python3 -c "
import json
d = json.load(open('/tmp/deliver.json'))
print('deliver ok:', d.get('ok'), '| fallback:', d.get('fallback'), '| err:', d.get('error'))
r = d.get('result') or {}
res = r.get('result') or r
print('phone:', res.get('phone'))
op = res.get('operator') or {}
print('operator:', op.get('name'), op.get('prefix4'))"

echo "== 4) baca ulang order (hasil tersimpan) =="
curl -s "$BASE/orders/$OID" -H "Authorization: Bearer $TOK" | python3 -c "
import sys, json
d = json.load(sys.stdin)
f = d.get('fields', {})
print('delivered:', f.get('delivered', {}).get('booleanValue'))
rj = f.get('result', {}).get('mapValue', {}).get('fields', {}).get('json', {}).get('stringValue', '')
if rj:
    r = json.loads(rj)
    res = r.get('result') or r
    print('stored phone:', res.get('phone'), '| operator:', (res.get('operator') or {}).get('name'))
de = f.get('deliveryError', {}).get('stringValue')
print('deliveryError:', de)"

echo "== 5) hapus order uji =="
curl -s -o /dev/null -w "delete HTTP %{http_code}\n" -X DELETE "$BASE/orders/$OID" -H "Authorization: Bearer $TOK"
echo "E2E SELESAI"
