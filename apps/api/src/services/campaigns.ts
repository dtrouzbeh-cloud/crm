// Toplu kampanya motoru: hedef kitle sorgusu, alıcı listesi, hız sınırlı gönderim (pazarlama izni zorunlu), sonuç istatistikleri
import { createHmac } from "node:crypto";
import { ownerSql, type Tx } from "../db.ts";
import { config } from "../config.ts";
import { contactAllowed } from "./consent.ts";
import { sendMail } from "./mailer.ts";

export type Audience = { stages?: string[]; sources?: string[]; countries?: string[]; languages?: string[]; tags?: string[]; partnerId?: string; createdFrom?: string; createdTo?: string;
  inactiveDays?: number; hasDeal?: boolean; cf?: Record<string, unknown>; pipeline?: string; pipelineStage?: string; ownerId?: string };

/** Hedef kitle → lead kimlikleri (arşivliler hariç) */
export function audienceWhere(tx: Tx, a: Audience) {
  return tx`l.archived_at is null
    ${a.stages?.length ? tx`and l.stage = any(${a.stages})` : tx``} ${a.sources?.length ? tx`and l.source = any(${a.sources})` : tx``}
    ${a.countries?.length ? tx`and p.country = any(${a.countries})` : tx``} ${a.languages?.length ? tx`and p.language = any(${a.languages})` : tx``}
    ${a.tags?.length ? tx`and l.tags && ${a.tags}` : tx``} ${a.partnerId ? tx`and l.partner_id = ${a.partnerId}` : tx``} ${a.ownerId ? tx`and l.owner_id = ${a.ownerId}` : tx``}
    ${a.createdFrom ? tx`and l.created_at >= ${a.createdFrom}::date` : tx``} ${a.createdTo ? tx`and l.created_at < ${a.createdTo}::date + 1` : tx``}
    ${a.inactiveDays ? tx`and l.last_activity_at < now() - make_interval(days => ${a.inactiveDays})` : tx``}
    ${a.hasDeal === true ? tx`and exists (select 1 from deals d where d.lead_id = l.id)` : a.hasDeal === false ? tx`and not exists (select 1 from deals d where d.lead_id = l.id)` : tx``}
    ${a.cf && Object.keys(a.cf).length ? tx`and l.custom @> ${tx.json(a.cf as never)}` : tx``}
    ${a.pipeline ? tx`and exists (select 1 from pipeline_items i join pipelines pp on pp.id = i.pipeline_id join pipeline_stages s on s.id = i.stage_id where i.lead_id = l.id and i.status = 'open' and pp.kind = ${a.pipeline} ${a.pipelineStage ? tx`and s.key = ${a.pipelineStage}` : tx``})` : tx``}`;
}

/** Kitle önizleme: toplam, kanal + pazarlama iznine göre ulaşılabilir sayı, örnek */
export async function previewAudience(tx: Tx, clinicId: string, a: Audience, channel: "whatsapp" | "email") {
  const rows = await tx`select l.id, l.patient_id, p.full_name, p.phone, p.email, p.marketing_consent, p.country from leads l join patients p on p.id = l.patient_id where ${audienceWhere(tx, a)} limit 20000`;
  let reachable = 0; const reasons: Record<string, number> = {};
  for (const r of rows) {
    const noAddr = channel === "email" ? !r.email : !r.phone;
    if (noAddr) { reasons.no_address = (reasons.no_address ?? 0) + 1; continue; }
    const ok = await contactAllowed(tx, clinicId, r.patientId as string, channel, "marketing");
    if (ok.ok) reachable++; else reasons[ok.reason!] = (reasons[ok.reason!] ?? 0) + 1;
  }
  return { total: rows.length, reachable, reasons, sample: rows.slice(0, 8).map((r) => ({ id: r.id, name: r.fullName, country: r.country })) };
}

export const unsubToken = (leadId: string) => createHmac("sha256", config.sessionSecret).update("unsub:" + leadId).digest("base64url").slice(0, 24);
export const unsubUrl = (leadId: string) => `${config.appUrl}/api/public/unsub/${leadId}/${unsubToken(leadId)}`;

/** Başlat: alıcı listesini sabitle (A/B rastgele), işi kuyruğa al */
export async function launchCampaign(tx: Tx, clinicId: string, id: string) {
  const [c] = await tx`select * from campaigns where id = ${id} for update`; if (!c) throw new Error("not_found");
  const n = await tx`insert into campaign_recipients (clinic_id, campaign_id, lead_id, variant)
    select ${clinicId}, ${id}, l.id, case when ${!!c.variantB} and random() < 0.5 then 'B' else 'A' end from leads l join patients p on p.id = l.patient_id where ${audienceWhere(tx, c.audience as Audience)}
    on conflict do nothing returning id`;
  await tx`update campaigns set status = 'sending', started_at = now(), stats = ${tx.json({ recipients: n.length } as never)} where id = ${id}`;
  await tx`insert into jobs (clinic_id, type, payload, run_at, dedupe_key) values (${clinicId}, 'campaign.send', ${tx.json({ id } as never)}, coalesce(${c.scheduleAt}, now()), ${"camp:" + id}) on conflict do nothing`;
  return n.length;
}

const pick = (o: any, lang: string) => (typeof o === "string" ? o : o?.[lang] ?? o?.en ?? o?.tr ?? Object.values(o ?? {})[0] ?? "");
const fill = (s: string, v: Record<string, string>) => s.replace(/\{(\w+)\}/g, (m, k) => v[k] ?? m);

/** İş: 40 alıcılık partiler; bitmediyse 1 dk sonra kendini yeniden kuyruğa alır (WhatsApp/e-posta hız sınırları) */
export async function sendCampaignBatch(id: string): Promise<{ done: boolean; sent: number }> {
  const [c] = await ownerSql`select c.*, cl.name as clinic_name, cl.email as clinic_email from campaigns c join clinics cl on cl.id = c.clinic_id where c.id = ${id}`;
  if (!c || c.status !== "sending") return { done: true, sent: 0 };
  const batch = await ownerSql`select r.id, r.lead_id, r.variant, l.patient_id, p.full_name, p.phone, p.email, p.language, p.wa_id from campaign_recipients r join leads l on l.id = r.lead_id join patients p on p.id = l.patient_id
    where r.campaign_id = ${id} and r.status = 'pending' order by r.id limit 40`;
  let sent = 0;
  for (const r of batch) {
    const mark = (status: string, reason?: string) => ownerSql`update campaign_recipients set status = ${status}, reason = ${reason ?? null}, sent_at = ${status === "sent" ? new Date() : null} where id = ${r.id}`;
    try {
      const ok = await ownerSql.begin(async (tx) => { await tx`select set_config('app.clinic_id', ${c.clinicId}, true)`; return contactAllowed(tx as unknown as Tx, c.clinicId as string, r.patientId as string, c.channel as "whatsapp" | "email", "marketing"); });
      if (!ok.ok) { await mark("skipped", ok.reason); continue; }
      const content = (r.variant === "B" && c.variantB ? c.variantB : c.content) as any;
      const lang = (r.language as string) ?? "en"; const vars = { firstName: String(r.fullName).split(" ")[0]!, name: String(r.fullName), clinic: c.clinicName as string };
      if (c.channel === "email") {
        if (!r.email) { await mark("skipped", "no_email"); continue; }
        await sendMail(r.email as string, fill(pick(content.subject, lang), vars), `${fill(pick(content.body, lang), vars)}\n\n—\n${lang === "tr" ? "Abonelikten çık" : lang === "de" ? "Abmelden" : "Unsubscribe"}: ${unsubUrl(r.leadId as string)}`, { clinicId: c.clinicId as string, fromName: c.clinicName as string, replyTo: (c.clinicEmail as string) ?? undefined });
      } else {
        const digits = String(r.waId ?? r.phone ?? "").replace(/\D/g, ""); if (digits.length < 8 || !content.template?.name) { await mark("skipped", digits.length < 8 ? "no_phone" : "no_template"); continue; }
        // konuşmayı bul/oluştur ve şablonu iş kuyruğuna bırak (sequence.wa ile aynı yol)
        const conv = await ownerSql.begin(async (tx) => {
          await tx`select set_config('app.clinic_id', ${c.clinicId}, true)`;
          const [cv] = await tx`select id from conversations where clinic_id = ${c.clinicId} and (lead_id = ${r.leadId} or patient_id = ${r.patientId}) and channel = 'whatsapp' limit 1`; if (cv) return cv.id as string;
          const [acc] = await tx`select id from channel_accounts where clinic_id = ${c.clinicId} and channel = 'whatsapp' and status = 'connected' limit 1`; if (!acc) return null;
          const [n] = await tx`insert into conversations (clinic_id, account_id, channel, contact_id, contact_name, patient_id, lead_id) values (${c.clinicId}, ${acc.id}, 'whatsapp', ${digits}, ${r.fullName}, ${r.patientId}, ${r.leadId})
            on conflict (account_id, contact_id) do update set lead_id = coalesce(conversations.lead_id, excluded.lead_id) returning id`; return n!.id as string; });
        if (!conv) { await mark("skipped", "no_whatsapp"); continue; }
        await ownerSql`insert into jobs (clinic_id, type, payload, dedupe_key) values (${c.clinicId}, 'sequence.wa', ${ownerSql.json({ conversationId: conv, kind: "template", template: { name: content.template.name, language: content.template.language ?? lang, params: (content.template.params ?? []).map((p: string) => fill(p, vars)) }, idem: `camp:${id}:${r.leadId}` } as never)}, ${"camp:" + id + ":" + r.leadId}) on conflict do nothing`;
      }
      await mark("sent"); sent++;
    } catch (e) { await mark("failed", String((e as Error).message).slice(0, 200)); }
  }
  const [{ left }] = await ownerSql`select count(*)::int as left from campaign_recipients where campaign_id = ${id} and status = 'pending'` as unknown as [{ left: number }];
  if (!left) { await ownerSql`update campaigns set status = 'sent', finished_at = now() where id = ${id}`; return { done: true, sent }; }
  await ownerSql`insert into jobs (clinic_id, type, payload, run_at) values (${c.clinicId}, 'campaign.send', ${ownerSql.json({ id } as never)}, now() + interval '1 minute')`;
  return { done: false, sent };
}

/** Sonuçlar: gönderildi/atlandı, 7 gün içinde cevap, sonradan deal (dönüşüm), varyanta göre */
export async function campaignStats(tx: Tx, id: string) {
  return tx`select r.variant, count(*)::int as recipients, count(*) filter (where r.status = 'sent')::int as sent, count(*) filter (where r.status = 'skipped')::int as skipped, count(*) filter (where r.status = 'failed')::int as failed,
      count(*) filter (where r.status = 'sent' and exists (select 1 from messages m join conversations cv on cv.id = m.conversation_id where cv.lead_id = r.lead_id and m.direction = 'in' and m.at between r.sent_at and r.sent_at + interval '7 days'))::int as replied,
      count(*) filter (where r.status = 'sent' and exists (select 1 from deals d where d.lead_id = r.lead_id and d.created_at > r.sent_at))::int as converted
    from campaign_recipients r where r.campaign_id = ${id} group by r.variant order by r.variant`;
}
