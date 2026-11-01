#!/usr/bin/env bash
# Probe live Firestore state for saluran (channels) + orders — used to debug batch-3 reports.
set -e
KEY="AIzaSyBiiwHAEY8nExO09bWkc5DAB-5lhUMWsMA"
PROJ="whatsapp-zeroid"
EMAIL="gedejulianto148@gmail.com"
PASS='saputra123@'

TOK=$(curl -s -X POST "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=$KEY" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\",\"returnSecureToken\":true}" \
  | python3 -c "import sys,json;d=json.load(sys.stdin);print(d.get('idToken') or '')")

if [ -z "$TOK" ]; then echo "LOGIN FAILED"; exit 1; fi
echo "LOGIN OK"

MODE=${1:-channels}
if [ "$MODE" = "channels" ]; then
  curl -s "https://firestore.googleapis.com/v1/projects/$PROJ/databases/(default)/documents/chats?pageSize=200&mask.fieldPaths=id&mask.fieldPaths=type&mask.fieldPaths=name&mask.fieldPaths=members&mask.fieldPaths=admins&mask.fieldPaths=createdBy&mask.fieldPaths=followers" \
    -H "Authorization: Bearer $TOK" \
  | python3 -c "
import sys, json
d = json.load(sys.stdin)
docs = d.get('documents', [])
print('total docs:', len(docs))
for doc in docs:
    f = doc.get('fields', {})
    def arr(name):
        v = f.get(name, {}).get('arrayValue', {}).get('values', [])
        return [x.get('stringValue', x.get('integerValue', '?')) for x in v]
    print('---')
    print('id:', f.get('id', {}).get('stringValue'))
    print('type:', f.get('type', {}).get('stringValue'))
    print('name:', f.get('name', {}).get('stringValue'))
    print('createdBy:', f.get('createdBy', {}).get('stringValue'))
    print('admins:', arr('admins'))
    print('members(%d):' % len(arr('members')), arr('members')[:12])
    if 'followers' in f: print('followers:', arr('followers'))
"
elif [ "$MODE" = "orders" ]; then
  curl -s "https://firestore.googleapis.com/v1/projects/$PROJ/databases/(default)/documents/orders?pageSize=100" \
    -H "Authorization: Bearer $TOK" | python3 -m json.tool | head -80
elif [ "$MODE" = "products" ]; then
  curl -s "https://firestore.googleapis.com/v1/projects/$PROJ/databases/(default)/documents/products?pageSize=50" \
    -H "Authorization: Bearer $TOK" | python3 -m json.tool | head -60
elif [ "$MODE" = "config" ]; then
  curl -s "https://firestore.googleapis.com/v1/projects/$PROJ/databases/(default)/documents/config" \
    -H "Authorization: Bearer $TOK" | python3 -m json.tool | head -40
fi
