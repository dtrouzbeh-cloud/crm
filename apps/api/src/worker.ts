// Arka plan işçisi: olay kutusu (outbox) → iş akışı kuralları, bildirimler, giden webhook'lar; zamanlanmış işler.
import postgres from "postgres";
import { ownerSql } from "./db.ts";
import { config } from "./config.ts";
import { handlers as jobHandlers } from "./jobs.ts";
import { createFormRequest, emailFormRequest } from "./routes/forms.ts";
import type { Tx } from "./db.ts";

const workerId = `w-${process.pid}`;
type Ev = { id: number; clinicId: string; type: string; entityId: string | null; payload: Record<string, unknown> };

function render(tpl: string, p: Record<string, unknown>) { return tpl.replace(/\{(\w+)\}/g, (m, k) => (p[k] != null ? String(p[k]) : m)); }

async function runWorkflows(ev: Ev) {
  const rules = await ownerSql`select id, trigger, actions from workflow_rules where clinic_id = ${ev.clinicId} and active and trigger->>'event' = ${ev.type}`;
  for (const r of rules) {
    const trig = r.trigger as Record<string, unknown>;
    if (trig.stage && trig.stage !== ev.payload.stage) continue;
    if (trig.source && trig.source !== ev.payload.source) continue;
    const leadId = (ev.payload.leadId as string) ?? null;
    let ownerId = (ev.payload.ownerId as string) ?? null;
    if (!ownerId && leadId) { const [l] = await ownerSql`select owner_id from leads where id = ${leadId}`; ownerId = (l?.ownerId as string) ?? null; }
    for (const a of r.actions as Record<string, unknown>[]) {
      if (a.type === "task") {
        const assignee = a.assign === "owner" || !a.assign ? ownerId : (a.assign as string);
        await ownerSql`insert into tasks (clinic_id, title, type, priority, due_at, lead_id, assignee_id, source_rule_id, entity, entity_id)
          values (${ev.clinicId}, ${render(String(a.title), ev.payload)}, ${String(a.taskType ?? "general")}, ${String(a.priority ?? "med")},
                  now() + ${Number(a.dueHours ?? 0) + " hours"}::interval, ${leadId}, ${assignee}, ${r.id}, ${(ev.payload.entity as string) ?? null}, ${(ev.payload.entityRef as string) ?? null})`;
      } else if (a.type === "send_form" && leadId && a.templateId) {
        const f = await ownerSql.begin((tx) => createFormRequest(tx as unknown as Tx, ev.clinicId, null, String(a.templateId), leadId, (ev.payload.dealId as string) ?? null));
        if (a.email !== false) await emailFormRequest(ev.clinicId, f).catch((e) => console.error("form mail", e));
      } else if (a.type === "notify" && ownerId) {
        await ownerSql`insert into notifications (clinic_id, user_id, type, title, link) values (${ev.clinicId}, ${ownerId}, ${ev.type}, ${render(String(a.title), ev.payload)}, ${leadId ? "/leads/" + leadId : null})`;
      }
    }
    await ownerSql`update workflow_rules set runs = runs + 1 where id = ${r.id}`;
    await ownerSql`insert into workflow_runs (clinic_id, rule_id, event_id, status) values (${ev.clinicId}, ${r.id}, ${ev.id}, 'ok')`;
  }
}

async function notifyOwner(ev: Ev) {
  const map: Record<string, string> = { "lead.assigned": "Size yeni bir lead atandı: {name}", "quote.viewed": "{name} teklifi görüntüledi", "quote.accepted": "{name} teklifi KABUL ETTİ 🎉",
    "quote.changes": "{name} teklifte değişiklik istedi", "payment.succeeded": "{name} ödeme yaptı: {amountText}", "wa.message": "{name}: yeni WhatsApp mesajı", "form.completed": "{name} formu doldurdu: {title}" };
  const tpl = map[ev.type]; if (!tpl) return;
  const uid = (ev.payload.ownerId as string) ?? null; if (!uid) return;
  await ownerSql`insert into notifications (clinic_id, user_id, type, title, link) values (${ev.clinicId}, ${uid}, ${ev.type}, ${render(tpl, ev.payload)}, ${(ev.payload.link as string) ?? (ev.payload.leadId ? "/leads/" + ev.payload.leadId : null)})`;
}

async function processOutbox(): Promise<number> {
  const evs = await ownerSql.begin(async (tx) => {
    const rows = await tx`select id, clinic_id, type, entity_id, payload from outbox_events where dispatched_at is null order by id limit 50 for update skip locked` as unknown as Ev[];
    for (const ev of rows) {
      await runWorkflows(ev).catch((e) => console.error("workflow", ev.type, e));
      await notifyOwner(ev).catch((e) => console.error("notify", e));
      // giden webhook'lar ve entegrasyonlar için iş oluştur
      await tx`insert into jobs (clinic_id, type, payload) select ${ev.clinicId}, 'webhook.dispatch', ${tx.json({ eventId: ev.id } as never)}
               where exists (select 1 from webhook_endpoints w where w.clinic_id = ${ev.clinicId} and w.active and (w.events @> '{*}' or ${ev.type} = any(w.events)))`;
    }
    if (rows.length) await tx`update outbox_events set dispatched_at = now() where id = any(${rows.map((r) => r.id)})`;
    return rows;
  });
  return evs.length;
}

async function processJobs(): Promise<number> {
  const jobs = await ownerSql`update jobs set locked_at = now(), locked_by = ${workerId}, attempts = attempts + 1
    where id in (select id from jobs where done_at is null and run_at <= now() and (locked_at is null or locked_at < now() - interval '5 minutes') and attempts < max_attempts order by run_at limit 10 for update skip locked)
    returning id, clinic_id, type, payload, attempts`;
  for (const j of jobs) {
    const h = jobHandlers[j.type as string];
    try {
      if (!h) throw new Error(`işleyici yok: ${j.type}`);
      await h(j.payload as Record<string, unknown>, j.clinicId as string | null);
      await ownerSql`update jobs set done_at = now(), locked_at = null, last_error = null where id = ${j.id}`;
    } catch (e) {
      const backoff = Math.min(3600, 2 ** Number(j.attempts) * 15);
      await ownerSql`update jobs set locked_at = null, last_error = ${String((e as Error).message).slice(0, 2000)}, run_at = now() + ${backoff + " seconds"}::interval where id = ${j.id}`;
    }
  }
  return jobs.length;
}

let wake: (() => void) | null = null;
async function loop() {
  const listener = postgres(config.databaseOwnerUrl, { max: 1 });
  await listener.listen("outbox", () => wake?.());
  console.log(`DentaFlow worker ${workerId} çalışıyor`);
  for (;;) {
    let n = 0;
    try { n = (await processOutbox()) + (await processJobs()); } catch (e) { console.error("worker", e); }
    if (!n) await new Promise<void>((r) => { wake = r; setTimeout(r, 5000); });
  }
}
if (import.meta.main) await loop();
export { processOutbox, processJobs };
