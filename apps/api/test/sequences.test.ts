import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";
import { server, signup, uniq } from "./helpers.ts";
import { sql, ownerSql } from "../src/db.ts";
import { processOutbox, runDueSequences } from "../src/worker.ts";
import { nextAllowed } from "../src/services/sequences.ts";
import { isStopMessage } from "../src/services/consent.ts";

let app: FastifyInstance;
before(async () => { app = await server(); });
after(async () => { await app.close(); await sql.end(); await ownerSql.end(); });
const drain = async () => { while (await processOutbox() > 0) { /* boşalt */ } };

test("sessiz saat ve STOP algılama", () => {
  // Londra 23:30 → ertesi gün 09:00'a kayar
  const d = nextAllowed(new Date("2026-10-05T22:30:00Z"), "Europe/London", { quietStart: 21, quietEnd: 9 });
  assert.equal(d.toISOString(), "2026-10-06T08:00:00.000Z");
  assert.equal(nextAllowed(new Date("2026-10-05T12:00:00Z"), "Europe/London").toISOString(), "2026-10-05T12:00:00.000Z");
  assert.ok(isStopMessage("STOP")); assert.ok(isStopMessage(" dur! ")); assert.ok(!isStopMessage("stop by tomorrow please"));
});

test("dizi: şablon → olayla kayıt → WhatsApp işi + görev → cevapla durur; STOP izni iptal eder; pazarlama izni", async () => {
  const { c } = await signup(app);
  const me = (await c.get("/api/auth/me")).body;
  const tpl = (await c.get("/api/sequences/templates")).body; assert.ok(tpl.some((t: any) => t.key === "speed_to_lead"));
  const s = await c.post("/api/sequences/from-template", { key: "speed_to_lead", lang: "tr" }); assert.equal(s.status, 200);
  assert.equal((await c.put(`/api/sequences/${s.body.id}`, { active: true, settings: { quietStart: 0, quietEnd: 0 } })).status, 200);

  // WhatsApp hesabı (gerçek API çağrısı iş kuyruğunda; burada yalnız kuyruğa düşmesini doğrularız)
  await ownerSql`insert into channel_accounts (clinic_id, channel, name, external_id, waba_id, phone, status) values (${me.clinic.id}, 'whatsapp', 'T', ${"pn" + uniq()}, 'w', '+90', 'connected')`;
  const phone = "+4477009" + Math.floor(10000 + Math.random() * 89999);
  const l = await c.post("/api/leads", { fullName: "Seq Hasta", phone, country: "GB", ownerId: me.user.id });
  await drain();
  const [e] = await ownerSql`select * from sequence_enrollments where lead_id = ${l.body.leadId}`; assert.ok(e, "otomatik kayıt"); assert.equal(e.status, "active");
  // adım 0: pencere kapalı → onaylı şablonla gönderim işi
  assert.equal(await runDueSequences(), 1);
  const [job] = await ownerSql`select payload from jobs where type = 'sequence.wa' and dedupe_key like ${"seq:" + e.id + "%"}`;
  assert.equal((job!.payload as any).kind, "template"); assert.deepEqual((job!.payload as any).template.params, ["Seq", me.clinic.name]);
  // adım 1: görev (60 dk) — zamanı öne al
  await ownerSql`update sequence_enrollments set next_run_at = now() where id = ${e.id}`;
  await runDueSequences();
  const tasks = (await c.get(`/api/tasks?who=all&leadId=${l.body.leadId}`)).body;
  assert.ok(tasks.some((t: any) => /ilk görüşmeyi/.test(t.title)));
  // hasta cevap verir → dizi durur
  await ownerSql`insert into outbox_events (clinic_id, type, entity_id, payload) values (${me.clinic.id}, 'wa.message', 'x', ${ownerSql.json({ leadId: l.body.leadId } as never)})`;
  await drain();
  const [e2] = await ownerSql`select status, stop_reason from sequence_enrollments where id = ${e.id}`;
  assert.equal(e2!.status, "stopped"); assert.equal(e2!.stopReason, "replied");
  const ls = (await c.get(`/api/leads/${l.body.leadId}/sequences`)).body; assert.equal(ls[0].runs.length, 2);

  // izin: STOP → WhatsApp takip kapalı; e-posta pazarlama izni yok
  assert.equal((await c.post(`/api/leads/${l.body.leadId}/consents`, { channel: "whatsapp", purpose: "followup", status: "revoked" })).status, 200);
  const cs = (await c.get(`/api/leads/${l.body.leadId}/consents`)).body;
  assert.equal(cs.state.whatsapp.followup, false); assert.equal(cs.state.email.followup, true); assert.equal(cs.state.email.marketing, false);
  // elle tekrar kayıt → WhatsApp adımı izin yüzünden atlanır
  await c.post(`/api/sequences/${s.body.id}/enroll`, { leadIds: [l.body.leadId] });
  await runDueSequences();
  const [run] = await ownerSql`select r.status, r.detail from sequence_runs r join sequence_enrollments e on e.id = r.enrollment_id where e.lead_id = ${l.body.leadId} and e.status = 'active' order by r.at desc limit 1`;
  assert.equal(run!.status, "skipped"); assert.equal((run!.detail as any).reason, "opted_out");

  const other = await signup(app, "Diğer");
  assert.equal((await other.c.get(`/api/sequences/${s.body.id}`)).status, 404);
  assert.equal((await other.c.get("/api/sequences")).body.length, 0);
});
