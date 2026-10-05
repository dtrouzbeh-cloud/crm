// Finans çekirdeği: tahsilata bağlı komisyon tahakkuku ve fatura numaralandırma/hesaplama
import type { Tx } from "../db.ts";

/** Ödeme kaydı sonrası (aynı işlemde) çağrılır. İade/düzeltme ise orijinal komisyonları ters kayıtla dengeler. */
export async function accrueCommissions(tx: Tx, clinicId: string, paymentId: string): Promise<number> {
  const [p] = await tx`select p.*, d.owner_id as deal_owner, d.lead_id, l.source, l.partner_id from payments p join deals d on d.id = p.deal_id join leads l on l.id = d.lead_id where p.id = ${paymentId}`;
  if (!p) return 0;
  const amount = Number(p.amountMinor);
  let n = 0;
  if (p.reverses) {
    // ters kayıt: orijinal ödemenin geçerli komisyonlarını aynı oranla negatif tutarla yaz
    const orig = await tx`select * from commissions where payment_id = ${p.reverses} and status <> 'void' and amount_minor > 0`;
    for (const o of orig) {
      const amt = Math.round((amount * Number(o.rateBps)) / 10000);
      const r = await tx`insert into commissions (clinic_id, rule_id, deal_id, payment_id, user_id, partner_id, base_minor, rate_bps, amount_minor, currency)
        values (${clinicId}, ${o.ruleId}, ${p.dealId}, ${paymentId}, ${o.userId}, ${o.partnerId}, ${amount}, ${o.rateBps}, ${amt}, ${p.currency}) on conflict do nothing returning id`;
      n += r.length;
    }
    return n;
  }
  if (amount <= 0) return 0;
  const rules = await tx`select * from commission_rules where clinic_id = ${clinicId} and active`;
  for (const r of rules) {
    if (r.source && r.source !== p.source) continue;
    let userId: string | null = null, partnerId: string | null = null, rate = Number(r.rateBps);
    if (r.recipient === "deal_owner") {
      if (!p.dealOwner) continue;
      if (r.role) { const [m] = await tx`select role from memberships where clinic_id = ${clinicId} and user_id = ${p.dealOwner}`; if (m?.role !== r.role) continue; }
      userId = p.dealOwner as string;
    } else if (r.recipient === "user") {
      if (!r.userId) continue; userId = r.userId as string;
    } else {
      if (!p.partnerId) continue;
      const [pt] = await tx`select id, commission_bps, active from partners where id = ${p.partnerId}`; if (!pt?.active) continue;
      partnerId = pt.id as string; if (!rate) rate = Number(pt.commissionBps);
    }
    if (!rate) continue;
    const res = await tx`insert into commissions (clinic_id, rule_id, deal_id, payment_id, user_id, partner_id, base_minor, rate_bps, amount_minor, currency)
      values (${clinicId}, ${r.id}, ${p.dealId}, ${paymentId}, ${userId}, ${partnerId}, ${amount}, ${rate}, ${Math.round((amount * rate) / 10000)}, ${p.currency}) on conflict do nothing returning id`;
    n += res.length;
  }
  return n;
}

export type InvLine = { desc: string; qty: number; unitMinor: number; taxBps: number };
export function invoiceTotals(lines: InvLine[]) {
  let sub = 0, tax = 0;
  for (const l of lines) { const net = Math.round(l.qty * l.unitMinor); sub += net; tax += Math.round((net * (l.taxBps || 0)) / 10000); }
  return { subtotalMinor: sub, taxMinor: tax, totalMinor: sub + tax };
}

const PREFIX: Record<string, string> = { invoice: "INV", proforma: "PRO", receipt: "RCT", credit_note: "CN" };
export async function nextInvoiceNumber(tx: Tx, clinicId: string, kind: string, settings: any): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = (settings?.invoice?.prefixes?.[kind] as string) || PREFIX[kind] || "INV";
  const [{ n }] = await tx`select next_number(${clinicId}, ${"inv_" + kind + "_" + year}) as n` as unknown as [{ n: string }];
  return `${prefix}-${year}-${String(n).padStart(5, "0")}`;
}

/** Kabul edilen teklif seçeneğinden fatura satırları (toplam = deal değeri olacak şekilde indirim/yuvarlama satırıyla) */
export function linesFromDeal(d: { acceptedOption: any; valueMinor: number | string; title: string }, taxBps: number, labels: { discount: string; teeth: string }): InvLine[] {
  const calc = d.acceptedOption?.calc; const out: InvLine[] = [];
  if (!calc) return [{ desc: d.title, qty: 1, unitMinor: Number(d.valueMinor), taxBps }];
  for (const l of calc.lines ?? []) {
    if (!l.total) continue;
    const teeth = l.teeth?.length ? ` (${labels.teeth} ${l.teeth.join(", ")})` : "";
    out.push({ desc: `${l.nm}${l.br ? " · " + l.br : ""}${teeth}`, qty: Number(l.qty) || 1, unitMinor: Math.round(Number(l.unit) * 100), taxBps });
  }
  for (const p of calc.pkg ?? []) if (p.total) out.push({ desc: p.nm, qty: 1, unitMinor: Math.round(Number(p.total) * 100), taxBps });
  const sum = out.reduce((a, l) => a + Math.round(l.qty * l.unitMinor), 0);
  const diff = Number(d.valueMinor) - sum;
  if (diff) out.push({ desc: labels.discount, qty: 1, unitMinor: diff, taxBps });
  return out;
}
