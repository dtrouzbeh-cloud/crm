// Web sitesi kanalı: sohbet widget'ı (ziyaretçi oturumu, mesajlaşma, çekme) ve lead formu; ayrıca Instagram/Messenger için ortak gelen mesaj işleyici
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { ownerSql, withClinic, type Tx } from "../db.ts";
import { ctx, need, parse, notFound, HttpError } from "../http.ts";
import { emit, audit } from "../services/audit.ts";
import { randomToken } from "../lib/crypto.ts";
import { config } from "../config.ts";
import { createLead } from "./leads.ts";

const sign = (key: string, visitor: string) => createHmac("sha256", config.sessionSecret).update(`w:${key}:${visitor}`).digest("base64url").slice(0, 32);
const tokenFor = (key: string, visitor: string) => `${visitor}.${sign(key, visitor)}`;
function verifyToken(key: string, token: string) {
  const [v, s] = String(token).split("."); if (!v || !s) return null;
  const a = Buffer.from(sign(key, v)), b = Buffer.from(s); return a.length === b.length && timingSafeEqual(a, b) ? v : null;
}
async function widgetAccount(key: string) {
  const [a] = await ownerSql`select a.*, c.name as clinic_name, c.brand_color, c.default_language from channel_accounts a join clinics c on c.id = a.clinic_id where a.channel = 'web' and a.external_id = ${key} and a.status = 'connected'`;
  if (!a) throw notFound("Widget"); return a;
}

/** Sohbet kanallarında (web, Instagram, Messenger) gelen mesaj: konuşma + mesaj + olay */
export async function ingestChat(tx: Tx, acc: { id: string; clinicId: string; channel: string }, m: { contactId: string; name?: string | null; body: string; externalId?: string | null; leadId?: string | null; patientId?: string | null }) {
  let [cv] = await tx`select * from conversations where account_id = ${acc.id} and contact_id = ${m.contactId}`;
  if (!cv) {
    const [l] = m.leadId ? await tx`select owner_id from leads where id = ${m.leadId}` : [null];
    [cv] = await tx`insert into conversations (clinic_id, account_id, channel, contact_id, contact_name, patient_id, lead_id, assignee_id) values (${acc.clinicId}, ${acc.id}, ${acc.channel}, ${m.contactId}, ${m.name ?? null}, ${m.patientId ?? null}, ${m.leadId ?? null}, ${l?.ownerId ?? null})
      on conflict (account_id, contact_id) do update set contact_name = coalesce(conversations.contact_name, excluded.contact_name) returning *`;
  }
  const [msg] = await tx`insert into messages (clinic_id, conversation_id, direction, type, body, external_id, status) values (${acc.clinicId}, ${cv!.id}, 'in', 'text', ${m.body.slice(0, 4000)}, ${m.externalId ?? null}, 'received')
    on conflict (conversation_id, external_id) do nothing returning id`;
  if (!msg) return { conversationId: cv!.id as string, duplicate: true };
  await tx`update conversations set last_message_at = now(), last_inbound_at = now(), last_preview = ${m.body.slice(0, 120)}, unread = unread + 1, status = 'open' where id = ${cv!.id}`;
  if (cv!.leadId) {
    await tx`insert into lead_events (clinic_id, lead_id, type, body, data) values (${acc.clinicId}, ${cv!.leadId}, ${acc.channel === "web" ? "note" : "whatsapp"}, ${m.body.slice(0, 500)}, ${tx.json({ direction: "in", channel: acc.channel, conversationId: cv!.id } as never)})`;
    await tx`update leads set last_activity_at = now() where id = ${cv!.leadId}`;
  }
  await emit(tx, acc.clinicId, "chat.message", cv!.id as string, { conversationId: cv!.id, leadId: cv!.leadId, channel: acc.channel, name: cv!.contactName ?? m.name, ownerId: cv!.assigneeId, link: "/inbox/" + cv!.id, preview: m.body.slice(0, 80) });
  return { conversationId: cv!.id as string, messageId: msg.id };
}

export function widgetRoutes(app: FastifyInstance) {
  // ── yönetim ──
  app.get("/api/widget", async (req) => {
    const c = need(ctx(req), "integrations.manage");
    return withClinic(c.clinicId, async (tx) => {
      let [a] = await tx`select * from channel_accounts where channel = 'web' limit 1`;
      if (!a) [a] = await tx`insert into channel_accounts (clinic_id, channel, name, external_id, status, config) values (${c.clinicId}, 'web', 'Web sitesi', ${"w_" + randomToken(12)}, 'connected', ${tx.json({ greeting: { tr: "Merhaba! 👋 Size nasıl yardımcı olabiliriz?", en: "Hi! 👋 How can we help you?" }, position: "right" } as never)}) returning *`;
      const [st] = await tx`select count(*)::int as convs, count(distinct lead_id)::int as leads from conversations where account_id = ${a!.id}`;
      return { key: a!.externalId, config: a!.config, status: a!.status, stats: st, snippet: `<script src="${config.appUrl}/widget.js" data-key="${a!.externalId}" async></script>`, formUrl: `${config.appUrl}/l/${a!.externalId}` };
    });
  });
  app.put("/api/widget", async (req) => {
    const c = need(ctx(req), "integrations.manage");
    const b = parse(z.object({ greeting: z.record(z.string(), z.string().max(300)).optional(), color: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(), position: z.enum(["left", "right"]).optional(), enabled: z.boolean().optional(),
      formFields: z.array(z.enum(["treatment", "message", "country", "photos"])).optional(), title: z.string().max(80).optional() }), req.body);
    return withClinic(c.clinicId, async (tx) => {
      const [a] = await tx`select * from channel_accounts where channel = 'web' limit 1`; if (!a) throw notFound("Widget");
      const { enabled, ...cfg } = b;
      await tx`update channel_accounts set config = ${tx.json({ ...(a.config as object), ...cfg } as never)}, status = ${enabled === false ? "disconnected" : enabled === true ? "connected" : a.status} where id = ${a.id}`;
      await audit(tx, c, "widget.update", "channel_account", a.id as string, b); return { ok: true };
    });
  });

  // ── herkese açık (CORS: her site) ──
  app.addHook("onSend", async (req, reply) => { if (req.url.startsWith("/api/public/widget/")) { reply.header("Access-Control-Allow-Origin", "*").header("Access-Control-Allow-Headers", "content-type").header("Access-Control-Allow-Methods", "GET,POST,OPTIONS"); } });
  app.options("/api/public/widget/*", async (_req, reply) => reply.status(204).send());

  app.get("/api/public/widget/:key/config", async (req) => {
    const a = await widgetAccount((req.params as { key: string }).key); const cfg = a.config as any;
    return { clinic: a.clinicName, color: cfg.color || a.brandColor || "#0E7C86", greeting: cfg.greeting ?? {}, position: cfg.position ?? "right", title: cfg.title ?? null, lang: a.defaultLanguage, formFields: cfg.formFields ?? ["treatment", "message"] };
  });
  const START = z.object({ name: z.string().trim().min(2).max(120), phone: z.string().trim().max(40).optional(), email: z.email().max(200).optional().or(z.literal("")), lang: z.string().max(5).optional(),
    page: z.string().max(500).optional(), utm: z.record(z.string(), z.string().max(200)).optional(), treatment: z.string().max(120).optional(), message: z.string().max(4000).optional(), country: z.string().max(2).optional(), consent: z.boolean().optional() });
  // sohbet başlat (ön form) — lead oluşur
  app.post("/api/public/widget/:key/start", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (req) => {
    const key = (req.params as { key: string }).key; const a = await widgetAccount(key); const b = parse(START, req.body);
    if (!b.phone && !b.email) throw new HttpError(400, "contact_required", "Telefon veya e-posta gerekli");
    const visitor = randomUUID();
    const res = await ownerSql.begin(async (tx0) => {
      const tx = tx0 as unknown as Tx; await tx`select set_config('app.clinic_id', ${a.clinicId}, true)`;
      const lead = await createLead(tx, { clinicId: a.clinicId, userId: null as unknown as string }, { fullName: b.name, phone: b.phone ?? null, email: b.email || null, language: b.lang ?? null, country: b.country ?? null, source: "website", temperature: "warm",
        interest: b.treatment ?? null, issue: b.message ?? null, utm: { ...(b.utm ?? {}), ...(b.page ? { page: b.page.slice(0, 200) } : {}) }, marketingConsent: !!b.consent } as never, { dedupe: "attach" });
      const out = await ingestChat(tx, { id: a.id, clinicId: a.clinicId, channel: "web" }, { contactId: visitor, name: b.name, body: b.message?.trim() || `[${b.treatment ?? "web"}]`, externalId: "start:" + visitor, leadId: lead.leadId, patientId: lead.patientId });
      return { conversationId: out.conversationId };
    });
    return { token: tokenFor(key, visitor), conversationId: res.conversationId };
  });
  app.post("/api/public/widget/:key/messages", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req) => {
    const key = (req.params as { key: string }).key; const a = await widgetAccount(key);
    const b = parse(z.object({ token: z.string().max(200), body: z.string().trim().min(1).max(4000), id: z.string().max(60).optional() }), req.body);
    const visitor = verifyToken(key, b.token); if (!visitor) throw new HttpError(401, "bad_token");
    const out = await ownerSql.begin(async (tx0) => { const tx = tx0 as unknown as Tx; await tx`select set_config('app.clinic_id', ${a.clinicId}, true)`;
      return ingestChat(tx, { id: a.id, clinicId: a.clinicId, channel: "web" }, { contactId: visitor, body: b.body, externalId: b.id ?? null }); });
    return { ok: true, id: (out as any).messageId ?? null };
  });
  app.get("/api/public/widget/:key/messages", async (req) => {
    const key = (req.params as { key: string }).key; const a = await widgetAccount(key);
    const q = parse(z.object({ token: z.string().max(200), after: z.coerce.number().int().min(0).default(0) }), req.query);
    const visitor = verifyToken(key, q.token); if (!visitor) throw new HttpError(401, "bad_token");
    const [cv] = await ownerSql`select id from conversations where account_id = ${a.id} and contact_id = ${visitor}`; if (!cv) return { messages: [] };
    const msgs = await ownerSql`select m.id, m.direction, m.body, m.at, m.ai, u.name as agent from messages m left join users u on u.id = m.user_id where m.conversation_id = ${cv.id} and m.direction in ('in','out') and m.id > ${q.after} order by m.id limit 100`;
    return { messages: msgs.map((m) => ({ id: Number(m.id), from: m.direction === "in" ? "visitor" : "clinic", body: m.body, at: m.at, agent: m.ai ? null : (m.agent as string | null)?.split(" ")[0] ?? null, ai: m.ai })) };
  });

  // web formu (barındırılan sayfa / iframe): lead + isteğe bağlı mesaj
  app.post("/api/public/widget/:key/lead", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (req) => {
    const key = (req.params as { key: string }).key; const a = await widgetAccount(key); const b = parse(START, req.body);
    if (!b.phone && !b.email) throw new HttpError(400, "contact_required", "Telefon veya e-posta gerekli");
    const r = await ownerSql.begin(async (tx0) => { const tx = tx0 as unknown as Tx; await tx`select set_config('app.clinic_id', ${a.clinicId}, true)`;
      return createLead(tx, { clinicId: a.clinicId, userId: null as unknown as string }, { fullName: b.name, phone: b.phone ?? null, email: b.email || null, language: b.lang ?? null, country: b.country ?? null, source: "form", temperature: "warm",
        interest: b.treatment ?? null, issue: b.message ?? null, utm: { ...(b.utm ?? {}), ...(b.page ? { page: b.page.slice(0, 200) } : {}) }, marketingConsent: !!b.consent } as never, { dedupe: "attach" }); });
    return { ok: true, leadId: r.leadId };
  });
}

// ── Instagram DM + Facebook Messenger (Meta Graph webhook) ──
import { verifyMetaSignature } from "../services/whatsapp.ts";
import { meta } from "../config.ts";
import { encrypt } from "../lib/crypto.ts";

/** Meta webhook gövdesinden mesajlar: object 'page' (Messenger) | 'instagram' */
export function parseMetaMessages(body: any): { channel: "messenger" | "instagram"; recipient: string; sender: string; mid: string; text: string }[] {
  const channel = body?.object === "instagram" ? "instagram" : body?.object === "page" ? "messenger" : null; if (!channel) return [];
  const out: any[] = [];
  for (const e of body.entry ?? []) for (const m of e.messaging ?? []) {
    if (!m.message || m.message.is_echo) continue;
    const text = m.message.text ?? (m.message.attachments?.length ? `[${m.message.attachments[0].type}]` : "");
    if (text) out.push({ channel, recipient: String(m.recipient?.id ?? e.id), sender: String(m.sender?.id), mid: String(m.message.mid), text });
  }
  return out;
}

export async function ingestMeta(m: ReturnType<typeof parseMetaMessages>[number]) {
  const [acc] = await ownerSql`select id, clinic_id, channel, config from channel_accounts where channel = ${m.channel} and external_id = ${m.recipient} and status = 'connected'`;
  if (!acc) return null;
  return ownerSql.begin(async (tx0) => {
    const tx = tx0 as unknown as Tx; await tx`select set_config('app.clinic_id', ${acc.clinicId}, true)`;
    const [cv] = await tx`select lead_id, patient_id from conversations where account_id = ${acc.id} and contact_id = ${m.sender}`;
    let leadId = cv?.leadId as string | null, patientId = cv?.patientId as string | null;
    if (!cv) {
      const name = `${m.channel === "instagram" ? "Instagram" : "Messenger"} ${m.sender.slice(-4)}`;
      const r = await createLead(tx, { clinicId: acc.clinicId as string, userId: null as unknown as string }, { fullName: name, source: m.channel === "instagram" ? "instagram" : "meta", temperature: "warm", externalIds: { [m.channel]: m.sender }, ownerId: (acc.config as any)?.defaultAssignee ?? null } as never, { dedupe: "attach" });
      leadId = r.leadId; patientId = r.patientId;
    }
    return ingestChat(tx, { id: acc.id as string, clinicId: acc.clinicId as string, channel: m.channel }, { contactId: m.sender, body: m.text, externalId: m.mid, leadId, patientId });
  });
}

export function metaMessagingRoutes(app: FastifyInstance) {
  app.get("/api/public/meta/messages", async (req, reply) => {
    const q = req.query as Record<string, string>;
    if (q["hub.mode"] === "subscribe" && q["hub.verify_token"] && q["hub.verify_token"] === meta.verifyToken) return reply.type("text/plain").send(q["hub.challenge"]);
    return reply.status(403).send("forbidden");
  });
  app.post("/api/public/meta/messages", async (req, reply) => {
    if (!verifyMetaSignature((req as any).rawBody as string, req.headers["x-hub-signature-256"] as string)) return reply.status(401).send({ error: "bad_signature" });
    for (const m of parseMetaMessages(req.body)) await ingestMeta(m).catch((e) => req.log.error(e));
    return { ok: true };
  });
  // hesap bağlama: Facebook sayfası (Messenger) veya Instagram profesyonel hesabı + sayfa erişim anahtarı
  app.post("/api/inbox/accounts/meta", async (req) => {
    const c = need(ctx(req), "integrations.manage");
    const b = parse(z.object({ channel: z.enum(["messenger", "instagram"]), externalId: z.string().regex(/^\d{5,30}$/), token: z.string().min(20), name: z.string().trim().min(1).max(80) }), req.body);
    return withClinic(c.clinicId, async (tx) => {
      const [a] = await tx`insert into channel_accounts (clinic_id, channel, name, external_id, access_token_enc, status) values (${c.clinicId}, ${b.channel}, ${b.name}, ${b.externalId}, ${encrypt(b.token)}, 'connected')
        on conflict (channel, external_id) do update set access_token_enc = excluded.access_token_enc, name = excluded.name, status = 'connected' where channel_accounts.clinic_id = ${c.clinicId} returning id`;
      if (!a) throw new HttpError(409, "taken", "Bu hesap başka bir kliniğe bağlı");
      await audit(tx, c, "channel.connect", "channel_account", a.id as string, { channel: b.channel }); return { id: a.id, webhookUrl: `${config.appUrl}/api/public/meta/messages` };
    });
  });
}
