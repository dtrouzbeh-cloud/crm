import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";
import { server, client, signup } from "./helpers.ts";
import { sql, ownerSql } from "../src/db.ts";

let app: FastifyInstance;
before(async () => { app = await server(); });
after(async () => { await app.close(); await sql.end(); await ownerSql.end(); });

test("uçtan uca: lead → vaka → teşhis → fiyat → onay → teklif → hasta kabul → deal", async () => {
  const { c } = await signup(app);
  const cat = await c.get("/api/catalog");
  assert.ok(cat.body.treatments.length >= 38 && cat.body.bundles.length === 11);
  const lead = await c.post("/api/leads", { fullName: "James O'Brien", phone: "+447700900123", country: "GB", language: "en" });
  await c.put(`/api/leads/${lead.body.leadId}/medical`, { flags: ["diabetes"], age: 54 });
  const k = await c.post("/api/cases", { leadId: lead.body.leadId });
  const id = k.body.id;
  const sit: Record<string, { s: string }> = {}; [17, 16, 15, 14, 24, 25, 26, 27].forEach((t) => (sit[t] = { s: "missing" })); [13, 12, 11, 21, 22, 23].forEach((t) => (sit[t] = { s: "root" }));
  assert.equal((await c.put(`/api/cases/${id}/situation`, { situation: sit, done: true })).status, 200);
  const sug = await c.post(`/api/cases/${id}/suggest`);
  assert.ok(sug.body.items.some((i: any) => i.b === "ao4_u"));
  const plan = await c.put(`/api/cases/${id}/plan`, { visits: sug.body.visits, items: sug.body.items, expectedRevision: 0 });
  assert.equal(plan.status, 200, JSON.stringify(plan.body));
  assert.ok(plan.body.rules.some((r: any) => r.code === "M4"));
  // eski revizyonla yazma reddedilir
  assert.equal((await c.put(`/api/cases/${id}/plan`, { visits: 2, items: sug.body.items, expectedRevision: 0 })).status, 409);
  const d1 = await c.post(`/api/cases/${id}/diagnose`, {});
  assert.equal(d1.status, 409); assert.ok(d1.body.details.rules.some((r: any) => r.code === "M4"));
  const d2 = await c.post(`/api/cases/${id}/diagnose`, { acknowledge: true });
  assert.equal(d2.status, 200, JSON.stringify(d2.body));
  let cs = (await c.get(`/api/cases/${id}`)).body.case;
  assert.equal(cs.status, "diagnosed"); assert.equal(cs.pricing.currency, "GBP");
  // 3 seçenek + indirim
  const p = cs.pricing;
  for (const i of [1, 2]) p.options.push((await c.post(`/api/cases/${id}/pricing/option`, { index: i })).body);
  p.options.forEach((o: any, i: number) => (o.rec = i === 1));
  p.nOpt = 3; p.options[1].disc = 12;
  const pr = await c.put(`/api/cases/${id}/pricing`, p);
  assert.equal(pr.status, 200, JSON.stringify(pr.body));
  const totals = pr.body.calcs.map((x: any) => x.total);
  assert.ok(totals[0] < totals[2], totals.join(","));
  // admin limiti 100 → onaysız da gönderilebilir; requireApprovalAll ile test et
  await c.patch("/api/clinic", { settings: { quote: { depositBps: 1000, validDays: 14, rounding: 10, gapMinMonths: 3, gapMaxMonths: 6, hotelNightEur: 65, transferEur: 60, requireApprovalAll: true } } });
  const blocked = await c.post(`/api/cases/${id}/quotes`);
  assert.equal(blocked.status, 422);
  for (const o of p.options) assert.equal((await c.post(`/api/cases/${id}/pricing/approval`, { optionId: o.id, action: "approve" })).status, 200);
  const q = await c.post(`/api/cases/${id}/quotes`);
  assert.equal(q.status, 200, JSON.stringify(q.body));
  const token = q.body.token;
  // hasta tarafı (çerezsiz istemci)
  const pt = client(app);
  const pub = await pt.get(`/api/public/q/${token}`);
  assert.equal(pub.body.snapshot.options.length, 3);
  assert.equal(pub.body.snapshot.currency, "GBP");
  // personel görüntülemesi sayılmaz
  await c.post(`/api/public/q/${token}/view`);
  assert.equal((await c.get(`/api/quotes/${q.body.id}`)).body.viewCount, 0);
  await pt.post(`/api/public/q/${token}/view`);
  assert.equal((await c.get(`/api/quotes/${q.body.id}`)).body.status, "viewed");
  assert.equal((await pt.post(`/api/public/q/${token}/respond`, { action: "accept", option: 1 })).status, 400); // onay kutusu yok
  const acc = await pt.post(`/api/public/q/${token}/respond`, { action: "accept", option: 1, agree: true });
  assert.equal(acc.status, 200, JSON.stringify(acc.body)); assert.ok(acc.body.dealId);
  assert.equal((await pt.post(`/api/public/q/${token}/respond`, { action: "decline" })).status, 409);
  const ld = (await c.get(`/api/leads/${lead.body.leadId}`)).body.lead;
  assert.equal(ld.stage, "won");
  const deal = await sql.begin(async (tx) => { await tx`select set_config('app.clinic_id', ${(await c.get("/api/auth/me")).body.clinic.id}, true)`; return tx`select value_minor, deposit_minor, (select sum(planned_minor) from deal_visits v where v.deal_id = d.id)::bigint as planned from deals d where d.id = ${acc.body.dealId}`; });
  assert.equal(Number(deal[0]!.planned), Number(deal[0]!.valueMinor));
});
