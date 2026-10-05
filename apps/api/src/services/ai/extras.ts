// AI ekleri: fotoğraf/röntgenden ön değerlendirme (hekime taslak), haftalık kayıp analizi, temsilci konuşma karnesi, benzer vaka eşleştirme
import { ownerSql, type Tx } from "../../db.ts";
import { complete, MODELS, aiAvailable } from "./llm.ts";
import { trackUsage, overCap } from "./agent.ts";
import { storage, signFile } from "../storage.ts";
import { config } from "../../config.ts";
import { notifyUser } from "../notify.ts";

const LANG: Record<string, string> = { tr: "Türkçe", en: "English", de: "Deutsch", ar: "العربية" };
const clinicLang = async (clinicId: string) => ((await ownerSql`select default_language from clinics where id = ${clinicId}`)[0]?.defaultLanguage as string) ?? "tr";

// ── 1) Fotoğraf / röntgenden ön değerlendirme ──
const ASSESS_TOOL = { name: "assess_output", description: "Ön değerlendirme taslağı", input_schema: { type: "object", required: ["summary", "findings", "confidence", "image_quality"], properties: {
  summary: { type: "string" }, image_quality: { type: "string", enum: ["good", "ok", "poor"] }, confidence: { type: "string", enum: ["low", "medium", "high"] },
  findings: { type: "array", maxItems: 32, items: { type: "object", required: ["tooth", "status"], properties: { tooth: { type: "integer", description: "FDI numarası (11–48)" },
    status: { type: "string", enum: ["missing", "root", "caries", "crown", "bridge", "pontic", "impcr", "rct", "comp", "amalg", "impacted", "veneer", "other"] }, note: { type: "string" } } } },
  suggestions: { type: "array", items: { type: "string" }, description: "Hekimin değerlendirebileceği olası tedavi yönleri" }, needs: { type: "array", items: { type: "string" }, description: "Net değerlendirme için gereken ek görüntü/bilgi" } } } };

export async function assessCase(clinicId: string, caseId: string, userId: string) {
  const files = await ownerSql`select id, kind, mime, storage_key, size_bytes from files where clinic_id = ${clinicId} and entity = 'case' and entity_id = ${caseId} and kind in ('photo','xray') and mime in ('image/jpeg','image/png','image/webp','image/gif') and size_bytes < 4500000 order by (kind = 'xray') desc, created_at desc limit 6`;
  if (!files.length) throw new Error("no_images");
  const lang = await clinicLang(clinicId);
  const content: any[] = [];
  for (const f of files) { const buf = await storage.get(f.storageKey as string); content.push({ type: "text", text: f.kind === "xray" ? "Röntgen:" : "Ağız içi/gülüş fotoğrafı:" }, { type: "image", source: { type: "base64", media_type: f.mime, data: buf.toString("base64") } }); }
  content.push({ type: "text", text: "Bu görüntülere göre ön değerlendirme taslağını hazırla." });
  const model = MODELS.agent;
  const r = await complete(clinicId, { model, maxTokens: 1500, tools: [ASSESS_TOOL], toolChoice: "assess_output", messages: [{ role: "user", content }],
    system: `Bir diş hekimine yardımcı olan asistansın. Hasta fotoğrafları ve/veya panoramik röntgenden hekimin inceleyip DÜZELTECEĞİ bir ön değerlendirme TASLAĞI hazırlarsın. Bu bir teşhis değildir.
Yalnız görüntüde makul ölçüde görülebilen durumları FDI diş numarasıyla raporla (eksik diş, kök artığı, belirgin çürük, mevcut kron/köprü/implant, kanal tedavili, gömülü). Emin olmadığın dişleri raporlama; güvenini dürüstçe belirt.
Fotoğraftan kemik durumu veya kanal ihtiyacı gibi görülemeyen şeyleri iddia etme; bunları "needs" içinde ek görüntü olarak iste. Özet ve öneriler ${LANG[lang] ?? lang} dilinde, kısa ve klinik üslupla.` });
  await trackUsage(clinicId, "vision", model, r.usage);
  const o = r.toolCalls[0]?.input; if (!o) throw new Error("empty");
  const findings = (o.findings ?? []).filter((f: any) => Number.isInteger(f.tooth) && f.tooth >= 11 && f.tooth <= 48 && f.tooth % 10 >= 1 && f.tooth % 10 <= 8);
  const out = { ...o, findings, images: files.length, at: new Date().toISOString(), by: userId, model };
  await ownerSql`update cases set ai_assessment = ${ownerSql.json(out as never)} where id = ${caseId} and clinic_id = ${clinicId}`;
  return out;
}

// ── 2) Kayıp analizi ──
export async function lossReport(clinicId: string, days: number, userId: string | null) {
  const lang = await clinicLang(clinicId);
  const lost = await ownerSql`select l.id, l.lost_reason, l.lost_note, l.source, l.campaign, p.country, l.interest, l.budget, extract(day from now() - l.created_at)::int as age_days,
      (select sh.from_stage from stage_history sh where sh.lead_id = l.id and sh.to_stage = 'lost' order by sh.id desc limit 1) as from_stage,
      (select q.total_minor / 100 || ' ' || q.currency from quotes q where q.lead_id = l.id order by q.created_at desc limit 1) as quote,
      (select ci.objection from conv_insights ci where ci.lead_id = l.id and ci.objection is not null order by ci.id desc limit 1) as objection,
      (select string_agg(x.line, E'\n') from (select (case when m.direction = 'in' then 'H: ' else 'K: ' end) || left(m.body, 220) as line from messages m join conversations cv on cv.id = m.conversation_id where cv.lead_id = l.id and m.body is not null and m.direction in ('in','out') order by m.id desc limit 6) x) as last_msgs
    from leads l join patients p on p.id = l.patient_id where l.clinic_id = ${clinicId} and l.stage = 'lost' and l.stage_entered_at > now() - make_interval(days => ${days}) order by l.stage_entered_at desc limit 40`;
  if (lost.length < 1) return null;
  const [tot] = await ownerSql`select count(*) filter (where created_at > now() - make_interval(days => ${days}))::int as leads, count(*) filter (where stage = 'won' and stage_entered_at > now() - make_interval(days => ${days}))::int as won from leads where clinic_id = ${clinicId}`;
  const model = MODELS.agent;
  const r = await complete(clinicId, { model, maxTokens: 1400, system: `Diş turizmi kliniği için satış analisti olarak kaybedilen lead'leri incele. ${LANG[lang] ?? lang} dilinde, yöneticinin 2 dakikada okuyacağı net bir rapor yaz:
1) En sık 3 kayıp nedeni (yaklaşık pay ile) 2) Dikkat çeken örüntüler (kaynak, ülke, aşama, cevap süresi, fiyat) 3) Bu hafta uygulanacak 5 somut aksiyon 4) Geri kazanılabilecek lead türleri.
Yalnız verilen veriye dayan; veri yetersizse açıkça söyle. Düz metin, kısa başlıklar ve madde işaretleri; tablo yok.`,
    messages: [{ role: "user", content: `Dönem: son ${days} gün. Yeni lead: ${tot!.leads}, kazanılan: ${tot!.won}, kaybedilen (örnek): ${lost.length}.\n\n` + JSON.stringify(lost.map(({ id: _i, ...x }) => x)).slice(0, 60000) }] });
  await trackUsage(clinicId, "report", model, r.usage);
  if (!r.text) return null;
  const [rep] = await ownerSql`insert into ai_reports (clinic_id, kind, period_from, period_to, body, data, created_by) values (${clinicId}, 'loss', current_date - ${days}::int, current_date, ${r.text}, ${ownerSql.json({ lost: lost.length, leads: tot!.leads, won: tot!.won } as never)}, ${userId}) returning id, created_at`;
  return { id: rep!.id, body: r.text, createdAt: rep!.createdAt };
}
/** İşçi: haftalık otomatik kayıp raporu (özelliği açık, 7 gündür raporu olmayan, yeterli verisi olan klinikler) */
export async function weeklyLossReports() {
  const clinics = await ownerSql`select a.clinic_id from ai_agents a where a.active and coalesce((a.features->>'lossReport')::boolean, false)
    and not exists (select 1 from ai_reports r where r.clinic_id = a.clinic_id and r.kind = 'loss' and r.created_at > now() - interval '7 days')
    and (select count(*) from leads l where l.clinic_id = a.clinic_id and l.stage = 'lost' and l.stage_entered_at > now() - interval '7 days') >= 3 limit 20`;
  for (const c of clinics) {
    const id = c.clinicId as string; if (!(await aiAvailable(id)) || (await overCap(id))) continue;
    const rep = await lossReport(id, 7, null).catch((e) => { console.error("loss", e); return null; }); if (!rep) continue;
    const admins = await ownerSql`select user_id from memberships where clinic_id = ${id} and active and role in ('admin','manager')`;
    for (const a of admins) await notifyUser(id, a.userId as string, "ai.report", "📊 Haftalık kayıp analizi hazır", "/reports").catch(() => {});
  }
}

// ── 3) Temsilci konuşma karnesi ──
const QA_TOOL = { name: "qa_output", description: "Konuşma kalite değerlendirmesi", input_schema: { type: "object", required: ["score", "summary", "strengths", "improvements", "criteria"], properties: {
  score: { type: "integer", minimum: 0, maximum: 100 }, summary: { type: "string" }, strengths: { type: "array", items: { type: "string" }, maxItems: 5 }, improvements: { type: "array", items: { type: "string" }, maxItems: 5 },
  criteria: { type: "object", description: "Her ölçüt 1–5", properties: { speed: { type: "integer" }, discovery: { type: "integer" }, photos: { type: "integer" }, follow_up: { type: "integer" }, tone: { type: "integer" }, closing: { type: "integer" } } },
  examples: { type: "array", maxItems: 3, items: { type: "object", properties: { quote: { type: "string" }, better: { type: "string" } } } } } } };

export async function qaReport(clinicId: string, repId: string, days: number, userId: string) {
  const lang = await clinicLang(clinicId);
  const convs = await ownerSql`select cv.id, (select count(*) from messages m where m.conversation_id = cv.id and m.user_id = ${repId})::int as n from conversations cv
    where cv.clinic_id = ${clinicId} and exists (select 1 from messages m where m.conversation_id = cv.id and m.user_id = ${repId} and m.direction = 'out' and not m.ai and m.at > now() - make_interval(days => ${days}))
    order by cv.last_message_at desc nulls last limit 12`;
  if (!convs.length) return null;
  const transcripts: string[] = [];
  for (const cv of convs) {
    const ms = (await ownerSql`select direction, body, at, ai, user_id from messages where conversation_id = ${cv.id} and direction in ('in','out') and body is not null order by id desc limit 24`).reverse();
    transcripts.push(ms.map((m) => `[${new Date(m.at as Date).toISOString().slice(5, 16).replace("T", " ")}] ${m.direction === "in" ? "HASTA" : m.ai ? "AI" : m.userId === repId ? "TEMSİLCİ" : "DİĞER"}: ${String(m.body).slice(0, 300)}`).join("\n"));
  }
  const model = MODELS.agent;
  const r = await complete(clinicId, { model, maxTokens: 1300, tools: [QA_TOOL], toolChoice: "qa_output", system: `Diş turizmi kliniğinde satış koçusun. Bir temsilcinin (TEMSİLCİ satırları) hasta yazışmalarını değerlendir; AI ve DİĞER satırlarını puanlama.
Ölçütler (1–5): speed (cevap hızı), discovery (ihtiyacı anlama soruları), photos (fotoğraf/röntgen isteme), follow_up (takip), tone (üslup, empati), closing (sonraki adıma yönlendirme).
Yapıcı ve somut ol; ${LANG[lang] ?? lang} dilinde yaz. "examples" içinde temsilcinin gerçek bir cümlesini ve daha iyi bir alternatifini ver.`,
    messages: [{ role: "user", content: transcripts.map((t, i) => `--- Konuşma ${i + 1} ---\n${t}`).join("\n\n").slice(0, 70000) }] });
  await trackUsage(clinicId, "qa", model, r.usage);
  const o = r.toolCalls[0]?.input; if (!o) return null;
  const [rep] = await ownerSql`insert into ai_reports (clinic_id, kind, user_id, period_from, period_to, body, data, created_by) values (${clinicId}, 'qa', ${repId}, current_date - ${days}::int, current_date, ${String(o.summary ?? "")}, ${ownerSql.json({ ...o, conversations: convs.length } as never)}, ${userId}) returning id, created_at`;
  return { id: rep!.id, createdAt: rep!.createdAt, ...o, conversations: convs.length };
}

// ── 4) Benzer vaka eşleştirme (galeri) ──
export async function similarCases(tx: Tx, clinicId: string, leadId: string) {
  const [l] = await tx`select l.interest, l.issue, (select k.plan_items from cases k where k.lead_id = l.id order by k.created_at desc limit 1) as plan from leads l where l.id = ${leadId}`;
  if (!l) return [];
  const gal = await tx`select id, data, file_id from clinic_content where kind = 'gallery' and active and file_id is not null order by sort limit 200`;
  const codes = new Set<string>(((l.plan as any[]) ?? []).flatMap((i) => [i.tx, i.b]).filter(Boolean).map((x: string) => x.split("_")[0]!.toLowerCase()));
  const words = new Set(`${l.interest ?? ""} ${l.issue ?? ""}`.toLowerCase().split(/[^a-zçğıöşü0-9-]+/i).filter((w) => w.length > 3));
  const ALIAS: Record<string, string[]> = { implant: ["implant", "ao4", "ao6", "all-on-4", "all-on-6", "allon4"], crown: ["crown", "kron", "zirkon", "zirconia", "krone"], veneer: ["veneer", "lamina", "laminate", "emax", "smile", "hollywood", "gülüş"], whitening: ["whitening", "beyazlatma", "bleaching"] };
  const scored = gal.map((g) => {
    const d = g.data as any; const text = `${typeof d.caption === "string" ? d.caption : Object.values(d.caption ?? {}).join(" ")} ${(Array.isArray(d.tags) ? d.tags.join(" ") : d.tags ?? "")}`.toLowerCase();
    let s = 0;
    for (const [k, al] of Object.entries(ALIAS)) { const inLead = codes.has(k) || [...codes].some((c) => al.includes(c)) || al.some((a) => [...words].some((w) => w.includes(a) || a.includes(w))); if (inLead && al.some((a) => text.includes(a))) s += 5; }
    for (const w of words) if (text.includes(w)) s += 1;
    return { id: g.id, caption: d.caption ?? "", tags: d.tags ?? "", fileId: g.fileId as string, score: s };
  }).sort((a, b) => b.score - a.score);
  return scored.slice(0, 4).map((x) => ({ ...x, thumb: `/api/files/${x.fileId}`, shareUrl: config.appUrl + signFile(x.fileId, 14 * 86400) }));
}
