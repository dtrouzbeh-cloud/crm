// Yazılı AI ajanı: bilgi tabanı + güvenlik kuralları + CRM araçları; ne zaman cevap vereceğine karar verir; kullanım ölçer
import { ownerSql, type Tx } from "../../db.ts";
import { config } from "../../config.ts";
import { decrypt } from "../../lib/crypto.ts";
import { loadCatalog } from "../catalog.ts";
import { convert, tn } from "@dentaflow/core/engine";
import { complete, MODELS, costMicro, aiAvailable, type Msg, type Tool } from "./llm.ts";
import { notifyUser } from "../notify.ts";

const DISCLOSE: Record<string, string> = {
  tr: "(Ben {clinic}'in yapay zekâ asistanıyım. İstediğiniz an bir temsilciye bağlanabilirsiniz.)",
  en: "(I'm {clinic}'s AI assistant. You can ask for a human team member at any time.)",
  de: "(Ich bin der KI-Assistent von {clinic}. Sie können jederzeit nach einem Mitarbeiter fragen.)",
  ar: "(أنا المساعد الذكي لـ {clinic}. يمكنك طلب موظف بشري في أي وقت.)",
};
export const TOOLS: Tool[] = [
  { name: "update_lead", description: "Hastadan öğrenilen nitelendirme bilgilerini CRM'e yaz. Yalnız hastanın açıkça söylediği bilgileri yaz.", input_schema: { type: "object", properties: {
    interest: { type: "string", description: "İlgilendiği tedavi (ör. implant, All-on-4, zirkonyum kron, veneer)" }, budget: { type: "string" }, travelWindow: { type: "string", description: "Ne zaman gelmek istiyor" },
    temperature: { type: "string", enum: ["hot", "warm", "cold"] }, issue: { type: "string", description: "Hastanın kendi anlattığı durum (kısa)" }, country: { type: "string", description: "ISO-2 ülke kodu" }, language: { type: "string", enum: ["tr", "en", "de", "ar", "fr", "nl", "ru"] } } } },
  { name: "set_stage", description: "Lead aşamasını ilerlet: hasta cevap verdi → contacted; tedaviyle somut ilgilendi → interested; fotoğraf/röntgen bekleniyor → awaiting_info.", input_schema: { type: "object", properties: { stage: { type: "string", enum: ["contacted", "interested", "awaiting_info"] } }, required: ["stage"] } },
  { name: "handoff", description: "Konuşmayı insan temsilciye devret. Şu durumlarda MUTLAKA kullan: hasta insan isterse, pazarlık/indirim talebi, şikâyet veya öfke, teşhis gerektiren tıbbi soru, acil ağrı/kanama, emin olmadığın her durum.", input_schema: { type: "object", properties: {
    reason: { type: "string", enum: ["asked_for_human", "price_negotiation", "complaint", "medical_question", "urgent", "high_value", "unsure", "other"] }, summary: { type: "string", description: "Temsilci için 1-2 cümlelik özet" } }, required: ["reason", "summary"] } },
  { name: "create_callback", description: "Hasta aranmak isterse temsilciye arama görevi oluştur.", input_schema: { type: "object", properties: { inHours: { type: "number" }, note: { type: "string" } }, required: ["note"] } },
  { name: "get_quote_link", description: "Hastanın hazırlanmış bir teklifi varsa bağlantısını getir.", input_schema: { type: "object", properties: {} } },
];

export async function knowledge(tx: Tx, clinicId: string, agent: any) {
  const [cl] = await tx`select name, city, country, phone, website, default_currency, settings from clinics where id = ${clinicId}`;
  const cur = cl!.defaultCurrency as string; const lines: string[] = [];
  lines.push(`Klinik: ${cl!.name}${cl!.city ? ", " + cl!.city : ""}${cl!.country ? " (" + cl!.country + ")" : ""}. Telefon: ${cl!.phone ?? "-"}. Web: ${cl!.website ?? "-"}.`);
  const q = (cl!.settings as any)?.quote ?? {};
  if (q.hotelNightEur || q.transferEur) lines.push(`Paket hizmetler: otel konaklama ve havalimanı-otel-klinik transferi organize edilir.`);
  if (agent.pricePolicy !== "none") {
    const cat = await loadCatalog(tx, clinicId);
    // her tedavinin KENDİ başlangıç fiyatı (markalıysa en ucuz marka). Kategori en düşüğü verilmez: "implant 120'den" gibi yanıltıcı cevaplara yol açar.
    const from = (t: any) => { const bp = (t.brands ?? []).map((b: any) => Number(b.price)).filter((x: number) => x > 0); return bp.length ? Math.min(...bp) : Number(t.price); };
    const tx1 = cat.treatments.filter((t: any) => t.active && from(t) > 0);
    const ranges = agent.pricePolicy === "ranges";
    lines.push(`Fiyat bilgisi (${cur}, birim başına; ${ranges ? "yalnız 'başlayan fiyat' olarak söyle" : "aşağıdaki fiyatları söyleyebilirsin"}; kesin fiyat hekimin muayenesi/fotoğraflardan sonra hazırlanan kişisel teklifle verilir. Bir tedavinin fiyatını sorulursa YALNIZ o tedavinin satırını kullan, başka kalemin fiyatını onun fiyatı gibi söyleme):`);
    for (const t of tx1) lines.push(`- ${tn(t.n, "tr")} (${t.unit === "tooth" ? "diş başına" : t.unit === "arch" ? "çene başına" : t.unit === "side" ? "taraf başına" : t.unit === "mouth" ? "tüm ağız" : "adet"}): ${ranges ? `${convert(cat, from(t), cur, t.brands?.length ? undefined : t.prices)} ${cur}'dan başlayan` : `${convert(cat, Number(t.price), cur, t.prices)} ${cur}`}`);
    for (const b of cat.bundles) lines.push(`- Paket ${tn((b as any).n, "tr")}: ${convert(cat, (b as any).price, cur, (b as any).prices)} ${cur}'dan başlayan (paket içeriği ve kesin fiyat kişisel plana göre değişir)`);
  }
  const faq = await tx`select data from clinic_content where active and kind in ('faq','team','certificate') order by sort limit 30`;
  for (const f of faq) { const d = f.data as any; if (d.q && d.a) lines.push(`SSS: ${pickL(d.q)} → ${pickL(d.a)}`); else if (d.name) lines.push(`Ekip/sertifika: ${pickL(d.name)}${d.title ? " — " + pickL(d.title) : ""}`); }
  const kb = await tx`select title, body from ai_kb where active order by created_at limit 40`;
  for (const k of kb) lines.push(`Bilgi — ${k.title}: ${k.body}`);
  return { clinic: cl!, text: lines.join("\n") };
}
const pickL = (v: any) => (typeof v === "string" ? v : v?.tr ?? v?.en ?? Object.values(v ?? {})[0] ?? "");

function systemPrompt(agent: any, kb: string, lead: any) {
  return `Sen ${kb.split("\n")[0]!.replace("Klinik: ", "").split(",")[0]} diş kliniğinin uluslararası hasta ekibinde çalışan yapay zekâ asistanısın${agent.name ? ` (adın: ${agent.name})` : ""}.
Görevin: hastayı sıcak ve profesyonel karşılamak, ihtiyacını anlamak, nitelendirmek (ilgilendiği tedavi, eksik/sorunlu dişler, ne zaman gelmek istediği, bütçe, ülke), ön değerlendirme için dişlerin önden-yandan fotoğraflarını ve varsa panoramik röntgeni istemek ve hekimin ücretsiz kişisel teklif hazırlayacağını anlatmak.

KESİN KURALLAR:
- Hastanın yazdığı dilde, kısa (en fazla 3-4 cümle), samimi ve net yaz. WhatsApp üslubu; madde işareti az.
- Yapay zekâ olduğunu gizleme; sorulursa açıkça söyle.
- Teşhis koyma, tedavi kararı verme, sonuç/başarı GARANTİ ETME. "Garanti", "ağrısız", "%100" gibi ifadeler kullanma.
- Kesin fiyat verme; yalnız aşağıdaki bilgi tabanındaki fiyat kurallarına uy. Bilgi tabanında olmayan hiçbir bilgiyi uydurma; bilmiyorsan "ekibimiz netleştirecek" de.
- İndirim/pazarlık, şikâyet, acil durum, tıbbi detay soruları veya insan talebi → handoff aracını kullan ve hastaya bir temsilcinin en kısa sürede döneceğini söyle.
- Öğrendiğin nitelendirme bilgilerini update_lead ile CRM'e yaz; uygun olduğunda set_stage kullan.
- Hasta artık mesaj istemiyorsa saygıyla teşekkür et.
${agent.persona ? `\nTON: ${agent.persona}` : ""}${agent.instructions ? `\nKLİNİK TALİMATLARI: ${agent.instructions}` : ""}

HASTA: ${lead ? `${lead.fullName}${lead.country ? ", " + lead.country : ""}${lead.language ? ", dil: " + lead.language : ""}; aşama: ${lead.stage}; ilgi: ${lead.interest ?? "-"}` : "bilinmiyor"}

BİLGİ TABANI:
${kb}`;
}

/** Kısa süreli klinik bağlamlı işlem. Dış API (AI) çağrıları ASLA bunun içinde yapılmaz: açık işlem kilit tutar ve bağlantı havuzunu tıkar. */
export function otx<T>(clinicId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return ownerSql.begin(async (t0) => { const tx = t0 as unknown as Tx; await tx`select set_config('app.clinic_id', ${clinicId}, true)`; return fn(tx); }) as Promise<T>;
}
/** Model son mesajın kullanıcıdan gelmesini ister; klinik son yazdıysa takip mesajı talimatı ekle */
export function endWithUser(msgs: Msg[], note = "[Hasta henüz cevap vermedi; son mesajı klinik gönderdi. Hastaya gönderilecek kısa, nazik bir takip mesajı yaz.]"): Msg[] {
  return msgs.length && msgs[msgs.length - 1]!.role === "assistant" ? [...msgs, { role: "user", content: note }] : msgs;
}

/** Konuşma geçmişini modele uygun role dizisine çevir (ilk mesaj kullanıcı olmalı, ardışık roller birleşir) */
export async function history(tx: Tx, conversationId: string): Promise<Msg[]> {
  const rows = (await tx`select direction, body, type from messages where conversation_id = ${conversationId} and direction in ('in','out') order by id desc limit 24`).reverse();
  const out: Msg[] = [];
  for (const r of rows) {
    const role = r.direction === "in" ? "user" : "assistant"; const text = r.body ?? `[${r.type}]`;
    const last = out[out.length - 1];
    if (last && last.role === role) last.content = `${last.content}\n${text}`; else out.push({ role, content: text });
  }
  while (out.length && out[0]!.role !== "user") out.shift();
  return out;
}

export async function trackUsage(clinicId: string, purpose: string, model: string, u: { input: number; output: number }) {
  await ownerSql`insert into ai_usage (clinic_id, day, purpose, calls, tokens_in, tokens_out, cost_micro) values (${clinicId}, current_date, ${purpose}, 1, ${u.input}, ${u.output}, ${costMicro(model, u)})
    on conflict (clinic_id, day, purpose) do update set calls = ai_usage.calls + 1, tokens_in = ai_usage.tokens_in + excluded.tokens_in, tokens_out = ai_usage.tokens_out + excluded.tokens_out, cost_micro = ai_usage.cost_micro + excluded.cost_micro`;
}
export async function overCap(clinicId: string) {
  const [c] = await ownerSql`select (settings->'ai'->>'monthlyCapUsd')::numeric as cap from clinics where id = ${clinicId}`;
  if (!c?.cap) return false;
  const [u] = await ownerSql`select coalesce(sum(cost_micro), 0)::bigint as m from ai_usage where clinic_id = ${clinicId} and day >= date_trunc('month', current_date)`;
  return Number(u!.m) >= Number(c.cap) * 1e6;
}

/** Araçları çalıştır */
async function runTool(tx: Tx, ctx: { clinicId: string; lead: any; conversationId: string | null; sessionId: string | null }, name: string, input: any): Promise<string> {
  const { clinicId, lead } = ctx;
  if (!lead) return "lead yok";
  if (name === "update_lead") {
    const map: Record<string, string> = { interest: "interest", budget: "budget", travelWindow: "travel_window", temperature: "temperature", issue: "issue" };
    const L: Record<string, unknown> = {}; for (const [k, col] of Object.entries(map)) if (input?.[k]) L[col] = String(input[k]).slice(0, 400);
    if (Object.keys(L).length) await tx`update leads set ${tx(L as never)}, last_activity_at = now() where id = ${lead.id}`;
    const P: Record<string, unknown> = {}; if (/^[A-Z]{2}$/.test(input?.country ?? "")) P.country = input.country; if (input?.language) P.language = input.language;
    if (Object.keys(P).length) await tx`update patients set ${tx(P as never)} where id = ${lead.patientId} and (country is null or language is null)`;
    return "kaydedildi";
  }
  if (name === "set_stage") {
    const order = ["new", "contacted", "interested", "awaiting_info"];
    if (order.includes(lead.stage) && order.indexOf(input.stage) > order.indexOf(lead.stage)) await tx`update leads set stage = ${input.stage} where id = ${lead.id}`;
    return "tamam";
  }
  if (name === "handoff") {
    if (ctx.sessionId) await tx`update ai_sessions set status = 'handed_off', handoff_reason = ${input.reason}, summary = ${input.summary ?? null}, updated_at = now() where id = ${ctx.sessionId}`;
    if (ctx.conversationId) await tx`update conversations set ai_paused = true where id = ${ctx.conversationId}`;
    await tx`insert into tasks (clinic_id, title, type, priority, due_at, lead_id, assignee_id, entity, entity_id) values (${clinicId}, ${`🤖→👤 ${lead.fullName}: ${input.summary ?? input.reason}`.slice(0, 200)}, 'follow_up', 'high', now() + interval '15 minutes', ${lead.id}, ${lead.ownerId}, 'conversation', ${ctx.conversationId})`;
    await tx`insert into lead_events (clinic_id, lead_id, type, body, data) values (${clinicId}, ${lead.id}, 'system', 'ai_handoff', ${tx.json({ reason: input.reason, summary: input.summary } as never)})`;
    if (lead.ownerId) setImmediate(() => notifyUser(clinicId, lead.ownerId, "ai.handoff", `🤖 ${lead.fullName}: ${input.summary ?? input.reason}`, ctx.conversationId ? "/inbox/" + ctx.conversationId : "/leads/" + lead.id).catch(() => {}));
    return "devredildi — hastaya bir temsilcinin kısa süre içinde döneceğini söyle";
  }
  if (name === "create_callback") {
    await tx`insert into tasks (clinic_id, title, type, priority, due_at, lead_id, assignee_id) values (${clinicId}, ${`📞 ${lead.fullName}: ${String(input.note ?? "").slice(0, 150)}`}, 'call', 'high', now() + make_interval(hours => ${Number(input.inHours ?? 1)}), ${lead.id}, ${lead.ownerId})`;
    return "arama görevi oluşturuldu";
  }
  if (name === "get_quote_link") {
    const [q] = await tx`select token_enc from quotes where lead_id = ${lead.id} and token_enc is not null and status not in ('revoked','expired') order by created_at desc limit 1`;
    return q ? `${config.appUrl}/q/${decrypt(q.tokenEnc as string)}` : "henüz teklif yok";
  }
  return "bilinmeyen araç";
}

export type AgentRun = { text: string; actions: { name: string; input: any; result: string }[]; handedOff: boolean };

/** Ajanı çalıştır: konuşma (veya test mesajları) → cevap metni + yapılan işlemler */
export async function runAgent(clinicId: string, o: { conversationId?: string | null; leadId?: string | null; testMessages?: Msg[]; purpose: string; dryRun?: boolean }): Promise<AgentRun> {
  // 1) bağlamı kısa bir işlemde oku
  const pre = await otx(clinicId, async (tx) => {
    const [agent] = await tx`select * from ai_agents where clinic_id = ${clinicId} and kind = 'text'`;
    const ag = agent ?? { name: "Asistan", pricePolicy: "ranges" };
    const [cv] = o.conversationId ? await tx`select * from conversations where id = ${o.conversationId}` : [null];
    const leadId = o.leadId ?? cv?.leadId ?? null;
    const [lead] = leadId ? await tx`select l.*, p.full_name, p.country, p.language, p.id as pid from leads l join patients p on p.id = l.patient_id where l.id = ${leadId}` : [null];
    const kb = await knowledge(tx, clinicId, ag);
    const msgs = o.testMessages ?? (o.conversationId ? await history(tx, o.conversationId) : []);
    let session: any = null;
    if (msgs.length && o.conversationId && !o.dryRun) {
      session = (await tx`select * from ai_sessions where conversation_id = ${o.conversationId} and status = 'active'`)[0] ?? null;
      if (!session) session = (await tx`insert into ai_sessions (clinic_id, agent_id, conversation_id, lead_id) values (${clinicId}, ${agent?.id ?? null}, ${o.conversationId}, ${leadId}) returning *`)[0];
    }
    return { ag, lead, kb, msgs, session };
  });
  const { ag, lead, kb, msgs, session } = pre;
  if (!msgs.length) return { text: "", actions: [], handedOff: false };
  // 2) model döngüsü işlem dışında; her araç kendi kısa işleminde
  const model = ag.model || MODELS.agent; const system = systemPrompt(ag, kb.text, lead);
  const actions: AgentRun["actions"] = []; let handedOff = false; let text = ""; const convo: Msg[] = endWithUser([...msgs]);
  for (let round = 0; round < 4; round++) {
    const r = await complete(clinicId, { model, system, messages: convo, tools: TOOLS, maxTokens: 600 });
    await trackUsage(clinicId, o.purpose, model, r.usage);
    if (r.text) text = r.text;
    if (!r.toolCalls.length) break;
    convo.push({ role: "assistant", content: r.raw });
    const results: any[] = [];
    for (const tc of r.toolCalls) {
      const res = o.dryRun ? "(test modu — işlem yapılmadı)" : await otx(clinicId, (tx) => runTool(tx, { clinicId, lead: lead ? { ...lead, patientId: lead.pid } : null, conversationId: o.conversationId ?? null, sessionId: session?.id ?? null }, tc.name, tc.input));
      actions.push({ name: tc.name, input: tc.input, result: res }); if (tc.name === "handoff") handedOff = true;
      results.push({ type: "tool_result", tool_use_id: tc.id, content: res });
    }
    convo.push({ role: "user", content: results });
  }
  // 3) oturum güncellemesi; ilk AI mesajında şeffaflık beyanı (AB Yapay Zekâ Yasası)
  if (session) await otx(clinicId, async (tx) => {
    if (text && !session.disclosed) {
      const lang = lead?.language && DISCLOSE[lead.language] ? lead.language : /[ğüşıöç]/i.test(JSON.stringify(msgs)) ? "tr" : "en";
      text = `${text}\n\n${DISCLOSE[lang]!.replace("{clinic}", kb.clinic.name as string)}`;
      await tx`update ai_sessions set disclosed = true where id = ${session.id}`;
    }
    await tx`update ai_sessions set turns = turns + 1, updated_at = now() where id = ${session.id}`;
  });
  return { text, actions, handedOff };
}

/** Gelen mesajda AI cevap versin mi? */
export async function shouldAutoReply(clinicId: string, conversationId: string): Promise<{ ok: boolean; mode?: string; reason?: string }> {
  const [ag] = await ownerSql`select * from ai_agents where clinic_id = ${clinicId} and kind = 'text' and active`;
  if (!ag || ag.mode === "off") return { ok: false, reason: "off" };
  const [cv] = await ownerSql`select channel, ai_paused, lead_id, last_inbound_at from conversations where id = ${conversationId}`;
  if (!cv || cv.aiPaused) return { ok: false, reason: "paused" };
  if (!(ag.channels as string[]).includes(cv.channel as string)) return { ok: false, reason: "channel" };
  if (!(await aiAvailable(clinicId))) return { ok: false, reason: "no_key" };
  if (await overCap(clinicId)) return { ok: false, reason: "cap" };
  // insan son 15 dk içinde yazdıysa AI karışmaz
  const [human] = await ownerSql`select 1 from messages where conversation_id = ${conversationId} and direction = 'out' and not ai and user_id is not null and at > now() - interval '15 minutes' limit 1`;
  if (human) return { ok: false, reason: "human_active" };
  if (ag.mode === "assist") return { ok: true, mode: "assist" };
  if (ag.mode === "auto_always") return { ok: true, mode: "auto" };
  // mesai dışı: çalışma saatleri dışında veya çevrimiçi temsilci yoksa
  const [cl] = await ownerSql`select timezone from clinics where id = ${clinicId}`;
  const h = ag.hours as { start?: number; end?: number; days?: number[] };
  const now = new Date(); const parts = new Intl.DateTimeFormat("en-GB", { timeZone: (cl?.timezone as string) ?? "Europe/Istanbul", hour: "2-digit", hourCycle: "h23", weekday: "short" }).formatToParts(now);
  const hour = Number(parts.find((p) => p.type === "hour")!.value), wd = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.find((p) => p.type === "weekday")!.value);
  const inHours = (h.days ?? [1, 2, 3, 4, 5, 6]).includes(wd) && hour >= (h.start ?? 9) && hour < (h.end ?? 19);
  if (!inHours) return { ok: true, mode: "auto" };
  const [online] = await ownerSql`select 1 from sessions s join memberships m on m.user_id = s.user_id and m.clinic_id = ${clinicId} and m.active and m.role in ('admin','manager','sales','coordinator')
    where s.last_seen_at > now() - interval '10 minutes' and s.expires_at > now() and s.impersonated_by is null limit 1`;
  return online ? { ok: false, reason: "reps_online" } : { ok: true, mode: "auto" };
}

/** Konuşma için AI işini kuyruğa al: otomatik cevap → ai.reply; insan cevaplayacaksa → canlı koç (ai.coach); koç kapalı + asistan modu → taslak */
export async function queueAi(clinicId: string, conv: string) {
  const [ag] = await ownerSql`select mode, features, active from ai_agents where clinic_id = ${clinicId} and kind = 'text'`;
  if (!ag?.active) return;
  const d = await shouldAutoReply(clinicId, conv);
  const pend = async (type: string) => (await ownerSql`select 1 from jobs where type = ${type} and done_at is null and payload->>'conversationId' = ${conv} limit 1`).length > 0;
  if (d.ok && d.mode === "auto") { if (!(await pend("ai.reply"))) await ownerSql`insert into jobs (clinic_id, type, payload, run_at, max_attempts) values (${clinicId}, 'ai.reply', ${ownerSql.json({ conversationId: conv } as never)}, now() + interval '12 seconds', 2)`; return; }
  const coach = (ag.features as any)?.coach !== false;
  if (coach) {
    if (!(await aiAvailable(clinicId)) || (await overCap(clinicId))) return;
    if (!(await pend("ai.coach"))) await ownerSql`insert into jobs (clinic_id, type, payload, run_at, max_attempts) values (${clinicId}, 'ai.coach', ${ownerSql.json({ conversationId: conv } as never)}, now() + interval '8 seconds', 2)`;
    return;
  }
  if (d.ok && d.mode === "assist" && !(await pend("ai.reply"))) await ownerSql`insert into jobs (clinic_id, type, payload, run_at, max_attempts) values (${clinicId}, 'ai.reply', ${ownerSql.json({ conversationId: conv } as never)}, now() + interval '12 seconds', 2)`;
}

/** İşçi: gelen mesaj olayında AI işini yönlendir */
export async function aiHooks(ev: { clinicId: string; type: string; payload: Record<string, unknown> }) {
  if ((ev.type !== "wa.message" && ev.type !== "chat.message") || !ev.payload.conversationId) return;
  const conv = ev.payload.conversationId as string;
  const [last] = await ownerSql`select body, type from messages where conversation_id = ${conv} and direction = 'in' order by id desc limit 1`;
  if (/^\s*(stop|dur|unsubscribe|abmelden)\s*[.!]*\s*$/i.test(String(last?.body ?? ""))) return;
  if (last?.type === "audio" && !last.body) return;   // sesli mesaj: döküm işi bitince AI kuyruğa alınır
  await queueAi(ev.clinicId, conv);
}

/** İş: cevabı üret; asistan modunda taslak, otomatikte gönder */
export async function aiReplyJob(clinicId: string, conversationId: string) {
  const d = await shouldAutoReply(clinicId, conversationId); if (!d.ok) return { skipped: d.reason };
  const run = await runAgent(clinicId, { conversationId, purpose: d.mode === "assist" ? "draft" : "reply" });
  if (!run.text) return { skipped: "empty" };
  if (d.mode === "assist") {
    await ownerSql`update ai_drafts set status = 'discarded' where conversation_id = ${conversationId} and status = 'pending'`;
    const [cv] = await ownerSql`select lead_id from conversations where id = ${conversationId}`;
    await ownerSql`insert into ai_drafts (clinic_id, conversation_id, body) values (${clinicId}, ${conversationId}, ${run.text})`;
    await ownerSql`insert into outbox_events (clinic_id, type, entity_id, payload) values (${clinicId}, 'ai.draft', ${conversationId}, ${ownerSql.json({ conversationId, leadId: cv?.leadId ?? null } as never)})`;
    return { draft: true, actions: run.actions };
  }
  const { sendInConversation } = await import("../../routes/inbox.ts");
  const idem = "ai:" + conversationId + ":" + Date.now();
  await sendInConversation({ clinicId, userId: null as unknown as string }, conversationId, { kind: "text", body: run.text, idem });
  await ownerSql`update messages set ai = true where conversation_id = ${conversationId} and idempotency_key = ${idem}`;
  return { sent: true, actions: run.actions };
}
