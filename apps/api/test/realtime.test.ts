import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";
import { server, signup, uniq } from "./helpers.ts";
import { sql, ownerSql } from "../src/db.ts";
import { notifyUser } from "../src/services/notify.ts";

let app: FastifyInstance; let base = "";
before(async () => { app = await server(); await app.listen({ port: 0, host: "127.0.0.1" }); const a = app.server.address() as any; base = `http://127.0.0.1:${a.port}`; });
after(async () => { await app.close(); await sql.end(); await ownerSql.end(); });

async function cookieFor(email: string) {
  const r = await fetch(base + "/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password: "SuperSecret123!" }) });
  return r.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
}
function stream(cookie: string) {
  const ctl = new AbortController(); const events: any[] = [];
  const ready = fetch(base + "/api/rt", { headers: { cookie }, signal: ctl.signal }).then(async (r) => {
    const rd = r.body!.getReader(); const dec = new TextDecoder(); let buf = "";
    (async () => { try { for (;;) { const { value, done } = await rd.read(); if (done) break; buf += dec.decode(value); let i; while ((i = buf.indexOf("\n\n")) >= 0) { const chunk = buf.slice(0, i); buf = buf.slice(i + 2); const d = chunk.split("\n").find((l) => l.startsWith("data: ")); if (d) events.push(JSON.parse(d.slice(6))); } } } catch { /* iptal */ } })();
  });
  return { events, ready, close: () => ctl.abort() };
}
const until = async (fn: () => boolean, ms = 4000) => { const t0 = Date.now(); while (!fn()) { if (Date.now() - t0 > ms) return false; await new Promise((r) => setTimeout(r, 50)); } return true; };

test("SSE: bildirim yalnız sahibine, olay kliniğe; başka kliniğe sızmaz; tercihler uygulanır", async () => {
  const A = await signup(app), B = await signup(app, "Diğer");
  const sa = stream(await cookieFor(A.email)), sb = stream(await cookieFor(B.email));
  await sa.ready; await sb.ready;
  assert.ok(await until(() => sa.events.some((e) => e.k === "hello") && sb.events.some((e) => e.k === "hello")));
  const meA = (await A.c.get("/api/auth/me")).body;
  await notifyUser(meA.clinic.id, meA.user.id, "quote.accepted", "Test hasta teklifi kabul etti", "/quotes");
  assert.ok(await until(() => sa.events.some((e) => e.k === "n" && e.title === "Test hasta teklifi kabul etti")), "A bildirimi almalı");
  await A.c.post("/api/leads", { fullName: "RT " + uniq(), phone: "+4915100000" + Math.floor(Math.random() * 100) });
  assert.ok(await until(() => sa.events.some((e) => e.k === "e" && e.t === "lead.created")), "A olayı almalı");
  await new Promise((r) => setTimeout(r, 300));
  assert.ok(!sb.events.some((e) => e.k === "n" || e.t === "lead.created"), "B hiçbir şey almamalı");

  // tercih: uygulama içi kapalı → bildirim kaydı oluşmaz
  assert.equal((await A.c.put("/api/me/notify-prefs", { inApp: { "quote.accepted": false }, sound: true })).status, 200);
  const before = (await A.c.get("/api/notifications")).body.items.length;
  await notifyUser(meA.clinic.id, meA.user.id, "quote.accepted", "Gizli", "/quotes");
  assert.equal((await A.c.get("/api/notifications")).body.items.length, before);
  const prefs = (await A.c.get("/api/me/notify-prefs")).body;
  assert.equal(prefs.prefs.sound, true); assert.ok(prefs.types.includes("task.assigned"));
  sa.close(); sb.close();
});
