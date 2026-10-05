import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { withClinic, type Tx } from "../db.ts";
import { ctx, need, parse, notFound, HttpError, type Ctx } from "../http.ts";
import { audit, emit } from "../services/audit.ts";
import { decrypt } from "../lib/crypto.ts";

function dealScope(tx: Tx, c: Ctx) {
  return c.perms["deal.read"] === "own" ? tx`and d.owner_id = ${c.userId}` : tx``;
}
export function stagesFor(visits: number) { return ["accepted", "deposit", "travel", ...Array.from({ length: visits }, (_, i) => `visit_${i + 1}`), "won"]; }

/** Ödeme kaydı + ziyaret dağıtımı + aşama ilerletme (manuel ve sağlayıcı ödemeleri aynı yolu kullanır) */
export async function recordPayment(tx: Tx, clinicId: string, userId: string | null, dealId: string, p: { amountMinor: number; currency: string; method: string; visitNo?: number | null; provider?: string | null; providerRef?: string | null; intentId?: string | null; note?: string | null; receivedAt?: Date }) {
  const [d] = await tx`select d.*, p.full_name from deals d join patients p on p.id = d.patient_id where d.id = ${dealId}`;
  if (!d) throw notFound("Deal");
  if (p.currency !== d.currency) throw new HttpError(400, "currency_mismatch", `Para birimi deal ile aynı olmalı (${d.currency})`);
  if (p.provider && p.providerRef) { const [dup] = await tx`select id from payments where provider = ${p.provider} and provider_ref = ${p.providerRef}`; if (dup) return { id: dup.id, duplicate: true }; }
  const [pay] = await tx`insert into payments (clinic_id, deal_id, intent_id, kind, amount_minor, currency, method, provider, provider_ref, received_at, recorded_by, note)
    values (${clinicId}, ${dealId}, ${p.intentId ?? null}, 'payment', ${p.amountMinor}, ${p.currency}, ${p.method}, ${p.provider ?? null}, ${p.providerRef ?? null}, ${p.receivedAt ?? new Date()}, ${userId}, ${p.note ?? null}) returning id`;
  // dağıtım: belirtilen ziyarete, yoksa ödenmemiş ilk ziyarete
  const visits = await tx`select v.id, v.visit_no, v.planned_minor, coalesce((select sum(a.amount_minor) from payment_allocations a where a.deal_visit_id = v.id), 0)::bigint as paid from deal_visits v where v.deal_id = ${dealId} order by v.visit_no`;
  let left = p.amountMinor;
  const ordered = p.visitNo ? [...visits.filter((v) => v.visitNo === p.visitNo), ...visits.filter((v) => v.visitNo !== p.visitNo)] : visits;
  for (const v of ordered) {
    if (left <= 0) break;
    const room = p.visitNo === v.visitNo ? left : Math.max(0, Number(v.plannedMinor) - Number(v.paid));
    const amt = Math.min(left, room); if (amt <= 0) continue;
    await tx`insert into payment_allocations (payment_id, deal_visit_id, clinic_id, amount_minor) values (${pay!.id}, ${v.id}, ${clinicId}, ${amt})`;
    left -= amt;
  }
  if (left > 0 && visits.length) await tx`insert into payment_allocations (payment_id, deal_visit_id, clinic_id, amount_minor) values (${pay!.id}, ${visits[visits.length - 1]!.id}, ${clinicId}, ${left}) on conflict (payment_id, deal_visit_id) do update set amount_minor = payment_allocations.amount_minor + excluded.amount_minor`;
  if (d.stage === "accepted") await tx`update deals set stage = 'deposit' where id = ${dealId}`;
  await tx`insert into lead_events (clinic_id, lead_id, type, body, data, user_id) values (${clinicId}, ${d.leadId}, 'payment', ${p.method}, ${tx.json({ amountMinor: p.amountMinor, currency: p.currency, dealId } as never)}, ${userId})`;
  const amountText = new Intl.NumberFormat("en", { style: "currency", currency: p.currency }).format(p.amountMinor / 100);
  await emit(tx, clinicId, "payment.succeeded", pay!.id, { paymentId: pay!.id, dealId, leadId: d.leadId, name: d.fullName, ownerId: d.ownerId, amountMinor: p.amountMinor, currency: p.currency, amountText, method: p.method, link: "/deals/" + dealId });
  return { id: pay!.id as string };
}

export function dealRoutes(app: FastifyInstance) {
  app.get("/api/deals", async (req) => {
    const c = need(ctx(req), "deal.read");
    const q = parse(z.object({ status: z.enum(["open", "won", "lost", "postponed", "all"]).default("open") }), req.query);
    return withClinic(c.clinicId, async (tx) => {
      const rows = await tx`
        select d.id, d.number, d.title, d.currency, d.value_minor, d.deposit_minor, d.stage, d.status, d.owner_id, d.created_at, d.lead_id, p.full_name, p.country, u.name as owner_name,
          coalesce((select sum(amount_minor) from payments x where x.deal_id = d.id), 0)::bigint as paid_minor,
          (select count(*) from deal_visits v where v.deal_id = d.id)::int as visit_count,
          (select json_agg(json_build_object('no', v.visit_no, 'arrival', v.arrival_at, 'status', v.status) order by v.visit_no) from deal_visits v where v.deal_id = d.id) as visits
        from deals d join patients p on p.id = d.patient_id left join users u on u.id = d.owner_id
        where d.clinic_id = ${c.clinicId} ${dealScope(tx, c)} ${q.status === "all" ? tx`` : tx`and d.status = ${q.status}`}
        order by d.created_at desc limit 500`;
      return c.perms["field.price"] === "hide" ? rows.map((r) => ({ ...r, valueMinor: null, paidMinor: null, depositMinor: null })) : rows;
    });
  });

  app.get("/api/deals/:id", async (req) => {
    const c = need(ctx(req), "deal.read");
    const { id } = req.params as { id: string };
    return withClinic(c.clinicId, async (tx) => {
      const [d] = await tx`select d.*, p.full_name, p.phone, p.email, p.country, p.language, u.name as owner_name from deals d join patients p on p.id = d.patient_id left join users u on u.id = d.owner_id where d.id = ${id} ${dealScope(tx, c)}`;
      if (!d) throw notFound("Deal");
      const visits = await tx`select v.*, coalesce((select sum(a.amount_minor) from payment_allocations a where a.deal_visit_id = v.id), 0)::bigint as paid_minor from deal_visits v where v.deal_id = ${id} order by v.visit_no`;
      const payments = await tx`select x.*, u.name as recorded_by_name, (select json_agg(json_build_object('visitNo', v.visit_no, 'amount', a.amount_minor)) from payment_allocations a join deal_visits v on v.id = a.deal_visit_id where a.payment_id = x.id) as allocations
        from payments x left join users u on u.id = x.recorded_by where x.deal_id = ${id} order by x.received_at desc`;
      const trips = await tx`select * from trips where deal_id = ${id} order by visit_no`;
      const canPassport = c.perms["field.passport"] !== "hide";
      const runs = await tx`select r.* from transfer_runs r join trips t on t.id = r.trip_id where t.deal_id = ${id} order by r.run_at`;
      const appts = await tx`select a.*, du.name as dentist_name from appointments a left join users du on du.id = a.dentist_id where a.deal_id = ${id} order by a.start_at`;
      const progress = await tx`select * from treatment_progress where deal_id = ${id} order by at`;
      const intents = await tx`select id, provider, amount_minor, currency, status, reference_code, created_at from payment_intents where deal_id = ${id} order by created_at desc limit 20`;
      const hide = c.perms["field.price"] === "hide";
      return { deal: hide ? { ...d, valueMinor: null, depositMinor: null } : d, visits, payments: hide ? [] : payments, stages: stagesFor(visits.length),
        trips: trips.map((t) => ({ ...t, passport: canPassport && t.passportEnc ? JSON.parse(decrypt(t.passportEnc)) : null, passportEnc: undefined })), runs, appointments: appts, progress, intents: hide ? [] : intents };
    });
  });

  app.patch("/api/deals/:id", async (req) => {
    const c = need(ctx(req), "deal.write");
    const { id } = req.params as { id: string };
    const b = parse(z.object({ stage: z.string().max(20), status: z.enum(["open", "won", "lost", "postponed"]), ownerId: z.uuid().nullable(), title: z.string().min(1).max(200), lostReason: z.string().max(60).nullable(), tags: z.array(z.string().max(40)).max(30) }).partial(), req.body);
    return withClinic(c.clinicId, async (tx) => {
      const [d] = await tx`select id, stage, status, lead_id from deals d where d.id = ${id} ${dealScope(tx, c)}`;
      if (!d) throw notFound("Deal");
      const set: Record<string, unknown> = {};
      for (const [k, col] of Object.entries({ stage: "stage", status: "status", ownerId: "owner_id", title: "title", lostReason: "lost_reason", tags: "tags" })) if ((b as any)[k] !== undefined) set[col] = (b as any)[k];
      if (b.stage === "won") { set.status = "won"; set.closed_at = new Date(); }
      if (b.status === "lost" || b.status === "postponed") set.closed_at = b.status === "lost" ? new Date() : null;
      if (b.status === "open") set.closed_at = null;
      await tx`update deals set ${tx(set as never)} where id = ${id}`;
      if (b.stage && b.stage.startsWith("visit_")) await tx`update deal_visits set status = 'done' where deal_id = ${id} and visit_no <= ${Number(b.stage.slice(6))} and status <> 'canceled'`;
      if (b.status === "lost") await tx`update leads set stage = 'lost', lost_reason = coalesce(${b.lostReason ?? null}, lost_reason) where id = ${d.leadId}`;
      await audit(tx, c, "deal.update", "deal", id, b);
      if (b.stage && b.stage !== d.stage) await emit(tx, c.clinicId, "deal.stage", id, { dealId: id, leadId: d.leadId, from: d.stage, stage: b.stage });
      return { ok: true };
    });
  });

  app.patch("/api/deals/:id/visits/:no", async (req) => {
    const c = need(ctx(req), "deal.write");
    const { id, no } = req.params as { id: string; no: string };
    const b = parse(z.object({ arrivalAt: z.iso.datetime().nullable(), departureAt: z.iso.datetime().nullable(), status: z.enum(["planned", "scheduled", "arrived", "in_treatment", "done", "canceled"]), plannedMinor: z.number().int().min(0) }).partial(), req.body);
    return withClinic(c.clinicId, async (tx) => {
      const set: Record<string, unknown> = {};
      for (const [k, col] of Object.entries({ arrivalAt: "arrival_at", departureAt: "departure_at", status: "status", plannedMinor: "planned_minor" })) if ((b as any)[k] !== undefined) set[col] = (b as any)[k];
      const [v] = await tx`update deal_visits set ${tx(set as never)} where deal_id = ${id} and visit_no = ${Number(no)} returning id`;
      if (!v) throw notFound("Ziyaret");
      if (b.arrivalAt) { await tx`update deals set stage = case when stage in ('accepted','deposit') then 'travel' else stage end where id = ${id}`;
        await emit(tx, c.clinicId, "visit.scheduled", id, { dealId: id, visitNo: Number(no), arrivalAt: b.arrivalAt }); }
      await audit(tx, c, "deal.visit.update", "deal", id, { no, ...b });
      return { ok: true };
    });
  });

  app.post("/api/deals/:id/payments", async (req) => {
    const c = need(ctx(req), "payment.record");
    const { id } = req.params as { id: string };
    const b = parse(z.object({ amount: z.number().positive().max(10_000_000), currency: z.string().length(3), method: z.enum(["card", "paypal", "bank_transfer", "cash", "pos", "link", "other"]), visitNo: z.number().int().min(1).max(10).nullable().optional(), note: z.string().max(500).optional(), receivedAt: z.iso.datetime().optional() }), req.body);
    return withClinic(c.clinicId, async (tx) => {
      const r = await recordPayment(tx, c.clinicId, c.userId, id, { amountMinor: Math.round(b.amount * 100), currency: b.currency, method: b.method, visitNo: b.visitNo ?? null, note: b.note ?? null, receivedAt: b.receivedAt ? new Date(b.receivedAt) : undefined });
      await audit(tx, c, "deal.payment.record", "deal", id, b);
      return r;
    });
  });

  // İade / düzeltme: orijinal kayıt silinmez, ters kayıt eklenir
  app.post("/api/deals/:id/payments/:pid/reverse", async (req) => {
    const c = need(ctx(req), "payment.refund");
    const { id, pid } = req.params as { id: string; pid: string };
    const b = parse(z.object({ kind: z.enum(["refund", "adjustment"]).default("refund"), amount: z.number().positive().optional(), note: z.string().min(2).max(500) }), req.body);
    return withClinic(c.clinicId, async (tx) => {
      const [p] = await tx`select * from payments where id = ${pid} and deal_id = ${id} and kind = 'payment'`;
      if (!p) throw notFound("Ödeme");
      const [{ rev }] = await tx`select coalesce(-sum(amount_minor), 0)::bigint as rev from payments where reverses = ${pid}` as unknown as [{ rev: number }];
      const amt = b.amount ? Math.round(b.amount * 100) : Number(p.amountMinor) - Number(rev);
      if (amt <= 0 || amt + Number(rev) > Number(p.amountMinor)) throw new HttpError(400, "over_refund", "İade tutarı ödemeyi aşamaz");
      const [r] = await tx`insert into payments (clinic_id, deal_id, kind, amount_minor, currency, method, recorded_by, note, reverses) values (${c.clinicId}, ${id}, ${b.kind}, ${-amt}, ${p.currency}, ${p.method}, ${c.userId}, ${b.note}, ${pid}) returning id`;
      const allocs = await tx`select deal_visit_id, amount_minor from payment_allocations where payment_id = ${pid}`;
      let left = amt;
      for (const a of allocs.reverse()) { if (left <= 0) break; const x = Math.min(left, Number(a.amountMinor)); await tx`insert into payment_allocations (payment_id, deal_visit_id, clinic_id, amount_minor) values (${r!.id}, ${a.dealVisitId}, ${c.clinicId}, ${-x})`; left -= x; }
      await audit(tx, c, "deal.payment." + b.kind, "deal", id, { payment: pid, amountMinor: amt, note: b.note });
      return { id: r!.id };
    });
  });

  // Plan kalemi ilerleme (klinikte tamamlandı / değişti / ek satış)
  app.post("/api/deals/:id/progress", async (req) => {
    const c = need(ctx(req), "appointment.manage");
    const { id } = req.params as { id: string };
    const b = parse(z.object({ planItemId: z.string().max(40), tooth: z.number().int().optional(), status: z.enum(["done", "skipped", "changed"]), appointmentId: z.uuid().optional(), upsell: z.boolean().optional(), amount: z.number().optional(), note: z.string().max(500).optional() }), req.body);
    return withClinic(c.clinicId, async (tx) => {
      const [r] = await tx`insert into treatment_progress (clinic_id, deal_id, plan_item_id, tooth, status, appointment_id, upsell, amount_minor, note, user_id)
        values (${c.clinicId}, ${id}, ${b.planItemId}, ${b.tooth ?? null}, ${b.status}, ${b.appointmentId ?? null}, ${b.upsell ?? false}, ${b.amount != null ? Math.round(b.amount * 100) : null}, ${b.note ?? null}, ${c.userId}) returning id`;
      if (b.upsell && b.amount) await tx`update deal_visits set upsell_minor = upsell_minor + ${Math.round(b.amount * 100)} where deal_id = ${id} and visit_no = (select coalesce(max(visit_no) filter (where status in ('arrived','in_treatment')), 1) from deal_visits where deal_id = ${id})`;
      return r;
    });
  });
}
