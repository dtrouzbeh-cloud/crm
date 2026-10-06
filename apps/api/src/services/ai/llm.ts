// Dil modeli istemcisi: Anthropic Messages API (araç çağırma) + test için sahte sağlayıcı. Anahtar: klinik anahtarı > platform anahtarı.
import { ownerSql } from "../../db.ts";
import { decrypt } from "../../lib/crypto.ts";
import { getSecret } from "../secrets.ts";

export type Tool = { name: string; description: string; input_schema: Record<string, unknown> };
export type Msg = { role: "user" | "assistant"; content: string | any[] };
export type LlmResult = { text: string; toolCalls: { id: string; name: string; input: any }[]; raw: any[]; usage: { input: number; output: number }; stop: string };

export const MODELS = { agent: process.env.AI_MODEL_AGENT || "claude-sonnet-5-5", fast: process.env.AI_MODEL_FAST || "claude-haiku-4-5-20251001", vision: process.env.AI_MODEL_VISION || process.env.AI_MODEL_AGENT || "claude-sonnet-5-5" };
// $/milyon token → mikro-dolar/token ile aynı sayı
const PRICE: Record<string, [number, number]> = { [MODELS.agent]: [Number(process.env.AI_PRICE_AGENT_IN ?? 3), Number(process.env.AI_PRICE_AGENT_OUT ?? 15)], [MODELS.fast]: [Number(process.env.AI_PRICE_FAST_IN ?? 1), Number(process.env.AI_PRICE_FAST_OUT ?? 5)] };
export const costMicro = (model: string, u: { input: number; output: number }) => { const p = PRICE[model] ?? [3, 15]; return Math.round(u.input * p[0] + u.output * p[1]); };

export async function apiKeyFor(clinicId: string): Promise<string | null> {
  const sec = await getSecret(clinicId, "anthropic"); if (sec?.value.key) return sec.value.key;
  const [c] = await ownerSql`select settings->'ai'->>'keyEnc' as k from clinics where id = ${clinicId}`;   // eski konum
  if (c?.k) { try { return decrypt(c.k as string); } catch { /* bozuk */ } }
  return process.env.ANTHROPIC_API_KEY || null;
}
export const isMock = () => process.env.AI_PROVIDER === "mock";
export async function aiAvailable(clinicId: string) { return isMock() || !!(await apiKeyFor(clinicId)); }

export async function complete(clinicId: string, o: { model: string; system: string; messages: Msg[]; tools?: Tool[]; maxTokens?: number; toolChoice?: string }): Promise<LlmResult> {
  if (isMock()) return mock(o);
  const key = await apiKeyFor(clinicId); if (!key) throw new Error("ai_key_missing");
  const call = async (forced: boolean) => {
    // bazı modeller zorunlu araç seçimini ("tool"/"any") desteklemez → "auto" + sistem talimatıyla aynı sonuca yaklaş
    const system = !forced && o.toolChoice ? `${o.system}\n\nIMPORTANT: You MUST respond by calling the "${o.toolChoice}" tool exactly once, with all required fields. Do not answer in plain text.` : o.system;
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST", headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: o.model, max_tokens: Math.max(o.maxTokens ?? 800, 4096), system, messages: o.messages, ...(o.tools?.length ? { tools: o.tools } : {}), ...(o.toolChoice ? { tool_choice: forced ? { type: "tool", name: o.toolChoice } : { type: "auto" } } : {}) }),
      signal: AbortSignal.timeout(90_000),
    });
    const j: any = await r.json().catch(() => ({}));
    return { r, j };
  };
  let { r, j } = await call(true);
  if (r.status === 400 && o.toolChoice && /tool_choice/i.test(j?.error?.message ?? "")) ({ r, j } = await call(false));
  if (!r.ok) throw new Error(`ai_http_${r.status}: ${j?.error?.message ?? ""}`.slice(0, 300));
  const blocks = (j.content ?? []) as any[];
  return { text: blocks.filter((b) => b.type === "text").map((b) => b.text).join("\n").trim(), toolCalls: blocks.filter((b) => b.type === "tool_use").map((b) => ({ id: b.id, name: b.name, input: b.input })),
    raw: blocks, usage: { input: j.usage?.input_tokens ?? 0, output: j.usage?.output_tokens ?? 0 }, stop: j.stop_reason ?? "end_turn" };
}

/** Sahte sağlayıcı: anahtar kelimelere göre belirlenimci davranış (testler için) */
const MOCK_FORCED: Record<string, any> = {
  coach_output: { lang: "en", translation: "Merhaba, All-on-4 fiyatı nedir? Biraz pahalı geldi.", intent: "price_question", objection: "price", sentiment: "neutral", urgency: "medium", tactic: "Fiyatı değerle çerçevele; ücretsiz ön değerlendirme için fotoğraf iste.",
    suggestions: [{ label: "Kısa", text: "Thanks! Could you send a few photos of your teeth so our dentist can prepare an exact quote?", gloss: "Teşekkürler! Hekimimizin net teklif hazırlaması için fotoğraf gönderir misiniz?" },
      { label: "Sıcak", text: "I completely understand — it's an important decision. Our packages include hotel and transfers. May I prepare a free personal plan for you?", gloss: "Çok iyi anlıyorum… Size ücretsiz kişisel plan hazırlayayım mı?" },
      { label: "Kapanış", text: "We have availability next month. If you send your photos today, you'll have your plan by tomorrow.", gloss: "Önümüzdeki ay müsaitiz. Bugün fotoğraf gönderirseniz planınız yarın hazır." }],
    lead: { interest: "All-on-4", temperature: "warm" } },
  assess_output: { summary: "Üst çenede çoklu eksik diş; alt ön bölgede çürük şüphesi.", image_quality: "ok", confidence: "medium", findings: [{ tooth: 16, status: "missing" }, { tooth: 15, status: "missing" }, { tooth: 31, status: "caries" }], suggestions: ["Üst çene için implant destekli sabit protez değerlendirilebilir"], needs: ["Panoramik röntgen"] },
  qa_output: { score: 72, strengths: ["Hızlı ilk yanıt"], improvements: ["Fotoğraf istemeyi unutmuş"], criteria: { speed: 4, discovery: 3, photos: 2, follow_up: 3, tone: 5, closing: 3 }, summary: "Genel olarak iyi; keşif soruları artırılmalı." },
};
function mock(o: { messages: Msg[]; tools?: Tool[]; toolChoice?: string; system?: string }): LlmResult {
  const last = o.messages[o.messages.length - 1]!;
  const usage = { input: 400, output: 60 };
  if (o.toolChoice && MOCK_FORCED[o.toolChoice]) { const raw = [{ type: "tool_use", id: "tf", name: o.toolChoice, input: MOCK_FORCED[o.toolChoice] }]; return { text: "", toolCalls: [{ id: "tf", name: o.toolChoice, input: MOCK_FORCED[o.toolChoice] }], raw, usage, stop: "tool_use" }; }
  if (!o.tools?.length) return { text: /translate|çevir/i.test(o.system ?? "") ? "[çeviri] " + (typeof last.content === "string" ? last.content : "") : "Mock rapor: fiyat itirazı en sık kayıp nedeni. Öneri: teklif sonrası 24 saat içinde arama.", toolCalls: [], raw: [], usage, stop: "end_turn" };
  // araç sonucundan sonra son cevap
  if (Array.isArray(last.content) && last.content.some((b: any) => b.type === "tool_result")) return { text: "Teşekkürler! Bilgilerinizi not aldım. Dişlerinizin önden ve yandan fotoğraflarını gönderebilir misiniz?", toolCalls: [], raw: [], usage, stop: "end_turn" };
  const text = typeof last.content === "string" ? last.content : (last.content as any[]).map((b) => b.text ?? "").join(" ");
  const has = (n: string) => o.tools?.some((t) => t.name === n);
  if (/insan|temsilci|human|real person|indirim|discount/i.test(text) && has("handoff")) {
    const raw = [{ type: "tool_use", id: "t1", name: "handoff", input: { reason: /indirim|discount/i.test(text) ? "price_negotiation" : "asked_for_human", summary: "Hasta temsilci istedi" } }];
    return { text: "", toolCalls: raw.map((b) => ({ id: b.id, name: b.name, input: b.input })), raw, usage, stop: "tool_use" };
  }
  if (/implant|all-on|veneer|kron|crown/i.test(text) && has("update_lead")) {
    const raw = [{ type: "tool_use", id: "t2", name: "update_lead", input: { interest: /all-on/i.test(text) ? "All-on-4" : "implant", temperature: "warm" } }];
    return { text: "", toolCalls: raw.map((b) => ({ id: b.id, name: b.name, input: b.input })), raw, usage, stop: "tool_use" };
  }
  return { text: "Merhaba! Size nasıl yardımcı olabilirim? Hangi tedaviyle ilgileniyorsunuz?", toolCalls: [], raw: [], usage, stop: "end_turn" };
}
