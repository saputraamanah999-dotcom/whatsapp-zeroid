#!/bin/bash
# Probe deliver v2: create order PENDING (per rules), patch to paid as admin, then deliver.
set -e
TOK=$(cat /tmp/ztok)
BASE="https://whatsapp-zeroid.vercel.app"
PROJ="whatsapp-zeroid"
MYUID="2x2JHkHWnAZzt6SoU19jQASHJ7W2"
NOW=$(python3 -c "import time;print(int(time.time()*1000))")

mkorder() { # $1 tag, $2 product, $3 meta-json
  local oid="probe$1$NOW"
  local fields=$(python3 - "$2" "$3" <<'EOF'
import json, sys, datetime
product, meta = sys.argv[1], json.loads(sys.argv[2])
f = {
  'userId': {'stringValue': '2x2JHkHWnAZzt6SoU19jQASHJ7W2'},
  'product': {'stringValue': product},
  'plan': {'stringValue': '-'},
  'price': {'integerValue': '5000'},
  'method': {'stringValue': 'qris'},
  'status': {'stringValue': 'pending'},
  'days': {'integerValue': '0'},
  'createdAt': {'timestampValue': datetime.datetime.now(datetime.UTC).strftime('%Y-%m-%dT%H:%M:%S.000Z')},
  'meta': {'mapValue': {'fields': {k: {'stringValue': str(v)} for k, v in meta.items()}}},
}
print(json.dumps({'fields': f}))
EOF
)
  local code=$(curl -s -o /tmp/mk_$1.json -w "%{http_code}" -m 30 -X POST \
    "https://firestore.googleapis.com/v1/projects/$PROJ/databases/(default)/documents/orders?documentId=$oid" \
    -H "Authorization: Bearer $TOK" -H 'Content-Type: application/json' -d "$fields")
  echo "order $oid create: $code" >&2
  if [ "$code" != "200" ]; then cat /tmp/mk_$1.json | head -c 300 >&2; echo >&2; return 1; fi
  echo "$oid"
}

payorder() { # $1 oid — patch status paid (admin)
  local mask='updateMask.fieldPaths=status&updateMask.fieldPaths=decidedAt&updateMask.fieldPaths=adminNote'
  local body='{"fields":{"status":{"stringValue":"paid"},"decidedAt":{"integerValue":"'"$NOW"'"},"adminNote":{"stringValue":"probe test"}}}'
  local code=$(curl -s -o /tmp/pp.json -w "%{http_code}" -m 30 -X PATCH \
    "https://firestore.googleapis.com/v1/projects/$PROJ/databases/(default)/documents/orders/$1?$mask" \
    -H "Authorization: Bearer $TOK" -H 'Content-Type: application/json' -d "$body")
  echo "pay $1: $code" >&2
}

O1=$(mkorder A checknomor '{"nomor":"081234567890"}') && payorder "$O1" && {
  echo "=== deliver checknomor ==="
  curl -s -m 75 -X POST "$BASE/api/vanzz" -H "Authorization: Bearer $TOK" -H 'Content-Type: application/json' -d "{\"action\":\"deliver\",\"orderId\":\"$O1\"}" | head -c 1800; echo; }

O2=$(mkorder B netflix '{}') && payorder "$O2" && {
  echo "=== deliver netflix ==="
  curl -s -m 75 -X POST "$BASE/api/vanzz" -H "Authorization: Bearer $TOK" -H 'Content-Type: application/json' -d "{\"action\":\"deliver\",\"orderId\":\"$O2\"}" | head -c 1800; echo; }

O3=$(mkorder C cekresi '{"resi":"SPXID054330680586","ekspedisi":"shopee-express"}') && payorder "$O3" && {
  echo "=== deliver cekresi ==="
  curl -s -m 75 -X POST "$BASE/api/vanzz" -H "Authorization: Bearer $TOK" -H 'Content-Type: application/json' -d "{\"action\":\"deliver\",\"orderId\":\"$O3\"}" | head -c 1800; echo; }
