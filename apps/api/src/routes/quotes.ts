import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { withClinic } from "../db.ts";
import { config } from "../config.ts";
import { ctx, need, parse, notFound, HttpError } from "../http.ts";
import { audit, emit } from "../services/audit.ts";
import { loadCatalog } from "../services/catalog.ts";
import { calcAll, createQuote, discountLimit, preSendChecks, newId, optName, type Pricing } from "../services/quote.ts";
import { getCaseOr404, planItems } from "./cases.ts";
import { makeOption } from "@dentaflow/core/engine";
import { decrypt } from "../lib/crypto.ts";
import { sendMail } from "../services/mailer.ts";
import { translate, fmtDate } from "@dentaflow/core/i18n";

const option = z.object({
  id: z.string().max(40), name: z.string().max(40), custom: z.string().max(80).optional(), rec: z.boolean(), items: planItems, extras: planItems,
  disc: z.number().min(0).max(100), hotel: z.object({ n: z.number().int().min(0).max(60), free: z.boolean(), hotelId: z.string().nullable().optional() }),
  transfer: z.object({ on: z.boolean(), free: z.boolean() }), flightPct: z.number().min(0).max(100).optional(), flightCost: z.number().min(0).optional(),
  approvedBy: z.string().nullable().optional(), approvalRequested: z.boolean().optional(),
});
const pricingSchema = z.object({
  currency: z.string().length(3), language: z.string().min(2).max(5), nOpt: z.number().int().min(1).max(3), mode: z.enum(["mat", "diff"]),
  options: z.array(option).min(1).max(3), depositBps: z.number().int().min(0).max(10000), validDays: z.number().int().min(1).max(365),
  pricesHidden: z.boolean(), note: z.string().max(3000), syncedRevision: z.number().int().optional(), hotelId: z.string().nullable().optional(),
});

export function quoteRoutes(app: FastifyInstance) {
  // Fiyat taslağını kaydet → hesaplanmış toplamlar döner
  app.put("/api/cases/:id/pricing", async (req) => {
    const c = need(ctx(req), "quote.price");
    const { id } = req.params as { id: string };
    const p = parse(pricingSchema, req.body) as Pricing;
    return withClinic(c.clinicId, async (tx) => {
      const k = await getCaseOr404(tx, c, id);
      const prev = (k.pricing as Pricing | null)?.options ?? [];
      // indirim değişince onay düşer (sunucu tarafında zorunlu)
      for (const o of p.options) { const old = prev.find((x) => x.id === o.id); if (!old || old.disc !== o.disc) { o.approvedBy = null; } else o.approvedBy = old.approvedBy ?? null; }
      await tx`update cases set pricing = ${tx.json(p as never)} where id = ${id}`;
      const cat = await loadCatalog(tx, c.clinicId);
      return { calcs: calcAll(cat, p, k.visits, c.locale) };
    });
  });

  // Plan değiştiyse seçenekleri plandan yeniden üret (ad, indirim, paket ayarları korunur)
  app.post("/api/cases/:id/pricing/resync", async (req) => {
    const c = need(ctx(req), "quote.price");
    const { id } = req.params as { id: string };
    return withClinic(c.clinicId, async (tx) => {
      const k = await getCaseOr404(tx, c, id);
      const p = k.pricing as Pricing; if (!p) throw new HttpError(400, "no_pricing");
      const cat = await loadCatalog(tx, c.clinicId);
      p.options = p.options.map((o, i) => ({ ...makeOption(cat, k.planItems, k.visits, i, newId), name: o.name, custom: o.custom, rec: o.rec, disc: o.disc, hotel: o.hotel, transfer: o.transfer, extras: o.extras, approvedBy: o.approvedBy }));
      p.syncedRevision = k.planRevision;
      await tx`update cases set pricing = ${tx.json(p as never)} where id = ${id}`;
      return { pricing: p };
    });
  });
  app.post("/api/cases/:id/pricing/option", async (req) => {
    const c = need(ctx(req), "quote.price");
    const { id } = req.params as { id: string };
    const { index } = parse(z.object({ index: z.number().int().min(0).max(2) }), req.body);
    return withClinic(c.clinicId, async (tx) => {
      const k = await getCaseOr404(tx, c, id);
      const cat = await loadCatalog(tx, c.clinicId);
      return makeOption(cat, k.planItems, k.visits, index, newId);
    });
  });

  // İndirim onayı
  app.post("/api/cases/:id/pricing/approval", async (req) => {
    const c = ctx(req);
    const { id } = req.params as { id: string };
    const b = parse(z.object({ optionId: z.string(), action: z.enum(["request", "approve", "reject"]), note: z.string().max(500).optional() }), req.body);
    return withClinic(c.clinicId, async (tx) => {
      const k = await getCaseOr404(tx, c, id);
      const p = k.pricing as Pricing; const o = p?.options.find((x) => x.id === b.optionId); if (!o) throw notFound("Seçenek");
      const [cl] = await tx`select settings from clinics where id = ${c.clinicId}`;
      if (b.action === "request") {
        need(c, "quote.price"); o.approvalRequested = true;
        const approvers = await tx`select m.user_id from memberships m where m.clinic_id = ${c.clinicId} and m.active and m.role in ('admin','manager')`;
        const [pt] = await tx`select full_name from patients where id = ${k.patientId}`;
        for (const a of approvers) {
          await tx`insert into tasks (clinic_id, title, type, priority, due_at, lead_id, assignee_id, created_by, entity, entity_id) values (${c.clinicId}, ${"İndirim onayı: " + pt!.fullName + " (%" + o.disc + ")"}, 'general', 'high', now() + interval '2 hours', ${k.leadId}, ${a.userId}, ${c.userId}, 'case', ${id})`;
          await tx`insert into notifications (clinic_id, user_id, type, title, link) values (${c.clinicId}, ${a.userId}, 'discount.request', ${"İndirim onayı bekliyor: " + pt!.fullName + " %" + o.disc}, ${"/cases/" + id + "/price"})`;
        }
        await tx`insert into discount_approvals (clinic_id, case_id, option_id, requested_bps, requested_by) values (${c.clinicId}, ${id}, ${o.id}, ${Math.round(o.disc * 100)}, ${c.userId})`;
      } else {
        need(c, "quote.approve");
        if (o.disc > discountLimit(c, cl!.settings)) throw new HttpError(403, "over_limit", "Bu indirim sizin onay limitinizin de üzerinde");
        o.approvedBy = b.action === "approve" ? c.userId : null; o.approvalRequested = false;
        await tx`update discount_approvals set status = ${b.action === "approve" ? "approved" : "rejected"}, decided_by = ${c.userId}, decided_at = now(), note = ${b.note ?? null} where case_id = ${id} and option_id = ${o.id} and status = 'pending'`;
      }
      await tx`update cases set pricing = ${tx.json(p as never)} where id = ${id}`;
      await audit(tx, c, "discount." + b.action, "case", id, { option: o.id, disc: o.disc });
      return { ok: true, option: o };
    });
  });

  app.get("/api/cases/:id/presend", async (req) => {
    const c = need(ctx(req), "quote.send");
    const { id } = req.params as { id: string };
    return withClinic(c.clinicId, async (tx) => {
      const k = await getCaseOr404(tx, c, id);
      if (!k.pricing) throw new HttpError(400, "no_pricing");
      const [cl] = await tx`select settings from clinics where id = ${c.clinicId}`;
      return { checks: await preSendChecks(tx, c, k, await loadCatalog(tx, c.clinicId), k.pricing as Pricing, cl!.settings), limit: discountLimit(c, cl!.settings) };
    });
  });

  app.post("/api/cases/:id/quotes", async (req) => {
    const c = need(ctx(req), "quote.send");
    const { id } = req.params as { id: string };
    return withClinic(c.clinicId, async (tx) => { await getCaseOr404(tx, c, id); return createQuote(tx, c, id, config.appUrl); });
  });

  // ── Teklif listesi / detay ──
  app.get("/api/quotes", async (req) => {
    const c = need(ctx(req), "case.read");
    const q = parse(z.object({ status: z.string().optional(), limit: z.coerce.number().max(200).default(100) }), req.query);
    return withClinic(c.clinicId, async (tx) => {
      const rows = await tx`select q.id, q.number, q.version, q.status, q.currency, q.total_minor, q.created_at, q.viewed_at, q.view_count, q.valid_until, q.response, q.case_id, q.lead_id,
          p.full_name, jsonb_array_length(q.snapshot->'options') as option_count, (select string_agg(o->>'name', ' / ') from jsonb_array_elements(q.snapshot->'options') o) as option_names
        from quotes q join patients p on p.id = q.patient_id
        where q.clinic_id = ${c.clinicId} ${q.status === "open" ? tx`and q.status in ('sent','viewed')` : q.status ? tx`and q.status = ${q.status}` : tx``}
          ${c.perms["case.read"] === "own" ? tx`and exists (select 1 from leads l where l.id = q.lead_id and l.owner_id = ${c.userId})` : tx``}
        order by q.created_at desc limit ${q.limit}`;
      const counts = await tx`select status, count(*)::int as n from quotes where clinic_id = ${c.clinicId} group by status`;
      return { items: c.perms["field.price"] === "hide" ? rows.map((r) => ({ ...r, totalMinor: null })) : rows, counts: Object.fromEntries(counts.map((r) => [r.status, r.n])) };
    });
  });
  app.get("/api/quotes/:id", async (req) => {
    const c = need(ctx(req), "case.read");
    const { id } = req.params as { id: string };
    return withClinic(c.clinicId, async (tx) => {
      const [q] = await tx`select * from quotes where id = ${id}`; if (!q) throw notFound("Teklif");
      const events = await tx`select type, data, staff, at from quote_events where quote_id = ${id} order by at desc limit 100`;
      const token = q.tokenEnc ? decrypt(q.tokenEnc) : null;
      return { ...q, tokenEnc: undefined, tokenHash: undefined, url: token ? `${config.appUrl}/q/${token}` : null, token, events };
    });
  });
  app.post("/api/quotes/:id/extend", async (req) => {
    const c = need(ctx(req), "quote.send");
    const { id } = req.params as { id: string };
    const { days } = parse(z.object({ days: z.number().int().min(1).max(365) }), req.body);
    return withClinic(c.clinicId, async (tx) => {
      const [q] = await tx`update quotes set valid_until = greatest(valid_until, now()) + ${days + " days"}::interval, status = case when status = 'expired' then 'sent' else status end where id = ${id} returning id, valid_until`;
      if (!q) throw notFound("Teklif");
      await tx`insert into quote_events (clinic_id, quote_id, type, staff, data) values (${c.clinicId}, ${id}, 'extend', true, ${tx.json({ days } as never)})`;
      await audit(tx, c, "quote.extend", "quote", id, { days });
      return q;
    });
  });
  app.post("/api/quotes/:id/revoke", async (req) => {
    const c = need(ctx(req), "quote.send");
    const { id } = req.params as { id: string };
    return withClinic(c.clinicId, async (tx) => {
      await tx`update quotes set status = 'revoked', revoked_at = now() where id = ${id} and status in ('sent','viewed','changes')`;
      await audit(tx, c, "quote.revoke", "quote", id);
      return { ok: true };
    });
  });
  app.post("/api/quotes/:id/email", async (req) => {
    const c = need(ctx(req), "quote.send");
    const { id } = req.params as { id: string };
    const b = parse(z.object({ to: z.email().optional(), message: z.string().max(4000).optional() }), req.body ?? {});
    return withClinic(c.clinicId, async (tx) => {
      const [q] = await tx`select q.*, p.email, p.full_name from quotes q join patients p on p.id = q.patient_id where q.id = ${id}`; if (!q) throw notFound("Teklif");
      const to = b.to ?? q.email; if (!to) throw new HttpError(400, "no_email", "Hastanın e-postası yok");
      const s = q.snapshot as any, L = q.language, url = `${config.appUrl}/q/${decrypt(q.tokenEnc)}`;
      const text = b.message ?? translate(L, "mail_body", { name: s.patient.name.split(" ")[0], clinic: s.clinic.name, link: url, date: fmtDate(q.validUntil, L) });
      const [cl] = await tx`select email from clinics where id = ${c.clinicId}`;
      await sendMail(to, translate(L, "mail_subj", { clinic: s.clinic.name }), text, { clinicId: c.clinicId, fromName: s.clinic.name, replyTo: cl?.email ?? undefined });
      await tx`update quotes set sent_via = array(select distinct unnest(sent_via || '{email}'::text[])) where id = ${id}`;
      await tx`insert into lead_events (clinic_id, lead_id, type, body, data, user_id) values (${c.clinicId}, ${q.leadId}, 'email', ${"Teklif e-postası: " + to}, ${tx.json({ quoteId: id } as never)}, ${c.userId})`;
      return { ok: true };
    });
  });
  app.post("/api/quotes/:id/sent-via", async (req) => {
    const c = need(ctx(req), "quote.send");
    const { id } = req.params as { id: string };
    const { channel } = parse(z.object({ channel: z.enum(["whatsapp", "email", "copy", "pdf", "sms"]) }), req.body);
    return withClinic(c.clinicId, async (tx) => {
      const [q] = await tx`update quotes set sent_via = array(select distinct unnest(sent_via || ${[channel]}::text[])) where id = ${id} returning lead_id`;
      if (q) await tx`insert into lead_events (clinic_id, lead_id, type, body, data, user_id) values (${c.clinicId}, ${q.leadId}, 'quote', 'shared', ${tx.json({ channel, quoteId: id } as never)}, ${c.userId})`;
      return { ok: true };
    });
  });
}
