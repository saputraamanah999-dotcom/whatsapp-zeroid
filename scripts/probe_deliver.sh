#!/bin/bash
# Probe deliver flow: create a REAL probe order as admin (status paid) then call deliver
# to see the true payload shapes of checknomor & netflix (needed to fix ResultCard).
set -e
TOK=$(cat /tmp/ztok)
BASE="https://whatsapp-zeroid.vercel.app"
PROJ="whatsapp-zeroid"

# my uid from token
MYUID=$(python3 - <<'EOF'
import base64, json
tok = open('/tmp/ztok').read().strip().split('.')
pad = '=' * (-len(tok[1]) % 4)
d = json.loads(base64.urlsafe_b64decode(tok[1] + pad))
print(d.get('user_id', d.get('sub','')))
EOF
)
echo "uid: $MYUID"
NOW=$(python3 -c "import time;print(int(time.time()*1000))")

mkorder() {
  local oid="probe_$1_$NOW"
  local product="$2"; shift 2
  local meta="$1"; shift
  # meta passed as python dict literal string
  local fields=$(python3 - "$product" "$MYUID" "$meta" <<'EOF'
import json, sys
product, uid, meta = sys.argv[1], sys.argv[2], json.loads(sys.argv[3])
f = {
  'userId': {'stringValue': uid},
  'product': {'stringValue': product},
  'plan': {'stringValue': '-'},
  'price': {'integerValue': '0'},
  'method': {'stringValue': 'qris'},
  'status': {'stringValue': 'paid'},
  'createdAt': {'timestampValue': __import__('datetime').datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%S.000Z')},
  'delivered': {'booleanValue': False},
  'meta': {'mapValue': {'fields': {k: {'stringValue': str(v)} for k, v in meta.items()}}},
}
print(json.dumps({'fields': f}))
EOF
)
  local code=$(curl -s -o /tmp/mk.json -w "%{http_code}" -m 30 -X POST \
    "https://firestore.googleapis.com/v1/projects/$PROJ/databases/(default)/documents/orders?documentId=$oid" \
    -H "Authorization: Bearer $TOK" -H 'Content-Type: application/json' -d "$fields")
  echo "order create: $code" >&2
  echo "$oid"
}

O1=$(mkorder nomor checknomor '{"nomor":"081234567890"}')
O2=$(mkorder netflix netflix '{}')
echo "=== deliver checknomor ==="
curl -s -m 70 -X POST "$BASE/api/vanzz" -H "Authorization: Bearer $TOK" -H 'Content-Type: application/json' -d "{\"action\":\"deliver\",\"orderId\":\"$O1\"}" | head -c 1600
echo; echo "=== deliver netflix ==="
curl -s -m 70 -X POST "$BASE/api/vanzz" -H "Authorization: Bearer $TOK" -H 'Content-Type: application/json' -d "{\"action\":\"deliver\",\"orderId\":\"$O2\"}" | head -c 1600
echo
