// Toplu kampanya API + e-posta abonelikten çıkma bağlantısı
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { withClinic, ownerSql } from "../db.ts";
import { ctx, need, parse, parsePatch, notFound, HttpError } from "../http.ts";
import { audit, emit } from "../services/audit.ts";
import { previewAudience, launchCampaign, campaignStats, unsubToken } from "../services/campaigns.ts";
import { recordConsent } from "../services/consent.ts";
import type { Tx } from "../db.ts";

const AUD = z.object({ stages: z.array(z.string()).optional(), sources: z.array(z.string()).optional(), countries: z.array(z.string().length(2)).optional(), languages: z.array(z.string()).optional(), tags: z.array(z.string()).optional(),
  partnerId: z.uuid().optional(), ownerId: z.uuid().optional(), createdFrom: z.iso.date().optional(), createdTo: z.iso.date().optional(), inactiveDays: z.number().int().min(1).max(3650).optional(), hasDeal: z.boolean().optional(),
  cf: z.record(z.string(), z.unknown()).optional(), pipeline: z.string().optional(), pipelineStage: z.string().optional() });
const CAMP = z.object({ name: z.string().trim().min(1).max(120), channel: z.enum(["whatsapp", "email"]), audience: AUD.default({}), content: z.record(z.string(), z.unknown()).default({}), variantB: z.record(z.string(), z.unknown()).nullable().optional(), scheduleAt: z.iso.datetime().nullable().optional() });

export function campaignRoutes(app: FastifyInstance) {
  app.get("/api/campaigns", async (req) => {
    const c = need(ctx(req), "lead.read");
    return withClinic(c.clinicId, (tx) => tx`select c.*, u.name as created_by_name, (select count(*)::int from campaign_recipients r where r.campaign_id = c.id and r.status = 'sent') as sent_count from campaigns c left join users u on u.id = c.created_by order by c.created_at desc`);
  });
  app.get("/api/campaigns/:id", async (req) => {
    const c = need(ctx(req), "lead.read"); const { id } = req.params as { id: string };
    return withClinic(c.clinicId, async (tx) => { const [x] = await tx`select * from campaigns where id = ${id}`; if (!x) throw notFound("Kampanya"); return { ...x, results: await campaignStats(tx, id) }; });
  });
  app.post("/api/campaigns", async (req) => {
    const c = need(ctx(req), "settings.manage"); const b = parse(CAMP, req.body);
    return withClinic(c.clinicId, async (tx) => (await tx`insert into campaigns (clinic_id, name, channel, audience, content, variant_b, schedule_at, created_by) values (${c.clinicId}, ${b.name}, ${b.channel}, ${tx.json(b.audience as never)}, ${tx.json(b.content as never)}, ${b.variantB ? tx.json(b.variantB as never) : null}, ${b.scheduleAt ?? null}, ${c.userId}) returning *`)[0]);
  });
  app.patch("/api/campaigns/:id", async (req) => {
    const c = need(ctx(req), "settings.manage"); const { id } = req.params as { id: string }; const b = parsePatch(CAMP.partial(), req.body);
    return withClinic(c.clinicId, async (tx) => {
      const [x] = await tx`select * from campaigns where id = ${id}`; if (!x) throw notFound("Kampanya"); if (x.status !== "draft") throw new HttpError(409, "locked", "Gönderilmiş kampanya düzenlenemez");
      await tx`update campaigns set name = ${b.name ?? x.name}, channel = ${b.channel ?? x.channel}, audience = ${tx.json((b.audience ?? x.audience) as never)}, content = ${tx.json((b.content ?? x.content) as never)},
        variant_b = ${b.variantB !== undefined ? (b.variantB ? tx.json(b.variantB as never) : null) : x.variantB}, schedule_at = ${b.scheduleAt !== undefined ? b.scheduleAt : x.scheduleAt} where id = ${id}`;
      return { ok: true };
    });
  });
  app.post("/api/campaigns/preview", async (req) => {
    const c = need(ctx(req), "lead.read"); const b = parse(z.object({ audience: AUD, channel: z.enum(["whatsapp", "email"]) }), req.body);
    return withClinic(c.clinicId, (tx) => previewAudience(tx, c.clinicId, b.audience, b.channel));
  });
  app.post("/api/campaigns/:id/launch", async (req) => {
    const c = need(ctx(req), "settings.manage"); const { id } = req.params as { id: string };
    return withClinic(c.clinicId, async (tx) => {
      const [x] = await tx`select * from campaigns where id = ${id}`; if (!x) throw notFound("Kampanya"); if (x.status !== "draft") throw new HttpError(409, "not_draft");
      const ct = x.content as any;
      if (x.channel === "whatsapp" && !ct.template?.name) throw new HttpError(400, "template_required", "WhatsApp kampanyası onaylı şablon gerektirir");
      if (x.channel === "email" && (!ct.subject || !ct.body)) throw new HttpError(400, "content_required", "Konu ve metin gerekli");
      const n = await launchCampaign(tx, c.clinicId, id);
      await audit(tx, c, "campaign.launch", "campaign", id, { recipients: n }); return { recipients: n };
    });
  });
  app.post("/api/campaigns/:id/cancel", async (req) => {
    const c = need(ctx(req), "settings.manage"); const { id } = req.params as { id: string };
    return withClinic(c.clinicId, async (tx) => { await tx`update campaigns set status = 'canceled', finished_at = now() where id = ${id} and status in ('draft','scheduled','sending')`; await tx`update campaign_recipients set status = 'skipped', reason = 'canceled' where campaign_id = ${id} and status = 'pending'`; return { ok: true }; });
  });

  // e-posta abonelikten çıkma (pazarlama izni iptal)
  app.get("/api/public/unsub/:lead/:token", async (req, reply) => {
    const { lead, token } = req.params as { lead: string; token: string };
    if (unsubToken(lead) !== token) return reply.status(404).type("text/html").send("<p>Link invalid</p>");
    const [l] = await ownerSql`select clinic_id, patient_id from leads where id = ${lead}`; if (!l) return reply.status(404).send("not found");
    await ownerSql.begin(async (tx) => { await tx`select set_config('app.clinic_id', ${l.clinicId}, true)`;
      await recordConsent(tx as unknown as Tx, l.clinicId as string, l.patientId as string, { channel: "email", purpose: "marketing", status: "revoked", source: "web", evidence: { via: "unsubscribe_link" } });
      await emit(tx as unknown as Tx, l.clinicId as string, "consent.revoked", l.patientId as string, { leadId: lead, channel: "email" }); });
    return reply.type("text/html").send(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><div style="font:16px system-ui;max-width:420px;margin:15vh auto;text-align:center">✅<h2>Unsubscribed · Abonelikten çıkıldı</h2><p>You will no longer receive marketing emails.</p></div>`);
  });
}
