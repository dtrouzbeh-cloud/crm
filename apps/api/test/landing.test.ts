import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";
import { server, client, signup } from "./helpers.ts";
import { sql, ownerSql } from "../src/db.ts";

let app: FastifyInstance;
before(async () => { app = await server(); });
after(async () => { await app.close(); await sql.end(); await ownerSql.end(); });

test("landing: şablon → yayınlanmamış gizli → yayınla → fiyatlar → form lead (kaynak/kampanya) → sayaçlar", async () => {
  const { c } = await signup(app);
  const p = await c.post("/api/landing", { template: "allon4_de" }); assert.equal(p.status, 200, JSON.stringify(p.body));
  const info = (await c.get(`/api/landing/${p.body.id}`)).body; const path = new URL(info.url).pathname.replace("/p/", "");
  const pub = client(app);
  assert.equal((await pub.get(`/api/public/lp/${path}`)).status, 404);
  await c.put(`/api/landing/${p.body.id}`, { published: true });
  const lp = (await pub.get(`/api/public/lp/${path}`)).body;
  assert.equal(lp.lang, "de"); assert.ok(lp.prices.length >= 3); assert.ok(lp.prices.every((x: any) => x.from > 0));
  assert.equal((await pub.post(`/api/public/lp/${path}/lead`, { name: "LP Patient" })).status, 400);
  const r = await pub.post(`/api/public/lp/${path}/lead`, { name: "LP Patient", phone: "+4915100" + Math.floor(100000 + Math.random() * 899999), consent: true, utm: { source: "facebook" } });
  assert.equal(r.status, 200);
  const lead = (await c.get(`/api/leads/${r.body.leadId}`)).body.lead;
  assert.equal(lead.source, "landing"); assert.equal(lead.campaign, "LP All-on-4 DE");
  const list = (await c.get("/api/landing")).body.find((x: any) => x.id === p.body.id); assert.equal(list.views, 1); assert.equal(list.leads, 1);
});
