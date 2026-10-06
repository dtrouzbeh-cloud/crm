// Canlı satış koçu: gelen mesaj(lar) → çeviri, niyet, itiraz, duygu, taktik ve 3 alternatif cevap (tek çağrı, yapılandırılmış çıktı); ayrıca metin çevirisi
import { ownerSql, type Tx } from "../../db.ts";
import { complete, MODELS } from "./llm.ts";
import { knowledge, history, trackUsage, otx } from "./agent.ts";

export const OBJECTIONS = ["price", "fear", "trust", "timing", "distance", "quality", "competitor", "family", "health", "none"] as const;
export const INTENTS = ["info", "price_question", "ready_to_book", "send_photos", "scheduling", "negotiation", "complaint", "aftercare", "not_interested", "other"] as const;
const LANG_NAME: Record<string, string> = { tr: "Türkçe", en: "English", de: "Deutsch", ar: "العربية", fr: "Français", nl: "Nederlands", ru: "Русский" };

const COACH_TOOL = { name: "coach_output", description: "Satış koçu çıktısı", input_schema: { type: "object", required: ["lang", "translation", "intent", "objection", "sentiment", "tactic", "suggestions"], properties: {
  lang: { type: "string", description: "Hastanın yazdığı dil (ISO-639-1)" },
  translation: { type: "string", description: "Hastanın son mesaj(lar)ının klinik diline çevirisi; zaten klinik dilindeyse boş" },
  intent: { type: "string", enum: [...INTENTS] }, objection: { type: "string", enum: [...OBJECTIONS] },
  sentiment: { type: "string", enum: ["positive", "neutral", "negative"] }, urgency: { type: "string", enum: ["low", "medium", "high"] },
  tactic: { type: "string", description: "Temsilciye 1 cümlelik yaklaşım önerisi (klinik dilinde)" },
  suggestions: { type: "array", minItems: 3, maxItems: 3, items: { type: "object", required: ["label", "text", "gloss"], properties: {
    label: { type: "string", description: "Klinik dilinde kısa etiket: 1) Kısa 2) Sıcak 3) Kapanış" }, text: { type: "string", description: "Hastaya gönderilecek cevap, HASTANIN DİLİNDE" }, gloss: { type: "string", description: "Cevabın klinik dilindeki karşılığı" } } } },
  lead: { type: "object", description: "Hastanın açıkça söylediği yeni bilgiler", properties: { interest: { type: "string" }, budget: { type: "string" }, travelWindow: { type: "string" }, temperature: { type: "string", enum: ["hot", "warm", "cold"] } } },
} } };

export async function coachConversation(clinicId: string, conversationId: string, opts: { reuseMinutes?: number } = {}) {
  // 1) bağlamı kısa işlemde oku. AI çağrısı işlem DIŞINDA yapılır: açık işlem kilit tutar, bağlantı havuzunu tıkar ve iş kuyruğunu durdurur.
  const pre = await otx(clinicId, async (tx) => {
    const [agent] = await tx`select * from ai_agents where clinic_id = ${clinicId} and kind = 'text'`;
    const [cv] = await tx`select lead_id from conversations where id = ${conversationId}`; if (!cv) return null;
    const [lead] = cv.leadId ? await tx`select l.id, l.stage, l.interest, l.patient_id, p.full_name, p.country, p.language from leads l join patients p on p.id = l.patient_id where l.id = ${cv.leadId}` : [null];
    const [cl] = await tx`select default_language from clinics where id = ${clinicId}`; const cLang = (cl!.defaultLanguage as string) ?? "tr";
    const msgs = await history(tx, conversationId); if (!msgs.length || msgs[msgs.length - 1]!.role !== "user") return null;
    const kb = await knowledge(tx, clinicId, agent ?? { pricePolicy: "ranges" });
    const [lastIn] = await tx`select id from messages where conversation_id = ${conversationId} and direction = 'in' order by id desc limit 1`;
    // aynı hasta mesajı için yakın zamanda üretilmiş öneri varsa yeniden kullan (işçi + elle istek çakışırsa çift AI ücreti olmaz)
    const [prev] = lastIn ? await tx`select * from conv_insights where conversation_id = ${conversationId} and message_id = ${lastIn.id} and created_at > now() - make_interval(mins => ${opts.reuseMinutes ?? 10}) order by id desc limit 1` : [];
    return { agent, cv, lead, cLang, msgs, kb, lastIn, prev };
  });
  if (!pre) return null;
  const { agent, cv, lead, cLang, msgs, kb, lastIn, prev } = pre;
  if (prev) return { id: Number(prev.id), reused: true, lang: prev.lang, translation: prev.translation, intent: prev.intent, objection: prev.objection ?? "none", sentiment: prev.sentiment, urgency: prev.urgency, tactic: prev.tactic, suggestions: prev.suggestions };
  const system = `Diş turizmi kliniğinde satış temsilcisine yardım eden deneyimli bir satış koçusun. Temsilci hastayla yazışıyor; sen yalnız temsilciye öneri verirsin, hastaya doğrudan yazmazsın.
Klinik dili: ${LANG_NAME[cLang] ?? cLang}. Çeviri, taktik, etiket ve "gloss" alanlarını klinik dilinde yaz. "text" alanlarını HASTANIN YAZDIĞI DİLDE yaz.
Üç alternatif cevap üret: (1) kısa ve net, (2) sıcak ve güven veren, (3) bir sonraki adıma (fotoğraf, ön görüşme, kapora, tarih) yönlendiren.
KURALLAR: teşhis koyma; sonuç garanti etme; "garanti", "ağrısız", "%100" deme; kesin fiyat verme — yalnız bilgi tabanındaki fiyat kurallarına uy; bilgi tabanında olmayan şeyi uydurma. Cevaplar WhatsApp üslubunda, en fazla 3-4 cümle.
İtiraz varsa (fiyat, korku, güven, zamanlama…) önce empati kur, sonra değeri anlat; baskı yapma.${agent?.persona ? `\nTON: ${agent.persona}` : ""}${agent?.instructions ? `\nKLİNİK TALİMATLARI: ${agent.instructions}` : ""}
HASTA: ${lead ? `${lead.fullName}, ${lead.country ?? "-"}, aşama: ${lead.stage}, ilgi: ${lead.interest ?? "-"}` : "bilinmiyor"}
BİLGİ TABANI:\n${kb.text}`;
  const model = agent?.model || MODELS.agent;
  const r = await complete(clinicId, { model, system, messages: msgs, tools: [COACH_TOOL], toolChoice: "coach_output", maxTokens: 900 });
  await trackUsage(clinicId, "coach", model, r.usage);
  const o = r.toolCalls[0]?.input; if (!o?.suggestions?.length) return null;
  // 2) sonucu kısa işlemde yaz
  return otx(clinicId, async (tx) => {
    const [ins] = await tx`insert into conv_insights (clinic_id, conversation_id, lead_id, message_id, lang, translation, intent, objection, sentiment, urgency, tactic, suggestions)
      values (${clinicId}, ${conversationId}, ${cv.leadId}, ${lastIn?.id ?? null}, ${String(o.lang ?? "").slice(0, 5) || null}, ${o.translation || null}, ${o.intent ?? null}, ${o.objection && o.objection !== "none" ? o.objection : null}, ${o.sentiment ?? null}, ${o.urgency ?? null}, ${o.tactic ?? null}, ${tx.json(o.suggestions as never)}) returning id`;
    if (lead) {
      const L: Record<string, unknown> = {}; const m: Record<string, string> = { interest: "interest", budget: "budget", travelWindow: "travel_window", temperature: "temperature" };
      for (const [k, col] of Object.entries(m)) if (o.lead?.[k]) L[col] = String(o.lead[k]).slice(0, 300);
      if (Object.keys(L).length) await tx`update leads set ${tx(L as never)} where id = ${lead.id}`;
      if (o.lang && !lead.language && /^[a-z]{2}$/.test(o.lang)) await tx`update patients set language = ${o.lang} where id = ${lead.patientId} and language is null`;
    }
    await tx`insert into outbox_events (clinic_id, type, entity_id, payload) values (${clinicId}, 'ai.coach', ${conversationId}, ${tx.json({ conversationId, leadId: cv.leadId, insightId: Number(ins!.id), objection: o.objection, intent: o.intent } as never)})`;
    await tx`select pg_notify('outbox', ${clinicId})`;
    return { id: Number(ins!.id), ...o };
  });
}

export async function translateText(clinicId: string, text: string, to: string): Promise<string> {
  const model = MODELS.fast;
  const r = await complete(clinicId, { model, maxTokens: 700, system: `You are a professional translator for a dental clinic. Translate the user's message into ${LANG_NAME[to] ?? to}. Keep tone, emojis, names, numbers, links and line breaks. Output ONLY the translation.`, messages: [{ role: "user", content: text }] });
  await trackUsage(clinicId, "translate", model, r.usage);
  return r.text;
}
