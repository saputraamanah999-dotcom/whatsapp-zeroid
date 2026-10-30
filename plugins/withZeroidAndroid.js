/**
 * Zeroid-whatsapp Android config plugin.
 *
 * - Keeps the EXISTING Firebase native config: if ./google-services.json
 *   (project "projekwhattsaf") is present it is wired into Gradle automatically.
 * - Adds incoming-call activity flags (showWhenLocked / turnScreenOn) so the
 *   full-screen-intent call notification can wake the device.
 * - Default FCM notification channel = "messages".
 * - Sets Gradle properties (minSdk 24, target/compile 35, Hermes, R8).
 */
const fs = require('fs');
const path = require('path');
const {
  withAndroidManifest,
  withGradleProperties,
  withAppBuildGradle,
  AndroidConfig,
} = require('@expo/config-plugins');

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
    setGradleProp(cfg.modResults, 'android.compileSdkVersion', '35');
    setGradleProp(cfg.modResults, 'android.targetSdkVersion', '35');
    // AKAR BUG FORCE CLOSE v1.2.0: R8/ProGuard + shrinkResources membuang class native
    // → aplikasi crash saat dibuka. DIMATIKAN TOTAL (stabil > ukuran kecil).
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
