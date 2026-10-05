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

// ── Ekip performansı, AI vs insan, hedefler ──
import { z as zz } from "zod";
export function salesReportRoutes(app: import("fastify").FastifyInstance) {
  app.get("/api/reports/sales", async (req) => {
    const c = need(ctx(req), "reports.view");
    const q = zz.object({ from: zz.iso.date().optional(), to: zz.iso.date().optional() }).parse(req.query);
    const from = q.from ?? new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10), to = q.to ?? new Date().toISOString().slice(0, 10);
    const own = c.perms["reports.view"] === "own";
    return withClinic(c.clinicId, async (tx) => {
      const reps = await tx`
        select u.id as user_id, u.name, m.role,
          count(l.*) filter (where l.created_at::date between ${from} and ${to})::int as leads,
          count(l.*) filter (where l.created_at::date between ${from} and ${to} and l.first_response_at is not null)::int as contacted,
          round(percentile_cont(0.5) within group (order by extract(epoch from l.first_response_at - l.created_at) / 60) filter (where l.created_at::date between ${from} and ${to} and l.first_response_at is not null))::int as median_response_min,
          (select count(*)::int from quotes qq join leads l2 on l2.id = qq.lead_id where l2.owner_id = u.id and qq.created_at::date between ${from} and ${to}) as quotes,
          (select count(*)::int from deals d where d.owner_id = u.id and d.created_at::date between ${from} and ${to}) as deals,
          (select coalesce(sum(p.amount_minor), 0)::bigint from payments p join deals d on d.id = p.deal_id where d.owner_id = u.id and p.received_at::date between ${from} and ${to}) as collected,
          (select count(*)::int from stage_history sh join leads l3 on l3.id = sh.lead_id where l3.owner_id = u.id and sh.pipeline_kind = 'sales' and sh.at::date between ${from} and ${to} and sh.to_stage = 'lost') as lost,
          (select count(*)::int from leads l4 where l4.owner_id = u.id and l4.sla_breached_at is not null and l4.sla_breached_at::date between ${from} and ${to}) as sla_breaches,
          (select count(*)::int from tasks tk where tk.assignee_id = u.id and tk.done_at is null and tk.due_at < now()) as overdue_tasks,
          (select json_build_object('revenue', st.revenue_minor, 'deals', st.deals, 'currency', st.currency) from sales_targets st where st.user_id = u.id and st.month = date_trunc('month', ${to}::date)::date) as target
        from memberships m join users u on u.id = m.user_id left join leads l on l.owner_id = u.id and l.clinic_id = ${c.clinicId}
        where m.clinic_id = ${c.clinicId} and m.active and m.role in ('admin','manager','sales','coordinator') ${own ? tx`and u.id = ${c.userId}` : tx``}
        group by u.id, u.name, m.role order by collected desc, deals desc`;
      // AI vs insan: lead'e ilk giden mesaj AI mı insan mı → teklif ve deal oranları
      const aiVsHuman = await tx`
        with first_out as (select distinct on (cv.lead_id) cv.lead_id, m.ai from messages m join conversations cv on cv.id = m.conversation_id
          where m.direction = 'out' and cv.lead_id is not null order by cv.lead_id, m.id)
        select case when f.ai then 'ai' else 'human' end as first_contact, count(*)::int as leads,
          count(*) filter (where exists (select 1 from quotes qq where qq.lead_id = l.id))::int as quoted,
          count(*) filter (where exists (select 1 from deals d where d.lead_id = l.id))::int as won,
          round(percentile_cont(0.5) within group (order by extract(epoch from l.first_response_at - l.created_at) / 60))::int as median_response_min
        from first_out f join leads l on l.id = f.lead_id where l.created_at::date between ${from} and ${to} group by 1`;
      const [cur] = await tx`select default_currency from clinics where id = ${c.clinicId}`;
      return { from, to, currency: cur!.defaultCurrency, reps, aiVsHuman };
    });
  });
  app.put("/api/targets", async (req) => {
    const c = need(ctx(req), "team.manage");
    const b = zz.object({ userId: zz.uuid(), month: zz.iso.date(), revenueMinor: zz.number().int().min(0), deals: zz.number().int().min(0), currency: zz.string().length(3) }).parse(req.body);
    return withClinic(c.clinicId, async (tx) => {
      await tx`insert into sales_targets (clinic_id, user_id, month, revenue_minor, deals, currency) values (${c.clinicId}, ${b.userId}, date_trunc('month', ${b.month}::date)::date, ${b.revenueMinor}, ${b.deals}, ${b.currency})
        on conflict (clinic_id, user_id, month) do update set revenue_minor = excluded.revenue_minor, deals = excluded.deals, currency = excluded.currency`;
      return { ok: true };
    });
  });
  // panodaki "hedefim" (kendi)
  app.get("/api/targets/me", async (req) => {
    const c = ctx(req);
    return withClinic(c.clinicId, async (tx) => {
      const [t] = await tx`select revenue_minor, deals, currency from sales_targets where user_id = ${c.userId} and month = date_trunc('month', current_date)::date`;
      if (!t) return null;
      const [a] = await tx`select (select count(*)::int from deals where owner_id = ${c.userId} and created_at >= date_trunc('month', current_date)) as deals,
        (select coalesce(sum(p.amount_minor), 0)::bigint from payments p join deals d on d.id = p.deal_id where d.owner_id = ${c.userId} and p.received_at >= date_trunc('month', current_date) and p.currency = ${t.currency}) as revenue`;
      return { target: t, actual: a };
    });
  });
}
