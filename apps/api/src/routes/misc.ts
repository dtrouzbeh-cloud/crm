import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { withClinic } from "../db.ts";
import { ctx, need, parse } from "../http.ts";
import { maskValue } from "@dentaflow/core/permissions";

export function miscRoutes(app: FastifyInstance) {
  app.get("/api/health", async () => ({ ok: true, time: new Date().toISOString() }));

  // Global hasta arama (ad, telefon, e-posta, lead no)
  app.get("/api/search", async (req) => {
    const c = ctx(req);
    const { q } = parse(z.object({ q: z.string().trim().min(1).max(80) }), req.query);
    if (!c.perms["lead.read"] && !c.perms["case.read"]) return [];
    const digits = q.replace(/\D/g, "");
    return withClinic(c.clinicId, async (tx) => {
      const rows = await tx`
        select distinct on (p.id) p.id as patient_id, p.full_name, p.phone, p.country, l.id as lead_id, l.number, l.stage
        from patients p left join leads l on l.patient_id = p.id
        where p.clinic_id = ${c.clinicId} and (p.full_name ilike ${"%" + q + "%"} or p.email ilike ${"%" + q + "%"}
          ${digits.length >= 4 ? tx`or p.phone like ${"%" + digits + "%"}` : tx``} ${/^\d+$/.test(q) ? tx`or l.number = ${Number(q)}` : tx``})
          ${c.perms["lead.read"] === "own" ? tx`and l.owner_id = ${c.userId}` : tx``}
        order by p.id, l.created_at desc limit 8`;
      return rows.map((r) => ({ ...r, phone: maskValue(r.phone, c.perms["field.phone"]) }));
    });
  });

  app.get("/api/notifications", async (req) => {
    const c = ctx(req);
    return withClinic(c.clinicId, async (tx) => {
      const items = await tx`select id, type, title, body, link, read_at, created_at from notifications where user_id = ${c.userId} order by created_at desc limit 50`;
      const [{ unread }] = await tx`select count(*)::int as unread from notifications where user_id = ${c.userId} and read_at is null` as unknown as [{ unread: number }];
      return { items, unread };
    });
  });
  app.post("/api/notifications/read", async (req) => {
    const c = ctx(req);
    const { ids } = parse(z.object({ ids: z.array(z.uuid()).optional() }), req.body ?? {});
    await withClinic(c.clinicId, (tx) => ids?.length
      ? tx`update notifications set read_at = now() where user_id = ${c.userId} and id = any(${ids})`
      : tx`update notifications set read_at = now() where user_id = ${c.userId} and read_at is null`);
    return { ok: true };
  });

  app.get("/api/audit", async (req) => {
    const c = need(ctx(req), "audit.view");
    const q = parse(z.object({ entity: z.string().optional(), entityId: z.string().optional(), userId: z.uuid().optional(), limit: z.coerce.number().max(500).default(100), before: z.coerce.number().optional() }), req.query);
    return withClinic(c.clinicId, (tx) => tx`
      select a.id, a.action, a.entity, a.entity_id, a.data, a.at, u.name as user_name from audit_events a left join users u on u.id = a.user_id
      where a.clinic_id = ${c.clinicId} ${q.entity ? tx`and a.entity = ${q.entity}` : tx``} ${q.entityId ? tx`and a.entity_id = ${q.entityId}` : tx``}
        ${q.userId ? tx`and a.user_id = ${q.userId}` : tx``} ${q.before ? tx`and a.id < ${q.before}` : tx``}
      order by a.id desc limit ${q.limit}`);
  });

  // Pano özeti
  app.get("/api/dashboard", async (req) => {
    const c = ctx(req);
    return withClinic(c.clinicId, async (tx) => {
      const own = c.perms["lead.read"] === "own";
      const [k] = await tx`select
          (select count(*) from leads where clinic_id = ${c.clinicId} and created_at > now() - interval '7 days' ${own ? tx`and owner_id = ${c.userId}` : tx``})::int as new_leads,
          (select count(*) from leads where clinic_id = ${c.clinicId} and stage not in ('won','lost') and archived_at is null ${own ? tx`and owner_id = ${c.userId}` : tx``})::int as active_leads,
          (select percentile_cont(0.5) within group (order by extract(epoch from first_response_at - created_at)/60) from leads where clinic_id = ${c.clinicId} and first_response_at is not null and created_at > now() - interval '30 days')::float as median_response_min`;
      const stages = await tx`select stage, count(*)::int as n from leads where clinic_id = ${c.clinicId} and archived_at is null ${own ? tx`and owner_id = ${c.userId}` : tx``} group by stage`;
      const recent = await tx`select e.type, e.body, e.at, e.lead_id, p.full_name, u.name as user_name from lead_events e join leads l on l.id = e.lead_id join patients p on p.id = l.patient_id left join users u on u.id = e.user_id
        where e.clinic_id = ${c.clinicId} ${own ? tx`and l.owner_id = ${c.userId}` : tx``} order by e.at desc limit 12`;
      return { kpi: k, stages: Object.fromEntries(stages.map((s) => [s.stage, s.n])), recent };
    });
  });
}
