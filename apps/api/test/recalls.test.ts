import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";
import { server, client, signup } from "./helpers.ts";
import { sql, ownerSql } from "../src/db.ts";
import { processOutbox, activateDueRecalls } from "../src/worker.ts";

let app: FastifyInstance;
before(async () => { app = await server(); });
after(async () => { await app.close(); await sql.end(); await ownerSql.end(); });
const drain = async () => { while (await processOutbox() > 0) { /* boşalt */ } };

test("recall: deal kazanılınca kurallar eşleşir → vadesi gelince recall panosu + dizi → kapanınca tekrarlı yenisi; tedavi sonrası pipeline'ı", async () => {
  const { c } = await signup(app);
  const lead = await c.post("/api/leads", { fullName: "Recall Test", phone: "+447700944" + Math.floor(100 + Math.random() * 899), country: "GB" });
  const k = await c.post("/api/cases", { leadId: lead.body.leadId });
  await c.put(`/api/cases/${k.body.id}/situation`, { situation: { 36: { s: "missing" } }, done: true });
  await c.put(`/api/cases/${k.body.id}/plan`, { visits: 2, expectedRevision: 0, items: [{ id: "x1", v: 1, tx: "implant", teeth: [36], brand: "b_neod" }, { id: "x2", v: 2, tx: "crown_imp", teeth: [36] }] });
  await c.post(`/api/cases/${k.body.id}/diagnose`, { acknowledge: true });
  const q = await c.post(`/api/cases/${k.body.id}/quotes`);
  const dealId = (await client(app).post(`/api/public/q/${q.body.token}/respond`, { action: "accept", option: 0, agree: true })).body.dealId;

  const rules = (await c.get("/api/recall-rules")).body; assert.equal(rules.length, 5);
  // yıllık kurala bir dizi bağla
  const seq = await c.post("/api/sequences/from-template", { key: "lost_reengage", lang: "tr" });
  const annual = rules.find((r: any) => r.repeatDays === 365 && !r.match.length);
  await c.patch(`/api/recall-rules/${annual.id}`, { sequenceId: seq.body.id });

  await c.patch(`/api/deals/${dealId}`, { stage: "won" });
  await drain();
  const sched = (await c.get(`/api/recalls?leadId=${lead.body.leadId}`)).body;
  assert.deepEqual(sched.map((r: any) => r.title).sort(), [annual.name, rules[0].name, rules[1].name].sort()); // implant + kron + yıllık (beyazlatma yok)
  // tedavi sonrası pipeline'ına da eklendi
  const pls = (await c.get("/api/pipelines")).body; const after = pls.find((p: any) => p.kind === "aftercare"), rec = pls.find((p: any) => p.kind === "recall");
  assert.ok((await c.get(`/api/pipelines/${after.id}/board`)).body.items.some((i: any) => i.leadId === lead.body.leadId));

  // yıllık recall'ın vadesini getir → etkinleşir
  const ann = sched.find((r: any) => r.title === annual.name);
  await ownerSql`update recalls set due_at = now() - interval '1 minute' where id = ${ann.id}`;
  assert.ok(await activateDueRecalls() >= 1);
  const board = (await c.get(`/api/pipelines/${rec.id}/board`)).body;
  const item = board.items.find((i: any) => i.leadId === lead.body.leadId); assert.ok(item); assert.equal(item.stageKey, "due"); assert.equal(item.note, annual.name);
  const [en] = await ownerSql`select status from sequence_enrollments where lead_id = ${lead.body.leadId} and sequence_id = ${seq.body.id}`;
  assert.equal(en?.status, "active");
  // geldi → recall kapanır, 365 gün sonrası için yenisi
  const attended = board.stages.find((s: any) => s.key === "attended");
  await c.post(`/api/pipelines/${rec.id}/move`, { itemId: item.itemId, stageId: attended.id });
  await drain();
  const all = (await c.get(`/api/recalls?leadId=${lead.body.leadId}`)).body.filter((r: any) => r.title === annual.name);
  assert.deepEqual(all.map((r: any) => r.status).sort(), ["done", "scheduled"]);
  const next = all.find((r: any) => r.status === "scheduled"); assert.ok(new Date(next.dueAt).getTime() > Date.now() + 360 * 86400000);
});
