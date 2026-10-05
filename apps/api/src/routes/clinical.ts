// Klinik modüller: laboratuvar siparişleri (risk/gecikme, teslimde gider), implant kayıtları (lot araması), garanti belgesi (+ herkese açık kart), şikâyetler
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { withClinic, ownerSql, type Tx } from "../db.ts";
import { ctx, need, parse, parsePatch, notFound, HttpError, forbidden, type Ctx } from "../http.ts";
import { audit, emit } from "../services/audit.ts";
import { randomToken, sha256, encrypt, decrypt } from "../lib/crypto.ts";
import { addToPipeline } from "../services/pipelines.ts";
import { notifyUser } from "../services/notify.ts";
import { config } from "../config.ts";

const clinicalWrite = (c: Ctx) => { if (!c.perms["case.write"] && !c.perms["deal.write"] && !c.perms["trip.manage"]) throw forbidden("case.write"); return c; };
const clinicalRead = (c: Ctx) => { if (!c.perms["case.read"] && !c.perms["deal.read"]) throw forbidden("case.read"); return c; };
const next = async (tx: Tx, clinicId: string, name: string) => Number((await tx`select next_number(${clinicId}, ${name}) as n`)[0]!.n);

// varsayılan garanti süreleri (yıl; null = ömür boyu). Klinik ayarlarından (settings.warranty) değiştirilebilir.
export const WARRANTY_DEFAULT: Record<string, number | null> = { implant: null, implant_imm: null, crown_imp: 10, crown_zr: 10, crown_emax: 10, crown_pfm: 5, crown_por: 5, bridge_unit: 10,
  veneer_por: 10, veneer_emax: 10, inlay: 5, filling: 2, rct: 2, rct_re: 2, denture: 3, snapon: 5, hybrid: 5, ti_bar: 10, ao4_u: 10, ao4_l: 10, ao6_u: 10, ao6_l: 10, fp_u: 10, fp_l: 10,
  smile_emax_u: 10, smile_zr_u: 10, smile_zr_l: 10, snap_u: 5, snap_l: 5 };
const LAB_TX = new Set(["crown_imp", "crown_zr", "crown_emax", "crown_pfm", "crown_por", "bridge_unit", "veneer_por", "veneer_emax", "inlay", "denture", "snapon", "hybrid", "ti_bar", "temp_fix", "temp_rem", "temp_on_imp", "nightguard"]);
const LAB_BUNDLE = /^(ao[46]|fp|smile|snap)_/;

const LAB_ITEM = z.object({ desc: z.string().trim().min(1).max(300), teeth: z.array(z.number().int().min(11).max(48)).max(32).default([]), material: z.string().max(80).optional(), qty: z.number().int().min(1).max(64).default(1) });

export function clinicalRoutes(app: FastifyInstance) {
  // ── laboratuvarlar ──
  app.get("/api/labs", async (req) => { const c = clinicalRead(ctx(req)); return withClinic(c.clinicId, (tx) => tx`select l.*, (select count(*)::int from lab_orders o where o.lab_id = l.id and o.status not in ('delivered','canceled')) as open_orders from labs l order by l.active desc, l.name`); });
  const LAB = z.object({ name: z.string().trim().min(1).max(120), contact: z.string().max(120).nullable().optional(), phone: z.string().max(40).nullable().optional(), email: z.email().nullable().optional().or(z.literal("")), avgDays: z.number().int().min(1).max(90).default(5), active: z.boolean().default(true) });
  app.post("/api/labs", async (req) => { const c = need(ctx(req), "settings.manage"); const b = parse(LAB, req.body);
    return withClinic(c.clinicId, async (tx) => (await tx`insert into labs (clinic_id, name, contact, phone, email, avg_days, active) values (${c.clinicId}, ${b.name}, ${b.contact ?? null}, ${b.phone ?? null}, ${b.email || null}, ${b.avgDays}, ${b.active}) returning *`)[0]); });
  app.patch("/api/labs/:id", async (req) => { const c = need(ctx(req), "settings.manage"); const { id } = req.params as { id: string }; const b = parsePatch(LAB.partial(), req.body);
    const map: Record<string, string> = { name: "name", contact: "contact", phone: "phone", email: "email", avgDays: "avg_days", active: "active" }; const set: Record<string, unknown> = {};
    for (const [k, col] of Object.entries(map)) if ((b as any)[k] !== undefined) set[col] = (b as any)[k] === "" ? null : (b as any)[k];
    return withClinic(c.clinicId, async (tx) => { if (Object.keys(set).length) await tx`update labs set ${tx(set as never)} where id = ${id}`; return { ok: true }; }); });

  // ── laboratuvar siparişleri ──
  const orderSelect = (tx: Tx) => tx`select o.*, lb.name as lab_name, p.full_name, d.number as deal_number,
      (select v.arrival_at from deal_visits v where v.deal_id = o.deal_id and v.visit_no = o.visit_no) as visit_arrival_at,
      (o.status not in ('delivered','canceled') and o.due_at < now()) as overdue,
      (o.status not in ('delivered','canceled') and o.due_at is not null and exists (select 1 from deal_visits v where v.deal_id = o.deal_id and v.visit_no = o.visit_no and v.arrival_at is not null and o.due_at > v.arrival_at - interval '1 day')) as at_risk
    from lab_orders o join leads l on l.id = o.lead_id join patients p on p.id = l.patient_id left join labs lb on lb.id = o.lab_id left join deals d on d.id = o.deal_id`;
  app.get("/api/lab-orders", async (req) => {
    const c = clinicalRead(ctx(req)); const q = parse(z.object({ status: z.string().optional(), dealId: z.uuid().optional(), leadId: z.uuid().optional(), open: z.coerce.boolean().optional() }), req.query);
    return withClinic(c.clinicId, (tx) => tx`${orderSelect(tx)} where true ${q.status ? tx`and o.status = ${q.status}` : tx``} ${q.dealId ? tx`and o.deal_id = ${q.dealId}` : tx``} ${q.leadId ? tx`and o.lead_id = ${q.leadId}` : tx``}
      ${q.open ? tx`and o.status not in ('delivered','canceled')` : tx``} order by coalesce(o.due_at, o.created_at) limit 500`);
  });
  // deal'den taslak: kabul edilen plandaki protetik kalemler
  app.post("/api/lab-orders", async (req) => {
    const c = clinicalWrite(ctx(req));
    const b = parse(z.object({ dealId: z.uuid().optional(), leadId: z.uuid().optional(), labId: z.uuid().nullable().optional(), visitNo: z.number().int().min(1).max(20).optional(), items: z.array(LAB_ITEM).max(60).optional(), shade: z.string().max(40).optional(), notes: z.string().max(2000).optional(), dueAt: z.iso.datetime().optional(), costMinor: z.number().int().min(0).optional(), currency: z.string().length(3).optional() }), req.body);
    return withClinic(c.clinicId, async (tx) => {
      let leadId = b.leadId, items = b.items, visitNo = b.visitNo ?? null;
      if (b.dealId) {
        const [d] = await tx`select lead_id, accepted_option from deals where id = ${b.dealId}`; if (!d) throw notFound("Deal");
        leadId = d.leadId as string;
        if (!items) { const lines = ((d.acceptedOption as any)?.calc?.lines ?? []).filter((l: any) => LAB_TX.has(l.txId) || LAB_BUNDLE.test(l.b ?? ""));
          items = lines.map((l: any) => ({ desc: l.nm + (l.br ? " · " + l.br : ""), teeth: l.teeth ?? [], qty: Number(l.qty) || 1 }));
          visitNo = visitNo ?? (lines.length ? Math.max(...lines.map((l: any) => l.v)) : null); }
      }
      if (!leadId) throw new HttpError(400, "lead_required", "Hasta seçin");
      const [lab] = b.labId ? await tx`select avg_days from labs where id = ${b.labId}` : [null];
      const due = b.dueAt ? new Date(b.dueAt) : lab ? new Date(Date.now() + (lab.avgDays as number) * 86400000) : null;
      const number = await next(tx, c.clinicId, "lab");
      const [o] = await tx`insert into lab_orders (clinic_id, number, lead_id, deal_id, lab_id, visit_no, items, shade, notes, due_at, cost_minor, currency, created_by, history)
        values (${c.clinicId}, ${number}, ${leadId}, ${b.dealId ?? null}, ${b.labId ?? null}, ${visitNo}, ${tx.json((items ?? []) as never)}, ${b.shade ?? null}, ${b.notes ?? null}, ${due}, ${b.costMinor ?? null}, ${b.currency ?? null}, ${c.userId},
          ${tx.json([{ status: "draft", at: new Date().toISOString(), userId: c.userId }] as never)}) returning *`;
      await audit(tx, c, "lab_order.create", "lab_order", o!.id as string, { number }); return o;
    });
  });
  app.patch("/api/lab-orders/:id", async (req) => {
    const c = clinicalWrite(ctx(req)); const { id } = req.params as { id: string };
    const b = parsePatch(z.object({ labId: z.uuid().nullable(), visitNo: z.number().int().nullable(), items: z.array(LAB_ITEM).max(60), shade: z.string().max(40).nullable(), notes: z.string().max(2000).nullable(), dueAt: z.iso.datetime().nullable(),
      costMinor: z.number().int().min(0).nullable(), currency: z.string().length(3).nullable(), fileIds: z.array(z.uuid()).max(30),
      status: z.enum(["draft", "sent", "in_production", "try_in", "ready", "delivered", "remake", "canceled"]), statusNote: z.string().max(500) }).partial(), req.body);
    return withClinic(c.clinicId, async (tx) => {
      const [o] = await tx`select o.*, lb.name as lab_name from lab_orders o left join labs lb on lb.id = o.lab_id where o.id = ${id} for update of o`; if (!o) throw notFound("Sipariş");
      const map: Record<string, string> = { labId: "lab_id", visitNo: "visit_no", shade: "shade", notes: "notes", dueAt: "due_at", costMinor: "cost_minor", currency: "currency", fileIds: "file_ids" };
      const set: Record<string, unknown> = {}; for (const [k, col] of Object.entries(map)) if ((b as any)[k] !== undefined) set[col] = (b as any)[k];
      if (b.items) set.items = tx.json(b.items as never);
      if (b.status && b.status !== o.status) {
        set.status = b.status; set.history = tx.json([...(o.history as unknown[]), { status: b.status, at: new Date().toISOString(), userId: c.userId, note: b.statusNote ?? null }] as never);
        if (b.status === "sent" && !o.sentAt) set.sent_at = new Date();
        if (b.status === "delivered") set.delivered_at = new Date();
      }
      if (Object.keys(set).length) await tx`update lab_orders set ${tx(set as never)} where id = ${id}`;
      // teslimde maliyet → gider (bir kez)
      const cost = b.costMinor !== undefined ? b.costMinor : o.costMinor, cur = b.currency !== undefined ? b.currency : o.currency;
      if (b.status === "delivered" && cost && cur && !o.expenseId) {
        const [e] = await tx`insert into expenses (clinic_id, category, vendor, description, amount_minor, currency, deal_id, created_by) values (${c.clinicId}, 'lab', ${o.labName ?? null}, ${"Lab #" + o.number}, ${cost}, ${cur}, ${o.dealId}, ${c.userId}) returning id`;
        await tx`update lab_orders set expense_id = ${e!.id} where id = ${id}`;
      }
      if (b.status && b.status !== o.status) {
        await tx`insert into lead_events (clinic_id, lead_id, type, body, data, user_id) values (${c.clinicId}, ${o.leadId}, 'system', 'lab', ${tx.json({ number: o.number, status: b.status } as never)}, ${c.userId})`;
        await emit(tx, c.clinicId, "lab.status", id, { leadId: o.leadId, dealId: o.dealId, status: b.status, number: o.number });
      }
      await audit(tx, c, "lab_order.update", "lab_order", id, { ...b }); return { ok: true };
    });
  });

  // ── implant kayıtları ──
  const IMP = z.object({ tooth: z.number().int().min(11).max(48), brand: z.string().trim().min(1).max(80), system: z.string().max(80).nullable().optional(), diameter: z.number().min(2).max(8).nullable().optional(), length: z.number().min(4).max(25).nullable().optional(),
    lot: z.string().max(60).nullable().optional(), serial: z.string().max(60).nullable().optional(), refCode: z.string().max(60).nullable().optional(), abutment: z.string().max(120).nullable().optional(), torqueNcm: z.number().int().min(0).max(100).nullable().optional(),
    placedAt: z.iso.date().optional(), dentistId: z.uuid().nullable().optional(), notes: z.string().max(1000).nullable().optional(), removedAt: z.iso.date().nullable().optional() });
  app.get("/api/implants", async (req) => {
    const c = clinicalRead(ctx(req)); const q = parse(z.object({ leadId: z.uuid().optional(), dealId: z.uuid().optional(), lot: z.string().max(60).optional(), brand: z.string().max(80).optional() }), req.query);
    return withClinic(c.clinicId, (tx) => tx`select i.*, p.full_name, p.phone, p.email, u.name as dentist_name from implant_records i join leads l on l.id = i.lead_id join patients p on p.id = l.patient_id left join users u on u.id = i.dentist_id
      where true ${q.leadId ? tx`and i.lead_id = ${q.leadId}` : tx``} ${q.dealId ? tx`and i.deal_id = ${q.dealId}` : tx``} ${q.lot ? tx`and lower(i.lot) = lower(${q.lot})` : tx``} ${q.brand ? tx`and i.brand ilike ${"%" + q.brand + "%"}` : tx``}
      order by i.placed_at desc, i.tooth limit 1000`);
  });
  app.post("/api/implants", async (req) => {
    const c = clinicalWrite(ctx(req)); const b = parse(IMP.extend({ leadId: z.uuid(), dealId: z.uuid().nullable().optional() }), req.body);
    return withClinic(c.clinicId, async (tx) => {
      const [l] = await tx`select id from leads where id = ${b.leadId}`; if (!l) throw notFound("Lead");
      const [r] = await tx`insert into implant_records (clinic_id, lead_id, deal_id, tooth, brand, system, diameter, length, lot, serial, ref_code, abutment, torque_ncm, placed_at, dentist_id, notes)
        values (${c.clinicId}, ${b.leadId}, ${b.dealId ?? null}, ${b.tooth}, ${b.brand}, ${b.system ?? null}, ${b.diameter ?? null}, ${b.length ?? null}, ${b.lot ?? null}, ${b.serial ?? null}, ${b.refCode ?? null}, ${b.abutment ?? null}, ${b.torqueNcm ?? null}, ${b.placedAt ?? new Date().toISOString().slice(0, 10)}, ${b.dentistId ?? c.userId}, ${b.notes ?? null}) returning *`;
      await audit(tx, c, "implant.create", "lead", b.leadId, { tooth: b.tooth, brand: b.brand, lot: b.lot }); return r;
    });
  });
  app.patch("/api/implants/:id", async (req) => {
    const c = clinicalWrite(ctx(req)); const { id } = req.params as { id: string }; const b = parsePatch(IMP.partial(), req.body);
    const map: Record<string, string> = { tooth: "tooth", brand: "brand", system: "system", diameter: "diameter", length: "length", lot: "lot", serial: "serial", refCode: "ref_code", abutment: "abutment", torqueNcm: "torque_ncm", placedAt: "placed_at", dentistId: "dentist_id", notes: "notes", removedAt: "removed_at" };
    const set: Record<string, unknown> = {}; for (const [k, col] of Object.entries(map)) if ((b as any)[k] !== undefined) set[col] = (b as any)[k];
    return withClinic(c.clinicId, async (tx) => { if (Object.keys(set).length) await tx`update implant_records set ${tx(set as never)} where id = ${id}`; await audit(tx, c, "implant.update", "implant", id, set); return { ok: true }; });
  });

  // ── garanti ──
  app.post("/api/warranties", async (req) => {
    const c = clinicalWrite(ctx(req));
    const b = parse(z.object({ dealId: z.uuid(), items: z.array(z.object({ desc: z.string().max(300), teeth: z.array(z.number().int()).default([]), years: z.number().int().min(0).max(50).nullable() })).max(60).optional(), conditions: z.string().max(4000).optional(), lang: z.string().min(2).max(5).optional() }), req.body);
    return withClinic(c.clinicId, async (tx) => {
      const [d] = await tx`select d.lead_id, d.accepted_option, p.language from deals d join patients p on p.id = d.patient_id where d.id = ${b.dealId}`; if (!d) throw notFound("Deal");
      const [cl] = await tx`select settings from clinics where id = ${c.clinicId}`; const over = ((cl!.settings as any)?.warranty ?? {}) as Record<string, number | null>;
      const items = b.items ?? ((d.acceptedOption as any)?.calc?.lines ?? []).map((l: any) => { const k = l.txId ?? l.b; const y = k in over ? over[k] : WARRANTY_DEFAULT[k]; return y === undefined ? null : { desc: l.nm + (l.br ? " · " + l.br : ""), teeth: l.teeth ?? [], years: y }; }).filter(Boolean);
      if (!items.length) throw new HttpError(400, "no_items", "Garanti kapsamına giren tedavi yok");
      await tx`update warranties set status = 'void' where deal_id = ${b.dealId} and status = 'active'`;
      const token = randomToken(16), number = await next(tx, c.clinicId, "warranty");
      const lang = b.lang ?? (d.language as string) ?? "en";
      const [w] = await tx`insert into warranties (clinic_id, number, lead_id, deal_id, items, conditions, lang, token_hash, token_enc, created_by)
        values (${c.clinicId}, ${number}, ${d.leadId}, ${b.dealId}, ${tx.json(items as never)}, ${b.conditions ?? ((cl!.settings as any)?.warrantyConditions ?? null)}, ${lang}, ${sha256(token)}, ${encrypt(token)}, ${c.userId}) returning id, number`;
      await tx`insert into lead_events (clinic_id, lead_id, type, body, data, user_id) values (${c.clinicId}, ${d.leadId}, 'system', 'warranty', ${tx.json({ number } as never)}, ${c.userId})`;
      await audit(tx, c, "warranty.issue", "deal", b.dealId, { number }); return { id: w!.id, number, url: `${config.appUrl}/w/${token}` };
    });
  });
  app.get("/api/warranties", async (req) => {
    const c = clinicalRead(ctx(req)); const q = parse(z.object({ dealId: z.uuid().optional(), leadId: z.uuid().optional() }), req.query);
    return withClinic(c.clinicId, async (tx) => (await tx`select * from warranties where ${q.dealId ? tx`deal_id = ${q.dealId}` : q.leadId ? tx`lead_id = ${q.leadId}` : tx`true`} order by issued_at desc limit 200`)
      .map(({ tokenHash, tokenEnc, ...w }) => ({ ...w, url: w.status === "active" && tokenEnc ? `${config.appUrl}/w/${decrypt(tokenEnc as string)}` : null })));
  });
  app.get("/api/public/w/:token", async (req) => {
    const { token } = req.params as { token: string };
    const [w] = await ownerSql`select w.*, p.full_name, cl.name as clinic_name, cl.brand_color, cl.phone as clinic_phone, cl.email as clinic_email, cl.website, cl.address, cl.city, cl.country as clinic_country
      from warranties w join leads l on l.id = w.lead_id join patients p on p.id = l.patient_id join clinics cl on cl.id = w.clinic_id where w.token_hash = ${sha256(token)}`;
    if (!w) throw notFound("Garanti");
    const implants = await ownerSql`select tooth, brand, system, diameter, length, lot, serial, ref_code, abutment, placed_at from implant_records where lead_id = ${w.leadId} and removed_at is null and (deal_id = ${w.dealId} or deal_id is null) order by tooth`;
    return { number: w.number, status: w.status, issuedAt: w.issuedAt, lang: w.lang, items: w.items, conditions: w.conditions, patient: w.fullName, implants,
      clinic: { name: w.clinicName, color: w.brandColor, phone: w.clinicPhone, email: w.clinicEmail, website: w.website, address: [w.address, w.city, w.clinicCountry].filter(Boolean).join(", ") } };
  });

  // ── şikâyetler ──
  const COMP = z.object({ leadId: z.uuid(), dealId: z.uuid().nullable().optional(), category: z.enum(["pain", "broken", "loose", "aesthetic", "bite", "implant_failure", "infection", "service", "other"]), teeth: z.array(z.number().int().min(11).max(48)).max(32).default([]),
    description: z.string().trim().min(3).max(4000), fileIds: z.array(z.uuid()).max(20).default([]), source: z.enum(["staff", "patient", "whatsapp"]).default("staff") });
  app.get("/api/complaints", async (req) => {
    const c = clinicalRead(ctx(req)); const q = parse(z.object({ status: z.string().optional(), leadId: z.uuid().optional() }), req.query);
    return withClinic(c.clinicId, (tx) => tx`select x.*, p.full_name, u.name as owner_name, d.number as deal_number from complaints x join leads l on l.id = x.lead_id join patients p on p.id = l.patient_id left join users u on u.id = x.owner_id left join deals d on d.id = x.deal_id
      where true ${q.status ? (q.status === "open_all" ? tx`and x.status in ('open','reviewing','in_progress')` : tx`and x.status = ${q.status}`) : tx``} ${q.leadId ? tx`and x.lead_id = ${q.leadId}` : tx``} order by x.opened_at desc limit 500`);
  });
  app.post("/api/complaints", async (req) => {
    const c = ctx(req); if (!c.perms["lead.write"]) throw forbidden("lead.write"); const b = parse(COMP, req.body);
    return withClinic(c.clinicId, async (tx) => {
      const [l] = await tx`select l.id, l.owner_id, p.full_name from leads l join patients p on p.id = l.patient_id where l.id = ${b.leadId}`; if (!l) throw notFound("Lead");
      const dealId = b.dealId ?? ((await tx`select id from deals where lead_id = ${b.leadId} order by created_at desc limit 1`)[0]?.id as string | undefined) ?? null;
      // garanti kapsamı ön değerlendirmesi: aktif garantide ilgili diş varsa
      const [w] = dealId ? await tx`select items, issued_at from warranties where deal_id = ${dealId} and status = 'active' limit 1` : [null];
      const covered = w ? (w.items as any[]).some((it) => (!b.teeth.length || it.teeth.some((t: number) => b.teeth.includes(t))) && (it.years === null || new Date(w.issuedAt as Date).getTime() + it.years * 365.25 * 86400000 > Date.now())) : null;
      const number = await next(tx, c.clinicId, "complaint");
      const [x] = await tx`insert into complaints (clinic_id, number, lead_id, deal_id, category, teeth, description, file_ids, source, owner_id, warranty_covered)
        values (${c.clinicId}, ${number}, ${b.leadId}, ${dealId}, ${b.category}, ${b.teeth}, ${b.description}, ${b.fileIds}, ${b.source}, ${l.ownerId}, ${covered}) returning *`;
      const itemId = await addToPipeline(tx, c.clinicId, "aftercare", b.leadId, { dealId });
      if (itemId) { const [st] = await tx`select s.id from pipeline_stages s join pipeline_items i on i.pipeline_id = s.pipeline_id where i.id = ${itemId} and s.key = 'complaint'`; if (st) await tx`update pipeline_items set stage_id = ${st.id}, status = 'open' where id = ${itemId}`; }
      await tx`insert into lead_events (clinic_id, lead_id, type, body, data, user_id) values (${c.clinicId}, ${b.leadId}, 'system', 'complaint', ${tx.json({ number, category: b.category } as never)}, ${c.userId})`;
      await emit(tx, c.clinicId, "complaint.created", x!.id as string, { leadId: b.leadId, name: l.fullName, ownerId: l.ownerId, category: b.category, number, link: "/leads/" + b.leadId });
      await audit(tx, c, "complaint.create", "lead", b.leadId, { number });
      if (l.ownerId) setImmediate(() => notifyUser(c.clinicId, l.ownerId as string, "complaint.created", `⚠️ ${l.fullName}: şikâyet #${number}`, "/leads/" + b.leadId).catch(() => {}));
      return x;
    });
  });
  app.patch("/api/complaints/:id", async (req) => {
    const c = ctx(req); if (!c.perms["lead.write"]) throw forbidden("lead.write"); const { id } = req.params as { id: string };
    const b = parsePatch(z.object({ status: z.enum(["open", "reviewing", "in_progress", "resolved", "rejected"]), warrantyCovered: z.boolean().nullable(), resolution: z.string().max(4000).nullable(), costMinor: z.number().int().min(0).nullable(), currency: z.string().length(3).nullable(), ownerId: z.uuid().nullable() }).partial(), req.body);
    const map: Record<string, string> = { status: "status", warrantyCovered: "warranty_covered", resolution: "resolution", costMinor: "cost_minor", currency: "currency", ownerId: "owner_id" };
    const set: Record<string, unknown> = {}; for (const [k, col] of Object.entries(map)) if ((b as any)[k] !== undefined) set[col] = (b as any)[k];
    if (b.status === "resolved" || b.status === "rejected") set.resolved_at = new Date();
    return withClinic(c.clinicId, async (tx) => { const [x] = await tx`update complaints set ${tx(set as never)} where id = ${id} returning lead_id, number`; if (!x) throw notFound("Şikâyet");
      if (b.status) await tx`insert into lead_events (clinic_id, lead_id, type, body, data, user_id) values (${c.clinicId}, ${x.leadId}, 'system', 'complaint', ${tx.json({ number: x.number, status: b.status } as never)}, ${c.userId})`;
      await audit(tx, c, "complaint.update", "complaint", id, b); return { ok: true }; });
  });
}
