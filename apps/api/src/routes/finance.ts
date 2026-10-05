// Finans: iş ortakları, komisyon kuralları/hak edişler, giderler, faturalar (fatura/proforma/makbuz/iade faturası), özet ve CSV dışa aktarım
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { withClinic, type Tx } from "../db.ts";
import { ctx, need, parse, parsePatch, notFound, HttpError, forbidden, type Ctx } from "../http.ts";
import { audit } from "../services/audit.ts";
import { invoiceTotals, nextInvoiceNumber, linesFromDeal, type InvLine } from "../services/finance.ts";
import { randomToken } from "../lib/crypto.ts";

const finView = (c: Ctx) => { if (!c.perms["finance.view"] && !c.perms["finance.manage"]) throw forbidden("finance.view"); return c; };
const invView = (c: Ctx) => { if (!c.perms["finance.view"] && !c.perms["payment.record"]) throw forbidden("finance.view"); return c; };
const invWrite = (c: Ctx) => { if (!c.perms["finance.manage"] && !c.perms["payment.record"]) throw forbidden("finance.manage"); return c; };
const range = z.object({ from: z.iso.date().optional(), to: z.iso.date().optional() });
const LINE = z.object({ desc: z.string().trim().min(1).max(500), qty: z.number().min(-10000).max(10000), unitMinor: z.number().int(), taxBps: z.number().int().min(0).max(10000).default(0) });
const CATS = ["lab", "materials", "hotel", "transfer", "flight", "marketing", "commission", "salary", "rent", "software", "other"] as const;
const L10N: Record<string, { discount: string; teeth: string; payment: string }> = {
  en: { discount: "Discount & rounding", teeth: "teeth", payment: "Payment received" }, tr: { discount: "İndirim ve yuvarlama", teeth: "diş", payment: "Alınan ödeme" },
  de: { discount: "Rabatt & Rundung", teeth: "Zähne", payment: "Zahlungseingang" }, ar: { discount: "خصم وتقريب", teeth: "أسنان", payment: "دفعة مستلمة" },
};

function csv(rows: Record<string, unknown>[]) {
  if (!rows.length) return "";
  const cols = Object.keys(rows[0]!); const esc = (v: unknown) => { const s = v == null ? "" : v instanceof Date ? v.toISOString() : typeof v === "object" ? JSON.stringify(v) : String(v); return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return "﻿" + [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
}

async function sellerOf(tx: Tx, clinicId: string) {
  const [cl] = await tx`select name, legal_name, address, city, country, tax_id, email, phone, website, logo_file_id, settings from clinics where id = ${clinicId}`;
  return { cl: cl!, seller: { name: cl!.legalName || cl!.name, brand: cl!.name, address: [cl!.address, cl!.city, cl!.country].filter(Boolean).join(", "), taxId: cl!.taxId, email: cl!.email, phone: cl!.phone, website: cl!.website, logo: cl!.logoFileId ?? null,
    iban: (cl!.settings as any)?.invoice?.bank ?? null, footer: (cl!.settings as any)?.invoice?.footer ?? null } };
}

export function financeRoutes(app: FastifyInstance) {
  // ── İş ortakları ──
  app.get("/api/partners", async (req) => {
    const c = ctx(req); if (!c.perms["lead.read"] && !c.perms["finance.view"]) throw forbidden();
    const full = !!(c.perms["finance.view"] || c.perms["finance.manage"]);
    return withClinic(c.clinicId, async (tx) => {
      const rows = await tx`select pt.*, (select count(*)::int from leads l where l.partner_id = pt.id) as leads,
          (select count(*)::int from deals d join leads l on l.id = d.lead_id where l.partner_id = pt.id) as deals,
          (select coalesce(sum(cm.amount_minor),0)::bigint from commissions cm where cm.partner_id = pt.id and cm.status in ('pending','approved')) as due_minor,
          (select coalesce(sum(cm.amount_minor),0)::bigint from commissions cm where cm.partner_id = pt.id and cm.status = 'paid') as paid_minor
        from partners pt order by pt.active desc, pt.name`;
      return full ? rows : rows.map((r) => ({ id: r.id, name: r.name, type: r.type, active: r.active, refCode: r.refCode }));
    });
  });
  const PARTNER = z.object({ name: z.string().trim().min(1).max(160), type: z.enum(["agency", "referrer", "influencer", "doctor", "other"]).default("agency"), email: z.email().nullable().optional().or(z.literal("")),
    phone: z.string().max(40).nullable().optional(), country: z.string().max(2).nullable().optional(), commissionBps: z.number().int().min(0).max(10000).default(0),
    refCode: z.string().trim().regex(/^[A-Za-z0-9_-]{2,40}$/).nullable().optional().or(z.literal("")), active: z.boolean().default(true), notes: z.string().max(4000).nullable().optional() });
  app.post("/api/partners", async (req) => {
    const c = need(ctx(req), "finance.manage"); const b = parse(PARTNER, req.body);
    return withClinic(c.clinicId, async (tx) => {
      const [p] = await tx`insert into partners (clinic_id, name, type, email, phone, country, commission_bps, ref_code, active, notes)
        values (${c.clinicId}, ${b.name}, ${b.type}, ${b.email || null}, ${b.phone ?? null}, ${b.country ?? null}, ${b.commissionBps}, ${b.refCode || randomToken(4).replace(/[^A-Za-z0-9]/g, "x").toUpperCase()}, ${b.active}, ${b.notes ?? null}) returning *`;
      await audit(tx, c, "partner.create", "partner", p!.id as string); return p;
    });
  });
  app.patch("/api/partners/:id", async (req) => {
    const c = need(ctx(req), "finance.manage"); const { id } = req.params as { id: string }; const b = parsePatch(PARTNER.partial(), req.body);
    const map: Record<string, string> = { name: "name", type: "type", email: "email", phone: "phone", country: "country", commissionBps: "commission_bps", refCode: "ref_code", active: "active", notes: "notes" };
    const set: Record<string, unknown> = {}; for (const [k, col] of Object.entries(map)) if ((b as any)[k] !== undefined) set[col] = (b as any)[k] === "" ? null : (b as any)[k];
    return withClinic(c.clinicId, async (tx) => {
      if (!Object.keys(set).length) return { ok: true };
      const [p] = await tx`update partners set ${tx(set as never)} where id = ${id} returning *`; if (!p) throw notFound("Ortak");
      await audit(tx, c, "partner.update", "partner", id, set); return p;
    });
  });

  // ── Komisyon kuralları ──
  app.get("/api/finance/commission-rules", async (req) => { const c = finView(ctx(req)); return withClinic(c.clinicId, (tx) => tx`select r.*, u.name as user_name from commission_rules r left join users u on u.id = r.user_id order by r.created_at`); });
  const RULE = z.object({ name: z.string().trim().min(1).max(120), recipient: z.enum(["deal_owner", "user", "lead_partner"]), userId: z.uuid().nullable().optional(), role: z.string().max(30).nullable().optional(),
    rateBps: z.number().int().min(0).max(10000), source: z.string().max(40).nullable().optional(), active: z.boolean().default(true) });
  app.post("/api/finance/commission-rules", async (req) => {
    const c = need(ctx(req), "finance.manage"); const b = parse(RULE, req.body);
    if (b.recipient === "user" && !b.userId) throw new HttpError(400, "user_required", "Kullanıcı seçin");
    return withClinic(c.clinicId, async (tx) => {
      const [r] = await tx`insert into commission_rules (clinic_id, name, recipient, user_id, role, rate_bps, source, active) values (${c.clinicId}, ${b.name}, ${b.recipient}, ${b.userId ?? null}, ${b.role || null}, ${b.rateBps}, ${b.source || null}, ${b.active}) returning *`;
      await audit(tx, c, "commission_rule.create", "commission_rule", r!.id as string, b); return r;
    });
  });
  app.patch("/api/finance/commission-rules/:id", async (req) => {
    const c = need(ctx(req), "finance.manage"); const { id } = req.params as { id: string }; const b = parsePatch(RULE.partial(), req.body);
    const map: Record<string, string> = { name: "name", recipient: "recipient", userId: "user_id", role: "role", rateBps: "rate_bps", source: "source", active: "active" };
    const set: Record<string, unknown> = {}; for (const [k, col] of Object.entries(map)) if ((b as any)[k] !== undefined) set[col] = (b as any)[k] === "" ? null : (b as any)[k];
    return withClinic(c.clinicId, async (tx) => { if (Object.keys(set).length) await tx`update commission_rules set ${tx(set as never)} where id = ${id}`; await audit(tx, c, "commission_rule.update", "commission_rule", id, set); return { ok: true }; });
  });
  app.delete("/api/finance/commission-rules/:id", async (req) => {
    const c = need(ctx(req), "finance.manage"); const { id } = req.params as { id: string };
    return withClinic(c.clinicId, async (tx) => { await tx`update commission_rules set active = false where id = ${id}`; await audit(tx, c, "commission_rule.disable", "commission_rule", id); return { ok: true }; });
  });

  // ── Hak edişler ──
  const commissionList = (tx: Tx, where: any) => tx`select cm.*, u.name as user_name, pt.name as partner_name, d.number as deal_number, d.title as deal_title, p.full_name as patient_name, r.name as rule_name, py.kind as payment_kind, py.received_at
    from commissions cm join deals d on d.id = cm.deal_id join patients p on p.id = d.patient_id join payments py on py.id = cm.payment_id
    left join users u on u.id = cm.user_id left join partners pt on pt.id = cm.partner_id left join commission_rules r on r.id = cm.rule_id
    where ${where} order by cm.created_at desc limit 1000`;
  app.get("/api/finance/commissions", async (req) => {
    const c = finView(ctx(req));
    const q = parse(range.extend({ status: z.enum(["pending", "approved", "paid", "void"]).optional(), userId: z.uuid().optional(), partnerId: z.uuid().optional() }), req.query);
    return withClinic(c.clinicId, async (tx) => {
      const w = tx`true ${q.status ? tx`and cm.status = ${q.status}` : tx``} ${q.userId ? tx`and cm.user_id = ${q.userId}` : tx``} ${q.partnerId ? tx`and cm.partner_id = ${q.partnerId}` : tx``}
        ${q.from ? tx`and cm.created_at >= ${q.from}::date` : tx``} ${q.to ? tx`and cm.created_at < ${q.to}::date + 1` : tx``}`;
      const items = await commissionList(tx, w);
      const byRecipient = await tx`select coalesce(u.name, pt.name) as name, cm.user_id, cm.partner_id, cm.currency,
          sum(cm.amount_minor) filter (where cm.status = 'pending')::bigint as pending, sum(cm.amount_minor) filter (where cm.status = 'approved')::bigint as approved, sum(cm.amount_minor) filter (where cm.status = 'paid')::bigint as paid
        from commissions cm left join users u on u.id = cm.user_id left join partners pt on pt.id = cm.partner_id where cm.status <> 'void' group by 1, 2, 3, 4 order by 1`;
      return { items, byRecipient };
    });
  });
  app.get("/api/finance/my-commissions", async (req) => {
    const c = ctx(req);
    return withClinic(c.clinicId, async (tx) => {
      const items = await commissionList(tx, tx`cm.user_id = ${c.userId} and cm.status <> 'void'`);
      const totals = await tx`select currency, sum(amount_minor) filter (where status in ('pending','approved'))::bigint as due, sum(amount_minor) filter (where status = 'paid')::bigint as paid,
        sum(amount_minor) filter (where created_at >= date_trunc('month', now()))::bigint as this_month from commissions where user_id = ${c.userId} and status <> 'void' group by currency`;
      return { items: items.slice(0, 200), totals };
    });
  });
  app.post("/api/finance/commissions/action", async (req) => {
    const c = need(ctx(req), "finance.manage");
    const b = parse(z.object({ ids: z.array(z.uuid()).min(1).max(1000), action: z.enum(["approve", "pay", "void", "reopen"]), ref: z.string().max(200).optional() }), req.body);
    return withClinic(c.clinicId, async (tx) => {
      const rows = b.action === "approve" ? await tx`update commissions set status = 'approved', approved_by = ${c.userId}, approved_at = now() where id = any(${b.ids}) and status = 'pending' returning id`
        : b.action === "pay" ? await tx`update commissions set status = 'paid', paid_at = now(), paid_ref = ${b.ref ?? null}, approved_by = coalesce(approved_by, ${c.userId}), approved_at = coalesce(approved_at, now()) where id = any(${b.ids}) and status in ('pending','approved') returning id`
        : b.action === "void" ? await tx`update commissions set status = 'void' where id = any(${b.ids}) and status in ('pending','approved') returning id`
        : await tx`update commissions set status = 'pending', approved_by = null, approved_at = null where id = any(${b.ids}) and status in ('approved','void') returning id`;
      await audit(tx, c, "commission." + b.action, "commission", null, { n: rows.length, ref: b.ref });
      return { updated: rows.length };
    });
  });

  // ── Giderler ──
  app.get("/api/finance/expenses", async (req) => {
    const c = finView(ctx(req)); const q = parse(range.extend({ category: z.enum(CATS).optional(), dealId: z.uuid().optional() }), req.query);
    return withClinic(c.clinicId, (tx) => tx`select e.*, u.name as created_by_name, d.number as deal_number from expenses e left join users u on u.id = e.created_by left join deals d on d.id = e.deal_id
      where true ${q.category ? tx`and e.category = ${q.category}` : tx``} ${q.dealId ? tx`and e.deal_id = ${q.dealId}` : tx``} ${q.from ? tx`and e.spent_on >= ${q.from}` : tx``} ${q.to ? tx`and e.spent_on <= ${q.to}` : tx``}
      order by e.spent_on desc, e.created_at desc limit 1000`);
  });
  const EXP = z.object({ category: z.enum(CATS), vendor: z.string().max(160).nullable().optional(), description: z.string().max(1000).nullable().optional(), amountMinor: z.number().int().positive(),
    currency: z.string().length(3), spentOn: z.iso.date().optional(), dealId: z.uuid().nullable().optional(), fileId: z.uuid().nullable().optional() });
  app.post("/api/finance/expenses", async (req) => {
    const c = need(ctx(req), "finance.manage"); const b = parse(EXP, req.body);
    return withClinic(c.clinicId, async (tx) => {
      const [e] = await tx`insert into expenses (clinic_id, category, vendor, description, amount_minor, currency, spent_on, deal_id, file_id, created_by)
        values (${c.clinicId}, ${b.category}, ${b.vendor ?? null}, ${b.description ?? null}, ${b.amountMinor}, ${b.currency}, ${b.spentOn ?? new Date().toISOString().slice(0, 10)}, ${b.dealId ?? null}, ${b.fileId ?? null}, ${c.userId}) returning *`;
      await audit(tx, c, "expense.create", "expense", e!.id as string, { amountMinor: b.amountMinor, currency: b.currency, category: b.category }); return e;
    });
  });
  app.patch("/api/finance/expenses/:id", async (req) => {
    const c = need(ctx(req), "finance.manage"); const { id } = req.params as { id: string }; const b = parsePatch(EXP.partial(), req.body);
    const map: Record<string, string> = { category: "category", vendor: "vendor", description: "description", amountMinor: "amount_minor", currency: "currency", spentOn: "spent_on", dealId: "deal_id", fileId: "file_id" };
    const set: Record<string, unknown> = {}; for (const [k, col] of Object.entries(map)) if ((b as any)[k] !== undefined) set[col] = (b as any)[k];
    return withClinic(c.clinicId, async (tx) => { if (Object.keys(set).length) await tx`update expenses set ${tx(set as never)} where id = ${id}`; await audit(tx, c, "expense.update", "expense", id, set); return { ok: true }; });
  });
  app.delete("/api/finance/expenses/:id", async (req) => {
    const c = need(ctx(req), "finance.manage"); const { id } = req.params as { id: string };
    return withClinic(c.clinicId, async (tx) => { const [e] = await tx`delete from expenses where id = ${id} returning amount_minor, currency, category`; if (!e) throw notFound("Gider"); await audit(tx, c, "expense.delete", "expense", id, e); return { ok: true }; });
  });

  // ── Faturalar ──
  app.get("/api/finance/invoices", async (req) => {
    const c = invView(ctx(req)); const q = parse(range.extend({ status: z.string().optional(), kind: z.string().optional(), dealId: z.uuid().optional() }), req.query);
    return withClinic(c.clinicId, (tx) => tx`select i.id, i.kind, i.number, i.status, i.payment_id, i.currency, i.total_minor, i.tax_minor, i.issued_at, i.due_at, i.paid_at, i.created_at, i.deal_id, i.buyer->>'name' as buyer_name, d.number as deal_number
      from invoices i left join deals d on d.id = i.deal_id
      where true ${q.status ? tx`and i.status = ${q.status}` : tx``} ${q.kind ? tx`and i.kind = ${q.kind}` : tx``} ${q.dealId ? tx`and i.deal_id = ${q.dealId}` : tx``}
        ${q.from ? tx`and coalesce(i.issued_at, i.created_at) >= ${q.from}::date` : tx``} ${q.to ? tx`and coalesce(i.issued_at, i.created_at) < ${q.to}::date + 1` : tx``}
      order by i.created_at desc limit 1000`);
  });
  app.post("/api/finance/invoices", async (req) => {
    const c = invWrite(ctx(req));
    const b = parse(z.object({ kind: z.enum(["invoice", "proforma", "receipt"]).default("invoice"), dealId: z.uuid().optional(), paymentId: z.uuid().optional(), currency: z.string().length(3).optional(),
      lines: z.array(LINE).max(200).optional(), buyer: z.record(z.string(), z.unknown()).optional(), notes: z.string().max(4000).optional(), lang: z.string().min(2).max(5).optional(), dueDays: z.number().int().min(0).max(365).optional() }), req.body);
    return withClinic(c.clinicId, async (tx) => {
      const { cl } = await sellerOf(tx, c.clinicId);
      const st = (cl.settings as any)?.invoice ?? {}; const taxBps = Number(st.taxBps ?? 0);
      let deal: any = null, patient: any = null, lines: InvLine[] = b.lines ?? [], currency = b.currency, paymentId: string | null = null;
      if (b.paymentId) {
        const [p] = await tx`select * from payments where id = ${b.paymentId} and kind = 'payment'`; if (!p) throw notFound("Ödeme");
        paymentId = p.id as string; b.dealId = b.dealId ?? (p.dealId as string); currency = p.currency as string;
      }
      if (b.dealId) {
        [deal] = await tx`select * from deals where id = ${b.dealId}`; if (!deal) throw notFound("Deal");
        [patient] = await tx`select full_name, email, phone, country, city, language from patients where id = ${deal.patientId}`;
        currency = deal.currency;
      }
      const lang = b.lang ?? patient?.language ?? "en"; const T = L10N[lang] ?? L10N.en!;
      if (!b.lines) {
        if (paymentId) { const [p] = await tx`select amount_minor, method, received_at from payments where id = ${paymentId}`; lines = [{ desc: `${T.payment} · ${p!.method}`, qty: 1, unitMinor: Number(p!.amountMinor), taxBps: 0 }]; }
        else if (deal) lines = linesFromDeal(deal, taxBps, T);
      }
      if (!currency) throw new HttpError(400, "currency_required", "Para birimi gerekli");
      const buyer = b.buyer ?? (patient ? { name: patient.fullName, email: patient.email, phone: patient.phone, address: [patient.city, patient.country].filter(Boolean).join(", ") } : {});
      const tot = invoiceTotals(lines);
      const due = b.dueDays ?? st.dueDays ?? (b.kind === "receipt" ? 0 : 14);
      const [inv] = await tx`insert into invoices (clinic_id, kind, deal_id, patient_id, payment_id, currency, buyer, lines, subtotal_minor, tax_minor, total_minor, notes, lang, due_at, created_by)
        values (${c.clinicId}, ${b.kind}, ${deal?.id ?? null}, ${deal?.patientId ?? null}, ${paymentId}, ${currency}, ${tx.json(buyer as never)}, ${tx.json(lines as never)}, ${tot.subtotalMinor}, ${tot.taxMinor}, ${tot.totalMinor},
          ${b.notes ?? null}, ${lang}, ${new Date(Date.now() + due * 86400000).toISOString().slice(0, 10)}, ${c.userId}) returning *`;
      await audit(tx, c, "invoice.create", "invoice", inv!.id as string, { kind: b.kind, dealId: deal?.id }); return inv;
    });
  });
  app.get("/api/finance/invoices/:id", async (req) => {
    const c = invView(ctx(req)); const { id } = req.params as { id: string };
    return withClinic(c.clinicId, async (tx) => {
      const [i] = await tx`select i.*, d.number as deal_number from invoices i left join deals d on d.id = i.deal_id where i.id = ${id}`; if (!i) throw notFound("Fatura");
      const seller = i.status === "draft" ? (await sellerOf(tx, c.clinicId)).seller : i.seller;
      const paid = i.dealId ? (await tx`select coalesce(sum(amount_minor),0)::bigint as s from payments where deal_id = ${i.dealId}`)[0]!.s : null;
      return { ...i, seller, dealPaidMinor: paid };
    });
  });
  app.patch("/api/finance/invoices/:id", async (req) => {
    const c = invWrite(ctx(req)); const { id } = req.params as { id: string };
    const b = parse(z.object({ lines: z.array(LINE).max(200).optional(), buyer: z.record(z.string(), z.unknown()).optional(), notes: z.string().max(4000).nullable().optional(), dueAt: z.iso.date().nullable().optional(), lang: z.string().min(2).max(5).optional() }), req.body);
    return withClinic(c.clinicId, async (tx) => {
      const [i] = await tx`select * from invoices where id = ${id}`; if (!i) throw notFound("Fatura");
      if (i.status !== "draft") throw new HttpError(409, "locked", "Kesilmiş fatura değiştirilemez — iptal edip iade faturası kesin");
      const lines = (b.lines ?? i.lines) as InvLine[]; const tot = invoiceTotals(lines);
      await tx`update invoices set lines = ${tx.json(lines as never)}, buyer = ${tx.json((b.buyer ?? i.buyer) as never)}, notes = ${b.notes !== undefined ? b.notes : i.notes}, due_at = ${b.dueAt !== undefined ? b.dueAt : i.dueAt},
        lang = ${b.lang ?? i.lang}, subtotal_minor = ${tot.subtotalMinor}, tax_minor = ${tot.taxMinor}, total_minor = ${tot.totalMinor} where id = ${id}`;
      return { ok: true, ...tot };
    });
  });
  app.post("/api/finance/invoices/:id/issue", async (req) => {
    const c = invWrite(ctx(req)); const { id } = req.params as { id: string };
    return withClinic(c.clinicId, async (tx) => {
      const [i] = await tx`select * from invoices where id = ${id} for update`; if (!i) throw notFound("Fatura");
      if (i.status !== "draft") throw new HttpError(409, "not_draft", "Yalnız taslak kesilebilir");
      if (!(i.lines as unknown[]).length) throw new HttpError(400, "no_lines", "Satır yok");
      if (!(i.buyer as any)?.name) throw new HttpError(400, "buyer_required", "Alıcı adı gerekli");
      const { cl, seller } = await sellerOf(tx, c.clinicId);
      const number = await nextInvoiceNumber(tx, c.clinicId, i.kind as string, cl.settings);
      const paidNow = i.kind === "receipt";
      const [u] = await tx`update invoices set number = ${number}, seller = ${tx.json(seller as never)}, status = ${paidNow ? "paid" : "issued"}, issued_at = now(), paid_at = ${paidNow ? new Date() : null} where id = ${id} returning *`;
      await audit(tx, c, "invoice.issue", "invoice", id, { number, total: i.totalMinor }); return u;
    });
  });
  app.post("/api/finance/invoices/:id/paid", async (req) => {
    const c = invWrite(ctx(req)); const { id } = req.params as { id: string };
    return withClinic(c.clinicId, async (tx) => { const [u] = await tx`update invoices set status = 'paid', paid_at = now() where id = ${id} and status = 'issued' returning id`; if (!u) throw new HttpError(409, "bad_state"); await audit(tx, c, "invoice.paid", "invoice", id); return { ok: true }; });
  });
  app.post("/api/finance/invoices/:id/void", async (req) => {
    const c = need(ctx(req), "finance.manage"); const { id } = req.params as { id: string }; const b = parse(z.object({ reason: z.string().trim().min(2).max(500), credit: z.boolean().default(true) }), req.body);
    return withClinic(c.clinicId, async (tx) => {
      const [i] = await tx`select * from invoices where id = ${id} for update`; if (!i) throw notFound("Fatura");
      if (i.status === "draft") { await tx`delete from invoices where id = ${id}`; return { deleted: true }; }
      if (i.status === "void") throw new HttpError(409, "already_void");
      await tx`update invoices set status = 'void', voided_at = now(), void_reason = ${b.reason} where id = ${id}`;
      let creditId: string | null = null;
      if (b.credit && i.kind === "invoice") {
        const lines = (i.lines as InvLine[]).map((l) => ({ ...l, qty: -l.qty })); const tot = invoiceTotals(lines);
        const { cl, seller } = await sellerOf(tx, c.clinicId);
        const number = await nextInvoiceNumber(tx, c.clinicId, "credit_note", cl.settings);
        const [cn] = await tx`insert into invoices (clinic_id, kind, number, deal_id, patient_id, credit_of, currency, seller, buyer, lines, subtotal_minor, tax_minor, total_minor, status, issued_at, notes, lang, created_by)
          values (${c.clinicId}, 'credit_note', ${number}, ${i.dealId}, ${i.patientId}, ${id}, ${i.currency}, ${tx.json(seller as never)}, ${tx.json(i.buyer as never)}, ${tx.json(lines as never)}, ${tot.subtotalMinor}, ${tot.taxMinor}, ${tot.totalMinor}, 'issued', now(), ${b.reason}, ${i.lang}, ${c.userId}) returning id`;
        creditId = cn!.id as string;
      }
      await audit(tx, c, "invoice.void", "invoice", id, { reason: b.reason, creditId }); return { ok: true, creditId };
    });
  });

  // ── Özet ──
  app.get("/api/finance/summary", async (req) => {
    const c = finView(ctx(req)); const q = parse(range, req.query);
    const from = q.from ?? new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10), to = q.to ?? new Date().toISOString().slice(0, 10);
    return withClinic(c.clinicId, async (tx) => {
      const [cl] = await tx`select default_currency, settings from clinics where id = ${c.clinicId}`;
      const base = cl!.defaultCurrency as string; const fx = ((cl!.settings as any)?.fxRates ?? { EUR: 1 }) as Record<string, number>;
      const conv = (minor: number, cur: string) => (fx[cur] && fx[base] ? Math.round((minor / fx[cur]!) * fx[base]!) : cur === base ? minor : 0);
      const collected = await tx`select currency, sum(amount_minor) filter (where kind = 'payment')::bigint as gross, coalesce(-sum(amount_minor) filter (where kind <> 'payment'), 0)::bigint as refunds, count(*) filter (where kind = 'payment')::int as n
        from payments where received_at >= ${from}::date and received_at < ${to}::date + 1 group by currency`;
      const expenses = await tx`select currency, category, sum(amount_minor)::bigint as total from expenses where spent_on between ${from} and ${to} group by 1, 2 order by 3 desc`;
      const comm = await tx`select currency, sum(amount_minor)::bigint as total from commissions where status <> 'void' and created_at >= ${from}::date and created_at < ${to}::date + 1 group by 1`;
      const receivables = await tx`select d.currency, sum(greatest(d.value_minor - coalesce(p.s, 0), 0))::bigint as total, count(*)::int as n
        from deals d left join (select deal_id, sum(amount_minor) as s from payments group by deal_id) p on p.deal_id = d.id where d.status in ('open','won') and d.value_minor > coalesce(p.s, 0) group by 1`;
      const months = await tx`with m as (select generate_series(date_trunc('month', now()) - interval '11 months', date_trunc('month', now()), interval '1 month') as m)
        select to_char(m.m, 'YYYY-MM') as month,
          (select coalesce(json_agg(json_build_object('c', currency, 's', s)), '[]') from (select currency, sum(amount_minor) as s from payments where date_trunc('month', received_at) = m.m group by currency) x) as income,
          (select coalesce(json_agg(json_build_object('c', currency, 's', s)), '[]') from (select currency, sum(amount_minor) as s from expenses where date_trunc('month', spent_on) = m.m group by currency) y) as cost
        from m order by m.m`;
      const sumConv = (rows: any[], key: string) => rows.reduce((a, r) => a + conv(Number(r[key] ?? 0), r.currency), 0);
      const income = sumConv(collected, "gross") - sumConv(collected, "refunds"), cost = sumConv(expenses, "total"), commission = sumConv(comm, "total");
      return {
        from, to, base, collected, expenses, commissions: comm, receivables,
        totals: { income, expenses: cost, commissions: commission, net: income - cost - commission, receivables: sumConv(receivables, "total") },
        months: months.map((m: any) => ({ month: m.month, income: (m.income as any[]).reduce((a, x) => a + conv(Number(x.s), x.c), 0), cost: (m.cost as any[]).reduce((a, x) => a + conv(Number(x.s), x.c), 0) })),
      };
    });
  });

  // ── CSV dışa aktarım ──
  app.get("/api/finance/export/:what", async (req, reply) => {
    const c = finView(ctx(req)); const { what } = req.params as { what: string }; const q = parse(range, req.query);
    const from = q.from ?? "2000-01-01", to = q.to ?? "2999-12-31";
    const rows = await withClinic(c.clinicId, async (tx) => {
      if (what === "payments") return tx`select py.received_at, d.number as deal, p.full_name as patient, py.kind, py.amount_minor / 100.0 as amount, py.currency, py.method, py.provider, py.provider_ref, py.note
        from payments py join deals d on d.id = py.deal_id join patients p on p.id = d.patient_id where py.received_at >= ${from}::date and py.received_at < ${to}::date + 1 order by py.received_at`;
      if (what === "commissions") return tx`select cm.created_at, coalesce(u.name, pt.name) as recipient, d.number as deal, cm.base_minor / 100.0 as base, cm.rate_bps / 100.0 as rate_pct, cm.amount_minor / 100.0 as amount, cm.currency, cm.status, cm.paid_at, cm.paid_ref
        from commissions cm join deals d on d.id = cm.deal_id left join users u on u.id = cm.user_id left join partners pt on pt.id = cm.partner_id where cm.created_at >= ${from}::date and cm.created_at < ${to}::date + 1 order by cm.created_at`;
      if (what === "expenses") return tx`select spent_on, category, vendor, description, amount_minor / 100.0 as amount, currency from expenses where spent_on between ${from} and ${to} order by spent_on`;
      if (what === "invoices") return tx`select number, kind, status, issued_at, due_at, buyer->>'name' as buyer, subtotal_minor / 100.0 as subtotal, tax_minor / 100.0 as tax, total_minor / 100.0 as total, currency
        from invoices where status <> 'draft' and issued_at >= ${from}::date and issued_at < ${to}::date + 1 order by issued_at`;
      throw notFound("Rapor");
    });
    await withClinic(c.clinicId, (tx) => audit(tx, c, "finance.export", what, null, { from, to, n: rows.length }));
    reply.header("Content-Type", "text/csv; charset=utf-8").header("Content-Disposition", `attachment; filename="${what}-${from}-${to}.csv"`);
    return csv(rows as unknown as Record<string, unknown>[]);
  });
}
