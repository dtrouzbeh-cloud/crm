import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";
import { server, client, signup } from "./helpers.ts";
import { totpCode } from "../src/lib/crypto.ts";
import { processOutbox } from "../src/worker.ts";
import { sql, ownerSql } from "../src/db.ts";

let app: FastifyInstance;
before(async () => { app = await server(); });
after(async () => { await app.close(); await sql.end(); await ownerSql.end(); });

test("kayıt → oturum → me", async () => {
  const { c } = await signup(app);
  const me = await c.get("/api/auth/me");
  assert.equal(me.status, 200);
  assert.equal(me.body.role, "admin");
  assert.equal(me.body.perms["settings.manage"], true);
  assert.ok(me.body.clinic.settings.quote);
});

test("yanlış şifre reddedilir, doğru şifre girer", async () => {
  const { email } = await signup(app);
  const c = client(app);
  assert.equal((await c.post("/api/auth/login", { email, password: "wrong-password" })).status, 401);
  assert.equal((await c.post("/api/auth/login", { email, password: "SuperSecret123!" })).status, 200);
  assert.equal((await c.get("/api/auth/me")).body.role, "admin");
});

test("MFA: etkinleştir → kodsuz giriş kod ister → kodla girer", async () => {
  const { c, email } = await signup(app);
  const s = await c.post("/api/auth/mfa/setup");
  assert.ok(s.body.secret);
  assert.equal((await c.post("/api/auth/mfa/enable", { code: totpCode(s.body.secret) })).status, 200);
  const c2 = client(app);
  const r1 = await c2.post("/api/auth/login", { email, password: "SuperSecret123!" });
  assert.equal(r1.body.mfaRequired, true);
  const r2 = await c2.post("/api/auth/login", { email, password: "SuperSecret123!", code: totpCode(s.body.secret) });
  assert.equal(r2.status, 200);
});

test("lead oluştur, mükerrer telefonu aynı hastaya bağla, iş akışı görevi üret", async () => {
  const { c } = await signup(app);
  const a = await c.post("/api/leads", { fullName: "James O'Brien", phone: "07700 900123", country: "GB", source: "meta", language: "en" });
  assert.equal(a.status, 200, JSON.stringify(a.body));
  const dup = await c.post("/api/leads/check-duplicates", { phone: "+447700900123" });
  assert.equal(dup.body.duplicate.patientId, a.body.patientId);
  const b = await c.post("/api/leads", { fullName: "J. O'Brien", phone: "+44 7700 900123", source: "whatsapp" });
  assert.equal(b.body.patientId, a.body.patientId);
  await processOutbox();
  const list = await c.get("/api/leads?view=all");
  assert.equal(list.body.total, 2);
  const tasks = await c.get(`/api/tasks?who=all&leadId=${a.body.leadId}`);
  assert.ok(tasks.body.some((t: any) => t.auto && /1 saat/.test(t.title)), "otomatik görev oluşmalı");
  // not ekleyince ilk yanıt + aşama 'contacted'
  await c.post(`/api/leads/${a.body.leadId}/events`, { type: "call", body: "Arandı, ilgileniyor" });
  const d = await c.get(`/api/leads/${a.body.leadId}`);
  assert.equal(d.body.lead.stage, "contacted");
  assert.ok(d.body.lead.firstResponseAt);
});

test("kayıp aşaması neden ister", async () => {
  const { c } = await signup(app);
  const a = await c.post("/api/leads", { fullName: "Liam Walker", phone: "+61412345678" });
  assert.equal((await c.patch(`/api/leads/${a.body.leadId}`, { stage: "lost" })).status, 400);
  assert.equal((await c.patch(`/api/leads/${a.body.leadId}`, { stage: "lost", lostReason: "price" })).status, 200);
});

test("tenant izolasyonu: klinik B, klinik A'nın lead'ini göremez", async () => {
  const A = await signup(app, "A"); const B = await signup(app, "B");
  const la = await A.c.post("/api/leads", { fullName: "Gizli Hasta", phone: "+905551112233" });
  assert.equal((await B.c.get(`/api/leads/${la.body.leadId}`)).status, 404);
  assert.equal((await B.c.get("/api/leads?view=all")).body.total, 0);
  assert.equal((await B.c.patch(`/api/leads/${la.body.leadId}`, { interest: "hack" })).status, 404);
  assert.equal((await B.c.get("/api/search?q=Gizli")).body.length, 0);
  // RLS doğrudan: bağlamsız uygulama rolü hiçbir satır göremez
  const rows = await sql`select count(*)::int as n from leads`;
  assert.equal(rows[0]!.n, 0);
});

test("davet → kabul → satış rolü yalnız kendi lead'lerini görür, telefonu görür, ayar yetkisi yok", async () => {
  const A = await signup(app);
  const inv = await A.c.post("/api/team/invite", { email: `sales_${Date.now()}@test.local`, role: "sales" });
  const token = inv.body.link.split("/invite/")[1];
  const S = client(app);
  assert.equal((await S.post(`/api/invites/${token}/accept`, { name: "Mert", password: "SalesPass12345" })).status, 200);
  const me = await S.get("/api/auth/me");
  assert.equal(me.body.role, "sales");
  assert.equal((await S.patch("/api/clinic", { name: "X" })).status, 403);
  await A.c.post("/api/leads", { fullName: "Admin Lead", phone: "+905550000001", ownerId: me.body.user.id });
  await A.c.post("/api/leads", { fullName: "Başkasının", phone: "+905550000002", ownerId: (await A.c.get("/api/auth/me")).body.user.id });
  const list = await S.get("/api/leads?view=all");
  assert.equal(list.body.total, 1);
  assert.equal(list.body.items[0].fullName, "Admin Lead");
});
