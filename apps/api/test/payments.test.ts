import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { server, client, signup } from "./helpers.ts";
import { sql, ownerSql } from "../src/db.ts";
import { verifyStripeSignature } from "../src/services/payments.ts";

let app: FastifyInstance;
before(async () => { app = await server(); });
after(async () => { await app.close(); await sql.end(); await ownerSql.end(); });

test("Stripe imza doğrulaması", () => {
  const secret = "whsec_test", payload = '{"a":1}', t = Math.floor(Date.now() / 1000);
  const sig = createHmac("sha256", secret).update(`${t}.${payload}`).digest("hex");
  assert.ok(verifyStripeSignature(payload, `t=${t},v1=${sig}`, secret));
  assert.ok(!verifyStripeSignature(payload + "x", `t=${t},v1=${sig}`, secret));
  assert.ok(!verifyStripeSignature(payload, `t=${t - 1000},v1=${sig}`, secret));
});

async function acceptedDeal(c: ReturnType<typeof client>) {
  const lead = await c.post("/api/leads", { fullName: "Pay Test", phone: "+447700911111", country: "GB" });
  const k = await c.post("/api/cases", { leadId: lead.body.leadId });
  await c.put(`/api/cases/${k.body.id}/situation`, { situation: { 36: { s: "missing" } }, done: true });
  await c.put(`/api/cases/${k.body.id}/plan`, { visits: 2, expectedRevision: 0, items: [{ id: "x1", v: 1, tx: "implant", teeth: [36], brand: "b_neod" }, { id: "x2", v: 2, tx: "crown_imp", teeth: [36] }] });
  await c.post(`/api/cases/${k.body.id}/diagnose`, { acknowledge: true });
  const q = await c.post(`/api/cases/${k.body.id}/quotes`);
  const pt = client(app);
  const r = await pt.post(`/api/public/q/${q.body.token}/respond`, { action: "accept", option: 0, agree: true });
  return { dealId: r.body.dealId, token: q.body.token, pt };
}

test("manuel tahsilat → ziyaret dağıtımı, aşama ilerler, iade ters kayıt", async () => {
  const { c } = await signup(app);
  const { dealId } = await acceptedDeal(c);
  const d0 = (await c.get(`/api/deals/${dealId}`)).body;
  assert.equal(d0.deal.stage, "accepted");
  assert.equal(d0.visits.length, 2);
  const p = await c.post(`/api/deals/${dealId}/payments`, { amount: 100, currency: d0.deal.currency, method: "cash", visitNo: 1 });
  assert.equal(p.status, 200, JSON.stringify(p.body));
  const d1 = (await c.get(`/api/deals/${dealId}`)).body;
  assert.equal(d1.deal.stage, "deposit");
  assert.equal(Number(d1.visits[0].paidMinor), 10000);
  assert.equal((await c.post(`/api/deals/${dealId}/payments`, { amount: 10, currency: "XXX", method: "cash" })).status, 400);
  const rv = await c.post(`/api/deals/${dealId}/payments/${p.body.id}/reverse`, { note: "iade testi", amount: 40 });
  assert.equal(rv.status, 200, JSON.stringify(rv.body));
  assert.equal((await c.post(`/api/deals/${dealId}/payments/${p.body.id}/reverse`, { note: "fazla", amount: 70 })).status, 400);
  const d2 = (await c.get(`/api/deals/${dealId}`)).body;
  assert.equal(Number(d2.visits[0].paidMinor), 6000);
});

test("havale ile kapora: referans kodu → personel onayı → ödeme kaydı (idempotent)", async () => {
  const { c } = await signup(app);
  await c.put("/api/payment-providers/bank_transfer", { mode: "live", config: { accountName: "Demo Klinik", iban: "TR000000000000000000000000", swift: "TESTTRIS" } });
  const { dealId, token, pt } = await acceptedDeal(c);
  const pub = await pt.get(`/api/public/q/${token}`);
  assert.ok(pub.body.payment.some((x: any) => x.provider === "bank_transfer"));
  const co = await pt.post(`/api/public/q/${token}/checkout`, { provider: "bank_transfer" });
  assert.equal(co.status, 200, JSON.stringify(co.body)); assert.ok(co.body.referenceCode?.startsWith("DF")); assert.equal(co.body.bank.iban, "TR000000000000000000000000");
  assert.equal((await c.post(`/api/payment-intents/${co.body.intentId}/confirm`)).status, 200);
  assert.equal((await c.post(`/api/payment-intents/${co.body.intentId}/confirm`)).body.already, true);
  const d = (await c.get(`/api/deals/${dealId}`)).body;
  assert.equal(d.payments.length, 1); assert.equal(d.deal.stage, "deposit");
  assert.equal((await pt.post(`/api/public/q/${token}/checkout`, { provider: "bank_transfer" })).status, 409);
});
