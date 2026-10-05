import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { withClinic, ownerSql, type Tx } from "../db.ts";
import { config, meta } from "../config.ts";
import { ctx, need, parse, parsePatch, notFound, HttpError, type Ctx } from "../http.ts";
import { audit, emit } from "../services/audit.ts";
import { encrypt, decrypt } from "../lib/crypto.ts";
import { wa, verifyMetaSignature, parseWebhook, inWindow, WaError } from "../services/whatsapp.ts";
import { createLead } from "./leads.ts";

async function account(tx: Tx, id: string) {
  const [a] = await tx`select * from channel_accounts where id = ${id}`; if (!a) throw notFound("Hesap");
  return { id: a.id as string, wabaId: a.wabaId as string, externalId: a.externalId as string, config: a.config as Record<string, any>, token: a.accessTokenEnc ? decrypt(a.accessTokenEnc) : "" };
}
function inboxScope(tx: Tx, c: Ctx) { return c.perms["inbox.use"] === "own" ? tx`and (cv.assignee_id = ${c.userId} or cv.assignee_id is null)` : tx``; }

/** Gelen mesajı işle (webhook ve testler aynı yolu kullanır) */
export async function ingestInbound(m: { phoneNumberId: string; from: string; name?: string; id: string; type: string; body?: string; media?: unknown; ts: number; referral?: any }) {
  const [acc] = await ownerSql`select * from channel_accounts where channel = 'whatsapp' and external_id = ${m.phoneNumberId}`;
  if (!acc) return null;
  return ownerSql.begin(async (tx0) => {
    const tx = tx0 as unknown as Tx;
    await tx`select set_config('app.clinic_id', ${acc.clinicId}, true)`;
    const echo = m.type.startsWith("echo_");
    let [cv] = await tx`select * from conversations where account_id = ${acc.id} and contact_id = ${m.from}`;
    if (!cv) {
      const phone = "+" + m.from.replace(/\D/g, "");
      const [p] = await tx`select id from patients where clinic_id = ${acc.clinicId} and (wa_id = ${m.from} or phone = ${phone}) limit 1`;
      let leadId: string | null = null, patientId: string | null = p?.id ?? null;
      if (patientId) [{ id: leadId } = { id: null }] = await tx`select id from leads where patient_id = ${patientId} order by created_at desc limit 1` as unknown as { id: string | null }[];
      else if (!echo) {
        const r = await createLead(tx, { clinicId: acc.clinicId, userId: null as unknown as string }, { fullName: m.name || phone, phone, source: m.referral ? "meta" : "whatsapp", temperature: "warm",
          campaign: m.referral?.headline ?? null, utm: m.referral ? { ctwa_clid: String(m.referral.ctwa_clid ?? ""), source_id: String(m.referral.source_id ?? "") } : undefined, ownerId: acc.config?.defaultAssignee ?? null } as never, { waId: m.from });
        leadId = r.leadId; patientId = r.patientId;
      }
      const [l] = leadId ? await tx`select owner_id from leads where id = ${leadId}` : [null];
      [cv] = await tx`insert into conversations (clinic_id, account_id, channel, contact_id, contact_name, patient_id, lead_id, assignee_id) values (${acc.clinicId}, ${acc.id}, 'whatsapp', ${m.from}, ${m.name ?? null}, ${patientId}, ${leadId}, ${l?.ownerId ?? acc.config?.defaultAssignee ?? null})
        on conflict (account_id, contact_id) do update set contact_name = coalesce(excluded.contact_name, conversations.contact_name) returning *`;
      if (patientId) await tx`update patients set wa_id = coalesce(wa_id, ${m.from}) where id = ${patientId}`;
    }
    const [msg] = await tx`insert into messages (clinic_id, conversation_id, direction, type, body, media, external_id, status, at) values (${acc.clinicId}, ${cv.id}, ${echo ? "out" : "in"}, ${m.type.replace("echo_", "")}, ${m.body ?? null}, ${m.media ? tx.json(m.media as never) : null}, ${m.id}, ${echo ? "sent" : "received"}, ${new Date(m.ts)})
      on conflict (conversation_id, external_id) do nothing returning id`;
    if (!msg) return { duplicate: true };
    await tx`update conversations set last_message_at = ${new Date(m.ts)}, last_preview = ${(m.body ?? "[" + m.type + "]").slice(0, 120)},
      ${echo ? tx`` : tx`last_inbound_at = ${new Date(m.ts)}, unread = unread + 1, status = 'open',`} contact_name = coalesce(contact_name, ${m.name ?? null}) where id = ${cv.id}`;
    await tx`update channel_accounts set last_webhook_at = now(), status = 'connected' where id = ${acc.id}`;
    if (cv.leadId && !echo) {
      await tx`insert into lead_events (clinic_id, lead_id, type, body, data) values (${acc.clinicId}, ${cv.leadId}, 'whatsapp', ${(m.body ?? "[" + m.type + "]").slice(0, 500)}, ${tx.json({ direction: "in", conversationId: cv.id } as never)})`;
      await tx`update leads set last_activity_at = now() where id = ${cv.leadId}`;
    }
    if (!echo) await emit(tx, acc.clinicId, "wa.message", cv.id, { conversationId: cv.id, leadId: cv.leadId, name: cv.contactName ?? m.name ?? m.from, ownerId: cv.assigneeId, link: "/inbox/" + cv.id, preview: (m.body ?? "").slice(0, 80) });
    // mesai dışı otomatik yanıt (bir kez / 12 saat)
    const ar = acc.config?.autoReply as { enabled?: boolean; text?: string } | undefined;
    if (!echo && ar?.enabled && ar.text) await tx`insert into jobs (clinic_id, type, payload, dedupe_key) values (${acc.clinicId}, 'wa.autoreply', ${tx.json({ conversationId: cv.id } as never)}, ${"ar:" + cv.id + ":" + new Date().toISOString().slice(0, 13).slice(0, 12)}) on conflict do nothing`;
    return { conversationId: cv.id };
  });
}

export function inboxRoutes(app: FastifyInstance) {
  // ── Meta webhook ──
  app.get("/api/public/wa/webhook", async (req, reply) => {
    const q = req.query as Record<string, string>;
    if (q["hub.mode"] === "subscribe" && q["hub.verify_token"] && q["hub.verify_token"] === meta.verifyToken) return reply.type("text/plain").send(q["hub.challenge"]);
    return reply.status(403).send("forbidden");
  });
  app.post("/api/public/wa/webhook", async (req, reply) => {
    const raw = (req as any).rawBody as string;
    if (!verifyMetaSignature(raw, req.headers["x-hub-signature-256"] as string)) return reply.status(401).send({ error: "bad_signature" });
    const { messages, statuses } = parseWebhook(req.body);
    for (const m of messages) await ingestInbound(m).catch((e) => req.log.error(e));
    for (const s of statuses) await ownerSql`update messages set status = ${s.status}, error = ${s.error ?? null} where external_id = ${s.id} and status not in ('read')`.catch(() => {});
    return { ok: true };
  });

  // ── Hesap bağlama ──
  app.get("/api/inbox/config", async (req) => { ctx(req); return { appId: meta.appId, configId: meta.configId, ready: !!(meta.appId && meta.appSecret && meta.configId), webhookUrl: `${config.appUrl}/api/public/wa/webhook` }; });
  app.post("/api/inbox/accounts/embedded-signup", async (req) => {
    const c = need(ctx(req), "integrations.manage");
    const b = parse(z.object({ code: z.string(), phoneNumberId: z.string(), wabaId: z.string(), coexistence: z.boolean().default(false), pin: z.string().regex(/^\d{6}$/).optional() }), req.body);
    const token = await wa.exchangeCode(b.code);
    await wa.subscribeApp(token, b.wabaId);
    if (!b.coexistence && b.pin) await wa.register(token, b.phoneNumberId, b.pin).catch(() => {}); // coexistence numaraları kayıt gerektirmez
    const info = await wa.phoneInfo(token, b.phoneNumberId).catch(() => ({} as any));
    return saveAccount(c, { phoneNumberId: b.phoneNumberId, wabaId: b.wabaId, token, name: info.verified_name ?? "WhatsApp", phone: info.display_phone_number ?? null, coexistence: b.coexistence });
  });
  app.post("/api/inbox/accounts/manual", async (req) => {
    const c = need(ctx(req), "integrations.manage");
    const b = parse(z.object({ phoneNumberId: z.string().min(5), wabaId: z.string().min(5), token: z.string().min(20), name: z.string().max(80).optional() }), req.body);
    let info: any = {}; try { info = await wa.phoneInfo(b.token, b.phoneNumberId); await wa.subscribeApp(b.token, b.wabaId); } catch (e) { throw new HttpError(400, "meta_error", (e as Error).message); }
    return saveAccount(c, { phoneNumberId: b.phoneNumberId, wabaId: b.wabaId, token: b.token, name: b.name ?? info.verified_name ?? "WhatsApp", phone: info.display_phone_number ?? null, coexistence: info.platform_type === "CLOUD_API" ? false : true });
  });
  async function saveAccount(c: Ctx, a: { phoneNumberId: string; wabaId: string; token: string; name: string; phone: string | null; coexistence: boolean }) {
    return withClinic(c.clinicId, async (tx) => {
      const [r] = await tx`insert into channel_accounts (clinic_id, channel, name, external_id, waba_id, phone, access_token_enc, config, status)
        values (${c.clinicId}, 'whatsapp', ${a.name}, ${a.phoneNumberId}, ${a.wabaId}, ${a.phone}, ${encrypt(a.token)}, ${tx.json({ coexistence: a.coexistence } as never)}, 'connected')
        on conflict (channel, external_id) do update set access_token_enc = excluded.access_token_enc, waba_id = excluded.waba_id, name = excluded.name, status = 'connected' returning id`;
      await audit(tx, c, "inbox.account.connect", "channel_account", r!.id, { phone: a.phone, coexistence: a.coexistence });
      return r;
    });
  }
  app.get("/api/inbox/accounts", async (req) => { const c = need(ctx(req), "inbox.use"); return withClinic(c.clinicId, (tx) => tx`select id, channel, name, phone, external_id, waba_id, config, status, last_error, last_webhook_at, created_at from channel_accounts where clinic_id = ${c.clinicId} order by created_at`); });
  app.patch("/api/inbox/accounts/:id", async (req) => {
    const c = need(ctx(req), "integrations.manage"); const { id } = req.params as { id: string };
    const b = parsePatch(z.object({ name: z.string().max(80), config: z.record(z.string(), z.unknown()), status: z.enum(["connected", "disconnected"]) }).partial(), req.body);
    await withClinic(c.clinicId, async (tx) => { if (b.name) await tx`update channel_accounts set name = ${b.name} where id = ${id}`; if (b.config) await tx`update channel_accounts set config = config || ${tx.json(b.config as never)} where id = ${id}`; if (b.status) await tx`update channel_accounts set status = ${b.status} where id = ${id}`; });
    return { ok: true };
  });

  // ── Konuşmalar ──
  app.get("/api/inbox/conversations", async (req) => {
    const c = need(ctx(req), "inbox.use");
    const q = parse(z.object({ filter: z.enum(["all", "mine", "unassigned", "starred", "closed"]).default("all"), q: z.string().max(80).optional() }), req.query);
    return withClinic(c.clinicId, (tx) => tx`
      select cv.*, a.name as account_name, a.phone as account_phone, u.name as assignee_name, l.number as lead_number, l.stage as lead_stage
      from conversations cv join channel_accounts a on a.id = cv.account_id left join users u on u.id = cv.assignee_id left join leads l on l.id = cv.lead_id
      where cv.clinic_id = ${c.clinicId} ${inboxScope(tx, c)}
        ${q.filter === "mine" ? tx`and cv.assignee_id = ${c.userId}` : q.filter === "unassigned" ? tx`and cv.assignee_id is null` : q.filter === "starred" ? tx`and cv.starred` : q.filter === "closed" ? tx`and cv.status = 'closed'` : tx`and cv.status <> 'closed'`}
        ${q.q ? tx`and (cv.contact_name ilike ${"%" + q.q + "%"} or cv.contact_id like ${"%" + q.q.replace(/\D/g, "") + "%"})` : tx``}
      order by cv.last_message_at desc nulls last limit 200`);
  });
  app.get("/api/inbox/unread", async (req) => { const c = ctx(req); if (!c.perms["inbox.use"]) return { n: 0 }; const [r] = await withClinic(c.clinicId, (tx) => tx`select coalesce(sum(unread),0)::int as n from conversations cv where cv.clinic_id = ${c.clinicId} ${inboxScope(tx, c)}`); return r; });
  app.get("/api/inbox/conversations/:id", async (req) => {
    const c = need(ctx(req), "inbox.use"); const { id } = req.params as { id: string };
    return withClinic(c.clinicId, async (tx) => {
      const [cv] = await tx`select cv.*, a.name as account_name from conversations cv join channel_accounts a on a.id = cv.account_id where cv.id = ${id} ${inboxScope(tx, c)}`; if (!cv) throw notFound("Konuşma");
      const msgs = await tx`select m.id, m.direction, m.type, m.body, m.media, m.template, m.status, m.error, m.at, u.name as user_name from messages m left join users u on u.id = m.user_id where m.conversation_id = ${id} order by m.id desc limit 200`;
      if (cv.unread) await tx`update conversations set unread = 0 where id = ${id}`;
      return { conversation: { ...cv, windowOpen: inWindow(cv.lastInboundAt) }, messages: msgs.reverse() };
    });
  });
  app.patch("/api/inbox/conversations/:id", async (req) => {
    const c = need(ctx(req), "inbox.use"); const { id } = req.params as { id: string };
    const b = parsePatch(z.object({ assigneeId: z.uuid().nullable(), status: z.enum(["open", "pending", "closed"]), starred: z.boolean(), leadId: z.uuid().nullable() }).partial(), req.body);
    return withClinic(c.clinicId, async (tx) => {
      const set: Record<string, unknown> = {}; for (const [k, col] of Object.entries({ assigneeId: "assignee_id", status: "status", starred: "starred", leadId: "lead_id" })) if ((b as any)[k] !== undefined) set[col] = (b as any)[k];
      if (b.leadId) { const [l] = await tx`select patient_id from leads where id = ${b.leadId}`; if (l) set.patient_id = l.patientId; }
      await tx`update conversations set ${tx(set as never)} where id = ${id}`;
      if (b.assigneeId && b.assigneeId !== c.userId) await tx`insert into notifications (clinic_id, user_id, type, title, link) values (${c.clinicId}, ${b.assigneeId}, 'inbox.assigned', 'WhatsApp konuşması size atandı', ${"/inbox/" + id})`;
      return { ok: true };
    });
  });
  app.post("/api/inbox/conversations/:id/messages", async (req) => {
    const c = need(ctx(req), "inbox.use"); const { id } = req.params as { id: string };
    const b = parse(z.object({ body: z.string().trim().min(1).max(4096), idempotencyKey: z.string().max(80) }), req.body);
    return sendInConversation(c, id, { kind: "text", body: b.body, idem: b.idempotencyKey });
  });
  app.post("/api/inbox/conversations/:id/template", async (req) => {
    const c = need(ctx(req), "inbox.use"); const { id } = req.params as { id: string };
    const b = parse(z.object({ name: z.string(), language: z.string(), params: z.array(z.string()).default([]), buttonParam: z.string().optional(), idempotencyKey: z.string().max(80) }), req.body);
    return sendInConversation(c, id, { kind: "template", template: b, idem: b.idempotencyKey });
  });
  app.post("/api/inbox/conversations/:id/note", async (req) => {
    const c = need(ctx(req), "inbox.use"); const { id } = req.params as { id: string };
    const { body } = parse(z.object({ body: z.string().trim().min(1).max(4000) }), req.body);
    return withClinic(c.clinicId, async (tx) => { const [m] = await tx`insert into messages (clinic_id, conversation_id, direction, type, body, status, user_id) values (${c.clinicId}, ${id}, 'note', 'text', ${body}, 'sent', ${c.userId}) returning id, at`; return m; });
  });
  // Lead kartından konuşma başlat (pencere kapalıysa şablon gerekir)
  app.post("/api/inbox/start", async (req) => {
    const c = need(ctx(req), "inbox.use");
    const { leadId, accountId } = parse(z.object({ leadId: z.uuid(), accountId: z.uuid().optional() }), req.body);
    return withClinic(c.clinicId, async (tx) => {
      const [l] = await tx`select l.id, l.owner_id, p.id as patient_id, p.phone, p.full_name, p.wa_id from leads l join patients p on p.id = l.patient_id where l.id = ${leadId}`; if (!l?.phone && !l?.waId) throw new HttpError(400, "no_phone", "Telefon yok");
      const [a] = accountId ? await tx`select id from channel_accounts where id = ${accountId}` : await tx`select id from channel_accounts where clinic_id = ${c.clinicId} and channel = 'whatsapp' and status = 'connected' order by created_at limit 1`;
      if (!a) throw new HttpError(400, "no_account", "Bağlı WhatsApp numarası yok");
      const contact = l.waId ?? String(l.phone).replace(/\D/g, "");
      const [cv] = await tx`insert into conversations (clinic_id, account_id, channel, contact_id, contact_name, patient_id, lead_id, assignee_id) values (${c.clinicId}, ${a.id}, 'whatsapp', ${contact}, ${l.fullName}, ${l.patientId}, ${l.id}, ${l.ownerId ?? c.userId})
        on conflict (account_id, contact_id) do update set lead_id = coalesce(conversations.lead_id, excluded.lead_id) returning id`;
      return cv;
    });
  });
  // Teklifi WhatsApp'tan gönder
  app.post("/api/quotes/:id/whatsapp", async (req) => {
    const c = need(ctx(req), "quote.send"); const { id } = req.params as { id: string };
    const b = parse(z.object({ text: z.string().max(4096), templateName: z.string().optional(), language: z.string().optional() }), req.body);
    const conv = await withClinic(c.clinicId, async (tx) => { const [q] = await tx`select lead_id from quotes where id = ${id}`; if (!q) throw notFound("Teklif"); return q.leadId as string; });
    const started = await withClinic(c.clinicId, async (tx) => {
      const [l] = await tx`select l.id, l.owner_id, p.id as patient_id, p.phone, p.full_name, p.wa_id from leads l join patients p on p.id = l.patient_id where l.id = ${conv}`;
      const [a] = await tx`select id from channel_accounts where clinic_id = ${c.clinicId} and channel = 'whatsapp' and status = 'connected' order by created_at limit 1`;
      if (!a) throw new HttpError(400, "no_account", "Bağlı WhatsApp numarası yok");
      const contact = l!.waId ?? String(l!.phone).replace(/\D/g, "");
      const [x] = await tx`insert into conversations (clinic_id, account_id, channel, contact_id, contact_name, patient_id, lead_id, assignee_id) values (${c.clinicId}, ${a.id}, 'whatsapp', ${contact}, ${l!.fullName}, ${l!.patientId}, ${l!.id}, ${l!.ownerId ?? c.userId})
        on conflict (account_id, contact_id) do update set lead_id = coalesce(conversations.lead_id, excluded.lead_id) returning id, last_inbound_at`;
      return x!;
    });
    const r = inWindow(started.lastInboundAt) || !b.templateName
      ? await sendInConversation(c, started.id, { kind: "text", body: b.text, idem: "q:" + id + ":" + Date.now() })
      : await sendInConversation(c, started.id, { kind: "template", template: { name: b.templateName, language: b.language ?? "en", params: [b.text] }, idem: "qt:" + id + ":" + Date.now() });
    await withClinic(c.clinicId, (tx) => tx`update quotes set sent_via = array(select distinct unnest(sent_via || '{whatsapp}'::text[])) where id = ${id}`);
    return { ...r, conversationId: started.id };
  });

  // ── Şablonlar ve hazır yanıtlar ──
  app.get("/api/inbox/templates", async (req) => { const c = need(ctx(req), "inbox.use"); return withClinic(c.clinicId, (tx) => tx`select * from message_templates where clinic_id = ${c.clinicId} order by name`); });
  app.post("/api/inbox/templates/sync", async (req) => {
    const c = need(ctx(req), "integrations.manage");
    return withClinic(c.clinicId, async (tx) => {
      const accs = await tx`select * from channel_accounts where clinic_id = ${c.clinicId} and channel = 'whatsapp' and waba_id is not null`;
      let n = 0;
      for (const a of accs) { const tpl = await wa.templates(decrypt(a.accessTokenEnc), a.wabaId).catch(() => ({ data: [] }));
        for (const t of tpl.data ?? []) { n++; await tx`insert into message_templates (clinic_id, account_id, name, language, category, components, status, external_id) values (${c.clinicId}, ${a.id}, ${t.name}, ${t.language}, ${t.category}, ${tx.json(t.components as never)}, ${t.status}, ${t.id})
          on conflict (clinic_id, name, language) do update set components = excluded.components, status = excluded.status, category = excluded.category, external_id = excluded.external_id, updated_at = now()`; } }
      return { synced: n };
    });
  });
  app.post("/api/inbox/templates", async (req) => {
    const c = need(ctx(req), "integrations.manage");
    const b = parse(z.object({ accountId: z.uuid(), name: z.string().regex(/^[a-z0-9_]{1,512}$/), language: z.string(), category: z.enum(["UTILITY", "MARKETING", "AUTHENTICATION"]), body: z.string().min(1).max(1024), buttonUrl: z.string().url().optional() }), req.body);
    return withClinic(c.clinicId, async (tx) => {
      const a = await account(tx, b.accountId);
      const components: unknown[] = [{ type: "BODY", text: b.body, ...(b.body.includes("{{1}}") ? { example: { body_text: [["Example"]] } } : {}) }];
      if (b.buttonUrl) components.push({ type: "BUTTONS", buttons: [{ type: "URL", text: "Open", url: b.buttonUrl.includes("{{1}}") ? b.buttonUrl : b.buttonUrl, ...(b.buttonUrl.includes("{{1}}") ? { example: ["abc"] } : {}) }] });
      const r = await wa.createTemplate(a.token, a.wabaId, { name: b.name, language: b.language, category: b.category, components });
      await tx`insert into message_templates (clinic_id, account_id, name, language, category, components, status, external_id) values (${c.clinicId}, ${a.id}, ${b.name}, ${b.language}, ${b.category}, ${tx.json(components as never)}, ${r.status ?? "PENDING"}, ${r.id})
        on conflict (clinic_id, name, language) do update set components = excluded.components, status = excluded.status`;
      return { ok: true, status: r.status };
    });
  });
  app.get("/api/inbox/canned", async (req) => { const c = need(ctx(req), "inbox.use"); return withClinic(c.clinicId, (tx) => tx`select * from canned_replies where clinic_id = ${c.clinicId} order by title`); });
  app.put("/api/inbox/canned/:id", async (req) => {
    const c = need(ctx(req), "inbox.use"); const { id } = req.params as { id: string };
    const b = parse(z.object({ title: z.string().min(1).max(80), body: z.string().min(1).max(4000), language: z.string().max(5).nullable().optional(), shortcut: z.string().max(20).nullable().optional() }), req.body);
    return withClinic(c.clinicId, async (tx) => id === "new"
      ? (await tx`insert into canned_replies (clinic_id, title, body, language, shortcut) values (${c.clinicId}, ${b.title}, ${b.body}, ${b.language ?? null}, ${b.shortcut ?? null}) returning id`)[0]
      : (await tx`update canned_replies set title = ${b.title}, body = ${b.body}, language = ${b.language ?? null}, shortcut = ${b.shortcut ?? null} where id = ${id} returning id`)[0]);
  });
  app.delete("/api/inbox/canned/:id", async (req) => { const c = need(ctx(req), "inbox.use"); const { id } = req.params as { id: string }; await withClinic(c.clinicId, (tx) => tx`delete from canned_replies where id = ${id}`); return { ok: true }; });
}

export async function sendInConversation(c: Pick<Ctx, "clinicId" | "userId">, conversationId: string, m: { kind: "text"; body: string; idem: string } | { kind: "template"; template: { name: string; language: string; params: string[]; buttonParam?: string }; idem: string }) {
  return withClinic(c.clinicId, async (tx) => {
    const [cv] = await tx`select * from conversations where id = ${conversationId}`; if (!cv) throw notFound("Konuşma");
    if (m.kind === "text" && !inWindow(cv.lastInboundAt)) throw new HttpError(409, "window_closed", "24 saatlik pencere kapalı — onaylı şablon gönderin");
    const [dup] = await tx`select id, status from messages where conversation_id = ${conversationId} and idempotency_key = ${m.idem}`; if (dup) return { id: dup.id, status: dup.status, duplicate: true };
    const a = await account(tx, cv.accountId);
    const [row] = await tx`insert into messages (clinic_id, conversation_id, direction, type, body, template, status, user_id, idempotency_key) values (${c.clinicId}, ${conversationId}, 'out', ${m.kind}, ${m.kind === "text" ? m.body : m.template.params.join(" · ")}, ${m.kind === "template" ? tx.json(m.template as never) : null}, 'queued', ${c.userId}, ${m.idem}) returning id`;
    try {
      const r = m.kind === "text" ? await wa.sendText(a.token, a.externalId, cv.contactId, m.body) : await wa.sendTemplate(a.token, a.externalId, cv.contactId, m.template.name, m.template.language, m.template.params, m.template.buttonParam);
      await tx`update messages set status = 'sent', external_id = ${r.messages?.[0]?.id ?? null} where id = ${row!.id}`;
    } catch (e) {
      await tx`update messages set status = 'failed', error = ${(e as Error).message} where id = ${row!.id}`;
      if ((e as WaError).code === 190) await tx`update channel_accounts set status = 'error', last_error = ${(e as Error).message} where id = ${a.id}`;
      throw new HttpError(502, "wa_failed", (e as Error).message);
    }
    const preview = m.kind === "text" ? m.body : `[${m.template.name}]`;
    await tx`update conversations set last_message_at = now(), last_preview = ${preview.slice(0, 120)}, status = 'open' where id = ${conversationId}`;
    if (cv.leadId) { await tx`insert into lead_events (clinic_id, lead_id, type, body, data, user_id) values (${c.clinicId}, ${cv.leadId}, 'whatsapp', ${preview.slice(0, 500)}, ${tx.json({ direction: "out" } as never)}, ${c.userId})`;
      await tx`update leads set last_activity_at = now(), contact_attempts = contact_attempts + 1, first_response_at = coalesce(first_response_at, now()), stage = case when stage = 'new' then 'contacted' else stage end where id = ${cv.leadId}`; }
    return { id: row!.id, status: "sent" };
  });
}
