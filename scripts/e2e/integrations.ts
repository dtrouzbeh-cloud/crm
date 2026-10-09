// Entegrasyon testi: (A) gerçek sağlayıcılara geçersiz anahtarla canlı istek — adres/biçim doğru mu, hata kullanıcıya düzgün dönüyor mu;
// (B) sistem içi uçtan uca akışlar — gelen/giden webhook (imza, yeniden deneme), REST API, CSV, Stripe webhook, Meta lead kuyruğu.
// Kullanım: test örneğinde (run-integrations.sh). Üretim verisine dokunmaz.
import { createHmac, randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";

const BASE = process.env.E2E_BASE ?? "http://127.0.0.1:4199";
const SECRET = process.env.E2E_META_SECRET ?? "";
const VERIFY = process.env.E2E_META_VERIFY ?? "";
const RECV = process.env.E2E_RECEIVER ?? "https://127.0.0.1:4299";
const OUT = process.env.E2E_OUT ?? "integrations-report.json";
const RUN = randomBytes(3).toString("hex");
const PASS = "E2e!" + randomBytes(9).toString("base64url");
const rnd = (n = 6) => String(Math.floor(10 ** (n - 1) + Math.random() * 9 * 10 ** (n - 1)));

type Res = { status: number; body: any; ms: number; text: string };
function client() {
  let cookie = "";
  const call = async (method: string, path: string, body?: unknown, extra: Record<string, string> = {}): Promise<Res> => {
    const t = Date.now();
    const r = await fetch(path.startsWith("http") ? path : BASE + path, { method, headers: { ...(cookie ? { cookie } : {}), ...(body !== undefined ? { "content-type": "application/json" } : {}), ...extra },
      body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body) });
    const sc = r.headers.getSetCookie(); if (sc.length) cookie = sc.map((c) => c.split(";")[0]).join("; ");
    const text = await r.text(); let j: any = text; try { j = JSON.parse(text); } catch { /* metin */ }
    return { status: r.status, body: j, ms: Date.now() - t, text };
  };
  return { get: (p: string, h?: Record<string, string>) => call("GET", p, undefined, h), post: (p: string, b: unknown = {}, h?: Record<string, string>) => call("POST", p, b, h),
    put: (p: string, b: unknown) => call("PUT", p, b), patch: (p: string, b: unknown) => call("PATCH", p, b), del: (p: string) => call("DELETE", p) };
}

// ── rapor ──
type Row = { group: string; name: string; ok: boolean; kind: "canlı" | "iç"; provider?: string; detail: string; ms: number };
const rows: Row[] = []; let group = "";
const G = (g: string) => { group = g; console.log(`\n▶ ${g}`); };
async function step(name: string, kind: Row["kind"], fn: () => Promise<string | void>, provider?: string) {
  const t = Date.now();
  try { const d = (await fn()) ?? ""; rows.push({ group, name, ok: true, kind, provider, detail: d, ms: Date.now() - t }); console.log(`  ✔ ${name}${d ? " — " + d : ""}`); }
  catch (e) { const d = (e as Error).message.slice(0, 500); rows.push({ group, name, ok: false, kind, provider, detail: d, ms: Date.now() - t }); console.log(`  ✖ ${name} — ${d}`); }
}
function ok(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }
const exp = (r: Res, s = 200, w = "") => { ok(r.status === s, `${w} → ${r.status} (beklenen ${s}): ${r.text.slice(0, 300)}`); return r.body; };
async function until<T>(fn: () => Promise<T | null | undefined | false>, ms = 20000, every = 1000): Promise<T> {
  const end = Date.now() + ms; let last: any;
  while (Date.now() < end) { try { last = await fn(); if (last) return last; } catch (e) { last = e; } await new Promise((r) => setTimeout(r, every)); }
  throw new Error(`zaman aşımı (${Math.round(ms / 1000)} sn)${last instanceof Error ? ": " + last.message : ""}`);
}
const sign = (raw: string) => "sha256=" + createHmac("sha256", SECRET).update(raw).digest("hex");
/** Canlı sağlayıcı testi geçti mi: bizim API 200 + ok:false + sağlayıcının kimlik hatası (adres yanlışsa 404/“not found” gelirdi) */
function providerRejected(r: { ok?: boolean; message?: string }, expect: RegExp) {
  ok(r && r.ok === false, `beklenmedik sonuç: ${JSON.stringify(r)}`);
  ok(!/\b404\b|not found|ENOTFOUND|ECONNREFUSED|ulaşılamadı|Bağlanılamadı/i.test(r.message ?? ""), `adres/erişim sorunu: ${r.message}`);
  ok(expect.test(r.message ?? ""), `sağlayıcı mesajı beklenen biçimde değil: ${r.message}`);
  return r.message!;
}

const S: Record<string, any> = {};
const db = async () => { const { default: postgres } = await import("postgres"); return postgres(process.env.E2E_DB_URL!, { max: 1, transform: postgres.camel }); };

async function main() {
  const A = client();
  G("Hazırlık");
  await step("Test kliniği", "iç", async () => {
    exp(await A.post("/api/auth/signup", { clinicName: `Entegrasyon Test ${RUN}`, name: "Entegrasyon Admin", email: `int.${RUN}@ege-dental.test`, password: PASS, country: "TR", currency: "EUR", language: "tr" }), 200, "signup");
    const me = exp(await A.get("/api/auth/me"), 200, "me"); S.clinicId = me.clinic.id; S.userId = me.user.id;
  });

  // ═════════ A) Gerçek sağlayıcılar ═════════
  G("A1. Yapay zekâ (Anthropic)");
  await step("Platform anahtarı ile gerçek bağlantı", "canlı", async () => { const r = exp(await A.post("/api/setup/keys/anthropic/test"), 200, "test"); ok(r.ok, r.message); return r.message; }, "Anthropic");
  await step("Klinik anahtarı yanlışsa net hata", "canlı", async () => {
    exp(await A.put("/api/setup/keys/anthropic", { key: "sk-ant-api03-" + "x".repeat(80) }), 200, "put");
    const r = exp(await A.post("/api/setup/keys/anthropic/test"), 200, "test"); const m = providerRejected(r, /401|invalid|authentication/i);
    exp(await A.put("/api/setup/keys/anthropic", { remove: true }), 200, "remove"); return m;
  }, "Anthropic");

  G("A2. Sesli mesaj dökümü (STT)");
  for (const [prov, key, re] of [["openai", "sk-proj-" + "x".repeat(48), /401|incorrect|invalid/i], ["deepgram", "x".repeat(40), /401|invalid|credentials/i], ["elevenlabs", "sk_" + "x".repeat(48), /401|invalid|api key/i]] as const)
    await step(`${prov}: gerçek uç + geçersiz anahtar`, "canlı", async () => {
      exp(await A.put("/api/setup/keys/stt", { provider: prov, key }), 200, "put"); return providerRejected(exp(await A.post("/api/setup/keys/stt/test"), 200, "test"), re);
    }, prov);
  await step("STT anahtarını kaldır", "iç", async () => { exp(await A.put("/api/setup/keys/stt", { remove: true }), 200, "remove"); });

  G("A3. E-posta (Resend)");
  await step("Gerçek uç + geçersiz anahtar", "canlı", async () => {
    exp(await A.put("/api/setup/keys/resend", { key: "re_" + "x".repeat(32), from: "info@ege-dental.test" }), 200, "put");
    return providerRejected(exp(await A.post("/api/setup/keys/resend/test"), 200, "test"), /40[0-3]|invalid|api key/i);
  }, "Resend");

  G("A4. Telefon (Twilio)");
  await step("Gerçek uç + geçersiz hesap", "canlı", async () => {
    exp(await A.put("/api/setup/keys/twilio", { sid: "AC" + "0".repeat(32), token: "t".repeat(32), number: "+447700900000" }), 200, "put");
    return providerRejected(exp(await A.post("/api/setup/keys/twilio/test"), 200, "test"), /401|authenticat|credentials/i);
  }, "Twilio");

  await step("Tek tık arama: Twilio'ya gerçek arama isteği, hata temsilciye net dönüyor", "canlı", async () => {
    exp(await A.put("/api/me/phone", { phone: "+90 532 000 00 00" }), 200, "my phone");
    const l = exp(await A.post("/api/leads", { fullName: "Call Test", phone: "+447700" + rnd(6), country: "GB" }), 200, "lead");
    const r = await A.post(`/api/leads/${l.leadId}/call`); ok(r.status === 502 && /Twilio 40[13]/.test(r.body?.message ?? ""), `${r.status} ${r.text.slice(0, 200)}`);
    const calls = exp(await A.get(`/api/leads/${l.leadId}/calls`), 200, "calls"); ok(calls[0]?.status === "failed" && calls[0]?.error, "başarısız arama kaydı yok");
    const cfg = exp(await A.get("/api/voice/config"), 200, "cfg"); ok(/\/api\/public\/voice\/inbound$/.test(cfg.inboundUrl), cfg.inboundUrl);
    return r.body.message;
  }, "Twilio");
  await step("Gelen arama webhook'u: imzasız istek reddediliyor", "iç", async () => {
    const r = await A.post("/api/public/voice/inbound", "From=%2B447700900123&To=%2B447700900000&CallSid=CA1", { "content-type": "application/x-www-form-urlencoded" }); ok(r.status === 403, `${r.status}`); return "403";
  }, "Twilio");

  G("A5. Ödeme sağlayıcıları (sandbox)");
  for (const [prov, cfg, re] of [["stripe", { secretKey: "sk_test_" + "x".repeat(24), webhookSecret: "whsec_e2e_" + RUN }, /Stripe 401|invalid api key/i],
    ["iyzico", { apiKey: "sandbox-" + "x".repeat(24), secretKey: "sandbox-" + "y".repeat(24) }, /iyzico/i],
    ["paypal", { clientId: "A" + "x".repeat(40), clientSecret: "E" + "y".repeat(40) }, /PayPal/i]] as const)
    await step(`${prov}: kimlik doğrulamalı gerçek çağrı`, "canlı", async () => {
      exp(await A.put(`/api/payment-providers/${prov}`, { mode: "test", active: true, credentials: cfg, config: {} }), 200, "put");
      return providerRejected(exp(await A.post(`/api/payment-providers/${prov}/test`), 200, "test"), re);
    }, prov);

  G("A6. Meta (WhatsApp, Instagram, Lead Ads, Reklam, CAPI)");
  await step("WhatsApp manuel bağlantı: geçersiz belirteç Meta'dan reddedilir", "canlı", async () => {
    const r = await A.post("/api/inbox/accounts/manual", { phoneNumberId: "1" + rnd(14), wabaId: "2" + rnd(14), token: "EAAG" + "x".repeat(60) }); ok(r.status === 400 && /meta_error/.test(r.text), `${r.status} ${r.text.slice(0, 200)}`);
    ok(/OAuth|access token|Invalid/i.test(r.body.message), r.body.message); return r.body.message;
  }, "Meta Graph");
  await step("Instagram bağlantısı: belirteç Meta'da doğrulanıyor", "canlı", async () => {
    const r = await A.post("/api/inbox/accounts/meta", { channel: "instagram", externalId: "17841" + rnd(10), token: "IGQ" + "x".repeat(60), name: "test_ig" }); ok(r.status === 400, `geçersiz belirteç kabul edildi (${r.status})`);
    return r.body.message;
  }, "Meta Graph");
  await step("Lead Ads sayfa listesi: geçersiz kullanıcı belirteci", "canlı", async () => {
    const r = await A.post("/api/integrations/meta/pages", { userToken: "EAAG" + "x".repeat(60) }); ok(r.status === 400 && /OAuth|token|Invalid/i.test(r.body?.message ?? ""), `${r.status} ${r.text.slice(0, 200)}`); return r.body.message;
  }, "Meta Graph");
  await step("Reklam harcaması senkronu: hata kullanıcıya dönüyor", "canlı", async () => {
    exp(await A.put("/api/ads/meta", { adAccountId: "act_" + rnd(15), token: "EAAG" + "x".repeat(60), datasetId: rnd(15), capiToken: "EAAG" + "y".repeat(60), capi: true, requireConsent: true }), 200, "ads put");
    const r = await A.post("/api/ads/meta/sync"); ok(r.status === 502 && /OAuth|token|Invalid/i.test(r.body?.message ?? ""), `${r.status} ${r.text.slice(0, 200)}`); return r.body.message;
  }, "Meta Marketing API");
  await step("Conversions API: olay Meta'ya gidiyor, hata kayda geçiyor", "canlı", async () => {
    const l = exp(await A.post("/api/leads", { fullName: "Capi Test", phone: "+447700" + rnd(6), email: `capi.${RUN}@example.com`, source: "meta", marketingConsent: true, utm: { fbclid: "FB" + RUN } }), 200, "lead");
    const ev = await until(async () => { const x = (exp(await A.get("/api/ads/conversions"), 200, "conv") as any[]).find((e) => e.leadId === l.leadId); return x && x.status !== "pending" ? x : null; }, 45000, 2000);
    ok(["error", "failed"].includes(ev.status) && /OAuth|token|Invalid/i.test(ev.error ?? ""), `durum ${ev.status}: ${ev.error}`); return `olay ${ev.event} → ${ev.error.slice(0, 80)}`;
  }, "Meta CAPI");

  // ═════════ B) Sistem içi uçtan uca ═════════
  G("B1. Meta webhook doğrulama (hub.challenge)");
  for (const p of ["/api/public/wa/webhook", "/api/public/meta/messages", "/api/public/meta/leads"])
    await step(`${p}`, "iç", async () => {
      const okr = await A.get(`${p}?hub.mode=subscribe&hub.verify_token=${encodeURIComponent(VERIFY)}&hub.challenge=CH${RUN}`); ok(okr.status === 200 && okr.text === `CH${RUN}`, `doğru belirteç: ${okr.status} ${okr.text.slice(0, 60)}`);
      const bad = await A.get(`${p}?hub.mode=subscribe&hub.verify_token=yanlis&hub.challenge=x`); ok(bad.status === 403, `yanlış belirteç ${bad.status}`);
      return "doğru belirteç ✓, yanlış 403";
    });

  G("B2. WhatsApp mesaj durumu webhook'u");
  await step("Gönderildi → iletildi → okundu", "iç", async () => {
    const sql = await db(); const pn = "e2ei" + RUN, wa = "4477009" + rnd(5), ext = "wamid.INT" + RUN;
    await sql`insert into channel_accounts (clinic_id, channel, name, external_id, waba_id, phone, status) values (${S.clinicId}, 'whatsapp', 'Int WA', ${pn}, ${"w" + RUN}, '+90', 'connected')`;
    const body = JSON.stringify({ entry: [{ changes: [{ value: { metadata: { phone_number_id: pn }, contacts: [{ wa_id: wa, profile: { name: "Status Test" } }], messages: [{ from: wa, id: "wamid.IN" + RUN, timestamp: String(Math.floor(Date.now() / 1000)), type: "text", text: { body: "Hello" } }] } }] }] });
    exp(await A.post("/api/public/wa/webhook", body, { "x-hub-signature-256": sign(body) }), 200, "inbound");
    const conv = await until(async () => (exp(await A.get("/api/inbox/conversations"), 200, "convs") as any[]).find((c) => c.contactName === "Status Test"));
    await sql`insert into messages (clinic_id, conversation_id, direction, type, body, external_id, status) values (${S.clinicId}, ${conv.id}, 'out', 'text', 'Thanks!', ${ext}, 'sent')`;
    for (const st of ["delivered", "read"]) { const b = JSON.stringify({ entry: [{ changes: [{ value: { metadata: { phone_number_id: pn }, statuses: [{ id: ext, status: st, timestamp: String(Math.floor(Date.now() / 1000)), recipient_id: wa }] } }] }] });
      exp(await A.post("/api/public/wa/webhook", b, { "x-hub-signature-256": sign(b) }), 200, "status " + st); }
    const m = (exp(await A.get(`/api/inbox/conversations/${conv.id}`), 200, "conv").messages as any[]).find((x) => x.externalId === ext || x.body === "Thanks!");
    await sql.end(); ok(m?.status === "read", `durum ${m?.status}`); return "mesaj durumu: read";
  });

  G("B3. Meta Lead Ads webhook'u");
  await step("Graph hatasında lead kaybolmuyor, yeniden deneme kuyruğunda", "iç", async () => {
    const sql = await db(); const { encrypt } = await import(process.env.E2E_APP + "/apps/api/src/lib/crypto.ts"); const page = "10" + rnd(13), lg = "88" + rnd(13);
    await sql`insert into integrations (clinic_id, kind, name, credentials_enc, config, status) values (${S.clinicId}, 'meta_leads', 'Test Sayfa', ${encrypt("EAAG" + "x".repeat(60))}, ${sql.json({ pageId: page })}, 'connected')`;
    const body = JSON.stringify({ object: "page", entry: [{ id: page, time: Math.floor(Date.now() / 1000), changes: [{ field: "leadgen", value: { leadgen_id: lg, page_id: page, form_id: "1", created_time: Math.floor(Date.now() / 1000) } }] }] });
    exp(await A.post("/api/public/meta/leads", body, { "x-hub-signature-256": "sha256=00" }), 401, "imzasız");
    exp(await A.post("/api/public/meta/leads", body, { "x-hub-signature-256": sign(body) }), 200, "leadgen");
    const [job] = await sql`select type, attempts, run_at > now() as later from jobs where dedupe_key = ${"leadgen:" + lg}`;
    const [ig] = await sql`select status, last_error from integrations where clinic_id = ${S.clinicId} and kind = 'meta_leads'`; await sql.end();
    ok(job, "yeniden deneme işi yok — lead kayboldu"); return `entegrasyon: ${ig.status} (${String(ig.lastError).slice(0, 60)}) · iş kuyrukta`;
  }, "Meta Graph");

  G("B4. Genel gelen webhook (Zapier/Typeform/WordPress)");
  await step("Alan eşleme ile lead + mükerrer korunması", "iç", async () => {
    const ig = exp(await A.post("/api/integrations", { kind: "typeform", name: "Web formu", config: { fieldMap: { fullName: "answers.name", phone: "answers.whatsapp", interest: "answers.treatment" } } }), 200, "integration");
    const url = new URL(ig.inboundUrl).pathname; const ph = "+3361" + rnd(7);
    const r1 = exp(await A.post(url, { id: "tf-" + RUN, answers: { name: "Claire Dubois", whatsapp: ph, treatment: "Veneers" } }), 200, "inbound");
    const r2 = exp(await A.post(url, { id: "tf-" + RUN, answers: { name: "Claire Dubois", whatsapp: ph } }), 200, "dup"); ok(r2.duplicate, "mükerrer korunmadı");
    const l = exp(await A.get(`/api/leads/${r1.leadId}`), 200, "lead").lead; ok(l.fullName === "Claire Dubois" && l.interest === "Veneers", `eşleme: ${l.fullName}/${l.interest}`);
    exp(await A.post(url.replace(/[^/]+$/, "yanlis"), { a: 1 }), 404, "yanlış belirteç"); return `kaynak ${l.source}, ülke ${l.country ?? "-"}`;
  });
  await step("Google Ads lead formu (resmî biçim)", "iç", async () => {
    const ig = exp(await A.post("/api/integrations", { kind: "google_leads", name: "Google Ads" }), 200, "integration"); const url = new URL(ig.inboundUrl).pathname;
    exp(await A.post(url, { lead_id: "g" + RUN, google_key: "yanlis", user_column_data: [] }), 401, "yanlış anahtar");
    const r = exp(await A.post(url, { lead_id: "g" + RUN, api_version: "1.0", form_id: 1, campaign_id: 2, google_key: ig.googleKey, is_test: true, gcl_id: "GCL" + RUN, campaign_name: "UK Implants",
      user_column_data: [{ column_id: "FULL_NAME", string_value: "Oliver Smith" }, { column_id: "PHONE_NUMBER", string_value: "+447700" + rnd(6) }, { column_id: "EMAIL", string_value: `o.${RUN}@example.com` }] }), 200, "google");
    const l = exp(await A.get(`/api/leads/${r.leadId}`), 200, "lead").lead; ok(l.campaign === "UK Implants", `kampanya ${l.campaign}`); return `lead ${l.fullName}, kampanya ${l.campaign}`;
  });

  G("B5. REST API (v1)");
  await step("Yazma anahtarı okuyamaz, okuma anahtarı yazamaz", "iç", async () => {
    const w = exp(await A.post("/api/integrations/api-keys", { name: "Yazma", scopes: ["leads:write"] }), 200, "key w"); const r = exp(await A.post("/api/integrations/api-keys", { name: "Okuma", scopes: ["leads:read", "deals:read"] }), 200, "key r");
    const H = (k: string) => ({ authorization: `Bearer ${k}` });
    const c = exp(await A.post("/api/v1/leads", { name: "Api Lead", phone: "+4915" + rnd(9), treatment: "Implant" }, H(w.key)), 200, "create");
    ok((await A.get("/api/v1/leads", H(w.key))).status === 403, "yazma anahtarı okudu"); ok((await A.post("/api/v1/leads", { name: "x", phone: "+4915" + rnd(9) }, H(r.key))).status === 403, "okuma anahtarı yazdı");
    const list = exp(await A.get("/api/v1/leads", H(r.key)), 200, "list"); const deals = exp(await A.get("/api/v1/deals", H(r.key)), 200, "deals");
    ok((await A.get("/api/v1/leads", H("df_yanlis"))).status === 401, "geçersiz anahtar");
    return `lead ${c.leadId ? "oluştu" : "?"}, liste ${(list.items ?? list.data ?? list).length}, deal ${(deals.items ?? deals.data ?? deals).length}`;
  });

  G("B6. CSV içe aktarma");
  await step("Önizleme → içe aktar → geri al", "iç", async () => {
    const csv = `Ad Soyad;Telefon;E-posta;Ülke;Tedavi\nMaria Rossi;+39333${rnd(7)};maria.${RUN}@example.com;IT;Veneer\nJan de Vries;+31612${rnd(6)};jan.${RUN}@example.com;NL;Implant\nAhmet Yıldız;+90532${rnd(7)};;TR;Kron\n`;
    const pv = exp(await A.post("/api/import/preview", { csv, fileName: "leads.csv" }), 200, "preview");
    const run = exp(await A.post("/api/import/run", { csv, mapping: pv.mapping, fileName: "leads.csv", source: "import" }), 200, "run");
    const n = run.created; ok(n === 3, `içe aktarılan ${JSON.stringify(run).slice(0, 200)}`);
    const u = exp(await A.post(`/api/import/runs/${run.runId}/undo`), 200, "undo"); return `3 kayıt eklendi, geri alındı (${JSON.stringify(u).slice(0, 60)})`;
  });

  G("B7. Giden webhook (imza, teslim, yeniden deneme)");
  await step("Abonelik + test ping (HMAC doğrulama)", "iç", async () => {
    const r = exp(await A.post("/api/integrations/webhooks", { url: `${RECV}/hook-${RUN}`, events: ["lead.created", "deal.won", "quote.accepted"] }), 200, "create"); S.whSecret = r.secret;
    const eps = exp(await A.get("/api/integrations/webhooks"), 200, "list"); S.whId = eps.endpoints[0].id;
    const t = exp(await A.post(`/api/integrations/webhooks/${S.whId}/test`), 200, "test"); ok(t.status === 200, `ping ${JSON.stringify(t)}`);
    const got = (await (await fetch(`${RECV}/log`)).json() as any[]).filter((x) => x.path === `/hook-${RUN}`).pop(); ok(got, "alıcıya ulaşmadı");
    const [tp, v1] = String(got.headers["x-dentaflow-signature"]).split(",").map((p) => p.split("=")[1]); const exp1 = createHmac("sha256", S.whSecret).update(`${tp}.${got.body}`).digest("hex");
    ok(v1 === exp1, "imza doğrulanamadı"); return "imza ✓";
  });
  await step("Gerçek olay: lead.created teslim edildi", "iç", async () => {
    const l = exp(await A.post("/api/leads", { fullName: "Webhook Lead", phone: "+4917" + rnd(9) }), 200, "lead");
    const got = await until(async () => (await (await fetch(`${RECV}/log`)).json() as any[]).find((x) => x.path === `/hook-${RUN}` && x.body.includes(l.leadId) && x.status === 200), 30000);
    const ev = JSON.parse(got.body); ok(ev.type === "lead.created", ev.type);
    const [tp, v1] = String(got.headers["x-dentaflow-signature"]).split(",").map((p) => p.split("=")[1]); ok(v1 === createHmac("sha256", S.whSecret).update(`${tp}.${got.body}`).digest("hex"), "imza");
    return `${Math.round((got.at - Date.now()) / -1000)} sn önce · olay ${ev.type}`;
  });
  await step("Alıcı 500 dönerse otomatik yeniden deneme", "iç", async () => {
    await fetch(`${RECV}/fail?n=1`);
    const l = exp(await A.post("/api/leads", { fullName: "Retry Lead", phone: "+4917" + rnd(9) }), 200, "lead");
    const hits = await until(async () => { const x = (await (await fetch(`${RECV}/log`)).json() as any[]).filter((h) => h.path === `/hook-${RUN}` && h.body.includes(l.leadId)); return x.some((h) => h.status === 200) ? x : null; }, 90000, 3000);
    ok(hits[0].status === 500, "ilk deneme başarısız olmalıydı"); return `${hits.length} deneme: ${hits.map((h: any) => h.status).join(" → ")}`;
  });

  G("B8. Stripe ödeme webhook'u");
  await step("İmzalı checkout.session.completed → kapora kaydı", "iç", async () => {
    const lead = exp(await A.post("/api/leads", { fullName: "Stripe Patient", phone: "+447700" + rnd(6), country: "GB" }), 200, "lead");
    const k = exp(await A.post("/api/cases", { leadId: lead.leadId }), 200, "case");
    exp(await A.put(`/api/cases/${k.id}/situation`, { situation: { 36: { s: "missing" } }, done: true }), 200, "sit");
    exp(await A.put(`/api/cases/${k.id}/plan`, { visits: 2, expectedRevision: 0, items: [{ id: "x1", v: 1, tx: "implant", teeth: [36], brand: "b_neod" }, { id: "x2", v: 2, tx: "crown_imp", teeth: [36] }] }), 200, "plan");
    exp(await A.post(`/api/cases/${k.id}/diagnose`, { acknowledge: true }), 200, "diag");
    const q = exp(await A.post(`/api/cases/${k.id}/quotes`), 200, "quote"); const P = client();
    const acc = exp(await P.post(`/api/public/q/${q.token}/respond`, { action: "accept", option: 0, agree: true }), 200, "accept");
    const co = await P.post(`/api/public/q/${q.token}/checkout`, { provider: "stripe" });
    ok(co.status === 502 && co.body?.error === "payment_unavailable", `geçersiz Stripe anahtarıyla ödeme sayfası: ${co.status} ${co.text.slice(0, 120)}`); S.stripeMsg = co.body?.message;
    const nt = exp(await A.get("/api/notifications"), 200, "notif"); ok(nt.items.some((n: any) => n.type === "payment.provider_error"), "kliniğe bildirim gitmedi");
    const pq = exp(await P.get(`/api/public/q/${q.token}`), 200, "pq"); ok(!pq.deposit?.pending, "başarısız deneme beklemede görünüyor");
    const sql = await db(); const d = (exp(await A.get(`/api/deals/${acc.dealId}`), 200, "deal")).deal;
    const [pi] = await sql`insert into payment_intents (clinic_id, deal_id, quote_id, provider, amount_minor, currency, status, provider_ref) values (${S.clinicId}, ${acc.dealId}, ${q.id}, 'stripe', ${d.depositMinor}, ${d.currency}, 'pending', ${"cs_test_" + RUN}) returning id`;
    const evt = JSON.stringify({ id: "evt_" + RUN, type: "checkout.session.completed", data: { object: { id: "cs_test_" + RUN, client_reference_id: pi.id, metadata: { intent_id: pi.id }, payment_status: "paid", payment_intent: "pi_" + RUN, amount_total: Number(d.depositMinor) } } });
    const ts = Math.floor(Date.now() / 1000), sig = createHmac("sha256", "whsec_e2e_" + RUN).update(`${ts}.${evt}`).digest("hex");
    ok((await A.post("/api/public/pay/stripe/webhook", evt, { "stripe-signature": `t=${ts},v1=${"0".repeat(64)}` })).status === 400, "sahte imza kabul edildi");
    exp(await A.post("/api/public/pay/stripe/webhook", evt, { "stripe-signature": `t=${ts},v1=${sig}` }), 200, "webhook");
    exp(await A.post("/api/public/pay/stripe/webhook", evt, { "stripe-signature": `t=${ts},v1=${sig}` }), 200, "tekrar (idempotent)");
    const d2 = exp(await A.get(`/api/deals/${acc.dealId}`), 200, "deal"); await sql.end();
    ok(d2.payments.length === 1 && d2.deal.stage === "deposit", `ödeme ${d2.payments.length}, aşama ${d2.deal.stage}`);
    return `kapora ${Number(d2.payments[0].amountMinor) / 100} ${d2.deal.currency} · tekrar gelen olay çift kayıt yapmadı · hastaya giden hata: “${String(S.stripeMsg).slice(0, 60)}”`;
  }, "Stripe");

  G("B9. Giden istek güvenliği");
  await step("İç ağ adresleri engelleniyor (SSRF)", "iç", async () => {
    const { assertPublicUrl } = await import(process.env.E2E_APP + "/apps/api/src/lib/netguard.ts"); const prev = process.env.WEBHOOK_ALLOW_PRIVATE; delete process.env.WEBHOOK_ALLOW_PRIVATE;
    const bad = ["https://127.0.0.1/x", "https://169.254.169.254/latest/meta-data", "https://10.0.0.5/", "https://localhost:5432/", "https://[::1]/", "https://192.168.1.1/"];
    const blocked: string[] = []; for (const u of bad) { try { await assertPublicUrl(u); } catch { blocked.push(u); } }
    let pub = true; try { await assertPublicUrl("https://hooks.zapier.com/hooks/catch/1/abc"); } catch { pub = false; }
    process.env.WEBHOOK_ALLOW_PRIVATE = prev; ok(blocked.length === bad.length, `engellenmeyen: ${bad.filter((b) => !blocked.includes(b))}`); ok(pub, "genel adres engellendi");
    return `${blocked.length}/${bad.length} iç adres engellendi, Zapier serbest`;
  });
}

const t0 = Date.now();
await main().catch((e) => { console.error("BEKLENMEYEN", e); rows.push({ group, name: "beklenmeyen", ok: false, kind: "iç", detail: String(e), ms: 0 }); });
const pass = rows.filter((r) => r.ok).length;
console.log(`\n═══ ${pass}/${rows.length} geçti · ${Math.round((Date.now() - t0) / 1000)} sn`);
for (const r of rows.filter((x) => !x.ok)) console.log(`  ✖ [${r.group}] ${r.name}: ${r.detail}`);
writeFileSync(OUT, JSON.stringify({ run: RUN, at: new Date().toISOString(), pass, total: rows.length, rows }, null, 1));
process.exit(pass === rows.length ? 0 : 1);
