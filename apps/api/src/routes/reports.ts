import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { withClinic } from "../db.ts";
import { ctx, need, parse } from "../http.ts";

export function reportRoutes(app: FastifyInstance) {
  app.get("/api/reports", async (req) => {
    const c = need(ctx(req), "reports.view");
    const q = parse(z.object({ from: z.iso.datetime().optional(), to: z.iso.datetime().optional(), by: z.enum(["source", "campaign", "country", "owner", "language"]).default("source") }), req.query);
    const from = q.from ?? new Date(Date.now() - 90 * 86400000).toISOString(), to = q.to ?? new Date().toISOString();
    const own = c.perms["reports.view"] === "own";
    const money = c.perms["field.price"] !== "hide";
    return withClinic(c.clinicId, async (tx) => {
      const scope = own ? tx`and l.owner_id = ${c.userId}` : tx``;
      const dim = q.by === "owner" ? tx`coalesce(u.name, '—')` : q.by === "country" ? tx`coalesce(p.country, '—')` : q.by === "language" ? tx`coalesce(p.language, '—')` : q.by === "campaign" ? tx`coalesce(l.campaign, '—')` : tx`l.source`;
      const [kpi] = await tx`select count(*)::int as leads,
          count(*) filter (where l.first_response_at is not null)::int as contacted,
          count(*) filter (where exists (select 1 from cases k where k.lead_id = l.id))::int as cases,
          count(*) filter (where exists (select 1 from quotes x where x.lead_id = l.id))::int as quoted,
          count(*) filter (where l.stage = 'won')::int as won,
          percentile_cont(0.5) within group (order by extract(epoch from l.first_response_at - l.created_at)/60) filter (where l.first_response_at is not null)::float as median_response_min,
          (count(*) filter (where l.first_response_at - l.created_at < interval '1 hour'))::int as within_hour
        from leads l join patients p on p.id = l.patient_id where l.clinic_id = ${c.clinicId} and l.created_at between ${from} and ${to} ${scope}`;
      const breakdown = await tx`select ${dim} as key, count(*)::int as leads, count(*) filter (where exists (select 1 from quotes x where x.lead_id = l.id))::int as quoted, count(*) filter (where l.stage = 'won')::int as won,
          count(*) filter (where l.stage = 'lost')::int as lost
        from leads l join patients p on p.id = l.patient_id left join users u on u.id = l.owner_id where l.clinic_id = ${c.clinicId} and l.created_at between ${from} and ${to} ${scope} group by 1 order by 2 desc limit 50`;
      const quotes = await tx`select status, count(*)::int as n from quotes x where x.clinic_id = ${c.clinicId} and x.created_at between ${from} and ${to} ${own ? tx`and exists (select 1 from leads l where l.id = x.lead_id and l.owner_id = ${c.userId})` : tx``} group by status`;
      const revenue = money ? await tx`select to_char(date_trunc('month', received_at), 'YYYY-MM') as month, currency, sum(amount_minor)::bigint as total from payments where clinic_id = ${c.clinicId} and received_at > now() - interval '12 months' group by 1, 2 order by 1` : [];
      const monthly = await tx`select to_char(date_trunc('month', l.created_at), 'YYYY-MM') as month, count(*)::int as leads, count(*) filter (where l.stage = 'won')::int as won from leads l where l.clinic_id = ${c.clinicId} and l.created_at > now() - interval '12 months' ${scope} group by 1 order by 1`;
      const treatments = money ? await tx`select line->>'nm' as name, sum((line->>'qty')::int)::int as qty, d.currency, sum((line->>'total')::numeric)::bigint as total
        from deals d, jsonb_array_elements(d.accepted_option->'calc'->'lines') as line where d.clinic_id = ${c.clinicId} and d.created_at between ${from} and ${to} and d.status <> 'lost' group by 1, 3 order by 4 desc limit 20` : [];
      const reps = own ? [] : await tx`select u.name, count(l.*)::int as leads, count(*) filter (where l.stage = 'won')::int as won,
          percentile_cont(0.5) within group (order by extract(epoch from l.first_response_at - l.created_at)/60) filter (where l.first_response_at is not null)::float as median_response_min,
          (select count(*) from lead_events e where e.user_id = u.id and e.at between ${from} and ${to} and e.type in ('call','whatsapp','email'))::int as activities
        from users u join memberships m on m.user_id = u.id and m.clinic_id = ${c.clinicId} left join leads l on l.owner_id = u.id and l.created_at between ${from} and ${to}
        where m.active and m.role in ('sales','manager','admin') group by u.id, u.name order by won desc, leads desc`;
      const lost = await tx`select coalesce(lost_reason, '—') as reason, count(*)::int as n from leads l where l.clinic_id = ${c.clinicId} and l.stage = 'lost' and l.updated_at between ${from} and ${to} ${scope} group by 1 order by 2 desc`;
      return { range: { from, to }, kpi, breakdown, quotes: Object.fromEntries(quotes.map((r) => [r.status, r.n])), revenue, monthly, treatments, reps, lost };
    });
  });
}
