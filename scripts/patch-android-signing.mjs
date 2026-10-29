/**
 * Suntik signingConfig release ke android/app/build.gradle hasil `expo prebuild`.
 * Dipakai CI (.github/workflows/build-apk.yml) supaya APK bertanda tangan konsisten
 * (keystore dari secret ANDROID_KEYSTORE_BASE64 — TIDAK pernah masuk repo).
 * Aman dijalankan berulang: blok yang sudah ada tidak ditambah lagi.
 */
import fs from 'node:fs';

const gradlePath = new URL('../android/app/build.gradle', import.meta.url);
let g = fs.readFileSync(gradlePath, 'utf8');
if (g.includes('signingConfigs {') && g.includes('storeFile zeroidReleaseKeystore')) {
  console.log('signingConfig release sudah ada — lewati.');
  process.exit(0);
}

const block = `
// ===== ZEROID RELEASE SIGNING (auto-injected) =====
def zeroidReleaseKeystore = rootProject.file("app/zeroid-release.keystore")
android {
    signingConfigs {
        zeroidRelease {
            if (zeroidReleaseKeystore.exists()) {
                storeFile zeroidReleaseKeystore
                storePassword System.getenv("ANDROID_KEYSTORE_PASSWORD") ?: ""
                keyAlias System.getenv("ANDROID_KEY_ALIAS") ?: "zeroid"
                keyPassword System.getenv("ANDROID_KEY_ALIAS_PASSWORD") ?: ""
            }
        }
    }
    buildTypes {
        release {
            if (zeroidReleaseKeystore.exists()) {
                signingConfig signingConfigs.zeroidRelease
            }
        }
    }
}
// ===== END ZEROID RELEASE SIGNING =====
`;

// letakkan blok sebelum baris terakhir supaya berlaku sebagai konfigurasi tambahan
g = g.replace(/(dependencies \{)/, block + '\n$1');
fs.writeFileSync(gradlePath, g);
console.log('signingConfig release disuntikkan ke', gradlePath.pathname);
