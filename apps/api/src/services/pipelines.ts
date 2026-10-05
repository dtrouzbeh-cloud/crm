// Pipeline çekirdeği: varsayılan pipeline'lar, kayıt ekleme, otomatik ekleme kancaları, SLA denetimi
import type { Tx } from "../db.ts";
import { ownerSql } from "../db.ts";
import { notifyUser } from "./notify.ts";

type St = { key: string; name?: Record<string, string>; color: string; p: number; sla?: number; won?: boolean; lost?: boolean };
const N = (tr: string, en: string, de: string, ar: string) => ({ tr, en, de, ar, default: en });

// satış aşamaları leads.stage anahtarlarıdır; adları arayüz çevirisinden gelir (name boş)
const SALES: St[] = [
  { key: "new", color: "#0EA5E9", p: 5, sla: 15 }, { key: "contacted", color: "#38BDF8", p: 10, sla: 2880 }, { key: "interested", color: "#6366F1", p: 20, sla: 1440 },
  { key: "awaiting_info", color: "#A855F7", p: 25, sla: 4320 }, { key: "in_diagnosis", color: "#F59E0B", p: 35, sla: 1440 }, { key: "plan_ready", color: "#F97316", p: 45, sla: 240 },
  { key: "quote_sent", color: "#EAB308", p: 55, sla: 2880 }, { key: "negotiation", color: "#84CC16", p: 70, sla: 1440 }, { key: "won", color: "#10B981", p: 100, won: true }, { key: "lost", color: "#EF4444", p: 0, lost: true },
];
const DEFAULTS: { kind: string; name: Record<string, string>; color: string; settings: Record<string, unknown>; stages: St[] }[] = [
  { kind: "sales", name: N("Satış", "Sales", "Vertrieb", "المبيعات"), color: "#0E7C86", settings: {}, stages: SALES },
  { kind: "nurture", name: N("Yeniden kazanım", "Re-engagement", "Reaktivierung", "إعادة الاستقطاب"), color: "#6366F1", settings: { autoAdd: "lead.lost" }, stages: [
    { key: "cold", name: N("Soğudu", "Gone cold", "Abgekühlt", "فتر الاهتمام"), color: "#94A3B8", p: 5, sla: 10080 },
    { key: "touch1", name: N("1. temas", "1st touch", "1. Kontakt", "التواصل الأول"), color: "#818CF8", p: 10, sla: 10080 },
    { key: "touch2", name: N("2. temas", "2nd touch", "2. Kontakt", "التواصل الثاني"), color: "#6366F1", p: 15, sla: 20160 },
    { key: "reengaged", name: N("Yeniden ilgilendi → satışa", "Re-engaged → sales", "Wieder interessiert → Vertrieb", "عاد للاهتمام ← المبيعات"), color: "#10B981", p: 100, won: true },
    { key: "gave_up", name: N("Vazgeçti", "Gave up", "Aufgegeben", "تخلى"), color: "#EF4444", p: 0, lost: true }] },
  { kind: "aftercare", name: N("Tedavi sonrası", "Aftercare", "Nachsorge", "ما بعد العلاج"), color: "#10B981", settings: { autoAdd: "deal.won" }, stages: [
    { key: "day1", name: N("1. gün", "Day 1", "Tag 1", "اليوم 1"), color: "#34D399", p: 0, sla: 1440 },
    { key: "day3", name: N("3. gün kontrol", "Day 3 check", "Tag-3-Check", "فحص اليوم 3"), color: "#10B981", p: 0, sla: 2880 },
    { key: "day7", name: N("7. gün", "Day 7", "Tag 7", "اليوم 7"), color: "#059669", p: 0, sla: 20160 },
    { key: "month1", name: N("1. ay", "Month 1", "Monat 1", "الشهر 1"), color: "#047857", p: 0, sla: 10080 },
    { key: "review_asked", name: N("Yorum istendi", "Review requested", "Bewertung angefragt", "طُلب التقييم"), color: "#EAB308", p: 0, sla: 10080 },
    { key: "complaint", name: N("Şikâyet / sorun", "Complaint / issue", "Beschwerde / Problem", "شكوى / مشكلة"), color: "#EF4444", p: 0, sla: 240 },
    { key: "done", name: N("Tamamlandı", "Completed", "Abgeschlossen", "مكتمل"), color: "#64748B", p: 100, won: true }] },
  { kind: "recall", name: N("Recall", "Recall", "Recall", "الاستدعاء"), color: "#F59E0B", settings: {}, stages: [
    { key: "due", name: N("Vadesi geldi", "Due", "Fällig", "مستحق"), color: "#F59E0B", p: 10, sla: 4320 },
    { key: "reached", name: N("Ulaşıldı", "Reached", "Erreicht", "تم التواصل"), color: "#38BDF8", p: 40, sla: 10080 },
    { key: "booked", name: N("Randevu alındı", "Booked", "Gebucht", "تم الحجز"), color: "#6366F1", p: 80 },
    { key: "attended", name: N("Geldi", "Attended", "Erschienen", "حضر"), color: "#10B981", p: 100, won: true },
    { key: "postponed", name: N("Ertelendi", "Postponed", "Verschoben", "مؤجل"), color: "#94A3B8", p: 20 },
    { key: "declined", name: N("İstemedi", "Declined", "Abgelehnt", "رفض"), color: "#EF4444", p: 0, lost: true }] },
];

export async function ensurePipelines(tx: Tx, clinicId: string): Promise<void> {
  const have = new Set((await tx`select kind from pipelines where clinic_id = ${clinicId}`).map((r) => r.kind as string));
  let sort = 0;
  for (const d of DEFAULTS) {
    sort += 10; if (have.has(d.kind)) continue;
    const [p] = await tx`insert into pipelines (clinic_id, kind, name, color, sort, settings) values (${clinicId}, ${d.kind}, ${tx.json(d.name as never)}, ${d.color}, ${sort}, ${tx.json(d.settings as never)}) returning id`;
    let i = 0;
    for (const s of d.stages) await tx`insert into pipeline_stages (clinic_id, pipeline_id, key, name, color, probability, sla_minutes, is_won, is_lost, system, sort)
      values (${clinicId}, ${p!.id}, ${s.key}, ${tx.json((s.name ?? {}) as never)}, ${s.color}, ${s.p}, ${s.sla ?? null}, ${!!s.won}, ${!!s.lost}, ${d.kind === "sales"}, ${(i += 10)})`;
  }
}

/** Satış pipeline'ının geçerli aşama anahtarları (lead.stage doğrulaması) */
export async function salesStageKeys(tx: Tx, clinicId: string): Promise<string[]> {
  await ensurePipelines(tx, clinicId);
  return (await tx`select s.key from pipeline_stages s join pipelines p on p.id = s.pipeline_id where p.clinic_id = ${clinicId} and p.kind = 'sales'`).map((r) => r.key as string);
}

/** Kaydı bir pipeline'a ekler (açık kayıt varsa onu döner) */
export async function addToPipeline(tx: Tx, clinicId: string, kind: string, leadId: string, o: { stageKey?: string; dealId?: string | null; ownerId?: string | null; dueAt?: Date | null; valueMinor?: number; currency?: string | null; pipelineId?: string } = {}) {
  await ensurePipelines(tx, clinicId);
  const [p] = o.pipelineId ? await tx`select id, kind from pipelines where id = ${o.pipelineId} and clinic_id = ${clinicId}` : await tx`select id, kind from pipelines where clinic_id = ${clinicId} and kind = ${kind} and active order by sort limit 1`;
  if (!p || p.kind === "sales") return null;
  const [ex] = await tx`select id from pipeline_items where pipeline_id = ${p.id} and lead_id = ${leadId} and status = 'open'`; if (ex) return ex.id as string;
  const [st] = o.stageKey ? await tx`select id from pipeline_stages where pipeline_id = ${p.id} and key = ${o.stageKey}` : await tx`select id from pipeline_stages where pipeline_id = ${p.id} and not hidden order by sort limit 1`;
  if (!st) return null;
  const owner = o.ownerId ?? ((await tx`select owner_id from leads where id = ${leadId}`)[0]?.ownerId as string | null) ?? null;
  const [it] = await tx`insert into pipeline_items (clinic_id, pipeline_id, stage_id, lead_id, deal_id, owner_id, due_at, value_minor, currency)
    values (${clinicId}, ${p.id}, ${st.id}, ${leadId}, ${o.dealId ?? null}, ${owner}, ${o.dueAt ?? null}, ${o.valueMinor ?? 0}, ${o.currency ?? null}) on conflict do nothing returning id`;
  return (it?.id as string) ?? null;
}

/** İşçi: olaylara göre otomatik ekleme (kaybedilen lead → yeniden kazanım, kazanılan deal → tedavi sonrası) */
export async function pipelineHooks(ev: { clinicId: string; type: string; payload: Record<string, unknown> }) {
  const lost = (ev.type === "lead.stage" && ev.payload.stage === "lost") || ev.type === "quote.declined";
  const won = ev.type === "deal.stage" && ev.payload.stage === "won";
  if (!lost && !won) return;
  const leadId = ev.payload.leadId as string | undefined; if (!leadId) return;
  await ownerSql.begin(async (tx) => {
    await ensurePipelines(tx as unknown as Tx, ev.clinicId);
    const pls = await tx`select id, kind, settings from pipelines where clinic_id = ${ev.clinicId} and active and settings->>'autoAdd' = ${lost ? "lead.lost" : "deal.won"}`;
    for (const p of pls) await addToPipeline(tx as unknown as Tx, ev.clinicId, p.kind as string, leadId, { pipelineId: p.id as string, dealId: (ev.payload.dealId as string) ?? null });
  });
}

/** İşçi: SLA aşımı — sorumluya bildirim + 'pipeline.sla_breached' olayı (iş akışı / AI devri için) */
export async function checkSla(): Promise<number> {
  const leads = await ownerSql`update leads l set sla_breached_at = now()
    from pipeline_stages s join pipelines p on p.id = s.pipeline_id and p.kind = 'sales'
    where p.clinic_id = l.clinic_id and s.key = l.stage and s.sla_minutes is not null and l.sla_breached_at is null and l.archived_at is null
      and l.stage_entered_at < now() - make_interval(mins => s.sla_minutes) and l.stage_entered_at > now() - interval '30 days'
    returning l.id, l.clinic_id, l.owner_id, l.stage, (select full_name from patients where id = l.patient_id) as name`;
  const items = await ownerSql`update pipeline_items i set sla_breached_at = now()
    from pipeline_stages s where s.id = i.stage_id and s.sla_minutes is not null and i.sla_breached_at is null and i.status = 'open'
      and i.stage_entered_at < now() - make_interval(mins => s.sla_minutes) and i.stage_entered_at > now() - interval '60 days'
    returning i.id, i.clinic_id, i.owner_id, i.lead_id, s.key as stage, i.pipeline_id, (select full_name from patients pa join leads l on l.patient_id = pa.id where l.id = i.lead_id) as name`;
  for (const r of [...leads.map((x) => ({ ...x, leadId: x.id, kind: "sales" })), ...items.map((x) => ({ ...x, kind: "item" }))] as any[]) {
    await ownerSql`insert into outbox_events (clinic_id, type, entity_id, payload) values (${r.clinicId}, 'pipeline.sla_breached', ${r.leadId}, ${ownerSql.json({ leadId: r.leadId, stage: r.stage, name: r.name, ownerId: r.ownerId, pipeline: r.kind, itemId: r.kind === "item" ? r.id : null } as never)})`;
    if (r.ownerId) await notifyUser(r.clinicId as string, r.ownerId as string, "pipeline.sla", `⏱ ${r.name}: ${r.stage} — süre aşıldı`, "/leads/" + r.leadId);
  }
  if (leads.length + items.length) await ownerSql`select pg_notify('outbox', 'sla')`;
  return leads.length + items.length;
}
