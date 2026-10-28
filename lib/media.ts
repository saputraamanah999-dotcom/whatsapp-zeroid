/**
 * Media pipeline: pick → validate → compress → upload (progress) → metadata.
 *
 * - Images are resized (max 1600px) and re-encoded (WebP when supported, else
 *   JPEG) via canvas on web / ImageManipulator on native. PNG alpha is kept.
 * - Uploads go to Firebase Storage with resumable tasks and progress callbacks.
 * - Every upload returns { url, path, mime, size } so the message document can
 *   reference the file without storing binary data in Firestore.
 * - No silent local fallback: when Firebase is not configured uploads fail
 *   loudly (the app shows a configuration screen anyway).
 */
import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import { firebase } from './firebase';
import { ensurePermission } from './permissions';

export type Picked = { type: 'image' | 'video' | 'audio' | 'document'; uri: string; name?: string; size?: number; duration?: number; mime?: string; width?: number; height?: number };

export const LIMITS = {
  imageMB: 15,
  videoMB: 60,
  audioMB: 25,
  docMB: 25,
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

// ---------------- upload ----------------

export type UploadResult = { url: string; path: string; mime: string; size: number };
export type ProgressFn = (pct: number) => void;

export async function uploadToStorage(input: Blob | string, path: string, mime: string, onProgress?: ProgressFn): Promise<UploadResult> {
  const fb = firebase();
  if (!fb) throw new MediaError('Firebase belum dikonfigurasi.');
  let blob: Blob;
  let size: number;
  if (Platform.OS === 'web') {
    blob = typeof input === 'string' ? await (await fetch(input)).blob() : input;
    size = blob.size;
  } else {
    const r = await fetch(typeof input === 'string' ? input : (input as any).uri);
    blob = await r.blob();
    size = blob.size;
  }
  if (size <= 0) throw new MediaError('File kosong.');
  const storageRef = ref(fb.storage, path);
  await new Promise<void>((resolve, reject) => {
    const task = uploadBytesResumable(storageRef, blob as any, { contentType: mime });
    task.on('state_changed',
      (s) => { if (onProgress) onProgress(Math.round((s.bytesTransferred / Math.max(1, s.totalBytes)) * 100)); },
      (err) => reject(new MediaError(errMessage(err))),
      async () => resolve()
    );
  });
  const url = await getDownloadURL(storageRef);
  return { url, path, mime, size };
}

function errMessage(e: any): string {
  const c = String(e?.code ?? '');
  if (c.includes('unauthorized') || c.includes('unauthenticated')) return 'Tidak diizinkan mengunggah ke lokasi ini (periksa Storage rules).';
  if (c.includes('canceled')) return 'Unggahan dibatalkan.';
  if (c.includes('quota')) return 'Kuota penyimpanan penuh.';
  return e?.message ?? 'Unggahan gagal.';
}

export async function deleteStoragePath(path: string) {
  const fb = firebase();
  if (!fb || !path) return;
  try { await deleteObject(ref(fb.storage, path)); } catch {}
}

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
 */
export async function prepareForSend(p: Picked, chatId: string): Promise<PreparedMedia> {
  const kind = p.type;
  const size = p.size ?? 0;
  const tooBig = (mbv: number) => size > mb(mbv);
  if (kind === 'image' && tooBig(LIMITS.imageMB)) throw new MediaError(`Foto terlalu besar (maks ${LIMITS.imageMB} MB).`);
  if (kind === 'video' && tooBig(LIMITS.videoMB)) throw new MediaError(`Video terlalu besar (maks ${LIMITS.videoMB} MB).`);
  if (kind === 'audio' && tooBig(LIMITS.audioMB)) throw new MediaError(`Audio terlalu besar (maks ${LIMITS.audioMB} MB).`);
  if (kind === 'document' && tooBig(LIMITS.docMB)) throw new MediaError(`Dokumen terlalu besar (maks ${LIMITS.docMB} MB).`);

  if (kind === 'image') {
    const src = p.uri;
    const { blob, mime, width, height } = await compressImage(src);
    const name = (p.name ?? 'photo').replace(/\.[^.]+$/, '') + '.' + (mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg');
    return {
      type: 'image', uri: URL.createObjectURL ? (Platform.OS === 'web' ? URL.createObjectURL(blob) : src) : src,
      name, size: blob.size, mime, width, height,
      upload: (onProgress?: ProgressFn) => uploadToStorage(blob, `chats/${chatId}/${Date.now()}_${name}`, mime, onProgress as ProgressFn),
    };
  }
  if (kind === 'video') {
    const name = (p.name ?? 'video').replace(/[^\w.-]/g, '_');
    const mime = p.mime ?? 'video/mp4';
    return {
      type: 'video', uri: p.uri, name, size: p.size, mime, duration: p.duration,
      upload: (onProgress?: ProgressFn) => uploadToStorage(p.uri, `chats/${chatId}/${Date.now()}_${name}`, mime, onProgress as ProgressFn),
    };
  }
  if (kind === 'audio') {
    const name = (p.name ?? 'audio').replace(/[^\w.-]/g, '_');
    const mime = p.mime ?? 'audio/m4a';
    return {
      type: 'audio', uri: p.uri, name, size: p.size, mime, duration: p.duration,
      upload: (onProgress?: ProgressFn) => uploadToStorage(p.uri, `chats/${chatId}/${Date.now()}_${name}`, mime, onProgress as ProgressFn),
    };
  }
  const name = (p.name ?? 'document').replace(/[^\w.-]/g, '_');
  const mime = p.mime ?? 'application/octet-stream';
  return {
    type: 'document', uri: p.uri, name, size: p.size, mime,
    upload: (onProgress?: ProgressFn) => uploadToStorage(p.uri, `chats/${chatId}/${Date.now()}_${name}`, mime, onProgress as ProgressFn),
  };
}
