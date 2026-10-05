// Takip dizileri API: CRUD, adımlar, hazır şablonlar, elle kayıt/çıkarma, istatistik; izin merkezi
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { withClinic } from "../db.ts";
import { ctx, need, parse, parsePatch, notFound, HttpError } from "../http.ts";
import { audit, emit } from "../services/audit.ts";
import { enroll, SEQUENCE_TEMPLATES, createFromTemplate } from "../services/sequences.ts";
import { recordConsent, contactAllowed } from "../services/consent.ts";

const STEP = z.object({ kind: z.enum(["whatsapp", "email", "sms", "task", "stage", "tag", "form", "ai_message", "ai_call", "wait"]), delayMinutes: z.number().int().min(0).max(525600),
  config: z.record(z.string(), z.unknown()).default({}), variantB: z.record(z.string(), z.unknown()).nullable().optional() });
const SEQ = z.object({ name: z.string().trim().min(1).max(120), description: z.string().max(1000).nullable().optional(), active: z.boolean().default(false),
  trigger: z.object({ event: z.string().max(60).optional(), stage: z.string().max(40).optional(), pipeline: z.string().max(20).optional(), source: z.string().max(40).optional() }).default({}),
  stopOn: z.array(z.string().max(30)).max(20).default(["replied", "quote_accepted", "deal_created", "stage_won", "stage_lost", "opted_out"]),
  settings: z.object({ quietStart: z.number().int().min(0).max(23).optional(), quietEnd: z.number().int().min(0).max(23).optional(), weekends: z.boolean().optional(), marketing: z.boolean().optional() }).default({}) });

export function sequenceRoutes(app: FastifyInstance) {
  app.get("/api/sequences", async (req) => {
    const c = need(ctx(req), "lead.read");
    return withClinic(c.clinicId, (tx) => tx`select s.*, (select count(*)::int from sequence_steps st where st.sequence_id = s.id) as step_count,
        (select count(*)::int from sequence_enrollments e where e.sequence_id = s.id and e.status = 'active') as active_count,
        (select count(*)::int from sequence_enrollments e where e.sequence_id = s.id) as total_count,
        (select count(*)::int from sequence_enrollments e where e.sequence_id = s.id and e.stop_reason in ('replied','quote_accepted','deal_created','stage_won','paid')) as converted
      from sequences s order by s.created_at`);
  });
  app.get("/api/sequences/templates", async () => Object.entries(SEQUENCE_TEMPLATES).map(([k, t]) => ({ key: k, name: t.name, trigger: t.trigger, steps: t.steps.length, marketing: !!t.settings.marketing })));
  app.post("/api/sequences/from-template", async (req) => {
    const c = need(ctx(req), "settings.manage"); const b = parse(z.object({ key: z.string(), lang: z.string().default("tr") }), req.body);
    return withClinic(c.clinicId, async (tx) => { const id = await createFromTemplate(tx, c.clinicId, b.key, b.lang, c.userId); if (!id) throw notFound("Şablon"); await audit(tx, c, "sequence.create", "sequence", id, { template: b.key }); return { id }; });
  });
  app.get("/api/sequences/:id", async (req) => {
    const c = need(ctx(req), "lead.read"); const { id } = req.params as { id: string };
    return withClinic(c.clinicId, async (tx) => {
      const [s] = await tx`select * from sequences where id = ${id}`; if (!s) throw notFound("Dizi");
      const steps = await tx`select * from sequence_steps where sequence_id = ${id} order by position`;
      const stats = await tx`select st.id as step_id, r.variant, r.status, count(*)::int as n from sequence_runs r join sequence_steps st on st.id = r.step_id where st.sequence_id = ${id} group by 1, 2, 3`;
      const reasons = await tx`select coalesce(stop_reason, status) as k, count(*)::int as n from sequence_enrollments where sequence_id = ${id} and status <> 'active' group by 1`;
      const enrollments = await tx`select e.id, e.status, e.step_index, e.next_run_at, e.variant, e.stop_reason, e.last_error, e.started_at, l.id as lead_id, p.full_name
        from sequence_enrollments e join leads l on l.id = e.lead_id join patients p on p.id = l.patient_id where e.sequence_id = ${id} order by e.started_at desc limit 100`;
      return { ...s, steps, stats, reasons, enrollments };
    });
  });
  app.post("/api/sequences", async (req) => {
    const c = need(ctx(req), "settings.manage"); const b = parse(SEQ.extend({ steps: z.array(STEP).max(40).default([]) }), req.body);
    return withClinic(c.clinicId, async (tx) => {
      const [s] = await tx`insert into sequences (clinic_id, name, description, active, trigger, stop_on, settings, created_by) values (${c.clinicId}, ${b.name}, ${b.description ?? null}, ${b.active}, ${tx.json(b.trigger as never)}, ${b.stopOn}, ${tx.json(b.settings as never)}, ${c.userId}) returning *`;
      for (const [i, st] of b.steps.entries()) await tx`insert into sequence_steps (clinic_id, sequence_id, position, kind, delay_minutes, config, variant_b) values (${c.clinicId}, ${s!.id}, ${i}, ${st.kind}, ${st.delayMinutes}, ${tx.json(st.config as never)}, ${st.variantB ? tx.json(st.variantB as never) : null})`;
      await audit(tx, c, "sequence.create", "sequence", s!.id as string); return s;
    });
  });
  // dizi + adımları birlikte kaydet (adımlar tamamen değiştirilir; aktif kayıtların adım sırası korunur)
  app.put("/api/sequences/:id", async (req) => {
    const c = need(ctx(req), "settings.manage"); const { id } = req.params as { id: string };
    const b = parsePatch(SEQ.partial().extend({ steps: z.array(STEP).max(40).optional() }), req.body);
    return withClinic(c.clinicId, async (tx) => {
      const [s] = await tx`select * from sequences where id = ${id}`; if (!s) throw notFound("Dizi");
      await tx`update sequences set name = ${b.name ?? s.name}, description = ${b.description !== undefined ? b.description : s.description}, active = ${b.active ?? s.active},
        trigger = ${tx.json((b.trigger ?? s.trigger) as never)}, stop_on = ${b.stopOn ?? s.stopOn}, settings = ${tx.json({ ...(s.settings as object), ...(b.settings ?? {}) } as never)} where id = ${id}`;
      if (b.steps) {
        await tx`delete from sequence_steps where sequence_id = ${id}`;
        for (const [i, st] of b.steps.entries()) await tx`insert into sequence_steps (clinic_id, sequence_id, position, kind, delay_minutes, config, variant_b) values (${c.clinicId}, ${id}, ${i}, ${st.kind}, ${st.delayMinutes}, ${tx.json(st.config as never)}, ${st.variantB ? tx.json(st.variantB as never) : null})`;
      }
      await audit(tx, c, "sequence.update", "sequence", id, { active: b.active, steps: b.steps?.length }); return { ok: true };
    });
  });
  app.delete("/api/sequences/:id", async (req) => {
    const c = need(ctx(req), "settings.manage"); const { id } = req.params as { id: string };
    return withClinic(c.clinicId, async (tx) => {
      await tx`update sequence_enrollments set status = 'stopped', stop_reason = 'sequence_deleted', finished_at = now() where sequence_id = ${id} and status = 'active'`;
      await tx`delete from sequences where id = ${id}`; await audit(tx, c, "sequence.delete", "sequence", id); return { ok: true };
    });
  });

  // ── kayıtlar ──
  app.post("/api/sequences/:id/enroll", async (req) => {
    const c = need(ctx(req), "lead.write"); const { id } = req.params as { id: string }; const b = parse(z.object({ leadIds: z.array(z.uuid()).min(1).max(500) }), req.body);
    return withClinic(c.clinicId, async (tx) => {
      const [s] = await tx`select id from sequences where id = ${id}`; if (!s) throw notFound("Dizi");
      let n = 0; for (const l of b.leadIds) if (await enroll(tx, c.clinicId, id, l, c.userId)) n++;
      await audit(tx, c, "sequence.enroll", "sequence", id, { n }); return { enrolled: n, skipped: b.leadIds.length - n };
    });
  });
  app.post("/api/sequence-enrollments/:id/stop", async (req) => {
    const c = need(ctx(req), "lead.write"); const { id } = req.params as { id: string };
    return withClinic(c.clinicId, async (tx) => { const [e] = await tx`update sequence_enrollments set status = 'stopped', stop_reason = 'manual', finished_at = now() where id = ${id} and status = 'active' returning id`; if (!e) throw new HttpError(409, "not_active"); return { ok: true }; });
  });
  app.get("/api/leads/:id/sequences", async (req) => {
    const c = need(ctx(req), "lead.read"); const { id } = req.params as { id: string };
    return withClinic(c.clinicId, (tx) => tx`select e.*, s.name, (select count(*)::int from sequence_steps st where st.sequence_id = s.id) as step_count,
        (select json_agg(json_build_object('at', r.at, 'status', r.status, 'channel', r.channel, 'detail', r.detail) order by r.at) from sequence_runs r where r.enrollment_id = e.id) as runs
      from sequence_enrollments e join sequences s on s.id = e.sequence_id where e.lead_id = ${id} order by e.started_at desc`);
  });

  // ── izin merkezi ──
  app.get("/api/leads/:id/consents", async (req) => {
    const c = need(ctx(req), "lead.read"); const { id } = req.params as { id: string };
    return withClinic(c.clinicId, async (tx) => {
      const [l] = await tx`select patient_id from leads where id = ${id}`; if (!l) throw notFound("Lead");
      const history = await tx`select c.*, u.name as user_name from consents c left join users u on u.id = (c.evidence->>'userId')::uuid where c.patient_id = ${l.patientId} order by c.at desc limit 100`;
      const state: Record<string, unknown> = {};
      for (const ch of ["whatsapp", "email", "sms", "call"] as const) state[ch] = { followup: (await contactAllowed(tx, c.clinicId, l.patientId as string, ch, "followup")).ok, marketing: (await contactAllowed(tx, c.clinicId, l.patientId as string, ch, "marketing")).ok };
      return { state, history };
    });
  });
  app.post("/api/leads/:id/consents", async (req) => {
    const c = need(ctx(req), "lead.write"); const { id } = req.params as { id: string };
    const b = parse(z.object({ channel: z.enum(["whatsapp", "email", "sms", "call", "all"]), purpose: z.enum(["followup", "marketing"]), status: z.enum(["granted", "revoked"]), note: z.string().max(500).optional() }), req.body);
    return withClinic(c.clinicId, async (tx) => {
      const [l] = await tx`select patient_id from leads where id = ${id}`; if (!l) throw notFound("Lead");
      await recordConsent(tx, c.clinicId, l.patientId as string, { channel: b.channel, purpose: b.purpose, status: b.status, source: "manual", evidence: { userId: c.userId, note: b.note ?? null } });
      if (b.status === "revoked") await emit(tx, c.clinicId, "consent.revoked", l.patientId as string, { leadId: id, channel: b.channel });
      await audit(tx, c, "consent." + b.status, "lead", id, b); return { ok: true };
    });
  });
}
