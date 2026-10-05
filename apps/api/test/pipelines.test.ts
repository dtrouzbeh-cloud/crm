import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";
import { server, signup, uniq } from "./helpers.ts";
import { sql, ownerSql } from "../src/db.ts";
import { processOutbox, checkSla } from "../src/worker.ts";

let app: FastifyInstance;
before(async () => { app = await server(); });
after(async () => { await app.close(); await sql.end(); await ownerSql.end(); });
const drain = async () => { while (await processOutbox() > 0) { /* boşalt */ } };

test("pipeline: varsayılanlar, özel aşama, geçmiş, SLA, kaybedilen → yeniden kazanım → satışa dönüş, analitik, izolasyon", async () => {
  const { c } = await signup(app);
  const pls = (await c.get("/api/pipelines")).body;
  assert.deepEqual(pls.map((p: any) => p.kind), ["sales", "nurture", "aftercare", "recall"]);
  const sales = pls[0], nurture = pls[1];
  assert.equal(sales.stages.find((s: any) => s.key === "new").slaMinutes, 15);

  // özel aşama ekle, lead'i oraya taşı
  const cs = await c.post(`/api/pipelines/${sales.id}/stages`, { name: { default: "Video consult", tr: "Görüntülü görüşme" }, probability: 30, slaMinutes: 60, sort: 35 });
  assert.equal(cs.status, 200, JSON.stringify(cs.body)); assert.equal(cs.body.key, "c_video_consult");
  const me = (await c.get("/api/auth/me")).body;
  const l = await c.post("/api/leads", { fullName: "Pipe " + uniq(), phone: "+44770090" + Math.floor(1000 + Math.random() * 8999), ownerId: me.user.id });
  assert.equal((await c.patch(`/api/leads/${l.body.leadId}`, { stage: "yok_boyle" })).status, 400);
  assert.equal((await c.post(`/api/pipelines/${sales.id}/move`, { leadId: l.body.leadId, stageId: cs.body.id })).status, 200);
  assert.equal((await c.get(`/api/leads/${l.body.leadId}`)).body.lead.stage, "c_video_consult");
  // kullanımdaki aşama taşıma hedefi olmadan silinemez
  assert.equal((await c.del(`/api/pipeline-stages/${cs.body.id}`)).status, 409);
  // sistem aşaması silinemez
  assert.equal((await c.del(`/api/pipeline-stages/${sales.stages.find((s: any) => s.key === "won").id}`)).status, 400);

  // SLA: aşamaya girişi geriye al → denetim işaretler, bildirim üretir
  await ownerSql`update leads set stage_entered_at = now() - interval '2 hours' where id = ${l.body.leadId}`;
  assert.ok(await checkSla() >= 1);
  assert.ok((await c.get("/api/notifications")).body.items.some((n: any) => n.type === "pipeline.sla"));

  // kaybedildi → yeniden kazanım pipeline'ına otomatik
  const lostStage = sales.stages.find((s: any) => s.key === "lost");
  assert.equal((await c.post(`/api/pipelines/${sales.id}/move`, { leadId: l.body.leadId, stageId: lostStage.id })).status, 400); // neden zorunlu
  await c.post(`/api/pipelines/${sales.id}/move`, { leadId: l.body.leadId, stageId: lostStage.id, lostReason: "price" });
  await drain();
  const nb = (await c.get(`/api/pipelines/${nurture.id}/board`)).body;
  const item = nb.items.find((i: any) => i.leadId === l.body.leadId); assert.ok(item, "yeniden kazanıma eklenmeli");
  assert.equal(item.stageKey, "cold");
  const reStage = nb.stages.find((s: any) => s.key === "reengaged");
  assert.equal((await c.post(`/api/pipelines/${nurture.id}/move`, { itemId: item.itemId, stageId: reStage.id })).body.status, "won");
  assert.equal((await c.get(`/api/leads/${l.body.leadId}`)).body.lead.stage, "interested");

  const an = (await c.get(`/api/pipelines/${sales.id}/analytics`)).body;
  assert.ok(an.stages.find((s: any) => s.key === "c_video_consult").reached >= 1);
  const hist = await ownerSql`select from_stage, to_stage from stage_history where lead_id = ${l.body.leadId} and pipeline_kind = 'sales' order by id`;
  assert.deepEqual(hist.map((h) => h.toStage), ["new", "c_video_consult", "lost", "interested"]);

  const other = await signup(app, "Diğer");
  assert.equal((await other.c.get(`/api/pipelines/${sales.id}/board`)).status, 404);
  assert.equal((await other.c.post(`/api/pipelines/${sales.id}/move`, { leadId: l.body.leadId, stageId: lostStage.id, lostReason: "x" })).status, 404);
});
