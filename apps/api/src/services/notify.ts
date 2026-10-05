// Kullanıcı bildirimi: tercihlere uyar (uygulama içi / e-posta). API ve işçi aynı yolu kullanır.
import { ownerSql } from "../db.ts";
import { sendMail } from "./mailer.ts";
import { config } from "../config.ts";

export type NotifyPrefs = { inApp?: Record<string, boolean>; email?: Record<string, boolean>; browser?: boolean; sound?: boolean; digest?: boolean; lastDigest?: string };
// varsayılan: hepsi uygulama içi açık; e-posta yalnız kritik olaylar için açık
export const EMAIL_DEFAULT: Record<string, boolean> = { "quote.accepted": true, "payment.succeeded": false, "lead.assigned": false, "task.assigned": false, "quote.viewed": false, "quote.changes": true, "wa.message": false, "form.completed": false, "deal.amended": true };
export const NOTIFY_TYPES = Object.keys(EMAIL_DEFAULT);

export async function notifyUser(clinicId: string, userId: string, type: string, title: string, link: string | null, body?: string | null) {
  const [u] = await ownerSql`select u.email, u.name, u.notify_prefs, m.active from users u join memberships m on m.user_id = u.id and m.clinic_id = ${clinicId} where u.id = ${userId}`;
  if (!u || u.active === false) return;
  const p = (u.notifyPrefs ?? {}) as NotifyPrefs;
  if (p.inApp?.[type] !== false) await ownerSql`insert into notifications (clinic_id, user_id, type, title, body, link) values (${clinicId}, ${userId}, ${type}, ${title}, ${body ?? null}, ${link})`;
  if ((p.email?.[type] ?? EMAIL_DEFAULT[type]) && u.email) {
    const [cl] = await ownerSql`select name from clinics where id = ${clinicId}`;
    await sendMail(u.email as string, `${cl?.name ?? "DentaFlow"}: ${title}`, `${title}${body ? "\n\n" + body : ""}\n\n${link ? config.appUrl + link : config.appUrl}\n\n— DentaFlow (bildirim tercihlerinizi Profil sayfasından değiştirebilirsiniz)`, { clinicId, fromName: (cl?.name as string) ?? "DentaFlow" });
  }
}
