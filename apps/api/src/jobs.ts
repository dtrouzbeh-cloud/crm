// Zamanlanmış/arka plan iş işleyicileri. Modüller kendi işleyicilerini buraya ekler.
import { ownerSql } from "./db.ts";
import { decrypt } from "./lib/crypto.ts";
import { wa, inWindow } from "./services/whatsapp.ts";
import { dispatchWebhook } from "./services/webhooks.ts";
export type JobHandler = (payload: Record<string, unknown>, clinicId: string | null) => Promise<void>;
export const handlers: Record<string, JobHandler> = {
  "webhook.dispatch": async (p, clinicId) => { await dispatchWebhook(Number(p.eventId), clinicId!); },
  "wa.autoreply": async (p) => {
    const [cv] = await ownerSql`select cv.*, a.access_token_enc, a.external_id as phone_id, a.config from conversations cv join channel_accounts a on a.id = cv.account_id where cv.id = ${p.conversationId as string}`;
    if (!cv || !inWindow(cv.lastInboundAt)) return;
    const ar = cv.config?.autoReply ?? {}; if (!ar.enabled || !ar.text) return;
    if (ar.outsideHoursOnly) { const h = new Date().getUTCHours() + (ar.utcOffset ?? 3); const hh = (h + 24) % 24; if (hh >= (ar.from ?? 9) && hh < (ar.to ?? 19)) return; }
    const r = await wa.sendText(decrypt(cv.accessTokenEnc), cv.phoneId, cv.contactId, ar.text);
    await ownerSql`insert into messages (clinic_id, conversation_id, direction, type, body, external_id, status) values (${cv.clinicId}, ${cv.id}, 'out', 'text', ${ar.text}, ${r.messages?.[0]?.id ?? null}, 'sent')`;
  },
};
