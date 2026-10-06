process.env.AI_PROVIDER = "mock";
import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";
import { server, client, signup } from "./helpers.ts";
import { sql, ownerSql } from "../src/db.ts";
import { processOutbox } from "../src/worker.ts";
import { aiReplyJob } from "../src/services/ai/agent.ts";

let app: FastifyInstance;
before(async () => { app = await server(); });
after(async () => { await app.close(); await sql.end(); await ownerSql.end(); });
const drain = async () => { while (await processOutbox() > 0) { /* boşalt */ } };

test("web widget: ön form → lead + konuşma, ziyaretçi ↔ personel mesajları, token doğrulama, AI cevabı, hazır form", async () => {
  const { c } = await signup(app);
  const w = (await c.get("/api/widget")).body; assert.match(w.key, /^w_/); assert.match(w.snippet, /widget\.js/);
  await c.post("/api/partners", { name: "Blog Partner", refCode: "BLOG1", commissionBps: 500 });
  const pub = client(app);
  const cfg = await pub.get(`/api/public/widget/${w.key}/config`); assert.equal(cfg.status, 200);
  assert.equal((await pub.post(`/api/public/widget/${w.key}/start`, { name: "Web Ziyaretçi" })).status, 400);
  const s = await pub.post(`/api/public/widget/${w.key}/start`, { name: "Web Ziyaretçi", phone: "+4915112" + Math.floor(10000 + Math.random() * 89999), treatment: "Veneer", message: "Merhaba, veneer fiyatı?", lang: "tr", utm: { source: "google", ref: "BLOG1" }, consent: true });
  assert.equal(s.status, 200, JSON.stringify(s.body));
  const leads = (await c.get("/api/leads?view=all&source=website")).body.items; assert.equal(leads.length, 1);
  const lead = (await c.get(`/api/leads/${leads[0].id}`)).body.lead; assert.equal(lead.interest, "Veneer"); assert.ok(lead.partnerId, "ref ile iş ortağı");
  // personel cevabı (pencere kısıtı yok) → ziyaretçi çeker
  assert.equal((await c.post(`/api/inbox/conversations/${s.body.conversationId}/messages`, { body: "Merhaba! Fotoğraf gönderebilir misiniz?", idempotencyKey: "k1" })).status, 200);
  const m1 = (await pub.get(`/api/public/widget/${w.key}/messages?token=${encodeURIComponent(s.body.token)}`)).body.messages;
  assert.deepEqual(m1.map((m: any) => m.from), ["visitor", "clinic"]);
  assert.equal((await pub.get(`/api/public/widget/${w.key}/messages?token=sahte.token`)).status, 401);
  assert.equal((await pub.post(`/api/public/widget/${w.key}/messages`, { token: s.body.token, body: "Tamam, gönderiyorum" })).status, 200);

  // AI web kanalında
  await c.put("/api/ai/agent", { mode: "auto_always", channels: ["whatsapp", "web"] });
  await drain();
  const out = await aiReplyJob(lead.clinicId, s.body.conversationId) as any;
  assert.equal(out.skipped, "human_active", "personel 15 dk içinde yazdı → AI karışmaz");
  await ownerSql`update messages set at = now() - interval '1 hour' where conversation_id = ${s.body.conversationId} and direction = 'out'`;
  const out2 = await aiReplyJob(lead.clinicId, s.body.conversationId) as any; assert.equal(out2.sent, true);
  const m2 = (await pub.get(`/api/public/widget/${w.key}/messages?token=${encodeURIComponent(s.body.token)}&after=${m1[1].id}`)).body.messages;
  assert.ok(m2.some((m: any) => m.from === "clinic" && m.ai));

  const f = await pub.post(`/api/public/widget/${w.key}/lead`, { name: "Form Hasta", email: "form@example.com", treatment: "Implant", consent: true });
  assert.equal(f.status, 200); assert.ok(f.body.leadId);
  await c.put("/api/widget", { enabled: false });
  assert.equal((await pub.get(`/api/public/widget/${w.key}/config`)).status, 404);
});

test("Instagram/Messenger: webhook gövdesi → lead + konuşma, tekrar gelen mesaj tek kayıt", async () => {
  const { parseMetaMessages, ingestMeta } = await import("../src/routes/widget.ts");
  const { c } = await signup(app);
  const igId = String(Date.now()).slice(-12);
  // bağlantıda belirteç Meta'da doğrulanır: sahte belirteç reddedilir, hesap testte doğrudan eklenir
  assert.equal((await c.post("/api/inbox/accounts/meta", { channel: "instagram", externalId: igId, token: "x".repeat(30), name: "clinic_ig" })).status, 400);
  const me = (await c.get("/api/auth/me")).body;
  await ownerSql`insert into channel_accounts (clinic_id, channel, name, external_id, status) values (${me.clinic.id}, 'instagram', 'clinic_ig', ${igId}, 'connected')`;
  const body = { object: "instagram", entry: [{ id: igId, messaging: [{ sender: { id: "99887766" }, recipient: { id: igId }, message: { mid: "mid.1", text: "Hi, price for veneers?" } }] }] };
  const ms = parseMetaMessages(body); assert.equal(ms.length, 1); assert.equal(ms[0]!.channel, "instagram");
  const r = await ingestMeta(ms[0]!) as any; assert.ok(r.conversationId);
  assert.equal((await ingestMeta(ms[0]!) as any).duplicate, true);
  const leads = (await c.get("/api/leads?view=all&source=instagram")).body.items; assert.equal(leads.length, 1);
  assert.equal(parseMetaMessages({ object: "page", entry: [{ messaging: [{ sender: { id: "1" }, recipient: { id: "2" }, message: { mid: "m", text: "x", is_echo: true } }] }] }).length, 0);
});
