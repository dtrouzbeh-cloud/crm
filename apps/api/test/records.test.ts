import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";
import { server, client, signup } from "./helpers.ts";
import { sql, ownerSql } from "../src/db.ts";

let app: FastifyInstance;
before(async () => { app = await server(); });
after(async () => { await app.close(); await sql.end(); await ownerSql.end(); });

test("özel alanlar + filtre, kayıtlı görünüm, mükerrer tespit ve birleştirme, CSV", async () => {
  const { c } = await signup(app);
  const f1 = await c.post("/api/custom-fields", { entity: "lead", label: "Sigorta şirketi", type: "select", options: ["AXA", "Allianz"], showInList: true });
  assert.equal(f1.status, 200, JSON.stringify(f1.body)); assert.equal(f1.body.key, "sigortaSirketi");
  await c.post("/api/custom-fields", { entity: "lead", label: "Uçuş tarihi", type: "date" });
  assert.equal((await c.post("/api/custom-fields", { entity: "lead", label: "X", type: "select" })).status, 400);

  const a = await c.post("/api/leads", { fullName: "Maria Rossi", phone: "+393331112233", country: "IT", custom: { sigortaSirketi: "AXA", bilinmeyen: 1 } });
  assert.equal(a.status, 200, JSON.stringify(a.body));
  const b = await c.post("/api/leads", { fullName: "maria  rossi", email: "maria@example.com", country: "IT", source: "website" });
  assert.notEqual(a.body.patientId, b.body.patientId);
  assert.equal((await c.patch(`/api/leads/${b.body.leadId}`, { custom: { sigortaSirketi: "Yok" } })).status, 400);
  assert.equal((await c.patch(`/api/leads/${b.body.leadId}`, { custom: { ucusTarihi: "2026-11-02" } })).status, 200);
  const la = (await c.get(`/api/leads/${a.body.leadId}`)).body.lead;
  assert.deepEqual(la.custom, { sigortaSirketi: "AXA" });
  const filt = await c.get(`/api/leads?view=all&cf=${encodeURIComponent(JSON.stringify({ sigortaSirketi: "AXA" }))}`);
  assert.equal(filt.body.total, 1);
  assert.equal((await c.get("/api/leads?view=all&country=IT&source=website")).body.total, 1);

  const v = await c.post("/api/views", { name: "AXA hastaları", filters: { cf: { sigortaSirketi: "AXA" } }, shared: true });
  assert.equal(v.status, 200);
  assert.equal((await c.get("/api/views?entity=lead")).body.length, 1);

  // mükerrer: aynı ad + ülke
  const dups = (await c.get("/api/patients/duplicates")).body;
  const pair = dups.find((d: any) => [d.a.id, d.b.id].sort().join() === [a.body.patientId, b.body.patientId].sort().join());
  assert.ok(pair); assert.equal(pair.reason, "name");
  await c.put(`/api/leads/${b.body.leadId}/medical`, { flags: ["smoker"], age: 40 });
  await c.put(`/api/leads/${a.body.leadId}/medical`, { flags: ["diabetes"] });
  const m = await c.post("/api/patients/merge", { keepId: a.body.patientId, mergeId: b.body.patientId });
  assert.equal(m.status, 200, JSON.stringify(m.body)); assert.equal(m.body.moved.leads, 1);
  const lb = (await c.get(`/api/leads/${b.body.leadId}`)).body;
  assert.equal(lb.lead.patientId, a.body.patientId);
  assert.equal(lb.lead.email, "maria@example.com");      // boş alan diğerinden dolduruldu
  assert.equal(lb.lead.fullName, "Maria Rossi");
  assert.deepEqual([...lb.medical.flags].sort(), ["diabetes", "smoker"]); assert.equal(lb.medical.age, 40);
  assert.equal((await c.get("/api/patients/duplicates")).body.length, 0);

  const csv = await c.get("/api/leads/export.csv");
  assert.equal(csv.status, 200);

  const other = await signup(app, "Diğer");
  assert.equal((await other.c.post("/api/patients/merge", { keepId: a.body.patientId, mergeId: b.body.patientId })).status, 404);
  assert.equal((await other.c.get("/api/views?entity=lead")).body.length, 0);
});
