import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { server, client, signup } from "./helpers.ts";
import { sql, ownerSql } from "../src/db.ts";
import { parseCsv } from "../src/routes/integrations.ts";
import { mapToLead } from "../src/services/mapping.ts";
import { ingestInbound, sendInConversation } from "../src/routes/inbox.ts";
import { parseWebhook } from "../src/services/whatsapp.ts";

let app: FastifyInstance;
before(async () => { app = await server(); });
after(async () => { await app.close(); await sql.end(); await ownerSql.end(); });

test("CSV ayrıştırma ve otomatik alan eşleme", () => {
  const rows = parseCsv('Full Name;Phone Number;E-mail;Notes\n"O\'Brien, James";+44 7700 900123;j@x.com;"çok ""önemli"""\n');
  assert.equal(rows[1]![0], "O'Brien, James"); assert.equal(rows[1]![3], 'çok "önemli"');
  const m = mapToLead({ field_data: [{ name: "full_name", values: ["Ana Lima"] }, { name: "phone_number", values: ["+351912345678"] }] });
  assert.equal(m.fullName, "Ana Lima"); assert.equal(m.phone, "+351912345678");
});

test("REST API: anahtar kapsamı, idempotent lead, okuma", async () => {
  const { c } = await signup(app);
  const k = await c.post("/api/integrations/api-keys", { name: "Zapier", scopes: ["leads:write"] });
  const call = (body: any, key = k.body.key, idem?: string) => app.inject({ method: "POST", url: "/api/v1/leads", payload: body, headers: { authorization: `Bearer ${key}`, ...(idem ? { "idempotency-key": idem } : {}) } });
  const r1 = await call({ name: "Web Form Lead", phone: "+49 151 0000 1111", treatment: "Veneers" }, undefined, "form-1");
  assert.equal(r1.statusCode, 200, r1.body);
  const r2 = await call({ name: "Web Form Lead", phone: "+49 151 0000 1111" }, undefined, "form-1");
  assert.equal(r2.json().duplicate, true);
  assert.equal((await call({ name: "x", phone: "1" }, "df_wrong")).statusCode, 401);
  const rd = await app.inject({ method: "GET", url: "/api/v1/leads", headers: { authorization: `Bearer ${k.body.key}` } });
  assert.equal(rd.statusCode, 403);
  const list = await c.get("/api/leads?view=all");
  assert.equal(list.body.total, 1); assert.equal(list.body.items[0].interest, "Veneers");
});

test("genel gelen webhook (Google Ads lead formu) → lead", async () => {
  const { c } = await signup(app);
  const ig = await c.post("/api/integrations", { kind: "google_leads", name: "Google Ads" });
  const url = new URL(ig.body.inboundUrl).pathname;
  const payload = { lead_id: "g-123", google_key: ig.body.googleKey, campaign_name: "DE Implants", user_column_data: [{ column_id: "FULL_NAME", string_value: "Klaus Weber" }, { column_id: "PHONE_NUMBER", string_value: "+4917612345678" }, { column_id: "EMAIL", string_value: "k@w.de" }] };
  const r = await app.inject({ method: "POST", url, payload });
  assert.equal(r.statusCode, 200, r.body);
  assert.equal((await app.inject({ method: "POST", url, payload })).json().duplicate, true);
  const l = (await c.get("/api/leads?view=all")).body.items[0];
  assert.equal(l.fullName, "Klaus Weber"); assert.equal(l.source, "google"); assert.equal(l.campaign, "DE Implants");
});

test("WhatsApp gelen mesaj → konuşma + otomatik lead; pencere dışı metin reddedilir", async () => {
  const { c } = await signup(app);
  const me = (await c.get("/api/auth/me")).body;
  const pid = "1" + Date.now();
  await ownerSql`insert into channel_accounts (clinic_id, channel, name, external_id, waba_id, phone, status) values (${me.clinic.id}, 'whatsapp', 'Test', ${pid}, 'w1', '+905550000000', 'connected')`;
  const body = { entry: [{ changes: [{ value: { metadata: { phone_number_id: pid }, contacts: [{ wa_id: "447700900999", profile: { name: "Emma Stone" } }], messages: [{ from: "447700900999", id: "wamid.1", timestamp: String(Math.floor(Date.now() / 1000)), type: "text", text: { body: "Hi, price for implants?" } }] } }] }] };
  const parsed = parseWebhook(body);
  assert.equal(parsed.messages.length, 1);
  const r = await ingestInbound(parsed.messages[0]!);
  assert.ok(r && "conversationId" in r);
  assert.equal((await ingestInbound(parsed.messages[0]!) as any).duplicate, true);
  const convs = await c.get("/api/inbox/conversations");
  assert.equal(convs.body.length, 1); assert.equal(convs.body[0].contactName, "Emma Stone"); assert.ok(convs.body[0].leadId);
  const lead = await c.get(`/api/leads/${convs.body[0].leadId}`);
  assert.equal(lead.body.lead.source, "whatsapp"); assert.equal(lead.body.lead.phone, "+447700900999");
  await ownerSql`update conversations set last_inbound_at = now() - interval '25 hours' where id = ${convs.body[0].id}`;
  await assert.rejects(sendInConversation({ clinicId: me.clinic.id, userId: me.user.id }, convs.body[0].id, { kind: "text", body: "hello", idem: "k1" }), /pencere/);
});
