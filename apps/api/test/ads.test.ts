import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";
import { server, signup } from "./helpers.ts";
import { sql, ownerSql } from "../src/db.ts";
import { processOutbox } from "../src/worker.ts";
import { sendConversion } from "../src/services/ads.ts";

let app: FastifyInstance; const calls: any[] = []; const realFetch = globalThis.fetch;
before(async () => { app = await server();
  globalThis.fetch = (async (url: any, init: any) => { if (String(url).startsWith("https://graph.facebook.com/")) { calls.push({ url: String(url), body: init?.body ? JSON.parse(init.body) : null }); return new Response(JSON.stringify({ events_received: 1 }), { status: 200 }); } return realFetch(url, init); }) as typeof fetch; });
after(async () => { globalThis.fetch = realFetch; await app.close(); await sql.end(); await ownerSql.end(); });
const drain = async () => { while (await processOutbox() > 0) { /* boşalt */ } };

test("reklam: CSV harcama → ROAS; Meta CAPI (hash, izin kontrolü); Google offline CSV", async () => {
  const { c } = await signup(app);
  const csv = "Day,Campaign,Cost,Impressions,Clicks\n2026-10-01,DE Implants,120.50,10000,300\n2026-10-02,DE Implants,80,8000,200\n02.10.2026,UK Veneers,\"1.200,00\",5000,90\n";
  const im = await c.post("/api/ads/import", { platform: "google", currency: "EUR", csv }); assert.equal(im.status, 200, JSON.stringify(im.body)); assert.equal(im.body.imported, 3);
  await c.post("/api/leads", { fullName: "Ad Lead 1", phone: "+4915100" + Math.floor(100000 + Math.random() * 899999), campaign: "DE Implants", source: "google", utm: { gclid: "GCLID123" } });
  await c.post("/api/leads", { fullName: "Ad Lead 2", phone: "+4915100" + Math.floor(100000 + Math.random() * 899999), campaign: "DE Implants", source: "google" });
  const r = (await c.get("/api/ads/roas?from=2026-09-01&to=2026-12-31")).body.rows;
  const de = r.find((x: any) => x.campaign === "DE Implants"); assert.equal(Number(de.spend), 20050); assert.equal(de.leads, 2);
  assert.equal(Number(r.find((x: any) => x.campaign === "UK Veneers").spend), 120000);

  // CAPI: meta kaynaklı + izinli lead → hash'li gönderim; izinsiz → atlanır
  assert.equal((await c.put("/api/ads/meta", { datasetId: "123456789", capiToken: "x".repeat(30), capi: true })).status, 200);
  const a = await c.post("/api/leads", { fullName: "Meta Lead", phone: "+447700966111", email: "Meta@Example.com", source: "meta", marketingConsent: true, utm: { fbclid: "FBCLID9" } });
  const b = await c.post("/api/leads", { fullName: "Meta Lead NoConsent", phone: "+447700966222", source: "meta" });
  await drain();
  const evs = await ownerSql`select id, lead_id, event from conversion_events where lead_id in (${a.body.leadId}, ${b.body.leadId}) order by id`;
  assert.equal(evs.length, 2); assert.equal(evs[0]!.event, "Lead");
  for (const e of evs) await sendConversion(Number(e.id));
  const st = await ownerSql`select lead_id, status, error from conversion_events where lead_id in (${a.body.leadId}, ${b.body.leadId})`;
  assert.equal(st.find((x) => x.leadId === a.body.leadId)!.status, "sent");
  assert.equal(st.find((x) => x.leadId === b.body.leadId)!.error, "no_consent");
  const sent = calls.find((x) => x.url.includes("/123456789/events"))!.body.data[0];
  assert.equal(sent.event_name, "Lead"); assert.equal(sent.user_data.em[0].length, 64); assert.match(sent.user_data.fbc, /^fb\.1\.\d+\.FBCLID9$/);
  assert.notEqual(sent.user_data.em[0], "meta@example.com");

  const g = await c.get("/api/ads/google-conversions.csv?from=2026-01-01&to=2027-12-31");
  assert.equal(g.status, 200);
});
