import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { withClinic, ownerSql, type Tx } from "../db.ts";
import { config, meta } from "../config.ts";
import { ctx, need, parse, notFound, HttpError, type Ctx } from "../http.ts";
import { audit } from "../services/audit.ts";
import { randomToken, sha256, encrypt, decrypt } from "../lib/crypto.ts";
import { mapToLead } from "../services/mapping.ts";
import { verifyMetaSignature } from "../services/whatsapp.ts";
import { signPayload } from "../services/webhooks.ts";
import { createLead } from "./leads.ts";

const SCOPES = ["leads:write", "leads:read", "cases:read", "deals:read", "webhooks:manage"] as const;

/** Dış kaynaktan gelen kaydı lead'e çevir (idempotent: source + externalId) */
export async function ingestLead(clinicId: string, source: string, externalId: string | null, payload: Record<string, any>, opts: { fieldMap?: Record<string, string>; defaults?: Record<string, any> } = {}) {
  return ownerSql.begin(async (tx0) => {
    const tx = tx0 as unknown as Tx;
    await tx`select set_config('app.clinic_id', ${clinicId}, true)`;
    if (externalId) { const [ex] = await tx`select id, result from inbound_events where clinic_id = ${clinicId} and source = ${source} and external_id = ${externalId}`; if (ex) return { duplicate: true, ...(ex.result ?? {}) }; }
    const m = mapToLead(payload, opts.fieldMap);
    const [ev] = await tx`insert into inbound_events (clinic_id, source, external_id, payload) values (${clinicId}, ${source}, ${externalId}, ${tx.json(payload as never)}) returning id`;
    if (!m.fullName && !m.phone && !m.email) { await tx`update inbound_events set status = 'skipped', error = 'no contact fields' where id = ${ev!.id}`; return { skipped: true }; }
    const r = await createLead(tx, { clinicId, userId: null as unknown as string }, { fullName: m.fullName || m.phone || m.email!, phone: m.phone ?? null, email: m.email || null, country: m.country ?? opts.defaults?.country ?? null,
      city: m.city ?? null, language: m.language ?? opts.defaults?.language ?? null, interest: m.interest ?? null, issue: m.issue ?? null, campaign: m.campaign ?? opts.defaults?.campaign ?? null, budget: m.budget ?? null,
      travelWindow: m.travelWindow ?? null, source: opts.defaults?.source ?? source, temperature: "warm", ownerId: opts.defaults?.ownerId ?? null, externalIds: externalId ? { [source]: externalId } : undefined } as never, { dedupe: "attach" });
    await tx`update inbound_events set status = 'processed', result = ${tx.json(r as never)} where id = ${ev!.id}`;
    return r;
  });
}

async function apiKeyCtx(req: FastifyRequest, scope: string) {
  const h = req.headers.authorization ?? ""; const key = h.startsWith("Bearer ") ? h.slice(7) : (req.headers["x-api-key"] as string | undefined);
  if (!key) throw new HttpError(401, "unauthorized", "API anahtarı gerekli (Authorization: Bearer …)");
  const [k] = await ownerSql`update api_keys set last_used_at = now() where key_hash = ${sha256(key)} and revoked_at is null returning id, clinic_id, scopes`;
  if (!k) throw new HttpError(401, "unauthorized", "Geçersiz API anahtarı");
  if (!k.scopes.includes(scope)) throw new HttpError(403, "forbidden", `Kapsam gerekli: ${scope}`);
  return k as { id: string; clinicId: string; scopes: string[] };
}

export function integrationRoutes(app: FastifyInstance) {
  // ── API anahtarları ──
  app.get("/api/integrations/api-keys", async (req) => { const c = need(ctx(req), "integrations.manage"); return withClinic(c.clinicId, (tx) => tx`select id, name, prefix, scopes, last_used_at, revoked_at, created_at from api_keys where clinic_id = ${c.clinicId} order by created_at desc`); });
  app.post("/api/integrations/api-keys", async (req) => {
    const c = need(ctx(req), "integrations.manage");
    const b = parse(z.object({ name: z.string().min(1).max(80), scopes: z.array(z.enum(SCOPES)).min(1) }), req.body);
    const key = "df_" + randomToken(24);
    await withClinic(c.clinicId, async (tx) => { await tx`insert into api_keys (clinic_id, name, prefix, key_hash, scopes, created_by) values (${c.clinicId}, ${b.name}, ${key.slice(0, 10)}, ${sha256(key)}, ${b.scopes}, ${c.userId})`; await audit(tx, c, "apikey.create", "api_key", null, { name: b.name, scopes: b.scopes }); });
    return { key }; // yalnızca bir kez gösterilir
  });
  app.delete("/api/integrations/api-keys/:id", async (req) => { const c = need(ctx(req), "integrations.manage"); const { id } = req.params as { id: string }; await withClinic(c.clinicId, async (tx) => { await tx`update api_keys set revoked_at = now() where id = ${id}`; await audit(tx, c, "apikey.revoke", "api_key", id); }); return { ok: true }; });

  // ── Genel REST API (v1) ──
  app.post("/api/v1/leads", async (req) => {
    const k = await apiKeyCtx(req, "leads:write");
    const body = req.body as Record<string, any>;
    const ext = (req.headers["idempotency-key"] as string | undefined) ?? body.externalId ?? null;
    const r = await ingestLead(k.clinicId, body.source ?? "api", ext, body, { defaults: { source: body.source ?? "api", campaign: body.campaign } });
    return r;
  });
  app.get("/api/v1/leads", async (req) => {
    const k = await apiKeyCtx(req, "leads:read");
    const q = parse(z.object({ since: z.iso.datetime().optional(), limit: z.coerce.number().max(500).default(100) }), req.query);
    return ownerSql`select l.id, l.number, l.stage, l.source, l.campaign, l.created_at, l.updated_at, p.full_name, p.phone, p.email, p.country from leads l join patients p on p.id = l.patient_id
      where l.clinic_id = ${k.clinicId} ${q.since ? ownerSql`and l.updated_at > ${q.since}` : ownerSql``} order by l.updated_at desc limit ${q.limit}`;
  });
  app.get("/api/v1/deals", async (req) => {
    const k = await apiKeyCtx(req, "deals:read");
    return ownerSql`select d.id, d.number, d.title, d.currency, d.value_minor, d.stage, d.status, d.created_at, d.lead_id from deals d where d.clinic_id = ${k.clinicId} order by d.created_at desc limit 500`;
  });

  // ── Giden webhook'lar ──
  app.get("/api/integrations/webhooks", async (req) => {
    const c = need(ctx(req), "integrations.manage");
    return withClinic(c.clinicId, async (tx) => ({ endpoints: await tx`select id, url, events, active, failures, last_status, last_at, created_at from webhook_endpoints where clinic_id = ${c.clinicId}`,
      deliveries: await tx`select id, endpoint_id, event_type, status, duration_ms, at from webhook_deliveries where clinic_id = ${c.clinicId} order by id desc limit 50`,
      events: ["lead.created", "lead.stage", "lead.assigned", "case.created", "case.diagnosed", "quote.sent", "quote.viewed", "quote.accepted", "quote.changes", "quote.declined", "deal.created", "deal.stage", "payment.succeeded", "visit.scheduled", "visit.arrived", "wa.message"] }));
  });
  app.post("/api/integrations/webhooks", async (req) => {
    const c = need(ctx(req), "integrations.manage");
    const b = parse(z.object({ url: z.url().refine((u) => u.startsWith("https://") || !config.isProd, "HTTPS gerekli"), events: z.array(z.string()).min(1) }), req.body);
    const secret = "whsec_" + randomToken(24);
    await withClinic(c.clinicId, async (tx) => { await tx`insert into webhook_endpoints (clinic_id, url, events, secret) values (${c.clinicId}, ${b.url}, ${b.events}, ${secret})`; await audit(tx, c, "webhook.create", "webhook", null, b); });
    return { secret };
  });
  app.patch("/api/integrations/webhooks/:id", async (req) => { const c = need(ctx(req), "integrations.manage"); const { id } = req.params as { id: string }; const b = parse(z.object({ active: z.boolean(), events: z.array(z.string()) }).partial(), req.body);
    await withClinic(c.clinicId, async (tx) => { if (b.active !== undefined) await tx`update webhook_endpoints set active = ${b.active}, failures = 0 where id = ${id}`; if (b.events) await tx`update webhook_endpoints set events = ${b.events} where id = ${id}`; }); return { ok: true }; });
  app.delete("/api/integrations/webhooks/:id", async (req) => { const c = need(ctx(req), "integrations.manage"); const { id } = req.params as { id: string }; await withClinic(c.clinicId, (tx) => tx`delete from webhook_endpoints where id = ${id}`); return { ok: true }; });
  app.post("/api/integrations/webhooks/:id/test", async (req) => {
    const c = need(ctx(req), "integrations.manage"); const { id } = req.params as { id: string };
    const [ep] = await withClinic(c.clinicId, (tx) => tx`select url, secret from webhook_endpoints where id = ${id}`); if (!ep) throw notFound("Webhook");
    const body = JSON.stringify({ id: "test", type: "test.ping", created: new Date().toISOString(), data: { hello: "DentaFlow" } }), ts = Math.floor(Date.now() / 1000);
    try { const r = await fetch(ep.url, { method: "POST", headers: { "Content-Type": "application/json", "X-DentaFlow-Event": "test.ping", "X-DentaFlow-Signature": `t=${ts},v1=${signPayload(ep.secret, ts, body)}` }, body, signal: AbortSignal.timeout(10000) }); return { status: r.status }; }
    catch (e) { return { status: 0, error: (e as Error).message }; }
  });

  // ── Entegrasyonlar (gelen veri kaynakları) ──
  app.get("/api/integrations", async (req) => {
    const c = need(ctx(req), "integrations.manage");
    const rows = await withClinic(c.clinicId, (tx) => tx`select id, kind, name, config, status, inbound_token, last_sync_at, last_error, stats, created_at from integrations where clinic_id = ${c.clinicId} order by created_at`);
    return { items: rows.map((r) => ({ ...r, inboundUrl: r.inboundToken ? `${config.appUrl}/api/public/in/${r.kind}/${r.inboundToken}` : null })), meta: { appId: meta.appId, ready: !!(meta.appId && meta.appSecret) } };
  });
  app.post("/api/integrations", async (req) => {
    const c = need(ctx(req), "integrations.manage");
    const b = parse(z.object({ kind: z.enum(["inbound_webhook", "google_leads", "tiktok_leads", "meta_leads", "ghl", "zoho", "hubspot", "typeform", "wordpress"]), name: z.string().min(1).max(80), config: z.record(z.string(), z.unknown()).default({}) }), req.body);
    const token = randomToken(18);
    const [r] = await withClinic(c.clinicId, async (tx) => { const x = await tx`insert into integrations (clinic_id, kind, name, config, inbound_token) values (${c.clinicId}, ${b.kind}, ${b.name}, ${tx.json(b.config as never)}, ${token}) returning id`; await audit(tx, c, "integration.create", "integration", x[0]!.id, { kind: b.kind }); return x; });
    return { id: r!.id, inboundUrl: `${config.appUrl}/api/public/in/${b.kind}/${token}`, googleKey: b.kind === "google_leads" ? token : undefined };
  });
  app.patch("/api/integrations/:id", async (req) => {
    const c = need(ctx(req), "integrations.manage"); const { id } = req.params as { id: string };
    const b = parse(z.object({ name: z.string().max(80), config: z.record(z.string(), z.unknown()), status: z.enum(["configured", "connected", "healthy", "error", "disabled"]) }).partial(), req.body);
    await withClinic(c.clinicId, async (tx) => { if (b.name) await tx`update integrations set name = ${b.name} where id = ${id}`; if (b.config) await tx`update integrations set config = config || ${tx.json(b.config as never)} where id = ${id}`; if (b.status) await tx`update integrations set status = ${b.status} where id = ${id}`; });
    return { ok: true };
  });
  app.delete("/api/integrations/:id", async (req) => { const c = need(ctx(req), "integrations.manage"); const { id } = req.params as { id: string }; await withClinic(c.clinicId, (tx) => tx`delete from integrations where id = ${id}`); return { ok: true }; });

  // Genel gelen webhook (Zapier, Make, WordPress formları, Typeform, GHL, Zoho, HubSpot, TikTok, Google Ads…)
  app.post("/api/public/in/:kind/:token", async (req) => {
    const { kind, token } = req.params as { kind: string; token: string };
    const [ig] = await ownerSql`select * from integrations where inbound_token = ${token} and kind = ${kind} and status <> 'disabled'`;
    if (!ig) throw new HttpError(404, "not_found");
    const body = (req.body ?? {}) as Record<string, any>;
    if (kind === "google_leads" && body.google_key !== token && body.google_key !== ig.config?.googleKey) throw new HttpError(401, "bad_key");
    const ext = String(body.lead_id ?? body.leadgen_id ?? body.id ?? body.entry_id ?? (req.headers["idempotency-key"] ?? "")) || null;
    const source = ({ google_leads: "google", tiktok_leads: "tiktok", meta_leads: "meta", ghl: "ghl", zoho: "zoho", hubspot: "hubspot", typeform: "website", wordpress: "website" } as Record<string, string>)[kind] ?? "api";
    const r = await ingestLead(ig.clinicId, source, ext, body, { fieldMap: ig.config?.fieldMap, defaults: { source, campaign: body.campaign_name ?? body.campaign ?? ig.config?.campaign, ownerId: ig.config?.ownerId, country: ig.config?.country, language: ig.config?.language } });
    await ownerSql`update integrations set last_sync_at = now(), status = 'healthy', last_error = null, stats = jsonb_set(stats, '{received}', to_jsonb(coalesce((stats->>'received')::int, 0) + 1)) where id = ${ig.id}`;
    return { ok: true, ...r };
  });

  // Meta Lead Ads: sayfa bağlama + leadgen webhook
  app.post("/api/integrations/meta/pages", async (req) => {
    need(ctx(req), "integrations.manage");
    const { userToken } = parse(z.object({ userToken: z.string() }), req.body);
    const ll = await (await fetch(`${meta.graph}/oauth/access_token?grant_type=fb_exchange_token&client_id=${meta.appId}&client_secret=${meta.appSecret}&fb_exchange_token=${userToken}`)).json() as any;
    const r = await (await fetch(`${meta.graph}/me/accounts?fields=id,name,access_token&access_token=${ll.access_token ?? userToken}`)).json() as any;
    if (r.error) throw new HttpError(400, "meta_error", r.error.message);
    return (r.data ?? []).map((p: any) => ({ id: p.id, name: p.name, token: encrypt(p.access_token) }));
  });
  app.post("/api/integrations/meta/connect", async (req) => {
    const c = need(ctx(req), "integrations.manage");
    const b = parse(z.object({ pageId: z.string(), pageName: z.string(), tokenEnc: z.string(), ownerId: z.uuid().nullable().optional() }), req.body);
    const pageToken = decrypt(b.tokenEnc);
    const s = await (await fetch(`${meta.graph}/${b.pageId}/subscribed_apps?subscribed_fields=leadgen&access_token=${pageToken}`, { method: "POST" })).json() as any;
    if (s.error) throw new HttpError(400, "meta_error", s.error.message);
    const [r] = await withClinic(c.clinicId, (tx) => tx`insert into integrations (clinic_id, kind, name, credentials_enc, config, status) values (${c.clinicId}, 'meta_leads', ${b.pageName}, ${encrypt(pageToken)}, ${tx.json({ pageId: b.pageId, ownerId: b.ownerId ?? null } as never)}, 'connected') returning id`);
    return r;
  });
  app.get("/api/public/meta/leads", async (req, reply) => { const q = req.query as Record<string, string>; return q["hub.verify_token"] === meta.verifyToken ? reply.type("text/plain").send(q["hub.challenge"]) : reply.status(403).send("forbidden"); });
  app.post("/api/public/meta/leads", async (req, reply) => {
    if (!verifyMetaSignature((req as any).rawBody, req.headers["x-hub-signature-256"] as string)) return reply.status(401).send({ error: "bad_signature" });
    for (const e of (req.body as any)?.entry ?? []) for (const ch of e.changes ?? []) {
      if (ch.field !== "leadgen") continue;
      const v = ch.value; const [ig] = await ownerSql`select * from integrations where kind = 'meta_leads' and config->>'pageId' = ${String(v.page_id)} and status <> 'disabled' limit 1`; if (!ig) continue;
      try {
        const lead = await (await fetch(`${meta.graph}/${v.leadgen_id}?fields=field_data,created_time,ad_name,adset_name,campaign_name,form_id&access_token=${decrypt(ig.credentialsEnc)}`)).json() as any;
        if (lead.error) throw new Error(lead.error.message);
        await ingestLead(ig.clinicId, "meta", String(v.leadgen_id), lead, { fieldMap: ig.config?.fieldMap, defaults: { source: "meta", campaign: lead.campaign_name, ownerId: ig.config?.ownerId } });
        await ownerSql`update integrations set last_sync_at = now(), status = 'healthy', last_error = null where id = ${ig.id}`;
      } catch (err) { await ownerSql`update integrations set status = 'error', last_error = ${(err as Error).message} where id = ${ig.id}`; }
    }
    return { ok: true };
  });

  // ── CSV / Excel içe aktarma ──
  app.post("/api/import/preview", async (req) => {
    const c = need(ctx(req), "lead.import");
    const b = parse(z.object({ csv: z.string().max(10_000_000), fileName: z.string().max(200).optional() }), req.body);
    const rows = parseCsv(b.csv); if (rows.length < 2) throw new HttpError(400, "empty", "Dosya boş");
    const header = rows[0]!; const sample = rows.slice(1, 6).map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ""])));
    const auto = mapToLead(Object.fromEntries(header.map((h) => [h, h])));
    const mapping: Record<string, string> = {}; for (const [k, v] of Object.entries(auto)) if (v) mapping[k] = String(v);
    return { header, sample, total: rows.length - 1, mapping };
  });
  app.post("/api/import/run", async (req) => {
    const c = need(ctx(req), "lead.import");
    const b = parse(z.object({ csv: z.string().max(10_000_000), mapping: z.record(z.string(), z.string()), source: z.string().max(40).default("import"), fileName: z.string().max(200).optional() }), req.body);
    const rows = parseCsv(b.csv); const header = rows[0]!;
    const res = { total: rows.length - 1, created: 0, updated: 0, skipped: 0, errors: [] as { row: number; error: string }[], ids: [] as string[] };
    for (let i = 1; i < rows.length; i++) {
      const obj = Object.fromEntries(header.map((h, j) => [h, rows[i]![j] ?? ""]));
      try { const r: any = await withClinic(c.clinicId, async (tx) => { const m = mapToLead(obj, b.mapping); if (!m.fullName && !m.phone && !m.email) return { skipped: true };
          return createLead(tx, c, { fullName: m.fullName || m.phone || m.email!, phone: m.phone ?? null, email: m.email || null, country: m.country ?? null, city: m.city ?? null, language: m.language ?? null, interest: m.interest ?? null, issue: m.issue ?? null, campaign: m.campaign ?? null, source: b.source, temperature: "warm" } as never, { dedupe: "attach" }); });
        if (r.skipped) res.skipped++; else { res.created++; res.ids.push(r.leadId); }
      } catch (e) { res.errors.push({ row: i + 1, error: (e as Error).message }); }
    }
    const [run] = await withClinic(c.clinicId, (tx) => tx`insert into import_runs (clinic_id, file_name, mapping, total, created, skipped, errors, status, created_ids, created_by) values (${c.clinicId}, ${b.fileName ?? null}, ${tx.json(b.mapping as never)}, ${res.total}, ${res.created}, ${res.skipped}, ${tx.json(res.errors.slice(0, 200) as never)}, 'done', ${res.ids}, ${c.userId}) returning id`);
    return { runId: run!.id, ...res, ids: undefined };
  });
  app.get("/api/import/runs", async (req) => { const c = need(ctx(req), "lead.import"); return withClinic(c.clinicId, (tx) => tx`select id, file_name, total, created, skipped, errors, status, created_at, undone_at from import_runs where clinic_id = ${c.clinicId} order by created_at desc limit 30`); });
  app.post("/api/import/runs/:id/undo", async (req) => {
    const c = need(ctx(req), "lead.delete"); const { id } = req.params as { id: string };
    return withClinic(c.clinicId, async (tx) => {
      const [r] = await tx`select created_ids, undone_at from import_runs where id = ${id}`; if (!r || r.undoneAt) throw new HttpError(400, "cannot_undo");
      const del = await tx`delete from leads where id = any(${r.createdIds}) and created_at > now() - interval '7 days' and not exists (select 1 from cases k where k.lead_id = leads.id) returning patient_id`;
      await tx`delete from patients p where p.id = any(${del.map((d) => d.patientId)}) and not exists (select 1 from leads l where l.patient_id = p.id)`;
      await tx`update import_runs set undone_at = now(), status = 'undone' where id = ${id}`;
      await audit(tx, c, "import.undo", "import", id, { deleted: del.length });
      return { deleted: del.length };
    });
  });
}

/** RFC4180 uyumlu küçük CSV ayrıştırıcı (tırnak, virgül/noktalı virgül/sekme) */
export function parseCsv(text: string): string[][] {
  const t = text.replace(/^﻿/, ""); const first = t.split(/\r?\n/, 1)[0] ?? "";
  const sep = [",", ";", "\t"].map((s) => [s, first.split(s).length] as const).sort((a, b) => b[1] - a[1])[0]![0];
  const rows: string[][] = []; let row: string[] = [], cell = "", q = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i]!;
    if (q) { if (ch === '"') { if (t[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; continue; }
    if (ch === '"') q = true; else if (ch === sep) { row.push(cell); cell = ""; } else if (ch === "\n" || ch === "\r") { if (ch === "\r" && t[i + 1] === "\n") i++; row.push(cell); cell = ""; if (row.some((x) => x !== "")) rows.push(row); row = []; } else cell += ch;
  }
  row.push(cell); if (row.some((x) => x !== "")) rows.push(row);
  return rows.map((r) => r.map((x) => x.trim()));
}
