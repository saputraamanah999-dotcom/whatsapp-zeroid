import './lib/crashguard'; // WAJIB import pertama — penangkap galat terpasang sebelum modul lain dievaluasi

import { registerRootComponent } from 'expo';
import { bootLog } from './lib/bootlog';

// [ZEROID_BOOT] START — fase paling awal yang bisa dicatat dari JS
bootLog('START');

import App from './App';

// [ZEROID_BOOT] JS_BUNDLE_READY — seluruh pohon modul (termasuk App) selesai dievaluasi
bootLog('JS_BUNDLE_READY');

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
