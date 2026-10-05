import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";
import { server, signup } from "./helpers.ts";
import { sql, ownerSql } from "../src/db.ts";

let app: FastifyInstance;
before(async () => { app = await server(); });
after(async () => { await app.close(); await sql.end(); await ownerSql.end(); });

test("ekip performansı raporu + hedef + hedefim", async () => {
  const { c } = await signup(app);
  const me = (await c.get("/api/auth/me")).body;
  await c.post("/api/leads", { fullName: "Perf Lead", phone: "+4915100" + Math.floor(100000 + Math.random() * 899999), ownerId: me.user.id });
  const r = (await c.get("/api/reports/sales")).body;
  const row = r.reps.find((x: any) => x.userId === me.user.id); assert.ok(row); assert.equal(row.leads, 1);
  assert.equal((await c.put("/api/targets", { userId: me.user.id, month: new Date().toISOString().slice(0, 10), revenueMinor: 1000000, deals: 5, currency: "EUR" })).status, 200);
  const t = (await c.get("/api/targets/me")).body; assert.equal(Number(t.target.revenueMinor), 1000000); assert.equal(t.actual.deals, 0);
  assert.equal((await c.get("/api/reports/sales")).body.reps.find((x: any) => x.userId === me.user.id).target.deals, 5);
});
