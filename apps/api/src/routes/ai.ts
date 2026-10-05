// Yapay zekâ API: ajan ayarları, anahtar/limit, bilgi tabanı, test sohbeti, gelen kutusu (taslak/öneri/durdur), lead özeti, kullanım
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { withClinic, ownerSql } from "../db.ts";
import { ctx, need, parse, parsePatch, notFound, HttpError } from "../http.ts";
import { audit } from "../services/audit.ts";
import { encrypt } from "../lib/crypto.ts";
import { runAgent } from "../services/ai/agent.ts";
import { complete, MODELS, aiAvailable, isMock, apiKeyFor } from "../services/ai/llm.ts";
import { sendInConversation } from "./inbox.ts";
import { getSecret } from "../services/secrets.ts";

const AGENT = z.object({ name: z.string().trim().min(1).max(60), mode: z.enum(["off", "assist", "auto_offhours", "auto_always"]), channels: z.array(z.enum(["whatsapp", "instagram", "messenger", "web", "email"])).max(6),
  persona: z.string().max(1000).nullable(), instructions: z.string().max(6000).nullable(), pricePolicy: z.enum(["none", "ranges", "packages"]),
  handoff: z.record(z.string(), z.unknown()), features: z.record(z.string(), z.boolean()), hours: z.object({ start: z.number().int().min(0).max(23).optional(), end: z.number().int().min(1).max(24).optional(), days: z.array(z.number().int().min(0).max(6)).optional() }), active: z.boolean() }).partial();

export function aiRoutes(app: FastifyInstance) {
  app.get("/api/ai/agent", async (req) => {
    const c = need(ctx(req), "settings.manage");
    return withClinic(c.clinicId, async (tx) => {
      const [a] = await tx`select * from ai_agents where kind = 'text'`;
      const [cl] = await tx`select settings->'ai' as ai from clinics where id = ${c.clinicId}`;
      const [u] = await tx`select coalesce(sum(calls),0)::int as calls, coalesce(sum(cost_micro),0)::bigint as cost from ai_usage where day >= date_trunc('month', current_date)`;
      const sec = await getSecret(c.clinicId, "anthropic");
      return { agent: a ?? { name: "Asistan", mode: "off", channels: ["whatsapp"], pricePolicy: "ranges", handoff: {}, features: { coach: true, translate: true, scoring: true }, hours: { start: 9, end: 19, days: [1, 2, 3, 4, 5, 6] }, active: true },
        key: { clinic: !!sec || !!(cl?.ai as any)?.keyEnc, platform: !!process.env.ANTHROPIC_API_KEY, mock: isMock(), available: await aiAvailable(c.clinicId) },
        cap: (cl?.ai as any)?.monthlyCapUsd ?? null, usage: { calls: u!.calls, costUsd: Number(u!.cost) / 1e6 }, models: MODELS };
    });
  });
  app.put("/api/ai/agent", async (req) => {
    const c = need(ctx(req), "settings.manage"); const b = parsePatch(AGENT, req.body);
    return withClinic(c.clinicId, async (tx) => {
      const [cur] = await tx`select * from ai_agents where kind = 'text'`;
      const v = { name: b.name ?? cur?.name ?? "Asistan", mode: b.mode ?? cur?.mode ?? "off", channels: b.channels ?? cur?.channels ?? ["whatsapp"], persona: b.persona !== undefined ? b.persona : cur?.persona ?? null,
        instructions: b.instructions !== undefined ? b.instructions : cur?.instructions ?? null, pricePolicy: b.pricePolicy ?? cur?.pricePolicy ?? "ranges", handoff: b.handoff ?? cur?.handoff ?? {}, features: { ...((cur?.features as object) ?? { coach: true, translate: true, scoring: true }), ...(b.features ?? {}) }, hours: b.hours ?? cur?.hours ?? {}, active: b.active ?? cur?.active ?? true };
      if ((v.mode !== "off" && v.mode !== cur?.mode) && !(await aiAvailable(c.clinicId))) throw new HttpError(400, "ai_key_missing", "Önce bir Claude API anahtarı tanımlayın");
      await tx`insert into ai_agents (clinic_id, kind, name, mode, channels, persona, instructions, price_policy, handoff, features, hours, active) values (${c.clinicId}, 'text', ${v.name}, ${v.mode}, ${v.channels}, ${v.persona}, ${v.instructions}, ${v.pricePolicy}, ${tx.json(v.handoff as never)}, ${tx.json(v.features as never)}, ${tx.json(v.hours as never)}, ${v.active})
        on conflict (clinic_id, kind) do update set name = excluded.name, mode = excluded.mode, channels = excluded.channels, persona = excluded.persona, instructions = excluded.instructions, price_policy = excluded.price_policy, handoff = excluded.handoff, features = excluded.features, hours = excluded.hours, active = excluded.active`;
      await audit(tx, c, "ai.agent.update", "ai_agent", null, { mode: v.mode, channels: v.channels }); return { ok: true };
    });
  });
  app.put("/api/ai/key", async (req) => {
    const c = need(ctx(req), "settings.manage"); const b = parse(z.object({ key: z.string().regex(/^sk-ant-[A-Za-z0-9_-]{20,}$/, "Geçersiz anahtar").nullable(), monthlyCapUsd: z.number().min(0).max(100000).nullable().optional() }), req.body);
    return withClinic(c.clinicId, async (tx) => {
      const [cl] = await tx`select settings->'ai' as ai from clinics where id = ${c.clinicId}`;
      const ai = { ...((cl?.ai as object) ?? {}) } as Record<string, unknown>;
      if (b.key !== undefined) { if (b.key) ai.keyEnc = encrypt(b.key); else delete ai.keyEnc; }
      if (b.monthlyCapUsd !== undefined) ai.monthlyCapUsd = b.monthlyCapUsd;
      await tx`update clinics set settings = jsonb_set(settings, '{ai}', ${tx.json(ai as never)}) where id = ${c.clinicId}`;
      await audit(tx, c, "ai.key.update", "clinic", c.clinicId, { key: b.key ? "set" : b.key === null ? "removed" : "unchanged", cap: b.monthlyCapUsd }); return { ok: true };
    });
  });

  // bilgi tabanı
  app.get("/api/ai/kb", async (req) => { const c = need(ctx(req), "settings.manage"); return withClinic(c.clinicId, (tx) => tx`select * from ai_kb order by created_at`); });
  app.post("/api/ai/kb", async (req) => { const c = need(ctx(req), "settings.manage"); const b = parse(z.object({ title: z.string().trim().min(1).max(160), body: z.string().trim().min(1).max(4000) }), req.body);
    return withClinic(c.clinicId, async (tx) => (await tx`insert into ai_kb (clinic_id, title, body) values (${c.clinicId}, ${b.title}, ${b.body}) returning *`)[0]); });
  app.patch("/api/ai/kb/:id", async (req) => { const c = need(ctx(req), "settings.manage"); const { id } = req.params as { id: string };
    const b = parsePatch(z.object({ title: z.string().max(160), body: z.string().max(4000), active: z.boolean() }).partial(), req.body);
    const set: Record<string, unknown> = { ...b }; return withClinic(c.clinicId, async (tx) => { if (Object.keys(set).length) await tx`update ai_kb set ${tx(set as never)} where id = ${id}`; return { ok: true }; }); });
  app.delete("/api/ai/kb/:id", async (req) => { const c = need(ctx(req), "settings.manage"); const { id } = req.params as { id: string }; return withClinic(c.clinicId, async (tx) => { await tx`delete from ai_kb where id = ${id}`; return { ok: true }; }); });

  // test sohbeti (hiçbir işlem yapılmaz, mesaj gönderilmez)
  app.post("/api/ai/test", async (req) => {
    const c = need(ctx(req), "settings.manage"); const b = parse(z.object({ messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(4000) })).min(1).max(30) }), req.body);
    if (!(await aiAvailable(c.clinicId))) throw new HttpError(400, "ai_key_missing", "Claude API anahtarı tanımlı değil");
    const r = await runAgent(c.clinicId, { testMessages: b.messages, purpose: "test", dryRun: true });
    return { text: r.text, actions: r.actions };
  });

  // gelen kutusu
  app.get("/api/inbox/conversations/:id/ai", async (req) => {
    const c = need(ctx(req), "inbox.use"); const { id } = req.params as { id: string };
    return withClinic(c.clinicId, async (tx) => {
      const [cv] = await tx`select ai_paused from conversations where id = ${id}`; if (!cv) throw notFound("Konuşma");
      const [draft] = await tx`select id, body, created_at from ai_drafts where conversation_id = ${id} and status = 'pending' order by created_at desc limit 1`;
      const [s] = await tx`select status, turns, handoff_reason, summary from ai_sessions where conversation_id = ${id} order by created_at desc limit 1`;
      const [ag] = await tx`select mode from ai_agents where kind = 'text' and active`;
      return { paused: cv.aiPaused, draft: draft ?? null, session: s ?? null, mode: ag?.mode ?? "off", available: await aiAvailable(c.clinicId) };
    });
  });
  app.post("/api/inbox/conversations/:id/ai/pause", async (req) => {
    const c = need(ctx(req), "inbox.use"); const { id } = req.params as { id: string }; const b = parse(z.object({ paused: z.boolean() }), req.body);
    return withClinic(c.clinicId, async (tx) => {
      await tx`update conversations set ai_paused = ${b.paused} where id = ${id}`;
      if (!b.paused) await tx`update ai_sessions set status = 'closed' where conversation_id = ${id} and status = 'handed_off'`;
      await audit(tx, c, b.paused ? "ai.pause" : "ai.resume", "conversation", id); return { ok: true };
    });
  });
  app.post("/api/inbox/conversations/:id/ai/suggest", async (req) => {
    const c = need(ctx(req), "inbox.use"); const { id } = req.params as { id: string };
    if (!(await aiAvailable(c.clinicId))) throw new HttpError(400, "ai_key_missing", "Claude API anahtarı tanımlı değil");
    const r = await runAgent(c.clinicId, { conversationId: id, purpose: "suggest", dryRun: true });
    return { text: r.text };
  });
  app.post("/api/ai/drafts/:id/:action", async (req) => {
    const c = need(ctx(req), "inbox.use"); const { id, action } = req.params as { id: string; action: string };
    const b = parse(z.object({ body: z.string().max(4000).optional() }), req.body ?? {});
    const [d] = await withClinic(c.clinicId, (tx) => tx`update ai_drafts set status = ${action === "use" ? "used" : "discarded"} where id = ${id} and status = 'pending' returning conversation_id, body`);
    if (!d) throw new HttpError(409, "not_pending");
    if (action === "use") { const idem = "draft:" + id; await sendInConversation(c, d.conversationId as string, { kind: "text", body: b.body ?? (d.body as string), idem });
      await ownerSql`update messages set ai = ${b.body === undefined || b.body === d.body} where conversation_id = ${d.conversationId} and idempotency_key = ${idem}`; }
    return { ok: true };
  });

  // lead özeti (hızlı model)
  app.post("/api/leads/:id/ai-summary", async (req) => {
    const c = need(ctx(req), "lead.read"); const { id } = req.params as { id: string };
    if (!(await aiAvailable(c.clinicId))) throw new HttpError(400, "ai_key_missing", "Claude API anahtarı tanımlı değil");
    const data = await withClinic(c.clinicId, async (tx) => {
      const [l] = await tx`select l.stage, l.interest, l.budget, l.travel_window, l.issue, l.source, p.full_name, p.country, p.language from leads l join patients p on p.id = l.patient_id where l.id = ${id}`; if (!l) throw notFound("Lead");
      const ev = await tx`select type, body, at from lead_events where lead_id = ${id} order by at desc limit 40`;
      const msgs = await tx`select m.direction, m.body, m.at from messages m join conversations cv on cv.id = m.conversation_id where cv.lead_id = ${id} and m.body is not null order by m.id desc limit 30`;
      return { l, ev, msgs };
    });
    const r = await complete(c.clinicId, { model: MODELS.fast, maxTokens: 350, system: "Diş turizmi kliniği satış ekibi için lead özeti yaz. Türkçe, en fazla 5 madde: hastanın ihtiyacı, durumu, itirazlar/sorular, sıcaklık, önerilen sonraki adım. Uydurma yapma.",
      messages: [{ role: "user", content: JSON.stringify({ lead: data.l, events: data.ev, messages: data.msgs.reverse() }).slice(0, 12000) }] });
    await ownerSql`insert into ai_usage (clinic_id, day, purpose, calls, tokens_in, tokens_out) values (${c.clinicId}, current_date, 'summary', 1, ${r.usage.input}, ${r.usage.output})
      on conflict (clinic_id, day, purpose) do update set calls = ai_usage.calls + 1, tokens_in = ai_usage.tokens_in + excluded.tokens_in, tokens_out = ai_usage.tokens_out + excluded.tokens_out`;
    return { summary: r.text };
  });

  app.get("/api/ai/usage", async (req) => {
    const c = need(ctx(req), "settings.manage"); const q = parse(z.object({ days: z.coerce.number().int().min(1).max(365).default(30) }), req.query);
    return withClinic(c.clinicId, (tx) => tx`select day, purpose, calls, tokens_in, tokens_out, cost_micro from ai_usage where day > current_date - ${q.days}::int order by day desc, purpose`);
  });
  void apiKeyFor;
}
