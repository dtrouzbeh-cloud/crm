import { cleanCustom } from "./records.ts";
import { countryFromPhone, languageForCountry } from "../lib/phone.ts";
import { salesStageKeys } from "../services/pipelines.ts";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { withClinic, type Tx } from "../db.ts";
import { ctx, need, parse, notFound, HttpError, type Ctx, qbool } from "../http.ts";
import { audit, emit } from "../services/audit.ts";
import { maskValue } from "@dentaflow/core/permissions";
import { normalizePhone } from "@dentaflow/core/phone";

export const LEAD_STAGES = ["new", "contacted", "interested", "awaiting_info", "in_diagnosis", "plan_ready", "quote_sent", "negotiation", "won", "lost"] as const;

const leadInput = z.object({
  fullName: z.string().trim().min(2).max(160),
  phone: z.string().trim().max(40).optional().nullable(),
  email: z.email().max(200).optional().nullable().or(z.literal("")),
  country: z.string().max(2).optional().nullable(),
  city: z.string().max(80).optional().nullable(),
  language: z.string().max(5).optional().nullable(),
  source: z.string().max(40).default("manual"),
  campaign: z.string().max(200).optional().nullable(),
  temperature: z.enum(["hot", "warm", "cold"]).default("warm"),
  ownerId: z.uuid().optional().nullable(),
  interest: z.string().max(200).optional().nullable(),
  budget: z.string().max(80).optional().nullable(),
  travelWindow: z.string().max(80).optional().nullable(),
  issue: z.string().max(4000).optional().nullable(),
  tags: z.array(z.string().max(40)).max(30).optional(),
  utm: z.record(z.string(), z.string()).optional(),
  externalIds: z.record(z.string(), z.string()).optional(),
  marketingConsent: z.boolean().optional(),
  partnerId: z.uuid().optional().nullable(),
  custom: z.record(z.string(), z.unknown()).optional(),
});
export type LeadInput = z.infer<typeof leadInput>;

/** Telefon/e-posta/dış ID ile mükerrer hasta bul */
export async function findDuplicatePatient(tx: Tx, clinicId: string, phone: string | null, email: string | null, waId?: string | null) {
  if (!phone && !email && !waId) return null;
  const [p] = await tx`select id, full_name, phone, email from patients where clinic_id = ${clinicId}
    and ((${phone}::text is not null and phone = ${phone}) or (${email}::text is not null and email = ${email}) or (${waId ?? null}::text is not null and wa_id = ${waId ?? null})) limit 1`;
  return p ?? null;
}

/** Lead oluşturma çekirdeği — manuel, form, API, WhatsApp, reklam entegrasyonları aynı yolu kullanır */
export async function createLead(tx: Tx, c: Pick<Ctx, "clinicId" | "userId">, input: LeadInput, opts: { dedupe?: "attach" | "reject"; waId?: string | null } = {}) {
  const phone = normalizePhone(input.phone ?? null, input.country ?? undefined);
  const email = input.email ? input.email.toLowerCase() : null;
  // ülke/dil verilmediyse telefon ön ekinden tahmin (WhatsApp, Instagram, widget lead'leri)
  if (!input.country && phone) { const cc = countryFromPhone(phone); if (cc) input = { ...input, country: cc, language: input.language ?? languageForCountry(cc) ?? undefined }; }
  let patient: { id: string; fullName: string } | null = await findDuplicatePatient(tx, c.clinicId, phone, email, opts.waId) as { id: string; fullName: string } | null;
  if (patient && opts.dedupe === "reject") throw new HttpError(409, "duplicate", "Bu hasta zaten kayıtlı", { patientId: patient.id, name: patient.fullName });
  if (!patient) {
    const [{ n }] = await tx`select next_number(${c.clinicId}, 'patient') as n` as unknown as [{ n: string }];
    const [np] = await tx`insert into patients (clinic_id, number, full_name, phone, email, country, city, language, wa_id, marketing_consent, consent_at, external_ids)
      values (${c.clinicId}, ${n}, ${input.fullName}, ${phone}, ${email}, ${input.country ?? null}, ${input.city ?? null}, ${input.language ?? null}, ${opts.waId ?? null},
              ${input.marketingConsent ?? false}, ${input.marketingConsent ? new Date() : null}, ${tx.json((input.externalIds ?? {}) as never)}) returning id, full_name`;
    patient = np as { id: string; fullName: string };
  }
  // Sahip atanmadıysa: dil/round-robin ataması
  const ownerId = input.ownerId ?? (await pickOwner(tx, c.clinicId, input.language ?? null));
  const [{ n: ln }] = await tx`select next_number(${c.clinicId}, 'lead') as n` as unknown as [{ n: string }];
  // iş ortağı: açıkça verilmiş ya da ?ref=KOD (utm.ref) ile eşleşen ortak
  let partnerId = input.partnerId ?? null;
  const ref = input.utm?.ref ?? input.utm?.ref_code ?? null;
  if (!partnerId && ref) { const [pt] = await tx`select id from partners where clinic_id = ${c.clinicId} and ref_code = ${ref} and active`; partnerId = (pt?.id as string) ?? null; }
  const [lead] = await tx`insert into leads (clinic_id, number, patient_id, temperature, source, campaign, owner_id, interest, budget, travel_window, issue, tags, utm, external_ids, partner_id, custom)
    values (${c.clinicId}, ${ln}, ${patient!.id}, ${input.temperature}, ${input.source}, ${input.campaign ?? null}, ${ownerId}, ${input.interest ?? null}, ${input.budget ?? null},
            ${input.travelWindow ?? null}, ${input.issue ?? null}, ${input.tags ?? []}, ${tx.json((input.utm ?? {}) as never)}, ${tx.json((input.externalIds ?? {}) as never)}, ${partnerId}, ${tx.json((input.custom ? await cleanCustom(tx, c.clinicId, "lead", input.custom) : {}) as never)})
    returning id, number`;
  await tx`insert into lead_events (clinic_id, lead_id, type, body, data, user_id) values (${c.clinicId}, ${lead!.id}, 'system', 'created', ${tx.json({ source: input.source } as never)}, ${c.userId})`;
  await audit(tx, c, "lead.create", "lead", lead!.id, { source: input.source });
  await emit(tx, c.clinicId, "lead.created", lead!.id, { leadId: lead!.id, patientId: patient!.id, name: input.fullName, source: input.source, ownerId });
  return { leadId: lead!.id as string, number: lead!.number, patientId: patient!.id as string };
}

async function pickOwner(tx: Tx, clinicId: string, language: string | null): Promise<string | null> {
  const rows = await tx`
    select m.user_id, (select count(*) from leads l where l.owner_id = m.user_id and l.created_at > now() - interval '7 days') as load
    from memberships m where m.clinic_id = ${clinicId} and m.active and m.can_own_leads and m.role in ('sales','manager')
      and (${language}::text is null or cardinality(m.languages) = 0 or ${language} = any(m.languages))
    order by load asc, random() limit 1`;
  return rows[0]?.userId ?? null;
}

function scopeFilter(tx: Tx, c: Ctx) {
  const s = c.perms["lead.read"];
  if (s === "all") return tx``;
  if (s === "team") return tx`and (l.owner_id = ${c.userId} or l.owner_id in (select user_id from memberships where reports_to = ${c.userId}) or l.owner_id is null)`;
  return tx`and l.owner_id = ${c.userId}`;
}
function maskLead<T extends Record<string, unknown>>(c: Ctx, r: T): T {
  return { ...r, phone: maskValue(r.phone as string, c.perms["field.phone"]), email: maskValue(r.email as string, c.perms["field.email"]) };
}

export function leadRoutes(app: FastifyInstance) {
  app.get("/api/leads", async (req) => {
    const c = need(ctx(req), "lead.read");
    const q = parse(z.object({
      stage: z.string().optional(), owner: z.string().optional(), source: z.string().optional(), temperature: z.string().optional(),
      q: z.string().max(100).optional(), view: z.enum(["active", "mine", "all", "archived"]).default("active"),
      sort: z.enum(["activity", "created", "followup", "score"]).default("activity"),
      limit: z.coerce.number().int().min(1).max(200).default(50), offset: z.coerce.number().int().min(0).default(0),
      country: z.string().max(2).optional(), language: z.string().max(5).optional(), tag: z.string().max(40).optional(), partner: z.string().optional(), campaign: z.string().max(200).optional(),
      createdFrom: z.iso.date().optional(), createdTo: z.iso.date().optional(), overdue: qbool.optional(), noOwner: qbool.optional(),
      cf: z.string().max(2000).optional(),   // özel alan filtresi: JSON {anahtar: değer}
    }), req.query);
    let cf: Record<string, unknown> | null = null;
    if (q.cf) { try { cf = JSON.parse(q.cf); } catch { throw new HttpError(400, "bad_cf", "cf JSON olmalı"); } }
    return withClinic(c.clinicId, async (tx) => {
      const where = tx`
        where l.clinic_id = ${c.clinicId} ${scopeFilter(tx, c)}
        ${q.view === "archived" ? tx`and l.archived_at is not null` : tx`and l.archived_at is null`}
        ${q.view === "active" ? tx`and l.stage not in ('won','lost')` : tx``}
        ${q.view === "mine" ? tx`and l.owner_id = ${c.userId}` : tx``}
        ${q.stage ? tx`and l.stage = ${q.stage}` : tx``}
        ${q.owner ? tx`and l.owner_id = ${q.owner}` : tx``}
        ${q.source ? tx`and l.source = ${q.source}` : tx``}
        ${q.temperature ? tx`and l.temperature = ${q.temperature}` : tx``}
        ${q.country ? tx`and p.country = ${q.country}` : tx``} ${q.language ? tx`and p.language = ${q.language}` : tx``}
        ${q.tag ? tx`and ${q.tag} = any(l.tags)` : tx``} ${q.partner ? tx`and l.partner_id = ${q.partner}` : tx``} ${q.campaign ? tx`and l.campaign = ${q.campaign}` : tx``}
        ${q.createdFrom ? tx`and l.created_at >= ${q.createdFrom}::date` : tx``} ${q.createdTo ? tx`and l.created_at < ${q.createdTo}::date + 1` : tx``}
        ${q.overdue ? tx`and exists (select 1 from tasks t where t.lead_id = l.id and t.done_at is null and t.due_at < now())` : tx``}
        ${q.noOwner ? tx`and l.owner_id is null` : tx``}
        ${cf && Object.keys(cf).length ? tx`and l.custom @> ${tx.json(cf as never)}` : tx``}
        ${q.q ? tx`and (p.full_name ilike ${"%" + q.q + "%"} or p.phone like ${"%" + q.q.replace(/\D/g, "") + "%"} or p.email ilike ${"%" + q.q + "%"} or l.number::text = ${q.q})` : tx``}`;
      const order = q.sort === "score" ? tx`l.score desc nulls last, l.last_activity_at desc` : q.sort === "created" ? tx`l.created_at desc` : q.sort === "followup" ? tx`l.next_follow_up_at asc nulls last` : tx`l.last_activity_at desc`;
      const rows = await tx`
        select l.id, l.number, l.stage, l.temperature, l.source, l.campaign, l.owner_id, l.interest, l.last_activity_at, l.next_follow_up_at, l.created_at, l.tags, l.custom, l.score,
               p.id as patient_id, p.full_name, p.phone, p.email, p.country, p.language, u.name as owner_name,
               (select count(*) from tasks t where t.lead_id = l.id and t.done_at is null and t.due_at < now())::int as overdue_tasks
        from leads l join patients p on p.id = l.patient_id left join users u on u.id = l.owner_id
        ${where} order by ${order} limit ${q.limit} offset ${q.offset}`;
      const [{ total }] = await tx`select count(*)::int as total from leads l join patients p on p.id = l.patient_id ${where}` as unknown as [{ total: number }];
      return { items: rows.map((r) => maskLead(c, r)), total };
    });
  });

  app.get("/api/leads/stats", async (req) => {
    const c = need(ctx(req), "lead.read");
    return withClinic(c.clinicId, async (tx) => {
      const rows = await tx`select l.stage, count(*)::int as n from leads l where l.clinic_id = ${c.clinicId} and l.archived_at is null ${scopeFilter(tx, c)} group by l.stage`;
      return Object.fromEntries(rows.map((r) => [r.stage, r.n]));
    });
  });

  app.post("/api/leads/check-duplicates", async (req) => {
    const c = need(ctx(req), "lead.write");
    const b = parse(z.object({ phone: z.string().optional().nullable(), email: z.string().optional().nullable(), country: z.string().optional() }), req.body);
    return withClinic(c.clinicId, async (tx) => {
      const p = await findDuplicatePatient(tx, c.clinicId, normalizePhone(b.phone ?? null, b.country), b.email?.toLowerCase() || null);
      if (!p) return { duplicate: null };
      const [l] = await tx`select id, number, stage from leads where patient_id = ${p.id} order by created_at desc limit 1`;
      return { duplicate: { patientId: p.id, name: p.fullName, leadId: l?.id, leadNumber: l?.number, stage: l?.stage } };
    });
  });

  app.post("/api/leads", async (req) => {
    const c = need(ctx(req), "lead.write");
    const b = parse(leadInput, req.body);
    return withClinic(c.clinicId, (tx) => createLead(tx, c, b, { dedupe: "attach" }));
  });

  app.get("/api/leads/:id", async (req) => {
    const c = need(ctx(req), "lead.read");
    const { id } = req.params as { id: string };
    return withClinic(c.clinicId, async (tx) => {
      const [l] = await tx`
        select l.*, p.full_name, p.phone, p.phone_alt, p.email, p.country, p.city, p.language, p.timezone, p.birth_year, p.gender, p.marketing_consent, p.number as patient_number, u.name as owner_name
        from leads l join patients p on p.id = l.patient_id left join users u on u.id = l.owner_id
        where l.id = ${id} ${scopeFilter(tx, c)}`;
      if (!l) throw notFound("Lead");
      const [medical] = c.perms["field.medical"] === "hide" ? [null] : await tx`select flags, age, medications, allergies, notes, updated_at from medical_profiles where patient_id = ${l.patientId}`;
      const events = await tx`select e.id, e.type, e.body, e.data, e.at, u.name as user_name from lead_events e left join users u on u.id = e.user_id where e.lead_id = ${id} order by e.at desc limit 200`;
      const tasks = await tx`select t.id, t.title, t.type, t.priority, t.due_at, t.done_at, t.assignee_id, u.name as assignee_name from tasks t left join users u on u.id = t.assignee_id where t.lead_id = ${id} order by t.done_at nulls first, t.due_at`;
      const otherLeads = await tx`select id, number, stage, created_at from leads where patient_id = ${l.patientId} and id <> ${id} order by created_at desc`;
      return { lead: maskLead(c, l), medical: medical ?? null, events, tasks, otherLeads };
    });
  });

  app.patch("/api/leads/:id", async (req) => {
    const c = need(ctx(req), "lead.write");
    const { id } = req.params as { id: string };
    const b = parse(leadInput.partial().extend({
      stage: z.string().max(40).optional(), lostReason: z.string().max(60).optional().nullable(), lostNote: z.string().max(1000).optional().nullable(),
      nextFollowUpAt: z.iso.datetime().optional().nullable(), archived: z.boolean().optional(),
      phoneAlt: z.string().max(40).optional().nullable(), timezone: z.string().max(60).optional().nullable(),
    }), req.body);
    // .partial() varsayılanları yine uygular (source='manual', temperature='warm'): yalnız gövdede gelen alanlar işlenir
    const sent = new Set(Object.keys((req.body ?? {}) as object));
    for (const k of Object.keys(b)) if (!sent.has(k)) delete (b as Record<string, unknown>)[k];
    if (b.ownerId !== undefined) need(c, "lead.assign");
    if (b.stage === "lost" && !b.lostReason) throw new HttpError(400, "lost_reason_required", "Kayıp nedeni zorunlu");
    if (b.stage && !(await withClinic(c.clinicId, (tx) => salesStageKeys(tx, c.clinicId))).includes(b.stage)) throw new HttpError(400, "bad_stage", "Geçersiz aşama");
    return withClinic(c.clinicId, async (tx) => {
      const [cur] = await tx`select l.id, l.stage, l.owner_id, l.patient_id, p.full_name, p.country from leads l join patients p on p.id = l.patient_id where l.id = ${id} ${scopeFilter(tx, c)}`;
      if (!cur) throw notFound("Lead");
      const L: Record<string, unknown> = {}, P: Record<string, unknown> = {};
      const lmap = { partnerId: "partner_id", temperature: "temperature", source: "source", campaign: "campaign", ownerId: "owner_id", interest: "interest", budget: "budget", travelWindow: "travel_window", issue: "issue", tags: "tags", stage: "stage", lostReason: "lost_reason", lostNote: "lost_note", nextFollowUpAt: "next_follow_up_at" } as const;
      const pmap = { fullName: "full_name", email: "email", country: "country", city: "city", language: "language", phoneAlt: "phone_alt", timezone: "timezone", marketingConsent: "marketing_consent" } as const;
      for (const [k, col] of Object.entries(lmap)) if ((b as Record<string, unknown>)[k] !== undefined) L[col] = (b as Record<string, unknown>)[k];
      for (const [k, col] of Object.entries(pmap)) if ((b as Record<string, unknown>)[k] !== undefined) P[col] = (b as Record<string, unknown>)[k];
      if (b.phone !== undefined) P.phone = normalizePhone(b.phone, b.country ?? cur.country);
      if (b.archived !== undefined) L.archived_at = b.archived ? new Date() : null;
      if (b.custom) { const cc = await cleanCustom(tx, c.clinicId, "lead", b.custom); if (Object.keys(cc).length) await tx`update leads set custom = custom || ${tx.json(cc as never)} where id = ${id}`; L.__custom = cc; }
      const L2 = { ...L }; delete L2.__custom;
      if (Object.keys(L2).length) await tx`update leads set ${tx(L2 as never)}, last_activity_at = now() where id = ${id}`;
      if (Object.keys(P).length) await tx`update patients set ${tx(P as never)} where id = ${cur.patientId}`;
      if (b.stage && b.stage !== cur.stage) {
        await tx`insert into lead_events (clinic_id, lead_id, type, body, data, user_id) values (${c.clinicId}, ${id}, 'stage', ${cur.stage + "→" + b.stage}, ${tx.json({ from: cur.stage, to: b.stage, reason: b.lostReason ?? null } as never)}, ${c.userId})`;
        await emit(tx, c.clinicId, "lead.stage", id, { leadId: id, from: cur.stage, stage: b.stage, name: cur.fullName, ownerId: cur.ownerId });
      }
      if (b.ownerId !== undefined && b.ownerId !== cur.ownerId) {
        await tx`insert into lead_events (clinic_id, lead_id, type, data, user_id) values (${c.clinicId}, ${id}, 'assign', ${tx.json({ from: cur.ownerId, to: b.ownerId } as never)}, ${c.userId})`;
        await emit(tx, c.clinicId, "lead.assigned", id, { leadId: id, ownerId: b.ownerId, name: cur.fullName });
      }
      await audit(tx, c, "lead.update", "lead", id, { ...L, ...P });
      return { ok: true };
    });
  });

  // Not / arama / mesaj kaydı
  app.post("/api/leads/:id/events", async (req) => {
    const c = need(ctx(req), "lead.write");
    const { id } = req.params as { id: string };
    const b = parse(z.object({ type: z.enum(["note", "call", "email", "whatsapp", "sms", "meeting"]), body: z.string().trim().min(1).max(5000), outcome: z.string().max(40).optional() }), req.body);
    return withClinic(c.clinicId, async (tx) => {
      const [l] = await tx`select id, first_response_at from leads l where id = ${id} ${scopeFilter(tx, c)}`;
      if (!l) throw notFound("Lead");
      const [e] = await tx`insert into lead_events (clinic_id, lead_id, type, body, data, user_id) values (${c.clinicId}, ${id}, ${b.type}, ${b.body}, ${tx.json({ outcome: b.outcome ?? null } as never)}, ${c.userId}) returning id, at`;
      const contact = b.type !== "note";
      await tx`update leads set last_activity_at = now(),
        contact_attempts = contact_attempts + ${contact ? 1 : 0},
        first_response_at = coalesce(first_response_at, ${contact ? new Date() : null}),
        stage = case when ${contact} and stage = 'new' then 'contacted' else stage end
        where id = ${id}`;
      return e;
    });
  });

  app.put("/api/leads/:id/medical", async (req) => {
    const c = need(ctx(req), "lead.write");
    if (c.perms["field.medical"] !== "show") throw new HttpError(403, "forbidden", "Tıbbi bilgi yetkisi yok");
    const { id } = req.params as { id: string };
    const b = parse(z.object({ flags: z.array(z.string().max(30)).max(30), age: z.number().int().min(0).max(120).nullable().optional(), medications: z.string().max(2000).nullable().optional(), allergies: z.string().max(2000).nullable().optional(), notes: z.string().max(4000).nullable().optional() }), req.body);
    return withClinic(c.clinicId, async (tx) => {
      const [l] = await tx`select patient_id from leads l where id = ${id} ${scopeFilter(tx, c)}`;
      if (!l) throw notFound("Lead");
      await tx`insert into medical_profiles (patient_id, clinic_id, flags, age, medications, allergies, notes, updated_by)
        values (${l.patientId}, ${c.clinicId}, ${b.flags}, ${b.age ?? null}, ${b.medications ?? null}, ${b.allergies ?? null}, ${b.notes ?? null}, ${c.userId})
        on conflict (patient_id) do update set flags = excluded.flags, age = excluded.age, medications = excluded.medications, allergies = excluded.allergies, notes = excluded.notes, updated_by = excluded.updated_by, updated_at = now()`;
      await audit(tx, c, "patient.medical.update", "patient", l.patientId, { flags: b.flags });
      return { ok: true };
    });
  });

  // Mükerrer birleştirme: kaybeden lead'in olayları/görevleri kazanana taşınır
  app.post("/api/leads/:id/merge", async (req) => {
    const c = need(need(ctx(req), "lead.write"), "lead.delete");
    const { id } = req.params as { id: string };
    const { loserId } = parse(z.object({ loserId: z.uuid() }), req.body);
    if (loserId === id) throw new HttpError(400, "same");
    return withClinic(c.clinicId, async (tx) => {
      const [w] = await tx`select id, patient_id from leads where id = ${id}`;
      const [l] = await tx`select id, patient_id from leads where id = ${loserId}`;
      if (!w || !l) throw notFound("Lead");
      await tx`update lead_events set lead_id = ${id} where lead_id = ${loserId}`;
      await tx`update tasks set lead_id = ${id} where lead_id = ${loserId}`;
      await tx`delete from leads where id = ${loserId}`;
      if (l.patientId !== w.patientId) {
        await tx`update leads set patient_id = ${w.patientId} where patient_id = ${l.patientId}`;
        await tx`delete from patients where id = ${l.patientId} and not exists (select 1 from leads where patient_id = ${l.patientId})`;
      }
      await tx`insert into lead_events (clinic_id, lead_id, type, body, user_id) values (${c.clinicId}, ${id}, 'system', 'merged', ${c.userId})`;
      await audit(tx, c, "lead.merge", "lead", id, { loserId });
      return { ok: true };
    });
  });

  app.delete("/api/leads/:id", async (req) => {
    const c = need(ctx(req), "lead.delete");
    const { id } = req.params as { id: string };
    return withClinic(c.clinicId, async (tx) => {
      const [l] = await tx`delete from leads where id = ${id} returning id`;
      if (!l) throw notFound("Lead");
      await audit(tx, c, "lead.delete", "lead", id);
      return { ok: true };
    });
  });
}
