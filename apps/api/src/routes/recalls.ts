// Recall API: kurallar, yaklaşan recall listesi, elle planlama, erteleme/iptal
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { withClinic } from "../db.ts";
import { ctx, need, parse, parsePatch, notFound } from "../http.ts";
import { audit } from "../services/audit.ts";
import { ensureRecallRules } from "../services/recalls.ts";

const RULE = z.object({ name: z.string().trim().min(1).max(160), match: z.array(z.string().max(40)).max(60).default([]), afterDays: z.number().int().min(1).max(3650),
  repeatDays: z.number().int().min(30).max(3650).nullable().optional(), sequenceId: z.uuid().nullable().optional(), active: z.boolean().default(true) });

export function recallRoutes(app: FastifyInstance) {
  app.get("/api/recall-rules", async (req) => {
    const c = need(ctx(req), "lead.read");
    return withClinic(c.clinicId, async (tx) => { const [cl] = await tx`select default_language from clinics where id = ${c.clinicId}`; await ensureRecallRules(tx, c.clinicId, cl?.defaultLanguage as string);
      return tx`select r.*, s.name as sequence_name, (select count(*)::int from recalls x where x.rule_id = r.id and x.status = 'scheduled') as scheduled from recall_rules r left join sequences s on s.id = r.sequence_id order by r.sort, r.created_at`; });
  });
  app.post("/api/recall-rules", async (req) => {
    const c = need(ctx(req), "settings.manage"); const b = parse(RULE, req.body);
    return withClinic(c.clinicId, async (tx) => { const [r] = await tx`insert into recall_rules (clinic_id, name, match, after_days, repeat_days, sequence_id, active, sort) values (${c.clinicId}, ${b.name}, ${b.match}, ${b.afterDays}, ${b.repeatDays ?? null}, ${b.sequenceId ?? null}, ${b.active}, 100) returning *`;
      await audit(tx, c, "recall_rule.create", "recall_rule", r!.id as string); return r; });
  });
  app.patch("/api/recall-rules/:id", async (req) => {
    const c = need(ctx(req), "settings.manage"); const { id } = req.params as { id: string }; const b = parsePatch(RULE.partial(), req.body);
    const map: Record<string, string> = { name: "name", match: "match", afterDays: "after_days", repeatDays: "repeat_days", sequenceId: "sequence_id", active: "active" };
    const set: Record<string, unknown> = {}; for (const [k, col] of Object.entries(map)) if ((b as any)[k] !== undefined) set[col] = (b as any)[k];
    return withClinic(c.clinicId, async (tx) => { if (Object.keys(set).length) await tx`update recall_rules set ${tx(set as never)} where id = ${id}`; await audit(tx, c, "recall_rule.update", "recall_rule", id, set); return { ok: true }; });
  });
  app.delete("/api/recall-rules/:id", async (req) => {
    const c = need(ctx(req), "settings.manage"); const { id } = req.params as { id: string };
    return withClinic(c.clinicId, async (tx) => { await tx`update recall_rules set active = false where id = ${id}`; await audit(tx, c, "recall_rule.disable", "recall_rule", id); return { ok: true }; });
  });

  app.get("/api/recalls", async (req) => {
    const c = need(ctx(req), "lead.read");
    const q = parse(z.object({ status: z.enum(["scheduled", "active", "done", "canceled"]).default("scheduled"), days: z.coerce.number().int().min(1).max(3650).default(90), leadId: z.uuid().optional() }), req.query);
    return withClinic(c.clinicId, (tx) => tx`select r.*, p.full_name, p.country, l.owner_id, u.name as owner_name from recalls r join leads l on l.id = r.lead_id join patients p on p.id = l.patient_id left join users u on u.id = l.owner_id
      where ${q.leadId ? tx`r.lead_id = ${q.leadId}` : tx`r.status = ${q.status} ${q.status === "scheduled" ? tx`and r.due_at < now() + ${q.days + " days"}::interval` : tx``}`}
        ${c.perms["lead.read"] === "own" ? tx`and l.owner_id = ${c.userId}` : tx``}
      order by r.due_at limit 500`);
  });
  app.post("/api/leads/:id/recalls", async (req) => {
    const c = need(ctx(req), "lead.write"); const { id } = req.params as { id: string };
    const b = parse(z.object({ title: z.string().trim().min(1).max(200), dueAt: z.iso.datetime(), ruleId: z.uuid().optional() }), req.body);
    return withClinic(c.clinicId, async (tx) => { const [l] = await tx`select id from leads where id = ${id}`; if (!l) throw notFound("Lead");
      const [r] = await tx`insert into recalls (clinic_id, lead_id, rule_id, title, due_at) values (${c.clinicId}, ${id}, ${b.ruleId ?? null}, ${b.title}, ${b.dueAt}) returning *`;
      await audit(tx, c, "recall.create", "lead", id, b); return r; });
  });
  app.patch("/api/recalls/:id", async (req) => {
    const c = need(ctx(req), "lead.write"); const { id } = req.params as { id: string };
    const b = parsePatch(z.object({ dueAt: z.iso.datetime(), status: z.enum(["scheduled", "canceled"]), title: z.string().max(200) }).partial(), req.body);
    return withClinic(c.clinicId, async (tx) => {
      const [r] = await tx`select * from recalls where id = ${id}`; if (!r) throw notFound("Recall");
      await tx`update recalls set due_at = ${b.dueAt ?? r.dueAt}, status = ${b.status ?? r.status}, title = ${b.title ?? r.title}, closed_at = ${b.status === "canceled" ? new Date() : r.closedAt} where id = ${id}`;
      await audit(tx, c, "recall.update", "lead", r.leadId as string, b); return { ok: true };
    });
  });
}
