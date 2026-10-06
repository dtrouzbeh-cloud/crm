process.env.AI_PROVIDER = "mock"; process.env.STT_PROVIDER = "mock";
import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { server, client, signup, uniq } from "./helpers.ts";
import { sql, ownerSql } from "../src/db.ts";
import { processOutbox } from "../src/worker.ts";
import { ingestInbound } from "../src/routes/inbox.ts";
import { coachConversation } from "../src/services/ai/coach.ts";
import { transcribeMessage } from "../src/services/stt.ts";
import { storage } from "../src/services/storage.ts";
import { wa } from "../src/services/whatsapp.ts";

let app: FastifyInstance;
before(async () => { app = await server(); (wa as any).sendText = async () => ({ messages: [{ id: "wamid." + uniq() }] }); });
after(async () => { await app.close(); await sql.end(); await ownerSql.end(); });
const drain = async () => { while (await processOutbox() > 0) { /* boşalt */ } };

test("AI+: canlı koç (3 öneri, itiraz, çeviri), sesli mesaj dökümü, canlı teklif + arama listesi + puan, fotoğraf ön değerlendirme, kayıp analizi, karne, benzer vaka, kurulum anahtarları", async () => {
  const { c } = await signup(app);
  const me = (await c.get("/api/auth/me")).body; const clinicId = me.clinic.id;
  const pn = "pn" + uniq();
  await ownerSql`insert into channel_accounts (clinic_id, channel, name, external_id, waba_id, phone, status, access_token_enc) values (${clinicId}, 'whatsapp', 'T', ${pn}, 'w', '+90', 'connected', null)`;
  assert.equal((await c.put("/api/ai/agent", { mode: "off", features: { coach: true, lossReport: true } })).status, 200);

  // 1) koç
  const from = "4477009" + Math.floor(10000 + Math.random() * 89999);
  const r = await ingestInbound({ phoneNumberId: pn, from, name: "Coach Hasta", id: "wamid.c1" + uniq(), type: "text", body: "Hi, how much is All-on-4? It seems expensive.", ts: Date.now() }) as any;
  await drain();
  const [job] = await ownerSql`select 1 from jobs where type = 'ai.coach' and payload->>'conversationId' = ${r.conversationId} and done_at is null`; assert.ok(job, "koç işi kuyruğa alınmalı");
  await coachConversation(clinicId, r.conversationId);
  const co = (await c.get(`/api/inbox/conversations/${r.conversationId}/coach`)).body;
  assert.equal(co.fresh, true); assert.equal(co.insight.suggestions.length, 3); assert.equal(co.insight.objection, "price"); assert.ok(co.insight.translation);
  const [cv] = await ownerSql`select lead_id from conversations where id = ${r.conversationId}`; const leadId = cv!.leadId as string;
  assert.equal((await c.get(`/api/leads/${leadId}`)).body.lead.interest, "All-on-4");
  // cevap gönderilince öneriler eskir
  await c.post(`/api/inbox/conversations/${r.conversationId}/messages`, { body: "Thanks! Could you send photos?", idempotencyKey: "k" + uniq() });
  assert.equal((await c.get(`/api/inbox/conversations/${r.conversationId}/coach`)).body.fresh, false);
  assert.match((await c.post("/api/ai/translate", { text: "Merhaba", to: "de" })).body.text, /çeviri/);
  assert.equal((await c.get("/api/ai/objections")).body.objections[0].objection, "price");

  // 2) sesli mesaj
  await ingestInbound({ phoneNumberId: pn, from, id: "wamid.a1" + uniq(), type: "audio", media: { id: "media1", mime: "audio/ogg" }, ts: Date.now() });
  const [am] = await ownerSql`select id from messages where conversation_id = ${r.conversationId} and type = 'audio' order by id desc limit 1`;
  const [sj] = await ownerSql`select 1 from jobs where type = 'stt.transcribe' and (payload->>'messageId')::bigint = ${am!.id}`; assert.ok(sj);
  await transcribeMessage(Number(am!.id));
  assert.match((await ownerSql`select body from messages where id = ${am!.id}`)[0]!.body as string, /^🎤 Hello/);

  // 3) canlı teklif + puan + arama listesi
  const k = await c.post("/api/cases", { leadId });
  await c.put(`/api/cases/${k.body.id}/situation`, { situation: { 36: { s: "missing" } }, done: true });
  await c.put(`/api/cases/${k.body.id}/plan`, { visits: 1, expectedRevision: 0, items: [{ id: "x1", v: 1, tx: "crown_zr", teeth: [11] }] });
  await c.post(`/api/cases/${k.body.id}/diagnose`, { acknowledge: true });
  const q = await c.post(`/api/cases/${k.body.id}/quotes`);
  const pub = client(app);
  await pub.post(`/api/public/q/${q.body.token}/view`);
  assert.equal((await pub.post(`/api/public/q/${q.body.token}/ping`, { option: 0, section: "price", seconds: 15 })).status, 200);
  await pub.post(`/api/public/q/${q.body.token}/ping`, { option: 0, section: "price", seconds: 15 });
  await ownerSql`update quote_live set last_ping = now() - interval '10 minutes' where quote_id = ${q.body.id}`;
  await pub.post(`/api/public/q/${q.body.token}/ping`, { option: 0, section: "payment", seconds: 15 });
  const en = (await c.get(`/api/quotes/${q.body.id}/engagement`)).body;
  assert.equal(en.secondsTotal, 45); assert.equal(en.sessions, 2); assert.equal(en.optionSeconds["0"], 45); assert.equal(en.sectionSeconds.price, 30); assert.equal(en.live, true);
  const [lv] = await ownerSql`select 1 from outbox_events where clinic_id = ${clinicId} and type = 'quote.live'`; assert.ok(lv, "yeniden ziyarette canlı olayı");
  assert.equal((await c.post(`/api/public/q/${q.body.token}/ping`, {})).body.staff, true, "personel sayılmaz");
  await drain();
  const liveR = await c.get("/api/quotes/live"); const live = liveR.body; assert.equal(liveR.status, 200, JSON.stringify(live)); assert.equal(live[0]?.leadId, leadId, JSON.stringify(live)); assert.equal(live[0].live, true);
  const lead = (await c.get(`/api/leads/${leadId}`)).body.lead; assert.ok(lead.score >= 40, "puan: " + lead.score);
  const cl = (await c.get("/api/leads/call-list?mine=false")).body; assert.equal(cl[0].leadId, leadId); assert.equal(cl[0].action, "live_now");
  assert.equal((await c.get("/api/leads?view=all&sort=score")).body.items[0].id, leadId);

  // 4) fotoğraftan ön değerlendirme
  assert.equal((await c.post(`/api/cases/${k.body.id}/ai-assess`)).status, 400);
  const fid = randomUUID(), key = `${clinicId}/photo/${fid}`; await storage.put(key, Buffer.alloc(2000, 7));
  await ownerSql`insert into files (id, clinic_id, kind, name, mime, size_bytes, storage_key, sha256, entity, entity_id) values (${fid}, ${clinicId}, 'photo', 'smile.jpg', 'image/jpeg', 2000, ${key}, 'x', 'case', ${k.body.id})`;
  const as = await c.post(`/api/cases/${k.body.id}/ai-assess`); assert.equal(as.status, 200, JSON.stringify(as.body)); assert.equal(as.body.findings.length, 3);
  assert.equal((await c.get(`/api/cases/${k.body.id}/ai-assess`)).body.images, 1);
  // hekim geri bildirimi: kısmen doğru, 31 yanlış → kayıt + vaka üstünde özet + istatistik
  const fb = await c.post(`/api/cases/${k.body.id}/ai-assess/feedback`, { verdict: "partial", wrongTeeth: [31], note: "31 çürük değil kron" }); assert.equal(fb.status, 200, JSON.stringify(fb.body));
  assert.deepEqual((await c.get(`/api/cases/${k.body.id}/ai-assess`)).body.feedback.wrongTeeth, [31]);
  const st = await c.get("/api/ai/assess-stats"); assert.equal(st.body.total, 1); assert.equal(st.body.partial, 1);

  // 5) benzer vaka
  await ownerSql`insert into clinic_content (clinic_id, kind, data, file_id) values (${clinicId}, 'gallery', ${ownerSql.json({ caption: "All-on-4 before/after", tags: "implant all-on-4" } as never)}, ${fid})`;
  const sim = (await c.get(`/api/leads/${leadId}/similar-cases`)).body; assert.equal(sim.length, 1); assert.ok(sim[0].score >= 5); assert.match(sim[0].shareUrl, /sig=/);

  // 6) karne + kayıp analizi
  const qa = await c.post("/api/ai/reports/qa", { userId: me.user.id }); assert.equal(qa.status, 200, JSON.stringify(qa.body)); assert.equal(qa.body.score, 72);
  const pls = (await c.get("/api/pipelines")).body; const lost = pls[0].stages.find((s: any) => s.key === "lost");
  await c.post(`/api/pipelines/${pls[0].id}/move`, { leadId, stageId: lost.id, lostReason: "price" });
  const lr = await c.post("/api/ai/reports/loss", { days: 30 }); assert.equal(lr.status, 200, JSON.stringify(lr.body)); assert.ok(lr.body.body.length > 10);
  assert.equal((await c.get("/api/ai/reports?kind=loss")).body.length, 1);

  // 7) kurulum
  const su = (await c.get("/api/setup")).body; assert.equal(su.keys.anthropic.platform, true); assert.ok(su.checklist.find((x: any) => x.key === "whatsapp").done);
  assert.equal((await c.put("/api/setup/keys/resend", { key: "yanlis-anahtar" })).status, 400);
  assert.equal((await c.put("/api/setup/keys/stt", { key: "dg_test_key_123456", provider: "deepgram" })).status, 200);
  assert.equal((await c.put("/api/setup/keys/twilio", { sid: "AC" + "a".repeat(32), token: "t".repeat(32), number: "+447700900000" })).status, 200);
  const su2 = (await c.get("/api/setup")).body; assert.equal(su2.keys.stt.provider, "deepgram"); assert.equal(su2.keys.twilio.number, "+447700900000"); assert.ok(!JSON.stringify(su2).includes("dg_test_key"), "anahtar değeri asla dönmez");
  assert.equal((await c.put("/api/setup/keys/stt", { remove: true })).status, 200);

  const other = await signup(app, "Diğer");
  assert.equal((await other.c.get(`/api/inbox/conversations/${r.conversationId}/coach`)).status, 404);
  assert.equal((await other.c.get("/api/quotes/live")).body.length, 0);
  assert.equal((await other.c.get("/api/setup")).body.keys.twilio.clinic, false);
});
