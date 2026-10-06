// Hasta ödemeleri — sağlayıcı adaptörleri (SDK yok; doğrudan REST). Klinik kendi üye işyeri hesabını bağlar.
import { createHmac, timingSafeEqual, randomBytes } from "node:crypto";

export interface Creds { [k: string]: string }
export interface CheckoutInput { intentId: string; amountMinor: number; currency: string; description: string; customerEmail?: string | null; customerName?: string; successUrl: string; cancelUrl: string; callbackUrl: string; locale: string; buyerIp?: string }
export interface CheckoutResult { url?: string; providerRef?: string; bank?: Record<string, string>; referenceCode?: string }
export interface Provider {
  id: string; label: string; currencies: string[] | "any"; fields: { key: string; label: string; secret?: boolean }[];
  checkout(creds: Creds, cfg: Record<string, any>, input: CheckoutInput, mode: "test" | "live"): Promise<CheckoutResult>;
  /** Sağlayıcıya kimlik doğrulamalı gerçek bir çağrı; mesaj sağlayıcının kendi hata metnidir */
  test?(creds: Creds, mode: "test" | "live"): Promise<{ ok: boolean; message: string }>;
}

const T = () => AbortSignal.timeout(20_000);   // sağlayıcı yanıt vermezse istek asılı kalmasın
const form = (o: Record<string, string | number | undefined>) => Object.entries(o).filter(([, v]) => v !== undefined).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`).join("&");

// ── Stripe (kart, Apple Pay, Google Pay, SEPA, Klarna — hesap ayarına göre) ──
export const stripe: Provider = {
  id: "stripe", label: "Stripe", currencies: "any",
  fields: [{ key: "secretKey", label: "Secret key (sk_…)", secret: true }, { key: "webhookSecret", label: "Webhook signing secret (whsec_…)", secret: true }],
  async checkout(creds, _cfg, i) {
    const body = form({ mode: "payment", "line_items[0][price_data][currency]": i.currency.toLowerCase(), "line_items[0][price_data][unit_amount]": i.amountMinor,
      "line_items[0][price_data][product_data][name]": i.description, "line_items[0][quantity]": 1, success_url: i.successUrl, cancel_url: i.cancelUrl,
      client_reference_id: i.intentId, "metadata[intent_id]": i.intentId, customer_email: i.customerEmail ?? undefined, locale: ["tr", "en", "de", "fr", "es", "it", "nl"].includes(i.locale) ? i.locale : "auto" });
    const r = await fetch("https://api.stripe.com/v1/checkout/sessions", { method: "POST", headers: { Authorization: `Bearer ${creds.secretKey}`, "Content-Type": "application/x-www-form-urlencoded" }, body, signal: T() });
    const j = await r.json() as any; if (!r.ok) throw new Error(j.error?.message ?? "Stripe hatası");
    return { url: j.url, providerRef: j.id };
  },
  async test(creds) {
    if (!/^(sk|rk)_(test|live)_/.test(creds.secretKey ?? "")) return { ok: false, message: "Secret key sk_test_… veya sk_live_… ile başlamalı" };
    const r = await fetch("https://api.stripe.com/v1/balance", { headers: { Authorization: `Bearer ${creds.secretKey}` }, signal: T() }); const j = await r.json().catch(() => ({})) as any;
    return r.ok ? { ok: true, message: `Bağlantı başarılı (${creds.secretKey!.includes("_test_") ? "test" : "canlı"} mod)` } : { ok: false, message: `Stripe ${r.status}: ${j.error?.message ?? "bilinmeyen hata"}` };
  },
};
/** Stripe-Signature doğrulaması: t=…,v1=… ; HMAC-SHA256(`${t}.${payload}`) ; 5 dk tolerans */
export function verifyStripeSignature(payload: string, header: string | undefined, secret: string, toleranceSec = 300): boolean {
  if (!header) return false;
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=") as [string, string]));
  const t = Number(parts.t); if (!t || Math.abs(Date.now() / 1000 - t) > toleranceSec) return false;
  const expected = createHmac("sha256", secret).update(`${t}.${payload}`).digest("hex");
  return header.split(",").filter((p) => p.startsWith("v1=")).some((p) => { const v = Buffer.from(p.slice(3)); const e = Buffer.from(expected); return v.length === e.length && timingSafeEqual(v, e); });
}

// ── iyzico (Checkout Form, IYZWSv2 imzası) ──
const iyziBase = (mode: string) => (mode === "live" ? "https://api.iyzipay.com" : "https://sandbox-api.iyzipay.com");
export function iyziAuth(apiKey: string, secretKey: string, uriPath: string, body: string) {
  const rnd = Date.now().toString() + randomBytes(4).toString("hex");
  const sig = createHmac("sha256", secretKey).update(rnd + uriPath + body).digest("hex");
  const auth = Buffer.from(`apiKey:${apiKey}&randomKey:${rnd}&signature:${sig}`).toString("base64");
  return { Authorization: `IYZWSv2 ${auth}`, "x-iyzi-rnd": rnd, "Content-Type": "application/json" };
}
export const iyzico: Provider = {
  id: "iyzico", label: "iyzico", currencies: ["TRY", "EUR", "USD", "GBP"],
  fields: [{ key: "apiKey", label: "API key" }, { key: "secretKey", label: "Secret key", secret: true }],
  async checkout(creds, _cfg, i, mode) {
    const price = (i.amountMinor / 100).toFixed(2);
    const [name, ...rest] = (i.customerName || "Patient").split(" ");
    const body = JSON.stringify({ locale: i.locale === "tr" ? "tr" : "en", conversationId: i.intentId, price, paidPrice: price, currency: i.currency, basketId: i.intentId, paymentGroup: "PRODUCT",
      callbackUrl: i.callbackUrl, enabledInstallments: [1, 2, 3, 6, 9, 12],
      buyer: { id: i.intentId, name: name || "Patient", surname: rest.join(" ") || "-", email: i.customerEmail || "patient@example.com", identityNumber: "11111111111", registrationAddress: "N/A", city: "N/A", country: "N/A", ip: i.buyerIp ?? "85.34.78.112" },
      billingAddress: { contactName: i.customerName || "Patient", city: "N/A", country: "N/A", address: "N/A" },
      basketItems: [{ id: "deposit", name: i.description.slice(0, 100), category1: "Dental", itemType: "VIRTUAL", price }] });
    const path = "/payment/iyzipos/checkoutform/initialize/auth/ecom";
    const r = await fetch(iyziBase(mode) + path, { method: "POST", headers: iyziAuth(creds.apiKey!, creds.secretKey!, path, body), body, signal: T() });
    const j = await r.json() as any; if (j.status !== "success") throw new Error(j.errorMessage ?? "iyzico hatası");
    return { url: j.paymentPageUrl, providerRef: j.token };
  },
  // kimlik doğrulamalı en hafif uç: BIN sorgusu (ödeme oluşturmaz)
  async test(creds, mode) {
    const path = "/payment/bin/check", body = JSON.stringify({ locale: "tr", conversationId: "df-test", binNumber: "554960" });
    const r = await fetch(iyziBase(mode) + path, { method: "POST", headers: iyziAuth(creds.apiKey ?? "", creds.secretKey ?? "", path, body), body, signal: T() }); const j = await r.json().catch(() => ({})) as any;
    return j.status === "success" ? { ok: true, message: `Bağlantı başarılı (${mode === "live" ? "canlı" : "sandbox"})` } : { ok: false, message: `iyzico: ${j.errorMessage ?? r.status}${j.errorCode ? ` (kod ${j.errorCode})` : ""}` };
  },
};
export async function iyzicoRetrieve(creds: Creds, mode: string, token: string) {
  const path = "/payment/iyzipos/checkoutform/auth/ecom/detail";
  const body = JSON.stringify({ locale: "en", token });
  const r = await fetch(iyziBase(mode) + path, { method: "POST", headers: iyziAuth(creds.apiKey!, creds.secretKey!, path, body), body, signal: T() });
  return r.json() as Promise<any>;
}

// ── PayPal (Orders v2) ──
const ppBase = (mode: string) => (mode === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com");
async function ppToken(creds: Creds, mode: string) {
  const r = await fetch(ppBase(mode) + "/v1/oauth2/token", { method: "POST", headers: { Authorization: "Basic " + Buffer.from(`${creds.clientId}:${creds.clientSecret}`).toString("base64"), "Content-Type": "application/x-www-form-urlencoded" }, body: "grant_type=client_credentials", signal: T() });
  const j = await r.json() as any; if (!r.ok) throw new Error(j.error_description ?? "PayPal kimlik hatası"); return j.access_token as string;
}
export const paypal: Provider = {
  id: "paypal", label: "PayPal", currencies: ["EUR", "USD", "GBP", "CHF", "SEK", "NOK", "DKK", "PLN", "CAD", "AUD"],
  fields: [{ key: "clientId", label: "Client ID" }, { key: "clientSecret", label: "Client secret", secret: true }],
  async checkout(creds, _cfg, i, mode) {
    const tok = await ppToken(creds, mode);
    const r = await fetch(ppBase(mode) + "/v2/checkout/orders", { method: "POST", headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json", "PayPal-Request-Id": i.intentId },
      body: JSON.stringify({ intent: "CAPTURE", purchase_units: [{ reference_id: i.intentId, custom_id: i.intentId, description: i.description.slice(0, 127), amount: { currency_code: i.currency, value: (i.amountMinor / 100).toFixed(2) } }],
        application_context: { return_url: i.callbackUrl, cancel_url: i.cancelUrl, user_action: "PAY_NOW", shipping_preference: "NO_SHIPPING" } }), signal: T() });
    const j = await r.json() as any; if (!r.ok) throw new Error(j.message ?? "PayPal hatası");
    return { url: j.links.find((l: any) => l.rel === "approve")?.href, providerRef: j.id };
  },
  async test(creds, mode) { try { await ppToken(creds, mode); return { ok: true, message: `Bağlantı başarılı (${mode === "live" ? "canlı" : "sandbox"})` }; } catch (e) { return { ok: false, message: `PayPal: ${(e as Error).message}` }; } },
};
export async function paypalCapture(creds: Creds, mode: string, orderId: string) {
  const tok = await ppToken(creds, mode);
  const r = await fetch(ppBase(mode) + `/v2/checkout/orders/${orderId}/capture`, { method: "POST", headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" }, signal: T() });
  return r.json() as Promise<any>;
}

// ── Banka havalesi (IBAN + referans kodu; klinik onaylar) ──
export const bankTransfer: Provider = {
  id: "bank_transfer", label: "Bank transfer", currencies: "any", fields: [],
  async checkout(_c, cfg, i) {
    const code = "DF" + i.intentId.replace(/-/g, "").slice(0, 8).toUpperCase();
    const acc = (cfg.accounts as any[] | undefined)?.find((a) => a.currency === i.currency) ?? cfg;
    return { referenceCode: code, bank: { accountName: acc.accountName ?? "", iban: acc.iban ?? "", swift: acc.swift ?? "", bankName: acc.bankName ?? "" } };
  },
};
// ── Statik ödeme bağlantısı (klinik kendi linki) ──
export const paymentLink: Provider = {
  id: "payment_link", label: "Payment link", currencies: "any", fields: [],
  async checkout(_c, cfg, i) { const url = (cfg.links as Record<string, string> | undefined)?.[i.currency] ?? cfg.url; if (!url) throw new Error("Ödeme bağlantısı tanımlı değil"); return { url }; },
};

export const PROVIDERS: Record<string, Provider> = { stripe, iyzico, paypal, bank_transfer: bankTransfer, payment_link: paymentLink };
