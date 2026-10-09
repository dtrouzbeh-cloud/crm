// Faz D — telefon (Twilio). Klinik kendi Twilio hesabını ve numarasını bağlar (Ayarlar → Kurulum).
// Giden: temsilci tek tık → Twilio önce temsilcinin telefonunu arar, açınca hastaya bağlar (kayıt iki kanal).
// Gelen: numaraya gelen arama → hasta bulunur/oluşturulur → temsilcilerin telefonları aynı anda çalar → açılmazsa sesli mesaj.
// Her kayıt: indir → depola → yazıya dök (STT) → AI özet/sonuç/sonraki adım → CRM (olay, görev, lead alanları).
import { createHmac, randomUUID, createHash, timingSafeEqual } from "node:crypto";
import { ownerSql } from "../db.ts";
import { config } from "../config.ts";
import { getSecret } from "./secrets.ts";
import { storage } from "./storage.ts";
import { sttConfig, transcribe } from "./stt.ts";
import { complete, MODELS, aiAvailable } from "./ai/llm.ts";
import { trackUsage, overCap, otx } from "./ai/agent.ts";
import { notifyUser } from "./notify.ts";
import { normalizePhone } from "@dentaflow/core/phone";

export type TwilioCreds = { sid: string; token: string; number: string };
const API = process.env.TWILIO_API_URL ?? "https://api.twilio.com";

export async function twilioCreds(clinicId: string): Promise<TwilioCreds | null> {
  const s = await getSecret(clinicId, "twilio");
  if (!s?.value.sid || !s.value.token || !s.meta.number) return null;
  return { sid: s.value.sid, token: s.value.token, number: String(s.meta.number) };
}

/** Twilio istek imzası: HMAC-SHA1(authToken, tam URL + POST parametreleri anahtara göre sıralı ad+değer), base64 */
export function twilioSignature(token: string, url: string, params: Record<string, string>) {
  const data = url + Object.keys(params).sort().map((k) => k + (params[k] ?? "")).join("");
  return createHmac("sha1", token).update(Buffer.from(data, "utf8")).digest("base64");
}
export function verifyTwilio(token: string, url: string, params: Record<string, string>, header: string | undefined) {
  if (!header) return false;
  const a = Buffer.from(twilioSignature(token, url, params)), b = Buffer.from(header);
  return a.length === b.length && timingSafeEqual(a, b);
}
/** Webhook'un Twilio'nun imzaladığı herkese açık URL'si (nginx arkasında APP_URL + yol) */
export const publicUrl = (path: string) => config.appUrl.replace(/\/$/, "") + path;

async function twilioPost(c: TwilioCreds, path: string, params: Record<string, string>) {
  const r = await fetch(`${API}/2010-04-01/Accounts/${c.sid}${path}`, { method: "POST", headers: { Authorization: "Basic " + Buffer.from(`${c.sid}:${c.token}`).toString("base64"), "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params).toString(), signal: AbortSignal.timeout(20_000) });
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Twilio ${r.status}: ${j?.message ?? "bilinmeyen hata"}${j?.code ? ` (kod ${j.code})` : ""}`);
  return j;
}

// ── TwiML ──
const esc = (s: string) => s.replace(/[<>&"']/g, (ch) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[ch]!);
const VOICE: Record<string, [string, string]> = { tr: ["tr-TR", "Polly.Filiz"], en: ["en-GB", "Polly.Amy"], de: ["de-DE", "Polly.Vicki"], ar: ["arb", "Polly.Zeina"], ru: ["ru-RU", "Polly.Tatyana"], fr: ["fr-FR", "Polly.Celine"], nl: ["nl-NL", "Polly.Lotte"], it: ["it-IT", "Polly.Carla"], es: ["es-ES", "Polly.Conchita"] };
export const say = (text: string, lang = "en") => { const [l, v] = VOICE[lang] ?? VOICE.en!; return `<Say language="${l}" voice="${v}">${esc(text)}</Say>`; };
export const twiml = (inner: string) => `<?xml version="1.0" encoding="UTF-8"?><Response>${inner}</Response>`;
const T: Record<string, Record<string, string>> = {
  connecting: { tr: "{name} aranıyor. Görüşme kaydedilecek.", en: "Connecting you to {name}. This call will be recorded.", de: "Sie werden mit {name} verbunden. Das Gespräch wird aufgezeichnet." },
  greeting: { tr: "{clinic}'i aradığınız için teşekkürler. Bu görüşme kalite amacıyla kaydedilebilir.", en: "Thank you for calling {clinic}. This call may be recorded for quality purposes.", de: "Vielen Dank für Ihren Anruf bei {clinic}. Das Gespräch kann aufgezeichnet werden.", ar: "شكراً لاتصالك بـ {clinic}. قد يتم تسجيل هذه المكالمة.", ru: "Спасибо за звонок в {clinic}. Разговор может быть записан." },
  voicemail: { tr: "Şu anda tüm ekibimiz meşgul. Lütfen bip sesinden sonra adınızı ve mesajınızı bırakın, en kısa sürede sizi arayacağız.", en: "Our team is busy right now. Please leave your name and message after the beep and we will call you back shortly.", de: "Unser Team ist gerade beschäftigt. Bitte hinterlassen Sie nach dem Signalton Ihren Namen und Ihre Nachricht, wir rufen Sie zurück.", ar: "فريقنا مشغول حالياً. يرجى ترك اسمك ورسالتك بعد الصافرة وسنعاود الاتصال بك قريباً.", ru: "Сейчас все сотрудники заняты. Оставьте, пожалуйста, имя и сообщение после сигнала, мы вам перезвоним." },
  thanks: { tr: "Teşekkürler, mesajınızı aldık.", en: "Thank you, we have received your message.", de: "Danke, wir haben Ihre Nachricht erhalten.", ar: "شكراً، استلمنا رسالتك.", ru: "Спасибо, мы получили ваше сообщение." },
};
export const tx = (k: string, lang: string, vars: Record<string, string> = {}) => { const m = T[k]!; const l = m[lang] ? lang : "en"; return { text: m[l]!.replace(/\{(\w+)\}/g, (_, v) => vars[v] ?? ""), lang: l }; };

// ── Giden: temsilci tek tık arama ──
export async function startBridgeCall(clinicId: string, userId: string, leadId: string) {
  const c = await twilioCreds(clinicId); if (!c) throw Object.assign(new Error("Twilio bağlı değil. Ayarlar → Kurulum'dan hesap SID, token ve numarayı girin."), { code: "voice_not_configured" });
  const [u] = await ownerSql`select phone, name from users where id = ${userId}`;
  const rep = normalizePhone((u?.phone as string) ?? null); if (!rep) throw Object.assign(new Error("Profilinize telefon numaranızı ekleyin; Twilio önce sizi arar."), { code: "rep_phone_missing" });
  const [l] = await ownerSql`select l.id, p.phone, p.full_name from leads l join patients p on p.id = l.patient_id where l.id = ${leadId} and l.clinic_id = ${clinicId}`;
  if (!l?.phone) throw Object.assign(new Error("Hastanın telefon numarası yok"), { code: "patient_phone_missing" });
  const id = randomUUID();
  await ownerSql`insert into calls (id, clinic_id, lead_id, user_id, direction, from_number, to_number, rep_number) values (${id}, ${clinicId}, ${leadId}, ${userId}, 'out', ${c.number}, ${l.phone}, ${rep})`;
  try {
    const r = await twilioPost(c, "/Calls.json", { To: rep, From: c.number, Url: publicUrl(`/api/public/voice/bridge/${id}`), Method: "POST",
      StatusCallback: publicUrl(`/api/public/voice/status/${id}`), StatusCallbackMethod: "POST", StatusCallbackEvent: "initiated ringing answered completed" });
    await ownerSql`update calls set provider_sid = ${r.sid ?? null}, status = ${r.status ?? "queued"} where id = ${id}`;
  } catch (e) { await ownerSql`update calls set status = 'failed', outcome = 'failed', error = ${(e as Error).message} where id = ${id}`; throw e; }
  return { id };
}

/** Temsilci açınca okunan TwiML: hastaya bağlan, iki kanallı kayıt */
export async function bridgeTwiml(callId: string) {
  const [k] = await ownerSql`select c.*, p.full_name, cl.default_language from calls c join clinics cl on cl.id = c.clinic_id left join leads l on l.id = c.lead_id left join patients p on p.id = l.patient_id where c.id = ${callId}`;
  if (!k) return twiml("<Hangup/>");
  const m = tx("connecting", (k.defaultLanguage as string) ?? "tr", { name: (k.fullName as string) ?? "" });
  return twiml(`${say(m.text, m.lang)}<Dial callerId="${esc(k.fromNumber as string)}" timeout="30" record="record-from-answer-dual" recordingStatusCallback="${esc(publicUrl(`/api/public/voice/recording/${callId}`))}" recordingStatusCallbackEvent="completed" action="${esc(publicUrl(`/api/public/voice/dial/${callId}`))}"><Number>${esc(k.toNumber as string)}</Number></Dial>`);
}

// ── Gelen arama ──
export async function clinicByNumber(to: string) {
  const n = normalizePhone(to); if (!n) return null;
  const rows = await ownerSql`select clinic_id from clinic_secrets where name = 'twilio' and (meta->>'number') = ${n} limit 1`;
  return (rows[0]?.clinicId as string) ?? null;
}
export async function inboundCall(clinicId: string, p: Record<string, string>) {
  const from = normalizePhone(p.From ?? null);
  const [cl] = await ownerSql`select name, default_language from clinics where id = ${clinicId}`;
  // hasta ve açık lead: telefon eşleşmesi; yoksa yeni lead (kaynak: telefon)
  let lead: any = from ? (await ownerSql`select l.id, l.owner_id, p.language, p.full_name from patients p join leads l on l.patient_id = p.id where p.clinic_id = ${clinicId} and p.phone = ${from} order by (l.stage in ('won','lost')), l.created_at desc limit 1`)[0] : null;
  if (!lead && from) {
    const { createLead } = await import("../routes/leads.ts");
    const r = await otx(clinicId, (t) => createLead(t, { clinicId, userId: null as unknown as string }, { fullName: from, phone: from, source: "phone", temperature: "warm" } as never));
    lead = (await ownerSql`select l.id, l.owner_id, p.language, p.full_name from leads l join patients p on p.id = l.patient_id where l.id = ${r.leadId}`)[0];
  }
  const id = randomUUID();
  await ownerSql`insert into calls (id, clinic_id, lead_id, user_id, direction, provider_sid, from_number, to_number, status) values (${id}, ${clinicId}, ${lead?.id ?? null}, ${lead?.ownerId ?? null}, 'in', ${p.CallSid ?? null}, ${from ?? p.From ?? null}, ${p.To ?? null}, 'ringing') on conflict do nothing`;
  // çalacak temsilciler: lead sahibi önce, sonra telefonu kayıtlı satış/koordinatör ekibi (en fazla 5)
  const reps = await ownerSql`select u.id, u.phone from memberships m join users u on u.id = m.user_id where m.clinic_id = ${clinicId} and m.active and m.role in ('admin','manager','sales','coordinator') and u.phone is not null
    order by (u.id = ${lead?.ownerId ?? null}) desc, m.created_at limit 5`;
  const lang = (lead?.language as string) ?? (cl?.defaultLanguage as string) ?? "en";
  const g = tx("greeting", lang, { clinic: (cl?.name as string) ?? "" });
  const numbers = reps.map((r) => normalizePhone(r.phone as string)).filter(Boolean) as string[];
  if (!numbers.length) return twiml(say(g.text, g.lang) + voicemailTwiml(id, lang));
  return twiml(`${say(g.text, g.lang)}<Dial timeout="20" callerId="${esc(p.To ?? "")}" record="record-from-answer-dual" recordingStatusCallback="${esc(publicUrl(`/api/public/voice/recording/${id}`))}" recordingStatusCallbackEvent="completed" action="${esc(publicUrl(`/api/public/voice/inbound-dial/${id}`))}">${numbers.map((n) => `<Number>${esc(n)}</Number>`).join("")}</Dial>`);
}
export function voicemailTwiml(callId: string, lang: string) {
  const v = tx("voicemail", lang), t = tx("thanks", lang);
  return `${say(v.text, v.lang)}<Record maxLength="120" playBeep="true" timeout="5" recordingStatusCallback="${esc(publicUrl(`/api/public/voice/recording/${callId}?vm=1`))}" recordingStatusCallbackEvent="completed" action="${esc(publicUrl(`/api/public/voice/done/${callId}`))}"/>${say(t.text, t.lang)}`;
}
/** Kimse açmadı: cevapsız arama → yüksek öncelikli geri arama görevi + bildirim */
export async function missedCall(callId: string) {
  const [k] = await ownerSql`update calls set outcome = 'missed', status = 'no-answer' where id = ${callId} and outcome is null returning clinic_id, lead_id, user_id, from_number`;
  if (!k?.leadId) return;
  const [l] = await ownerSql`select l.owner_id, p.full_name from leads l join patients p on p.id = l.patient_id where l.id = ${k.leadId}`;
  const owner = (l?.ownerId as string) ?? (k.userId as string) ?? null;
  await ownerSql`insert into tasks (clinic_id, title, type, priority, due_at, lead_id, assignee_id, entity, entity_id) values (${k.clinicId}, ${`📞 Cevapsız arama — ${l?.fullName ?? k.fromNumber}: geri ara`}, 'call', 'high', now() + interval '15 minutes', ${k.leadId}, ${owner}, 'call', ${callId})`;
  // sahip yoksa (yeni numara) telefonu çalan ekibin tamamı haberdar edilir
  const to = owner ? [owner] : (await ownerSql`select m.user_id from memberships m where m.clinic_id = ${k.clinicId} and m.active and m.role in ('admin','manager','sales','coordinator')`).map((r) => r.userId as string);
  for (const u of to) await notifyUser(k.clinicId as string, u, "call.missed", `📞 Cevapsız arama: ${l?.fullName ?? k.fromNumber}`, `/leads/${k.leadId}`).catch(() => {});
}

// ── Durum geri bildirimleri ──
export async function callStatus(callId: string, p: Record<string, string>) {
  const st = p.CallStatus ?? "";
  await ownerSql`update calls set status = ${st},
      answered_at = case when ${st} = 'in-progress' and answered_at is null then now() else answered_at end,
      ended_at = case when ${st} in ('completed','busy','no-answer','failed','canceled') then now() else ended_at end,
      duration_sec = coalesce(${p.CallDuration ? Number(p.CallDuration) : null}::int, duration_sec),
      outcome = case when outcome is null and ${st} in ('busy','no-answer','failed','canceled') then ${st === "failed" ? "failed" : "no_answer"} else outcome end
    where id = ${callId}`;
}
/** <Dial> sonucu: hasta açmadıysa giden aramada sonuç "ulaşılamadı" */
export async function dialResult(callId: string, p: Record<string, string>) {
  const st = p.DialCallStatus ?? "";
  if (st && st !== "completed" && st !== "answered") await ownerSql`update calls set outcome = coalesce(outcome, 'no_answer') where id = ${callId}`;
  else if (p.DialCallDuration) await ownerSql`update calls set duration_sec = ${Number(p.DialCallDuration)}, answered_at = coalesce(answered_at, now()) where id = ${callId}`;
}

/** Kayıt hazır: işlemeyi kuyruğa al (indirme + döküm + AI uzun sürer) */
export async function recordingReady(callId: string, p: Record<string, string>, voicemail: boolean) {
  const [k] = await ownerSql`update calls set recording_sid = ${p.RecordingSid ?? null}, recording_sec = ${p.RecordingDuration ? Number(p.RecordingDuration) : null}, outcome = case when ${voicemail} then 'voicemail' else outcome end where id = ${callId} returning clinic_id`;
  if (!k || !p.RecordingUrl) return;
  await ownerSql`insert into jobs (clinic_id, type, payload, dedupe_key) values (${k.clinicId}, 'call.process', ${ownerSql.json({ callId, url: p.RecordingUrl, voicemail } as never)}, ${"call:" + callId + ":" + (p.RecordingSid ?? "")}) on conflict (dedupe_key) do nothing`;
}

const CALL_TOOL = { name: "call_output", description: "Arama değerlendirmesi", input_schema: { type: "object", required: ["summary", "outcome", "next_step"], properties: {
  summary: { type: "string", description: "Görüşmenin klinik dilinde 2-4 cümlelik özeti" },
  outcome: { type: "string", enum: ["reached_interested", "reached_not_interested", "callback", "booked", "voicemail", "wrong_number", "no_answer"] },
  next_step: { type: "string", description: "Temsilcinin yapacağı somut sonraki adım (klinik dilinde, tek cümle)" },
  next_step_in_hours: { type: "integer", minimum: 0, maximum: 720 },
  objection: { type: "string", enum: ["price", "fear", "trust", "timing", "distance", "quality", "competitor", "family", "health", "none"] },
  lead: { type: "object", properties: { interest: { type: "string" }, budget: { type: "string" }, travelWindow: { type: "string" }, temperature: { type: "string", enum: ["hot", "warm", "cold"] } } },
} } };

/** İş: kaydı indir → dosya olarak sakla → yazıya dök → AI özet → CRM'e işle */
export async function processCall(callId: string, url: string, voicemail = false) {
  const [k] = await ownerSql`select c.*, cl.default_language from calls c join clinics cl on cl.id = c.clinic_id where c.id = ${callId}`; if (!k) return;
  const clinicId = k.clinicId as string;
  const host = new URL(url).hostname;
  if (host !== new URL(API).hostname && !host.endsWith(".twilio.com")) throw new Error("kayıt adresi Twilio değil: " + host);   // SSRF koruması
  const c = await twilioCreds(clinicId); if (!c) throw new Error("twilio_not_configured");
  const r = await fetch(url.endsWith(".mp3") ? url : url + ".mp3", { headers: { Authorization: "Basic " + Buffer.from(`${c.sid}:${c.token}`).toString("base64") }, signal: AbortSignal.timeout(60_000) });
  if (!r.ok) throw new Error(`kayıt indirilemedi: ${r.status}`);
  const audio = Buffer.from(await r.arrayBuffer());
  const fid = randomUUID(), key = `${clinicId}/media/${fid.slice(0, 2)}/${fid}`;
  await storage.put(key, audio);
  await ownerSql`insert into files (id, clinic_id, kind, name, mime, size_bytes, storage_key, sha256, entity, entity_id) values (${fid}, ${clinicId}, 'media', ${`call-${callId.slice(0, 8)}.mp3`}, 'audio/mpeg', ${audio.length}, ${key}, ${createHash("sha256").update(audio).digest("hex")}, 'lead', ${k.leadId ?? null})`;
  await ownerSql`update calls set recording_file_id = ${fid} where id = ${callId}`;
  // döküm (STT anahtarı yoksa kayıt yine saklanır)
  const stt = await sttConfig(clinicId); let transcript: string | null = null;
  if (stt) { try { transcript = (await transcribe(stt, audio, "audio/mpeg")).trim() || null; } catch (e) { await ownerSql`update calls set error = ${"döküm: " + (e as Error).message} where id = ${callId}`; } }
  await ownerSql`update calls set transcript = ${transcript} where id = ${callId}`;
  // AI özet
  let ai: any = null;
  if (transcript && (await aiAvailable(clinicId)) && !(await overCap(clinicId))) {
    const lang = (k.defaultLanguage as string) ?? "tr";
    const res = await complete(clinicId, { model: MODELS.fast, maxTokens: 1500, tools: [CALL_TOOL], toolChoice: "call_output", messages: [{ role: "user", content: `${voicemail ? "SESLİ MESAJ" : `${k.direction === "out" ? "GİDEN" : "GELEN"} ARAMA`} dökümü:\n\n${transcript.slice(0, 20000)}` }],
      system: `Diş turizmi kliniğinde satış temsilcisine yardım ediyorsun. Telefon görüşmesi dökümünü değerlendir. Özet ve sonraki adım ${lang === "tr" ? "Türkçe" : lang === "de" ? "Deutsch" : "English"} olsun. Teşhis koyma; yalnız hastanın söylediklerini kaydet.` });
    await trackUsage(clinicId, "call", MODELS.fast, res.usage);
    ai = res.toolCalls.find((t) => t.name === "call_output")?.input ?? null;
  }
  const outcome = voicemail ? "voicemail" : ai?.outcome ?? (k.outcome as string) ?? (transcript ? "reached_interested" : null);
  await otx(clinicId, async (t) => {
    await t`update calls set summary = ${ai?.summary ?? null}, next_step = ${ai?.next_step ?? null}, outcome = ${outcome}, ai = ${t.json((ai ?? {}) as never)} where id = ${callId}`;
    if (!k.leadId) return;
    const dur = k.durationSec ?? k.recordingSec; const icon = k.direction === "out" ? "📞→" : "📞←";
    await t`insert into lead_events (clinic_id, lead_id, type, body, data, user_id) values (${clinicId}, ${k.leadId}, 'call', ${`${icon} ${ai?.summary ?? (voicemail ? "Sesli mesaj" : "Arama kaydı")}`}, ${t.json({ callId, outcome, durationSec: dur ?? null, voicemail } as never)}, ${k.userId ?? null})`;
    const reached = outcome && outcome.startsWith("reached") || outcome === "booked" || outcome === "callback";
    await t`update leads set last_activity_at = now(), first_response_at = case when ${!!reached && k.direction === "out"} then coalesce(first_response_at, now()) else first_response_at end,
        stage = case when ${!!reached} and stage = 'new' then 'contacted' else stage end where id = ${k.leadId}`;
    if (ai?.lead) { const L: Record<string, unknown> = {}; for (const [kk, col] of Object.entries({ interest: "interest", budget: "budget", travelWindow: "travel_window", temperature: "temperature" })) if (ai.lead[kk]) L[col] = String(ai.lead[kk]).slice(0, 300); if (Object.keys(L).length) await t`update leads set ${t(L as never)} where id = ${k.leadId}`; }
    const [ld] = await t`select owner_id from leads where id = ${k.leadId}`;
    if (ai?.next_step || voicemail) await t`insert into tasks (clinic_id, title, type, priority, due_at, lead_id, assignee_id, entity, entity_id) values (${clinicId}, ${(voicemail ? "🎤 Sesli mesaj: " : "📞 ") + (ai?.next_step ?? "Sesli mesajı dinle ve geri ara")}, 'call', ${voicemail ? "high" : "med"}, now() + make_interval(hours => ${voicemail ? 0 : Number(ai?.next_step_in_hours ?? 24)}), ${k.leadId}, ${(ld?.ownerId as string) ?? k.userId ?? null}, 'call', ${callId})`;
    await t`insert into outbox_events (clinic_id, type, entity_id, payload) values (${clinicId}, 'call.completed', ${callId}, ${t.json({ callId, leadId: k.leadId, outcome, direction: k.direction } as never)})`;
    await t`select pg_notify('outbox', ${clinicId})`;
  });
}
