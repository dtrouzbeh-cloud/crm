// Faz D — telefon uçları: temsilci tek tık arama, arama listesi/kayıt, Twilio webhook'ları (imza doğrulamalı)
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withClinic, ownerSql } from "../db.ts";
import { ctx, need, parse, notFound, HttpError, forbidden } from "../http.ts";
import { audit } from "../services/audit.ts";
import { normalizePhone } from "@dentaflow/core/phone";
import { startBridgeCall, bridgeTwiml, inboundCall, clinicByNumber, voicemailTwiml, missedCall, callStatus, dialResult, recordingReady, twilioCreds, verifyTwilio, publicUrl, twiml } from "../services/voice.ts";

export function voiceRoutes(app: FastifyInstance) {
  // ── personel ──
  app.post("/api/leads/:id/call", async (req) => {
    const c = ctx(req); if (!c.perms["lead.write"] && !c.perms["inbox.use"]) throw forbidden("lead.write");
    const { id } = req.params as { id: string };
    const [l] = await withClinic(c.clinicId, (tx) => tx`select id from leads where id = ${id}`); if (!l) throw notFound("Lead");   // kapsam (kendi lead'i) RLS + izinle
    try { const r = await startBridgeCall(c.clinicId, c.userId, id); await withClinic(c.clinicId, (tx) => audit(tx, c, "call.start", "lead", id, { callId: r.id })); return r; }
    catch (e) { const code = (e as any).code; throw new HttpError(code ? 400 : 502, code ?? "voice_failed", (e as Error).message); }
  });
  app.get("/api/leads/:id/calls", async (req) => {
    const c = need(ctx(req), "lead.read"); const { id } = req.params as { id: string };
    return withClinic(c.clinicId, (tx) => tx`select c.id, c.direction, c.status, c.outcome, c.started_at, c.answered_at, c.duration_sec, c.recording_file_id, c.transcript, c.summary, c.next_step, c.ai, c.error, u.name as user_name
      from calls c left join users u on u.id = c.user_id where c.lead_id = ${id} order by c.started_at desc limit 50`);
  });
  app.get("/api/calls", async (req) => {
    const c = ctx(req); const q = parse(z.object({ days: z.coerce.number().int().min(1).max(365).default(30), direction: z.enum(["in", "out"]).optional() }), req.query);
    const own = c.perms["reports.view"] !== "all" && c.perms["lead.read"] !== "all";
    return withClinic(c.clinicId, (tx) => tx`select c.id, c.lead_id, c.direction, c.status, c.outcome, c.started_at, c.duration_sec, c.summary, c.next_step, c.recording_file_id, c.from_number, c.to_number, u.name as user_name, p.full_name
      from calls c left join users u on u.id = c.user_id left join leads l on l.id = c.lead_id left join patients p on p.id = l.patient_id
      where c.started_at > now() - make_interval(days => ${q.days}) ${q.direction ? tx`and c.direction = ${q.direction}` : tx``} ${own ? tx`and (c.user_id = ${c.userId} or l.owner_id = ${c.userId})` : tx``}
      order by c.started_at desc limit 300`);
  });
  app.put("/api/me/phone", async (req) => {
    const c = ctx(req); const b = parse(z.object({ phone: z.string().max(30).nullable() }), req.body);
    const phone = b.phone ? normalizePhone(b.phone) : null; if (b.phone && !phone) throw new HttpError(400, "bad_phone", "Telefon numarası uluslararası biçimde olmalı (+90…)");
    await ownerSql`update users set phone = ${phone} where id = ${c.userId}`; return { phone };
  });
  app.get("/api/voice/config", async (req) => {
    const c = ctx(req); const cr = await twilioCreds(c.clinicId);
    const [u] = await ownerSql`select phone from users where id = ${c.userId}`;
    return { configured: !!cr, number: cr?.number ?? null, myPhone: (u?.phone as string) ?? null, inboundUrl: publicUrl("/api/public/voice/inbound"), statusUrl: publicUrl("/api/public/voice/inbound-status") };
  });

  // ── Twilio webhook'ları: her istek klinik Auth Token'ı ile imza doğrulamasından geçer ──
  const xml = (reply: FastifyReply, body: string) => reply.type("text/xml").send(body);
  const params = (req: FastifyRequest) => Object.fromEntries(Object.entries((req.body ?? {}) as Record<string, unknown>).map(([k, v]) => [k, String(v)]));
  async function guardCall(req: FastifyRequest) {
    const { id } = req.params as { id: string };
    const [k] = await ownerSql`select clinic_id from calls where id = ${id}`; if (!k) throw notFound("Arama");
    const cr = await twilioCreds(k.clinicId as string); if (!cr) throw new HttpError(403, "not_configured");
    if (!verifyTwilio(cr.token, publicUrl(req.url), params(req), req.headers["x-twilio-signature"] as string)) throw new HttpError(403, "bad_signature");
    return { id, clinicId: k.clinicId as string };
  }
  app.post("/api/public/voice/bridge/:id", async (req, reply) => { const g = await guardCall(req); return xml(reply, await bridgeTwiml(g.id)); });
  app.post("/api/public/voice/status/:id", async (req) => { const g = await guardCall(req); await callStatus(g.id, params(req)); return { ok: true }; });
  app.post("/api/public/voice/dial/:id", async (req, reply) => { const g = await guardCall(req); await dialResult(g.id, params(req)); return xml(reply, twiml("<Hangup/>")); });
  app.post("/api/public/voice/recording/:id", async (req) => { const g = await guardCall(req); await recordingReady(g.id, params(req), (req.query as any)?.vm === "1"); return { ok: true }; });
  app.post("/api/public/voice/inbound-dial/:id", async (req, reply) => {
    const g = await guardCall(req); const p = params(req);
    if (p.DialCallStatus === "completed" || p.DialCallStatus === "answered") { await dialResult(g.id, p); return xml(reply, twiml("<Hangup/>")); }
    await missedCall(g.id);
    const [k] = await ownerSql`select coalesce(pt.language, cl.default_language, 'en') as lang from calls c join clinics cl on cl.id = c.clinic_id left join leads l on l.id = c.lead_id left join patients pt on pt.id = l.patient_id where c.id = ${g.id}`;
    return xml(reply, twiml(voicemailTwiml(g.id, (k?.lang as string) ?? "en")));
  });
  app.post("/api/public/voice/done/:id", async (req, reply) => { await guardCall(req); return xml(reply, twiml("<Hangup/>")); });
  // gelen arama: numaranın "A call comes in" adresi
  app.post("/api/public/voice/inbound", async (req, reply) => {
    const p = params(req); const clinicId = await clinicByNumber(p.To ?? ""); if (!clinicId) return xml(reply, twiml("<Reject/>"));
    const cr = await twilioCreds(clinicId); if (!cr || !verifyTwilio(cr.token, publicUrl(req.url), p, req.headers["x-twilio-signature"] as string)) throw new HttpError(403, "bad_signature");
    return xml(reply, await inboundCall(clinicId, p));
  });
  app.post("/api/public/voice/inbound-status", async (req) => {
    const p = params(req); const clinicId = await clinicByNumber(p.To ?? ""); if (!clinicId) return { ok: true };
    const cr = await twilioCreds(clinicId); if (!cr || !verifyTwilio(cr.token, publicUrl(req.url), p, req.headers["x-twilio-signature"] as string)) throw new HttpError(403, "bad_signature");
    const [k] = await ownerSql`select id from calls where provider = 'twilio' and provider_sid = ${p.CallSid ?? ""}`; if (k) await callStatus(k.id as string, p);
    return { ok: true };
  });
}
