import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";
import { server, client, signup, uniq } from "./helpers.ts";
import { sql, ownerSql } from "../src/db.ts";

let app: FastifyInstance;
before(async () => { app = await server(); });
after(async () => { await app.close(); await sql.end(); await ownerSql.end(); });

test("klinik: lab siparişi (risk, teslimde gider), implant lot araması, garanti kartı, şikâyet → garanti kapsamı + tedavi sonrası", async () => {
  const { c } = await signup(app);
  const lead = await c.post("/api/leads", { fullName: "Clin Test", phone: "+447700955" + Math.floor(100 + Math.random() * 899), country: "GB" });
  const k = await c.post("/api/cases", { leadId: lead.body.leadId });
  await c.put(`/api/cases/${k.body.id}/situation`, { situation: { 36: { s: "missing" } }, done: true });
  await c.put(`/api/cases/${k.body.id}/plan`, { visits: 2, expectedRevision: 0, items: [{ id: "x1", v: 1, tx: "implant", teeth: [36], brand: "b_neod" }, { id: "x2", v: 2, tx: "crown_imp", teeth: [36] }] });
  await c.post(`/api/cases/${k.body.id}/diagnose`, { acknowledge: true });
  const q = await c.post(`/api/cases/${k.body.id}/quotes`);
  const dealId = (await client(app).post(`/api/public/q/${q.body.token}/respond`, { action: "accept", option: 0, agree: true })).body.dealId;
  const deal = (await c.get(`/api/deals/${dealId}`)).body.deal;

  const lab = await c.post("/api/labs", { name: "ZirLab " + uniq(), avgDays: 7 });
  await c.patch(`/api/deals/${dealId}/visits/2`, { arrivalAt: new Date(Date.now() + 3 * 86400000).toISOString() });
  const o = await c.post("/api/lab-orders", { dealId, labId: lab.body.id });
  assert.equal(o.status, 200, JSON.stringify(o.body));
  assert.equal(o.body.items.length, 1); assert.deepEqual(o.body.items[0].teeth, [36]); assert.equal(o.body.visitNo, 2);
  let list = (await c.get(`/api/lab-orders?dealId=${dealId}`)).body;
  assert.equal(list[0].atRisk, true, "7 günlük teslim, 3 gün sonraki ziyaretten geç → risk");
  await c.patch(`/api/lab-orders/${o.body.id}`, { status: "sent" });
  await c.patch(`/api/lab-orders/${o.body.id}`, { status: "delivered", costMinor: 9000, currency: deal.currency });
  list = (await c.get(`/api/lab-orders?dealId=${dealId}`)).body;
  assert.equal(list[0].status, "delivered"); assert.equal(list[0].history.length, 3); assert.ok(list[0].expenseId);

  await c.post("/api/implants", { leadId: lead.body.leadId, dealId, tooth: 36, brand: "Neodent", system: "Helix GM", diameter: 4.3, length: 10, lot: "LOT-AB12" });
  assert.equal((await c.get("/api/implants?lot=lot-ab12")).body.length, 1);

  const w = await c.post("/api/warranties", { dealId });
  assert.equal(w.status, 200, JSON.stringify(w.body));
  const pub = (await client(app).get(`/api/public/w/${w.body.url.split("/w/")[1]}`)).body;
  assert.equal(pub.patient, "Clin Test"); assert.equal(pub.implants[0].lot, "LOT-AB12");
  assert.ok(pub.items.some((i: any) => i.years === null), "implant ömür boyu");

  const x = await c.post("/api/complaints", { leadId: lead.body.leadId, category: "loose", teeth: [36], description: "Kron oynuyor" });
  assert.equal(x.status, 200, JSON.stringify(x.body)); assert.equal(x.body.warrantyCovered, true); assert.equal(x.body.dealId, dealId);
  const pls = (await c.get("/api/pipelines")).body; const ac = pls.find((p: any) => p.kind === "aftercare");
  const item = (await c.get(`/api/pipelines/${ac.id}/board`)).body.items.find((i: any) => i.leadId === lead.body.leadId);
  assert.equal(item.stageKey, "complaint");
  await c.patch(`/api/complaints/${x.body.id}`, { status: "resolved", resolution: "Kron yeniden simante edildi" });
  assert.equal((await c.get(`/api/complaints?leadId=${lead.body.leadId}`)).body[0].status, "resolved");

  const other = await signup(app, "Diğer");
  assert.equal((await other.c.get("/api/implants?lot=LOT-AB12")).body.length, 0);
  assert.equal((await other.c.patch(`/api/lab-orders/${o.body.id}`, { status: "canceled" })).status, 404);
});
