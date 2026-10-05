import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { withClinic, ownerSql } from "../db.ts";
import { config, billing } from "../config.ts";
import { ctx, need, parse, notFound, HttpError } from "../http.ts";
import { audit } from "../services/audit.ts";
import { verifyStripeSignature } from "../services/payments.ts";

export async function usageOf(clinicId: string) {
  const [u] = await ownerSql`select
    (select count(*) from memberships where clinic_id = ${clinicId} and active)::int as seats,
    (select count(*) from quotes where clinic_id = ${clinicId} and created_at >= date_trunc('month', now()))::int as quotes_month,
    (select count(*) from channel_accounts where clinic_id = ${clinicId} and channel = 'whatsapp' and status <> 'disconnected')::int as wa_numbers,
    (select count(*) from leads where clinic_id = ${clinicId})::int as leads,
    (select coalesce(sum(size_bytes),0) from files where clinic_id = ${clinicId})::bigint as storage_bytes`;
  return u!;
}
export async function limitsOf(clinicId: string) {
  const [s] = await ownerSql`select s.*, p.limits, p.features, p.name as plan_name, p.clinic_price_minor, p.seat_price_minor, p.included_seats, p.currency from subscriptions s join plans p on p.id = s.plan_id where s.clinic_id = ${clinicId}`;
  return s;
}
/** Kota kontrolü (yumuşak): aşımda 402 döner, platform yöneticisi istisna tanıyabilir */
export async function enforce(clinicId: string, what: "quotes" | "seats" | "wa") {
  const s = await limitsOf(clinicId); if (!s) return;
  if (s.status === "canceled" || (s.status === "trialing" && s.trialEndsAt && new Date(s.trialEndsAt) < new Date())) throw new HttpError(402, "subscription_required", "Abonelik gerekli — deneme süresi doldu");
  const u = await usageOf(clinicId); const L = s.limits ?? {};
  if (what === "quotes" && L.quotesPerMonth > 0 && u.quotesMonth >= L.quotesPerMonth) throw new HttpError(402, "quota_quotes", `Aylık teklif kotası doldu (${L.quotesPerMonth})`);
  if (what === "seats" && u.seats >= s.seats + 0) throw new HttpError(402, "quota_seats", `Koltuk sayısı doldu (${s.seats}) — Abonelikten koltuk ekleyin`);
  if (what === "wa" && L.waNumbers > 0 && u.waNumbers >= L.waNumbers) throw new HttpError(402, "quota_wa", `WhatsApp numara limiti (${L.waNumbers})`);
}
const priceFor = (p: any, seats: number, period: string) => {
  const extra = Math.max(0, seats - p.includedSeats), monthly = p.clinicPriceMinor + extra * p.seatPriceMinor;
  return period === "yearly" ? Math.round(monthly * 12 * (1 - p.yearlyDiscountBps / 10000)) : monthly;
};

function requireAdmin(req: FastifyRequest) {
  if (!req.sessionUserId) throw new HttpError(401, "unauthorized");
  return ownerSql`select is_platform_admin from users where id = ${req.sessionUserId}`.then((r) => { if (!r[0]?.isPlatformAdmin) throw new HttpError(403, "forbidden"); return req.sessionUserId!; });
}

export function saasRoutes(app: FastifyInstance) {
  // ── Klinik aboneliği ──
  app.get("/api/billing", async (req) => {
    const c = ctx(req);
    const plans = await ownerSql`select * from plans where active order by sort`;
    const s = await limitsOf(c.clinicId);
    return { plans: plans.map((p) => ({ ...p, examples: [3, 5, 10].map((n) => ({ seats: n, monthly: priceFor(p, n, "monthly"), yearly: priceFor(p, n, "yearly") })) })), subscription: s, usage: await usageOf(c.clinicId), stripe: !!billing.stripeSecret };
  });
  app.post("/api/billing/checkout", async (req) => {
    const c = need(ctx(req), "billing.manage");
    const b = parse(z.object({ planId: z.string(), period: z.enum(["monthly", "yearly"]), seats: z.number().int().min(1).max(500) }), req.body);
    if (!billing.stripeSecret) throw new HttpError(501, "billing_offline", "Online ödeme yakında — lütfen bizimle iletişime geçin");
    const [p] = await ownerSql`select * from plans where id = ${b.planId} and active`; if (!p) throw notFound("Plan");
    const [cl] = await ownerSql`select c.name, c.email, s.provider_customer_id from clinics c join subscriptions s on s.clinic_id = c.id where c.id = ${c.clinicId}`;
    const interval = b.period === "yearly" ? "year" : "month", mult = b.period === "yearly" ? 12 * (1 - p.yearlyDiscountBps / 10000) : 1;
    const extra = Math.max(0, b.seats - p.includedSeats);
    const f = new URLSearchParams({ mode: "subscription", success_url: `${config.appUrl}/settings/billing?ok=1`, cancel_url: `${config.appUrl}/settings/billing`, client_reference_id: c.clinicId, "metadata[clinic_id]": c.clinicId, "metadata[plan_id]": p.id, "metadata[seats]": String(b.seats), "metadata[period]": b.period, "subscription_data[metadata][clinic_id]": c.clinicId,
      "line_items[0][price_data][currency]": p.currency.toLowerCase(), "line_items[0][price_data][unit_amount]": String(Math.round(p.clinicPriceMinor * mult)), "line_items[0][price_data][recurring][interval]": interval, "line_items[0][price_data][product_data][name]": `DentaFlow ${p.name} — clinic`, "line_items[0][quantity]": "1" });
    if (extra) { f.set("line_items[1][price_data][currency]", p.currency.toLowerCase()); f.set("line_items[1][price_data][unit_amount]", String(Math.round(p.seatPriceMinor * mult))); f.set("line_items[1][price_data][recurring][interval]", interval); f.set("line_items[1][price_data][product_data][name]", `DentaFlow ${p.name} — seat`); f.set("line_items[1][quantity]", String(extra)); }
    if (cl?.providerCustomerId) f.set("customer", cl.providerCustomerId); else if (cl?.email) f.set("customer_email", cl.email);
    const r = await fetch("https://api.stripe.com/v1/checkout/sessions", { method: "POST", headers: { Authorization: `Bearer ${billing.stripeSecret}`, "Content-Type": "application/x-www-form-urlencoded" }, body: f });
    const j = await r.json() as any; if (!r.ok) throw new HttpError(502, "stripe_error", j.error?.message);
    return { url: j.url };
  });
  app.post("/api/billing/portal", async (req) => {
    const c = need(ctx(req), "billing.manage");
    const [s] = await ownerSql`select provider_customer_id from subscriptions where clinic_id = ${c.clinicId}`;
    if (!billing.stripeSecret || !s?.providerCustomerId) throw new HttpError(400, "no_customer", "Aktif bir ödeme hesabı yok");
    const r = await fetch("https://api.stripe.com/v1/billing_portal/sessions", { method: "POST", headers: { Authorization: `Bearer ${billing.stripeSecret}`, "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ customer: s.providerCustomerId, return_url: `${config.appUrl}/settings/billing` }) });
    const j = await r.json() as any; return { url: j.url };
  });
  app.post("/api/public/billing/stripe/webhook", async (req, reply) => {
    if (!verifyStripeSignature((req as any).rawBody, req.headers["stripe-signature"] as string, billing.stripeWebhookSecret)) return reply.status(400).send({ error: "bad_signature" });
    const ev = req.body as any, o = ev.data?.object ?? {};
    if (ev.type === "checkout.session.completed" && o.mode === "subscription") {
      const m = o.metadata ?? {};
      await ownerSql`update subscriptions set plan_id = ${m.plan_id}, seats = ${Number(m.seats)}, billing_period = ${m.period}, status = 'active', provider = 'stripe', provider_customer_id = ${o.customer}, provider_subscription_id = ${o.subscription}, updated_at = now() where clinic_id = ${m.clinic_id}`;
      await ownerSql`update clinics set status = 'active' where id = ${m.clinic_id}`;
    }
    if (ev.type === "customer.subscription.updated" || ev.type === "customer.subscription.deleted") {
      const st = ev.type.endsWith("deleted") ? "canceled" : ({ active: "active", past_due: "past_due", canceled: "canceled", unpaid: "past_due", trialing: "trialing" } as Record<string, string>)[o.status] ?? "active";
      await ownerSql`update subscriptions set status = ${st}, current_period_end = to_timestamp(${o.current_period_end ?? 0}), cancel_at_period_end = ${!!o.cancel_at_period_end}, updated_at = now() where provider_subscription_id = ${o.id}`;
      await ownerSql`update clinics set status = ${st === "canceled" ? "canceled" : st === "past_due" ? "past_due" : "active"} where id = (select clinic_id from subscriptions where provider_subscription_id = ${o.id})`;
    }
    return { ok: true };
  });

  // ── Platform yönetimi ──
  app.get("/api/admin/stats", async (req) => {
    await requireAdmin(req);
    const [s] = await ownerSql`select (select count(*) from clinics)::int as clinics, (select count(*) from clinics where status = 'active')::int as active, (select count(*) from clinics where status = 'trial')::int as trial,
      (select count(*) from users)::int as users, (select count(*) from leads)::int as leads, (select count(*) from quotes)::int as quotes, (select count(*) from deals)::int as deals,
      (select count(*) from clinics where created_at > now() - interval '30 days')::int as new30`;
    const mrr = await ownerSql`select p.currency, sum(case when s.billing_period = 'yearly' then (p.clinic_price_minor + greatest(0, s.seats - p.included_seats) * p.seat_price_minor) * (1 - p.yearly_discount_bps/10000.0) else p.clinic_price_minor + greatest(0, s.seats - p.included_seats) * p.seat_price_minor end)::bigint as mrr
      from subscriptions s join plans p on p.id = s.plan_id where s.status = 'active' group by p.currency`;
    return { ...s, mrr };
  });
  app.get("/api/admin/clinics", async (req) => {
    await requireAdmin(req);
    return ownerSql`select c.id, c.name, c.slug, c.country, c.status, c.created_at, s.plan_id, s.status as sub_status, s.seats, s.trial_ends_at, s.billing_period, s.provider,
      (select count(*) from memberships m where m.clinic_id = c.id and m.active)::int as members, (select count(*) from leads l where l.clinic_id = c.id)::int as leads,
      (select count(*) from quotes q where q.clinic_id = c.id and q.created_at > now() - interval '30 days')::int as quotes30, (select max(last_login_at) from users u join memberships m on m.user_id = u.id where m.clinic_id = c.id) as last_login
      from clinics c left join subscriptions s on s.clinic_id = c.id order by c.created_at desc limit 500`;
  });
  app.patch("/api/admin/clinics/:id", async (req) => {
    const uid = await requireAdmin(req); const { id } = req.params as { id: string };
    const b = parse(z.object({ status: z.enum(["trial", "active", "past_due", "suspended", "canceled"]), planId: z.string(), seats: z.number().int().min(1), extendTrialDays: z.number().int().min(1).max(365), manualPaidUntil: z.iso.datetime() }).partial(), req.body);
    if (b.status) await ownerSql`update clinics set status = ${b.status} where id = ${id}`;
    if (b.planId) await ownerSql`update subscriptions set plan_id = ${b.planId} where clinic_id = ${id}`;
    if (b.seats) await ownerSql`update subscriptions set seats = ${b.seats} where clinic_id = ${id}`;
    if (b.extendTrialDays) await ownerSql`update subscriptions set trial_ends_at = greatest(coalesce(trial_ends_at, now()), now()) + ${b.extendTrialDays + " days"}::interval, status = 'trialing' where clinic_id = ${id}`;
    if (b.manualPaidUntil) await ownerSql`update subscriptions set status = 'active', provider = 'manual', current_period_end = ${b.manualPaidUntil} where clinic_id = ${id}`;
    await ownerSql`insert into audit_events (clinic_id, user_id, action, entity, entity_id, data) values (${id}, ${uid}, 'platform.clinic.update', 'clinic', ${id}, ${ownerSql.json(b as never)})`;
    return { ok: true };
  });
  app.post("/api/admin/impersonate/:id", async (req) => {
    const uid = await requireAdmin(req); const { id } = req.params as { id: string };
    const { reason } = parse(z.object({ reason: z.string().min(5).max(300) }), req.body);
    await ownerSql`insert into memberships (clinic_id, user_id, role) values (${id}, ${uid}, 'admin') on conflict (clinic_id, user_id) do update set active = true`;
    await ownerSql`update sessions set clinic_id = ${id}, impersonated_by = ${uid} where id = ${req.sessionId!}`;
    await ownerSql`insert into audit_events (clinic_id, user_id, action, entity, entity_id, data) values (${id}, ${uid}, 'platform.impersonate', 'clinic', ${id}, ${ownerSql.json({ reason } as never)})`;
    return { ok: true };
  });
}
