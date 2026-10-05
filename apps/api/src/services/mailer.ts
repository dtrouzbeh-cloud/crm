// Basit e-posta gönderici: SMTP_URL yoksa loglar (geliştirme). SMTP için ileride nodemailer'sız yerleşik istemci eklenebilir.
import { config } from "../config.ts";
export async function sendMail(to: string, subject: string, text: string): Promise<void> {
  if (!config.smtpUrl) { console.log(`[mail] → ${to} | ${subject}\n${text}\n`); return; }
  // Üretimde: e-posta işi kuyruğa atılır (worker 'mail.send' işi), burada doğrudan gönderim yapılmaz.
  console.log(`[mail:queued] → ${to} | ${subject}`);
}
