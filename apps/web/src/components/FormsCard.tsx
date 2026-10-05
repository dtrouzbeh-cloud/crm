// Lead/hasta sayfasında formlar: gönder (link · WhatsApp · e-posta), durum, imzalı yanıtları görüntüle/yazdır
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useT } from "../lib/i18n.tsx";
import { get, post } from "../lib/api.ts";
import { Modal, toast, toastErr, confirmBox, Spinner } from "./ui.tsx";
import { Icon } from "./Icon.tsx";
import { useCan } from "../lib/auth.ts";

const ST: Record<string, string> = { sent: "", opened: "info", completed: "ok", revoked: "err" };

export function FormsCard({ leadId, email, phone }: { leadId: string; email?: string | null; phone?: string | null }) {
  const { t, rel } = useT(); const can = useCan(); const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["forms", leadId], queryFn: () => get<any[]>(`/api/forms/requests?leadId=${leadId}`) });
  const [send, setSend] = useState(false); const [view, setView] = useState<string | null>(null);
  return <div className="card"><div className="hd"><h2 className="grow">{t("forms")}</h2>{can("lead.write") && <button className="btn sm" onClick={() => setSend(true)}><Icon n="send" />{t("send_form")}</button>}</div>
    <div className="bd col" style={{ gap: 6 }}>
      {!data ? <Spinner /> : !data.length ? <div className="empty small">{t("no_forms")}</div> : data.map((f) => <button key={f.id} className="row" style={{ background: "none", border: 0, padding: "4px 0", cursor: "pointer", textAlign: "start", color: "inherit" }} onClick={() => setView(f.id)}>
        <span>{f.kind === "consent" ? "✍️" : f.kind === "intake" ? "🩺" : "⭐"}</span>
        <span className="grow small"><b>{f.title}</b><div className="tiny faint">{rel(f.completedAt ?? f.sentAt)}{f.nps != null && <> · NPS <b>{f.nps}</b></>}</div></span>
        <span className={"bdg " + (ST[f.status] ?? "")}>{t("fs_" + f.status)}</span></button>)}
    </div>
    {send && <SendForm leadId={leadId} email={email} phone={phone} onClose={() => { setSend(false); qc.invalidateQueries({ queryKey: ["forms", leadId] }); }} />}
    {view && <ViewForm id={view} onClose={() => { setView(null); qc.invalidateQueries({ queryKey: ["forms", leadId] }); }} />}
  </div>;
}

function SendForm({ leadId, email, phone, onClose }: { leadId: string; email?: string | null; phone?: string | null; onClose: () => void }) {
  const { t } = useT();
  const { data: tpl } = useQuery({ queryKey: ["form-templates"], queryFn: () => get<any[]>("/api/forms/templates") });
  const [sel, setSel] = useState<string>(""); const [mail, setMail] = useState(!!email); const [res, setRes] = useState<any>(null); const [busy, setBusy] = useState(false);
  const go = async () => { setBusy(true); try { const r = await post("/api/forms/requests", { templateId: sel, leadId, email: mail }); setRes(r); if (r.emailed) toast(t("sent_ok")); } catch (e) { toastErr(e); } finally { setBusy(false); } };
  const active = (tpl ?? []).filter((f) => f.active);
  return <Modal onClose={onClose} width={520}><div className="hd"><h2 className="grow">{t("send_form")}</h2></div><div className="bd col" style={{ gap: 10 }}>
    {!res ? <>
      {!tpl ? <Spinner /> : <div className="col" style={{ gap: 6 }}>{active.map((f) => <label key={f.id} className={"card pad row" + (sel === f.id ? " on" : "")} style={{ padding: 10, cursor: "pointer", gap: 10, borderColor: sel === f.id ? "var(--brand)" : undefined }}>
        <input type="radio" name="tpl" checked={sel === f.id} onChange={() => setSel(f.id)} />
        <span>{f.kind === "consent" ? "✍️" : f.kind === "intake" ? "🩺" : "⭐"}</span><span className="grow"><b>{f.name}</b><div className="tiny muted">{t("fk_" + f.kind)}</div></span><span className="bdg">{f.lang.toUpperCase()}</span></label>)}</div>}
      <label className="row small" style={{ gap: 6, opacity: email ? 1 : 0.5 }}><input type="checkbox" disabled={!email} checked={mail} onChange={(e) => setMail(e.target.checked)} />{t("email")}{email ? `: ${email}` : ` — ${t("no_email")}`}</label>
      <div className="row" style={{ justifyContent: "flex-end", gap: 8 }}><button className="btn" onClick={onClose}>{t("cancel")}</button><button className="btn pri" disabled={!sel || busy} onClick={go}><Icon n="send" />{t("create_link")}</button></div>
    </> : <>
      <div className="alert ok"><Icon n="ok" /><span>{t("form_link_ready")}</span></div>
      <input className="inp" readOnly value={res.url} onFocus={(e) => e.target.select()} />
      <div className="row wrap" style={{ gap: 8 }}>
        <button className="btn" onClick={() => { navigator.clipboard.writeText(res.url); toast(t("copied")); }}><Icon n="copy" />{t("copy")}</button>
        {phone && <a className="btn" style={{ color: "#16A34A" }} target="_blank" rel="noopener" href={`https://wa.me/${String(phone).replace(/\D/g, "")}?text=${encodeURIComponent(res.shareText)}`}><Icon n="wa" />WhatsApp</a>}
        <a className="btn ghost" target="_blank" rel="noopener" href={res.url + "?preview=1"}><Icon n="eye" />{t("preview")}</a>
        <span className="grow" /><button className="btn pri" onClick={onClose}>{t("done")}</button>
      </div>
    </>}
  </div></Modal>;
}

function fmtAnswer(t: (k: string) => string, f: any, v: any) {
  if (v === null || v === undefined || v === "") return <span className="faint">—</span>;
  if (f.type === "yesno") return v ? <b style={{ color: f.flag ? "var(--err)" : undefined }}>{t("yes")}</b> : t("no");
  if (f.type === "checkbox") return v ? "☑︎ " + t("yes") : "☐";
  if (f.type === "rating") return "★".repeat(v) + "☆".repeat(5 - v);
  if (Array.isArray(v)) return v.join(", ");
  return String(v);
}

function ViewForm({ id, onClose }: { id: string; onClose: () => void }) {
  const { t, date } = useT(); const can = useCan();
  const { data: r, error } = useQuery({ queryKey: ["form", id], queryFn: () => get(`/api/forms/requests/${id}`) });
  const s = r?.snapshot;
  return <Modal onClose={onClose} width={720}><div className="hd"><h2 className="grow">{s?.title ?? "…"}</h2>
    {r?.status === "completed" && <button className="btn sm" onClick={() => printForm()}><Icon n="print" />{t("print")}</button>}</div>
    <div className="bd">{error ? <div className="alert err">{(error as Error).message}</div> : !r ? <Spinner /> : <div id="printable-form">
      <div className="row wrap small muted" style={{ gap: 12, marginBottom: 10 }}><span>{r.patientName}</span><span>{t("fs_" + r.status)}</span><span>{t("sent")}: {date(r.sentAt)}{r.sentByName ? " · " + r.sentByName : ""}</span>{r.completedAt && <span>{t("fs_completed")}: {date(r.completedAt, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</span>}</div>
      {r.status !== "completed" ? <div className="col" style={{ gap: 10 }}>
        <div className="alert info"><Icon n="clock" /><span>{t("form_waiting")}</span></div>
        {r.url && <div className="row" style={{ gap: 8 }}><input className="inp" readOnly value={r.url} onFocus={(e) => e.target.select()} /><button className="btn" onClick={() => { navigator.clipboard.writeText(r.url); toast(t("copied")); }}><Icon n="copy" /></button></div>}
        {can("lead.write") && r.status !== "revoked" && <button className="btn danger" style={{ alignSelf: "flex-start" }} onClick={async () => { if (await confirmBox(t("revoke"), s.title, t("revoke"), true)) { try { await post(`/api/forms/requests/${id}/revoke`); onClose(); } catch (e) { toastErr(e); } } }}><Icon n="ban" />{t("revoke")}</button>}
      </div> : <>
        {s.body && <div className="small" style={{ whiteSpace: "pre-wrap", background: "var(--subtle)", padding: 12, borderRadius: 8, marginBottom: 12, maxHeight: 260, overflow: "auto" }}>{s.body.replace(/\*\*/g, "")}</div>}
        <table className="tbl"><tbody>{s.fields.map((f: any) => f.type === "heading" ? <tr key={f.key}><th colSpan={2} style={{ paddingTop: 14 }}>{f.label}</th></tr>
          : <tr key={f.key}><td className="small" style={{ width: "60%" }}>{f.label}</td><td className="small">{fmtAnswer(t, f, r.answers?.[f.key] ?? r.answers?.[f.key.replace(/_([a-z0-9])/g, (_m: string, ch: string) => ch.toUpperCase())])}</td></tr>)}</tbody></table>
        {r.signatureUrl && <div style={{ marginTop: 14 }}><div className="tiny muted">{t("signature")}: <b>{r.signedName}</b></div><img src={r.signatureUrl} alt="signature" style={{ maxWidth: 320, border: "1px solid var(--line)", borderRadius: 8, background: "#fff" }} /></div>}
        <div className="tiny faint" style={{ marginTop: 12, wordBreak: "break-all" }}>IP {r.ip} · {r.userAgent?.slice(0, 90)}<br />SHA-256 {r.docHash}</div>
      </>}
    </div>}</div></Modal>;
}

function printForm() {
  const el = document.getElementById("printable-form"); if (!el) return;
  const w = window.open("", "_blank", "width=800,height=900"); if (!w) return;
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><base href="${location.origin}/"><title>Form</title><style>body{font:13px/1.5 system-ui,sans-serif;padding:28px;color:#111}table{width:100%;border-collapse:collapse}td,th{border-bottom:1px solid #ddd;padding:6px;text-align:start;vertical-align:top}.row{display:flex;gap:12px;flex-wrap:wrap}.tiny{font-size:11px;color:#666}img{max-width:320px}</style></head><body>${el.innerHTML}</body></html>`);
  w.document.close(); setTimeout(() => w.print(), 300);
}
