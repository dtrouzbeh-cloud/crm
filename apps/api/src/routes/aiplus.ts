// AI+ API: canlı koç, çeviri, itiraz raporu, arama listesi, canlı teklifler, fotoğraf ön değerlendirme, kayıp analizi, konuşma karnesi, benzer vakalar; Kurulum (anahtarlar + kontrol listesi)
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { withClinic, ownerSql } from "../db.ts";
import { ctx, need, parse, notFound, HttpError, forbidden, qbool } from "../http.ts";
import { audit } from "../services/audit.ts";
import { aiAvailable, isMock } from "../services/ai/llm.ts";
import { overCap } from "../services/ai/agent.ts";
import { coachConversation, translateText } from "../services/ai/coach.ts";
import { assessCase, assessFeedback, assessStats, lossReport, qaReport, similarCases } from "../services/ai/extras.ts";
import { callList, rescoreStale, scoreLead } from "../services/scoring.ts";
import { getSecret, setSecret, listSecrets, type SecretName } from "../services/secrets.ts";
import { sttConfig } from "../services/stt.ts";

const aiReady = async (clinicId: string) => { if (!(await aiAvailable(clinicId))) throw new HttpError(400, "ai_key_missing", "Claude API anahtarı tanımlı değil — Ayarlar → Kurulum"); if (await overCap(clinicId)) throw new HttpError(402, "ai_cap", "Aylık yapay zekâ limiti doldu"); };

export function aiPlusRoutes(app: FastifyInstance) {
  // ── canlı koç ──
  app.get("/api/inbox/conversations/:id/coach", async (req) => {
    const c = need(ctx(req), "inbox.use"); const { id } = req.params as { id: string };
    return withClinic(c.clinicId, async (tx) => {
      const [cv] = await tx`select cv.id, p.language from conversations cv left join patients p on p.id = cv.patient_id where cv.id = ${id}`; if (!cv) throw notFound("Konuşma");
      const [ins] = await tx`select * from conv_insights where conversation_id = ${id} order by id desc limit 1`;
      const [lastIn] = await tx`select id from messages where conversation_id = ${id} and direction = 'in' order by id desc limit 1`;
      const [lastOut] = await tx`select id from messages where conversation_id = ${id} and direction = 'out' order by id desc limit 1`;
      // öneriler yalnız hastanın son mesajına aitse ve henüz cevaplanmadıysa güncel sayılır
      const fresh = !!ins && Number(ins.messageId) === Number(lastIn?.id) && (!lastOut || Number(lastOut.id) < Number(lastIn?.id));
      const [ag] = await tx`select features from ai_agents where kind = 'text' and active`;
      const [cl] = await tx`select default_language from clinics where id = ${c.clinicId}`;
      return { insight: ins ?? null, fresh, patientLang: ins?.lang ?? cv.language ?? null, clinicLang: cl!.defaultLanguage, features: ag?.features ?? {}, available: await aiAvailable(c.clinicId) };
    });
  });
  app.post("/api/inbox/conversations/:id/coach", async (req) => {
    const c = need(ctx(req), "inbox.use"); const { id } = req.params as { id: string }; await aiReady(c.clinicId);
    const [cv] = await withClinic(c.clinicId, (tx) => tx`select id from conversations where id = ${id}`); if (!cv) throw notFound("Konuşma");
    const r = await coachConversation(c.clinicId, id); if (!r) throw new HttpError(409, "nothing_to_coach", "Cevaplanacak hasta mesajı yok");
    return r;
  });
  app.post("/api/ai/translate", { config: { rateLimit: { max: 40, timeWindow: "1 minute" } } }, async (req) => {
    const c = need(ctx(req), "inbox.use"); const b = parse(z.object({ text: z.string().trim().min(1).max(4000), to: z.string().min(2).max(5) }), req.body); await aiReady(c.clinicId);
    return { text: await translateText(c.clinicId, b.text, b.to) };
  });
  app.get("/api/ai/objections", async (req) => {
    const c = need(ctx(req), "reports.view"); const q = parse(z.object({ days: z.coerce.number().int().min(1).max(365).default(30) }), req.query);
    return withClinic(c.clinicId, async (tx) => ({
      objections: await tx`select objection, count(distinct lead_id)::int as leads, count(distinct lead_id) filter (where exists (select 1 from deals d where d.lead_id = ci.lead_id))::int as won,
          count(distinct lead_id) filter (where exists (select 1 from leads l where l.id = ci.lead_id and l.stage = 'lost'))::int as lost
        from conv_insights ci where objection is not null and created_at > now() - make_interval(days => ${q.days}) group by objection order by 2 desc`,
      intents: await tx`select intent, count(*)::int as n from conv_insights where intent is not null and created_at > now() - make_interval(days => ${q.days}) group by intent order by 2 desc`,
    }));
  });

  // ── lead puanı / arama listesi ──
  app.get("/api/leads/call-list", async (req) => {
    const c = need(ctx(req), "lead.read"); const q = parse(z.object({ mine: qbool.default(true), limit: z.coerce.number().int().min(1).max(30).default(10) }), req.query);
    const own = q.mine || c.perms["lead.read"] === "own";
    return withClinic(c.clinicId, async (tx) => (await callList(tx, { ownerId: own ? c.userId : null, limit: q.limit })).map((r) => ({ ...r, phone: c.perms["field.phone"] === "show" ? r.phone : null })));
  });
  app.post("/api/leads/rescore", async (req) => {
    const c = need(ctx(req), "settings.manage");
    const rows = await withClinic(c.clinicId, (tx) => tx`select id from leads where archived_at is null and stage not in ('won','lost') limit 3000`);
    for (const r of rows) await scoreLead(r.id as string).catch(() => {});
    void rescoreStale; return { scored: rows.length };
  });

  // ── canlı teklifler ──
  app.get("/api/quotes/live", async (req) => {
    const c = need(ctx(req), "lead.read");
    return withClinic(c.clinicId, (tx) => tx`select ql.quote_id, ql.lead_id, ql.last_ping, ql.session_started, ql.sessions, ql.seconds_total, ql.current_option, ql.current_section, (ql.last_ping > now() - interval '90 seconds') as live,
        p.full_name, p.country, ${c.perms["field.phone"] === "show" ? tx`p.phone` : tx`null as phone`}, q.number, q.status, l.owner_id, u.name as owner_name
      from quote_live ql join quotes q on q.id = ql.quote_id join leads l on l.id = ql.lead_id join patients p on p.id = l.patient_id left join users u on u.id = l.owner_id
      where ql.last_ping > now() - interval '24 hours' ${c.perms["lead.read"] === "own" ? tx`and l.owner_id = ${c.userId}` : tx``} order by ql.last_ping desc limit 30`);
  });
  app.get("/api/quotes/:id/engagement", async (req) => {
    const c = need(ctx(req), "lead.read"); const { id } = req.params as { id: string };
    return withClinic(c.clinicId, async (tx) => { const [e] = await tx`select ql.*, (ql.last_ping > now() - interval '90 seconds') as live from quote_live ql where quote_id = ${id}`; return e ?? null; });
  });

  // ── fotoğraftan ön değerlendirme ──
  app.post("/api/cases/:id/ai-assess", async (req) => {
    const c = ctx(req); if (!c.perms["case.write"] && !c.perms["case.diagnose"]) throw forbidden("case.write"); const { id } = req.params as { id: string }; await aiReady(c.clinicId);
    const [k] = await withClinic(c.clinicId, (tx) => tx`select id from cases where id = ${id}`); if (!k) throw notFound("Vaka");
    try { const r = await assessCase(c.clinicId, id, c.userId); await withClinic(c.clinicId, (tx) => audit(tx, c, "case.ai_assess", "case", id, { findings: r.findings.length })); return r; }
    catch (e) { if ((e as Error).message === "no_images") throw new HttpError(400, "no_images", "Önce fotoğraf veya röntgen yükleyin (JPEG/PNG, en fazla 4,5 MB)"); req.log.error({ err: e, caseId: id }, "ai_assess_failed"); throw new HttpError(502, "ai_failed", (e as Error).message); }
  });
  app.post("/api/cases/:id/ai-assess/feedback", async (req) => {
    const c = ctx(req); if (!c.perms["case.write"] && !c.perms["case.diagnose"]) throw forbidden("case.write"); const { id } = req.params as { id: string };
    const b = z.object({ verdict: z.enum(["correct", "partial", "wrong"]), wrongTeeth: z.array(z.number().int().min(11).max(48)).max(32).optional(), note: z.string().max(1000).nullish() }).parse(req.body ?? {});
    return withClinic(c.clinicId, async (tx) => { try { const r = await assessFeedback(tx, c.clinicId, id, c.userId, b); await audit(tx, c, "case.ai_feedback", "case", id, { verdict: b.verdict, wrong: b.wrongTeeth?.length ?? 0 }); return r; }
      catch (e) { if ((e as Error).message === "no_assessment") throw new HttpError(400, "no_assessment", "Önce AI değerlendirmesi oluşturun"); throw e; } });
  });
  app.get("/api/ai/assess-stats", async (req) => { const c = need(ctx(req), "case.read"); return withClinic(c.clinicId, (tx) => assessStats(tx)); });
  app.get("/api/cases/:id/ai-assess", async (req) => {
    const c = need(ctx(req), "case.read"); const { id } = req.params as { id: string };
    return withClinic(c.clinicId, async (tx) => { const [k] = await tx`select ai_assessment from cases where id = ${id}`; if (!k) throw notFound("Vaka"); return k.aiAssessment ?? null; });
  });

  // ── raporlar: kayıp analizi + konuşma karnesi ──
  app.get("/api/ai/reports", async (req) => {
    const c = need(ctx(req), "reports.view"); const q = parse(z.object({ kind: z.enum(["loss", "qa"]), userId: z.uuid().optional() }), req.query);
    return withClinic(c.clinicId, (tx) => tx`select r.id, r.kind, r.user_id, r.period_from, r.period_to, r.body, r.data, r.created_at, u.name as user_name from ai_reports r left join users u on u.id = r.user_id
      where r.kind = ${q.kind} ${q.userId ? tx`and r.user_id = ${q.userId}` : tx``} order by r.created_at desc limit 12`);
  });
  app.post("/api/ai/reports/loss", async (req) => {
    const c = need(ctx(req), "reports.view"); const b = parse(z.object({ days: z.number().int().min(7).max(180).default(30) }), req.body ?? {}); await aiReady(c.clinicId);
    const r = await lossReport(c.clinicId, b.days, c.userId); if (!r) throw new HttpError(409, "no_data", "Bu dönemde kaybedilen lead yok");
    return r;
  });
  app.post("/api/ai/reports/qa", async (req) => {
    const c = ctx(req); if (!c.perms["team.manage"] && !(c.perms["reports.view"] === "all" && c.perms["lead.assign"])) throw forbidden("team.manage");
    const b = parse(z.object({ userId: z.uuid(), days: z.number().int().min(7).max(90).default(30) }), req.body); await aiReady(c.clinicId);
    const [m] = await withClinic(c.clinicId, (tx) => tx`select 1 from memberships where user_id = ${b.userId}`); if (!m) throw notFound("Kullanıcı");
    const r = await qaReport(c.clinicId, b.userId, b.days, c.userId); if (!r) throw new HttpError(409, "no_data", "Bu temsilcinin değerlendirilecek yazışması yok");
    return r;
  });
  app.get("/api/leads/:id/similar-cases", async (req) => {
    const c = need(ctx(req), "lead.read"); const { id } = req.params as { id: string };
    return withClinic(c.clinicId, (tx) => similarCases(tx, c.clinicId, id));
  });

  // ── Kurulum: anahtarlar + kontrol listesi ──
  app.get("/api/setup", async (req) => {
    const c = need(ctx(req), "settings.manage");
    const secs = Object.fromEntries((await listSecrets(c.clinicId)).map((s) => [s.name, s]));
    const stt = await sttConfig(c.clinicId);
    return withClinic(c.clinicId, async (tx) => {
      const [x] = await tx`select
        (select count(*)::int from channel_accounts where channel = 'whatsapp' and status = 'connected') as wa,
        (select count(*)::int from message_templates where status = 'APPROVED') as templates,
        (select count(*)::int from channel_accounts where channel in ('instagram','messenger') and status = 'connected') as social,
        (select count(*)::int from conversations where channel = 'web') as web_chats,
        (select count(*)::int from memberships where active) as members,
        (select count(*)::int from sequences where active) as sequences,
        (select count(*)::int from integrations where kind = 'meta_ads') as ads,
        (select count(*)::int from payment_providers where active) as pay,
        (select count(*)::int from clinic_content where active) as content,
        (select count(*)::int from clinic_content where active and kind = 'gallery') as gallery,
        (select mode from ai_agents where kind = 'text' and active limit 1) as ai_mode,
        (select logo_file_id is not null from clinics where id = ${c.clinicId}) as logo,
        (select settings->'reviewLinks' from clinics where id = ${c.clinicId}) as reviews,
        (select settings->'ai'->>'keyEnc' is not null from clinics where id = ${c.clinicId}) as legacy_ai_key`;
      const s = x as Record<string, any>;
      return {
        keys: {
          anthropic: { clinic: !!secs.anthropic || !!s.legacyAiKey, platform: !!process.env.ANTHROPIC_API_KEY || isMock(), updatedAt: secs.anthropic?.updatedAt ?? null },
          stt: { clinic: !!secs.stt, platform: !!process.env.STT_API_KEY, provider: (secs.stt?.meta as any)?.provider ?? stt?.provider ?? null, updatedAt: secs.stt?.updatedAt ?? null },
          resend: { clinic: !!secs.resend, platform: !!process.env.RESEND_API_KEY, from: (secs.resend?.meta as any)?.from ?? null, updatedAt: secs.resend?.updatedAt ?? null },
          twilio: { clinic: !!secs.twilio, platform: false, number: (secs.twilio?.meta as any)?.number ?? null, sid: (secs.twilio?.meta as any)?.sidMasked ?? null, updatedAt: secs.twilio?.updatedAt ?? null },
        },
        checklist: [
          { key: "logo", done: !!s.logo, link: "/settings/general" }, { key: "team", done: s.members > 1, link: "/settings/team" }, { key: "content", done: s.content >= 3, link: "/settings/content" },
          { key: "whatsapp", done: s.wa > 0, link: "/settings/integrations" }, { key: "templates", done: s.templates > 0, link: "/settings/integrations" }, { key: "web", done: s.webChats > 0, link: "/settings/integrations" },
          { key: "social", done: s.social > 0, link: "/settings/integrations" }, { key: "payments", done: s.pay > 0, link: "/settings/payments" }, { key: "email", done: !!secs.resend || !!process.env.RESEND_API_KEY, link: "/settings/setup" },
          { key: "ai_key", done: !!secs.anthropic || !!s.legacyAiKey || !!process.env.ANTHROPIC_API_KEY, link: "/settings/setup" }, { key: "ai_mode", done: !!s.aiMode && s.aiMode !== "off", link: "/settings/ai" },
          { key: "sequences", done: s.sequences > 0, link: "/sequences" }, { key: "ads", done: s.ads > 0, link: "/settings/integrations" }, { key: "gallery", done: s.gallery > 0, link: "/settings/content" },
          { key: "reviews", done: Array.isArray(s.reviews) && s.reviews.length > 0, link: "/settings/forms" }, { key: "stt", done: !!stt, link: "/settings/setup" }, { key: "voice", done: !!secs.twilio, link: "/settings/setup" },
        ],
      };
    });
  });
  const KEY_BODY = z.object({ key: z.string().trim().min(8).max(400).optional(), provider: z.enum(["openai", "deepgram", "elevenlabs"]).optional(), from: z.string().trim().max(200).optional(),
    sid: z.string().trim().regex(/^AC[a-f0-9]{32}$/i, "Geçersiz Account SID").optional(), token: z.string().trim().min(16).max(200).optional(), number: z.string().trim().regex(/^\+\d{8,15}$/, "Numara +90… biçiminde olmalı").optional(), remove: z.boolean().optional() });
  app.put("/api/setup/keys/:name", async (req) => {
    const c = need(ctx(req), "settings.manage"); const { name } = req.params as { name: SecretName }; const b = parse(KEY_BODY, req.body);
    if (!["anthropic", "stt", "resend", "twilio"].includes(name)) throw notFound("Anahtar");
    if (b.remove) { await setSecret(c.clinicId, name, null, {}, c.userId); if (name === "anthropic") await ownerSql`update clinics set settings = settings #- '{ai,keyEnc}' where id = ${c.clinicId}`; }
    else if (name === "anthropic") { if (!/^sk-ant-/.test(b.key ?? "")) throw new HttpError(400, "bad_key", "Claude anahtarı sk-ant- ile başlamalı"); await setSecret(c.clinicId, name, { key: b.key! }, {}, c.userId); }
    else if (name === "stt") { if (!b.key) throw new HttpError(400, "key_required", "Anahtar gerekli"); await setSecret(c.clinicId, name, { key: b.key }, { provider: b.provider ?? "openai" }, c.userId); }
    else if (name === "resend") { if (!/^re_/.test(b.key ?? "")) throw new HttpError(400, "bad_key", "Resend anahtarı re_ ile başlamalı"); if (b.from && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(b.from)) throw new HttpError(400, "bad_from", "Gönderen adres geçersiz"); await setSecret(c.clinicId, name, { key: b.key! }, { from: b.from ?? null }, c.userId); }
    else { if (!b.sid || !b.token) throw new HttpError(400, "key_required", "Account SID ve Auth Token gerekli"); await setSecret(c.clinicId, name, { sid: b.sid, token: b.token }, { number: b.number ?? null, sidMasked: b.sid.slice(0, 6) + "…" + b.sid.slice(-4) }, c.userId); }
    await withClinic(c.clinicId, (tx) => audit(tx, c, b.remove ? "setup.key.remove" : "setup.key.set", "secret", null, { name }));
    return { ok: true };
  });
  // anahtarı sağlayıcıya karşı dene (yalnız kimlik doğrulama; ücretli çağrı yapılmaz)
  app.post("/api/setup/keys/:name/test", async (req) => {
    const c = need(ctx(req), "settings.manage"); const { name } = req.params as { name: SecretName };
    const sec = await getSecret(c.clinicId, name); const sig = AbortSignal.timeout(15_000);
    try {
      let r: Response;
      if (name === "anthropic") { const key = sec?.value.key ?? process.env.ANTHROPIC_API_KEY; if (!key) return { ok: false, message: "Anahtar yok" }; r = await fetch("https://api.anthropic.com/v1/models?limit=1", { headers: { "x-api-key": key, "anthropic-version": "2023-06-01" }, signal: sig }); }
      else if (name === "stt") { const cfg = await sttConfig(c.clinicId); if (!cfg) return { ok: false, message: "Anahtar yok" };
        r = cfg.provider === "deepgram" ? await fetch("https://api.deepgram.com/v1/projects", { headers: { Authorization: `Token ${cfg.key}` }, signal: sig })
          : cfg.provider === "elevenlabs" ? await fetch("https://api.elevenlabs.io/v1/user", { headers: { "xi-api-key": cfg.key }, signal: sig }) : await fetch("https://api.openai.com/v1/models", { headers: { Authorization: `Bearer ${cfg.key}` }, signal: sig }); }
      else if (name === "resend") { const key = sec?.value.key ?? process.env.RESEND_API_KEY; if (!key) return { ok: false, message: "Anahtar yok" }; r = await fetch("https://api.resend.com/domains", { headers: { Authorization: `Bearer ${key}` }, signal: sig }); }
      else { if (!sec) return { ok: false, message: "Anahtar yok" }; r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sec.value.sid}.json`, { headers: { Authorization: "Basic " + Buffer.from(`${sec.value.sid}:${sec.value.token}`).toString("base64") }, signal: sig }); }
      // Resend: yalnız gönderim yetkili anahtarlar /domains için 401 "restricted" döner — bu da geçerli anahtardır
      if (name === "resend" && r.status === 401) { const j: any = await r.json().catch(() => ({})); if (/restricted/i.test(j?.message ?? "")) return { ok: true, message: "Anahtar geçerli (yalnız gönderim yetkili)" }; }
      return r.ok ? { ok: true, message: "Bağlantı başarılı" } : { ok: false, message: `Sağlayıcı ${r.status} döndü — anahtarı kontrol edin` };
    } catch (e) { return { ok: false, message: "Bağlanılamadı: " + (e as Error).message }; }
  });
}
