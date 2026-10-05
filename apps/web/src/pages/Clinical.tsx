// Klinik kalite: lab siparişleri, şikâyetler, implant kayıtları (lot araması), laboratuvarlar
import { useState } from "react";
import { Link, useLocation, useParams } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useT } from "../lib/i18n.tsx";
import { get, post, patch } from "../lib/api.ts";
import { PageHead, Spinner, Empty, toast, toastErr, Switch } from "../components/ui.tsx";
import { Icon } from "../components/Icon.tsx";
import { useCan } from "../lib/auth.ts";
import { LabOrderRow, CMP_COL, LAB_ST } from "../components/ClinicalPanels.tsx";

export default function Clinical() {
  const { t } = useT(); const [, nav] = useLocation(); const { tab = "lab" } = useParams<{ tab?: string }>();
  return <><PageHead title={t("nav_clinical")} sub={t("clinical_sub")} />
    <div className="tabs" style={{ marginBottom: 14 }}>{[["lab", "lab_orders", "tooth"], ["complaints", "complaints", "alert"], ["implants", "implant_records", "list"], ["labs", "labs", "building"]].map(([k, l, ic]) => <button key={k} className={tab === k ? "on" : ""} onClick={() => nav(`/clinical/${k}`)}><Icon n={ic!} size={15} />{t(l!)}</button>)}</div>
    {tab === "lab" && <LabBoard />}{tab === "complaints" && <Complaints />}{tab === "implants" && <Implants />}{tab === "labs" && <Labs />}</>;
}

function LabBoard() {
  const { t } = useT(); const qc = useQueryClient(); const [open, setOpen] = useState(true);
  const { data } = useQuery({ queryKey: ["lab-orders", "all", open], queryFn: () => get<any[]>(`/api/lab-orders${open ? "?open=true" : ""}`) });
  return <div className="col" style={{ gap: 10 }}>
    <div className="row" style={{ gap: 10 }}><Switch checked={open} onChange={setOpen} label={t("only_open")} />{data && <span className="small muted">{data.filter((o) => o.overdue).length} {t("overdue").toLowerCase()} · {data.filter((o) => o.atRisk && !o.overdue).length} {t("lab_at_risk").toLowerCase()}</span>}</div>
    {!data ? <Spinner /> : !data.length ? <Empty icon="tooth" text={t("no_records")} /> : <div className="kanban">{LAB_ST.filter((s) => !open || !["delivered", "canceled"].includes(s)).map((s) => { const os = data.filter((o) => o.status === s);
      return <div key={s} className="kcol"><div className="kh">{t("ls_" + s)}<span className="bdg" style={{ marginInlineStart: "auto" }}>{os.length}</span></div><div className="kb">{os.map((o) => <div key={o.id}><Link href={`/deals/${o.dealId}`} className="tiny">{o.fullName} · #{o.dealNumber}</Link><LabOrderRow o={o} onChange={() => qc.invalidateQueries({ queryKey: ["lab-orders"] })} /></div>)}</div></div>; })}</div>}
  </div>;
}

function Complaints() {
  const { t, rel } = useT(); const [st, setSt] = useState("open_all");
  const { data } = useQuery({ queryKey: ["complaints", "all", st], queryFn: () => get<any[]>(`/api/complaints?status=${st}`) });
  return <div className="card"><div className="hd"><div className="seg">{["open_all", "resolved", "rejected"].map((s) => <button key={s} className={st === s ? "on" : ""} onClick={() => setSt(s)}>{t("cs2_" + s)}</button>)}</div></div>
    {!data ? <Spinner /> : !data.length ? <Empty icon="ok" text={t("no_complaints")} /> : <div className="twrap"><table className="tbl"><tbody>{data.map((x) => <tr key={x.id}>
      <td><b>#{x.number}</b></td><td><Link href={`/leads/${x.leadId}`}>{x.fullName}</Link><div className="tiny muted">{x.description.slice(0, 120)}</div></td><td className="small">{t("cc_" + x.category)}{x.teeth?.length ? ` (${x.teeth.join(",")})` : ""}</td>
      <td>{x.warrantyCovered != null && <span className={"bdg " + (x.warrantyCovered ? "ok" : "")}>{x.warrantyCovered ? "🛡" : "—"}</span>}</td><td><span className={"bdg " + CMP_COL[x.status]}>{t("cs2_" + x.status)}</span></td><td className="small muted">{x.ownerName ?? "—"}</td><td className="tiny faint">{rel(x.openedAt)}</td></tr>)}</tbody></table></div>}</div>;
}

function Implants() {
  const { t, date } = useT(); const [lot, setLot] = useState(""); const [brand, setBrand] = useState("");
  const { data } = useQuery({ queryKey: ["implants", "search", lot, brand], queryFn: () => get<any[]>(`/api/implants?${new URLSearchParams({ ...(lot ? { lot } : {}), ...(brand ? { brand } : {}) })}`) });
  return <div className="card"><div className="hd" style={{ gap: 8 }}><input className="inp sm" style={{ width: 160 }} placeholder="LOT" value={lot} onChange={(e) => setLot(e.target.value)} /><input className="inp sm" style={{ width: 160 }} placeholder={t("brand")} value={brand} onChange={(e) => setBrand(e.target.value)} />
    <span className="grow tiny muted">{t("implant_recall_hint")}</span></div>
    {!data ? <Spinner /> : !data.length ? <Empty icon="list" text={t("no_records")} /> : <div className="twrap"><table className="tbl"><thead><tr><th>{t("date")}</th><th>{t("patient")}</th><th>{t("tooth")}</th><th>{t("brand")}</th><th>Ø × L</th><th>LOT</th><th>SN</th></tr></thead><tbody>
      {data.map((i) => <tr key={i.id} style={{ opacity: i.removedAt ? 0.5 : 1 }}><td className="small">{date(i.placedAt)}</td><td><Link href={`/leads/${i.leadId}`}>{i.fullName}</Link></td><td><b>{i.tooth}</b></td><td className="small">{i.brand} {i.system}</td><td className="small num">{i.diameter ?? "—"} × {i.length ?? "—"}</td><td className="code small">{i.lot ?? "—"}</td><td className="code small">{i.serial ?? "—"}</td></tr>)}</tbody></table></div>}</div>;
}

function Labs() {
  const { t } = useT(); const qc = useQueryClient(); const can = useCan(); const [n, setN] = useState({ name: "", avgDays: 5 });
  const { data } = useQuery({ queryKey: ["labs"], queryFn: () => get<any[]>("/api/labs") });
  const save = async (id: string | null, b: any) => { try { if (id) await patch(`/api/labs/${id}`, b); else await post("/api/labs", b); qc.invalidateQueries({ queryKey: ["labs"] }); toast(t("saved")); } catch (e) { toastErr(e); } };
  return <div className="card">{!data ? <Spinner /> : <div className="twrap"><table className="tbl"><thead><tr><th>{t("name")}</th><th>{t("phone")}</th><th>{t("email")}</th><th>{t("avg_days")}</th><th>{t("open_orders")}</th><th>{t("active")}</th></tr></thead><tbody>
    {data.map((l) => <tr key={l.id}><td><input className="inp sm" disabled={!can("settings.manage")} defaultValue={l.name} onBlur={(e) => e.target.value !== l.name && save(l.id, { name: e.target.value })} /></td>
      <td><input className="inp sm" disabled={!can("settings.manage")} defaultValue={l.phone ?? ""} onBlur={(e) => save(l.id, { phone: e.target.value || null })} /></td><td><input className="inp sm" disabled={!can("settings.manage")} defaultValue={l.email ?? ""} onBlur={(e) => save(l.id, { email: e.target.value || "" })} /></td>
      <td><input className="inp sm num" style={{ width: 60 }} type="number" disabled={!can("settings.manage")} defaultValue={l.avgDays} onBlur={(e) => save(l.id, { avgDays: +e.target.value })} /></td><td className="num">{l.openOrders}</td><td><Switch checked={l.active} onChange={(v) => can("settings.manage") && save(l.id, { active: v })} /></td></tr>)}</tbody></table></div>}
    {can("settings.manage") && <div className="bd row" style={{ gap: 8, borderTop: "1px solid var(--line)" }}><input className="inp sm" style={{ maxWidth: 220 }} placeholder={t("lab_name")} value={n.name} onChange={(e) => setN({ ...n, name: e.target.value })} />
      <input className="inp sm num" style={{ width: 70 }} type="number" value={n.avgDays} onChange={(e) => setN({ ...n, avgDays: +e.target.value })} /><span className="tiny muted">{t("avg_days")}</span><button className="btn sm pri" disabled={!n.name} onClick={() => { save(null, n); setN({ name: "", avgDays: 5 }); }}><Icon n="plus" />{t("add")}</button></div>}</div>;
}
