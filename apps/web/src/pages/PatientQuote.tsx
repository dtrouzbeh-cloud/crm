import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { get, post } from "../lib/api.ts";
import { Modal, Spinner, toastErr } from "../components/ui.tsx";
import { Icon } from "../components/Icon.tsx";
import { catalogFromSnapshot } from "../lib/catalog.ts";
import { translate, fmtMoney, LANG_NAMES } from "@dentaflow/core/i18n";
import { OptionBlock } from "./case/QuoteDoc.tsx";
import { snapshotToDoc, printDoc } from "./case/StepReview.tsx";
import { QuoteDoc } from "./case/QuoteDoc.tsx";

export default function PatientQuote() {
  const { token } = useParams<{ token: string }>(); const qc = useQueryClient();
  const preview = new URLSearchParams(location.search).has("preview");
  const { data: q, error } = useQuery({ queryKey: ["pq", token], queryFn: () => get(`/api/public/q/${token}`), retry: false });
  const [lang, setLang] = useState<string | null>(null); const [opt, setOpt] = useState<number | null>(null);
  const [dlg, setDlg] = useState<null | "accept" | "changes" | "decline">(null);
  const [now, setNow] = useState(Date.now());
  useEffect(() => { if (q && !preview) post(`/api/public/q/${token}/view`).catch(() => {}); }, [q?.id]);
  useEffect(() => { const h = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(h); }, []);
  // canlı takip: sekme görünürken 15 sn'de bir hangi seçenek/bölüme bakıldığı bildirilir (personel önizlemesi sunucuda sayılmaz)
  const selRef = useRef(0); selRef.current = opt ?? Math.max(0, q?.snapshot?.options?.findIndex((o: any) => o.rec) ?? 0); const dlgRef = useRef<string | null>(null); dlgRef.current = dlg;
  useEffect(() => { if (!q || preview) return; let last = Date.now();
    const tick = () => { if (document.hidden) { last = Date.now(); return; } const secs = Math.min(20, Math.max(1, Math.round((Date.now() - last) / 1000))); last = Date.now();
      let section: string | undefined = dlgRef.current === "accept" ? "accept" : undefined;
      if (!section) { const mid = innerHeight / 2; let bd = Infinity, bk: string | undefined; document.querySelectorAll<HTMLElement>("[data-sec]").forEach((el) => { const r = el.getBoundingClientRect(); const d = r.top <= mid && r.bottom >= mid ? 0 : Math.min(Math.abs(r.top - mid), Math.abs(r.bottom - mid)); if (d < bd) { bd = d; bk = el.dataset.sec; } }); section = bk; }
      post(`/api/public/q/${token}/ping`, { option: selRef.current, section, seconds: secs }).catch(() => {}); };
    const h = setInterval(tick, 15_000); const vis = () => { if (!document.hidden) last = Date.now(); }; document.addEventListener("visibilitychange", vis);
    return () => { clearInterval(h); document.removeEventListener("visibilitychange", vis); }; }, [q?.id]);
  const s = q?.snapshot; const L = lang ?? s?.lang ?? "en"; const T = (k: string, p?: any) => translate(L, k, p);
  useEffect(() => { if (s) { document.documentElement.lang = L; document.documentElement.dir = L === "ar" ? "rtl" : "ltr"; document.title = `${s.clinic.name} — ${T("pp_title")}`; } }, [s, L]);
  const cat = useMemo(() => (s ? catalogFromSnapshot(s) : null), [s]);
  if (error) return <div className="pp"><div className="hero"><div className="in"><h1 style={{ color: "#fff" }}>{translate(navigator.language.slice(0, 2), "link_invalid")}</h1></div></div></div>;
  if (!q || !cat) return <Spinner />;
  const doc = snapshotToDoc(q); doc.lang = L;
  const sel = opt ?? Math.max(0, s.options.findIndex((o: any) => o.rec));
  const op = s.options[sel];
  const decided = ["accepted", "declined", "changes"].includes(q.status), closed = decided || ["expired", "revoked", "superseded"].includes(q.status) || q.superseded;
  const left = Math.max(0, Math.floor((new Date(q.validUntil).getTime() - now) / 1000));
  const M = (v: number) => fmtMoney(v, s.currency, L);
  const respond = async (body: any) => { try { await post(`/api/public/q/${token}/respond`, body); setDlg(null); qc.invalidateQueries({ queryKey: ["pq", token] }); } catch (e) { toastErr(e); } };
  return <div className="pp" style={{ ["--c1" as never]: s.clinic.color || "#0E7C86" }} dir={L === "ar" ? "rtl" : "ltr"} lang={L}>
    {preview && <div className="prevbar"><Icon n="eye" size={15} /> {T("pv_bar")}</div>}
    <div className="hero"><div className="in">
      <div className="row between wrap" style={{ gap: 12 }}><div className="row" style={{ gap: 10, fontWeight: 750, fontSize: 17 }}><span style={{ width: 34, height: 34, borderRadius: 9, background: "rgba(255,255,255,.18)", display: "grid", placeItems: "center" }}><Icon n="tooth" size={20} /></span>{s.clinic.name}</div>
        <select className="inp sm" style={{ width: "auto", background: "rgba(255,255,255,.15)", color: "#fff", borderColor: "rgba(255,255,255,.3)" }} value={L} onChange={(e) => setLang(e.target.value)}>{Object.entries(LANG_NAMES).map(([k, v]) => <option key={k} value={k} style={{ color: "#000" }}>{v}</option>)}</select></div>
      <div style={{ marginTop: 26, opacity: 0.85, fontSize: 13, letterSpacing: ".06em", textTransform: "uppercase" }}>{T("pp_title")}</div>
      <h1 style={{ fontSize: 30, marginTop: 4, color: "#fff" }}>{s.patient.name}</h1>
      {!closed && <div style={{ marginTop: 16 }}><div style={{ fontSize: 12, opacity: 0.85, marginBottom: 6 }}>{T("offer_valid")}</div><div className="cd">
        {[[Math.floor(left / 86400), "cd_d"], [Math.floor((left % 86400) / 3600), "cd_h"], [Math.floor((left % 3600) / 60), "cd_m"], [left % 60, "cd_s"]].map(([v, k]) => <div key={k as string}><b className="num">{String(v).padStart(2, "0")}</b><span style={{ fontSize: 10, opacity: 0.85 }}>{T(k as string)}</span></div>)}</div></div>}
    </div></div>
    <div className="body">
      {q.status === "accepted" && <div className="pc" style={{ border: "2px solid #10B981" }}><h2 style={{ color: "#0F8A5F" }}>✓ {T("pp_accepted")}</h2><p style={{ margin: "6px 0 0" }}>{T("pp_accepted_d", { opt: s.options[q.acceptedOption ?? 0]?.name })}</p>
        {q.payment?.length > 0 && <div data-sec="payment"><DepositBox token={token} q={q} T={T} M={M} /></div>}</div>}
      {q.status === "changes" && <div className="pc" style={{ border: "2px solid #F59E0B" }}><h2>{T("pp_changes")}</h2><p style={{ margin: "6px 0 0" }}>{T("pp_changes_d")}</p></div>}
      {q.status === "declined" && <div className="pc"><h2>{T("pp_declined")}</h2></div>}
      {(q.superseded || q.status === "superseded") && <div className="pc" style={{ border: "2px solid #F59E0B" }}><h2>{T("pp_superseded")}</h2></div>}
      {(q.status === "expired" || q.status === "revoked") && <div className="pc"><h2>{T("pp_expired")}</h2></div>}
      <div className="pc"><p style={{ margin: 0 }}>{T("intro", { name: s.patient.name.split(" ")[0], clinic: s.clinic.name })}</p>{s.note && <div style={{ borderInlineStart: "3px solid var(--c1)", background: "#F5F8F9", padding: "8px 12px", borderRadius: 8, marginTop: 10 }}>{s.note}</div>}</div>
      {s.options.length > 1 && <div className="ptabs">{s.options.map((o: any, i: number) => <button key={i} className={i === sel ? "on" : ""} onClick={() => setOpt(i)}>{o.rec && <><span style={{ fontSize: 11, fontWeight: 700, color: "var(--c1)" }}>★ {T("recommended")}</span><br /></>}<b>{o.name}</b>{!s.pricesHidden && <div className="p">{M(o.calc.total)}</div>}</button>)}</div>}
      <div className="pc doc fluid" data-sec="plan" style={{ boxShadow: "none", padding: 20, width: "auto" }}><OptionBlock d={doc} op={op} cat={cat} lang={L} /></div>
      <div className="pc" data-sec="price"><h2 style={{ fontSize: 16, marginBottom: 10 }}>{T("whats_included")}</h2><div className="doc" style={{ all: "unset", display: "block" }}><div className="incl" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 18px", fontSize: 13 }}>
        {["inc_consult", "inc_xray", "inc_coord", "inc_aftercare"].map((k) => <div key={k}>{T(k)}</div>)}{op.calc.pkg.filter((p: any) => p.total <= 0).map((p: any) => <div key={p.k}>{p.nm}</div>)}</div></div></div>
      <div className="pc" data-sec="clinic"><h2 style={{ fontSize: 16, marginBottom: 10 }}>{T("faq")}</h2>{["faq1", "faq2", "faq3"].map((k) => <details key={k} style={{ borderTop: "1px solid #E3E8EC", padding: "10px 0" }}><summary style={{ cursor: "pointer", fontWeight: 600 }}>{T(k + "q")}</summary><p style={{ margin: "8px 0 0", color: "#55636D" }}>{T(k + "a")}</p></details>)}</div>
      <div className="pc row wrap between"><div><b>{s.clinic.name}</b><div className="small" style={{ color: "#55636D" }}>{[s.clinic.phone, s.clinic.email].filter(Boolean).join(" · ")}</div></div><button className="btn" onClick={printDoc}><Icon n="download" />{T("download_pdf")}</button>{(L === "de" || s.patient.country === "DE" || s.patient.country === "AT" || s.patient.country === "CH") && <a className="btn" href={`/q/${token}/hkp?o=${sel}`} target="_blank" rel="noopener">📄 Heil- und Kostenplan</a>}</div>
    </div>
    {!closed && <div className="sticky"><button className="btn" onClick={() => setDlg("decline")}>{T("decline")}</button><button className="btn" onClick={() => setDlg("changes")}>{T("req_changes")}</button>
      <button className="btn pri" style={{ background: "var(--c1)", borderColor: "var(--c1)", minWidth: 200, height: 42 }} onClick={() => setDlg("accept")}>{T("accept_plan")}{s.options.length > 1 ? ` · ${op.name}` : ""}</button></div>}
    <div id="printable" style={{ position: "absolute", left: -99999, top: 0, width: 794 }}><QuoteDoc d={doc} cat={cat} print /></div>
    {dlg === "accept" && <AcceptModal T={T} op={op} s={s} M={M} onClose={() => setDlg(null)} onOk={() => respond({ action: "accept", option: sel, agree: true })} preview={preview} />}
    {dlg === "changes" && <TextModal T={T} title={T("req_changes")} ph={T("changes_ph")} onClose={() => setDlg(null)} onOk={(m: string) => respond({ action: "changes", option: sel, message: m })} />}
    {dlg === "decline" && <DeclineModal T={T} onClose={() => setDlg(null)} onOk={(r: string) => respond({ action: "decline", option: sel, reason: r })} />}
  </div>;
}

function AcceptModal({ T, op, s, M, onClose, onOk, preview }: any) {
  const [agree, setAgree] = useState(false);
  return <Modal onClose={onClose}><div className="hd"><div><h2>{T("accept_t")}</h2><p className="muted small" style={{ margin: "4px 0 0" }}>{op.name}{!s.pricesHidden && <> · <b>{M(op.calc.total)}</b></>}</p></div></div>
    <div className="bd col"><p className="small" style={{ margin: 0 }}>{T("accept_d", { dep: M(op.calc.deposit) })}</p><label className="row small" style={{ gap: 8 }}><input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} /> {T("agree")}</label>
      {preview && <div className="alert warn"><span>{T("pv_bar")}</span></div>}</div>
    <div className="ft"><button className="btn" onClick={onClose}>{T("cancel")}</button><button className="btn pri" disabled={!agree || preview} style={{ background: s.clinic.color, borderColor: s.clinic.color }} onClick={onOk}>{T("accept_plan")}</button></div></Modal>;
}
function TextModal({ T, title, ph, onClose, onOk }: any) {
  const [m, setM] = useState("");
  return <Modal onClose={onClose}><div className="hd"><h2>{title}</h2></div><div className="bd"><textarea className="inp" value={m} placeholder={ph} onChange={(e) => setM(e.target.value)} /></div>
    <div className="ft"><button className="btn" onClick={onClose}>{T("cancel")}</button><button className="btn pri" onClick={() => onOk(m)}>{T("send")}</button></div></Modal>;
}
function DeclineModal({ T, onClose, onOk }: any) {
  const [r, setR] = useState("price");
  return <Modal onClose={onClose}><div className="hd"><h2>{T("decline")}</h2></div><div className="bd"><select className="inp" value={r} onChange={(e) => setR(e.target.value)}>{["price", "other_clinic", "timing", "health", "other"].map((x) => <option key={x} value={x}>{T("dr_" + x)}</option>)}</select></div>
    <div className="ft"><button className="btn" onClick={onClose}>{T("cancel")}</button><button className="btn danger" onClick={() => onOk(r)}>{T("decline")}</button></div></Modal>;
}
function DepositBox({ token, q, T, M }: any) {
  const op = q.snapshot.options[q.acceptedOption ?? 0];
  const [busy, setBusy] = useState(false); const [bank, setBank] = useState<any>(null);
  const pay = async (provider: string) => { setBusy(true); try { const r = await post(`/api/public/q/${token}/checkout`, { provider }); if (r.checkoutUrl) location.href = r.checkoutUrl; else setBank(r); } catch (e) { toastErr(e); } finally { setBusy(false); } };
  const dep = q.deposit;
  if (dep?.paid) return <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid #E3E8EC" }}><h3 style={{ margin: 0, color: "#1E7D4F" }}>✓ {T("deposit_received")}</h3><div className="small" style={{ color: "#55636D", marginTop: 4 }}>{T("paid_so_far")}: {M(dep.paidMinor / 100)}</div></div>;
  const shown = bank ?? (dep?.pending?.provider === "bank_transfer" ? dep.pending : null);
  return <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid #E3E8EC" }}>
    <h3 style={{ margin: "0 0 8px" }}>{T("pay_deposit")} · {M(op.calc.deposit)}</h3>
    {dep?.pending && !bank && <div className="small" style={{ marginBottom: 8, color: "#8A5A00" }}>⏳ {T("transfer_pending")}</div>}
    <div className="row wrap" style={{ gap: 8 }}>{q.payment.map((p: any) => <button key={p.provider} className="btn" disabled={busy} onClick={() => pay(p.provider)}>{T("pm_" + p.provider)}</button>)}</div>
    {shown && <div className="note" style={{ marginTop: 10 }}><div><b>{T("bank_details")}</b></div>{shown.bank?.accountName && <div>{shown.bank.accountName}</div>}{shown.bank?.iban && <div className="code">IBAN: {shown.bank.iban}</div>}{shown.bank?.swift && <div>SWIFT: {shown.bank.swift}</div>}<div>{T("reference")}: <b className="code">{shown.referenceCode}</b></div></div>}
  </div>;
}
