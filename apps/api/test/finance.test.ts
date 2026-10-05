import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";
import { server, client, signup } from "./helpers.ts";
import { sql, ownerSql } from "../src/db.ts";

let app: FastifyInstance;
before(async () => { app = await server(); });
after(async () => { await app.close(); await sql.end(); await ownerSql.end(); });

async function acceptedDeal(c: ReturnType<typeof client>, utm?: Record<string, string>) {
  const me = await c.get("/api/auth/me");
  const lead = await c.post("/api/leads", { fullName: "Fin Test", phone: "+447700922222", country: "GB", utm, ownerId: me.body.user.id });
  const k = await c.post("/api/cases", { leadId: lead.body.leadId });
  await c.put(`/api/cases/${k.body.id}/situation`, { situation: { 36: { s: "missing" } }, done: true });
  await c.put(`/api/cases/${k.body.id}/plan`, { visits: 2, expectedRevision: 0, items: [{ id: "x1", v: 1, tx: "implant", teeth: [36], brand: "b_neod" }, { id: "x2", v: 2, tx: "crown_imp", teeth: [36] }] });
  await c.post(`/api/cases/${k.body.id}/diagnose`, { acknowledge: true });
  const q = await c.post(`/api/cases/${k.body.id}/quotes`);
  const r = await client(app).post(`/api/public/q/${q.body.token}/respond`, { action: "accept", option: 0, agree: true });
  return { dealId: r.body.dealId as string, leadId: lead.body.leadId as string };
}

test("finans: ortak ref kodu → lead, komisyon tahakkuku + iade dengelemesi, onay/ödeme, gider, fatura kes/iptal → iade faturası, özet, CSV", async () => {
  const { c } = await signup(app);
  const pt = await c.post("/api/partners", { name: "Sun Travel Agency", type: "agency", commissionBps: 1000, refCode: "SUN10" });
  assert.equal(pt.status, 200, JSON.stringify(pt.body));
  assert.equal((await c.post("/api/finance/commission-rules", { name: "Ajans", recipient: "lead_partner", rateBps: 0 })).status, 200);
  assert.equal((await c.post("/api/finance/commission-rules", { name: "Satış %5", recipient: "deal_owner", rateBps: 500 })).status, 200);
  const { dealId, leadId } = await acceptedDeal(c, { ref: "SUN10" });
  const lead = await c.get(`/api/leads/${leadId}`);
  assert.equal(lead.body.lead.partnerId, pt.body.id);
  const d = (await c.get(`/api/deals/${dealId}`)).body.deal;

  const p = await c.post(`/api/deals/${dealId}/payments`, { amount: 1000, currency: d.currency, method: "bank_transfer" });
  assert.equal(p.status, 200);
  let cm = (await c.get("/api/finance/commissions")).body;
  const partnerRow = cm.items.find((x: any) => x.partnerId === pt.body.id), ownerRow = cm.items.find((x: any) => x.userId);
  assert.equal(Number(partnerRow.amountMinor), 10000); // %10 × 1000
  assert.equal(Number(ownerRow.amountMinor), 5000);    // %5 × 1000
  // iade → negatif komisyon
  await c.post(`/api/deals/${dealId}/payments/${p.body.id}/reverse`, { note: "kısmi iade", amount: 200 });
  cm = (await c.get("/api/finance/commissions")).body;
  assert.equal(cm.items.filter((x: any) => Number(x.amountMinor) < 0).reduce((a: number, x: any) => a + Number(x.amountMinor), 0), -3000);
  const ids = cm.items.filter((x: any) => x.partnerId).map((x: any) => x.id);
  assert.equal((await c.post("/api/finance/commissions/action", { ids, action: "pay", ref: "SWIFT-123" })).body.updated, 2);
  const partners = (await c.get("/api/partners")).body;
  assert.equal(Number(partners[0].paidMinor), 8000);
  const mine = (await c.get("/api/finance/my-commissions")).body;
  assert.equal(Number(mine.totals[0].due), 4000);

  // gider
  assert.equal((await c.post("/api/finance/expenses", { category: "lab", vendor: "ZirLab", amountMinor: 15000, currency: d.currency, dealId })).status, 200);

  // fatura: deal'den taslak → toplam deal değeri, kes → numara, değiştirilemez, iptal → iade faturası
  const inv = await c.post("/api/finance/invoices", { kind: "invoice", dealId });
  assert.equal(inv.status, 200, JSON.stringify(inv.body));
  assert.equal(Number(inv.body.totalMinor), Number(d.valueMinor));
  assert.equal(inv.body.number, null);
  const is = await c.post(`/api/finance/invoices/${inv.body.id}/issue`);
  assert.match(is.body.number, /^INV-\d{4}-00001$/);
  assert.equal((await c.patch(`/api/finance/invoices/${inv.body.id}`, { notes: "x" })).status, 409);
  const v = await c.post(`/api/finance/invoices/${inv.body.id}/void`, { reason: "hatalı alıcı" });
  assert.ok(v.body.creditId);
  const cn = (await c.get(`/api/finance/invoices/${v.body.creditId}`)).body;
  assert.equal(Number(cn.totalMinor), -Number(d.valueMinor)); assert.match(cn.number, /^CN-/);
  // makbuz ödemeden
  const rc = await c.post("/api/finance/invoices", { kind: "receipt", paymentId: p.body.id });
  assert.equal(Number(rc.body.totalMinor), 100000);
  assert.equal((await c.post(`/api/finance/invoices/${rc.body.id}/issue`)).body.status, "paid");

  const sum = (await c.get("/api/finance/summary")).body;
  assert.equal(sum.totals.expenses > 0, true);
  assert.ok(sum.months.length === 12);
  assert.equal((await c.get("/api/finance/export/commissions")).status, 200);

  // izolasyon + yetki
  const other = await signup(app, "Diğer");
  assert.equal((await other.c.get(`/api/finance/invoices/${inv.body.id}`)).status, 404);
  assert.equal((await other.c.get("/api/finance/commissions")).body.items.length, 0);
});
