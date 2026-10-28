import { addDoc, collection } from 'firebase/firestore';
import { firebase } from './firebase';

/**
 * Sends an email through Firebase using the official "Trigger Email from Firestore"
 * extension (firebase/firestore-send-email) configured with Gmail SMTP on project
 * projekwhattsaf. Writing a doc into `mail` delivers it to the recipient's Gmail inbox.
 */
export async function sendMail(to: string, subject: string, html: string): Promise<'firebase' | 'unavailable'> {
  const fb = firebase();
  if (!fb) return 'unavailable';
  try {
    await addDoc(collection(fb.db, 'mail'), { to, message: { subject, html }, createdAt: Date.now() });
    return 'firebase';
  } catch (e) {
    console.warn('sendMail', e);
    return 'unavailable';
  }
}

export function otpEmailHtml(name: string, code: string) {
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:420px;margin:auto;padding:24px;border-radius:20px;background:#EEF1F6">
  <h2 style="color:#1E6BFF;margin:0 0 8px">Zeroid-whatsapp</h2>
  <p>Halo ${name},</p>
  <p>Kode OTP verifikasi akun kamu:</p>
  <p style="font-size:32px;font-weight:800;letter-spacing:8px;color:#1B2433">${code}</p>
  <p style="color:#5F6B7D">Berlaku 10 menit. Jangan bagikan kode ini kepada siapa pun.</p>
</div>`;
}
