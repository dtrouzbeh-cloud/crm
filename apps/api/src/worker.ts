// Arka plan işçisi: olay kutusu (outbox) → iş akışı kuralları, bildirimler, giden webhook'lar; zamanlanmış işler.
import postgres from "postgres";
import { ownerSql } from "./db.ts";
import { config } from "./config.ts";
import { handlers as jobHandlers } from "./jobs.ts";
import { createFormRequest, emailFormRequest } from "./routes/forms.ts";
import type { Tx } from "./db.ts";
import { notifyUser } from "./services/notify.ts";
import { sendMail } from "./services/mailer.ts";
import { config as appConfig } from "./config.ts";

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
        await notifyUser(ev.clinicId, ownerId, ev.type, render(String(a.title), ev.payload), leadId ? "/leads/" + leadId : null);
      }
    }
    await ownerSql`update workflow_rules set runs = runs + 1 where id = ${r.id}`;
    await ownerSql`insert into workflow_runs (clinic_id, rule_id, event_id, status) values (${ev.clinicId}, ${r.id}, ${ev.id}, 'ok')`;
  }
}

async function notifyOwner(ev: Ev) {
  const map: Record<string, string> = { "lead.assigned": "Size yeni bir lead atandı: {name}", "quote.viewed": "{name} teklifi görüntüledi", "quote.accepted": "{name} teklifi KABUL ETTİ 🎉",
    "quote.changes": "{name} teklifte değişiklik istedi", "payment.succeeded": "{name} ödeme yaptı: {amountText}", "wa.message": "{name}: yeni WhatsApp mesajı", "form.completed": "{name} formu doldurdu: {title}", "deal.amended": "{name}: plan revizyonu onaylandı" };
  const tpl = map[ev.type]; if (!tpl) return;
  const uid = (ev.payload.ownerId as string) ?? null; if (!uid) return;
  await notifyUser(ev.clinicId, uid, ev.type, render(tpl, ev.payload), (ev.payload.link as string) ?? (ev.payload.leadId ? "/leads/" + ev.payload.leadId : null));
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

/** Günlük özet e-postası: tercihinde açık olan kullanıcılara, klinik saatine göre 07:00'den sonra günde bir kez */
async function sendDigests() {
  const rows = await ownerSql`
    select u.id as user_id, u.email, u.name, u.notify_prefs, m.clinic_id, c.name as clinic, c.timezone, (now() at time zone c.timezone)::date::text as today
    from users u join memberships m on m.user_id = u.id and m.active join clinics c on c.id = m.clinic_id
    where coalesce((u.notify_prefs->>'digest')::boolean, false) and extract(hour from now() at time zone c.timezone) >= 7
      and coalesce(u.notify_prefs->>'lastDigest', '') <> (now() at time zone c.timezone)::date::text`;
  for (const r of rows) {
    const [s] = await ownerSql`select
        (select count(*)::int from tasks where clinic_id = ${r.clinicId} and assignee_id = ${r.userId} and done_at is null and due_at < now()) as overdue,
        (select count(*)::int from tasks where clinic_id = ${r.clinicId} and assignee_id = ${r.userId} and done_at is null and due_at >= now() and due_at < now() + interval '1 day') as today,
        (select count(*)::int from leads where clinic_id = ${r.clinicId} and owner_id = ${r.userId} and created_at > now() - interval '1 day') as new_leads,
        (select count(*)::int from quotes q join leads l on l.id = q.lead_id where q.clinic_id = ${r.clinicId} and l.owner_id = ${r.userId} and q.viewed_at > now() - interval '1 day') as viewed,
        (select count(*)::int from appointments where clinic_id = ${r.clinicId} and (dentist_id = ${r.userId} or translator_id = ${r.userId}) and start_at::date = (now() at time zone ${r.timezone as string})::date and status not in ('canceled','no_show')) as appts`;
    const x = s as Record<string, number>;
    if (x.overdue + x.today + x.newLeads + x.viewed + x.appts > 0) {
      const text = `Günaydın ${String(r.name).split(" ")[0]},\n\n• Geciken görev: ${x.overdue}\n• Bugün yapılacak: ${x.today}\n• Bugünkü randevu: ${x.appts}\n• Son 24 saatte yeni lead: ${x.newLeads}\n• Teklifi açan hasta: ${x.viewed}\n\n${appConfig.appUrl}/tasks\n\n— DentaFlow`;
      await sendMail(r.email as string, `${r.clinic}: günlük özet`, text, { clinicId: r.clinicId as string, fromName: r.clinic as string }).catch((e) => console.error("digest", e));
    }
    await ownerSql`update users set notify_prefs = notify_prefs || ${ownerSql.json({ lastDigest: r.today } as never)} where id = ${r.userId}`;
  }
}

let wake: (() => void) | null = null;
async function loop() {
  const listener = postgres(config.databaseOwnerUrl, { max: 1 });
  await listener.listen("outbox", () => wake?.());
  console.log(`DentaFlow worker ${workerId} çalışıyor`);
  let lastDigest = 0;
  for (;;) {
    let n = 0;
    try { n = (await processOutbox()) + (await processJobs()); } catch (e) { console.error("worker", e); }
    if (Date.now() - lastDigest > 10 * 60_000) { lastDigest = Date.now(); await sendDigests().catch((e) => console.error("digest", e)); }
    if (!n) await new Promise<void>((r) => { wake = r; setTimeout(r, 5000); });
  }
}
if (import.meta.main) await loop();
export { processOutbox, processJobs, sendDigests };
