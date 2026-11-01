#!/bin/bash
# Probe 4: alternative providers (jerexd / sylvatica / vexo) for anime endpoints
# Keys were supplied by the owner for direct integration.
JERE="jere_ebhzcs-KVLg2"
SYLV="sylva-630679ece126c6283d0f42c4da6cce53"
VEXO="l3-Kb-aRMGFeb_Kv"

echo "===== jerexd root/docs ====="
curl -s -m 15 -H "apikey: $JERE" "https://api.jerexd.my.id/" | head -c 400; echo; echo
echo "===== jerexd otakudesu ongoing ====="
curl -s -m 20 -H "apikey: $JERE" "https://api.jerexd.my.id/otakudesu/ongoing" | head -c 400; echo; echo
echo "===== jerexd otakudesu detail ====="
curl -s -m 20 -H "apikey: $JERE" "https://api.jerexd.my.id/otakudesu/detail?url=https://otakudesu.or.at/kanojo-no-tomodachi-episode-5-subtitle-indonesia/" | head -c 500; echo; echo
echo "===== sylvatica root ====="
curl -s -m 15 -H "apikey: $SYLV" "https://sylvatica.my.id/" | head -c 300; echo; echo
echo "===== vexo root ====="
curl -s -m 15 -H "apikey: $VEXO" "https://vexoapi.site/" | head -c 300; echo
