// Zamanlanmış/arka plan iş işleyicileri. Modüller kendi işleyicilerini buraya ekler.
import { ownerSql } from "./db.ts";
import { decrypt } from "./lib/crypto.ts";
import { wa, inWindow } from "./services/whatsapp.ts";
import { dispatchWebhook } from "./services/webhooks.ts";
import { deliver } from "./services/mailer.ts";
export type JobHandler = (payload: Record<string, unknown>, clinicId: string | null) => Promise<void>;
export const handlers: Record<string, JobHandler> = {
  "mail.send": async (p, clinicId) => { await deliver(p as never, clinicId); },
  "campaign.send": async (p) => { const { sendCampaignBatch } = await import("./services/campaigns.ts"); await sendCampaignBatch(String(p.id)); },
  "capi.send": async (p) => { const { sendConversion } = await import("./services/ads.ts"); await sendConversion(Number(p.id)); },
  "ads.sync": async (_p, clinicId) => { const { syncMetaSpend } = await import("./services/ads.ts"); await syncMetaSpend(clinicId!, 3); },
  "stt.transcribe": async (p) => { const { transcribeMessage } = await import("./services/stt.ts"); await transcribeMessage(Number(p.messageId)); },
  "ai.coach": async (p, clinicId) => { const { coachConversation } = await import("./services/ai/coach.ts"); await coachConversation(clinicId!, String(p.conversationId)); },
  "ai.reply": async (p, clinicId) => { const { aiReplyJob } = await import("./services/ai/agent.ts"); await aiReplyJob(clinicId!, String(p.conversationId)); },
  // takip dizisi WhatsApp adımı (dış API çağrısı işlemden ayrı, yeniden denenebilir)
  "sequence.wa": async (p, clinicId) => {
    const { sendInConversation } = await import("./routes/inbox.ts");
    const m = p.kind === "text" ? { kind: "text" as const, body: String(p.body), idem: String(p.idem) } : { kind: "template" as const, template: p.template as never, idem: String(p.idem) };
    await sendInConversation({ clinicId: clinicId!, userId: null as unknown as string }, String(p.conversationId), m);
    if (p.ai) { const { ownerSql } = await import("./db.ts"); await ownerSql`update messages set ai = true where conversation_id = ${String(p.conversationId)} and idempotency_key = ${String(p.idem)}`; }
  },
  "meta.leadgen": async (p) => { const { fetchMetaLead } = await import("./routes/integrations.ts"); await fetchMetaLead(String(p.integrationId), String(p.leadgenId)); },
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
