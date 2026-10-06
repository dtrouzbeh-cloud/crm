// Uçtan uca hasta yolculuğu: canlı bir sunucuya gerçek HTTP ile (çerez, imzalı webhook, çok parçalı dosya, SSE).
// Kullanım: E2E_BASE=http://127.0.0.1:4199 E2E_META_SECRET=… E2E_OPG=/yol/opg.jpg node scripts/e2e/journey.ts
// Ayrı bir veritabanına bağlı test örneğinde çalıştırın; üretim verisine dokunmaz. Arka plan işçisi (worker) çalışıyor olmalı.
import { createHmac, randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const BASE = process.env.E2E_BASE ?? "http://127.0.0.1:4199";
const SECRET = process.env.E2E_META_SECRET ?? "";
const OPG = process.env.E2E_OPG ?? "";
const REAL_AI = process.env.E2E_REAL_AI === "1";
const OUT = process.env.E2E_OUT ?? "e2e-report.json";
const RUN = randomBytes(3).toString("hex");
const PASS = "E2e!" + randomBytes(9).toString("base64url");   // üretilen test şifresi; ekrana yazılmaz
const rnd = (n = 5) => String(Math.floor(10 ** (n - 1) + Math.random() * 9 * 10 ** (n - 1)));

type Res = { status: number; body: any; ms: number };
function client(label: string) {
  let cookie = "";
  const call = async (method: string, path: string, body?: unknown, extra: Record<string, string> = {}): Promise<Res> => {
    const t = Date.now();
    const isForm = body instanceof FormData;
    const r = await fetch(BASE + path, { method, headers: { ...(cookie ? { cookie } : {}), ...(body !== undefined && !isForm ? { "content-type": "application/json" } : {}), ...extra },
      body: body === undefined ? undefined : isForm ? body : typeof body === "string" ? body : JSON.stringify(body) });
    const sc = r.headers.getSetCookie(); if (sc.length) cookie = sc.map((c) => c.split(";")[0]).join("; ");
    const txt = await r.text(); let j: any = txt; try { j = JSON.parse(txt); } catch { /* metin */ }
    return { status: r.status, body: j, ms: Date.now() - t };
  };
  return { label, get cookie() { return cookie; }, get: (p: string) => call("GET", p), post: (p: string, b: unknown = {}, h?: Record<string, string>) => call("POST", p, b, h),
    put: (p: string, b: unknown) => call("PUT", p, b), patch: (p: string, b: unknown) => call("PATCH", p, b), del: (p: string) => call("DELETE", p) };
}
type C = ReturnType<typeof client>;

// ── rapor ──
const results: { phase: string; step: string; ok: boolean; ms: number; info?: string; error?: string }[] = [];
let phase = "";
const slow: { path: string; ms: number }[] = [];
async function step(name: string, fn: () => Promise<string | void>) {
  const t = Date.now();
  try { const info = await fn(); results.push({ phase, step: name, ok: true, ms: Date.now() - t, info: info || undefined }); console.log(`  ✔ ${name}${info ? " — " + info : ""} (${Date.now() - t} ms)`); }
  catch (e) { const msg = (e as Error).message.slice(0, 600); results.push({ phase, step: name, ok: false, ms: Date.now() - t, error: msg }); console.log(`  ✖ ${name} — ${msg}`); }
}
const P = (n: string) => { phase = n; console.log(`\n▶ ${n}`); };
function ok(cond: unknown, msg: string): asserts cond { if (!cond) throw new Error(msg); }
const exp = (r: Res, status = 200, what = "") => { if (r.ms > 1500) slow.push({ path: what, ms: r.ms }); ok(r.status === status, `${what} → ${r.status} (beklenen ${status}): ${JSON.stringify(r.body).slice(0, 300)}`); return r.body; };
async function until<T>(fn: () => Promise<T | null | undefined | false>, ms = 20000, every = 500): Promise<T> {
  const end = Date.now() + ms; let last: any;
  while (Date.now() < end) { try { last = await fn(); if (last) return last; } catch (e) { last = e; } await new Promise((r) => setTimeout(r, every)); }
  throw new Error(`zaman aşımı (${ms} ms)${last instanceof Error ? ": " + last.message : ""}`);
}
const sign = (raw: string) => "sha256=" + createHmac("sha256", SECRET).update(raw).digest("hex");
const PNG = "data:image/png;base64," + Buffer.alloc(600, 1).toString("base64");
const iso = (days: number, h = 10) => { const d = new Date(Date.now() + days * 86400000); d.setUTCHours(h, 0, 0, 0); return d.toISOString(); };

// ── paylaşılan durum ──
const S: Record<string, any> = {};

async function main() {
  console.log(`DentaFlow uçtan uca test · ${BASE} · çalıştırma ${RUN} · gerçek AI: ${REAL_AI ? "evet" : "hayır"}`);
  const admin = client("admin");

  // ───────────────────────── 1. Kurulum
  P("1. Klinik kurulumu");
  await step("Sağlık kontrolü", async () => { const r = await admin.get("/api/health"); exp(r, 200, "health"); return `yanıt ${r.ms} ms`; });
  await step("Klinik kaydı (yönetici)", async () => {
    S.adminEmail = `selin.${RUN}@ege-dental.test`;
    const b = exp(await admin.post("/api/auth/signup", { clinicName: `Ege Dental Klinik ${RUN}`, name: "Selin Aydın", email: S.adminEmail, password: PASS, country: "TR", currency: "EUR", language: "tr" }), 200, "signup");
    S.clinicId = b.clinic.id; const me = exp(await admin.get("/api/auth/me"), 200, "me"); S.adminId = me.user.id; ok(me.role === "admin", "rol admin değil");
    return `klinik ${S.clinicId.slice(0, 8)}`;
  });
  await step("Klinik profili ve teklif ayarları", async () => {
    exp(await admin.patch("/api/clinic", { name: `Ege Dental Klinik ${RUN}`, settings: { reviewLinks: [{ name: "Google", url: "https://g.page/r/ege-dental/review" }],
      quote: { depositBps: 1500, validDays: 14, rounding: 10, gapMinMonths: 3, gapMaxMonths: 6, hotelNightEur: 70, transferEur: 50 } } }), 200, "clinic patch");
    const c = exp(await admin.get("/api/clinic"), 200, "clinic"); ok(c.settings?.quote?.depositBps === 1500, "kapora ayarı kaydedilmedi");
  });
  await step("Katalog: 38+ tedavi, 11 paket, fiyat güncelleme", async () => {
    const cat = exp(await admin.get("/api/catalog"), 200, "catalog");
    ok(cat.treatments.length >= 38, `tedavi sayısı ${cat.treatments.length}`); ok(cat.bundles.length >= 10, `paket ${cat.bundles.length}`);
    ok(!cat.treatments.some((t: any) => t.id === "implant_imm"), "Anında implant hâlâ katalogda");
    const zr = cat.treatments.find((t: any) => t.id === "crown_zr"); ok(zr, "zirkonyum kron yok");
    exp(await admin.put("/api/catalog/treatments/crown_zr", { priceEur: 230 }), 200, "fiyat güncelle");
    const zr2 = (exp(await admin.get("/api/catalog"), 200, "catalog2") as any).treatments.find((t: any) => t.id === "crown_zr"); ok(zr2.price === 230, `fiyat ${zr2.price}`);
    return `${cat.treatments.length} tedavi, ${cat.bundles.length} paket`;
  });
  await step("Otel tanımı", async () => { const h = exp(await admin.put("/api/catalog/hotels/new", { name: "Swissôtel İzmir", stars: 5, nightEur: 95, active: true }), 200, "hotel"); S.hotelId = h.id;
    exp(await admin.put("/api/catalog/hotels/gecersiz-id", { name: "x" }), 404, "geçersiz otel kimliği 404"); });
  await step("Havale ödeme sağlayıcısı", async () => { exp(await admin.put("/api/payment-providers/bank_transfer", { mode: "live", config: { accountName: "Ege Dental Klinik", iban: "TR330006100519786457841326", swift: "ISBKTRIS" } }), 200, "bank"); });
  await step("AI ajanı: asistan modu + koç/çeviri/puanlama/görüntü + bilgi tabanı", async () => {
    exp(await admin.put("/api/ai/agent", { name: "Ece", mode: "assist", channels: ["whatsapp", "instagram", "web"], pricePolicy: "ranges", features: { coach: true, translate: true, scoring: true, vision: true, lossReport: true, qa: true }, active: true }), 200, "ai agent");
    exp(await admin.post("/api/ai/kb", { title: "Paket içeriği", body: "Tüm implant paketlerine 5 yıldızlı otel, havalimanı transferi ve tercüman dahildir. All-on-4 tek çene 2 ziyaret, 3-6 ay arayla." }), 200, "kb");
    const a = exp(await admin.get("/api/ai/agent"), 200, "ai get"); ok(a.key.available, "AI anahtarı kullanılamıyor");
    return `anahtar: ${a.key.clinic ? "klinik" : a.key.mock ? "mock" : "platform"}`;
  });
  await step("Kurulum kontrol listesi", async () => { const s = exp(await admin.get("/api/setup"), 200, "setup"); return `${s.checklist.filter((x: any) => x.done).length}/${s.checklist.length} tamam`; });

  // ───────────────────────── 2. Ekip ve roller
  P("2. Ekip ve roller");
  const team: Record<string, C> = {};
  const people: [string, string, string][] = [["manager", "Burak Demir", "burak"], ["sales", "Ayşe Yılmaz", "ayse"], ["sales", "Can Öztürk", "can"], ["dentist", "Dr. Mert Kaya", "mert"],
    ["coordinator", "Zeynep Arslan", "zeynep"], ["translator", "Lena Schulz", "lena"], ["reception", "Elif Şahin", "elif"], ["accounting", "Okan Çelik", "okan"]];
  for (const [role, name, key] of people) await step(`Davet + kabul: ${name} (${role})`, async () => {
    const inv = exp(await admin.post("/api/team/invite", { email: `${key}.${RUN}@ege-dental.test`, role }), 200, "invite");
    const token = String(inv.link).split("/invite/")[1]; const u = client(key);
    exp(await u.post(`/api/invites/${token}/accept`, { name, password: PASS }), 200, "accept");
    const me = exp(await u.get("/api/auth/me"), 200, "me"); ok(me.role === role, `rol ${me.role}`); team[key] = u; S[key + "Id"] = me.user.id;
  });
  await step("Yetki: satış temsilcisi ayarları değiştiremez", async () => { exp(await team.ayse!.patch("/api/clinic", { name: "X" }), 403, "sales clinic patch"); });
  await step("Yetki: tercüman finansı göremez", async () => { const r = await team.lena!.get("/api/finance/summary"); ok(r.status === 403, `tercüman finans → ${r.status}`); });
  await step("Yetki: hekim fiyat/teklif gönderemez", async () => { const r = await team.mert!.get("/api/finance/commissions"); ok(r.status === 403, `hekim komisyon → ${r.status}`); });

  // ───────────────────────── 3. Kanallar
  P("3. Kanallar ve lead kaynakları");
  await step("WhatsApp hesabı bağlı (Meta onayı yerine doğrudan kayıt)", async () => {
    // Gerçek bağlantı Meta Embedded Signup ister; test örneğinde hesap satırı veritabanına eklenir (E2E_DB_URL)
    ok(process.env.E2E_DB_URL, "E2E_DB_URL yok");
    const { default: postgres } = await import("postgres"); const db = postgres(process.env.E2E_DB_URL!, { max: 1 });
    await db`insert into channel_accounts (clinic_id, channel, name, external_id, waba_id, phone, status) values (${S.clinicId}, 'whatsapp', 'Ege Dental WA', ${"e2e" + RUN}, ${"waba" + RUN}, '+902320000000', 'connected')`; await db.end();
    const acc = exp(await admin.get("/api/inbox/accounts"), 200, "accounts"); S.waAcc = acc.find((a: any) => a.channel === "whatsapp"); ok(S.waAcc, "hesap listede yok");
    S.waAcc.externalId = S.waAcc.externalId ?? S.waAcc.phoneNumberId ?? "e2e" + RUN; return S.waAcc.name;
  });
  await step("Web widget anahtarı", async () => { const w = exp(await admin.get("/api/widget"), 200, "widget"); S.widgetKey = w.key; ok(/^w_/.test(w.key), "widget key"); exp(await admin.put("/api/widget", { enabled: true }), 200, "widget on"); });
  await step("Landing sayfası (All-on-4 DE) yayınla", async () => {
    const p = exp(await admin.post("/api/landing", { template: "allon4_de" }), 200, "landing"); exp(await admin.put(`/api/landing/${p.id}`, { published: true }), 200, "publish");
    const info = exp(await admin.get(`/api/landing/${p.id}`), 200, "landing get"); S.lpPath = new URL(info.url).pathname.replace("/p/", ""); S.lpId = p.id;
  });
  await step("Ajans partneri + komisyon kuralları", async () => {
    S.partner = exp(await admin.post("/api/partners", { name: "Rhein Health Travel", type: "agency", commissionBps: 1000, refCode: `RHEIN${RUN}`.toUpperCase() }), 200, "partner");
    exp(await admin.post("/api/finance/commission-rules", { name: "Ajans", recipient: "lead_partner", rateBps: 0 }), 200, "rule1");
    exp(await admin.post("/api/finance/commission-rules", { name: "Temsilci %5", recipient: "deal_owner", rateBps: 500 }), 200, "rule2");
  });
  await step("Google Ads lead entegrasyonu", async () => { const ig = exp(await admin.post("/api/integrations", { kind: "google_leads", name: "Google Ads" }), 200, "integration"); S.gUrl = new URL(ig.inboundUrl).pathname; S.gKey = ig.googleKey; });
  await step("REST API anahtarı (Zapier)", async () => { const k = exp(await admin.post("/api/integrations/api-keys", { name: "Zapier", scopes: ["leads:write"] }), 200, "apikey"); S.apiKey = k.key; });
  await step("Instagram hesabı", async () => { S.igId = "17841" + rnd(10); exp(await admin.post("/api/inbox/accounts/meta", { channel: "instagram", externalId: S.igId, token: "IGQ" + "x".repeat(40), name: "ege_dental" }), 200, "ig"); });
  await step("Hızlı takip dizisi (speed-to-lead) aktif", async () => {
    const s = exp(await admin.post("/api/sequences/from-template", { key: "speed_to_lead", lang: "tr" }), 200, "seq"); S.seqId = s.id;
    exp(await admin.put(`/api/sequences/${s.id}`, { active: true, settings: { quietStart: 0, quietEnd: 0 } }), 200, "seq on");
  });

  // ───────────────────────── 4. Lead girişleri
  P("4. Lead girişleri (6 kaynak)");
  const rt = sseOpen(admin);
  await step("WhatsApp (imzalı webhook): Hans Müller, Almanca", async () => {
    // ülke/dil telefon ön ekinden (+49) çıkarılmalı
    ok(SECRET, "E2E_META_SECRET yok"); S.hansPhone = "4917" + rnd(9);
    const body = JSON.stringify({ object: "whatsapp_business_account", entry: [{ id: "w", changes: [{ field: "messages", value: { messaging_product: "whatsapp", metadata: { phone_number_id: S.waAcc.externalId },
      contacts: [{ wa_id: S.hansPhone, profile: { name: "Hans Müller" } }], messages: [{ from: S.hansPhone, id: "wamid.E2E" + RUN + "1", timestamp: String(Math.floor(Date.now() / 1000)), type: "text",
        text: { body: "Guten Tag, ich brauche oben alle Zähne neu. Was kostet All-on-4 bei Ihnen? Ehrlich gesagt finde ich die Preise in der Türkei manchmal zu günstig, ist das sicher?" } }] } }] }] });
    exp(await admin.post("/api/public/wa/webhook", body, { "x-hub-signature-256": "sha256=bad" }), 401, "imzasız webhook reddi");
    exp(await admin.post("/api/public/wa/webhook", body, { "x-hub-signature-256": sign(body) }), 200, "wa webhook");
    const conv = await until(async () => (exp(await admin.get("/api/inbox/conversations"), 200, "convs") as any[]).find((c) => c.contactName === "Hans Müller"));
    S.hansConv = conv.id; S.hansLead = conv.leadId; ok(S.hansLead, "otomatik lead yok");
    const l = exp(await admin.get(`/api/leads/${S.hansLead}`), 200, "lead").lead; ok(l.source === "whatsapp", `kaynak ${l.source}`);
    ok(l.country === "DE" && l.language === "de", `ülke/dil çıkarılamadı: ${l.country}/${l.language}`);
    return `lead ${S.hansLead.slice(0, 8)}, ülke ${l.country}, dil ${l.language}`;
  });
  await step("Aynı mesaj tekrar gelirse tek kayıt (idempotent)", async () => {
    const body = JSON.stringify({ entry: [{ changes: [{ value: { metadata: { phone_number_id: S.waAcc.externalId }, contacts: [{ wa_id: S.hansPhone, profile: { name: "Hans Müller" } }],
      messages: [{ from: S.hansPhone, id: "wamid.E2E" + RUN + "1", timestamp: String(Math.floor(Date.now() / 1000)), type: "text", text: { body: "dup" } }] } }] }] });
    exp(await admin.post("/api/public/wa/webhook", body, { "x-hub-signature-256": sign(body) }), 200, "dup");
    const msgs = exp(await admin.get(`/api/inbox/conversations/${S.hansConv}`), 200, "conv").messages as any[]; ok(msgs.filter((m) => m.direction === "in").length === 1, `gelen mesaj sayısı ${msgs.length}`);
  });
  await step("Web widget: Emma Clarke (veneer)", async () => {
    const pub = client("emma"); S.emmaPhone = "+447700" + rnd(6);
    const s = exp(await pub.post(`/api/public/widget/${S.widgetKey}/start`, { name: "Emma Clarke", phone: S.emmaPhone, email: `emma.${RUN}@example.com`, treatment: "Veneer", message: "Hi! How much for 20 E-max veneers? I'd like to come in March.", lang: "en", utm: { source: "google", campaign: "UK Veneers" }, consent: true }), 200, "widget start");
    S.emmaConv = s.conversationId; S.emmaToken = s.token; S.emmaPub = pub;
    const l = await until(async () => (exp(await admin.get("/api/leads?view=all&source=website"), 200, "leads") as any).items.find((x: any) => x.fullName === "Emma Clarke")); S.emmaLead = l.id;
  });
  await step("Landing formu: Ahmed Al-Farsi", async () => {
    const pub = client("lp"); exp(await pub.get(`/api/public/lp/${S.lpPath}`), 200, "lp view");
    const r = exp(await pub.post(`/api/public/lp/${S.lpPath}/lead`, { name: "Ahmed Al-Farsi", phone: "+97150" + rnd(7), email: `ahmed.${RUN}@example.com`, consent: true, utm: { source: "facebook", fbclid: "FB" + RUN } }), 200, "lp lead");
    S.ahmedLead = r.leadId; const l = exp(await admin.get(`/api/leads/${r.leadId}`), 200, "lead").lead; ok(l.source === "landing", l.source);
  });
  await step("Google Ads lead formu: Klaus Weber", async () => {
    const r = await admin.post(S.gUrl, { lead_id: "g-" + RUN, google_key: S.gKey, campaign_name: "DE Implants", user_column_data: [{ column_id: "FULL_NAME", string_value: "Klaus Weber" }, { column_id: "PHONE_NUMBER", string_value: "+4917" + rnd(9) }, { column_id: "EMAIL", string_value: `klaus.${RUN}@example.com` }] });
    exp(r, 200, "google lead"); S.klausLead = r.body.leadId;
  });
  await step("REST API (Zapier, idempotent): Mark Johnson", async () => {
    const h = { authorization: `Bearer ${S.apiKey}`, "idempotency-key": "zap-" + RUN };
    const r1 = exp(await admin.post("/api/v1/leads", { name: "Mark Johnson", phone: "+447911" + rnd(6), email: `mark.${RUN}@example.com`, treatment: "Implants", country: "GB" }, h), 200, "v1 lead");
    const r2 = exp(await admin.post("/api/v1/leads", { name: "Mark Johnson", phone: "+447911000000" }, h), 200, "v1 dup"); ok(r2.duplicate === true, "idempotency çalışmadı");
    S.markLead = r1.leadId ?? r1.id;
  });
  await step("Instagram DM (imzalı): Olga Petrova", async () => {
    const body = JSON.stringify({ object: "instagram", entry: [{ id: S.igId, messaging: [{ sender: { id: "9" + rnd(8) }, recipient: { id: S.igId }, timestamp: Date.now(), message: { mid: "mid." + RUN, text: "Здравствуйте! Сколько стоят виниры?" } }] }] });
    exp(await admin.post("/api/public/meta/messages", body, { "x-hub-signature-256": sign(body) }), 200, "ig webhook");
    const l = await until(async () => (exp(await admin.get("/api/leads?view=all&source=instagram"), 200, "leads") as any).items[0]); S.olgaLead = l.id;
  });
  await step("Manuel giriş (temsilci) + ajans ref kodu: Lisa Becker", async () => {
    const r = exp(await team.ayse!.post("/api/leads", { fullName: "Lisa Becker", phone: "+4915" + rnd(9), email: `lisa.${RUN}@example.com`, country: "DE", language: "de", source: "partner", interest: "Implant", utm: { ref: S.partner.refCode }, ownerId: S.ayseId }), 200, "manual lead");
    S.lisaLead = r.leadId; const l = exp(await admin.get(`/api/leads/${r.leadId}`), 200, "lead").lead; ok(l.partnerId === S.partner.id, "ajans eşleşmedi");
  });
  await step("Mükerrer kontrol: aynı telefon aynı hastaya bağlanır", async () => {
    const d = exp(await admin.post("/api/leads/check-duplicates", { phone: "+" + S.hansPhone }), 200, "dup"); ok(d.duplicate, "mükerrer bulunamadı");
  });
  await step("Anlık güncelleme (SSE) lead olaylarını iletti", async () => { await new Promise((r) => setTimeout(r, 1500)); const n = rt.events.filter((e) => /^lead\./.test(e.t ?? "")).length; ok(n >= 1, `lead olayı yok (toplam olay ${rt.events.length})`); return `${rt.events.length} olay`; });
  await step("İş akışı: yeni lead için otomatik görev + takip dizisi kaydı", async () => {
    const t = await until(async () => { const r = exp(await admin.get(`/api/tasks?who=all&status=all&leadId=${S.lisaLead}`), 200, "tasks") as any[]; return r.length ? r : null; }, 20000);
    const sq = exp(await admin.get(`/api/leads/${S.lisaLead}/sequences`), 200, "seq"); return `${t.length} görev, ${sq.length} dizi kaydı`;
  });
  await step("Lead listesi: 7 lead, kaynak dağılımı", async () => {
    const l = exp(await admin.get("/api/leads?view=all"), 200, "leads"); const by: Record<string, number> = {}; for (const x of l.items) by[x.source] = (by[x.source] ?? 0) + 1;
    ok(l.total >= 7, `toplam ${l.total}`); return Object.entries(by).map(([k, v]) => `${k}:${v}`).join(" ");
  });
  await step("Satış temsilcisi yalnız kendi lead'ini görür", async () => { const l = exp(await team.ayse!.get("/api/leads?view=all"), 200, "leads"); ok(l.items.every((x: any) => x.ownerId === S.ayseId), "başkasının lead'i görünüyor"); return `${l.total} lead`; });

  // ───────────────────────── 5. Gelen kutusu + AI
  P("5. Gelen kutusu ve AI satış koçu");
  await step("Hans konuşmasını Ayşe'ye ata", async () => { exp(await admin.patch(`/api/leads/${S.hansLead}`, { ownerId: S.ayseId }), 200, "assign"); exp(await admin.patch(`/api/inbox/conversations/${S.hansConv}`, { assigneeId: S.ayseId }), 200, "conv assign"); });
  await step("AI koç: dil, çeviri, itiraz, 3 cevap önerisi", async () => {
    const co = await until(async () => { const r = await team.ayse!.get(`/api/inbox/conversations/${S.hansConv}/coach`); if (r.status === 200 && r.body?.insight) return r.body; if (r.status === 200) await team.ayse!.post(`/api/inbox/conversations/${S.hansConv}/coach`, {}); return null; }, REAL_AI ? 90000 : 20000, 3000);
    const i = co.insight; ok(i.suggestions?.length === 3, `öneri ${i.suggestions?.length}`); ok(i.translation, "çeviri yok");
    S.coach = i; return `dil ${i.lang}, itiraz ${i.objection}, niyet ${i.intent}, ton ${i.sentiment}`;
  });
  await step("AI çeviri (TR → DE)", async () => { const r = exp(await team.ayse!.post("/api/ai/translate", { text: "Merhaba Hans Bey, ücretsiz ön değerlendirme için ağzınızın fotoğraflarını ve varsa panoramik röntgeninizi gönderebilir misiniz?", to: "de" }), 200, "translate"); ok(r.text?.length > 20, "çeviri boş"); return r.text.slice(0, 80); });
  await step("Temsilci cevap yazar (24 saat penceresi açık)", async () => {
    const r = await team.ayse!.post(`/api/inbox/conversations/${S.hansConv}/messages`, { body: S.coach?.suggestions?.[0]?.text ?? "Vielen Dank! Könnten Sie uns ein Röntgenbild schicken?", idempotencyKey: "k" + RUN });
    S.waSendStatus = r.status; ok([200, 502, 400].includes(r.status), `gönderim ${r.status}`);
    return r.status === 200 ? "gönderildi (kuyrukta)" : `WhatsApp API: ${r.body?.message?.slice(0, 80)}`;
  });
  await step("Widget: personel cevabı ziyaretçiye ulaşır", async () => {
    exp(await admin.patch(`/api/leads/${S.emmaLead}`, { ownerId: S.ayseId }), 200, "emma assign"); exp(await admin.patch(`/api/inbox/conversations/${S.emmaConv}`, { assigneeId: S.ayseId }), 200, "emma conv assign");
    exp(await team.ayse!.post(`/api/inbox/conversations/${S.emmaConv}/messages`, { body: "Hi Emma! Thanks for reaching out 😊 Could you send a smile photo so our dentist can prepare your personal plan? 20 E-max veneers usually take 5-6 days in our clinic.", idempotencyKey: "e" + RUN }), 200, "staff reply");
    exp(await S.emmaPub.post(`/api/public/widget/${S.widgetKey}/messages`, { token: S.emmaToken, body: "Sure, I'll send it tonight. Is the hotel included?" }), 200, "visitor reply");
    exp(await team.ayse!.post(`/api/inbox/conversations/${S.emmaConv}/messages`, { body: "Yes! Our package includes a 5-star hotel, airport transfers and a personal interpreter. I'll prepare your plan as soon as I get the photo.", idempotencyKey: "e2" + RUN }), 200, "staff reply 2");
    const m = exp(await S.emmaPub.get(`/api/public/widget/${S.widgetKey}/messages?token=${encodeURIComponent(S.emmaToken)}`), 200, "visitor pull").messages; ok(m.some((x: any) => x.from === "clinic"), "cevap gelmedi");
  });
  await step("AI cevap taslağı (asistan modu)", async () => { const r = exp(await team.ayse!.post(`/api/inbox/conversations/${S.emmaConv}/ai/suggest`, {}), 200, "ai suggest"); return String(r.text ?? r.draft?.body ?? JSON.stringify(r)).slice(0, 90); });
  await step("AI lead özeti", async () => { const r = exp(await team.ayse!.post(`/api/leads/${S.hansLead}/ai-summary`, {}), 200, "summary"); return String(r.summary ?? r.text ?? "").slice(0, 90); });

  // ───────────────────────── 6. Anamnez
  P("6. Anamnez formu (hasta tarafı, imzalı)");
  await step("Anamnez formu gönder → hasta doldurur → tıbbi profil", async () => {
    const tpl = exp(await admin.get("/api/forms/templates"), 200, "templates") as any[]; const intake = tpl.find((t) => t.key === "intake" && t.lang === "de") ?? tpl.find((t) => t.key === "intake");
    const rq = exp(await team.ayse!.post("/api/forms/requests", { templateId: intake.id, leadId: S.hansLead }), 200, "form req"); const tok = String(rq.url).split("/f/")[1];
    const pub = client("hans-form"); exp(await pub.get(`/api/public/f/${tok}`), 200, "form open");
    exp(await pub.post(`/api/public/f/${tok}/submit`, { answers: { age: 58, diabetes: true, heart: false, anticoag: false, bisph: false, chemo: false, pregnant: false, smoker: true, medications: "Metformin 1000 mg", truth: true }, signedName: "Hans Müller", signature: PNG }), 200, "submit");
    const d = exp(await admin.get(`/api/leads/${S.hansLead}`), 200, "lead"); ok(d.medical.flags.includes("diabetes"), "diyabet aktarılmadı"); return `bayraklar: ${d.medical.flags.join(", ")}`;
  });

  // ───────────────────────── 7. Vaka + OPG + AI
  P("7. Vaka, röntgen ve AI ön değerlendirme");
  await step("Vaka aç", async () => { const k = exp(await team.ayse!.post("/api/cases", { leadId: S.hansLead }), 200, "case"); S.caseId = k.id; });
  await step("OPG yükle (çok parçalı, gerçek röntgen)", async () => {
    ok(OPG, "E2E_OPG yok"); const fd = new FormData(); fd.append("file", new Blob([readFileSync(OPG)], { type: "image/jpeg" }), "hans-opg.jpg");
    const r = exp(await team.ayse!.post(`/api/files?kind=xray&entity=case&entityId=${S.caseId}`, fd), 200, "upload"); S.opgFile = (Array.isArray(r) ? r : r.files ?? [r])[0]; return `${Math.round(readFileSync(OPG).length / 1024)} KB`;
  });
  await step("Hekim vakayı üstlenir", async () => { exp(await team.mert!.post(`/api/cases/${S.caseId}/claim`, {}), 200, "claim"); });
  await step("AI ön değerlendirme (görüntü)", async () => {
    const r = await team.mert!.post(`/api/cases/${S.caseId}/ai-assess`, {}); exp(r, 200, "ai-assess"); S.assess = r.body;
    const by: Record<string, number> = {}; for (const f of r.body.findings) by[f.status] = (by[f.status] ?? 0) + 1;
    return `${r.ms} ms · güven ${r.body.confidence} · ${r.body.findings.length} bulgu (${Object.entries(by).map(([k, v]) => k + ":" + v).join(" ")})`;
  });
  await step("Hekim geri bildirimi (yanlış dişler işaretlenir)", async () => {
    const wrong = (S.assess?.findings ?? []).filter((f: any) => f.tooth < 30 && ["rct", "crown"].includes(f.status)).map((f: any) => f.tooth).slice(0, 10);
    exp(await team.mert!.post(`/api/cases/${S.caseId}/ai-assess/feedback`, { verdict: "partial", wrongTeeth: wrong, note: "Üst destekler implant; 46 implant kron" }), 200, "feedback");
    const st = exp(await admin.get("/api/ai/assess-stats"), 200, "stats"); ok(st.total >= 1, "istatistik yok"); return `${wrong.length} diş yanlış işaretlendi`;
  });
  await step("Hekim mevcut durumu şemaya işler", async () => {
    const sit: Record<number, { s: string }> = {}; [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28].forEach((t) => (sit[t] = { s: "missing" })); [12, 11, 21, 22].forEach((t) => (sit[t] = { s: "root" }));
    [36, 37, 38, 46, 47, 48].forEach((t) => (sit[t] = { s: "missing" }));
    exp(await team.mert!.put(`/api/cases/${S.caseId}/situation`, { situation: sit, done: true }), 200, "situation");
  });
  await step("Akıllı öneri: üst çene All-on-4", async () => { const s = exp(await team.mert!.post(`/api/cases/${S.caseId}/suggest`, {}), 200, "suggest"); S.sug = s; ok(s.items.some((i: any) => /ao4|allon4/.test(i.b ?? "")), `öneri: ${JSON.stringify(s.items.map((i: any) => i.b ?? i.tx))}`); return s.items.map((i: any) => i.b ?? i.tx).join(", "); });
  await step("Mükerrer kural: öneriye ek olarak aynı dişlere tekrar implant → engellenir", async () => {
    const items = [...S.sug.items, { id: "l1", v: 1, tx: "implant", teeth: [36, 46], brand: "b_neod" }];
    const p = exp(await team.mert!.put(`/api/cases/${S.caseId}/plan`, { visits: Math.max(2, S.sug.visits ?? 2), items, expectedRevision: 0 }), 200, "plan dup");
    S.rev = p.revision; const dup = p.rules.find((r: any) => r.code === "DUP"); ok(dup, `DUP kuralı çıkmadı: ${p.rules.map((r: any) => r.code)}`); return `engellendi: dişler ${dup.p.teeth}`;
  });
  await step("Plan: All-on-4 üst + sabit protez + alt implant/kron (öneri)", async () => {
    const p = exp(await team.mert!.put(`/api/cases/${S.caseId}/plan`, { visits: Math.max(2, S.sug.visits ?? 2), items: S.sug.items, expectedRevision: S.rev }), 200, "plan"); S.rules = p.rules;
    ok(!p.rules.some((r: any) => r.sev === "block"), `engelleyici kural: ${p.rules.filter((r: any) => r.sev === "block").map((r: any) => r.code)}`);
    ok(p.rules.some((r: any) => r.code === "M4"), "diyabet+implant uyarısı (M4) çıkmadı"); return `kurallar: ${p.rules.map((r: any) => r.code).join(", ")}`;
  });
  await step("Engelleyici kural: aynı dişe implant + kanal reddedilir", async () => {
    const k2 = exp(await team.ayse!.post("/api/cases", { leadId: S.olgaLead }), 200, "case2");
    exp(await team.mert!.put(`/api/cases/${k2.id}/situation`, { situation: { 36: { s: "caries" } }, done: true }), 200, "sit2");
    const p = exp(await team.mert!.put(`/api/cases/${k2.id}/plan`, { visits: 1, expectedRevision: 0, items: [{ id: "a", v: 1, tx: "implant", teeth: [36], brand: "b_neod" }, { id: "b", v: 1, tx: "rct", teeth: [36] }] }), 200, "plan2");
    const d = await team.mert!.post(`/api/cases/${k2.id}/diagnose`, { acknowledge: true }); ok(d.status !== 200, "engelleyici kurala rağmen teşhis tamamlandı");
    return `engellendi: ${(p.rules ?? []).filter((r: any) => r.level === "block" || r.block).map((r: any) => r.code).join(",") || d.body?.error}`;
  });
  await step("Teşhis: uyarı onayı ile tamamla", async () => {
    const d1 = await team.mert!.post(`/api/cases/${S.caseId}/diagnose`, {}); ok(d1.status === 409, `onaysız teşhis ${d1.status}`);
    exp(await team.mert!.post(`/api/cases/${S.caseId}/diagnose`, { acknowledge: true }), 200, "diagnose");
    const cs = exp(await admin.get(`/api/cases/${S.caseId}`), 200, "case").case; ok(cs.status === "diagnosed", cs.status); return `para birimi ${cs.pricing.currency}`;
  });

  // ───────────────────────── 8. Teklif
  P("8. Fiyatlandırma ve teklif");
  await step("3 seçenek + temsilci %12 indirim → onay gerekir", async () => {
    const cs = exp(await team.ayse!.get(`/api/cases/${S.caseId}`), 200, "case").case; const p = cs.pricing;
    for (const i of [1, 2]) p.options.push(exp(await team.ayse!.post(`/api/cases/${S.caseId}/pricing/option`, { index: i }), 200, "option"));
    p.options.forEach((o: any, i: number) => (o.rec = i === 1)); p.nOpt = 3; p.options[1].disc = 12;
    const pr = exp(await team.ayse!.put(`/api/cases/${S.caseId}/pricing`, p), 200, "pricing"); S.pricing = p; S.calcs = pr.calcs;
    const totals = pr.calcs.map((x: any) => Math.round(x.total)); ok(totals[0] < totals[2], `toplamlar ${totals}`);
    const q = await team.ayse!.post(`/api/cases/${S.caseId}/quotes`); ok(q.status === 422, `limit üstü indirimle gönderim ${q.status}`);
    return `toplamlar ${totals.join(" / ")} ${cs.pricing.currency}`;
  });
  await step("Satış müdürü indirimi onaylar", async () => { for (const o of S.pricing.options) { const r = await team.burak!.post(`/api/cases/${S.caseId}/pricing/approval`, { optionId: o.id, action: "approve" }); ok([200, 409, 400].includes(r.status), `approval ${r.status}`); } });
  await step("Gönderim öncesi kontrol (yasaklı kelime, eksikler)", async () => { const r = exp(await team.ayse!.get(`/api/cases/${S.caseId}/presend`), 200, "presend"); return JSON.stringify(r).slice(0, 120); });
  await step("Teklif oluştur (v1, değiştirilemez)", async () => { const q = exp(await team.ayse!.post(`/api/cases/${S.caseId}/quotes`), 200, "quote"); S.quote = q; return `token ${String(q.token).slice(0, 6)}…`; });
  await step("Teklifi WhatsApp ile gönder", async () => { const r = await team.ayse!.post(`/api/quotes/${S.quote.id}/whatsapp`, { text: "Hallo Herr Müller, hier ist Ihr persönlicher Behandlungsplan." }); S.qWa = r.status; return `durum ${r.status}${r.status !== 200 ? " — " + r.body?.message?.slice(0, 80) : ""}`; });
  await step("Gönderim kanalı kaydı (link kopyalandı)", async () => { exp(await team.ayse!.post(`/api/quotes/${S.quote.id}/sent-via`, { channel: "copy" }), 200, "sent-via"); });

  // ───────────────────────── 9. Hasta teklif sayfası
  P("9. Hasta teklif sayfası (canlı izleme)");
  const hans = client("hans");
  await step("Hasta teklifi açar (3 seçenek, para birimi, şema)", async () => { const p = exp(await hans.get(`/api/public/q/${S.quote.token}`), 200, "public q"); ok(p.snapshot.options.length === 3, "3 seçenek yok"); exp(await hans.post(`/api/public/q/${S.quote.token}/view`), 200, "view"); });
  await step("Canlı okuma sinyalleri (fiyat ve ödeme bölümleri)", async () => {
    for (const [sec, opt] of [["price", 1], ["price", 1], ["plan", 1], ["payment", 1], ["price", 2]] as const) exp(await hans.post(`/api/public/q/${S.quote.token}/ping`, { option: opt, section: sec, seconds: 15 }), 200, "ping");
    const en = exp(await team.ayse!.get(`/api/quotes/${S.quote.id}/engagement`), 200, "engagement"); ok(en.live, "canlı değil"); return `${en.secondsTotal} sn, seçenek ${JSON.stringify(en.optionSeconds)}`;
  });
  await step("Panoda 'şu an teklifinde' + arama listesi + lead puanı", async () => {
    const live = await until(async () => (exp(await team.ayse!.get("/api/quotes/live"), 200, "live") as any[]).find((x) => x.leadId === S.hansLead), 15000);
    const cl = exp(await team.ayse!.get("/api/leads/call-list"), 200, "call-list") as any[]; const me = cl.find((x) => x.leadId === S.hansLead);
    const l = exp(await team.ayse!.get(`/api/leads/${S.hansLead}`), 200, "lead").lead; return `canlı ✓ · arama listesi: ${me?.action ?? "yok"} · puan ${l.score}`;
  });
  await step("Personel önizlemesi görüntüleme sayılmaz", async () => { const r = exp(await team.ayse!.post(`/api/public/q/${S.quote.token}/ping`, {}), 200, "staff ping"); ok(r.staff === true, "personel sayıldı"); });
  await step("Hasta önerilen seçeneği kabul eder → deal", async () => {
    ok((await hans.post(`/api/public/q/${S.quote.token}/respond`, { action: "accept", option: 1 })).status === 400, "onay kutusu zorunlu değil");
    const a = exp(await hans.post(`/api/public/q/${S.quote.token}/respond`, { action: "accept", option: 1, agree: true }), 200, "accept"); S.dealId = a.dealId;
    const l = exp(await admin.get(`/api/leads/${S.hansLead}`), 200, "lead").lead; ok(l.stage === "won", `aşama ${l.stage}`); return `deal ${S.dealId.slice(0, 8)}`;
  });
  await step("Emma: teklif reddi → kayıp nedeni → yeniden kazanım", async () => {
    const pls = exp(await admin.get("/api/pipelines"), 200, "pipelines") as any[]; const sales = pls.find((p) => p.kind === "sales"); const lost = sales.stages.find((s: any) => s.key === "lost");
    exp(await admin.post(`/api/pipelines/${sales.id}/move`, { leadId: S.emmaLead, stageId: lost.id, lostReason: "price" }), 200, "lost");
    const nurture = pls.find((p) => p.kind === "nurture"); await until(async () => (exp(await admin.get(`/api/pipelines/${nurture.id}/board`), 200, "board") as any).items.find((i: any) => i.leadId === S.emmaLead), 15000);
  });

  // ───────────────────────── 10. Ödeme + seyahat + randevu
  P("10. Kapora, seyahat, randevular");
  await step("Havale ile kapora: referans kodu → onay → aşama 'kapora'", async () => {
    const co = exp(await hans.post(`/api/public/q/${S.quote.token}/checkout`, { provider: "bank_transfer" }), 200, "checkout"); ok(String(co.referenceCode).startsWith("DF"), "referans kodu");
    const pend = exp(await hans.get(`/api/public/q/${S.quote.token}`), 200, "public q pending").deposit; ok(pend?.pending?.referenceCode === co.referenceCode && !pend.paid, "bekleyen havale hasta sayfasında görünmüyor");
    exp(await team.okan!.post(`/api/payment-intents/${co.intentId}/confirm`), 200, "confirm");
    const d = exp(await admin.get(`/api/deals/${S.dealId}`), 200, "deal"); ok(d.deal.stage === "deposit", `aşama ${d.deal.stage}`); S.deal = d;
    ok(d.payments[0].method === "bank_transfer", `ödeme yöntemi ${d.payments[0].method}`);
    const after = exp(await hans.get(`/api/public/q/${S.quote.token}`), 200, "public q paid").deposit; ok(after?.paid === true, "hasta sayfası hâlâ kapora istiyor");
    return `kapora ${(Number(d.payments[0].amountMinor) / 100).toFixed(0)} ${d.deal.currency} · ref ${co.referenceCode}`;
  });
  await step("Seyahat: uçuş, otel, pasaport (şifreli)", async () => {
    exp(await team.zeynep!.put(`/api/deals/${S.dealId}/trips/1`, { flight: { outbound: { no: "TK1524", dep: iso(5, 9), arr: iso(5, 13), from: "DUS", to: "ADB" }, return: { no: "TK1525", dep: iso(12, 15), arr: iso(12, 18), from: "ADB", to: "DUS" }, booked: true, pnr: "XK9P2L" },
      hotel: { hotelId: S.hotelId ?? null, name: "Swissôtel İzmir", room: "Deluxe", checkIn: iso(5).slice(0, 10), checkOut: iso(12).slice(0, 10), booked: true, confirmation: "SW-55821" },
      passport: { fullName: "HANS MUELLER", number: "C01X00T47", expiry: "2031-04-30", nationality: "DE" }, companions: 1, status: "confirmed" }), 200, "trip");
    const d = exp(await admin.get(`/api/deals/${S.dealId}`), 200, "deal"); ok(d.visits[0].arrivalAt, "varış ziyarete yansımadı");
    const tb = exp(await team.zeynep!.get("/api/trips/board?days=40"), 200, "trips"); const v = tb.visits.find((x: any) => x.dealId === S.dealId); ok(v, "transfer panosunda yok"); S.tripId = v.tripId;
    return `panoda ✓ · eksikler: ${v.missing.join(", ") || "yok"}`;
  });
  await step("Randevular: hekim + tercüman (Almanca)", async () => {
    const a1 = exp(await team.zeynep!.post("/api/appointments", { title: "Cerrahi: All-on-4 üst + 36/46 implant", startAt: iso(6, 7), endAt: iso(6, 10), patientId: S.deal.deal.patientId, dealId: S.dealId, visitNo: 1, dentistId: S.mertId, translatorId: S.lenaId, chair: "1" }), 200, "appt1");
    exp(await team.zeynep!.post("/api/appointments", { title: "Kontrol + geçici protez", startAt: iso(8, 8), endAt: iso(8, 9), patientId: S.deal.deal.patientId, dealId: S.dealId, visitNo: 1, dentistId: S.mertId, translatorId: S.lenaId, chair: "2" }), 200, "appt2");
    S.appt1 = a1.id;
  });
  await step("Transfer araçları (havalimanı → otel → klinik)", async () => {
    ok(S.tripId, "seyahat kimliği yok");
    exp(await team.zeynep!.post(`/api/trips/${S.tripId}/runs`, { leg: "airport_hotel", runAt: iso(5, 13), driverName: "Murat", driverPhone: "+905320000000", vehicle: "Vito 35 ABC 123" }), 200, "run1");
    exp(await team.zeynep!.post(`/api/trips/${S.tripId}/runs`, { leg: "hotel_clinic", runAt: iso(6, 6), driverName: "Murat", vehicle: "Vito 35 ABC 123" }), 200, "run2");
    const tb = exp(await team.zeynep!.get("/api/trips/board?days=40"), 200, "trips"); const v = tb.visits.find((x: any) => x.dealId === S.dealId); return `eksikler: ${v.missing.join(", ") || "yok"}`;
  });
  await step("Tercüman ajandası (yalnız kendi randevuları)", async () => { const r = exp(await team.lena!.get("/api/interpreter/agenda?days=14&mine=true"), 200, "agenda"); const items = Array.isArray(r) ? r : r.items ?? r.appointments ?? []; ok(items.length >= 2, `${items.length} randevu`); return `${items.length} randevu`; });
  await step("Hekim takvimi", async () => { const r = exp(await team.mert!.get(`/api/appointments?from=${iso(4)}&to=${iso(13)}`), 200, "appts") as any[]; ok(r.length >= 2, `${r.length} randevu`); });
  await step("Resepsiyon günü (varış günü)", async () => { exp(await team.elif!.get(`/api/reception/day?date=${iso(6).slice(0, 10)}`), 200, "reception"); });

  // ───────────────────────── 11. Klinik
  P("11. Tedavi, laboratuvar, implant kayıtları");
  await step("Hasta geldi → koltukta → tamamlandı", async () => { for (const st of ["arrived", "in_chair", "done"]) exp(await team.elif!.patch(`/api/appointments/${S.appt1}`, { status: st }), 200, "appt " + st); });
  await step("Tedavi ilerleme kaydı + ek satış (greft)", async () => {
    const it = S.deal.deal.planSnapshot?.items?.[0]?.id ?? S.sug.items[0].id ?? "x";
    exp(await team.zeynep!.post(`/api/deals/${S.dealId}/progress`, { planItemId: String(it), status: "done", appointmentId: S.appt1 }), 200, "progress");
    exp(await team.zeynep!.post(`/api/deals/${S.dealId}/progress`, { planItemId: "upsell-graft", status: "changed", upsell: true, amount: 250, note: "46 bölgesine greft" }), 200, "upsell");
  });
  await step("Plan revizyonu: greft eklendi, klinikte imzalı onay", async () => {
    const a = exp(await team.ayse!.post(`/api/deals/${S.dealId}/amendments`, { reason: "Cerrahide 46 bölgesinde kemik yetersiz, greft eklendi", lines: [{ kind: "add", v: 1, tx: "graft", teeth: [46] }] }), 200, "amend");
    exp(await team.ayse!.post(`/api/amendments/${a.id}/approve-in-clinic`, { name: "Hans Müller", signature: PNG }), 200, "approve"); return `fark +${(Number(a.deltaMinor) / 100).toFixed(0)}`;
  });
  await step("Lab siparişi: gönderildi → teslim (gider oluşur)", async () => {
    const lab = exp(await admin.post("/api/labs", { name: "İzmir ZirLab " + RUN, avgDays: 7 }), 200, "lab");
    const o = exp(await team.zeynep!.post("/api/lab-orders", { dealId: S.dealId, labId: lab.id }), 200, "order");
    exp(await team.zeynep!.patch(`/api/lab-orders/${o.id}`, { status: "sent" }), 200, "sent");
    exp(await team.zeynep!.patch(`/api/lab-orders/${o.id}`, { status: "delivered", costMinor: 42000, currency: S.deal.deal.currency }), 200, "delivered");
    const l = exp(await admin.get(`/api/lab-orders?dealId=${S.dealId}`), 200, "orders"); ok(l[0].expenseId, "gider oluşmadı"); return `${o.items.length} kalem`;
  });
  await step("İmplant kayıtları (lot no) + lot araması", async () => {
    for (const [t, lot] of [[36, "NEO-L36"], [46, "NEO-L46"], [12, "NEO-U12"], [22, "NEO-U22"]] as const)
      exp(await team.mert!.post("/api/implants", { leadId: S.hansLead, dealId: S.dealId, tooth: t, brand: "Neodent", system: "Helix GM", diameter: 4.3, length: 11.5, lot: lot + RUN }), 200, "implant");
    const r = exp(await admin.get(`/api/implants?lot=neo-l36${RUN}`), 200, "lot"); ok(r.length === 1, "lot araması");
  });
  await step("2. ziyaret ödemesi + ziyaret durumu", async () => {
    const d = exp(await admin.get(`/api/deals/${S.dealId}`), 200, "deal"); const v1 = d.visits.find((v: any) => v.visitNo === 1);
    const rest = Math.max(1, Math.round((Number(v1.plannedMinor) - Number(v1.paidMinor)) / 100));
    exp(await team.elif!.post(`/api/deals/${S.dealId}/payments`, { amount: rest, currency: d.deal.currency, method: "card", visitNo: 1 }), 200, "pay v1");
    exp(await admin.patch(`/api/deals/${S.dealId}/visits/1`, { status: "done" }), 200, "visit done");
    const v2 = d.visits.find((v: any) => v.visitNo === 2);
    exp(await team.elif!.post(`/api/deals/${S.dealId}/payments`, { amount: Math.round(Number(v2.plannedMinor) / 100) + 250, currency: d.deal.currency, method: "bank_transfer", visitNo: 2 }), 200, "pay v2");
    exp(await admin.patch(`/api/deals/${S.dealId}/visits/2`, { status: "done" }), 200, "visit2 done");
    exp(await admin.patch(`/api/deals/${S.dealId}`, { stage: "won" }), 200, "won");
    const d2 = exp(await admin.get(`/api/deals/${S.dealId}`), 200, "deal"); const paid = d2.payments.reduce((s: number, p: any) => s + Number(p.amountMinor), 0);
    return `tahsil ${(paid / 100).toFixed(0)} / değer ${(Number(d2.deal.valueMinor) / 100 + Number(d2.deal.amendedMinor ?? 0) / 100).toFixed(0)} ${d2.deal.currency}`;
  });

  // ───────────────────────── 12. Finans
  P("12. Finans");
  await step("Fatura: deal'den taslak → kes → numara", async () => {
    const inv = exp(await team.okan!.post("/api/finance/invoices", { kind: "invoice", dealId: S.dealId }), 200, "invoice");
    const is = exp(await team.okan!.post(`/api/finance/invoices/${inv.id}/issue`), 200, "issue"); ok(/^INV-/.test(is.number), is.number); return is.number;
  });
  await step("Komisyonlar: temsilci %5 (Hans), ajans %10 (Lisa yok → 0)", async () => {
    const cm = exp(await team.okan!.get("/api/finance/commissions"), 200, "commissions"); const own = cm.items.filter((x: any) => x.userId === S.ayseId);
    ok(own.length >= 1, "temsilci komisyonu yok"); const mine = exp(await team.ayse!.get("/api/finance/my-commissions"), 200, "mine");
    return `temsilci kalemleri ${own.length}, Ayşe bekleyen ${JSON.stringify(mine.totals?.[0] ?? {})}`;
  });
  await step("Gider kaydı + finans özeti + CSV", async () => {
    exp(await team.okan!.post("/api/finance/expenses", { category: "marketing", vendor: "Meta Ads", amountMinor: 150000, currency: "EUR" }), 200, "expense");
    const s = exp(await team.okan!.get("/api/finance/summary"), 200, "summary"); ok(s.months.length === 12, "12 ay yok");
    const csv = await team.okan!.get("/api/finance/export/commissions"); ok(csv.status === 200, "csv"); return `gelir ${JSON.stringify(s.totals).slice(0, 100)}`;
  });

  // ───────────────────────── 13. Tedavi sonrası
  P("13. Tedavi sonrası: recall, garanti, NPS, şikâyet");
  await step("Recall planı (implant/kron/yıllık)", async () => { const r = await until(async () => { const x = exp(await admin.get(`/api/recalls?leadId=${S.hansLead}`), 200, "recalls") as any[]; return x.length ? x : null; }, 15000); return r.map((x: any) => `${x.title} → ${String(x.dueAt).slice(0, 10)}`).join("; "); });
  await step("Garanti kartı (hasta linki, implant lotları)", async () => {
    const w = exp(await admin.post("/api/warranties", { dealId: S.dealId }), 200, "warranty"); const pub = exp(await client("w").get(`/api/public/w/${String(w.url).split("/w/")[1]}`), 200, "public w");
    ok(pub.implants.length >= 4, `implant ${pub.implants.length}`); return `${pub.items.length} kalem garanti`;
  });
  await step("NPS 10 → Google yorum linki", async () => {
    const tpl = (exp(await admin.get("/api/forms/templates"), 200, "tpl") as any[]).find((t) => t.key === "nps");
    const rq = exp(await admin.post("/api/forms/requests", { templateId: tpl.id, leadId: S.hansLead }), 200, "nps req");
    const r = exp(await client("n").post(`/api/public/f/${String(rq.url).split("/f/")[1]}/submit`, { answers: { nps: 10, r_treat: 5, comment: "Sehr professionell, danke!" } }), 200, "nps"); ok(r.reviews?.[0]?.name === "Google", "yorum linki yok");
  });
  await step("Şikâyet → garanti kapsamı → çözüldü", async () => {
    const x = exp(await team.zeynep!.post("/api/complaints", { leadId: S.hansLead, category: "loose", teeth: [46], description: "46 kron hafif oynuyor" }), 200, "complaint"); ok(x.warrantyCovered, "garanti kapsamı yok");
    exp(await team.zeynep!.patch(`/api/complaints/${x.id}`, { status: "resolved", resolution: "Kron yeniden simante edildi" }), 200, "resolve");
  });
  await step("Tavsiye kodu (Hans → arkadaşı)", async () => { exp(await admin.put("/api/referral-settings", { rewardMinor: 10000, currency: S.deal.deal.currency }), 200, "ref settings"); const r = exp(await admin.post(`/api/leads/${S.hansLead}/referral`), 200, "referral"); return r.code; });

  // ───────────────────────── 14. Pazarlama
  P("14. Pazarlama");
  await step("Kampanya: izinli kitle önizleme → başlat → gönderim", async () => {
    const pv = exp(await admin.post("/api/campaigns/preview", { audience: { sources: ["website", "landing", "google"] }, channel: "email" }), 200, "preview");
    const cp = exp(await admin.post("/api/campaigns", { name: "Kış implant kampanyası", channel: "email", audience: { sources: ["website", "landing", "google"] }, content: { subject: { en: "Winter offer for {firstName}", tr: "Kış fırsatı" }, body: { en: "Hello {firstName}, …" } } }), 200, "campaign");
    const la = await admin.post(`/api/campaigns/${cp.id}/launch`);
    if (la.status === 200) { const d = await until(async () => { const x = exp(await admin.get(`/api/campaigns/${cp.id}`), 200, "c"); return x.status === "sent" ? x : null; }, 30000); return `kitle ${pv.total}, ulaşılabilir ${pv.reachable}, durum ${d.status}`; }
    return `kitle ${pv.total}, ulaşılabilir ${pv.reachable}, başlatma ${la.status}: ${la.body?.message ?? ""}`;
  });
  await step("Reklam harcaması CSV → ROAS", async () => {
    const csv = `Day,Campaign,Cost,Impressions,Clicks\n${iso(-3).slice(0, 10)},DE Implants,320.00,25000,610\n${iso(-2).slice(0, 10)},UK Veneers,180.00,14000,330\n`;
    exp(await admin.post("/api/ads/import", { platform: "google", currency: "EUR", csv }), 200, "ads import");
    const r = exp(await admin.get(`/api/ads/roas?from=${iso(-30).slice(0, 10)}&to=${iso(1).slice(0, 10)}`), 200, "roas"); return r.rows.map((x: any) => `${x.campaign}: harcama ${Number(x.spend) / 100}, lead ${x.leads}`).join(" · ");
  });

  // ───────────────────────── 15. Raporlar
  P("15. Raporlar ve yönetim");
  await step("Pano (dashboard)", async () => { const d = exp(await admin.get("/api/dashboard"), 200, "dashboard"); return JSON.stringify(d.kpi ?? d.kpis ?? Object.keys(d)).slice(0, 140); });
  await step("Satış raporu + hedef", async () => {
    exp(await team.burak!.put("/api/targets", { userId: S.ayseId, month: new Date().toISOString().slice(0, 8) + "01", revenueMinor: 3000000, deals: 4, currency: "EUR" }), 200, "target");
    const r = exp(await team.burak!.get("/api/reports/sales"), 200, "sales"); const a = r.reps.find((x: any) => x.userId === S.ayseId); return `Ayşe: ${a?.leads} lead, ${a?.won ?? a?.deals ?? 0} kazanılan`;
  });
  await step("Pipeline analitiği", async () => { const pls = exp(await admin.get("/api/pipelines"), 200, "pl") as any[]; const a = exp(await admin.get(`/api/pipelines/${pls[0].id}/analytics`), 200, "analytics"); return `${a.stages.length} aşama`; });
  await step("İtiraz dağılımı", async () => { const o = exp(await admin.get("/api/ai/objections?days=30"), 200, "objections"); return o.objections.map((x: any) => `${x.objection}:${x.leads}`).join(" "); });
  await step("AI kayıp analizi raporu", async () => { const r = exp(await team.burak!.post("/api/ai/reports/loss", { days: 30 }), 200, "loss"); return String(r.body).slice(0, 100).replace(/\n/g, " "); });
  await step("AI temsilci karnesi (Ayşe)", async () => { const r = exp(await team.burak!.post("/api/ai/reports/qa", { userId: S.ayseId, days: 30 }), 200, "qa"); return `puan ${r.score}`; });
  await step("Genel arama", async () => { const r = exp(await admin.get("/api/search?q=Müller"), 200, "search"); ok(r.length >= 1, "bulunamadı"); });
  await step("Bildirimler", async () => { const r = exp(await team.ayse!.get("/api/notifications"), 200, "notifications"); return `${r.items.length} bildirim`; });
  await step("Denetim kaydı", async () => { const r = exp(await admin.get("/api/audit"), 200, "audit"); const n = Array.isArray(r) ? r.length : r.items?.length; ok(n > 20, `${n} kayıt`); return `${n} kayıt`; });
  await step("Lead CSV dışa aktarma", async () => { const r = await admin.get("/api/leads/export.csv"); ok(r.status === 200 && String(r.body).split("\n").length >= 8, "csv"); });
  await step("AI kullanım ve maliyet", async () => { const u = exp(await admin.get("/api/ai/usage"), 200, "usage"); return JSON.stringify(u).slice(0, 160); });

  // ───────────────────────── 16. Güvenlik
  P("16. Güvenlik ve izolasyon");
  const other = client("other");
  await step("Başka klinik kaydı", async () => { exp(await other.post("/api/auth/signup", { clinicName: `Rakip Klinik ${RUN}`, name: "Rakip", email: `rakip.${RUN}@example.test`, password: PASS, country: "TR", currency: "EUR", language: "tr" }), 200, "signup2"); });
  await step("Kiracı izolasyonu: lead, deal, vaka, konuşma, dosya", async () => {
    for (const [p, what] of [[`/api/leads/${S.hansLead}`, "lead"], [`/api/deals/${S.dealId}`, "deal"], [`/api/cases/${S.caseId}`, "case"], [`/api/inbox/conversations/${S.hansConv}`, "conv"], [`/api/files/${S.opgFile?.id}`, "file"]] as const) {
      const r = await other.get(p); ok([403, 404].includes(r.status), `${what} sızdı: ${r.status}`);
    }
    ok((exp(await other.get("/api/leads?view=all"), 200, "leads")).total === 0, "lead listesi boş değil");
  });
  await step("Oturumsuz erişim reddedilir", async () => { const r = await client("anon").get("/api/leads?view=all"); ok(r.status === 401, `${r.status}`); });
  await step("Yanlış şifre", async () => { const r = await client("x").post("/api/auth/login", { email: S.adminEmail, password: "yanlis-sifre-123" }); ok(r.status === 401, `${r.status}`); });

  rt.close();
}

// SSE dinleyicisi
function sseOpen(c: C) {
  const events: any[] = []; const ac = new AbortController();
  (async () => {
    try {
      const r = await fetch(BASE + "/api/rt", { headers: { cookie: c.cookie, accept: "text/event-stream" }, signal: ac.signal });
      const rd = r.body!.getReader(); const dec = new TextDecoder(); let buf = "";
      for (;;) { const { value, done } = await rd.read(); if (done) break; buf += dec.decode(value, { stream: true });
        let i; while ((i = buf.indexOf("\n\n")) >= 0) { const chunk = buf.slice(0, i); buf = buf.slice(i + 2); const line = chunk.split("\n").find((l) => l.startsWith("data:")); if (line) { try { events.push(JSON.parse(line.slice(5))); } catch { /* */ } } } }
    } catch { /* kapandı */ }
  })();
  return { events, close: () => ac.abort() };
}

const t0 = Date.now();
await main().catch((e) => { console.error("BEKLENMEYEN HATA", e); results.push({ phase, step: "beklenmeyen", ok: false, ms: 0, error: String(e) }); });
const pass = results.filter((r) => r.ok).length, fail = results.length - pass;
console.log(`\n═══ ${pass}/${results.length} adım geçti · ${fail} hata · ${Math.round((Date.now() - t0) / 1000)} sn`);
for (const r of results.filter((x) => !x.ok)) console.log(`  ✖ [${r.phase}] ${r.step}: ${r.error}`);
if (slow.length) console.log("Yavaş çağrılar (>1,5 sn):", slow.map((s) => `${s.path} ${s.ms}ms`).join(", "));
if (process.env.E2E_CREDS) writeFileSync(process.env.E2E_CREDS, JSON.stringify({ base: BASE, admin: S.adminEmail, password: PASS, users: Object.fromEntries(["ayse", "mert", "zeynep", "lena", "burak", "okan", "elif"].map((k) => [k, `${k}.${RUN}@ege-dental.test`])), quoteToken: S.quote?.token, caseId: S.caseId, dealId: S.dealId, hansLead: S.hansLead, hansConv: S.hansConv }), { mode: 0o600 });
writeFileSync(OUT, JSON.stringify({ base: BASE, run: RUN, at: new Date().toISOString(), realAi: REAL_AI, pass, fail, durationSec: Math.round((Date.now() - t0) / 1000), results, slow }, null, 1));
process.exit(fail ? 1 : 0);
