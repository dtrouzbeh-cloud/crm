import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";
import { server, client, signup } from "./helpers.ts";
import { sql, ownerSql } from "../src/db.ts";

let app: FastifyInstance;
before(async () => { app = await server(); });
after(async () => { await app.close(); await sql.end(); await ownerSql.end(); });

test("tavsiye: kod → ref ile gelen lead eşleşir → ilk tahsilatta sabit ödül bir kez", async () => {
  const { c } = await signup(app);
  await c.put("/api/referral-settings", { rewardMinor: 5000, currency: "GBP" });
  const a = await c.post("/api/leads", { fullName: "Sarah Referrer", phone: "+447700977111", country: "GB" });
  const ref = (await c.post(`/api/leads/${a.body.leadId}/referral`)).body; assert.match(ref.code, /^SARAH\d+$/);
  assert.equal((await c.post(`/api/leads/${a.body.leadId}/referral`)).body.code, ref.code, "aynı kod döner");
  const b = await c.post("/api/leads", { fullName: "Friend Patient", phone: "+447700977222", country: "GB", utm: { ref: ref.code } });
  assert.equal((await c.get(`/api/leads/${b.body.leadId}`)).body.lead.partnerId, ref.partnerId);
  // deal + iki ödeme
  const k = await c.post("/api/cases", { leadId: b.body.leadId });
  await c.put(`/api/cases/${k.body.id}/situation`, { situation: { 36: { s: "missing" } }, done: true });
  await c.put(`/api/cases/${k.body.id}/plan`, { visits: 1, expectedRevision: 0, items: [{ id: "x1", v: 1, tx: "crown_zr", teeth: [11] }] });
  await c.post(`/api/cases/${k.body.id}/diagnose`, { acknowledge: true });
  const q = await c.post(`/api/cases/${k.body.id}/quotes`);
  const dealId = (await client(app).post(`/api/public/q/${q.body.token}/respond`, { action: "accept", option: 0, agree: true })).body.dealId;
  const cur = (await c.get(`/api/deals/${dealId}`)).body.deal.currency;
  await c.post(`/api/deals/${dealId}/payments`, { amount: 100, currency: cur, method: "cash" });
  await c.post(`/api/deals/${dealId}/payments`, { amount: 50, currency: cur, method: "cash" });
  const cm = await ownerSql`select amount_minor from commissions where partner_id = ${ref.partnerId}`;
  if (cur === "GBP") { assert.equal(cm.length, 1); assert.equal(Number(cm[0]!.amountMinor), 5000); } else assert.equal(cm.length, 0, "farklı para birimi → ödül yok");
  const st = (await c.post(`/api/leads/${a.body.leadId}/referral`)).body; assert.equal(st.stats.leads, 1); assert.equal(st.stats.patients, 1);
});
