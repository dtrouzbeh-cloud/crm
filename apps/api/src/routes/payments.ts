import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { withClinic, ownerSql, type Tx } from "../db.ts";
import { config } from "../config.ts";
import { ctx, need, parse, notFound, HttpError, ipOf } from "../http.ts";
import { audit } from "../services/audit.ts";
import { encrypt, decrypt, sha256 } from "../lib/crypto.ts";
import { PROVIDERS, verifyStripeSignature, iyzicoRetrieve, paypalCapture, type Creds } from "../services/payments.ts";
import { recordPayment } from "./deals.ts";

async function providerRow(clinicId: string, provider: string) {
  const [p] = await ownerSql`select * from payment_providers where clinic_id = ${clinicId} and provider = ${provider} and active`;
  if (!p) throw new HttpError(400, "provider_inactive", "Ödeme yöntemi etkin değil");
  return { mode: p.mode as "test" | "live", config: (p.config ?? {}) as Record<string, any>, creds: (p.credentialsEnc ? JSON.parse(decrypt(p.credentialsEnc)) : {}) as Creds };
}

/** Sağlayıcıdan doğrulanmış başarı → ödeme defterine kayıt (idempotent) */
export async function completeIntent(intentId: string, providerRef: string | null, amountMinor?: number) {
  return ownerSql.begin(async (tx) => {
    const [i] = await tx`select * from payment_intents where id = ${intentId} for update`;
    if (!i) throw notFound("Ödeme");
    if (i.status === "succeeded") return { already: true, intent: i };
    if (amountMinor != null && amountMinor !== Number(i.amountMinor)) throw new HttpError(400, "amount_mismatch", "Tutar uyuşmuyor");
    await tx`update payment_intents set status = 'succeeded', completed_at = now(), provider_ref = coalesce(${providerRef}, provider_ref) where id = ${intentId}`;
    await tx`select set_config('app.clinic_id', ${i.clinicId}, true)`;
    await recordPayment(tx as unknown as Tx, i.clinicId, null, i.dealId, { amountMinor: Number(i.amountMinor), currency: i.currency, method: i.provider === "paypal" ? "paypal" : i.provider === "bank_transfer" ? "bank_transfer" : "card", provider: i.provider, providerRef: providerRef ?? i.id, intentId: i.id, note: i.purpose });
    return { already: false, intent: i };
  });
}

export function paymentRoutes(app: FastifyInstance) {
  // ── Ayarlar ──
  app.get("/api/payment-providers", async (req) => {
    const c = need(ctx(req), "settings.manage");
    const rows = await withClinic(c.clinicId, (tx) => tx`select id, provider, mode, config, active, credentials_enc is not null as has_credentials, created_at from payment_providers where clinic_id = ${c.clinicId}`);
    return { connected: rows, available: Object.values(PROVIDERS).map((p) => ({ id: p.id, label: p.label, currencies: p.currencies, fields: p.fields })) };
  });
  app.put("/api/payment-providers/:provider", async (req) => {
    const c = need(ctx(req), "settings.manage");
    const { provider } = req.params as { provider: string };
    if (!PROVIDERS[provider]) throw notFound("Sağlayıcı");
    const b = parse(z.object({ mode: z.enum(["test", "live"]).default("test"), credentials: z.record(z.string(), z.string()).optional(), config: z.record(z.string(), z.unknown()).default({}), active: z.boolean().default(true) }), req.body);
    return withClinic(c.clinicId, async (tx) => {
      const [ex] = await tx`select credentials_enc from payment_providers where clinic_id = ${c.clinicId} and provider = ${provider}`;
      const prev = ex?.credentialsEnc ? JSON.parse(decrypt(ex.credentialsEnc)) : {};
      const merged = { ...prev, ...Object.fromEntries(Object.entries(b.credentials ?? {}).filter(([, v]) => v && !v.includes("•"))) };
      await tx`insert into payment_providers (clinic_id, provider, mode, credentials_enc, config, active) values (${c.clinicId}, ${provider}, ${b.mode}, ${Object.keys(merged).length ? encrypt(JSON.stringify(merged)) : null}, ${tx.json(b.config as never)}, ${b.active})
        on conflict (clinic_id, provider) do update set mode = excluded.mode, credentials_enc = excluded.credentials_enc, config = excluded.config, active = excluded.active`;
      await audit(tx, c, "payment.provider.save", "payment_provider", provider, { mode: b.mode, active: b.active, keys: Object.keys(b.credentials ?? {}) });
      return { ok: true, webhookUrl: provider === "stripe" ? `${config.appUrl}/api/public/pay/stripe/webhook` : null };
    });
  });
  app.post("/api/payment-providers/:provider/test", async (req) => {
    const c = need(ctx(req), "settings.manage");
    const { provider } = req.params as { provider: string };
    const p = await providerRow(c.clinicId, provider);
    const ok = PROVIDERS[provider]?.test ? await PROVIDERS[provider]!.test!(p.creds, p.mode) : true;
    return { ok };
  });

  // Personel: deal için ödeme bağlantısı oluştur (WhatsApp ile gönderilebilir)
  app.post("/api/deals/:id/payment-link", async (req) => {
    const c = need(ctx(req), "payment.record");
    const { id } = req.params as { id: string };
    const b = parse(z.object({ provider: z.string(), amount: z.number().positive(), purpose: z.string().max(40).default("visit") }), req.body);
    const [d] = await withClinic(c.clinicId, (tx) => tx`select d.id, d.currency, d.quote_id, p.full_name, p.email, p.language from deals d join patients p on p.id = d.patient_id where d.id = ${id}`);
    if (!d) throw notFound("Deal");
    return startCheckout(c.clinicId, { dealId: id, quoteId: d.quoteId, provider: b.provider, amountMinor: Math.round(b.amount * 100), currency: d.currency, purpose: b.purpose, name: d.fullName, email: d.email, lang: d.language ?? "en", returnPath: "/pay/done" }, ipOf(req));
  });

  // ── Hasta: kabul sonrası kapora ──
  app.post("/api/public/q/:token/checkout", async (req) => {
    const { token } = req.params as { token: string };
    const { provider } = parse(z.object({ provider: z.string() }), req.body);
    const [q] = await ownerSql`select q.*, p.full_name, p.email from quotes q join patients p on p.id = q.patient_id where q.token_hash = ${sha256(token)}`;
    if (!q || q.status !== "accepted") throw new HttpError(400, "not_accepted", "Önce teklif kabul edilmeli");
    const [d] = await ownerSql`select id, deposit_minor, currency from deals where quote_id = ${q.id} order by created_at desc limit 1`;
    if (!d) throw notFound("Deal");
    const [paid] = await ownerSql`select coalesce(sum(amount_minor),0)::bigint as s from payments where deal_id = ${d.id}`;
    if (Number(paid!.s) >= Number(d.depositMinor)) throw new HttpError(409, "already_paid", "Kapora zaten ödendi");
    return startCheckout(q.clinicId, { dealId: d.id, quoteId: q.id, provider, amountMinor: Number(d.depositMinor), currency: d.currency, purpose: "deposit", name: q.fullName, email: q.email, lang: q.language, returnPath: `/q/${token}` }, ipOf(req));
  });

  // ── Sağlayıcı dönüşleri ──
  app.post("/api/public/pay/stripe/webhook", async (req, reply) => {
    const raw = (req as any).rawBody as string;
    const ev = req.body as any;
    const intentId = ev?.data?.object?.metadata?.intent_id ?? ev?.data?.object?.client_reference_id;
    if (!intentId) return reply.send({ ok: true });
    const [i] = await ownerSql`select clinic_id from payment_intents where id = ${intentId}`;
    if (!i) return reply.send({ ok: true });
    const p = await providerRow(i.clinicId, "stripe");
    if (!verifyStripeSignature(raw, req.headers["stripe-signature"] as string, p.creds.webhookSecret ?? "")) throw new HttpError(400, "bad_signature", "İmza doğrulanamadı");
    if (ev.type === "checkout.session.completed" && ev.data.object.payment_status === "paid") await completeIntent(intentId, ev.data.object.payment_intent ?? ev.data.object.id, ev.data.object.amount_total);
    return { ok: true };
  });
  app.post("/api/public/pay/iyzico/callback", async (req, reply) => {
    const intentId = (req.query as any).intent as string; const token = (req.body as any)?.token as string;
    const [i] = await ownerSql`select * from payment_intents where id = ${intentId}`;
    if (!i || !token) return reply.redirect("/");
    const p = await providerRow(i.clinicId, "iyzico");
    const r = await iyzicoRetrieve(p.creds, p.mode, token);
    if (r.status === "success" && r.paymentStatus === "SUCCESS" && r.basketId === intentId) await completeIntent(intentId, r.paymentId, Math.round(Number(r.paidPrice ?? r.price) * 100) === Number(i.amountMinor) ? Number(i.amountMinor) : undefined);
    else await ownerSql`update payment_intents set status = 'failed', meta = meta || ${ownerSql.json({ error: r.errorMessage ?? r.paymentStatus } as never)} where id = ${intentId}`;
    return reply.redirect(String(i.meta?.returnPath ?? "/") + (r.paymentStatus === "SUCCESS" ? "?paid=1" : "?paid=0"));
  });
  app.get("/api/public/pay/paypal/return", async (req, reply) => {
    const { intent, token } = req.query as { intent: string; token: string };
    const [i] = await ownerSql`select * from payment_intents where id = ${intent}`;
    if (!i) return reply.redirect("/");
    const p = await providerRow(i.clinicId, "paypal");
    const r = await paypalCapture(p.creds, p.mode, token);
    const cap = r?.purchase_units?.[0]?.payments?.captures?.[0];
    if (r.status === "COMPLETED" && cap) await completeIntent(intent, cap.id, Math.round(Number(cap.amount.value) * 100));
    return reply.redirect(String(i.meta?.returnPath ?? "/") + (r.status === "COMPLETED" ? "?paid=1" : "?paid=0"));
  });

  // Havale onayı (personel, referans kodu eşleştiğinde)
  app.post("/api/payment-intents/:id/confirm", async (req) => {
    const c = need(ctx(req), "payment.record");
    const { id } = req.params as { id: string };
    const [i] = await withClinic(c.clinicId, (tx) => tx`select id, provider from payment_intents where id = ${id}`);
    if (!i) throw notFound("Ödeme");
    const r = await completeIntent(id, null);
    await withClinic(c.clinicId, (tx) => audit(tx, c, "payment.intent.confirm", "payment_intent", id));
    return { ok: true, already: r.already };
  });
}

async function startCheckout(clinicId: string, o: { dealId: string; quoteId: string | null; provider: string; amountMinor: number; currency: string; purpose: string; name: string; email: string | null; lang: string; returnPath: string }, ip: string) {
  const P = PROVIDERS[o.provider]; if (!P) throw new HttpError(400, "bad_provider");
  const p = await providerRow(clinicId, o.provider);
  if (P.currencies !== "any" && !P.currencies.includes(o.currency)) throw new HttpError(400, "currency_unsupported", `${P.label}: ${o.currency} desteklenmiyor`);
  const [i] = await ownerSql`insert into payment_intents (clinic_id, deal_id, quote_id, provider, purpose, amount_minor, currency, status, meta) values (${clinicId}, ${o.dealId}, ${o.quoteId}, ${o.provider}, ${o.purpose}, ${o.amountMinor}, ${o.currency}, 'pending', ${ownerSql.json({ returnPath: o.returnPath } as never)}) returning id`;
  const base = config.appUrl;
  const cb = o.provider === "iyzico" ? `${base}/api/public/pay/iyzico/callback?intent=${i!.id}` : o.provider === "paypal" ? `${base}/api/public/pay/paypal/return?intent=${i!.id}` : `${base}${o.returnPath}?paid=1`;
  const res = await P.checkout(p.creds, p.config ?? {}, { intentId: i!.id, amountMinor: o.amountMinor, currency: o.currency, description: `Deposit — ${o.name}`, customerEmail: o.email, customerName: o.name,
    successUrl: `${base}${o.returnPath}?paid=1`, cancelUrl: `${base}${o.returnPath}?paid=0`, callbackUrl: cb, locale: o.lang, buyerIp: ip }, p.mode);
  await ownerSql`update payment_intents set provider_ref = ${res.providerRef ?? null}, checkout_url = ${res.url ?? null}, reference_code = ${res.referenceCode ?? null} where id = ${i!.id}`;
  return { intentId: i!.id, checkoutUrl: res.url ?? null, bank: res.bank ?? null, referenceCode: res.referenceCode ?? null };
}
