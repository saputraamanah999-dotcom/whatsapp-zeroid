#!/usr/bin/env python3
"""AUDIT APK ZEROID — identitas, tanda tangan, sertifikat, manifest.
Sesuai permintaan pemilik: apksigner-equivalent (androguard), SHA-256 fingerprint,
package identity, versionCode, signature scheme. Tanpa mengubah APK."""
import sys, hashlib, zipfile

path = sys.argv[1] if len(sys.argv) > 1 else '/home/z/my-project/download/release/zeroid-1.8.0.apk'
print(f'=== AUDIT APK: {path.split("/")[-1]} ===')

def sect(title):
    print(f'\n-- {title} --')

import logging
logging.disable(logging.CRITICAL)
from androguard.core.apk import APK
a = APK(path)

sect('IDENTITAS')
try:
    print('package        :', a.get_package())
    print('app name       :', a.get_app_name())
    print('versionName    :', a.get_androidversion_name())
    print('versionCode    :', a.get_androidversion_code())
    print('minSdk         :', a.get_min_sdk_version())
    print('targetSdk      :', a.get_target_sdk_version())
except Exception as e:
    print('ERR', e)

sect('TANDA TANGAN (signature schemes)')
try:
    print('v1 (JAR) signed:', a.is_signed_v1())
    print('v2 (APK Sig)   :', a.is_signed_v2())
    print('v3 (key rotation):', a.is_signed_v3())
except Exception as e:
    print('ERR', e)

sect('SERTIFIKAT')
try:
    for i, der in enumerate(a.get_certificates_der_v2() or []):
        print(f'v2 cert[{i}] SHA-256:', hashlib.sha256(der).hexdigest().upper())
    for i, der in enumerate(a.get_certificates_der_v1() or []):
        print(f'v1 cert[{i}] SHA-256:', hashlib.sha256(der).hexdigest().upper())
except Exception as e:
    print('ERR', e)

sect('IZIN (permissions)')
try:
    import xml.etree.ElementTree as ET
    xml = a.get_android_manifest_axml().get_xml(pretty=True).decode('utf-8', 'ignore') if hasattr(a.get_android_manifest_axml(), 'get_xml') else ''
    perms = a.get_permissions()
    print('jumlah izin    :', len(perms))
    for p in sorted(perms):
        print('  ', p)
except Exception as e:
    print('ERR', e)

sect('METADATA APK (zip level)')
z = zipfile.ZipFile(path)
names = z.namelist()
print('entries        :', len(names))
print('classes.dex    :', 'classes.dex' in names)
print('arm64 lib      :', any('lib/arm64-v8a/' in n for n in names))
print('bundle JS      :', [n for n in names if 'index.android.bundle' in n])
tot = sum(i.file_size for i in z.infolist())
print('total unpacked :', round(tot/1e6, 1), 'MB')
# bukti fitur terbaru di bundle
bundle = [n for n in names if n.endswith('index.android.bundle')]
if bundle:
    data = z.read(bundle[0])
    for probe in [b'ZEROID_BOOT', b'Reaksi lainnya', b'Langganan', b'Masuk sebagai']:
        print(f'bundle memuat {probe.decode()!r}:', probe in data)
