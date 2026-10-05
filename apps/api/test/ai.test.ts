process.env.AI_PROVIDER = "mock";
import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";
import { server, signup, uniq } from "./helpers.ts";
import { sql, ownerSql } from "../src/db.ts";
import { processOutbox } from "../src/worker.ts";
import { ingestInbound } from "../src/routes/inbox.ts";
import { aiReplyJob, shouldAutoReply } from "../src/services/ai/agent.ts";
import { wa } from "../src/services/whatsapp.ts";

let app: FastifyInstance; const sent: string[] = [];
before(async () => { app = await server(); (wa as any).sendText = async (_t: string, _p: string, _to: string, body: string) => { sent.push(body); return { messages: [{ id: "wamid." + uniq() }] }; }; });
after(async () => { await app.close(); await sql.end(); await ownerSql.end(); });
const drain = async () => { while (await processOutbox() > 0) { /* boşalt */ } };

test("AI ajanı: otomatik cevap + lead güncelleme + şeffaflık beyanı → insan talebinde devir → asistan modunda taslak", async () => {
  const { c } = await signup(app);
  const me = (await c.get("/api/auth/me")).body;
  const pn = "pn" + uniq();
  await ownerSql`insert into channel_accounts (clinic_id, channel, name, external_id, waba_id, phone, status) values (${me.clinic.id}, 'whatsapp', 'T', ${pn}, 'w', '+90', 'connected')`;
  assert.equal((await c.put("/api/ai/agent", { mode: "auto_always", channels: ["whatsapp"], name: "Elif" })).status, 200);
  const cfg = (await c.get("/api/ai/agent")).body; assert.equal(cfg.key.mock, true); assert.equal(cfg.agent.mode, "auto_always");

  const from = "4477009" + Math.floor(10000 + Math.random() * 89999);
  const r = await ingestInbound({ phoneNumberId: pn, from, name: "Emma AI", id: "wamid.in1" + uniq(), type: "text", body: "Hi, I'm interested in All-on-4 implants", ts: Date.now() }) as any;
  await drain();
  const [job] = await ownerSql`select id from jobs where type = 'ai.reply' and payload->>'conversationId' = ${r.conversationId} and done_at is null`;
  assert.ok(job, "AI işi kuyruğa alınmalı");
  const out = await aiReplyJob(me.clinic.id, r.conversationId) as any;
  assert.equal(out.sent, true); assert.ok(out.actions.some((a: any) => a.name === "update_lead"));
  assert.match(sent.at(-1)!, /AI assistant|yapay zekâ/); // ilk mesajda beyan
  const [msg] = await ownerSql`select ai, direction from messages where conversation_id = ${r.conversationId} and direction = 'out' order by id desc limit 1`;
  assert.equal(msg!.ai, true);
  const [cv] = await ownerSql`select lead_id from conversations where id = ${r.conversationId}`;
  assert.equal((await c.get(`/api/leads/${cv!.leadId}`)).body.lead.interest, "All-on-4");

  // insan talebi → devir: konuşma AI'a kapanır, görev + bildirim
  await ingestInbound({ phoneNumberId: pn, from, id: "wamid.in2" + uniq(), type: "text", body: "Can I talk to a human please?", ts: Date.now() });
  const out2 = await aiReplyJob(me.clinic.id, r.conversationId) as any;
  assert.ok(out2.actions.some((a: any) => a.name === "handoff"));
  const ai = (await c.get(`/api/inbox/conversations/${r.conversationId}/ai`)).body;
  assert.equal(ai.paused, true); assert.equal(ai.session.status, "handed_off");
  assert.equal((await shouldAutoReply(me.clinic.id, r.conversationId)).reason, "paused");
  const tasks = (await c.get(`/api/tasks?who=all&leadId=${cv!.leadId}`)).body; assert.ok(tasks.some((t: any) => t.title.includes("🤖")));

  // asistan modu: taslak üretir, göndermez
  await c.post(`/api/inbox/conversations/${r.conversationId}/ai/pause`, { paused: false });
  await c.put("/api/ai/agent", { mode: "assist" });
  const n = sent.length;
  await ingestInbound({ phoneNumberId: pn, from, id: "wamid.in3" + uniq(), type: "text", body: "What is the price?", ts: Date.now() });
  const out3 = await aiReplyJob(me.clinic.id, r.conversationId) as any; assert.equal(out3.draft, true); assert.equal(sent.length, n);
  const ai3 = (await c.get(`/api/inbox/conversations/${r.conversationId}/ai`)).body; assert.ok(ai3.draft?.body);
  assert.equal((await c.post(`/api/ai/drafts/${ai3.draft.id}/use`, {})).status, 200); assert.equal(sent.length, n + 1);

  // test sohbeti ve kullanım
  const t = await c.post("/api/ai/test", { messages: [{ role: "user", content: "Merhaba" }] }); assert.ok(t.body.text);
  const u = (await c.get("/api/ai/usage")).body; assert.ok(u.length >= 2);

  const other = await signup(app, "Diğer");
  assert.equal((await other.c.get(`/api/inbox/conversations/${r.conversationId}/ai`)).status, 404);
});
