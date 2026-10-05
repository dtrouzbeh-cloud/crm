// WhatsApp Business Platform (Cloud API) istemcisi — SDK yok, doğrudan Graph API
import { createHmac, timingSafeEqual } from "node:crypto";
import { meta } from "../config.ts";

export class WaError extends Error { code?: number; constructor(m: string, code?: number) { super(m); this.code = code; } }
async function graph(token: string, path: string, init: RequestInit = {}) {
  const r = await fetch(`${meta.graph}${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers ?? {}) } });
  const j = await r.json().catch(() => ({})) as any;
  if (!r.ok || j.error) throw new WaError(j.error?.error_user_msg ?? j.error?.message ?? `Graph ${r.status}`, j.error?.code);
  return j;
}
export const wa = {
  sendText: (token: string, phoneId: string, to: string, body: string, previewUrl = true) =>
    graph(token, `/${phoneId}/messages`, { method: "POST", body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to, type: "text", text: { body, preview_url: previewUrl } }) }),
  sendTemplate: (token: string, phoneId: string, to: string, name: string, language: string, params: string[] = [], buttonUrlParam?: string) =>
    graph(token, `/${phoneId}/messages`, { method: "POST", body: JSON.stringify({ messaging_product: "whatsapp", to, type: "template", template: { name, language: { code: language },
      components: [...(params.length ? [{ type: "body", parameters: params.map((p) => ({ type: "text", text: p })) }] : []), ...(buttonUrlParam ? [{ type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: buttonUrlParam }] }] : [])] } }) }),
  sendMedia: (token: string, phoneId: string, to: string, kind: "image" | "document" | "video" | "audio", link: string, caption?: string, filename?: string) =>
    graph(token, `/${phoneId}/messages`, { method: "POST", body: JSON.stringify({ messaging_product: "whatsapp", to, type: kind, [kind]: { link, ...(caption ? { caption } : {}), ...(filename ? { filename } : {}) } }) }),
  markRead: (token: string, phoneId: string, messageId: string) => graph(token, `/${phoneId}/messages`, { method: "POST", body: JSON.stringify({ messaging_product: "whatsapp", status: "read", message_id: messageId }) }),
  media: (token: string, mediaId: string) => graph(token, `/${mediaId}`),
  templates: (token: string, wabaId: string) => graph(token, `/${wabaId}/message_templates?limit=200`),
  createTemplate: (token: string, wabaId: string, t: { name: string; language: string; category: string; components: unknown[] }) => graph(token, `/${wabaId}/message_templates`, { method: "POST", body: JSON.stringify(t) }),
  phoneInfo: (token: string, phoneId: string) => graph(token, `/${phoneId}?fields=display_phone_number,verified_name,quality_rating,code_verification_status,platform_type`),
  subscribeApp: (token: string, wabaId: string) => graph(token, `/${wabaId}/subscribed_apps`, { method: "POST" }),
  register: (token: string, phoneId: string, pin: string) => graph(token, `/${phoneId}/register`, { method: "POST", body: JSON.stringify({ messaging_product: "whatsapp", pin }) }),
  /** Embedded Signup: kod → işletme token'ı */
  async exchangeCode(code: string): Promise<string> {
    const r = await fetch(`${meta.graph}/oauth/access_token?client_id=${meta.appId}&client_secret=${meta.appSecret}&code=${encodeURIComponent(code)}`);
    const j = await r.json() as any; if (!r.ok || !j.access_token) throw new WaError(j.error?.message ?? "Token alınamadı"); return j.access_token;
  },
};
/** X-Hub-Signature-256 doğrulaması (Meta webhook'ları) */
export function verifyMetaSignature(raw: string, header: string | undefined, secret = meta.appSecret): boolean {
  if (!header?.startsWith("sha256=") || !secret) return false;
  const exp = Buffer.from("sha256=" + createHmac("sha256", secret).update(raw).digest("hex")), got = Buffer.from(header);
  return exp.length === got.length && timingSafeEqual(exp, got);
}
export interface WaInbound { phoneNumberId: string; from: string; name?: string; id: string; type: string; body?: string; media?: { id: string; mime?: string; caption?: string; filename?: string }; ts: number; referral?: any }
export interface WaStatus { phoneNumberId: string; id: string; status: string; error?: string; ts: number }
export function parseWebhook(body: any): { messages: WaInbound[]; statuses: WaStatus[] } {
  const messages: WaInbound[] = [], statuses: WaStatus[] = [];
  for (const e of body?.entry ?? []) for (const ch of e.changes ?? []) {
    const v = ch.value ?? {}; const pid = v.metadata?.phone_number_id; if (!pid) continue;
    const names = Object.fromEntries((v.contacts ?? []).map((c: any) => [c.wa_id, c.profile?.name]));
    // coexistence: işletme uygulamasından gönderilen mesajlar "smb_message_echoes" ile gelir
    for (const m of [...(v.messages ?? []), ...((v.message_echoes ?? []).map((x: any) => ({ ...x, _echo: true })))]) {
      const media = m.image ?? m.document ?? m.audio ?? m.video ?? m.sticker;
      messages.push({ phoneNumberId: pid, from: m._echo ? m.to : m.from, name: names[m.from], id: m.id, type: m._echo ? "echo_" + m.type : m.type,
        body: m.text?.body ?? m.button?.text ?? m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title ?? media?.caption ?? (m.location ? `📍 ${m.location.latitude},${m.location.longitude}` : m.reaction ? m.reaction.emoji : undefined),
        media: media ? { id: media.id, mime: media.mime_type, caption: media.caption, filename: media.filename } : undefined, ts: Number(m.timestamp) * 1000, referral: m.referral });
    }
    for (const s of v.statuses ?? []) statuses.push({ phoneNumberId: pid, id: s.id, status: s.status, error: s.errors?.[0]?.title, ts: Number(s.timestamp) * 1000 });
  }
  return { messages, statuses };
}
export const inWindow = (lastInbound: Date | string | null) => !!lastInbound && Date.now() - new Date(lastInbound).getTime() < 24 * 3600 * 1000;
