/**
 * Zeroid-whatsapp Android config plugin.
 *
 * - Keeps the EXISTING Firebase native config: if ./google-services.json
 *   (project "whatsapp-zeroid") is present it is wired into Gradle automatically.
 * - Adds incoming-call activity flags (showWhenLocked / turnScreenOn) so the
 *   full-screen-intent call notification can wake the device.
 * - Default FCM notification channel = "messages".
 * - Sets Gradle properties (minSdk 24, Hermes, R8 OFF — R8 ever caused the
 *   v1.2.0 force close; compile/target SDK now follow Expo SDK 57 defaults,
 *   memaksa 35 di bawah standar RN 0.86 berisiko crash native saat startup).
 * - v21: Native crash reporter — Thread.setDefaultUncaughtExceptionHandler
 *   menulis laporan ke file + menampilkan TOAST berisi penyebab crash, jadi
 *   force close yang disebabkan kode native TIDAK lagi diam-diam: pemakai bisa
 *   screenshot penyebabnya dan mengirimkannya ke developer.
 */
const fs = require('fs');
const path = require('path');
const {
  withAndroidManifest,
  withGradleProperties,
  withAppBuildGradle,
  withMainApplication,
  AndroidConfig,
} = require('@expo/config-plugins');

const CRASH_MARKER = '// ZEROID-CRASH-REPORTER v21';

const CRASH_REPORTER_KT = `
        ${CRASH_MARKER}
        run {
            val prevHandler = Thread.getDefaultUncaughtExceptionHandler()
            Thread.setDefaultUncaughtExceptionHandler { thread, throwable ->
                try {
                    val reason = (throwable?.message ?: throwable?.javaClass?.name ?: "unknown")
                    val top = throwable?.stackTrace?.firstOrNull()?.let { " at " + it.className + "." + it.methodName + " (" + it.fileName + ":" + it.lineNumber + ")" } ?: ""
                    try {
                        val file = java.io.File(filesDir, "zeroid-native-crash.txt")
                        file.writeText("at=" + java.lang.System.currentTimeMillis() + "\\nthread=" + (thread?.name ?: "?") + "\\nclass=" + (throwable?.javaClass?.name ?: "?") + "\\nmessage=" + reason + "\\n" + throwable?.stackTrace?.take(30)?.joinToString("\\n") ?: "")
                    } catch (_: Throwable) {}
                    try {
                        val app = this
                        val main = android.os.Handler(android.os.Looper.getMainLooper())
                        main.post {
                            try {
                                android.widget.Toast.makeText(app, "Zeroid crash: " + (throwable?.javaClass?.simpleName ?: "?") + ": " + reason.take(120), android.widget.Toast.LENGTH_LONG).show()
                            } catch (_: Throwable) {}
                            main.postDelayed({
                                try { android.widget.Toast.makeText(app, top.take(160), android.widget.Toast.LENGTH_LONG).show() } catch (_: Throwable) {}
                            }, 3700)
                        }
                    } catch (_: Throwable) {}
                } catch (_: Throwable) {}
                prevHandler?.uncaughtException(thread, throwable)
            }
        }
`;

function setGradleProp(props, key, value) {
  const existing = props.find((p) => p.type === 'property' && p.key === key);
  if (existing) existing.value = value;
  else props.push({ type: 'property', key, value });
}

module.exports = function withZeroidAndroid(config) {
  const gs = path.join(__dirname, '..', 'google-services.json');
  if (fs.existsSync(gs)) {
    config.android = config.android || {};
    config.android.googleServicesFile = './google-services.json';
  }

  config = withGradleProperties(config, (cfg) => {
    setGradleProp(cfg.modResults, 'android.minSdkVersion', '24');
    // compile/target SDK: ikuti DEFAULT Expo SDK 57 (RN 0.86) — dipaksa 35 sebelumnya,
    // di bawah standar framework, berisiko galat native. R8 tetap MATI total.
    setGradleProp(cfg.modResults, 'android.enableProguardInReleaseBuilds', 'false');
    setGradleProp(cfg.modResults, 'android.enableShrinkResourcesInReleaseBuilds', 'false');
    setGradleProp(cfg.modResults, 'android.enableMinifyInReleaseBuilds', 'false');
    setGradleProp(cfg.modResults, 'hermesEnabled', 'true');
    setGradleProp(cfg.modResults, 'org.gradle.jvmargs', '-Xmx4096m -XX:MaxMetaspaceSize=1024m');
    return cfg;
  });

  config = withAppBuildGradle(config, (cfg) => {
    if (!cfg.modResults.contents.includes('applicationId "com.zeroid.whatsapp"')) {
      cfg.modResults.contents = cfg.modResults.contents.replace(
        /applicationId\s+['"][^'"]+['"]/,
        'applicationId "com.zeroid.whatsapp"'
      );
    }
    return cfg;
  });

  // NATIVE CRASH REPORTER — MainApplication.onCreate memasang handler bawaan JVM
  config = withMainApplication(config, (cfg) => {
    if (!cfg.modResults.contents.includes(CRASH_MARKER)) {
      cfg.modResults.contents = cfg.modResults.contents.replace(
        /super\.onCreate\(\)/,
        `super.onCreate()\n${CRASH_REPORTER_KT}`
      );
    }
    return cfg;
  });

  config = withAndroidManifest(config, (cfg) => {
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(cfg.modResults);
    const main = AndroidConfig.Manifest.getMainActivityOrThrow(cfg.modResults);
    main.$['android:showWhenLocked'] = 'true';
    main.$['android:turnScreenOn'] = 'true';
    main.$['android:launchMode'] = 'singleTask';

    app['meta-data'] = app['meta-data'] || [];
    const meta = 'com.google.firebase.messaging.default_notification_channel_id';
    const existing = app['meta-data'].find((m) => m.$['android:name'] === meta);
    if (existing) existing.$['android:value'] = 'messages';
    else app['meta-data'].push({ $: { 'android:name': meta, 'android:value': 'messages' } });
    return cfg;
  });

  return config;
};
