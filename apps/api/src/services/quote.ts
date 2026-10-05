// Teklif snapshot'ı ve teklif → deal dönüşümü
import { createHash, randomUUID } from "node:crypto";
import type { Tx } from "../db.ts";
import type { Ctx } from "../http.ts";
import { HttpError } from "../http.ts";
import { loadCatalog } from "./catalog.ts";
import { audit, emit } from "./audit.ts";
import { randomToken, sha256, encrypt } from "../lib/crypto.ts";
import { calcOption, checkRules, spansFor, stayDays, hasImplants, BANNED_WORDS, type PriceOption, type Catalog, type PlanItem, type Situation } from "@dentaflow/core/engine";
import { translate } from "@dentaflow/core/i18n";
import { medicalOf } from "../routes/cases.ts";
import { enforce } from "../routes/saas.ts";

export interface Pricing {
  currency: string; language: string; nOpt: number; mode: "mat" | "diff"; options: PriceOption[];
  depositBps: number; validDays: number; pricesHidden: boolean; note: string; syncedRevision?: number; hotelId?: string | null;
}
export const labelsFor = (lang: string) => ({
  unit: (u: string) => translate(lang, "u_" + u),
  pkg: (k: string, n?: number) => k === "hotel" ? translate(lang, "pk_hotel", { n }) : k === "transfer" ? translate(lang, "pk_transfer") : translate(lang, "pk_flight", { n }),
  implants: (n: number) => translate(lang, "implants_n", { n }),
  jaw: (j: "u" | "l") => translate(lang, j === "u" ? "jaw_u" : "jaw_l"),
});
export function calcAll(cat: Catalog, p: Pricing, visits: number, lang = p.language, hotelNight?: number) {
  const L = labelsFor(lang);
  return p.options.slice(0, p.nOpt).map((op) => calcOption(cat, op, visits, p.currency, lang, L.unit, L.pkg, p.depositBps, hotelNight));
}
export const optName = (op: PriceOption, lang: string) => op.custom || translate(lang, op.name);
export function discountLimit(c: Ctx, settings: Record<string, any>): number {
  return Math.min(Number(c.perms["discount.max"]) || 0, Number(settings?.discountLimits?.[c.role] ?? 100));
}

/** Gönderim öncesi kontroller: kural engelleri, indirim onayı, yasaklı ifadeler, fiyatsız kalem, plan senkronu */
export async function preSendChecks(tx: Tx, c: Ctx, k: Record<string, any>, cat: Catalog, p: Pricing, settings: Record<string, any>) {
  const out: { key: string; ok: boolean; warn?: boolean; data?: unknown }[] = [];
  const rules = checkRules(cat, k.situation as Situation, k.planItems as PlanItem[], k.visits, await medicalOf(tx, k.patientId), c.locale);
  const blocks = rules.filter((r) => r.sev === "block");
  out.push({ key: "rules", ok: !blocks.length, data: blocks.map((b) => b.code) });
  const lim = discountLimit(c, settings);
  const needAppr = p.options.slice(0, p.nOpt).filter((o) => (o.disc > lim || settings?.quote?.requireApprovalAll) && !o.approvedBy);
  out.push({ key: "approval", ok: !needAppr.length, data: needAppr.map((o) => optName(o, c.locale)) });
  const bw = (p.note || "").match(BANNED_WORDS);
  out.push({ key: "banned", ok: !bw, warn: true, data: bw?.[0] });
  const calcs = calcAll(cat, p, k.visits);
  out.push({ key: "prices", ok: !calcs.some((x) => x.missing) });
  out.push({ key: "sync", ok: (p.syncedRevision ?? -1) === k.planRevision });
  return out;
}

export async function createQuote(tx: Tx, c: Ctx, caseId: string, appUrl: string) {
  await enforce(c.clinicId, "quotes");
  const [k] = await tx`select * from cases where id = ${caseId}`;
  if (!k) throw new HttpError(404, "not_found");
  const p = k.pricing as Pricing | null;
  if (!p) throw new HttpError(400, "no_pricing", "Önce fiyatlandırma yapın");
  const [cl] = await tx`select name, legal_name, phone, email, website, address, city, country, brand_color, settings, logo_file_id from clinics where id = ${c.clinicId}`;
  const cat = await loadCatalog(tx, c.clinicId);
  const checks = await preSendChecks(tx, c, k, cat, p, cl!.settings);
  const failed = checks.filter((x) => !x.ok && !x.warn);
  if (failed.length) throw new HttpError(422, "presend_failed", "Gönderim öncesi kontroller başarısız", { checks });

  const [pt] = await tx`select p.full_name, p.country, p.language, l.issue, l.owner_id, u.name as owner_name, u.email as owner_email from patients p join leads l on l.id = ${k.leadId} left join users u on u.id = l.owner_id where p.id = ${k.patientId}`;
  const [dn] = k.dentistId ? await tx`select name from users where id = ${k.dentistId}` : [null];
  const hotelNight = p.hotelId ? Number((await tx`select night_eur from hotels where id = ${p.hotelId}`)[0]?.nightEur ?? cat.hotelNightEur) : undefined;
  const content = await tx`select kind, data from clinic_content where clinic_id = ${c.clinicId} and active order by kind, sort`;
  const lang = p.language, L = labelsFor(lang);
  const calcs = calcAll(cat, p, k.visits, lang, hotelNight);
  const options = p.options.slice(0, p.nOpt).map((op, i) => ({
    name: optName(op, lang), rec: !!op.rec, items: op.items, extras: op.extras, calc: calcs[i]!,
    spans: spansFor(cat, k.situation, op.items, lang, { implants: L.implants, jaw: L.jaw }),
    stays: calcs[i]!.visits.map((v) => stayDays(cat, v.lines)), implants: hasImplants(cat, op.items),
  }));
  if (!options.some((o) => o.rec)) options[0]!.rec = true;
  const prev = await tx`select number, version from quotes where case_id = ${caseId} order by version desc limit 1`;
  const number = prev[0]?.number ?? (await tx`select next_number(${c.clinicId}, 'quote') as n`)[0]!.n;
  const version = (prev[0]?.version ?? 0) + 1;
  const validUntil = new Date(Date.now() + p.validDays * 86400_000);
  const snapshot = {
    v: 1, lang, currency: p.currency, pricesHidden: p.pricesHidden, note: p.note, depositBps: p.depositBps, visits: k.visits, validUntil: validUntil.toISOString(),
    patient: { name: pt!.fullName, country: pt!.country, issue: pt!.issue ?? "" },
    clinic: { name: cl!.name, legalName: cl!.legalName, phone: cl!.phone, email: cl!.email, website: cl!.website, address: cl!.address, city: cl!.city, color: cl!.brandColor, logoFileId: cl!.logoFileId },
    staff: { dentist: dn?.name ?? null, coordinator: pt!.ownerName ?? null },
    situation: k.situation, options, gap: { min: cat.gapMinMonths, max: cat.gapMaxMonths },
    content: content.map((x) => ({ kind: x.kind, data: x.data })),
    catalog: { treatments: cat.treatments.filter((t) => options.some((o) => [...o.items, ...o.extras].some((i) => i.tx === t.id))).map((t) => ({ id: t.id, render: t.render, unit: t.unit, mat: t.mat, needsImplant: t.needsImplant, n: t.n })),
               bundles: cat.bundles.filter((b) => options.some((o) => o.items.some((i) => i.b === b.id))) },
  };
  const json = JSON.stringify(snapshot);
  const token = randomToken(18);
  const recTotal = Math.round((options.find((o) => o.rec) ?? options[0]!).calc.total * 100);
  await tx`update quotes set status = 'superseded' where case_id = ${caseId} and status in ('sent','viewed','changes')`;
  const [q] = await tx`insert into quotes (clinic_id, number, version, case_id, lead_id, patient_id, status, token_hash, token_enc, language, currency, valid_until, prices_hidden, snapshot, snapshot_hash, total_minor, created_by)
    values (${c.clinicId}, ${number}, ${version}, ${caseId}, ${k.leadId}, ${k.patientId}, 'sent', ${sha256(token)}, ${encrypt(token)}, ${lang}, ${p.currency}, ${validUntil}, ${p.pricesHidden},
            ${tx.json(snapshot as never)}, ${createHash("sha256").update(json).digest("hex")}, ${recTotal}, ${c.userId}) returning id, number, version`;
  await tx`update cases set status = 'quoted', step = 4 where id = ${caseId}`;
  await tx`update leads set stage = case when stage in ('won','lost') then stage else 'quote_sent' end, last_activity_at = now() where id = ${k.leadId}`;
  await tx`insert into lead_events (clinic_id, lead_id, type, body, data, user_id) values (${c.clinicId}, ${k.leadId}, 'quote', 'sent', ${tx.json({ quoteId: q!.id, version } as never)}, ${c.userId})`;
  await tx`insert into quote_events (clinic_id, quote_id, type, staff, data) values (${c.clinicId}, ${q!.id}, 'send', true, ${tx.json({ by: c.userId } as never)})`;
  await audit(tx, c, "quote.create", "quote", q!.id, { version, total: recTotal });
  await emit(tx, c.clinicId, "quote.sent", q!.id, { quoteId: q!.id, leadId: k.leadId, name: pt!.fullName, ownerId: pt!.ownerId });
  return { id: q!.id as string, number: q!.number, version, token, url: `${appUrl}/q/${token}` };
}

/** Kabul edilen teklif → deal + ziyaretler (ödeme planı) */
export async function createDealFromQuote(tx: Tx, quote: Record<string, any>, optIndex: number) {
  const snap = quote.snapshot as any;
  const op = snap.options[optIndex] ?? snap.options[0];
  const [l] = await tx`select owner_id from leads where id = ${quote.leadId}`;
  const [{ n }] = await tx`select next_number(${quote.clinicId}, 'deal') as n` as unknown as [{ n: string }];
  const toMinor = (v: number) => Math.round(v * 100);
  const [d] = await tx`insert into deals (clinic_id, number, lead_id, patient_id, case_id, quote_id, accepted_option, title, currency, value_minor, deposit_minor, stage, owner_id)
    values (${quote.clinicId}, ${n}, ${quote.leadId}, ${quote.patientId}, ${quote.caseId}, ${quote.id}, ${tx.json(op as never)}, ${snap.patient.name + " — " + op.name}, ${quote.currency},
            ${toMinor(op.calc.total)}, ${toMinor(op.calc.deposit)}, 'accepted', ${l?.ownerId ?? null}) returning id, number`;
  for (const p of op.calc.pay as { v: number; amount: number }[])
    await tx`insert into deal_visits (clinic_id, deal_id, visit_no, planned_minor) values (${quote.clinicId}, ${d!.id}, ${p.v}, ${toMinor(p.amount + (p.v === 1 ? op.calc.deposit : 0))})`;
  for (const p of op.calc.pay as { v: number }[])
    await tx`insert into trips (clinic_id, deal_id, visit_no) values (${quote.clinicId}, ${d!.id}, ${p.v}) on conflict do nothing`;
  await tx`update cases set status = 'accepted' where id = ${quote.caseId}`;
  await tx`update leads set stage = 'won', last_activity_at = now() where id = ${quote.leadId}`;
  await tx`insert into lead_events (clinic_id, lead_id, type, body, data) values (${quote.clinicId}, ${quote.leadId}, 'deal', 'created', ${tx.json({ dealId: d!.id, option: op.name } as never)})`;
  await emit(tx, quote.clinicId, "deal.created", d!.id, { dealId: d!.id, leadId: quote.leadId, name: snap.patient.name, ownerId: l?.ownerId, value: op.calc.total, currency: quote.currency });
  return d as { id: string; number: string };
}
export const newId = () => randomUUID().slice(0, 8);
