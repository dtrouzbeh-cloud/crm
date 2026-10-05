// Formlar: onam / anamnez / anket şablonları, hastaya token'lı gönderim, imzalı ve değiştirilemez tamamlanma kaydı.
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { withClinic, ownerSql, type Tx } from "../db.ts";
import { ctx, need, parse, notFound, HttpError, ipOf } from "../http.ts";
import { randomToken, sha256, encrypt, decrypt } from "../lib/crypto.ts";
import { audit, emit } from "../services/audit.ts";
import { storage, signFile } from "../services/storage.ts";
import { sendMail } from "../services/mailer.ts";
import { seedClinicForms } from "../services/forms-seed.ts";
import { config } from "../config.ts";

const FIELD = z.object({
  key: z.string().regex(/^[a-z0-9_]{1,40}$/), type: z.enum(["heading", "text", "textarea", "number", "date", "yesno", "choice", "multi", "checkbox", "nps", "rating"]),
  label: z.string().min(1).max(500), options: z.array(z.string().max(200)).max(30).optional(), required: z.boolean().optional(),
  flag: z.string().max(30).optional(), map: z.enum(["age", "medications", "allergies", "notes"]).optional(),
});
const TEMPLATE = z.object({
  kind: z.enum(["consent", "intake", "survey"]), name: z.string().trim().min(1).max(120), lang: z.string().min(2).max(5), title: z.string().trim().min(1).max(200),
  body: z.string().max(20000).default(""), fields: z.array(FIELD).max(80), requireSignature: z.boolean().default(false), active: z.boolean().default(true),
});

const MAIL: Record<string, [string, string]> = {
  en: ["{clinic}: please complete “{title}”", "Hello {name},\n\nPlease complete the following form before your treatment:\n\n{title}\n{link}\n\nIt takes only a few minutes.\n\n{clinic}"],
  tr: ["{clinic}: “{title}” formunu doldurun", "Merhaba {name},\n\nLütfen tedavinizden önce aşağıdaki formu doldurun:\n\n{title}\n{link}\n\nYalnızca birkaç dakika sürer.\n\n{clinic}"],
  de: ["{clinic}: Bitte füllen Sie „{title}“ aus", "Hallo {name},\n\nbitte füllen Sie vor Ihrer Behandlung folgendes Formular aus:\n\n{title}\n{link}\n\nEs dauert nur wenige Minuten.\n\n{clinic}"],
};
const fill = (s: string, p: Record<string, string>) => s.replace(/\{(\w+)\}/g, (m, k) => p[k] ?? m);
export const formShareText = (lang: string, p: { name: string; title: string; link: string; clinic: string }) => fill((MAIL[lang] ?? MAIL.en!)[1], p);

export async function createFormRequest(tx: Tx, clinicId: string, userId: string | null, templateId: string, leadId: string, dealId?: string | null) {
  const [t] = await tx`select * from form_templates where id = ${templateId} and clinic_id = ${clinicId}`; if (!t) throw notFound("Form şablonu");
  if (!t.active) throw new HttpError(409, "inactive", "Şablon pasif");
  const [l] = await tx`select l.id, l.patient_id, p.full_name, p.email from leads l join patients p on p.id = l.patient_id where l.id = ${leadId} and l.clinic_id = ${clinicId}`; if (!l) throw notFound("Lead");
  const [cl] = await tx`select name, brand_color, logo_file_id, settings from clinics where id = ${clinicId}`;
  const token = randomToken(18);
  const snapshot = { kind: t.kind, title: t.title, body: t.body, fields: t.fields, requireSignature: t.requireSignature, lang: t.lang, templateVersion: t.version,
    clinic: { name: cl!.name, color: cl!.brandColor, logo: cl!.logoFileId ?? null }, patient: { name: l.fullName } };
  const [r] = await tx`insert into form_requests (clinic_id, template_id, kind, lead_id, patient_id, deal_id, token_hash, token_enc, snapshot, sent_by)
    values (${clinicId}, ${t.id}, ${t.kind}, ${leadId}, ${l.patientId}, ${dealId ?? null}, ${sha256(token)}, ${encrypt(token)}, ${tx.json(snapshot as never)}, ${userId}) returning id`;
  await tx`insert into lead_events (clinic_id, lead_id, type, body, data, user_id) values (${clinicId}, ${leadId}, 'form', 'sent', ${tx.json({ formId: r!.id, title: t.title, kind: t.kind } as never)}, ${userId})`;
  const url = `${config.appUrl}/f/${token}`;
  return { id: r!.id as string, url, title: t.title as string, lang: t.lang as string, email: (l.email as string) ?? null, name: l.fullName as string, clinic: cl!.name as string, replyTo: null as string | null };
}

export async function emailFormRequest(clinicId: string, f: { url: string; title: string; lang: string; email: string | null; name: string; clinic: string }) {
  if (!f.email) return false;
  const [subj, body] = MAIL[f.lang] ?? MAIL.en!;
  const p = { name: f.name.split(" ")[0]!, title: f.title, link: f.url, clinic: f.clinic };
  await sendMail(f.email, fill(subj, p), fill(body, p), { clinicId, fromName: f.clinic });
  return true;
}

async function byToken(token: string) {
  const [r] = await ownerSql`select * from form_requests where token_hash = ${sha256(token)}`;
  if (!r || r.status === "revoked") throw notFound("Form");
  return r;
}

export function formRoutes(app: FastifyInstance) {
  // ── Şablonlar ──
  app.get("/api/forms/templates", async (req) => {
    const c = ctx(req);
    return withClinic(c.clinicId, async (tx) => {
      const [{ n }] = await tx`select count(*)::int as n from form_templates` as unknown as [{ n: number }];
      if (!n) { const [cl] = await tx`select default_language from clinics where id = ${c.clinicId}`; await seedClinicForms(tx, c.clinicId, cl!.defaultLanguage as string); }
      return tx`select t.*, (select count(*)::int from form_requests r where r.template_id = t.id) as used from form_templates t order by kind, name, lang`;
    });
  });
  app.post("/api/forms/templates", async (req) => {
    const c = need(ctx(req), "settings.manage"); const b = parse(TEMPLATE, req.body);
    return withClinic(c.clinicId, async (tx) => {
      const [t] = await tx`insert into form_templates (clinic_id, kind, name, lang, title, body, fields, require_signature, active)
        values (${c.clinicId}, ${b.kind}, ${b.name}, ${b.lang}, ${b.title}, ${b.body}, ${tx.json(b.fields as never)}, ${b.requireSignature}, ${b.active}) returning *`;
      await audit(tx, c, "form_template.create", "form_template", t!.id as string); return t;
    });
  });
  app.patch("/api/forms/templates/:id", async (req) => {
    const c = need(ctx(req), "settings.manage"); const { id } = req.params as { id: string }; const b = parse(TEMPLATE.partial(), req.body);
    return withClinic(c.clinicId, async (tx) => {
      const [cur] = await tx`select * from form_templates where id = ${id}`; if (!cur) throw notFound("Şablon");
      const contentChanged = b.title !== undefined || b.body !== undefined || b.fields !== undefined || b.requireSignature !== undefined;
      const [t] = await tx`update form_templates set name = ${b.name ?? cur.name}, lang = ${b.lang ?? cur.lang}, title = ${b.title ?? cur.title}, body = ${b.body ?? cur.body},
        fields = ${tx.json((b.fields ?? cur.fields) as never)}, require_signature = ${b.requireSignature ?? cur.requireSignature}, active = ${b.active ?? cur.active},
        version = version + ${contentChanged ? 1 : 0} where id = ${id} returning *`;
      await audit(tx, c, "form_template.update", "form_template", id); return t;
    });
  });
  app.delete("/api/forms/templates/:id", async (req) => {
    const c = need(ctx(req), "settings.manage"); const { id } = req.params as { id: string };
    return withClinic(c.clinicId, async (tx) => {
      const [used] = await tx`select 1 from form_requests where template_id = ${id} limit 1`;
      if (used) await tx`update form_templates set active = false where id = ${id}`; else await tx`delete from form_templates where id = ${id}`;
      await audit(tx, c, "form_template.delete", "form_template", id); return { ok: true, archived: !!used };
    });
  });
  app.post("/api/forms/templates/reseed", async (req) => {
    const c = need(ctx(req), "settings.manage"); const { lang } = parse(z.object({ lang: z.string().min(2).max(5) }), req.body);
    return withClinic(c.clinicId, async (tx) => ({ added: await seedClinicForms(tx, c.clinicId, lang) }));
  });

  // ── Gönderimler ──
  app.get("/api/forms/requests", async (req) => {
    const c = need(ctx(req), "lead.read"); const q = parse(z.object({ leadId: z.uuid().optional(), kind: z.string().optional(), status: z.string().optional(), limit: z.coerce.number().int().max(500).default(100) }), req.query);
    return withClinic(c.clinicId, (tx) => tx`select r.id, r.kind, r.status, r.nps, r.sent_at, r.opened_at, r.completed_at, r.lead_id, r.snapshot->>'title' as title, r.snapshot->>'lang' as lang,
        p.full_name as patient_name, u.name as sent_by_name
      from form_requests r left join patients p on p.id = r.patient_id left join users u on u.id = r.sent_by
      where ${q.leadId ? tx`r.lead_id = ${q.leadId}` : tx`true`} and ${q.kind ? tx`r.kind = ${q.kind}` : tx`true`} and ${q.status ? tx`r.status = ${q.status}` : tx`true`}
      order by r.sent_at desc limit ${q.limit}`);
  });
  app.post("/api/forms/requests", async (req) => {
    const c = need(ctx(req), "lead.write");
    const b = parse(z.object({ templateId: z.uuid(), leadId: z.uuid(), dealId: z.uuid().optional(), email: z.boolean().default(false) }), req.body);
    const f = await withClinic(c.clinicId, (tx) => createFormRequest(tx, c.clinicId, c.userId, b.templateId, b.leadId, b.dealId));
    const emailed = b.email ? await emailFormRequest(c.clinicId, f) : false;
    return { id: f.id, url: f.url, emailed, shareText: formShareText(f.lang, { name: f.name.split(" ")[0]!, title: f.title, link: f.url, clinic: f.clinic }) };
  });
  app.get("/api/forms/requests/:id", async (req) => {
    const c = need(ctx(req), "lead.read"); const { id } = req.params as { id: string };
    return withClinic(c.clinicId, async (tx) => {
      const [r] = await tx`select r.*, p.full_name as patient_name, u.name as sent_by_name from form_requests r left join patients p on p.id = r.patient_id left join users u on u.id = r.sent_by where r.id = ${id}`;
      if (!r) throw notFound("Form");
      if (r.kind === "intake" && c.perms["field.medical"] === "hide") throw new HttpError(403, "forbidden", "Tıbbi veriyi görme yetkiniz yok");
      const { tokenHash, tokenEnc, ...rest } = r;
      return { ...rest, url: r.status === "completed" ? null : `${config.appUrl}/f/${decrypt(tokenEnc as string)}`, signatureUrl: r.signatureFileId ? signFile(r.signatureFileId as string) : null };
    });
  });
  app.post("/api/forms/requests/:id/revoke", async (req) => {
    const c = need(ctx(req), "lead.write"); const { id } = req.params as { id: string };
    return withClinic(c.clinicId, async (tx) => {
      const [r] = await tx`update form_requests set status = 'revoked' where id = ${id} and status <> 'completed' returning id`;
      if (!r) throw new HttpError(409, "completed", "Tamamlanmış form iptal edilemez");
      await audit(tx, c, "form.revoke", "form_request", id); return { ok: true };
    });
  });

  // NPS özeti (raporlar için)
  app.get("/api/forms/nps", async (req) => {
    const c = need(ctx(req), "reports.view"); const q = parse(z.object({ days: z.coerce.number().int().min(1).max(730).default(90) }), req.query);
    return withClinic(c.clinicId, async (tx) => {
      const [s] = await tx`select count(*)::int as n, count(*) filter (where nps >= 9)::int as promoters, count(*) filter (where nps <= 6)::int as detractors, round(avg(nps), 1)::float as avg
        from form_requests where nps is not null and completed_at > now() - ${q.days + " days"}::interval`;
      const recent = await tx`select r.id, r.nps, r.completed_at, r.answers->>'comment' as comment, p.full_name as patient_name, r.lead_id from form_requests r left join patients p on p.id = r.patient_id
        where r.nps is not null order by r.completed_at desc limit 20`;
      const n = s!.n as number;
      return { ...s, score: n ? Math.round(((s!.promoters as number) - (s!.detractors as number)) / n * 100) : null, recent };
    });
  });

  // ── Herkese açık (hasta) ──
  app.get("/api/public/f/:token", async (req) => {
    const { token } = req.params as { token: string };
    const r = await byToken(token);
    const expired = r.status !== "completed" && new Date(r.expiresAt) < new Date();
    let logo: string | null = null; const s = r.snapshot as any; if (s.clinic?.logo) logo = signFile(s.clinic.logo, 86400);
    const [cl] = await ownerSql`select settings from clinics where id = ${r.clinicId}`;
    const reviews = r.status === "completed" && r.kind === "survey" && (r.nps ?? 0) >= 9 ? ((cl?.settings as any)?.reviewLinks ?? []) : [];
    return { status: expired ? "expired" : r.status, snapshot: { ...s, clinic: { ...s.clinic, logo } }, completedAt: r.completedAt, signedName: r.signedName, reviews };
  });
  app.post("/api/public/f/:token/open", async (req) => {
    if (req.sessionUserId) return { ok: true, staff: true };
    const r = await byToken((req.params as { token: string }).token);
    if (r.status === "sent") await ownerSql`update form_requests set status = 'opened', opened_at = now() where id = ${r.id} and status = 'sent'`;
    return { ok: true };
  });
  app.post("/api/public/f/:token/submit", { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } }, async (req) => {
    if (req.sessionUserId) throw new HttpError(403, "staff_preview", "Personel önizlemesinde gönderilemez");
    const { token } = req.params as { token: string };
    const b = parse(z.object({ answers: z.record(z.string(), z.unknown()), signedName: z.string().trim().max(160).optional(), signature: z.string().max(400_000).optional() }), req.body);
    const r = await byToken(token);
    if (r.status === "completed") throw new HttpError(409, "completed", "Form zaten gönderildi");
    if (new Date(r.expiresAt) < new Date()) throw new HttpError(410, "expired", "Bağlantının süresi doldu");
    const s = r.snapshot as any;
    // doğrulama: zorunlu alanlar ve tür kontrolü
    const clean: Record<string, unknown> = {};
    for (const f of s.fields as any[]) {
      if (f.type === "heading") continue;
      let v = b.answers[f.key];
      if (f.type === "nps") v = v === undefined || v === null || v === "" ? null : Math.max(0, Math.min(10, Math.round(Number(v))));
      else if (f.type === "rating") v = v ? Math.max(1, Math.min(5, Math.round(Number(v)))) : null;
      else if (f.type === "number") v = v === "" || v == null ? null : Number(v);
      else if (f.type === "checkbox") v = v === true;
      else if (f.type === "yesno") v = v === true ? true : v === false ? false : null;
      else if (f.type === "multi") v = Array.isArray(v) ? v.filter((x) => (f.options ?? []).includes(x)) : [];
      else if (f.type === "choice") v = (f.options ?? []).includes(v) ? v : null;
      else v = v == null ? null : String(v).slice(0, 5000);
      const empty = v === null || v === "" || v === false || (Array.isArray(v) && !v.length);
      if (f.required && empty && f.type !== "yesno") throw new HttpError(400, "required", `Zorunlu alan: ${f.label}`, { key: f.key });
      if (f.required && f.type === "yesno" && v === null) throw new HttpError(400, "required", `Zorunlu alan: ${f.label}`, { key: f.key });
      clean[f.key] = v;
    }
    let sigFile: string | null = null;
    if (s.requireSignature) {
      if (!b.signedName || b.signedName.length < 2) throw new HttpError(400, "name_required", "Ad soyad gerekli");
      const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(b.signature ?? "");
      if (!m) throw new HttpError(400, "signature_required", "İmza gerekli");
      const buf = Buffer.from(m[1]!, "base64"); if (buf.length < 300) throw new HttpError(400, "signature_required", "İmza gerekli");
      const id = randomUUID(), key = `${r.clinicId}/consent/${id.slice(0, 2)}/${id}`;
      await storage.put(key, buf);
      await ownerSql`insert into files (id, clinic_id, kind, name, mime, size_bytes, storage_key, sha256, entity, entity_id)
        values (${id}, ${r.clinicId}, 'consent', ${"signature-" + r.id + ".png"}, 'image/png', ${buf.length}, ${key}, ${sha256(buf.toString("base64"))}, 'lead', ${r.leadId})`;
      sigFile = id;
    }
    const nps = typeof clean.nps === "number" ? (clean.nps as number) : null;
    const docHash = sha256(JSON.stringify({ snapshot: s, answers: clean, signedName: b.signedName ?? null, signature: b.signature ? sha256(b.signature) : null }));
    const ip = ipOf(req), ua = (req.headers["user-agent"] as string) ?? null;
    await ownerSql.begin(async (tx) => {
      const [u] = await tx`update form_requests set status = 'completed', answers = ${tx.json(clean as never)}, nps = ${nps}, signature_file_id = ${sigFile}, signed_name = ${b.signedName ?? null},
        doc_hash = ${docHash}, ip = ${ip}, user_agent = ${ua}, completed_at = now(), opened_at = coalesce(opened_at, now()) where id = ${r.id} and status <> 'completed' returning id`;
      if (!u) throw new HttpError(409, "completed");
      // anamnez → tıbbi profil (kural motorunu besler)
      if (r.kind === "intake" && r.patientId) {
        const flags: string[] = (s.fields as any[]).filter((f) => f.flag && clean[f.key] === true).map((f) => f.flag);
        const mapped: Record<string, unknown> = {}; for (const f of s.fields as any[]) if (f.map && clean[f.key] != null && clean[f.key] !== "") mapped[f.map] = clean[f.key];
        await tx`insert into medical_profiles (patient_id, clinic_id, flags, age, medications, allergies, notes) values (${r.patientId}, ${r.clinicId}, ${flags}, ${(mapped.age as number) ?? null}, ${(mapped.medications as string) ?? null}, ${(mapped.allergies as string) ?? null}, ${(mapped.notes as string) ?? null})
          on conflict (patient_id) do update set flags = excluded.flags, age = coalesce(excluded.age, medical_profiles.age), medications = coalesce(excluded.medications, medical_profiles.medications),
            allergies = coalesce(excluded.allergies, medical_profiles.allergies), notes = coalesce(excluded.notes, medical_profiles.notes), updated_at = now()`;
      }
      const [l] = await tx`select l.owner_id, p.full_name from leads l join patients p on p.id = l.patient_id where l.id = ${r.leadId}`;
      await tx`insert into lead_events (clinic_id, lead_id, type, body, data) values (${r.clinicId}, ${r.leadId}, 'form', 'completed', ${tx.json({ formId: r.id, title: s.title, kind: r.kind, nps } as never)})`;
      if (nps !== null && nps <= 6)
        await tx`insert into tasks (clinic_id, title, type, priority, due_at, lead_id, assignee_id, entity, entity_id) values (${r.clinicId}, ${(l?.fullName ?? "") + ` memnun değil (NPS ${nps}) — hemen ara`}, 'call', 'high', now() + interval '2 hours', ${r.leadId}, ${l?.ownerId ?? null}, 'form', ${r.id})`;
      await emit(tx as unknown as Tx, r.clinicId, "form.completed", r.id, { formId: r.id, kind: r.kind, title: s.title, nps, leadId: r.leadId, name: l?.fullName, ownerId: l?.ownerId, link: "/leads/" + r.leadId });
    });
    const [cl] = await ownerSql`select settings from clinics where id = ${r.clinicId}`;
    return { ok: true, reviews: nps !== null && nps >= 9 ? ((cl?.settings as any)?.reviewLinks ?? []) : [] };
  });
}
