// Recall motoru: tamamlanan tedaviye göre kural eşleştirme → planlama; vadesi gelince recall pipeline'ı + dizi; tekrarlı recall
import { ownerSql, type Tx } from "../db.ts";
import { addToPipeline } from "./pipelines.ts";
import { enroll } from "./sequences.ts";

const IMPLANT = ["implant", "implant_imm", "ao4_u", "ao4_l", "ao6_u", "ao6_l", "fp_u", "fp_l", "snap_u", "snap_l"];
const CROWN = ["crown_zr", "crown_emax", "crown_pfm", "crown_por", "crown_imp", "bridge_unit", "veneer_por", "veneer_emax", "smile_emax_u", "smile_zr_u", "smile_zr_l", "inlay"];
const DEFAULT_RULES = [
  { name: { tr: "İmplant — kalıcı diş / 2. aşama kontrolü", en: "Implant — final teeth / stage 2 check" }, match: IMPLANT, after: 120, repeat: null },
  { name: { tr: "Kron/veneer — 6. ay kontrolü", en: "Crown/veneer — 6-month check" }, match: CROWN, after: 180, repeat: null },
  { name: { tr: "Yıllık kontrol ve temizlik", en: "Annual check-up and cleaning" }, match: [], after: 365, repeat: 365 },
  { name: { tr: "Beyazlatma tazeleme", en: "Whitening refresh" }, match: ["whitening"], after: 450, repeat: null },
  { name: { tr: "Gece plağı yenileme", en: "Night guard renewal" }, match: ["nightguard"], after: 365, repeat: 365 },
];

export async function ensureRecallRules(tx: Tx, clinicId: string, lang = "tr") {
  const [{ n }] = await tx`select count(*)::int as n from recall_rules where clinic_id = ${clinicId}` as unknown as [{ n: number }];
  if (n) return;
  let i = 0;
  for (const r of DEFAULT_RULES) await tx`insert into recall_rules (clinic_id, name, match, after_days, repeat_days, sort) values (${clinicId}, ${(r.name as Record<string, string>)[lang] ?? r.name.en}, ${r.match}, ${r.after}, ${r.repeat}, ${(i += 10)})`;
}

/** Deal'de yapılan tedavi kimlikleri: kabul edilen seçenek + onaylı revizyon eklemeleri − çıkarılanlar */
async function dealTreatments(tx: Tx, dealId: string): Promise<Set<string>> {
  const [d] = await tx`select accepted_option from deals where id = ${dealId}`;
  const ids = new Set<string>();
  for (const l of (d?.acceptedOption as any)?.calc?.lines ?? []) { if (l.txId) ids.add(l.txId); if (l.b) ids.add(l.b); }
  const am = await tx`select lines from deal_amendments where deal_id = ${dealId} and status = 'approved'`;
  for (const a of am) for (const l of a.lines as any[]) if (l.kind === "add") { if (l.tx) ids.add(l.tx); if (l.b) ids.add(l.b); }
  return ids;
}

/** Deal kazanılınca: eşleşen kurallar için recall planla */
export async function scheduleRecallsForDeal(tx: Tx, clinicId: string, dealId: string): Promise<number> {
  await ensureRecallRules(tx, clinicId);
  const [d] = await tx`select lead_id from deals where id = ${dealId}`; if (!d) return 0;
  const done = await dealTreatments(tx, dealId);
  const rules = await tx`select * from recall_rules where clinic_id = ${clinicId} and active order by sort`;
  let n = 0;
  for (const r of rules) {
    const match = r.match as string[];
    if (match.length && !match.some((m) => done.has(m))) continue;
    if (!match.length && !done.size) continue;
    const res = await tx`insert into recalls (clinic_id, lead_id, deal_id, rule_id, title, due_at) values (${clinicId}, ${d.leadId}, ${dealId}, ${r.id}, ${r.name}, now() + make_interval(days => ${r.afterDays as number})) on conflict do nothing returning id`;
    n += res.length;
  }
  return n;
}

/** İşçi: vadesi gelen recall'ları etkinleştir (recall pipeline'ı + dizi) */
export async function activateDueRecalls(limit = 50): Promise<number> {
  const due = await ownerSql`update recalls set status = 'active', activated_at = now() where id in (select id from recalls where status = 'scheduled' and due_at <= now() order by due_at limit ${limit} for update skip locked)
    returning id, clinic_id, lead_id, deal_id, rule_id, title, due_at`;
  for (const r of due) {
    await ownerSql.begin(async (tx0) => {
      const tx = tx0 as unknown as Tx;
      await tx`select set_config('app.clinic_id', ${r.clinicId}, true)`;
      const itemId = await addToPipeline(tx, r.clinicId as string, "recall", r.leadId as string, { stageKey: "due", dealId: r.dealId as string | null, dueAt: r.dueAt as Date });
      if (itemId) { await tx`update recalls set item_id = ${itemId} where id = ${r.id}`; await tx`update pipeline_items set note = coalesce(note, ${r.title}) where id = ${itemId}`; }
      const [rule] = r.ruleId ? await tx`select sequence_id from recall_rules where id = ${r.ruleId}` : [null];
      if (rule?.sequenceId) await enroll(tx, r.clinicId as string, rule.sequenceId as string, r.leadId as string);
      await tx`insert into lead_events (clinic_id, lead_id, type, body, data) values (${r.clinicId}, ${r.leadId}, 'system', 'recall', ${tx.json({ title: r.title, recallId: r.id } as never)})`;
      await tx`insert into outbox_events (clinic_id, type, entity_id, payload) values (${r.clinicId}, 'recall.due', ${r.leadId}, ${tx.json({ leadId: r.leadId, recallId: r.id, title: r.title } as never)})`;
    });
  }
  return due.length;
}

/** İşçi olayı: recall pipeline'ında kapanış → recall kapanır, tekrarlıysa yenisi planlanır */
export async function recallHooks(ev: { clinicId: string; type: string; payload: Record<string, unknown> }) {
  if (ev.type === "deal.stage" && ev.payload.stage === "won" && ev.payload.dealId) {
    await ownerSql.begin(async (tx) => { await tx`select set_config('app.clinic_id', ${ev.clinicId}, true)`; await scheduleRecallsForDeal(tx as unknown as Tx, ev.clinicId, ev.payload.dealId as string); });
    return;
  }
  if (ev.type !== "pipeline.stage_entered" || ev.payload.pipeline !== "recall" || !ev.payload.itemId) return;
  const [it] = await ownerSql`select i.status from pipeline_items i where i.id = ${ev.payload.itemId as string}`;
  if (!it || it.status === "open") return;
  const [r] = await ownerSql`update recalls set status = 'done', closed_at = now() where item_id = ${ev.payload.itemId as string} and status = 'active' returning *`;
  if (!r?.ruleId) return;
  const [rule] = await ownerSql`select * from recall_rules where id = ${r.ruleId} and active`;
  if (rule?.repeatDays) await ownerSql`insert into recalls (clinic_id, lead_id, rule_id, title, due_at) values (${r.clinicId}, ${r.leadId}, ${rule.id}, ${rule.name}, now() + make_interval(days => ${rule.repeatDays as number}))`;
}
