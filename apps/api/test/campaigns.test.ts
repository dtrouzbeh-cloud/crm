import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";
import { server, client, signup, uniq } from "./helpers.ts";
import { sql, ownerSql } from "../src/db.ts";
import { sendCampaignBatch, unsubUrl } from "../src/services/campaigns.ts";

let app: FastifyInstance;
before(async () => { app = await server(); });
after(async () => { await app.close(); await sql.end(); await ownerSql.end(); });

test("kampanya: kitle önizleme (izin), başlat → parti gönderim, izinsiz atlanır, istatistik, abonelikten çıkma, şablonsuz WhatsApp reddi", async () => {
  const { c } = await signup(app);
  const tag = "camp_" + uniq();
  for (const [n, consent] of [["A", true], ["B", true], ["C", false]] as const)
    await c.post("/api/leads", { fullName: `Kamp ${n}`, email: `k${n}${uniq()}@example.com`, country: "DE", tags: [tag], marketingConsent: consent });
  const pv = (await c.post("/api/campaigns/preview", { audience: { tags: [tag] }, channel: "email" })).body;
  assert.equal(pv.total, 3); assert.equal(pv.reachable, 2); assert.equal(pv.reasons.no_marketing_consent, 1);

  const cp = await c.post("/api/campaigns", { name: "Kış kampanyası", channel: "email", audience: { tags: [tag] }, content: { subject: { en: "Winter offer {firstName}" }, body: { en: "Hello {firstName}, …" } }, variantB: { subject: { en: "B subject" }, body: { en: "B body" } } });
  assert.equal(cp.status, 200);
  const la = await c.post(`/api/campaigns/${cp.body.id}/launch`); assert.equal(la.body.recipients, 3);
  assert.equal((await c.patch(`/api/campaigns/${cp.body.id}`, { name: "x" })).status, 409);
  const r = await sendCampaignBatch(cp.body.id); assert.equal(r.done, true); assert.equal(r.sent, 2);
  const d = (await c.get(`/api/campaigns/${cp.body.id}`)).body;
  assert.equal(d.status, "sent"); assert.equal(d.results.reduce((s: number, x: any) => s + x.sent, 0), 2); assert.equal(d.results.reduce((s: number, x: any) => s + x.skipped, 0), 1);

  // abonelikten çıkma → pazarlama izni iptal
  const leadA = (await c.get(`/api/leads?view=all&tag=${tag}&q=Kamp%20A`)).body.items[0];
  const u = unsubUrl(leadA.id).replace(/^https?:\/\/[^/]+/, "");
  const res = await app.inject({ method: "GET", url: u }); assert.equal(res.statusCode, 200);
  assert.equal((await c.get(`/api/leads/${leadA.id}/consents`)).body.state.email.marketing, false);
  assert.equal((await app.inject({ method: "GET", url: u.replace(/[^/]+$/, "bad") })).statusCode, 404);

  const wa = await c.post("/api/campaigns", { name: "WA", channel: "whatsapp", audience: { tags: [tag] }, content: {} });
  assert.equal((await c.post(`/api/campaigns/${wa.body.id}/launch`)).status, 400);
  const other = await signup(app, "Diğer");
  assert.equal((await other.c.get(`/api/campaigns/${cp.body.id}`)).status, 404);
  void client;
});
