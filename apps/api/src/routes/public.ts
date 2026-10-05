// Herkese açık uçlar: hasta teklif sayfası (token ile). Oturum gerekmez; token hash ile doğrulanır.
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { ownerSql } from "../db.ts";
import { parse, notFound, HttpError, ipOf } from "../http.ts";
import { sha256 } from "../lib/crypto.ts";
import { emit } from "../services/audit.ts";
import { createDealFromQuote } from "../services/quote.ts";
import type { Tx } from "../db.ts";

async function quoteByToken(token: string) {
  const [q] = await ownerSql`select * from quotes where token_hash = ${sha256(token)}`;
  if (!q) throw notFound("Teklif");
  if (q.status !== "accepted" && q.status !== "declined" && q.status !== "revoked" && new Date(q.validUntil) < new Date() && q.status !== "expired") {
    await ownerSql`update quotes set status = 'expired' where id = ${q.id}`; q.status = "expired";
  }
  return q;
}

export function publicRoutes(app: FastifyInstance) {
  app.get("/api/public/q/:token", async (req) => {
    const { token } = req.params as { token: string };
    const q = await quoteByToken(token);
    const [newer] = await ownerSql`select 1 from quotes where case_id = ${q.caseId} and version > ${q.version} limit 1`;
    const providers = await ownerSql`select provider, config from payment_providers where clinic_id = ${q.clinicId} and active`;
    return { id: q.id, number: q.number, version: q.version, status: q.status, validUntil: q.validUntil, snapshot: q.snapshot, response: q.response, acceptedOption: q.acceptedOption, superseded: !!newer,
      payment: providers.map((p) => ({ provider: p.provider, currencies: p.config?.currencies ?? null })) };
  });

  // Görüntülenme: personel önizlemesi (?staff=1 ve oturum) sayılmaz
  app.post("/api/public/q/:token/view", async (req) => {
    const { token } = req.params as { token: string };
    const staff = !!req.sessionUserId;
    const q = await quoteByToken(token);
    await ownerSql.begin(async (tx) => {
      await tx`insert into quote_events (clinic_id, quote_id, type, staff, ip, user_agent) values (${q.clinicId}, ${q.id}, 'view', ${staff}, ${ipOf(req)}, ${req.headers["user-agent"] ?? null})`;
      if (staff) return;
      const first = !q.viewedAt;
      await tx`update quotes set view_count = view_count + 1, viewed_at = coalesce(viewed_at, now()), status = case when status = 'sent' then 'viewed' else status end where id = ${q.id}`;
      if (first) {
        const [l] = await tx`select l.owner_id, p.full_name from leads l join patients p on p.id = l.patient_id where l.id = ${q.leadId}`;
        await tx`insert into lead_events (clinic_id, lead_id, type, body, data) values (${q.clinicId}, ${q.leadId}, 'quote', 'viewed', ${tx.json({ quoteId: q.id } as never)})`;
        await emit(tx as unknown as Tx, q.clinicId, "quote.viewed", q.id, { quoteId: q.id, leadId: q.leadId, name: l?.fullName, ownerId: l?.ownerId, link: "/quotes/" + q.id });
      }
    });
    return { ok: true, staff };
  });

  app.post("/api/public/q/:token/respond", async (req) => {
    const { token } = req.params as { token: string };
    const b = parse(z.object({ action: z.enum(["accept", "changes", "decline"]), option: z.number().int().min(0).max(2).default(0), message: z.string().max(3000).optional(), reason: z.string().max(60).optional(), agree: z.boolean().optional() }), req.body);
    if (req.sessionUserId) throw new HttpError(403, "staff_preview", "Personel önizlemesinde yanıt verilemez");
    const q = await quoteByToken(token);
    if (!["sent", "viewed", "changes"].includes(q.status)) throw new HttpError(409, "closed", "Bu teklif artık yanıtlanamaz");
    if (b.action === "accept" && !b.agree) throw new HttpError(400, "agree_required", "Onay kutusu işaretlenmeli");
    const snap = q.snapshot as any;
    if (!snap.options[b.option]) throw new HttpError(400, "bad_option");
    const result = await ownerSql.begin(async (tx) => {
      const status = b.action === "accept" ? "accepted" : b.action === "changes" ? "changes" : "declined";
      const resp = { action: b.action, option: b.option, message: b.message ?? null, reason: b.reason ?? null, at: new Date().toISOString(), ip: ipOf(req) };
      const [u] = await tx`update quotes set status = ${status}, responded_at = now(), response = ${tx.json(resp as never)}, accepted_option = ${b.action === "accept" ? b.option : null}
        where id = ${q.id} and status in ('sent','viewed','changes') returning id`;
      if (!u) throw new HttpError(409, "closed");
      await tx`insert into quote_events (clinic_id, quote_id, type, data, ip, user_agent) values (${q.clinicId}, ${q.id}, ${b.action}, ${tx.json(resp as never)}, ${ipOf(req)}, ${req.headers["user-agent"] ?? null})`;
      const [l] = await tx`select l.owner_id, p.full_name from leads l join patients p on p.id = l.patient_id where l.id = ${q.leadId}`;
      await tx`insert into lead_events (clinic_id, lead_id, type, body, data) values (${q.clinicId}, ${q.leadId}, 'quote', ${b.action}, ${tx.json({ quoteId: q.id, option: snap.options[b.option].name, message: b.message ?? null, reason: b.reason ?? null } as never)})`;
      let deal = null;
      if (b.action === "accept") deal = await createDealFromQuote(tx as unknown as Tx, q, b.option);
      if (b.action === "changes") {
        await tx`update cases set status = 'diagnosed' where id = ${q.caseId}`;
        await tx`update leads set stage = 'negotiation' where id = ${q.leadId}`;
        await tx`insert into tasks (clinic_id, title, type, priority, due_at, lead_id, assignee_id, entity, entity_id) values (${q.clinicId}, ${l!.fullName + " teklifte değişiklik istedi — revize et"}, 'follow_up', 'high', now() + interval '2 hours', ${q.leadId}, ${l!.ownerId}, 'case', ${q.caseId})`;
      }
      if (b.action === "decline") await tx`update leads set stage = 'lost', lost_reason = ${b.reason ?? "declined"} where id = ${q.leadId}`;
      await emit(tx as unknown as Tx, q.clinicId, b.action === "accept" ? "quote.accepted" : b.action === "changes" ? "quote.changes" : "quote.declined", q.id,
        { quoteId: q.id, leadId: q.leadId, name: l?.fullName, ownerId: l?.ownerId, option: snap.options[b.option].name, dealId: deal?.id ?? null, link: "/quotes/" + q.id });
      return { status, dealId: deal?.id ?? null };
    });
    return result;
  });
}
