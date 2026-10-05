// E-posta: Resend HTTP API (RESEND_API_KEY) — yoksa geliştirmede loglanır. Gönderimler iş kuyruğundan yapılır (yeniden deneme).
import { config } from "../config.ts";
import { ownerSql } from "../db.ts";
import { getSecret } from "./secrets.ts";

export interface Mail { to: string; subject: string; text: string; html?: string; replyTo?: string; fromName?: string }
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
export const textToHtml = (t: string, color = "#0E7C86") => `<div style="font-family:system-ui,Segoe UI,Arial,sans-serif;font-size:15px;line-height:1.55;color:#1B2730;max-width:560px">${esc(t).replace(/(https?:\/\/[^\s<]+)/g, `<a href="$1" style="color:${color};font-weight:600">$1</a>`).replace(/\n/g, "<br>")}</div>`;

export async function deliver(m: Mail, clinicId?: string | null): Promise<void> {
  // klinik kendi Resend anahtarını ve gönderen adresini tanımladıysa o kullanılır
  const sec = clinicId ? await getSecret(clinicId, "resend") : null;
  const key = sec?.value.key ?? process.env.RESEND_API_KEY;
  if (!key) { console.log(`[mail] → ${m.to} | ${m.subject}\n${m.text}\n`); return; }
  const addr = (sec?.meta.from as string) || (config.mailFrom.match(/<(.+)>/)?.[1] ?? config.mailFrom);
  const from = m.fromName ? `${m.fromName.replace(/[<>"]/g, "")} <${addr}>` : sec?.meta.from ? addr : config.mailFrom;
  const r = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [m.to], subject: m.subject, text: m.text, html: m.html ?? textToHtml(m.text), reply_to: m.replyTo }) });
  if (!r.ok) throw new Error(`Resend ${r.status}: ${(await r.text()).slice(0, 300)}`);
}
/** Kuyruğa al (worker gönderir); clinicId denetim için */
export async function sendMail(to: string, subject: string, text: string, opts: { clinicId?: string | null; replyTo?: string; fromName?: string } = {}) {
  if (!process.env.RESEND_API_KEY && !(opts.clinicId && (await getSecret(opts.clinicId, "resend")))) return deliver({ to, subject, text });
  await ownerSql`insert into jobs (clinic_id, type, payload) values (${opts.clinicId ?? null}, 'mail.send', ${ownerSql.json({ to, subject, text, replyTo: opts.replyTo, fromName: opts.fromName } as never)})`;
}
