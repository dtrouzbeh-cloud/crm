// Kayıt araçları: özel alanlar, kayıtlı görünümler, mükerrer hasta tespiti ve birleştirme, lead CSV dışa aktarımı
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { withClinic, type Tx } from "../db.ts";
import { ctx, need, parse, parsePatch, notFound, HttpError, forbidden, type Ctx, qbool } from "../http.ts";
import { audit } from "../services/audit.ts";

const FIELD_TYPES = ["text", "textarea", "number", "date", "select", "multiselect", "boolean", "url"] as const;
// anahtar camelCase üretilir: veritabanı istemcisi JSON anahtarlarını camelCase'e çevirdiği için alt çizgi kullanılmaz
const slug = (s: string) => (s.toLocaleLowerCase("tr").normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/ı/g, "i").replace(/[^a-z0-9]+/g, " ").trim()
  .split(" ").map((w, i) => (i ? w.charAt(0).toUpperCase() + w.slice(1) : w)).join("").replace(/^[0-9]+/, "").slice(0, 40)) || "alan";

/** Özel alan değerlerini tanımlara göre doğrula/dönüştür (bilinmeyen anahtarlar atılır) */
export async function cleanCustom(tx: Tx, clinicId: string, entity: string, input: Record<string, unknown>) {
  const defs = await tx`select key, type, options from custom_fields where clinic_id = ${clinicId} and entity = ${entity} and active`;
  const out: Record<string, unknown> = {};
  for (const d of defs) {
    if (!(d.key in input)) continue;
    let v = input[d.key as string];
    if (v === "" || v === undefined) v = null;
    else if (d.type === "number") { v = Number(v); if (!Number.isFinite(v)) throw new HttpError(400, "bad_custom", `${d.key}: sayı olmalı`); }
    else if (d.type === "boolean") v = v === true || v === "true";
    else if (d.type === "date") { if (!/^\d{4}-\d{2}-\d{2}$/.test(String(v))) throw new HttpError(400, "bad_custom", `${d.key}: tarih YYYY-AA-GG`); }
    else if (d.type === "select") { if (!(d.options as string[]).includes(String(v))) throw new HttpError(400, "bad_custom", `${d.key}: geçersiz seçenek`); }
    else if (d.type === "multiselect") { v = (Array.isArray(v) ? v : [v]).map(String).filter((x) => (d.options as string[]).includes(x)); }
    else if (d.type === "url") { if (!/^https?:\/\//.test(String(v))) throw new HttpError(400, "bad_custom", `${d.key}: http(s) bağlantı`); v = String(v).slice(0, 1000); }
    else v = String(v).slice(0, 4000);
    out[d.key as string] = v;
  }
  return out;
}

const PATIENT_TABLES = ["leads", "cases", "quotes", "deals", "appointments", "conversations", "form_requests", "invoices"] as const;

export function recordRoutes(app: FastifyInstance) {
  // ── Özel alanlar ──
  app.get("/api/custom-fields", async (req) => {
    const c = ctx(req); const q = parse(z.object({ entity: z.enum(["lead", "deal"]).optional(), all: qbool.default(false) }), req.query);
    return withClinic(c.clinicId, (tx) => tx`select * from custom_fields where ${q.entity ? tx`entity = ${q.entity}` : tx`true`} ${q.all ? tx`` : tx`and active`} order by entity, sort, key`);
  });
  const FIELD = z.object({ entity: z.enum(["lead", "deal"]), label: z.string().trim().min(1).max(80), labels: z.record(z.string(), z.string().max(80)).optional(), type: z.enum(FIELD_TYPES),
    options: z.array(z.string().trim().min(1).max(80)).max(50).default([]), required: z.boolean().default(false), showInList: z.boolean().default(false), active: z.boolean().default(true), sort: z.number().int().default(0) });
  app.post("/api/custom-fields", async (req) => {
    const c = need(ctx(req), "settings.manage"); const b = parse(FIELD, req.body);
    if ((b.type === "select" || b.type === "multiselect") && !b.options.length) throw new HttpError(400, "options_required", "Seçenek girin");
    return withClinic(c.clinicId, async (tx) => {
      let key = slug(b.label), i = 1; while ((await tx`select 1 from custom_fields where entity = ${b.entity} and key = ${key}`).length) key = `${slug(b.label)}${++i}`;
      const [f] = await tx`insert into custom_fields (clinic_id, entity, key, label, type, options, required, show_in_list, active, sort)
        values (${c.clinicId}, ${b.entity}, ${key}, ${tx.json({ default: b.label, ...(b.labels ?? {}) } as never)}, ${b.type}, ${tx.json(b.options as never)}, ${b.required}, ${b.showInList}, ${b.active}, ${b.sort}) returning *`;
      await audit(tx, c, "custom_field.create", "custom_field", f!.id as string, { key, entity: b.entity }); return f;
    });
  });
  app.patch("/api/custom-fields/:id", async (req) => {
    const c = need(ctx(req), "settings.manage"); const { id } = req.params as { id: string }; const b = parsePatch(FIELD.partial().omit({ entity: true, type: true }), req.body);
    return withClinic(c.clinicId, async (tx) => {
      const [cur] = await tx`select * from custom_fields where id = ${id}`; if (!cur) throw notFound("Alan");
      const label = b.label !== undefined || b.labels ? { ...(cur.label as object), ...(b.label ? { default: b.label } : {}), ...(b.labels ?? {}) } : cur.label;
      await tx`update custom_fields set label = ${tx.json(label as never)}, options = ${tx.json((b.options ?? cur.options) as never)}, required = ${b.required ?? cur.required},
        show_in_list = ${b.showInList ?? cur.showInList}, active = ${b.active ?? cur.active}, sort = ${b.sort ?? cur.sort} where id = ${id}`;
      await audit(tx, c, "custom_field.update", "custom_field", id); return { ok: true };
    });
  });
  app.delete("/api/custom-fields/:id", async (req) => {
    const c = need(ctx(req), "settings.manage"); const { id } = req.params as { id: string };
    return withClinic(c.clinicId, async (tx) => { await tx`update custom_fields set active = false where id = ${id}`; await audit(tx, c, "custom_field.disable", "custom_field", id); return { ok: true }; });
  });

  // ── Kayıtlı görünümler ──
  app.get("/api/views", async (req) => {
    const c = ctx(req); const q = parse(z.object({ entity: z.string().max(20).default("lead") }), req.query);
    return withClinic(c.clinicId, (tx) => tx`select v.*, u.name as owner_name, (v.user_id = ${c.userId}) as mine from saved_views v left join users u on u.id = v.user_id
      where v.entity = ${q.entity} and (v.user_id = ${c.userId} or v.shared or v.user_id is null) order by v.sort, v.created_at`);
  });
  const VIEW = z.object({ entity: z.string().max(20).default("lead"), name: z.string().trim().min(1).max(60), filters: z.record(z.string(), z.unknown()), shared: z.boolean().default(false) });
  app.post("/api/views", async (req) => {
    const c = ctx(req); const b = parse(VIEW, req.body);
    if (b.shared && !c.perms["settings.manage"] && !c.perms["lead.assign"]) throw forbidden("settings.manage");
    return withClinic(c.clinicId, async (tx) => (await tx`insert into saved_views (clinic_id, user_id, entity, name, filters, shared) values (${c.clinicId}, ${c.userId}, ${b.entity}, ${b.name}, ${tx.json(b.filters as never)}, ${b.shared}) returning *`)[0]);
  });
  const ownView = async (tx: Tx, c: Ctx, id: string) => {
    const [v] = await tx`select * from saved_views where id = ${id}`; if (!v) throw notFound("Görünüm");
    if (v.userId !== c.userId && !c.perms["settings.manage"]) throw forbidden(); return v;
  };
  app.patch("/api/views/:id", async (req) => {
    const c = ctx(req); const { id } = req.params as { id: string }; const b = parsePatch(VIEW.partial(), req.body);
    return withClinic(c.clinicId, async (tx) => { const v = await ownView(tx, c, id);
      await tx`update saved_views set name = ${b.name ?? v.name}, filters = ${tx.json((b.filters ?? v.filters) as never)}, shared = ${b.shared ?? v.shared} where id = ${id}`; return { ok: true }; });
  });
  app.delete("/api/views/:id", async (req) => {
    const c = ctx(req); const { id } = req.params as { id: string };
    return withClinic(c.clinicId, async (tx) => { await ownView(tx, c, id); await tx`delete from saved_views where id = ${id}`; return { ok: true }; });
  });

  // ── Mükerrer hastalar ──
  app.get("/api/patients/duplicates", async (req) => {
    const c = need(ctx(req), "lead.write");
    return withClinic(c.clinicId, async (tx) => {
      // aynı telefon, aynı e-posta, aynı WhatsApp kimliği veya aynı ad+ülke (büyük/küçük harf ve boşluk duyarsız)
      const pairs = await tx`
        with p as (select id, full_name, phone, email, wa_id, country, created_at, regexp_replace(lower(full_name), '[^[:alnum:]]+', '', 'g') as nm from patients where merged_into is null)
        select a.id as a_id, b.id as b_id,
          case when a.phone is not null and a.phone = b.phone then 'phone' when a.email is not null and lower(a.email) = lower(b.email) then 'email'
               when a.wa_id is not null and a.wa_id = b.wa_id then 'whatsapp' else 'name' end as reason
        from p a join p b on a.id < b.id and ((a.phone is not null and a.phone = b.phone) or (a.email is not null and lower(a.email) = lower(b.email))
          or (a.wa_id is not null and a.wa_id = b.wa_id) or (a.nm = b.nm and coalesce(a.country, '') = coalesce(b.country, '') and length(a.nm) > 4))
        limit 200`;
      if (!pairs.length) return [];
      const ids = [...new Set(pairs.flatMap((p) => [p.aId, p.bId]))] as string[];
      const people = await tx`select p.id, p.number, p.full_name, p.phone, p.email, p.country, p.language, p.created_at,
          (select count(*)::int from leads l where l.patient_id = p.id) as leads, (select count(*)::int from deals d where d.patient_id = p.id) as deals,
          (select max(l.last_activity_at) from leads l where l.patient_id = p.id) as last_activity
        from patients p where p.id = any(${ids})`;
      const byId = Object.fromEntries(people.map((p) => [p.id, p]));
      return pairs.map((p) => ({ reason: p.reason, a: byId[p.aId as string], b: byId[p.bId as string] }));
    });
  });
  app.post("/api/patients/merge", async (req) => {
    const c = need(ctx(req), "lead.write"); if (!c.perms["lead.delete"] && !c.perms["settings.manage"]) throw forbidden("lead.delete");
    const b = parse(z.object({ keepId: z.uuid(), mergeId: z.uuid(), fields: z.record(z.string(), z.enum(["keep", "merge"])).default({}) }), req.body);
    if (b.keepId === b.mergeId) throw new HttpError(400, "same", "Aynı kayıt");
    return withClinic(c.clinicId, async (tx) => {
      const [keep] = await tx`select * from patients where id = ${b.keepId} for update`; const [mrg] = await tx`select * from patients where id = ${b.mergeId} for update`;
      if (!keep || !mrg) throw notFound("Hasta");
      // alanlar: seçilen taraftan; seçilmemişse ve tutulan boşsa diğerinden doldur
      const cols: Record<string, string> = { fullName: "full_name", phone: "phone", phoneAlt: "phone_alt", email: "email", country: "country", city: "city", language: "language", timezone: "timezone", birthYear: "birth_year", gender: "gender", waId: "wa_id" };
      const set: Record<string, unknown> = {};
      for (const [k, col] of Object.entries(cols)) {
        const pick = b.fields[k] ?? (keep[k] == null || keep[k] === "" ? "merge" : "keep");
        if (pick === "merge" && mrg[k] != null && mrg[k] !== keep[k]) set[col] = mrg[k];
      }
      // keep'in eski telefonu kaybolmasın
      if (set.phone && keep.phone && !keep.phoneAlt) set.phone_alt = keep.phone; else if (!keep.phoneAlt && mrg.phone && mrg.phone !== (set.phone ?? keep.phone)) set.phone_alt = mrg.phone;
      set.marketing_consent = !!(keep.marketingConsent || mrg.marketingConsent);
      set.external_ids = { ...(mrg.externalIds ?? {}), ...(keep.externalIds ?? {}) };
      // benzersizlik çakışmasını önlemek için birleşecek kaydın anahtarlarını boşalt
      await tx`update patients set wa_id = null, phone = null, email = null where id = ${b.mergeId}`;
      await tx`update patients set ${tx(set as never)} where id = ${b.keepId}`;
      const moved: Record<string, number> = {};
      for (const t of PATIENT_TABLES) { const r = await tx`update ${tx(t)} set patient_id = ${b.keepId} where patient_id = ${b.mergeId} returning 1`; if (r.length) moved[t] = r.length; }
      // tıbbi profil: bayraklar birleşir, boş alanlar doldurulur
      const [mk] = await tx`select * from medical_profiles where patient_id = ${b.keepId}`; const [mm] = await tx`select * from medical_profiles where patient_id = ${b.mergeId}`;
      if (mm && !mk) await tx`update medical_profiles set patient_id = ${b.keepId} where patient_id = ${b.mergeId}`;
      else if (mm && mk) {
        await tx`update medical_profiles set flags = array(select distinct unnest(${[...(mk.flags as string[]), ...(mm.flags as string[])]}::text[])), age = coalesce(age, ${mm.age}),
          medications = coalesce(medications, ${mm.medications}), allergies = coalesce(allergies, ${mm.allergies}), notes = concat_ws(E'\n', notes, ${mm.notes}::text), updated_at = now() where patient_id = ${b.keepId}`;
        await tx`delete from medical_profiles where patient_id = ${b.mergeId}`;
      }
      await tx`insert into patient_merges (clinic_id, kept_id, merged_id, snapshot, moved, user_id) values (${c.clinicId}, ${b.keepId}, ${b.mergeId}, ${tx.json(mrg as never)}, ${tx.json(moved as never)}, ${c.userId})`;
      const leads = await tx`select id from leads where patient_id = ${b.keepId}`;
      for (const l of leads) await tx`insert into lead_events (clinic_id, lead_id, type, body, data, user_id) values (${c.clinicId}, ${l.id}, 'system', 'merged', ${tx.json({ from: mrg.fullName, fromNumber: mrg.number, moved } as never)}, ${c.userId})`;
      await tx`delete from patients where id = ${b.mergeId}`;
      await audit(tx, c, "patient.merge", "patient", b.keepId, { mergedId: b.mergeId, name: mrg.fullName, moved });
      return { ok: true, moved };
    });
  });

  // ── Lead CSV dışa aktarım (alan maskeleri uygulanır) ──
  app.get("/api/leads/export.csv", async (req, reply) => {
    const c = need(ctx(req), "lead.export");
    const rows = await withClinic(c.clinicId, async (tx) => {
      const defs = await tx`select key from custom_fields where entity = 'lead' and active order by sort, key`;
      const own = c.perms["lead.read"] === "own";
      const data = await tx`select l.number, p.full_name, p.phone, p.email, p.country, p.language, l.stage, l.temperature, l.source, l.campaign, u.name as owner, l.interest, l.budget, l.created_at, l.last_activity_at, l.tags, l.custom, pt.name as partner
        from leads l join patients p on p.id = l.patient_id left join users u on u.id = l.owner_id left join partners pt on pt.id = l.partner_id
        where l.archived_at is null ${own ? tx`and l.owner_id = ${c.userId}` : tx``} order by l.created_at desc limit 20000`;
      await audit(tx, c, "lead.export", "lead", null, { n: data.length });
      const mask = (v: unknown, k: "field.phone" | "field.email") => c.perms[k] === "show" ? v : c.perms[k] === "mask" && v ? String(v).replace(/.(?=.{3})/g, "•") : "";
      return data.map((r) => { const o: Record<string, unknown> = { ...r, phone: mask(r.phone, "field.phone"), email: mask(r.email, "field.email"), tags: (r.tags as string[]).join("|") };
        delete o.custom; for (const d of defs) { const v = (r.custom as any)?.[d.key as string]; o["cf_" + d.key] = Array.isArray(v) ? v.join("|") : v ?? ""; } return o; });
    });
    const cols = rows.length ? Object.keys(rows[0]!) : ["number"];
    const esc = (v: unknown) => { const s = v == null ? "" : v instanceof Date ? v.toISOString() : String(v); return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    reply.header("Content-Type", "text/csv; charset=utf-8").header("Content-Disposition", `attachment; filename="leads-${new Date().toISOString().slice(0, 10)}.csv"`);
    return "﻿" + [cols.join(","), ...rows.map((r) => cols.map((k) => esc(r[k])).join(","))].join("\n");
  });
}
