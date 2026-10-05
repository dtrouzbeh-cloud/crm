// Deal ekranı: plan revizyonları — oluştur (ekle/kaldır), hastaya gönder, klinikte imzayla onayla
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useT } from "../lib/i18n.tsx";
import { get, post } from "../lib/api.ts";
import { Drawer, Modal, Spinner, toast, toastErr, confirmBox } from "./ui.tsx";
import { Icon } from "./Icon.tsx";
import { useCan } from "../lib/auth.ts";
import { useCatalog } from "../lib/catalog.ts";
import { unitPrice, qtyOf, tn } from "@dentaflow/core/engine";
import { vcol } from "@dentaflow/core/chart";
import { SignaturePad } from "./SignaturePad.tsx";

const AST: Record<string, string> = { draft: "", sent: "info", approved: "ok", rejected: "err", canceled: "" };

export function AmendmentsPanel({ deal, visits, phone }: { deal: any; visits: any[]; phone?: string | null }) {
  const { t, money, date } = useT(); const can = useCan(); const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["amendments", deal.id], queryFn: () => get<any[]>(`/api/deals/${deal.id}/amendments`) });
  const [create, setCreate] = useState(false); const [sign, setSign] = useState<any | null>(null); const [share, setShare] = useState<any | null>(null);
  const r = () => { qc.invalidateQueries({ queryKey: ["amendments", deal.id] }); qc.invalidateQueries({ queryKey: ["deal", deal.id] }); qc.invalidateQueries({ queryKey: ["deals"] }); };
  const write = can("deal.write") || can("case.write");
  const M = (v: number) => money(Number(v) / 100, deal.currency);
  return <div style={{ marginTop: 18 }}>
    <div className="row"><h3 className="grow" style={{ margin: 0 }}>{t("plan_amendments")}</h3>{write && deal.status !== "lost" && <button className="btn sm" onClick={() => setCreate(true)}><Icon n="plus" />{t("new_amendment")}</button>}</div>
    <p className="tiny muted" style={{ margin: "4px 0 8px" }}>{t("amendments_hint")}</p>
    {!data ? <Spinner /> : !data.length ? <div className="empty small">{t("no_records")}</div> : data.map((a) => <div key={a.id} className="card pad" style={{ marginBottom: 8, padding: 12 }}>
      <div className="row wrap" style={{ gap: 8 }}><b>#{a.number}</b><span className={"bdg " + AST[a.status]}>{t("as_" + a.status)}</span><span className="grow small muted">{a.reason}</span>
        <b className="num" style={{ color: Number(a.deltaMinor) >= 0 ? undefined : "var(--ok)" }}>{Number(a.deltaMinor) >= 0 ? "+" : ""}{M(a.deltaMinor)}</b></div>
      <div className="col" style={{ gap: 2, marginTop: 6 }}>{a.lines.map((l: any, i: number) => <div key={i} className="row small" style={{ gap: 6 }}>
        <span className="dot" style={{ background: vcol(l.v) }} /><span style={{ color: l.kind === "remove" ? "var(--err)" : "var(--ok)", fontWeight: 700, width: 12 }}>{l.kind === "remove" ? "−" : "+"}</span>
        <span className="grow" style={{ textDecoration: l.kind === "remove" ? "line-through" : undefined }}>{l.name}{l.teeth?.length ? ` (${l.teeth.join(", ")})` : ""}</span><span className="muted">× {l.qty}</span><span className="num">{M(l.totalMinor)}</span></div>)}</div>
      <div className="row wrap tiny muted" style={{ gap: 8, marginTop: 6 }}><span>{a.createdByName} · {date(a.createdAt)}</span>
        {a.response && <span>{a.response.channel === "in_clinic" ? "✍️ " + t("signed_in_clinic") : "🔗"} {a.response.name}{a.response.message ? ` — “${a.response.message}”` : ""}</span>}<span className="grow" />
        {write && ["draft", "sent"].includes(a.status) && <>
          <button className="btn xs" onClick={async () => { try { setShare(await post(`/api/amendments/${a.id}/send`)); r(); } catch (e) { toastErr(e); } }}><Icon n="send" />{a.status === "sent" ? t("resend") : t("send_to_patient")}</button>
          <button className="btn xs pri" onClick={() => setSign(a)}>✍️ {t("approve_in_clinic")}</button>
          <button className="btn xs ghost danger" onClick={async () => { if (await confirmBox(t("cancel"), "#" + a.number, t("cancel"), true)) { await post(`/api/amendments/${a.id}/cancel`); r(); } }}>{t("cancel")}</button></>}
      </div>
    </div>)}
    {create && <AmendmentBuilder deal={deal} visits={visits} onClose={() => setCreate(false)} onDone={() => { setCreate(false); r(); }} />}
    {share && <Modal onClose={() => setShare(null)} width={520}><div className="hd"><h2 className="grow">{t("send_to_patient")}</h2></div><div className="bd col" style={{ gap: 10 }}>
      <input className="inp" readOnly value={share.url} onFocus={(e) => e.target.select()} />
      <div className="row wrap" style={{ gap: 8 }}><button className="btn" onClick={() => { navigator.clipboard.writeText(share.url); toast(t("copied")); }}><Icon n="copy" />{t("copy")}</button>
        {(share.phone || phone) && <a className="btn" style={{ color: "#16A34A" }} target="_blank" rel="noopener" href={`https://wa.me/${String(share.phone || phone).replace(/\D/g, "")}?text=${encodeURIComponent(share.shareText)}`}><Icon n="wa" />WhatsApp</a>}
        <span className="grow" /><button className="btn pri" onClick={() => setShare(null)}>{t("done")}</button></div></div></Modal>}
    {sign && <SignModal a={sign} onClose={() => setSign(null)} onDone={() => { setSign(null); r(); toast(t("saved")); }} />}
  </div>;
}

function SignModal({ a, onClose, onDone }: { a: any; onClose: () => void; onDone: () => void }) {
  const { t, money } = useT(); const [name, setName] = useState(""); const [sig, setSig] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  return <Modal onClose={onClose} width={560}><div className="hd"><h2 className="grow">✍️ {t("approve_in_clinic")} · #{a.number}</h2></div><div className="bd col" style={{ gap: 10 }}>
    <div className="alert info"><Icon n="info" /><span>{t("sign_in_clinic_hint")} <b>{Number(a.deltaMinor) >= 0 ? "+" : ""}{money(Number(a.deltaMinor) / 100, a.currency)}</b></span></div>
    <label className="f">{t("patient_name")}<input className="inp" value={name} onChange={(e) => setName(e.target.value)} /></label>
    <SignaturePad onChange={setSig} label={t("signature")} clear={t("clear")} />
    <div className="row" style={{ justifyContent: "flex-end", gap: 8 }}><button className="btn" onClick={onClose}>{t("cancel")}</button>
      <button className="btn pri" disabled={!sig || name.trim().length < 2 || busy} onClick={async () => { setBusy(true); try { await post(`/api/amendments/${a.id}/approve-in-clinic`, { name, signature: sig }); onDone(); } catch (e) { toastErr(e); } finally { setBusy(false); } }}>{t("approve")}</button></div>
  </div></Modal>;
}

type Row = { kind: "add" | "remove"; v: number; tx?: string; teeth?: string; qty?: number; ref?: string; manual?: boolean; name?: string; price?: string };
function AmendmentBuilder({ deal, visits, onClose, onDone }: { deal: any; visits: any[]; onClose: () => void; onDone: () => void }) {
  const { t, lang, money } = useT(); const { cat } = useCatalog(); const can = useCan();
  const [reason, setReason] = useState(""); const [rows, setRows] = useState<Row[]>([]); const [busy, setBusy] = useState(false);
  const nV = Math.max(1, visits.length);
  const accepted = (deal.acceptedOption?.calc?.visits ?? []).flatMap((v: any) => v.lines.map((l: any, i: number) => ({ ref: `${v.v}:${i}`, v: v.v, label: `V${v.v} · ${l.nm}${l.teeth?.length ? ` (${l.teeth.join(", ")})` : ""} × ${l.qty}`, unit: l.unit, qty: l.qty })));
  const teethOf = (s?: string) => (s ?? "").split(/[\s,;]+/).map(Number).filter((n) => n >= 11 && n <= 48);
  const preview = useMemo(() => rows.map((r) => {
    if (!cat) return 0;
    if (r.kind === "remove") { const a = accepted.find((x: any) => x.ref === r.ref); return a ? -Math.round(a.unit * 100) * Math.min(r.qty ?? a.qty, a.qty) : 0; }
    if (r.manual) return Math.round(Number(r.price || 0) * 100) * (r.qty ?? 1);
    if (!r.tx) return 0; const it = { id: "p", v: r.v, tx: r.tx, teeth: teethOf(r.teeth), qty: r.qty } as any;
    return Math.round(unitPrice(cat, it, deal.currency) * 100) * qtyOf(cat, it);
  }), [rows, cat]);
  const delta = preview.reduce((a, b) => a + b, 0);
  const set = (i: number, p: Partial<Row>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...p } : r)));
  const submit = async () => {
    setBusy(true);
    try {
      await post(`/api/deals/${deal.id}/amendments`, { reason, lines: rows.map((r) => r.kind === "remove" ? { kind: "remove", v: Number(r.ref?.split(":")[0]), ref: r.ref, qty: r.qty }
        : r.manual ? { kind: "add", v: r.v, manual: true, name: r.name, price: Number(r.price || 0), qty: r.qty ?? 1, teeth: teethOf(r.teeth) } : { kind: "add", v: r.v, tx: r.tx, teeth: teethOf(r.teeth), qty: r.qty }) });
      onDone();
    } catch (e) { toastErr(e); } finally { setBusy(false); }
  };
  const txs = (cat?.treatments ?? []).filter((x: any) => x.active);
  return <Drawer title={t("new_amendment")} onClose={onClose} width={820}
    footer={<><span className="grow small">{t("price_change")}: <b className="num" style={{ fontSize: 16 }}>{delta >= 0 ? "+" : ""}{money(delta / 100, deal.currency)}</b> · {t("new_total")}: <b className="num">{money((Number(deal.valueMinor) + delta) / 100, deal.currency)}</b></span>
      <button className="btn" onClick={onClose}>{t("cancel")}</button><button className="btn pri" disabled={busy || !rows.length || reason.trim().length < 2} onClick={submit}>{t("save")}</button></>}>
    {!cat ? <Spinner /> : <div className="col" style={{ gap: 10 }}>
      <label className="f">{t("amendment_reason")}<textarea className="inp" value={reason} placeholder={t("amendment_reason_ph")} onChange={(e) => setReason(e.target.value)} /></label>
      {rows.map((r, i) => <div key={i} className="card pad row wrap" style={{ gap: 6, padding: 10, borderInlineStart: `3px solid ${r.kind === "remove" ? "var(--err)" : "var(--ok)"}` }}>
        <b style={{ width: 14, color: r.kind === "remove" ? "var(--err)" : "var(--ok)" }}>{r.kind === "remove" ? "−" : "+"}</b>
        {r.kind === "remove" ? <select className="inp sm grow" value={r.ref ?? ""} onChange={(e) => set(i, { ref: e.target.value, qty: accepted.find((x: any) => x.ref === e.target.value)?.qty })}><option value="">—</option>{accepted.map((a: any) => <option key={a.ref} value={a.ref}>{a.label}</option>)}</select> : <>
          <select className="inp sm" style={{ width: 70 }} value={r.v} onChange={(e) => set(i, { v: +e.target.value })}>{Array.from({ length: nV + 1 }, (_, k) => <option key={k} value={k + 1}>V{k + 1}</option>)}</select>
          {r.manual ? <><input className="inp sm grow" placeholder={t("item_name")} value={r.name ?? ""} onChange={(e) => set(i, { name: e.target.value })} /><input className="inp sm num" style={{ width: 90 }} placeholder={t("unit_price")} value={r.price ?? ""} onChange={(e) => set(i, { price: e.target.value.replace(",", ".") })} /></>
            : <select className="inp sm grow" value={r.tx ?? ""} onChange={(e) => set(i, { tx: e.target.value })}><option value="">{t("choose_treatment")}</option>{txs.map((x: any) => <option key={x.id} value={x.id}>{tn(x.n, lang)}</option>)}</select>}
          <input className="inp sm" style={{ width: 120 }} placeholder={t("teeth_ph")} value={r.teeth ?? ""} onChange={(e) => set(i, { teeth: e.target.value })} /></>}
        <input className="inp sm num" style={{ width: 56 }} type="number" min={1} value={r.qty ?? ""} placeholder={t("qty")} onChange={(e) => set(i, { qty: e.target.value ? +e.target.value : undefined })} />
        <span className="num small" style={{ width: 90, textAlign: "end" }}>{money(preview[i]! / 100, deal.currency)}</span>
        <button className="btn xs ghost icon danger" onClick={() => setRows(rows.filter((_, j) => j !== i))}><Icon n="x" /></button>
      </div>)}
      <div className="row wrap" style={{ gap: 6 }}>
        <button className="btn sm" onClick={() => setRows([...rows, { kind: "add", v: nV }])}><Icon n="plus" />{t("add_treatment")}</button>
        {accepted.length > 0 && <button className="btn sm" onClick={() => setRows([...rows, { kind: "remove", v: 1 }])}>− {t("remove_treatment")}</button>}
        {can("quote.price") && <button className="btn sm ghost" onClick={() => setRows([...rows, { kind: "add", v: nV, manual: true, qty: 1 }])}><Icon n="plus" />{t("manual_item")}</button>}
      </div>
      <p className="tiny muted">{t("amend_price_note")}</p>
    </div>}
  </Drawer>;
}
