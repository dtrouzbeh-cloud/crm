import { notifyUser } from "../services/notify.ts";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { withClinic } from "../db.ts";
import { ctx, parse, parsePatch, notFound } from "../http.ts";
import { audit } from "../services/audit.ts";

export function taskRoutes(app: FastifyInstance) {
  app.get("/api/tasks", async (req) => {
    const c = ctx(req);
    const q = parse(z.object({ who: z.enum(["mine", "all"]).default("mine"), status: z.enum(["open", "done", "all"]).default("open"),
      from: z.iso.datetime().optional(), to: z.iso.datetime().optional(), leadId: z.uuid().optional(), limit: z.coerce.number().max(500).default(200) }), req.query);
    const all = q.who === "all" && c.perms["lead.read"] === "all";
    return withClinic(c.clinicId, (tx) => tx`
      select t.id, t.title, t.description, t.type, t.priority, t.due_at, t.done_at, t.snoozed_until, t.lead_id, t.entity, t.entity_id, t.assignee_id, t.source_rule_id is not null as auto,
             u.name as assignee_name, p.full_name as patient_name, l.number as lead_number
      from tasks t left join users u on u.id = t.assignee_id left join leads l on l.id = t.lead_id left join patients p on p.id = l.patient_id
      where t.clinic_id = ${c.clinicId}
        ${all ? tx`` : tx`and t.assignee_id = ${c.userId}`}
        ${q.status === "open" ? tx`and t.done_at is null` : q.status === "done" ? tx`and t.done_at is not null` : tx``}
        ${q.from ? tx`and t.due_at >= ${q.from}` : tx``} ${q.to ? tx`and t.due_at < ${q.to}` : tx``}
        ${q.leadId ? tx`and t.lead_id = ${q.leadId}` : tx``}
      order by t.done_at nulls first, coalesce(t.snoozed_until, t.due_at) limit ${q.limit}`);
  });

  app.get("/api/tasks/counts", async (req) => {
    const c = ctx(req);
    return withClinic(c.clinicId, async (tx) => {
      const [r] = await tx`select count(*) filter (where due_at < now())::int as overdue, count(*) filter (where due_at < date_trunc('day', now()) + interval '1 day')::int as today
        from tasks where clinic_id = ${c.clinicId} and assignee_id = ${c.userId} and done_at is null`;
      return r;
    });
  });

  const body = z.object({ title: z.string().trim().min(1).max(300), description: z.string().max(4000).optional().nullable(),
    type: z.string().max(20).default("general"), priority: z.enum(["low", "med", "high"]).default("med"), dueAt: z.iso.datetime(),
    leadId: z.uuid().optional().nullable(), assigneeId: z.uuid().optional().nullable(), entity: z.string().max(20).optional().nullable(), entityId: z.uuid().optional().nullable() });

  app.post("/api/tasks", async (req) => {
    const c = ctx(req);
    const b = parse(body, req.body);
    return withClinic(c.clinicId, async (tx) => {
      const [t] = await tx`insert into tasks (clinic_id, title, description, type, priority, due_at, lead_id, assignee_id, created_by, entity, entity_id)
        values (${c.clinicId}, ${b.title}, ${b.description ?? null}, ${b.type}, ${b.priority}, ${b.dueAt}, ${b.leadId ?? null}, ${b.assigneeId ?? c.userId}, ${c.userId}, ${b.entity ?? null}, ${b.entityId ?? null}) returning id`;
      if (b.assigneeId && b.assigneeId !== c.userId) { const uid = b.assigneeId; setImmediate(() => notifyUser(c.clinicId, uid, "task.assigned", b.title, "/tasks").catch(() => {})); }
      return t;
    });
  });

  app.patch("/api/tasks/:id", async (req) => {
    const c = ctx(req);
    const { id } = req.params as { id: string };
    const b = parsePatch(body.partial().extend({ done: z.boolean().optional(), snoozeMinutes: z.number().int().min(5).max(60 * 24 * 30).optional() }), req.body);
    return withClinic(c.clinicId, async (tx) => {
      const set: Record<string, unknown> = {};
      for (const [k, col] of Object.entries({ title: "title", description: "description", type: "type", priority: "priority", dueAt: "due_at", assigneeId: "assignee_id" }))
        if ((b as Record<string, unknown>)[k] !== undefined) set[col] = (b as Record<string, unknown>)[k];
      if (b.done !== undefined) set.done_at = b.done ? new Date() : null;
      if (b.snoozeMinutes) set.snoozed_until = new Date(Date.now() + b.snoozeMinutes * 60000);
      const [t] = await tx`update tasks set ${tx(set as never)} where id = ${id} returning id, lead_id`;
      if (!t) throw notFound("Görev");
      if (b.done && t.leadId) await tx`update leads set last_activity_at = now() where id = ${t.leadId}`;
      return { ok: true };
    });
  });

  app.delete("/api/tasks/:id", async (req) => {
    const c = ctx(req);
    const { id } = req.params as { id: string };
    return withClinic(c.clinicId, async (tx) => { await tx`delete from tasks where id = ${id}`; await audit(tx, c, "task.delete", "task", id); return { ok: true }; });
  });
}
