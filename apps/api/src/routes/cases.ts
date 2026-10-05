import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { withClinic, type Tx } from "../db.ts";
import { ctx, need, parse, parsePatch, notFound, HttpError, type Ctx, qbool } from "../http.ts";
import { audit, emit } from "../services/audit.ts";
import { loadCatalog } from "../services/catalog.ts";
import { checkRules, suggestPlan, makeOption, type PlanItem, type Situation } from "@dentaflow/core/engine";
import { translate } from "@dentaflow/core/i18n";
import { maskValue } from "@dentaflow/core/permissions";
import { randomUUID } from "node:crypto";

const planItem = z.object({
  id: z.string().max(40), v: z.number().int().min(1).max(10), tx: z.string().max(40).nullable().optional(), b: z.string().max(40).nullable().optional(),
  teeth: z.array(z.number().int().min(11).max(48)).max(32).optional(), jaws: z.array(z.enum(["u", "l"])).max(2).optional(), qty: z.number().int().min(1).max(100).optional(),
  brand: z.string().max(40).nullable().optional(), manual: z.boolean().optional(), name: z.string().max(200).optional(), price: z.number().min(0).optional(), auto: z.boolean().optional(), note: z.string().max(500).optional(),
});
export const planItems = z.array(planItem).max(200);
const sitEntry = z.object({ s: z.string().max(12).optional(), f: z.record(z.string(), z.boolean()).optional() });

function caseScope(tx: Tx, c: Ctx) {
  const s = c.perms["case.read"];
  if (s === "all") return tx``;
  if (s === "team") return tx`and (k.owner_id = ${c.userId} or k.dentist_id = ${c.userId} or k.owner_id in (select user_id from memberships where reports_to = ${c.userId}))`;
  return tx`and (k.owner_id = ${c.userId} or k.dentist_id = ${c.userId})`;
}
export async function getCaseOr404(tx: Tx, c: Ctx, id: string) {
  const [k] = await tx`select k.* from cases k where k.id = ${id} ${caseScope(tx, c)}`;
  if (!k) throw notFound("Vaka");
  return k;
}
export async function medicalOf(tx: Tx, patientId: string) {
  const [m] = await tx`select flags, age from medical_profiles where patient_id = ${patientId}`;
  return { flags: (m?.flags as string[]) ?? [], age: (m?.age as number) ?? null };
}
const jawLabel = (lang: string) => (j: "u" | "l") => translate(lang, j === "u" ? "jaw_u" : "jaw_l");

export function caseRoutes(app: FastifyInstance) {
  app.get("/api/cases", async (req) => {
    const c = need(ctx(req), "case.read");
    const q = parse(z.object({ status: z.string().optional(), mine: qbool.optional(), limit: z.coerce.number().max(200).default(60) }), req.query);
    return withClinic(c.clinicId, async (tx) => {
      const rows = await tx`
        select k.id, k.number, k.status, k.dentist_id, k.owner_id, k.visits, k.situation, k.plan_items, k.created_at, k.updated_at, k.lead_id,
               p.full_name, p.country, mp.flags, mp.age, du.name as dentist_name,
               (select json_build_object('status', q.status, 'total', q.total_minor, 'currency', q.currency, 'id', q.id) from quotes q where q.case_id = k.id and q.status <> 'superseded' order by q.created_at desc limit 1) as last_quote
        from cases k join patients p on p.id = k.patient_id left join medical_profiles mp on mp.patient_id = k.patient_id left join users du on du.id = k.dentist_id
        where k.clinic_id = ${c.clinicId} ${caseScope(tx, c)} ${q.status ? tx`and k.status = ${q.status}` : tx``} ${q.mine ? tx`and (k.dentist_id = ${c.userId} or k.owner_id = ${c.userId})` : tx``}
        order by k.updated_at desc limit ${q.limit}`;
      const counts = await tx`select status, count(*)::int as n from cases k where k.clinic_id = ${c.clinicId} ${caseScope(tx, c)} group by status`;
      const hideMoney = c.perms["field.price"] === "hide";
      return { items: rows.map((r) => ({ ...r, lastQuote: hideMoney && r.lastQuote ? { ...r.lastQuote, total: null } : r.lastQuote, flags: c.perms["field.medical"] === "hide" ? [] : r.flags })), counts: Object.fromEntries(counts.map((r) => [r.status, r.n])) };
    });
  });

  // Lead'den vaka aç
  app.post("/api/cases", async (req) => {
    const c = need(ctx(req), "case.write");
    const { leadId } = parse(z.object({ leadId: z.uuid() }), req.body);
    return withClinic(c.clinicId, async (tx) => {
      const [l] = await tx`select l.id, l.patient_id, l.owner_id, p.full_name from leads l join patients p on p.id = l.patient_id where l.id = ${leadId}`;
      if (!l) throw notFound("Lead");
      const [open] = await tx`select id from cases where lead_id = ${leadId} and status not in ('completed','canceled') limit 1`;
      if (open) return { id: open.id, existing: true };
      const [{ n }] = await tx`select next_number(${c.clinicId}, 'case') as n` as unknown as [{ n: string }];
      const [k] = await tx`insert into cases (clinic_id, number, lead_id, patient_id, owner_id, created_by) values (${c.clinicId}, ${n}, ${leadId}, ${l.patientId}, ${l.ownerId ?? c.userId}, ${c.userId}) returning id, number`;
      await tx`update leads set stage = case when stage in ('new','contacted','interested','awaiting_info') then 'in_diagnosis' else stage end, last_activity_at = now() where id = ${leadId}`;
      await tx`insert into lead_events (clinic_id, lead_id, type, body, data, user_id) values (${c.clinicId}, ${leadId}, 'case', 'opened', ${tx.json({ caseId: k!.id } as never)}, ${c.userId})`;
      await audit(tx, c, "case.create", "case", k!.id);
      await emit(tx, c.clinicId, "case.created", k!.id, { caseId: k!.id, leadId, name: l.fullName, ownerId: l.ownerId });
      return { id: k!.id, number: k!.number };
    });
  });

  app.get("/api/cases/:id", async (req) => {
    const c = need(ctx(req), "case.read");
    const { id } = req.params as { id: string };
    return withClinic(c.clinicId, async (tx) => {
      const k = await getCaseOr404(tx, c, id);
      const [p] = await tx`select p.id, p.full_name, p.phone, p.email, p.country, p.language, l.id as lead_id, l.number as lead_number, l.issue, l.interest, l.owner_id, ou.name as owner_name
        from patients p join leads l on l.id = ${k.leadId} left join users ou on ou.id = l.owner_id where p.id = ${k.patientId}`;
      const medical = c.perms["field.medical"] === "hide" ? null : (await tx`select flags, age, medications, allergies, notes from medical_profiles where patient_id = ${k.patientId}`)[0] ?? null;
      const files = await tx`select id, kind, name, mime, size_bytes, created_at from files where entity = 'case' and entity_id = ${id} order by created_at`;
      const notes = await tx`select n.id, n.body, n.correction_of, n.at, u.name as user_name from case_notes n left join users u on u.id = n.user_id where n.case_id = ${id} order by n.at`;
      const messages = await tx`select m.id, m.body, m.at, m.user_id, u.name as user_name from case_messages m left join users u on u.id = m.user_id where m.case_id = ${id} order by m.at desc limit 100`;
      const quotes = await tx`select id, number, version, status, total_minor, currency, created_at, viewed_at, view_count, accepted_option from quotes where case_id = ${id} order by created_at desc`;
      const [deal] = await tx`select id, number, stage, status from deals where case_id = ${id} order by created_at desc limit 1`;
      const hideMoney = c.perms["field.price"] === "hide";
      return { case: { ...k, pricing: hideMoney ? null : k.pricing }, patient: p ? { ...p, phone: maskValue(p.phone, c.perms["field.phone"]), email: maskValue(p.email, c.perms["field.email"]) } : null,
        medical, files, notes, messages: messages.reverse(), quotes: hideMoney ? quotes.map((q) => ({ ...q, totalMinor: null })) : quotes, deal: deal ?? null };
    });
  });

  app.patch("/api/cases/:id", async (req) => {
    const c = need(ctx(req), "case.write");
    const { id } = req.params as { id: string };
    const b = parsePatch(z.object({ dentistId: z.uuid().nullable(), ownerId: z.uuid().nullable(), dentistNote: z.string().max(4000).nullable(), step: z.number().int().min(1).max(4), status: z.enum(["awaiting_info", "pool", "canceled"]) }).partial(), req.body);
    return withClinic(c.clinicId, async (tx) => {
      await getCaseOr404(tx, c, id);
      const set: Record<string, unknown> = {};
      for (const [k, col] of Object.entries({ dentistId: "dentist_id", ownerId: "owner_id", dentistNote: "dentist_note", step: "step", status: "status" })) if ((b as any)[k] !== undefined) set[col] = (b as any)[k];
      if (Object.keys(set).length) await tx`update cases set ${tx(set as never)} where id = ${id}`;
      await audit(tx, c, "case.update", "case", id, b);
      return { ok: true };
    });
  });

  app.post("/api/cases/:id/claim", async (req) => {
    const c = need(ctx(req), "case.diagnose");
    const { id } = req.params as { id: string };
    return withClinic(c.clinicId, async (tx) => {
      const [k] = await tx`update cases set dentist_id = ${c.userId} where id = ${id} and (dentist_id is null or dentist_id = ${c.userId}) returning id`;
      if (!k) throw new HttpError(409, "already_claimed", "Vaka başka bir hekime atanmış");
      await audit(tx, c, "case.claim", "case", id);
      return { ok: true };
    });
  });

  app.put("/api/cases/:id/situation", async (req) => {
    const c = need(ctx(req), "case.write");
    const { id } = req.params as { id: string };
    const b = parse(z.object({ situation: z.record(z.string().regex(/^[1-4][1-8]$/), sitEntry), done: z.boolean().optional(), skipped: z.boolean().optional() }), req.body);
    return withClinic(c.clinicId, async (tx) => {
      await getCaseOr404(tx, c, id);
      await tx`update cases set situation = ${tx.json(b.situation as never)}, situation_done = coalesce(${b.done ?? null}, situation_done), situation_skipped = coalesce(${b.skipped ?? null}, situation_skipped) where id = ${id}`;
      return { ok: true };
    });
  });

  // Plan taslağı (iyimser eşzamanlılık: expectedRevision)
  app.put("/api/cases/:id/plan", async (req) => {
    const c = need(ctx(req), "case.write");
    const { id } = req.params as { id: string };
    const b = parse(z.object({ visits: z.number().int().min(1).max(10), items: planItems, expectedRevision: z.number().int() }), req.body);
    return withClinic(c.clinicId, async (tx) => {
      const k = await getCaseOr404(tx, c, id);
      const [u] = await tx`update cases set visits = ${b.visits}, plan_items = ${tx.json(b.items as never)}, plan_revision = plan_revision + 1 where id = ${id} and plan_revision = ${b.expectedRevision} returning plan_revision`;
      if (!u) throw new HttpError(409, "revision_conflict", "Plan başka biri tarafından değiştirildi. Sayfayı yenileyin.");
      const cat = await loadCatalog(tx, c.clinicId);
      const lang = c.locale;
      const hits = checkRules(cat, k.situation as Situation, b.items as PlanItem[], b.visits, await medicalOf(tx, k.patientId), lang, jawLabel(lang));
      return { revision: u.planRevision, rules: hits };
    });
  });

  app.post("/api/cases/:id/suggest", async (req) => {
    const c = need(ctx(req), "case.write");
    const { id } = req.params as { id: string };
    return withClinic(c.clinicId, async (tx) => {
      const k = await getCaseOr404(tx, c, id);
      const items = suggestPlan(k.situation as Situation, () => randomUUID().slice(0, 8));
      return { items, visits: Math.max(1, ...items.map((i) => i.v)) };
    });
  });

  // Teşhisi tamamla: engelleyiciler → 422, onaylanmamış uyarılar → 409, aksi halde Diagnosed
  app.post("/api/cases/:id/diagnose", async (req) => {
    const c = need(ctx(req), "case.diagnose");
    const { id } = req.params as { id: string };
    const { acknowledge } = parse(z.object({ acknowledge: z.boolean().default(false) }), req.body ?? {});
    return withClinic(c.clinicId, async (tx) => {
      const k = await getCaseOr404(tx, c, id);
      const items = k.planItems as PlanItem[];
      if (!items.length) throw new HttpError(400, "empty_plan", "Plan boş");
      const cat = await loadCatalog(tx, c.clinicId);
      const hits = checkRules(cat, k.situation as Situation, items, k.visits, await medicalOf(tx, k.patientId), c.locale, jawLabel(c.locale));
      const blocks = hits.filter((h) => h.sev === "block"), warns = hits.filter((h) => h.sev !== "block");
      if (blocks.length) throw new HttpError(422, "rule_block", "Kritik klinik kural ihlali", { rules: blocks });
      if (warns.length && !acknowledge) throw new HttpError(409, "rule_warnings", "Klinik uyarılar — lütfen inceleyin", { rules: warns });
      const first = ["pool", "awaiting_info"].includes(k.status);
      let pricing = k.pricing as Record<string, unknown> | null;
      if (!pricing) {
        const [pl] = await tx`select p.country, p.language from patients p where p.id = ${k.patientId}`;
        const [cl] = await tx`select default_currency, settings from clinics where id = ${c.clinicId}`;
        const curByCountry: Record<string, string> = { GB: "GBP", US: "USD", SA: "SAR", AE: "AED", TR: "TRY", AU: "USD", CA: "USD" };
        const op = makeOption(cat, items, k.visits, 0, () => randomUUID().slice(0, 8)); op.rec = true;
        pricing = { currency: curByCountry[pl?.country] ?? cl!.defaultCurrency, language: ["tr", "en", "de", "ar"].includes(pl?.language) ? pl!.language : "en", nOpt: 1, mode: "mat",
          options: [op], depositBps: cl!.settings?.quote?.depositBps ?? 1000, validDays: cl!.settings?.quote?.validDays ?? 14, pricesHidden: false, note: "", syncedRevision: k.planRevision };
      }
      await tx`update cases set status = case when status in ('pool','awaiting_info','quoted') then 'diagnosed' else status end, dx_at = now(), dx_by = ${c.userId},
        dx_ack = ${tx.json(warns as never)}, dentist_id = coalesce(dentist_id, ${c.role === "dentist" ? c.userId : null}), pricing = ${tx.json(pricing as never)}, step = greatest(step, 3) where id = ${id}`;
      await tx`update leads set stage = case when stage in ('won','lost','quote_sent','negotiation') then stage else 'plan_ready' end, last_activity_at = now() where id = ${k.leadId}`;
      await tx`insert into lead_events (clinic_id, lead_id, type, body, data, user_id) values (${c.clinicId}, ${k.leadId}, 'case', 'diagnosed', ${tx.json({ caseId: id, warnings: warns.map((w) => w.code) } as never)}, ${c.userId})`;
      await audit(tx, c, "case.diagnose", "case", id, { warnings: warns.map((w) => w.code), items: items.length });
      const [l] = await tx`select p.full_name, l.owner_id from leads l join patients p on p.id = l.patient_id where l.id = ${k.leadId}`;
      if (first) await emit(tx, c.clinicId, "case.diagnosed", id, { caseId: id, leadId: k.leadId, name: l?.fullName, ownerId: l?.ownerId });
      return { ok: true, warnings: warns };
    });
  });

  // Klinik notlar (düzenlenemez) ve vaka sohbeti
  app.post("/api/cases/:id/notes", async (req) => {
    const c = need(ctx(req), "case.write");
    const { id } = req.params as { id: string };
    const b = parse(z.object({ body: z.string().trim().min(1).max(5000), correctionOf: z.number().int().optional() }), req.body);
    return withClinic(c.clinicId, async (tx) => {
      await getCaseOr404(tx, c, id);
      const [n] = await tx`insert into case_notes (clinic_id, case_id, body, correction_of, user_id) values (${c.clinicId}, ${id}, ${b.body}, ${b.correctionOf ?? null}, ${c.userId}) returning id, at`;
      return n;
    });
  });
  app.post("/api/cases/:id/messages", async (req) => {
    const c = need(ctx(req), "case.read");
    const { id } = req.params as { id: string };
    const b = parse(z.object({ body: z.string().trim().min(1).max(4000) }), req.body);
    return withClinic(c.clinicId, async (tx) => {
      const k = await getCaseOr404(tx, c, id);
      const [m] = await tx`insert into case_messages (clinic_id, case_id, body, user_id) values (${c.clinicId}, ${id}, ${b.body}, ${c.userId}) returning id, at`;
      for (const uid of new Set([k.dentistId, k.ownerId].filter((x) => x && x !== c.userId)))
        await tx`insert into notifications (clinic_id, user_id, type, title, body, link) values (${c.clinicId}, ${uid}, 'case.message', ${"Vaka #" + k.number + " — " + c.name}, ${b.body.slice(0, 140)}, ${"/cases/" + id})`;
      return m;
    });
  });
}
