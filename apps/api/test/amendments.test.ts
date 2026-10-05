import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";
import { server, client, signup } from "./helpers.ts";
import { sql, ownerSql } from "../src/db.ts";

let app: FastifyInstance;
before(async () => { app = await server(); });
after(async () => { await app.close(); await sql.end(); await ownerSql.end(); });
const PNG = "data:image/png;base64," + Buffer.alloc(600, 1).toString("base64");

async function acceptedDeal(c: ReturnType<typeof client>) {
  const lead = await c.post("/api/leads", { fullName: "Amend Test", phone: "+447700933333", country: "GB" });
  const k = await c.post("/api/cases", { leadId: lead.body.leadId });
  await c.put(`/api/cases/${k.body.id}/situation`, { situation: { 36: { s: "missing" } }, done: true });
  await c.put(`/api/cases/${k.body.id}/plan`, { visits: 2, expectedRevision: 0, items: [{ id: "x1", v: 1, tx: "implant", teeth: [36], brand: "b_neod" }, { id: "x2", v: 2, tx: "crown_imp", teeth: [36] }] });
  await c.post(`/api/cases/${k.body.id}/diagnose`, { acknowledge: true });
  const q = await c.post(`/api/cases/${k.body.id}/quotes`);
  const r = await client(app).post(`/api/public/q/${q.body.token}/respond`, { action: "accept", option: 0, agree: true });
  return r.body.dealId as string;
}

test("plan revizyonu: sunucu fiyatı, hasta onayı → deal değeri/ziyaret, red → görev, klinikte imzalı onay, sahte fiyat reddi", async () => {
  const { c } = await signup(app);
  const dealId = await acceptedDeal(c);
  const d0 = (await c.get(`/api/deals/${dealId}`)).body;
  const v0 = Number(d0.deal.valueMinor), v2Before = Number(d0.visits.find((v: any) => v.visitNo === 2).plannedMinor);

  // ekle: 2 diş kanal (V2) + kaldır: kabul edilen V2 kron
  const a = await c.post(`/api/deals/${dealId}/amendments`, { reason: "Klinik muayenede 2 dişte kanal gerekti, kron iptal", lines: [
    { kind: "add", v: 2, tx: "rct", teeth: [35, 37] }, { kind: "remove", v: 2, ref: "2:0" }] });
  assert.equal(a.status, 200, JSON.stringify(a.body));
  const add = a.body.lines.find((l: any) => l.kind === "add"), rem = a.body.lines.find((l: any) => l.kind === "remove");
  assert.equal(add.qty, 2); assert.ok(add.unitMinor > 0); assert.ok(rem.totalMinor < 0);
  assert.equal(Number(a.body.deltaMinor), add.totalMinor + rem.totalMinor);
  // istemci fiyatı yok sayılır (katalog kalemi), bilinmeyen tedavi reddedilir
  assert.equal((await c.post(`/api/deals/${dealId}/amendments`, { reason: "xx", lines: [{ kind: "add", v: 1, tx: "nope" }] })).status, 400);

  const s = await c.post(`/api/amendments/${a.body.id}/send`);
  const token = s.body.url.split("/a/")[1]; assert.match(s.body.shareText, /\/a\//);
  const pub = client(app);
  const g = await pub.get(`/api/public/a/${token}`);
  assert.equal(g.body.status, "sent"); assert.equal(g.body.afterMinor, v0 + Number(a.body.deltaMinor));
  assert.equal((await pub.post(`/api/public/a/${token}/respond`, { action: "approve", name: "Amend Test" })).status, 400); // onay kutusu
  assert.equal((await pub.post(`/api/public/a/${token}/respond`, { action: "approve", name: "Amend Test", agree: true })).body.status, "approved");
  assert.equal((await pub.post(`/api/public/a/${token}/respond`, { action: "approve", name: "Amend Test", agree: true })).status, 409);
  const d1 = (await c.get(`/api/deals/${dealId}`)).body;
  assert.equal(Number(d1.deal.valueMinor), v0 + Number(a.body.deltaMinor));
  assert.equal(Number(d1.visits.find((v: any) => v.visitNo === 2).plannedMinor), Math.max(0, v2Before + Number(a.body.deltaMinor)));

  // red → görev
  const b = await c.post(`/api/deals/${dealId}/amendments`, { reason: "Ek beyazlatma önerisi", lines: [{ kind: "add", v: 2, tx: "whitening" }] });
  assert.equal(b.status, 200, JSON.stringify(b.body));
  const t2 = (await c.post(`/api/amendments/${b.body.id}/send`)).body.url.split("/a/")[1];
  await pub.post(`/api/public/a/${t2}/respond`, { action: "reject", name: "Amend Test", message: "Şimdilik istemiyorum" });
  const lead = (await c.get(`/api/deals/${dealId}`)).body.deal.leadId;
  const tasks = await c.get(`/api/tasks?who=all&leadId=${lead}`);
  assert.ok(tasks.body.some((x: any) => /revizyon/.test(x.title)));

  // klinikte imzayla onay (imzasız reddedilir)
  const e = await c.post(`/api/deals/${dealId}/amendments`, { reason: "Ek greft", lines: [{ kind: "add", v: 1, tx: "graft", teeth: [36] }] });
  assert.equal((await c.post(`/api/amendments/${e.body.id}/approve-in-clinic`, { name: "Amend Test" })).status, 400);
  assert.equal((await c.post(`/api/amendments/${e.body.id}/approve-in-clinic`, { name: "Amend Test", signature: PNG })).status, 200);
  const list = (await c.get(`/api/deals/${dealId}/amendments`)).body;
  assert.deepEqual(list.map((x: any) => x.status), ["approved", "rejected", "approved"]);
  const d2 = (await c.get(`/api/deals/${dealId}`)).body;
  assert.equal(Number(d2.deal.amendedMinor), Number(a.body.deltaMinor) + Number(e.body.deltaMinor));

  // başka klinik erişemez
  const other = await signup(app, "Diğer");
  assert.equal((await other.c.post(`/api/amendments/${a.body.id}/cancel`)).status, 409);
  assert.equal((await other.c.get(`/api/deals/${dealId}/amendments`)).body.length, 0);
});
