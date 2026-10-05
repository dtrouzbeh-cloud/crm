// Fatura/proforma/makbuz: taslak düzenleme, kesme, ödendi, iptal (+iade faturası), yazdırma/PDF
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useT } from "../lib/i18n.tsx";
import { get, post, patch } from "../lib/api.ts";
import { Drawer, Spinner, toast, toastErr, confirmBox } from "./ui.tsx";
import { Icon } from "./Icon.tsx";
import { useCan } from "../lib/auth.ts";
import { fmtMoney, fmtDate } from "@dentaflow/core/i18n";

const DOC: Record<string, Record<string, string>> = {
  en: { invoice: "INVOICE", proforma: "PROFORMA INVOICE", receipt: "RECEIPT", credit_note: "CREDIT NOTE", no: "No.", date: "Date", due: "Due date", to: "Bill to", from: "From", desc: "Description", qty: "Qty", unit: "Unit price", amount: "Amount", sub: "Subtotal", tax: "Tax", total: "Total", tax_id: "Tax ID", bank: "Bank details", draft: "DRAFT", void: "VOID", paid: "PAID", proforma_note: "This is not a tax invoice." },
  tr: { invoice: "FATURA", proforma: "PROFORMA FATURA", receipt: "TAHSİLAT MAKBUZU", credit_note: "İADE FATURASI", no: "No", date: "Tarih", due: "Vade", to: "Alıcı", from: "Satıcı", desc: "Açıklama", qty: "Miktar", unit: "Birim fiyat", amount: "Tutar", sub: "Ara toplam", tax: "KDV", total: "Toplam", tax_id: "Vergi No", bank: "Banka bilgileri", draft: "TASLAK", void: "İPTAL", paid: "ÖDENDİ", proforma_note: "Bu belge vergi faturası değildir." },
  de: { invoice: "RECHNUNG", proforma: "PROFORMA-RECHNUNG", receipt: "QUITTUNG", credit_note: "GUTSCHRIFT", no: "Nr.", date: "Datum", due: "Fällig", to: "Rechnung an", from: "Von", desc: "Beschreibung", qty: "Menge", unit: "Einzelpreis", amount: "Betrag", sub: "Zwischensumme", tax: "MwSt.", total: "Gesamt", tax_id: "Steuernr.", bank: "Bankverbindung", draft: "ENTWURF", void: "STORNIERT", paid: "BEZAHLT", proforma_note: "Dies ist keine Steuerrechnung." },
  ar: { invoice: "فاتورة", proforma: "فاتورة مبدئية", receipt: "إيصال", credit_note: "إشعار دائن", no: "رقم", date: "التاريخ", due: "الاستحقاق", to: "إلى", from: "من", desc: "الوصف", qty: "الكمية", unit: "سعر الوحدة", amount: "المبلغ", sub: "المجموع الفرعي", tax: "الضريبة", total: "الإجمالي", tax_id: "الرقم الضريبي", bank: "بيانات البنك", draft: "مسودة", void: "ملغاة", paid: "مدفوعة", proforma_note: "هذه ليست فاتورة ضريبية." },
};

export function InvoiceDoc({ inv }: { inv: any }) {
  const L = DOC[inv.lang] ? inv.lang : "en", T = DOC[L]!, M = (v: number) => fmtMoney(Number(v) / 100, inv.currency, L);
  const s = inv.seller ?? {}, b = inv.buyer ?? {};
  const stamp = inv.status === "draft" ? T.draft : inv.status === "void" ? T.void : inv.status === "paid" && inv.kind !== "receipt" ? T.paid : null;
  return <div className="invdoc" dir={L === "ar" ? "rtl" : "ltr"} style={{ position: "relative", background: "#fff", color: "#111", padding: 32, fontSize: 13, lineHeight: 1.5, borderRadius: 8, border: "1px solid var(--line)" }}>
    {stamp && <div style={{ position: "absolute", top: 90, insetInlineEnd: 40, transform: "rotate(-12deg)", border: "3px solid", borderColor: inv.status === "paid" ? "#16A34A" : "#DC2626", color: inv.status === "paid" ? "#16A34A" : "#DC2626", padding: "4px 14px", fontWeight: 800, fontSize: 22, opacity: 0.75, borderRadius: 6 }}>{stamp}</div>}
    <div style={{ display: "flex", justifyContent: "space-between", gap: 20, flexWrap: "wrap" }}>
      <div><div style={{ fontSize: 18, fontWeight: 800 }}>{s.brand ?? s.name}</div>{s.brand && s.name !== s.brand && <div>{s.name}</div>}<div style={{ color: "#555" }}>{s.address}</div>
        <div style={{ color: "#555" }}>{[s.phone, s.email, s.website].filter(Boolean).join(" · ")}</div>{s.taxId && <div style={{ color: "#555" }}>{T.tax_id}: {s.taxId}</div>}</div>
      <div style={{ textAlign: "end" }}><div style={{ fontSize: 20, fontWeight: 800, letterSpacing: ".04em" }}>{T[inv.kind]}</div>
        <div>{T.no}: <b>{inv.number ?? "—"}</b></div><div>{T.date}: {fmtDate(inv.issuedAt ?? inv.createdAt, L)}</div>{inv.dueAt && inv.kind !== "receipt" && <div>{T.due}: {fmtDate(inv.dueAt, L)}</div>}</div>
    </div>
    <div style={{ marginTop: 22, padding: 12, background: "#F6F8F9", borderRadius: 6 }}><div style={{ fontSize: 11, textTransform: "uppercase", color: "#777", fontWeight: 700 }}>{T.to}</div>
      <div style={{ fontWeight: 700 }}>{b.name}</div>{b.address && <div>{b.address}</div>}<div style={{ color: "#555" }}>{[b.email, b.phone].filter(Boolean).join(" · ")}</div>{b.taxId && <div>{T.tax_id}: {b.taxId}</div>}</div>
    <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 18 }}><thead><tr style={{ borderBottom: "2px solid #222" }}><th style={{ textAlign: "start", padding: 6 }}>{T.desc}</th><th style={{ textAlign: "end", padding: 6 }}>{T.qty}</th><th style={{ textAlign: "end", padding: 6 }}>{T.unit}</th>{inv.taxMinor != 0 && <th style={{ textAlign: "end", padding: 6 }}>{T.tax}</th>}<th style={{ textAlign: "end", padding: 6 }}>{T.amount}</th></tr></thead>
      <tbody>{(inv.lines as any[]).map((l, i) => <tr key={i} style={{ borderBottom: "1px solid #E5E7EB" }}><td style={{ padding: 6 }}>{l.desc}</td><td style={{ textAlign: "end", padding: 6 }}>{l.qty}</td><td style={{ textAlign: "end", padding: 6 }}>{M(l.unitMinor)}</td>{inv.taxMinor != 0 && <td style={{ textAlign: "end", padding: 6 }}>{(l.taxBps ?? 0) / 100}%</td>}<td style={{ textAlign: "end", padding: 6 }}>{M(Math.round(l.qty * l.unitMinor))}</td></tr>)}</tbody></table>
    <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}><table style={{ minWidth: 240 }}><tbody>
      {inv.taxMinor != 0 && <><tr><td style={{ padding: 4 }}>{T.sub}</td><td style={{ textAlign: "end", padding: 4 }}>{M(inv.subtotalMinor)}</td></tr><tr><td style={{ padding: 4 }}>{T.tax}</td><td style={{ textAlign: "end", padding: 4 }}>{M(inv.taxMinor)}</td></tr></>}
      <tr style={{ borderTop: "2px solid #222", fontSize: 16 }}><td style={{ padding: 6, fontWeight: 800 }}>{T.total}</td><td style={{ textAlign: "end", padding: 6, fontWeight: 800 }}>{M(inv.totalMinor)}</td></tr></tbody></table></div>
    {inv.kind === "proforma" && <p style={{ color: "#777", fontSize: 11 }}>{T.proforma_note}</p>}
    {inv.notes && <p style={{ whiteSpace: "pre-wrap", marginTop: 16 }}>{inv.notes}</p>}
    {s.iban && <div style={{ marginTop: 16, fontSize: 12 }}><b>{T.bank}:</b> <span style={{ whiteSpace: "pre-wrap" }}>{s.iban}</span></div>}
    {s.footer && <div style={{ marginTop: 24, paddingTop: 10, borderTop: "1px solid #E5E7EB", fontSize: 11, color: "#777", whiteSpace: "pre-wrap" }}>{s.footer}</div>}
  </div>;
}

export function printInvoice(inv: any) {
  const el = document.getElementById("inv-print"); if (!el) return;
  const w = window.open("", "_blank", "width=860,height=1000"); if (!w) return;
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><base href="${location.origin}/"><title>${inv.number ?? "draft"}</title><style>@page{size:A4;margin:12mm}body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif}.invdoc{border:0!important}</style></head><body>${el.innerHTML}</body></html>`);
  w.document.close(); setTimeout(() => w.print(), 300);
}

export function InvoiceDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const { t } = useT(); const qc = useQueryClient(); const can = useCan();
  const { data: inv } = useQuery({ queryKey: ["invoice", id], queryFn: () => get(`/api/finance/invoices/${id}`) });
  const [edit, setEdit] = useState<any | null>(null);
  const r = () => { qc.invalidateQueries({ queryKey: ["invoice", id] }); qc.invalidateQueries({ queryKey: ["invoices"] }); qc.invalidateQueries({ queryKey: ["deal-invoices"] }); };
  const run = async (fn: () => Promise<any>, msg?: string) => { try { await fn(); r(); if (msg) toast(msg); } catch (e) { toastErr(e); } };
  if (!inv) return <Drawer title="…" onClose={onClose}><Spinner /></Drawer>;
  const draft = inv.status === "draft";
  const startEdit = () => setEdit({ buyer: { ...inv.buyer }, lines: inv.lines.map((l: any) => ({ ...l, unit: Number(l.unitMinor) / 100, tax: (l.taxBps ?? 0) / 100 })), notes: inv.notes ?? "", lang: inv.lang });
  const saveEdit = () => run(async () => { await patch(`/api/finance/invoices/${id}`, { buyer: edit.buyer, notes: edit.notes, lang: edit.lang, lines: edit.lines.filter((l: any) => l.desc).map((l: any) => ({ desc: l.desc, qty: Number(l.qty) || 0, unitMinor: Math.round(Number(l.unit) * 100), taxBps: Math.round(Number(l.tax || 0) * 100) })) }); setEdit(null); }, t("saved"));
  return <Drawer title={(inv.number ?? t("draft")) + " · " + t("ik_" + inv.kind)} onClose={onClose} width={860}
    footer={<>
      {draft && !edit && <button className="btn" onClick={startEdit}><Icon n="pen" />{t("edit")}</button>}
      {edit && <><button className="btn" onClick={() => setEdit(null)}>{t("cancel")}</button><button className="btn pri" onClick={saveEdit}>{t("save")}</button></>}
      <span className="grow" />
      {!edit && <button className="btn" onClick={() => printInvoice(inv)}><Icon n="print" />{t("print")} / PDF</button>}
      {!edit && draft && <button className="btn pri" onClick={async () => { if (await confirmBox(t("issue_invoice"), t("issue_invoice_hint"), t("issue_invoice"))) run(() => post(`/api/finance/invoices/${id}/issue`), t("saved")); }}><Icon n="ok" />{t("issue_invoice")}</button>}
      {!edit && inv.status === "issued" && inv.kind !== "credit_note" && <button className="btn" onClick={() => run(() => post(`/api/finance/invoices/${id}/paid`), t("saved"))}>{t("mark_paid")}</button>}
      {!edit && (draft || (can("finance.manage") && ["issued", "paid"].includes(inv.status))) && <button className="btn ghost danger" onClick={async () => { const reason = draft ? "draft" : prompt(t("void_reason")); if (!reason) return; run(async () => { const x = await post(`/api/finance/invoices/${id}/void`, { reason }); if (x.deleted) onClose(); }, t("saved")); }}>{draft ? t("delete") : t("void")}</button>}
    </>}>
    {inv.voidReason && <div className="alert err" style={{ marginBottom: 10 }}><Icon n="ban" /><span>{t("void")}: {inv.voidReason}</span></div>}
    {edit ? <div className="col" style={{ gap: 10 }}>
      <div className="grid g2" style={{ gap: 8 }}>
        <label className="f">{t("buyer")}<input className="inp" value={edit.buyer.name ?? ""} onChange={(e) => setEdit({ ...edit, buyer: { ...edit.buyer, name: e.target.value } })} /></label>
        <label className="f">{t("tax_id")}<input className="inp" value={edit.buyer.taxId ?? ""} onChange={(e) => setEdit({ ...edit, buyer: { ...edit.buyer, taxId: e.target.value } })} /></label>
        <label className="f" style={{ gridColumn: "1/-1" }}>{t("address")}<input className="inp" value={edit.buyer.address ?? ""} onChange={(e) => setEdit({ ...edit, buyer: { ...edit.buyer, address: e.target.value } })} /></label>
        <label className="f">{t("email")}<input className="inp" value={edit.buyer.email ?? ""} onChange={(e) => setEdit({ ...edit, buyer: { ...edit.buyer, email: e.target.value } })} /></label>
        <label className="f">{t("language")}<select className="inp" value={edit.lang} onChange={(e) => setEdit({ ...edit, lang: e.target.value })}>{Object.keys(DOC).map((k) => <option key={k} value={k}>{k.toUpperCase()}</option>)}</select></label>
      </div>
      <table className="tbl"><thead><tr><th>{t("description")}</th><th style={{ width: 70 }}>{t("qty")}</th><th style={{ width: 110 }}>{t("unit_price")}</th><th style={{ width: 70 }}>KDV %</th><th /></tr></thead><tbody>
        {edit.lines.map((l: any, i: number) => { const set = (p: any) => setEdit({ ...edit, lines: edit.lines.map((x: any, j: number) => (j === i ? { ...x, ...p } : x)) }); return <tr key={i}>
          <td><input className="inp sm" value={l.desc} onChange={(e) => set({ desc: e.target.value })} /></td><td><input className="inp sm num" value={l.qty} onChange={(e) => set({ qty: e.target.value })} /></td>
          <td><input className="inp sm num" value={l.unit} onChange={(e) => set({ unit: e.target.value.replace(",", ".") })} /></td><td><input className="inp sm num" value={l.tax} onChange={(e) => set({ tax: e.target.value })} /></td>
          <td><button className="btn xs ghost icon danger" onClick={() => setEdit({ ...edit, lines: edit.lines.filter((_: any, j: number) => j !== i) })}><Icon n="x" /></button></td></tr>; })}
      </tbody></table>
      <button className="btn sm" style={{ alignSelf: "flex-start" }} onClick={() => setEdit({ ...edit, lines: [...edit.lines, { desc: "", qty: 1, unit: 0, tax: edit.lines[0]?.tax ?? 0 }] })}><Icon n="plus" />{t("add")}</button>
      <label className="f">{t("notes")}<textarea className="inp" value={edit.notes} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} /></label>
    </div> : <div id="inv-print"><InvoiceDoc inv={inv} /></div>}
  </Drawer>;
}

/** Deal ekranındaki faturalar bölümü */
export function DealInvoices({ dealId, payments }: { dealId: string; payments: any[] }) {
  const { t, money } = useT(); const can = useCan();
  const { data } = useQuery({ queryKey: ["deal-invoices", dealId], queryFn: () => get<any[]>(`/api/finance/invoices?dealId=${dealId}`), enabled: can("finance.view") || can("payment.record") });
  const [open, setOpen] = useState<string | null>(null);
  if (!can("finance.view") && !can("payment.record")) return null;
  const create = async (b: any) => { try { const inv = await post("/api/finance/invoices", { dealId, ...b }); setOpen(inv.id); } catch (e) { toastErr(e); } };
  const receiptFor = new Set((data ?? []).filter((i) => i.kind === "receipt").map((i) => i.paymentId));
  return <>
    <div className="row" style={{ marginTop: 16 }}><h3 className="grow" style={{ margin: 0 }}>{t("invoices")}</h3>
      <button className="btn xs" onClick={() => create({ kind: "proforma" })}><Icon n="plus" />{t("ik_proforma")}</button>
      <button className="btn xs" onClick={() => create({ kind: "invoice" })}><Icon n="plus" />{t("ik_invoice")}</button></div>
    {data?.length ? <table className="tbl"><tbody>{data.map((i) => <tr key={i.id} className="click" onClick={() => setOpen(i.id)}><td><b>{i.number ?? t("draft")}</b></td><td className="small">{t("ik_" + i.kind)}</td><td className="r num">{money(Number(i.totalMinor) / 100, i.currency)}</td><td><span className="bdg">{t("is_" + i.status)}</span></td></tr>)}</tbody></table> : <div className="empty small">{t("no_records")}</div>}
    {payments.filter((p) => p.kind === "payment" && !receiptFor.has(p.id)).length > 0 && <div className="row wrap tiny muted" style={{ gap: 6, marginTop: 6 }}>{t("receipt_for")}:
      {payments.filter((p) => p.kind === "payment" && !receiptFor.has(p.id)).map((p) => <button key={p.id} className="btn xs ghost" onClick={() => create({ kind: "receipt", paymentId: p.id })}>{money(Number(p.amountMinor) / 100, p.currency)}</button>)}</div>}
    {open && <InvoiceDrawer id={open} onClose={() => setOpen(null)} />}
  </>;
}
