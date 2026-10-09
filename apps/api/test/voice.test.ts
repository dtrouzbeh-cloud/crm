process.env.AI_PROVIDER = "mock"; process.env.STT_PROVIDER = "mock";
import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";
import { server, client, signup, uniq } from "./helpers.ts";
import { sql, ownerSql } from "../src/db.ts";
import { twilioSignature, publicUrl, processCall } from "../src/services/voice.ts";

let app: FastifyInstance; const calls: { url: string; body: string }[] = []; const realFetch = globalThis.fetch;
before(async () => { app = await server();
  globalThis.fetch = (async (url: any, init: any) => { const u = String(url);
    if (u.startsWith("https://api.twilio.com/")) { calls.push({ url: u, body: String(init?.body ?? "") });
      if (u.endsWith("/Calls.json")) return new Response(JSON.stringify({ sid: "CA" + uniq(), status: "queued" }), { status: 201 });
      if (u.endsWith(".mp3")) return new Response(Buffer.alloc(3000, 1), { status: 200, headers: { "content-type": "audio/mpeg" } }); }
    return realFetch(url, init); }) as typeof fetch; });
after(async () => { globalThis.fetch = realFetch; await app.close(); await sql.end(); await ownerSql.end(); });

const TOKEN = "t".repeat(32);
/** Twilio gibi imzalı form isteği */
const tw = (path: string, p: Record<string, string>, token = TOKEN) => app.inject({ method: "POST", url: path, payload: new URLSearchParams(p).toString(),
  headers: { "content-type": "application/x-www-form-urlencoded", "x-twilio-signature": twilioSignature(token, publicUrl(path), p) } });

test("telefon: tek tık arama (önce temsilci → hasta), imzalı webhook'lar, kayıt → döküm → AI özet → görev; gelen arama → temsilciler → cevapsız → sesli mesaj", async () => {
  const { c } = await signup(app);
  // Twilio bağlı değilken anlaşılır hata
  const l0 = await c.post("/api/leads", { fullName: "Hans Müller", phone: "+4917612345" + Math.floor(100 + Math.random() * 899), country: "DE" });
  assert.equal((await c.post(`/api/leads/${l0.body.leadId}/call`)).body.error, "voice_not_configured");
  assert.equal((await c.put("/api/setup/keys/twilio", { sid: "ACx", token: TOKEN, number: "+902321234567" })).status, 400, "geçersiz SID");
  const clinicNo = "+90232" + Math.floor(1000000 + Math.random() * 8999999);
  assert.equal((await c.put("/api/setup/keys/twilio", { sid: "AC" + "a".repeat(32), token: TOKEN, number: clinicNo.replace("+90", "0090 ") })).status, 200);
  assert.equal((await c.post(`/api/leads/${l0.body.leadId}/call`)).body.error, "rep_phone_missing");
  const myPhone = "+90532" + Math.floor(1000000 + Math.random() * 8999999);
  assert.equal((await c.put("/api/me/phone", { phone: myPhone })).body.phone, myPhone);
  const cfg = (await c.get("/api/voice/config")).body; assert.equal(cfg.configured, true); assert.equal(cfg.number, clinicNo, "numara E.164'e çevrildi"); assert.match(cfg.inboundUrl, /\/api\/public\/voice\/inbound$/);

  // giden arama
  const r = await c.post(`/api/leads/${l0.body.leadId}/call`); assert.equal(r.status, 200, JSON.stringify(r.body)); const id = r.body.id;
  const req = new URLSearchParams(calls.find((x) => x.url.endsWith("/Calls.json"))!.body); assert.equal(req.get("To"), myPhone, "önce temsilci aranır"); assert.equal(req.get("From"), clinicNo);
  assert.ok(req.get("Url")!.endsWith(`/api/public/voice/bridge/${id}`));
  // imzasız / yanlış imza reddedilir
  assert.equal((await app.inject({ method: "POST", url: `/api/public/voice/bridge/${id}`, payload: "CallSid=x", headers: { "content-type": "application/x-www-form-urlencoded" } })).statusCode, 403);
  assert.equal((await tw(`/api/public/voice/bridge/${id}`, { CallSid: "x" }, "yanlis".repeat(6))).statusCode, 403);
  const br = await tw(`/api/public/voice/bridge/${id}`, { CallSid: "CA1", CallStatus: "in-progress" }); assert.equal(br.statusCode, 200);
  assert.match(br.body, /<Dial [^>]*record="record-from-answer-dual"[^>]*><Number>\+49/); assert.match(br.body, /Hans Müller aranıyor/);
  assert.equal((await tw(`/api/public/voice/status/${id}`, { CallSid: "CA1", CallStatus: "in-progress" })).statusCode, 200);
  await tw(`/api/public/voice/dial/${id}`, { DialCallStatus: "completed", DialCallDuration: "184" });
  await tw(`/api/public/voice/status/${id}`, { CallSid: "CA1", CallStatus: "completed", CallDuration: "190" });
  assert.equal((await tw(`/api/public/voice/recording/${id}`, { RecordingSid: "RE1", RecordingUrl: "https://api.twilio.com/2010-04-01/Accounts/AC/Recordings/RE1", RecordingDuration: "184" })).statusCode, 200);
  const [job] = await ownerSql`select payload from jobs where type = 'call.process' and payload->>'callId' = ${id}`; assert.ok(job, "işleme işi kuyrukta");
  await processCall(id, (job!.payload as any).url);
  const lc = (await c.get(`/api/leads/${l0.body.leadId}/calls`)).body[0];
  assert.equal(lc.outcome, "callback"); assert.equal(lc.durationSec, 190); assert.ok(lc.recordingFileId); assert.match(lc.transcript, /implants/); assert.match(lc.summary, /All-on-4/);
  assert.equal((await c.get(`/api/files/${lc.recordingFileId}`)).status, 200, "kayıt dinlenebilir");
  const ld = (await c.get(`/api/leads/${l0.body.leadId}`)).body;
  assert.equal(ld.lead.stage, "contacted"); assert.ok(ld.lead.firstResponseAt); assert.equal(ld.lead.interest, "All-on-4 üst"); assert.equal(ld.lead.travelWindow, "Mart");
  assert.ok(ld.tasks.some((t: any) => /Cuma günü tekrar ara/.test(t.title)), "sonraki adım görevi");
  assert.ok(ld.events.some((e: any) => e.type === "call" && /All-on-4/.test(e.body)));
  // SSRF: Twilio dışı kayıt adresi reddedilir
  await assert.rejects(processCall(id, "https://evil.example.com/rec"), /Twilio değil/);

  // gelen arama: bilinmeyen numara → yeni lead (kaynak telefon) → temsilci çalar → açılmaz → sesli mesaj
  const caller = "+44770090" + Math.floor(1000 + Math.random() * 8999);
  assert.match((await tw("/api/public/voice/inbound", { CallSid: "CAin" + uniq(), From: caller, To: "+15550000000" })).body, /<Reject\/>/, "bilinmeyen klinik numarası");
  const sidIn = "CAin" + uniq();
  const ib = await tw("/api/public/voice/inbound", { CallSid: sidIn, From: caller, To: clinicNo }); assert.equal(ib.statusCode, 200);
  assert.match(ib.body, new RegExp(`<Number>\\${myPhone}</Number>`)); assert.match(ib.body, /Polly\.Amy/, "İngiltere numarası → İngilizce karşılama");
  const [inc] = await ownerSql`select id, lead_id from calls where provider_sid = ${sidIn}`; assert.ok(inc?.leadId);
  assert.equal((await c.get(`/api/leads/${inc!.leadId}`)).body.lead.source, "phone");
  const vm = await tw(`/api/public/voice/inbound-dial/${inc!.id}`, { DialCallStatus: "no-answer" }); assert.match(vm.body, /<Record /); assert.match(vm.body, /leave your name/);
  assert.ok((await c.get(`/api/leads/${inc!.leadId}`)).body.tasks.some((t: any) => /Cevapsız arama/.test(t.title)));
  assert.ok((await c.get("/api/notifications")).body.items.some((n: any) => n.type === "call.missed"));
  await tw(`/api/public/voice/recording/${inc!.id}?vm=1`, { RecordingSid: "REvm", RecordingUrl: "https://api.twilio.com/2010-04-01/Accounts/AC/Recordings/REvm", RecordingDuration: "22" });
  const [vj] = await ownerSql`select payload from jobs where type = 'call.process' and payload->>'callId' = ${inc!.id}`; await processCall(inc!.id as string, (vj!.payload as any).url, true);
  assert.equal((await c.get(`/api/leads/${inc!.leadId}/calls`)).body[0].outcome, "voicemail");
  assert.equal((await c.get("/api/calls?direction=in")).body.length, 1);

  const other = await signup(app, "Diğer");
  assert.equal((await other.c.get("/api/calls")).body.length, 0); assert.equal((await other.c.get(`/api/leads/${l0.body.leadId}/calls`)).body.length, 0);
  void client;
});
