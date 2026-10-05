import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";
import { server, client, signup } from "./helpers.ts";
import { sql, ownerSql } from "../src/db.ts";

let app: FastifyInstance;
before(async () => { app = await server(); });
after(async () => { await app.close(); await sql.end(); await ownerSql.end(); });

// 1x1'den büyük geçerli PNG (imza yerine)
const PNG = "data:image/png;base64," + Buffer.alloc(600, 1).toString("base64");

test("formlar: anamnez → tıbbi profil, imzalı onam, NPS → yorum linki / görev, kiracı izolasyonu", async () => {
  const { c } = await signup(app);
  const tpl = await c.get("/api/forms/templates");
  assert.equal(tpl.status, 200);
  const intake = tpl.body.find((t: any) => t.key === "intake" && t.lang === "tr"); assert.ok(intake);
  const consent = tpl.body.find((t: any) => t.key === "implant_consent" && t.lang === "tr");
  const nps = tpl.body.find((t: any) => t.key === "nps" && t.lang === "tr");
  await c.patch("/api/clinic", { settings: { reviewLinks: [{ name: "Google", url: "https://g.page/r/test/review" }] } });
  const lead = await c.post("/api/leads", { fullName: "Anna Schmidt", phone: "+4915112345678", country: "DE" });
  const leadId = lead.body.leadId;

  // anamnez
  const r1 = await c.post("/api/forms/requests", { templateId: intake.id, leadId });
  assert.equal(r1.status, 200); const tok1 = r1.body.url.split("/f/")[1];
  const pub = client(app);
  const g = await pub.get(`/api/public/f/${tok1}`); assert.equal(g.body.status, "sent"); assert.equal(g.body.snapshot.patient.name, "Anna Schmidt");
  const answers: Record<string, unknown> = { age: 61, diabetes: true, heart: false, anticoag: true, bisph: false, chemo: false, pregnant: false, smoker: true, medications: "Metformin", truth: true };
  assert.equal((await pub.post(`/api/public/f/${tok1}/submit`, { answers: { ...answers, truth: false }, signedName: "Anna Schmidt", signature: PNG })).status, 400);
  assert.equal((await pub.post(`/api/public/f/${tok1}/submit`, { answers, signedName: "Anna Schmidt" })).status, 400); // imza yok
  const s1 = await pub.post(`/api/public/f/${tok1}/submit`, { answers, signedName: "Anna Schmidt", signature: PNG });
  assert.equal(s1.status, 200, JSON.stringify(s1.body));
  assert.equal((await pub.post(`/api/public/f/${tok1}/submit`, { answers, signedName: "Anna Schmidt", signature: PNG })).status, 409);
  const ld = await c.get(`/api/leads/${leadId}`);
  assert.deepEqual([...ld.body.medical.flags].sort(), ["anticoag", "diabetes", "smoker"]);
  assert.equal(ld.body.medical.age, 61); assert.equal(ld.body.medical.medications, "Metformin");
  const det = await c.get(`/api/forms/requests/${r1.body.id}`);
  assert.equal(det.body.status, "completed"); assert.ok(det.body.signatureUrl); assert.equal(det.body.docHash.length, 64); assert.equal(det.body.url, null);

  // onam: iptal edilen bağlantı kullanılamaz
  const r2 = await c.post("/api/forms/requests", { templateId: consent.id, leadId });
  assert.equal((await c.post(`/api/forms/requests/${r2.body.id}/revoke`)).status, 200);
  assert.equal((await pub.get(`/api/public/f/${r2.body.url.split("/f/")[1]}`)).status, 404);

  // NPS: 10 → yorum linkleri; 3 → acil görev
  const r3 = await c.post("/api/forms/requests", { templateId: nps.id, leadId });
  const s3 = await pub.post(`/api/public/f/${r3.body.url.split("/f/")[1]}/submit`, { answers: { nps: 10, r_treat: 5, comment: "Harika" } });
  assert.equal(s3.body.reviews[0].name, "Google");
  const r4 = await c.post("/api/forms/requests", { templateId: nps.id, leadId });
  const s4 = await pub.post(`/api/public/f/${r4.body.url.split("/f/")[1]}/submit`, { answers: { nps: 3 } });
  assert.deepEqual(s4.body.reviews, []);
  const tasks = await c.get(`/api/leads/${leadId}`);
  assert.ok(tasks.body.tasks.some((t: any) => /NPS 3/.test(t.title)));
  const sum = await c.get("/api/forms/nps");
  assert.equal(sum.body.n, 2); assert.equal(sum.body.score, 0);

  // başka klinik bu formları göremez
  const other = await signup(app, "Diğer");
  assert.equal((await other.c.get(`/api/forms/requests/${r1.body.id}`)).status, 404);
  assert.equal((await other.c.post("/api/forms/requests", { templateId: intake.id, leadId })).status, 404);
});
