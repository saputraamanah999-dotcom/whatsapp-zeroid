/**
 * Media pipeline: pick → validate → compress → upload (progress) → metadata.
 *
 * - Images are resized (max 1600px) and re-encoded (WebP when supported, else
 *   JPEG) via canvas on web / ImageManipulator on native. PNG alpha is kept.
 *   Animated GIFs pass through untouched so they stay animated.
 * - Small files (≤3.2 MB) go through the authenticated serverless proxy
 *   /api/upload (ImgBB when IMGBB_KEY is set → x0.at → uguu → tmpfiles).
 *   ImgBB keeps photos PERMANENT.
 * - BIG files (video/audio/doc > 3.2 MB) bypass the serverless body cap and
 *   upload DIRECTLY from the user's own connection to CORS-open hosts:
 *   litterbox.catbox.moe (72 h, 200 MB) → tmpfiles.org (1 h, 100 MB).
 *   No API key is involved on the client.
 * - Per project spec Firebase Storage is NEVER used for media.
 * - Every upload returns { url, path, mime, size } so the message document can
 *   reference the file without storing binary data in Firestore. Temporary
 *   hosts additionally return expiresAt (stored as mediaExpiresAt).
 * - No silent local fallback: when every provider fails the upload fails
 *   loudly with a human-readable reason.
 */
import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { firebase, firebaseConfig } from './firebase';
import { proxyUrl } from './proxy';
import { ensurePermission } from './permissions';

export type Picked = { type: 'image' | 'video' | 'audio' | 'document'; uri: string; name?: string; size?: number; duration?: number; mime?: string; width?: number; height?: number };

/** Serverless request bodies max ~4.5 MB — base64 payload caps decoded size at 3.2 MB. */
export const UPLOAD_MAX_MB = 3.2;

export const LIMITS = {
  imageMB: 15,       // pre-compression — images are resized before upload anyway
  videoMB: 80,       // direct client upload (litterbox 200MB / tmpfiles 100MB)
  audioMB: 80,       // direct client upload for big audio files
  docMB: 25,         // direct client upload for documents
  maxDim: 1600,
};

export function mb(n: number) { return n * 1024 * 1024; }

export class MediaError extends Error {}

// ---------------- compression (web canvas) ----------------

async function blobToArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  return await blob.arrayBuffer();
}

/** Downscale + re-encode an image. Keeps alpha for PNG with transparency. */
export async function compressImage(source: string | Blob, opts: { maxDim?: number; quality?: number } = {}): Promise<{ blob: Blob; mime: string; width: number; height: number }> {
  const maxDim = opts.maxDim ?? LIMITS.maxDim;
  const quality = opts.quality ?? 0.78;
  if (Platform.OS !== 'web') {
    // native: use expo-image-manipulator when available, else pass through
    try {
      const IM = require('expo-image-manipulator');
      const src = typeof source === 'string' ? source : (source as any)._uri ?? source;
      const ctx = await IM.ImageManipulator.manipulate(src).resize({ width: maxDim }).renderAsync();
      const img = await ctx.image;
      const res = await img.save({ format: IM.SaveFormat.WEBP, compress: Math.round(quality * 100) });
      const r = await fetch(res.uri ?? res.url ?? src);
      const blob = await r.blob();
      return { blob, mime: blob.type || 'image/webp', width: res.width ?? 0, height: res.height ?? 0 };
    } catch {
      const src = typeof source === 'string' ? source : '';
      const r = await fetch(src);
      const blob = await r.blob();
      return { blob, mime: blob.type || 'image/jpeg', width: 0, height: 0 };
    }
  }
  // ---- web canvas path ----
  let bitmap: ImageBitmap | HTMLImageElement;
  try {
    bitmap = await createImageBitmap(source as Blob);
  } catch {
    const url = typeof source === 'string' ? source : URL.createObjectURL(source as Blob);
    bitmap = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = url;
    });
  }
  const iw = (bitmap as any).width as number;
  const ih = (bitmap as any).height as number;
  const scale = Math.min(1, maxDim / Math.max(iw, ih));
  const w = Math.max(1, Math.round(iw * scale));
  const h = Math.max(1, Math.round(ih * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new MediaError('Canvas tidak tersedia di browser ini.');
  ctx.drawImage(bitmap as any, 0, 0, w, h);
  // try WebP, fall back to JPEG
  let blob: Blob | null = null;
  let mime = 'image/webp';
  try { blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/webp', quality)); } catch {}
  if (!blob) { mime = 'image/jpeg'; blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', quality)); }
  if (!blob) throw new MediaError('Gagal mengompres gambar.');
  try { (bitmap as any).close?.(); } catch {}
  return { blob, mime, width: w, height: h };
}

/** Small thumbnail (data URL) for image messages / story posters. */
export async function makeThumb(source: string | Blob, size = 320): Promise<string | undefined> {
  if (Platform.OS !== 'web') return undefined;
  try {
    const { blob } = await compressImage(source, { maxDim: size, quality: 0.6 });
    return await new Promise<string>((resolve) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result));
      fr.onerror = () => resolve('');
      fr.readAsDataURL(blob);
    }) || undefined;
  } catch { return undefined; }
}

// ---------------- upload (external hosts via authenticated proxy) ----------------

export type UploadResult = { url: string; path: string; mime: string; size: number; provider?: string; expiresAt?: number };
export type ProgressFn = (pct: number) => void;

function toBlob(input: Blob | string): Promise<Blob> {
  if (input instanceof Blob) return Promise.resolve(input);
  return fetch(input).then((r) => r.blob());
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => {
      const s = String(fr.result ?? '');
      const i = s.indexOf(',');
      resolve(i >= 0 ? s.slice(i + 1) : s);
    };
    fr.onerror = () => reject(new MediaError('Gagal membaca file.'));
    fr.readAsDataURL(blob);
  });
}

/**
 * Upload any blob/URI to an external host through /api/upload (Vercel).
 * XHR (not fetch) so real upload progress is available on web + native.
 */
function xhrUpload(body: any, onProgress?: ProgressFn, ms = 150000): Promise<UploadResult> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', proxyUrl('/api/upload'));
    xhr.timeout = ms;
    xhr.setRequestHeader('content-type', 'application/json');
    xhr.upload.onprogress = (e) => { if (onProgress && e.lengthComputable) onProgress(Math.min(99, Math.round((e.loaded / Math.max(1, e.total)) * 100))); };
    xhr.onload = () => {
      let data: any = null;
      try { data = JSON.parse(xhr.responseText); } catch {}
      if (xhr.status >= 200 && xhr.status < 300 && data?.ok && data?.url) {
        onProgress?.(100);
        resolve({ url: data.url, path: '', mime: body.mime, size: body.size, provider: data.provider, expiresAt: data.expiresAt });
      } else {
        reject(new MediaError(String(data?.error ?? `Server unggah menolak (HTTP ${xhr.status}).`)));
      }
    };
    xhr.onerror = () => reject(new MediaError('Tidak dapat menghubungi server unggah. Periksa koneksi internet.'));
    xhr.ontimeout = () => reject(new MediaError('Waktu unggah habis. Coba lagi.'));
    xhr.onabort = () => reject(new MediaError('Unggahan dibatalkan.'));
    xhr.send(JSON.stringify(body));
  });
}

/**
 * Upload any blob/URI to an external host (x0.at → uguu → tmpfiles, ImgBB when
 * the server has IMGBB_KEY). Requires a signed-in user — the ID token proves
 * identity to the proxy. `path` is kept for call-site compatibility; only the
 * base name is used as the file name.
 */
export async function uploadMedia(input: Blob | string, path: string, mime: string, onProgress?: ProgressFn): Promise<UploadResult> {
  const fb = firebase();
  if (!fb) throw new MediaError('Firebase belum dikonfigurasi.');
  if (!(fb as any).auth?.currentUser) throw new MediaError('Masuk dulu untuk mengunggah media.');
  const blob = await toBlob(input);
  const size = blob.size;
  if (size <= 0) throw new MediaError('File kosong.');
  if (size > mb(UPLOAD_MAX_MB)) throw new MediaError(`File terlalu besar (${(size / 1024 / 1024).toFixed(1)} MB) — maks ${UPLOAD_MAX_MB} MB di server unggah ini.`);
  const token = await (fb as any).auth.currentUser.getIdToken();
  const name = path.split('/').pop() ?? `file_${Date.now()}`;
  const dataBase64 = await blobToBase64(blob);
  return await xhrUpload({ token, projectId: firebaseConfig.projectId, name, mime, kind: mime.split('/')[0], dataBase64, size }, onProgress);
}

// ---------------- direct client upload (big files, CORS hosts) ----------------

/** XHR multipart POST to a CORS-open host; resolves with the raw response text. */
function xhrForm(url: string, form: FormData, onProgress?: ProgressFn, ms = 600000): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    xhr.timeout = ms;
    xhr.upload.onprogress = (e) => { if (onProgress && e.lengthComputable) onProgress(Math.min(99, Math.round((e.loaded / Math.max(1, e.total)) * 100))); };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) { onProgress?.(100); resolve(String(xhr.responseText ?? '').trim()); }
      else reject(new MediaError(`Host unggah menolak file ini (HTTP ${xhr.status}).`));
    };
    xhr.onerror = () => reject(new MediaError('Tidak dapat menghubungi host unggah. Periksa koneksi internet.'));
    xhr.ontimeout = () => reject(new MediaError('Waktu unggah habis — file terlalu besar atau koneksi lambat. Coba lagi.'));
    xhr.onabort = () => reject(new MediaError('Unggahan dibatalkan.'));
    xhr.send(form);
  });
}

/**
 * Upload a BIG file directly from the client (web browser or APK) to a
 * CORS-open host — no serverless body cap, no API key on the client:
 *   1. litterbox.catbox.moe — 200 MB, 72 h retention   [CORS verified]
 *   2. tmpfiles.org — 100 MB, 1 h retention            [CORS verified]
 * The returned expiresAt is honest and stored with the message.
 */
export async function uploadMediaDirect(input: Blob | string, name: string, mime: string, onProgress?: ProgressFn): Promise<UploadResult> {
  const blob = await toBlob(input);
  if (!blob.size) throw new MediaError('File kosong.');
  // 1) litterbox — 72 h retention (best for videos)
  try {
    const fd = new FormData();
    fd.append('reqtype', 'fileupload');
    fd.append('time', '72h');
    fd.append('fileToUpload', blob, name);
    const url = await xhrForm('https://litterbox.catbox.moe/resources/internals/api.php', fd, onProgress);
    if (/^https:\/\//.test(url)) {
      return { url, path: '', mime, size: blob.size, provider: 'litterbox.catbox.moe', expiresAt: Date.now() + 72 * 3600_000 };
    }
  } catch { /* fall through to tmpfiles */ }
  // 2) tmpfiles — 1 h retention
  const fd2 = new FormData();
  fd2.append('file', blob, name);
  const raw = await xhrForm('https://tmpfiles.org/api/v1/upload', fd2, onProgress);
  let url = raw;
  try { const j = JSON.parse(raw); url = j?.data?.url ?? raw; } catch { /* plain text */ }
  if (!/^https:\/\//.test(url)) throw new MediaError('Host unggah tidak mengembalikan tautan yang valid.');
  return { url: url.replace('tmpfiles.org/', 'tmpfiles.org/dl/'), path: '', mime, size: blob.size, provider: 'tmpfiles.org', expiresAt: Date.now() + 3600_000 };
}

/** External hosts cannot be deleted without account keys — kept as a no-op so message deletion flows stay intact. */
export async function deleteStoragePath(_path: string) { /* no-op: media lives on external hosts */ }

// ---------------- pickers ----------------

function fromAsset(a: ImagePicker.ImagePickerAsset): Picked {
  const isVideo = a.type === 'video';
  return {
    type: isVideo ? 'video' : 'image', uri: a.uri, name: a.fileName ?? undefined,
    size: a.fileSize ?? undefined, mime: a.mimeType ?? undefined,
    duration: a.duration ? a.duration / 1000 : undefined,
    width: a.width, height: a.height,
  };
}

export async function pickGallery(kind: 'images' | 'all' = 'all'): Promise<Picked | null> {
  if (!(await ensurePermission('media'))) return null;
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: kind === 'images' ? ['images'] : ['images', 'videos'],
    quality: 0.9,
    allowsMultipleSelection: false,
    videoMaxDuration: 120,
  });
  if (res.canceled || !res.assets?.[0]) return null;
  return fromAsset(res.assets[0]);
}

export async function pickCamera(): Promise<Picked | null> {
  if (!(await ensurePermission('camera'))) return null;
  const res = await ImagePicker.launchCameraAsync({ mediaTypes: ['images', 'videos'], quality: 0.9 });
  if (res.canceled || !res.assets?.[0]) return null;
  return fromAsset(res.assets[0]);
}

/** Pick a video only (stories / video messages), max ~2 minutes. */
export async function pickVideo(): Promise<Picked | null> {
  if (!(await ensurePermission('media'))) return null;
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['videos'],
    allowsMultipleSelection: false,
    videoMaxDuration: 120,
  });
  if (res.canceled || !res.assets?.[0]) return null;
  return fromAsset(res.assets[0]);
}

export async function pickDocument(audio = false): Promise<Picked | null> {
  const res = await DocumentPicker.getDocumentAsync({ type: audio ? 'audio/*' : '*/*', copyToCacheDirectory: true, multiple: false });
  if (res.canceled || !res.assets?.[0]) return null;
  const a = res.assets[0];
  const mime = a.mimeType ?? '';
  const type: Picked['type'] = audio || mime.startsWith('audio/') ? 'audio' : mime.startsWith('image/') ? 'image' : mime.startsWith('video/') ? 'video' : 'document';
  return { type, uri: a.uri, name: a.name, size: a.size ?? undefined, mime };
}

export async function pickMultipleImages(max = 4): Promise<Picked[]> {
  if (!(await ensurePermission('media'))) return [];
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'], quality: 0.9, allowsMultipleSelection: true, selectionLimit: max,
  });
  if (res.canceled || !res.assets?.length) return [];
  return res.assets.slice(0, max).map(fromAsset);
}

// ---------------- full pipeline ----------------

export type PreparedMedia = {
  type: 'image' | 'video' | 'audio' | 'document';
  uri: string;            // preview URI (object/data URL) for the composer preview
  upload?: (onProgress?: ProgressFn) => Promise<UploadResult>;   // lazy upload
  name?: string; size?: number; duration?: number; mime?: string; width?: number; height?: number;
};

/**
 * Validate + compress + prepare an upload closure for a picked file.
 * The actual upload happens when the user confirms sending (so the composer
 * can show a preview + cancel).
 *
 * Routing: images always through the authenticated proxy (permanent ImgBB).
 * Video/audio/doc ≤ 3.2 MB also use the proxy (long x0.at retention); anything
 * bigger uploads DIRECTLY from the client to a CORS-open host.
 */
export async function prepareForSend(p: Picked, chatId: string): Promise<PreparedMedia> {
  const kind = p.type;
  const size = p.size ?? 0;
  const tooBig = (mbv: number) => size > mb(mbv);
  if (kind === 'image' && tooBig(LIMITS.imageMB)) throw new MediaError(`Foto terlalu besar (maks ${LIMITS.imageMB} MB).`);
  if (kind === 'video' && tooBig(LIMITS.videoMB)) throw new MediaError(`Video terlalu besar (maks ${LIMITS.videoMB} MB).`);
  if (kind === 'audio' && tooBig(LIMITS.audioMB)) throw new MediaError(`Audio terlalu besar (maks ${LIMITS.audioMB} MB).`);
  if (kind === 'document' && tooBig(LIMITS.docMB)) throw new MediaError(`Dokumen terlalu besar (maks ${LIMITS.docMB} MB).`);

  /** server proxy when small (longer retention), direct client upload when big */
  const mediaUpload = (getUri: () => string, name: string, mime: string) =>
    size > 0 && size <= mb(UPLOAD_MAX_MB)
      ? (onProgress?: ProgressFn) => uploadMedia(getUri(), `chats/${chatId}/${Date.now()}_${name}`, mime, onProgress)
      : (onProgress?: ProgressFn) => uploadMediaDirect(getUri(), name, mime, onProgress);

  if (kind === 'image') {
    // animated GIF passes through untouched so the animation survives
    if ((p.mime === 'image/gif' || p.name?.toLowerCase().endsWith('.gif')) && size > 0 && size <= mb(UPLOAD_MAX_MB)) {
      return {
        type: 'image', uri: p.uri, name: p.name ?? `gif_${Date.now()}.gif`, size, mime: 'image/gif', width: p.width, height: p.height,
        upload: (onProgress?: ProgressFn) => uploadMedia(p.uri, `chats/${chatId}/${Date.now()}_${p.name ?? 'anim.gif'}`, 'image/gif', onProgress as ProgressFn),
      };
    }
    const src = p.uri;
    const { blob, mime, width, height } = await compressImage(src);
    const name = (p.name ?? 'photo').replace(/\.[^.]+$/, '') + '.' + (mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg');
    return {
      type: 'image', uri: URL.createObjectURL ? (Platform.OS === 'web' ? URL.createObjectURL(blob) : src) : src,
      name, size: blob.size, mime, width, height,
      upload: (onProgress?: ProgressFn) => uploadMedia(blob, `chats/${chatId}/${Date.now()}_${name}`, mime, onProgress as ProgressFn),
    };
  }
  if (kind === 'video') {
    const name = (p.name ?? 'video').replace(/[^\w.-]/g, '_');
    const mime = p.mime ?? 'video/mp4';
    return {
      type: 'video', uri: p.uri, name, size: p.size, mime, duration: p.duration,
      upload: mediaUpload(() => p.uri, name, mime),
    };
  }
  if (kind === 'audio') {
    const name = (p.name ?? 'audio').replace(/[^\w.-]/g, '_');
    const mime = p.mime ?? 'audio/mp4';
    return {
      type: 'audio', uri: p.uri, name, size: p.size, mime, duration: p.duration,
      upload: mediaUpload(() => p.uri, name, mime),
    };
  }
  const name = (p.name ?? 'document').replace(/[^\w.-]/g, '_');
  const mime = p.mime ?? 'application/octet-stream';
  return {
    type: 'document', uri: p.uri, name, size: p.size, mime,
    upload: mediaUpload(() => p.uri, name, mime),
  };
}
