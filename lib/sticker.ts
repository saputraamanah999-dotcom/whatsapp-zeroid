/**
 * UKURAN STIKER — SATU KONFIGURASI untuk SEMUA tempat (permintaan user:
 * "pengaturan ukuran yang mudah disesuaikan melalui satu konfigurasi").
 *
 * Aturan tampil (sama seperti stiker WhatsApp):
 *  - stiker & brat di chat: kotak STICKER_SIZE — proporsional, TIDAK memenuhi
 *    layar seperti foto besar;
 *  - object-fit: contain (expo-image contentFit="contain") — gambar tidak
 *    dipotong & tidak melar;
 *  - pratinjau sebelum kirim: STICKER_PREVIEW_SIZE (proporsi sama dgn hasil kirim);
 *  - pembuka penuh: STICKER_VIEWER_MAX — tetap di bawah ukuran layar HP.
 */
export const STICKER_SIZE = 112;          // stiker/brat di dalam chat
export const STICKER_PREVIEW_SIZE = 116;  // pratinjau composer sebelum kirim
export const STICKER_VIEWER_MAX = 320;    // maksimum saat dibuka ukuran penuh
