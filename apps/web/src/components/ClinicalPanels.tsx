// Klinik paneller: deal "Klinik" sekmesi (lab, implant, garanti), lead şikâyet kartı, ortak etiketler
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useT } from "../lib/i18n.tsx";
import { get, post, patch } from "../lib/api.ts";
import { Modal, Spinner, toast, toastErr } from "./ui.tsx";
import { Icon } from "./Icon.tsx";
import { useCan } from "../lib/auth.ts";

export const LAB_ST = ["draft", "sent", "in_production", "try_in", "ready", "delivered", "remake", "canceled"];
export const LAB_COL: Record<string, string> = { draft: "", sent: "info", in_production: "info", try_in: "warn", ready: "ok", delivered: "ok", remake: "err", canceled: "" };
export const CMP_CAT = ["pain", "broken", "loose", "aesthetic", "bite", "implant_failure", "infection", "service", "other"];
export const CMP_COL: Record<string, string> = { open: "err", reviewing: "warn", in_progress: "info", resolved: "ok", rejected: "" };

export function LabOrderRow({ o, onChange }: { o: any; onChange: () => void }) {
  const { t, date } = useT(); const can = useCan();
  const set = async (b: any) => { try { await patch(`/api/lab-orders/${o.id}`, b); onChange(); } catch (e) { toastErr(e); } };
  return <div className="card pad" style={{ padding: 10, borderColor: o.overdue ? "var(--err)" : o.atRisk ? "var(--warn)" : undefined }}>
    <div className="row wrap" style={{ gap: 8 }}><b>Lab #{o.number}</b><span className="small muted">{o.labName ?? "—"}{o.visitNo ? ` · V${o.visitNo}` : ""}</span>
      {o.overdue && <span className="bdg err">{t("overdue")}</span>}{o.atRisk && !o.overdue && <span className="bdg warn" title={t("lab_risk_hint")}>⚠ {t("lab_at_risk")}</span>}<span className="grow" />
      <select className="inp sm" style={{ width: "auto" }} disabled={!can("case.write") && !can("deal.write")} value={o.status} onChange={(e) => set({ status: e.target.value })}>{LAB_ST.map((s) => <option key={s} value={s}>{t("ls_" + s)}</option>)}</select></div>
    <div className="tiny muted" style={{ marginTop: 4 }}>{(o.items as any[]).map((i) => `${i.desc}${i.teeth?.length ? ` (${i.teeth.join(",")})` : ""}`).join(" · ") || "—"}</div>
    <div className="row wrap tiny" style={{ gap: 10, marginTop: 6 }}>
      <label className="row" style={{ gap: 4 }}>{t("due")}<input className="inp sm" type="date" style={{ width: 140 }} defaultValue={o.dueAt?.slice(0, 10) ?? ""} onBlur={(e) => e.target.value && set({ dueAt: new Date(e.target.value + "T12:00:00").toISOString() })} /></label>
      <label className="row" style={{ gap: 4 }}>{t("shade")}<input className="inp sm" style={{ width: 70 }} defaultValue={o.shade ?? ""} onBlur={(e) => e.target.value !== (o.shade ?? "") && set({ shade: e.target.value || null })} /></label>
      <label className="row" style={{ gap: 4 }}>{t("cost")}<input className="inp sm num" style={{ width: 80 }} defaultValue={o.costMinor != null ? o.costMinor / 100 : ""} onBlur={(e) => set({ costMinor: e.target.value ? Math.round(+e.target.value * 100) : null, currency: o.currency ?? "EUR" })} /></label>
      {o.visitArrivalAt && <span className="muted">{t("visit")}: {date(o.visitArrivalAt)}</span>}
    </div>
  </div>;
}

export function DealClinicalTab({ deal }: { deal: any }) {
  const { t } = useT(); const qc = useQueryClient(); const can = useCan();
  const { data: orders } = useQuery({ queryKey: ["lab-orders", deal.id], queryFn: () => get<any[]>(`/api/lab-orders?dealId=${deal.id}`) });
  const { data: labs } = useQuery({ queryKey: ["labs"], queryFn: () => get<any[]>("/api/labs") });
  const { data: imps } = useQuery({ queryKey: ["implants", deal.id], queryFn: () => get<any[]>(`/api/implants?dealId=${deal.id}`) });
  const { data: wars } = useQuery({ queryKey: ["warranties", deal.id], queryFn: () => get<any[]>(`/api/warranties?dealId=${deal.id}`) });
  const [labSel, setLabSel] = useState(""); const [imp, setImp] = useState<any | null>(null);
  const r = (k: string) => qc.invalidateQueries({ queryKey: [k, deal.id] });
  const write = can("case.write") || can("deal.write");
  const activeW = wars?.find((w) => w.status === "active");
  return <div className="col" style={{ gap: 16 }}>
    <section><div className="row"><h3 className="grow" style={{ margin: 0 }}>🧪 {t("lab_orders")}</h3>
      {write && <><select className="inp sm" style={{ width: 160 }} value={labSel} onChange={(e) => setLabSel(e.target.value)}><option value="">{t("choose_lab")}</option>{(labs ?? []).filter((l) => l.active).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select>
        <button className="btn sm" onClick={async () => { try { await post("/api/lab-orders", { dealId: deal.id, labId: labSel || null, currency: deal.currency }); r("lab-orders"); toast(t("saved")); } catch (e) { toastErr(e); } }}><Icon n="plus" />{t("new_lab_order")}</button></>}</div>
      <div className="col" style={{ gap: 6, marginTop: 8 }}>{!orders ? <Spinner /> : !orders.length ? <div className="empty small">{t("no_records")}</div> : orders.map((o) => <LabOrderRow key={o.id} o={o} onChange={() => r("lab-orders")} />)}</div></section>
    <section><div className="row"><h3 className="grow" style={{ margin: 0 }}>🔩 {t("implant_records")}</h3>{write && <button className="btn sm" onClick={() => setImp({ tooth: "", brand: "", system: "", diameter: "", length: "", lot: "", serial: "" })}><Icon n="plus" />{t("add")}</button>}</div>
      {!imps ? <Spinner /> : !imps.length ? <div className="empty small">{t("no_records")}</div> : <table className="tbl" style={{ marginTop: 6 }}><thead><tr><th>{t("tooth")}</th><th>{t("brand")}</th><th>Ø × L</th><th>LOT</th><th>SN</th></tr></thead><tbody>
        {imps.map((i) => <tr key={i.id}><td><b>{i.tooth}</b></td><td className="small">{i.brand} {i.system}</td><td className="small num">{i.diameter ?? "—"} × {i.length ?? "—"}</td><td className="small code">{i.lot ?? "—"}</td><td className="small code">{i.serial ?? "—"}</td></tr>)}</tbody></table>}</section>
    <section><div className="row"><h3 className="grow" style={{ margin: 0 }}>🛡 {t("warranty")}</h3>
      {write && <button className="btn sm" onClick={async () => { try { await post("/api/warranties", { dealId: deal.id }); r("warranties"); toast(t("saved")); } catch (e) { toastErr(e); } }}><Icon n="spark" />{activeW ? t("reissue_warranty") : t("issue_warranty")}</button>}</div>
      {activeW ? <div className="row wrap" style={{ gap: 8, marginTop: 6 }}><span className="small">#{activeW.number} · {activeW.items.length} {t("items")}</span>
        <button className="btn xs" onClick={() => { navigator.clipboard.writeText(activeW.url); toast(t("copied")); }}><Icon n="copy" />{t("copy")}</button>
        {deal.phone && <a className="btn xs" style={{ color: "#16A34A" }} target="_blank" rel="noopener" href={`https://wa.me/${String(deal.phone).replace(/\D/g, "")}?text=${encodeURIComponent(activeW.url)}`}><Icon n="wa" />WhatsApp</a>}
        <a className="btn xs ghost" target="_blank" rel="noopener" href={activeW.url}><Icon n="eye" />{t("preview")}</a></div> : <div className="empty small">{t("no_warranty_yet")}</div>}</section>
    {imp && <Modal onClose={() => setImp(null)} width={520}><div className="hd"><h2 className="grow">🔩 {t("implant_records")}</h2></div><div className="bd grid g2" style={{ gap: 8 }}>
      {[["tooth", t("tooth")], ["brand", t("brand")], ["system", t("system")], ["diameter", "Ø (mm)"], ["length", "L (mm)"], ["lot", "LOT"], ["serial", "SN"]].map(([k, l]) => <label key={k} className="f">{l}<input className="inp sm" value={imp[k!]} onChange={(e) => setImp({ ...imp, [k!]: e.target.value })} /></label>)}
      <div style={{ gridColumn: "1/-1" }} className="row"><span className="grow" /><button className="btn" onClick={() => setImp(null)}>{t("cancel")}</button>
        <button className="btn pri" disabled={!imp.tooth || !imp.brand} onClick={async () => { try { await post("/api/implants", { leadId: deal.leadId, dealId: deal.id, tooth: +imp.tooth, brand: imp.brand, system: imp.system || null, diameter: imp.diameter ? +imp.diameter : null, length: imp.length ? +imp.length : null, lot: imp.lot || null, serial: imp.serial || null }); setImp(null); r("implants"); toast(t("saved")); } catch (e) { toastErr(e); } }}>{t("save")}</button></div></div></Modal>}
  </div>;
}

export function ComplaintsCard({ leadId }: { leadId: string }) {
  const { t, rel } = useT(); const qc = useQueryClient(); const can = useCan();
  const { data } = useQuery({ queryKey: ["complaints", leadId], queryFn: () => get<any[]>(`/api/complaints?leadId=${leadId}`) });
  const [f, setF] = useState<any | null>(null);
  if (!data) return null;
  if (!data.length && !can("lead.write")) return null;
  const r = () => qc.invalidateQueries({ queryKey: ["complaints", leadId] });
  return <div className="card"><div className="hd"><h2 className="grow">⚠️ {t("complaints")}</h2>{can("lead.write") && <button className="btn sm" onClick={() => setF({ category: "pain", teeth: "", description: "" })}><Icon n="plus" /></button>}</div><div className="bd col" style={{ gap: 6 }}>
    {!data.length ? <div className="empty small">{t("none")}</div> : data.map((x) => <div key={x.id} className="col" style={{ gap: 2 }}>
      <div className="row small" style={{ gap: 6 }}><b>#{x.number}</b><span className="grow">{t("cc_" + x.category)}{x.teeth?.length ? ` (${x.teeth.join(",")})` : ""}</span>
        {x.warrantyCovered != null && <span className={"bdg " + (x.warrantyCovered ? "ok" : "")}>{x.warrantyCovered ? "🛡 " + t("in_warranty") : t("out_of_warranty")}</span>}
        <select className="inp sm" style={{ width: "auto" }} disabled={!can("lead.write")} value={x.status} onChange={async (e) => { await patch(`/api/complaints/${x.id}`, { status: e.target.value }); r(); }}>{["open", "reviewing", "in_progress", "resolved", "rejected"].map((s) => <option key={s} value={s}>{t("cs2_" + s)}</option>)}</select></div>
      <div className="tiny muted">{x.description} · {rel(x.openedAt)}</div></div>)}
    {f && <Modal onClose={() => setF(null)} width={480}><div className="hd"><h2 className="grow">⚠️ {t("new_complaint")}</h2></div><div className="bd col" style={{ gap: 8 }}>
      <select className="inp" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>{CMP_CAT.map((k) => <option key={k} value={k}>{t("cc_" + k)}</option>)}</select>
      <input className="inp" placeholder={t("teeth_ph")} value={f.teeth} onChange={(e) => setF({ ...f, teeth: e.target.value })} />
      <textarea className="inp" rows={4} placeholder={t("complaint_desc_ph")} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
      <div className="row" style={{ justifyContent: "flex-end", gap: 8 }}><button className="btn" onClick={() => setF(null)}>{t("cancel")}</button>
        <button className="btn pri" disabled={f.description.trim().length < 3} onClick={async () => { try { await post("/api/complaints", { leadId, category: f.category, teeth: String(f.teeth).split(/[\s,;]+/).map(Number).filter((n) => n >= 11 && n <= 48), description: f.description }); setF(null); r(); toast(t("saved")); } catch (e) { toastErr(e); } }}>{t("save")}</button></div></div></Modal>}
  </div></div>;
}
